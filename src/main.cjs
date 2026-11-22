const { app, BrowserWindow, WebContentsView, ipcMain, nativeTheme, dialog, shell, Tray, Menu, nativeImage, net, safeStorage, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { defaults, validate, isSoundCloud, isAuthURL, externalURL } = require('./settings.cjs');
const { themeCSS } = require('./soundcloud-theme.cjs');
const Visual = require('./visual-system.js');
const atmosphereSource = fs.readFileSync(path.join(__dirname, 'atmosphere.js'), 'utf8');
const remotePlayerSource = fs.readFileSync(path.join(__dirname, 'remote-player.js'), 'utf8');
const webPlayerSource=fs.readFileSync(path.join(__dirname,'web-player.js'),'utf8');
const {sanitize:playerSnapshot}=require('./player-state.cjs');
const {createLyricsService}=require('./lyrics.cjs');
const {createServiceHub}=require('./services/index.cjs');
const {createLibrary}=require('./library/index.cjs');
const {createServiceWindows,allowed:providerURL,providers}=require('./service-windows.cjs');

app.setName('HexSound');
protocol.registerSchemesAsPrivileged([{scheme:'hexmedia',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
const {createExperience}=require('./features/runtime.cjs');
let experience;const nativePages=['library','services','transfer','wave','queue','smart','local','duplicates','listening','jobs'];
const layoutTest=process.argv.includes('--layout-test');
const visualTest=process.argv.includes('--effects-test');
const memoryTest=process.argv.includes('--memory-test');
const experienceTest=process.argv.includes('--experience-test');
const libraryTest=process.argv.includes('--library-test');
const smoke = process.argv.includes('--smoke-test')||layoutTest||visualTest||libraryTest||experienceTest||memoryTest;
if (smoke) app.setPath('userData', path.join(app.getPath('temp'), 'hexsound-smoke-' + process.pid));
const settingsFile = path.join(app.getPath('userData'), 'settings.json');
const lyricsService=createLyricsService(path.join(app.getPath('userData'),'lyrics'),{fetcher:(url,init)=>net.fetch(url,init)});
let playback=playerSnapshot(null),polling=false,pollTimer;
let services,library,serviceWindows,nativePage='library',playbackProvider='soundcloud',nextPoll=0,libraryOperation;
const platformDefaults={...defaults,...(process.platform==='linux'?{closeToTray:false}:{})};
let settings = { ...platformDefaults };
try { settings = validate(JSON.parse(fs.readFileSync(settingsFile, 'utf8'))); } catch {}
let win, view, tray, quitting = false, settingsOpen = false, sidebarOpen=false, introOpen=!smoke, cssKey, currentURL = 'https://soundcloud.com/discover';
let visualRevision = 0;
const shellURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
const authWindows = new Set();
const dark = () => settings.theme === 'system' ? nativeTheme.shouldUseDarkColors : settings.theme === 'dark';
const send = (channel, value) => { if (win && !win.isDestroyed()) win.webContents.send(channel, value); };

function save() {
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile + '.tmp', JSON.stringify(settings, null, 2));
  fs.renameSync(settingsFile + '.tmp', settingsFile);
}
function setAutoLaunch(enabled) {
  if(smoke)return;
  if(process.platform==='linux'){
    const base=process.env.XDG_CONFIG_HOME&&path.isAbsolute(process.env.XDG_CONFIG_HOME)?process.env.XDG_CONFIG_HOME:path.join(app.getPath('home'),'.config');
    const file=path.join(base,'autostart','hexsound.desktop');
    if(enabled){const executable=process.env.APPIMAGE||process.execPath;fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'[Desktop Entry]\nType=Application\nName=HexSound\nExec="'+executable.replace(/["\\]/g,'\\$&')+'"\nTerminal=false\nX-GNOME-Autostart-enabled=true\n');}
    else try{fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
  }else app.setLoginItemSettings({ openAtLogin: enabled, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: [] });
}
function layout() {
  if (!win || !view) return;
  const [w, h] = win.getContentSize();
  if(w>=640&&sidebarOpen){sidebarOpen=false;send('sidebar',false);}
  const left = w<640||settings.sidebarCollapsed?0:w < 1050 ? 76 : 236;
  view.setBounds({ x:left,y:100,width:Math.max(1,w-left),height:Math.max(1,h-100) });
  view.setVisible(!settingsOpen&&!sidebarOpen&&!introOpen);
  if(isSoundCloud(view.webContents.getURL()))view.webContents.executeJavaScript(`window.HexAtmosphere?.setActive(${!settingsOpen && !sidebarOpen && win.isVisible() && !win.isMinimized()})`).catch(()=>{});
}
async function applyTheme() {
  const revision=++visualRevision;
  nativeTheme.themeSource = settings.theme;
  const snapshot={...settings,resolvedDark:dark()};
  if (view && !view.webContents.isDestroyed()) {
    view.webContents.setZoomFactor(settings.zoom / 100);
    if (isSoundCloud(view.webContents.getURL())) {
      const previous=cssKey;
      const next=await view.webContents.insertCSS(themeCSS(snapshot, snapshot.resolvedDark)).catch(() => undefined);
      if (revision!==visualRevision) { if(next) await view.webContents.removeInsertedCSS(next).catch(()=>{}); return; }
      cssKey=next;
      if(previous) await view.webContents.removeInsertedCSS(previous).catch(()=>{});
      const config=Visual.atmosphereConfig(snapshot,Visual.resolve(snapshot,snapshot.resolvedDark));
      await view.webContents.executeJavaScript(webPlayerSource+';'+atmosphereSource + `;window.HexAtmosphere.mount(${JSON.stringify(config)});window.HexAtmosphere.setActive(${!settingsOpen && !sidebarOpen && win.isVisible() && !win.isMinimized()});`).catch(()=>{});
    }
  }
  send('settings', { ...settings, resolvedDark: dark() });
}
function status(value) { send('status', value); }
async function navigate(route) {
  await experience?.stopNative();
  nativePage='music';playbackProvider='soundcloud';nextPoll=0;
  sidebarOpen=false;send('sidebar',false);
  const routes = { discover: '/discover', feed: '/feed', library: '/you/library', likes: '/you/likes', playlists: '/you/sets', history: '/you/history', upload: '/upload', account: '/you' };
  if(route==='account'&&!playback.profile.url&&isSoundCloud(view.webContents.getURL())){const found=await view.webContents.executeJavaScript(remotePlayerSource+';window.HexRemotePlayer.profileURL()',true).catch(()=>'');if(isSoundCloud(found))playback.profile.url=found;}
  const url = route==='account'&&playback.profile.url?playback.profile.url:routes[route] ? 'https://soundcloud.com' + routes[route] : route;
  if (!isSoundCloud(url)) return;
  settingsOpen = false;
  layout();
  send('page', 'music');
  // SoundCloud's link router keeps its player alive across internal navigation.
  if (isSoundCloud(view.webContents.getURL()) && new URL(view.webContents.getURL()).origin === new URL(url).origin && !view.webContents.isLoadingMainFrame()) {
    const target = new URL(url);
    const relative = target.pathname + target.search + target.hash;
    const routed = await view.webContents.executeJavaScript(`(() => { if (!document.querySelector('.header')) return false; const a = document.createElement('a'); a.setAttribute('href', ${JSON.stringify(relative)}); a.className = 'sc-link'; document.body.appendChild(a); a.click(); a.remove(); return true; })()`).catch(() => false);
    if (routed) return;
  }
  currentURL = url;
  view.webContents.loadURL(url).catch(() => {});
}
function configureRemote(contents, auth = false) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isAuthURL(url) || url === 'about:blank') return { action: 'allow', overrideBrowserWindowOptions: {
      parent: win, width: 540, height: 740, autoHideMenuBar: true,
      title: 'Вход в SoundCloud', backgroundColor: '#ffffff',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: 'persist:soundcloud' }
    } };
    if (externalURL(url)) confirmExternal(url);
    return { action: 'deny' };
  });
  contents.on('did-create-window', child => {
    authWindows.add(child);
    configureRemote(child.webContents, true);
    child.on('closed', () => authWindows.delete(child));
    child.setMenuBarVisibility(false);
  });
  const guard = (event, url) => {
    if ((auth ? isAuthURL(url) : isSoundCloud(url))) return;
    event.preventDefault();
    if (externalURL(url)) confirmExternal(url);
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.on('will-attach-webview', event => event.preventDefault());
}
async function confirmExternal(url) {
  const { response } = await dialog.showMessageBox(win, { type: 'question', title: 'Открыть ссылку', message: 'Открыть ссылку в браузере?', detail: url.slice(0, 400), buttons: ['Отмена', 'Открыть'], defaultId: 0, cancelId: 0 });
  if (response === 1 && externalURL(url)) await shell.openExternal(url);
}
function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({width:16,height:16}));
  tray.setToolTip('HexSound');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть HexSound', click: () => { win.show(); win.focus(); } },
    { label: 'Настройки', click: () => { win.show(); settingsOpen = true; layout(); send('page', 'settings'); } },
    { type: 'separator' }, { label: 'Выйти', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => { win.show(); win.focus(); });
}
async function pollPlayback(){
  if(polling||!view||view.webContents.isDestroyed()||Date.now()<nextPoll)return;
  nextPoll=Date.now()+(nativePage==='player'?200:650);
  polling=true;
  try{const raw=playbackProvider==='native'?await experience.snapshot():playbackProvider==='soundcloud'?(isSoundCloud(view.webContents.getURL())?await view.webContents.executeJavaScript(remotePlayerSource+';window.HexRemotePlayer.snapshot()'):null):await serviceWindows.snapshot(playbackProvider);if(!raw)return;const next=playerSnapshot(raw,{trustedMedia:playbackProvider==='native'});if(JSON.stringify(next)!==JSON.stringify(playback)){playback=next;send('playback',playback);}await experience?.tick(playback,lyricsService);}catch{}finally{polling=false;}
}
async function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 960, minWidth: 360, minHeight: 480,
    title: 'HexSound', icon: path.join(__dirname, 'assets', process.platform==='linux'?'icon.png':'icon.ico'), backgroundColor: dark() ? '#18181a' : '#fafafc',
    frame: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling:false }
  });
  services=createServiceHub({directory:path.join(app.getPath('userData'),'services'),safeStorage,fetcher:(url,init)=>net.fetch(url,init),openExternal:url=>shell.openExternal(url),onChange:value=>send('services',value)});
  library=createLibrary(path.join(app.getPath('userData'),'library.json'),{getAdapter:id=>services.getAdapter(id)});
  serviceWindows=createServiceWindows({BrowserWindow,parent:win,onActive:id=>{experience?.stopNative();playbackProvider=id;nextPoll=0;pollPlayback();},onChange:()=>send('service-windows',serviceWindows.status()),onExternal:confirmExternal,isQuitting:()=>quitting});
  experience=createExperience({directory:app.getPath('userData'),services:new Proxy({},{get:(_,key)=>services[key]}),library:new Proxy({},{get:(_,key)=>library[key]}),send,handle,win,BrowserWindow,protocol,dialog,Visual,getSettings:()=>({...settings,resolvedDark:dark()}),getPlayback:()=>playback,openSource,activateNative:async()=>{if(playbackProvider!=='native'&&playbackProvider!=='soundcloud'&&playback.track.playing)await serviceWindows.control(playbackProvider,'toggle');playbackProvider='native';nextPoll=0;view.webContents.executeJavaScript("document.querySelectorAll('audio,video').forEach(el=>el.pause())").catch(()=>{});},openPlayer:()=>{nativePage='player';settingsOpen=true;layout();send('page','player');},control:playerControl});
  Menu.setApplicationMenu(null);
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view = new WebContentsView({ webPreferences: { partition: 'persist:soundcloud', nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling:false } });
  win.contentView.addChildView(view);
  view.setBackgroundColor(dark() ? '#18181a' : '#fafafc');
  configureRemote(view.webContents);
  const ses = view.webContents.session;
  ses.setPermissionRequestHandler((wc, permission, callback) => callback(isSoundCloud(wc.getURL()) && permission === 'notifications' && settings.notifications));
  ses.setPermissionCheckHandler((wc, permission, origin) => isSoundCloud(origin) && permission === 'notifications' && settings.notifications);
  ses.on('will-download', (event, item) => {
    item.setSaveDialogOptions({ title: 'Сохранить файл из SoundCloud', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
    item.once('done', (_, result) => status({ download: result }));
  });
  view.webContents.on('did-start-loading', () => status({ loading: true }));
  view.webContents.on('did-stop-loading', () => {status({ loading: false });pollPlayback();});
  view.webContents.on('dom-ready', () => { cssKey = undefined; applyTheme(); });
  const onNavigation = (_, url) => { currentURL = url; send('location', { url, back: view.webContents.navigationHistory.canGoBack(), forward: view.webContents.navigationHistory.canGoForward() }); };
  view.webContents.on('did-navigate', onNavigation);
  view.webContents.on('did-navigate-in-page', onNavigation);
  view.webContents.on('did-fail-load', (_, code, description, url, mainFrame) => {
    if(mainFrame&&code!==-3&&nativePage==='music'){settingsOpen=true;layout();status({error:description,url});}
  });
  view.webContents.on('render-process-gone', () => { settingsOpen = true; layout(); status({ error: 'Процесс страницы завершён. Обновите SoundCloud.' }); });
  win.on('resize', layout);
  const activity = active => {
    win.webContents.executeJavaScript(`window.HexAtmosphere?.setActive(${active})`).catch(()=>{});
    if(isSoundCloud(view.webContents.getURL()))view.webContents.executeJavaScript(`window.HexAtmosphere?.setActive(${active && !settingsOpen && !sidebarOpen})`).catch(()=>{});
  };
  win.on('focus',()=>activity(true));win.on('show',()=>activity(true));win.on('restore',()=>activity(true));
  win.on('hide',()=>activity(false));win.on('minimize',()=>activity(false));
  for (const contents of [win.webContents, view.webContents]) contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.control && input.code === 'Comma') { event.preventDefault(); settingsOpen = true; layout(); send('page', 'settings'); }
    if (input.control && input.code === 'KeyK') { event.preventDefault(); win.webContents.focus(); send('focus-search'); }
    if (input.control && input.code === 'KeyR') { event.preventDefault(); view.webContents.reload(); }
    if (input.alt && input.code === 'ArrowLeft' && view.webContents.navigationHistory.canGoBack()) { event.preventDefault(); view.webContents.navigationHistory.goBack(); }
  });
  win.on('maximize', () => send('maximized', true));
  win.on('unmaximize', () => send('maximized', false));
  win.on('close', e => { if (!quitting && settings.closeToTray && tray && !smoke) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => {experience?.dispose();services.dispose();libraryOperation?.abort();serviceWindows.close();if (!view.webContents.isDestroyed()) view.webContents.close(); for (const child of authWindows) child.destroy(); });
  await win.loadFile(path.join(__dirname, 'index.html'));
  await applyTheme();
  layout();
  win.show();
  try{createTray();}catch{tray=undefined;}
  if(memoryTest){runMemoryAudit();return;}
  if(experienceTest){runExperienceAudit();return;}
  if(libraryTest){runLibraryAudit();return;}
  if(layoutTest){runLayoutAudit();return;}
  // The native home does not need a second, hidden SoundCloud application.
  // Its persistent session is loaded by navigate() when the user opens it.
  if(smoke)navigate('discover');else{settingsOpen=true;layout();send('page','library');}
  pollTimer=setInterval(pollPlayback,200);pollTimer.unref();
  if(visualTest)runVisualAudit();else if (smoke) runSmoke();
}

function trusted(event) { return event.sender === win?.webContents && event.senderFrame?.url === shellURL; }
function handle(name, fn) { ipcMain.handle(name, async (event, ...args) => { if (!trusted(event)) throw new Error('Untrusted sender'); return fn(...args); }); }
handle('get-settings', () => ({ ...settings, resolvedDark: dark(), version: app.getVersion(), skipIntro:smoke,nativeHome:!smoke }));
handle('intro-complete',animate=>{const first=introOpen;introOpen=false;layout();if(first&&animate&&settings.motion&&isSoundCloud(view.webContents.getURL()))view.webContents.executeJavaScript(`document.documentElement.animate([{opacity:0,translate:'0 5px'},{opacity:1,translate:'0 0'}],{duration:650,easing:'cubic-bezier(.22,1,.36,1)'})`).catch(()=>{});return true;});
handle('get-playback',()=>playback);
handle('native-page',name=>{if(!nativePages.includes(name))throw Error('Неизвестный экран.');nativePage=name;settingsOpen=true;sidebarOpen=false;send('sidebar',false);layout();send('page',name);return true;});
handle('services-status',()=>services.statuses());
handle('services-configure',(id,patch)=>services.configure(id,patch));
handle('services-connect',id=>services.connect(id));
handle('services-cancel',id=>{services.cancelConnect(id);return services.status(id);});
handle('services-token',(id,input)=>services.importToken(id,input));
handle('services-disconnect',id=>services.disconnect(id));
async function openSource(id,source={}){
  if(!Object.hasOwn(providers,id))throw Error('Неизвестный сервис.');
  let url=typeof source.url==='string'?source.url:'';
  if(!url&&source.id)url=(await services.resolvePlayback(id,source.id)).url;
  if(url&&!providerURL(id,url))throw Error('Ссылка не принадлежит выбранному сервису.');
  if(id==='soundcloud'){if(source.login){playbackProvider='soundcloud';return navigate('https://soundcloud.com/signin');}return navigate(url||'discover');}
  return serviceWindows.open(id,{url,login:source.login===true});
}
handle('services-web',(id,options)=>openSource(id,options&&typeof options==='object'?options:{}));
handle('services-browser',id=>{if(!Object.hasOwn(providers,id))throw Error('Неизвестный сервис.');return shell.openExternal(providers[id].home);});
handle('services-help',()=>shell.openExternal('https://github.com/hexokryn/HexSound/blob/main/docs/services.md'));
handle('services-search',(id,query)=>{if(typeof query!=='string'||!query.trim()||query.length>300)throw Error('Введите запрос до 300 символов.');return services.search(id,query.trim());});
handle('library-list',options=>{const value=library.snapshot(options&&typeof options==='object'?options:{});value.tracks=value.tracks.map(experience.decorate);return value;});
handle('library-sync',async id=>{try{const value=await library.sync(id);send('library-updated');return value;}finally{send('library-updated');}});
handle('library-plan',async options=>{if(libraryOperation)throw Error('Дождитесь завершения текущей операции.');const controller=new AbortController();libraryOperation=controller;try{const plan=await library.planTransfer(options,{signal:controller.signal});experience.plans.set(plan.id,plan);return plan;}finally{if(libraryOperation===controller)libraryOperation=null;}});
handle('library-transfer',async options=>{if(libraryOperation)throw Error('Дождитесь завершения текущей операции.');const controller=new AbortController();libraryOperation=controller;try{const plan=experience.plans.get(options?.planId);if(!plan)throw Error('Найдите совпадения снова.');const result=await experience.journal.start(plan,options.choices,opts=>library.executeTransfer(options,opts),{signal:controller.signal,onProgress:value=>send('transfer-progress',value)});experience.plans.delete(plan.id);return result;}finally{if(libraryOperation===controller)libraryOperation=null;}});
handle('transfer-resume',async id=>{if(libraryOperation)throw Error('Дождитесь завершения текущей операции.');const controller=new AbortController();libraryOperation=controller;try{return await experience.journal.resume(id,{signal:controller.signal,onProgress:value=>send('transfer-progress',value)});}finally{libraryOperation=null;}});
handle('library-cancel',()=>{libraryOperation?.abort();library.cancelTransfer();return true;});
handle('library-import',async service=>{
  if(!['local','spotify','soundcloud','youtube','yandex'].includes(service))throw Error('Неизвестный источник импорта.');
  const chosen=await dialog.showOpenDialog(win,{title:'Импорт библиотеки',properties:['openFile'],filters:[{name:'Библиотека',extensions:['json','csv','tsv']}]});
  if(chosen.canceled)return null;const file=chosen.filePaths[0];if(fs.statSync(file).size>10*1024*1024)throw Error('Файл должен быть меньше 10 МБ.');
  const {parseImport}=require('./library/import-file.cjs');
  const document=parseImport(fs.readFileSync(file,'utf8'),{format:path.extname(file).toLowerCase()==='.json'?'json':'csv',service});
  const value=library.importData(document);send('library-updated');return value;
});
handle('library-export',async()=>{const chosen=await dialog.showSaveDialog(win,{title:'Экспорт библиотеки',defaultPath:'HexSound-library.json',filters:[{name:'Библиотека HexSound',extensions:['json']}]});if(chosen.canceled)return false;fs.writeFileSync(chosen.filePath,JSON.stringify(library.exportData(),null,2),{mode:0o600});return true;});
handle('library-save-track',(service,track)=>{if(!Object.hasOwn(providers,service)||!track||typeof track!=='object')throw Error('Некорректный трек.');const value=library.importData({service,tracks:[track],playlists:[]});send('library-updated');return value;});
handle('player-open',()=>{nativePage='player';nextPoll=0;settingsOpen=true;sidebarOpen=false;send('sidebar',false);layout();send('page','player');pollPlayback();return true;});
handle('sidebar-open',open=>{sidebarOpen=!!open&&win.getContentSize()[0]<640;layout();send('sidebar',sidebarOpen);return sidebarOpen;});
async function playerControl(action,value){
  if(!['toggle','previous','next','shuffle','repeat','like','seek','volume'].includes(action))return false;
  if(['seek','volume'].includes(action)&&!Number.isFinite(value))return false;
  const own=await experience.playerControl(action,value);if(own!==null){nextPoll=0;setTimeout(pollPlayback,20);return own;}
  if(playbackProvider!=='soundcloud'){const result=await serviceWindows.control(playbackProvider,action,value);nextPoll=0;setTimeout(pollPlayback,50);return result;}
  if(!isSoundCloud(view.webContents.getURL()))return false;
  const result=await view.webContents.executeJavaScript(remotePlayerSource+`;window.HexRemotePlayer.control(${JSON.stringify(action)},${JSON.stringify(Number.isFinite(value)?value:null)})`,true).catch(()=>false);
  setTimeout(pollPlayback,120);return result;
}
handle('player-control',playerControl);
handle('lyrics',async expected=>{
  const track={...playback.track};const trackKey=[track.url,track.title,track.artist,Math.round(track.duration||0)].join('|');
  if(typeof expected==='string'&&expected!==trackKey)return{status:'stale',trackKey};
  return{...(track.available?await lyricsService.lookup(track,settings.lyricsOnline):{status:'idle',lines:[],plain:'',source:''}),trackKey};
});
handle('import-lyrics',async expected=>{
  if(!playback.track.available)throw new Error('Сначала выберите трек.');
  const track={...playback.track};
  if(typeof expected==='string'&&expected!==[track.url,track.title,track.artist,Math.round(track.duration||0)].join('|'))throw new Error('Трек сменился. Повторите действие.');
  const chosen=await dialog.showOpenDialog(win,{title:'Открыть текст с таймкодами',properties:['openFile'],filters:[{name:'Синхронизированный текст',extensions:['lrc']}]});
  if(chosen.canceled)return null;const file=chosen.filePaths[0];if(fs.statSync(file).size>500000)throw new Error('Файл должен быть меньше 500 КБ.');
  const result=lyricsService.importText(track,fs.readFileSync(file,'utf8'));
  return{...result,trackURL:track.url,trackTitle:track.title};
});
handle('save-settings', async patch => {
  settings = validate({ ...settings, ...patch, customBackground: settings.customBackground });
  save();
  if (patch && Object.hasOwn(patch,'launchAtLogin')) setAutoLaunch(settings.launchAtLogin);
  await applyTheme();
  layout();
  return { ...settings, resolvedDark: dark() };
});
handle('reset-settings', async () => { settings = { ...platformDefaults }; save(); setAutoLaunch(false); await applyTheme(); return { ...settings, resolvedDark: dark() }; });
handle('navigate', navigate);
handle('search', q => { if (typeof q === 'string' && q.trim()) navigate('https://soundcloud.com/search?q=' + encodeURIComponent(q.trim().slice(0, 500))); });
handle('settings-open', open => {nativePage=open?'settings':'music';settingsOpen = !!open;sidebarOpen=false;send('sidebar',false); layout(); return true; });
handle('window', action => {
  if (action === 'minimize') win.minimize();
  if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  if (action === 'close') win.close();
});
handle('history', direction => {if(nativePage!=='music')return false; const h = view.webContents.navigationHistory; if (direction === 'back' && h.canGoBack()) h.goBack(); if (direction === 'forward' && h.canGoForward()) h.goForward(); });
handle('reload', () => {if(nativePages.includes(nativePage)){send('library-updated');send('services',services.statuses());return true;} settingsOpen = false; layout(); send('page','music'); view.webContents.loadURL(currentURL).catch(() => {}); });
handle('open-browser', () => {const url=playbackProvider==='soundcloud'?currentURL:serviceWindows.currentURL(playbackProvider);if(providerURL(playbackProvider,url))return shell.openExternal(url); });
handle('login', async () => {
  settingsOpen = false; layout(); send('page', 'music');
  const clicked = await view.webContents.executeJavaScript(`(() => { const button = document.querySelector('.loginButton, .header__loginButton, .frontHero__loginButton, .frontHero__signin'); if (button) { button.click(); return true; } return false; })()`,true).catch(() => false);
  if (!clicked) navigate('https://soundcloud.com/signin');
});
handle('choose-background', async () => {
  const result = await dialog.showOpenDialog(win, { title: 'Фон HexSound', properties: ['openFile'], filters: [{ name: 'Изображение', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (result.canceled) return null;
  const file = result.filePaths[0];
  if (fs.statSync(file).size > 8_000_000) throw new Error('Выберите изображение размером до 8 МБ.');
  const image = nativeImage.createFromPath(file);
  if (image.isEmpty()) throw new Error('Не удалось прочитать изображение.');
  settings.customBackground = image.resize({ width: Math.min(1920, image.getSize().width) }).toDataURL();
  settings.background = 'image'; save(); await applyTheme(); return { ...settings, resolvedDark: dark() };
});
handle('clear-cache', async () => { await view.webContents.session.clearCache(); return true; });
handle('logout', async () => {
  const { response } = await dialog.showMessageBox(win, { type: 'question', message: 'Выйти из SoundCloud?', detail: 'Сессия SoundCloud будет удалена с этого компьютера.', buttons: ['Отмена', 'Выйти'], cancelId: 0 });
  if (response !== 1) return false;
  for (const child of authWindows) child.destroy();
  await view.webContents.loadURL('about:blank');
  await view.webContents.session.clearStorageData();
  await view.webContents.session.clearCache();
  navigate('discover'); return true;
});
app.on('before-quit', () => { quitting = true;clearInterval(pollTimer);experience?.dispose(); });
app.on('window-all-closed', () => app.quit());
nativeTheme.on('updated', () => { if (win) applyTheme(); });
if (!smoke && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { win.show(); if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
}

async function runExperienceAudit(){
  const out=path.join(app.isPackaged?app.getPath('temp'):path.join(__dirname,'..','artifacts'),'hexsound-experience-0.8');fs.mkdirSync(out,{recursive:true});
  const run=code=>win.webContents.executeJavaScript(code),delay=ms=>new Promise(r=>setTimeout(r,ms));const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  try{
    settingsOpen=true;introOpen=false;layout();await run(`window.hex.saveSettings({theme:'dark',palette:'obsidian',lyricsOnline:false})`);
    const folder=path.join(app.getPath('userData'),'audit-music');fs.mkdirSync(folder,{recursive:true});const rate=22050,seconds=8,samples=rate*seconds,bytes=samples*2,wav=Buffer.alloc(44+bytes);wav.write('RIFF');wav.writeUInt32LE(36+bytes,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(bytes,40);for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*220/rate)*1000),44+i*2);fs.writeFileSync(path.join(folder,'Night drive.wav'),wav);fs.writeFileSync(path.join(folder,'Morning light.wav'),wav);
    await experience.local.scan(folder);library.importData({service:'local',tracks:experience.local.raw().map(t=>({...t,artist:'Hex Sessions'})),playlists:[]},{replace:true});
    const savedStatuses=services.statuses,savedAdapter=services.getAdapter;services.statuses=()=>[{id:'soundcloud',name:'SoundCloud',connected:true,capabilities:{search:true}}];services.getAdapter=()=>({searchTracks:async()=>Array.from({length:9},(_,i)=>({id:'demo-'+i,title:['Glass horizon','After the rain','Soft focus','Blue hour','Second light','Still awake','Into the night','Quiet city','Morning glow'][i],artist:'Hex Sessions',duration:180+i*4,url:'https://soundcloud.com/demo/'+i}))});
    await run(`window.hex.openNative('wave')`);await run(`window.hex.experience('wave-generate')`);await delay(250);if(experience.wave.snapshot().items.length!==3)throw Error('Wave discovery or artist diversity failed');
    await run('window.HexExperienceUI.refresh()');win.setContentSize(1440,900);await delay(150);fs.writeFileSync(path.join(out,'wave.png'),(await win.capturePage()).toPNG());services.statuses=savedStatuses;services.getAdapter=savedAdapter;
    const tracks=library.tracks();await run(`window.hex.experience('queue-add',{tracks:${JSON.stringify(tracks)}})`);const first=experience.queue.snapshot().entries[0];await run(`window.hex.experience('queue-play',{id:${JSON.stringify(first.id)}})`);await delay(700);const sample=await experience.snapshot();if(!sample?.track.playing||sample.track.position<.2)throw Error('Actual native WAV did not play: '+JSON.stringify(sample));
    playback=playerSnapshot(sample,{trustedMedia:true});experience.collection.record(playback,tracks[0]);await delay(300);playback=playerSnapshot(await experience.snapshot(),{trustedMedia:true});experience.collection.record(playback,tracks[0]);if(!experience.collection.history().recent.length)throw Error('History failed');
    await run(`window.hex.playerControl('seek',7.9)`);await delay(500);if(experience.queue.snapshot().cursor!==1)throw Error('Native end did not advance queue');await run(`window.hex.playerControl('previous')`);await run(`window.hex.playerControl('seek',2)`);const sought=await experience.snapshot();if(Math.abs(sought.track.position-2)>.4)throw Error('Native seeking failed');await run(`window.hex.playerControl('toggle')`);if((await experience.snapshot()).track.playing)throw Error('Native pause failed');await run(`window.hex.playerControl('next')`);if(experience.queue.snapshot().cursor!==1)throw Error('Unified queue next failed');
    await run(`window.hex.experience('mini')`);await experience.tick(playback,lyricsService);const mini=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/mini.html'));if(!mini)throw Error('Mini-player did not load');if(!(await mini.webContents.executeJavaScript('typeof window.hex==="undefined" && !!window.mini')))throw Error('Mini-player received privileged API');
    experience.collection.setTags(tracks[0].id,['вечер']);experience.collection.saveSmart({name:'Вечер',rules:{tags:['вечер']}});if(experience.collection.evaluate(tracks,{tags:['вечер']}).length!==1)throw Error('Smart playlist failed');
    const sizes=[[360,640],[640,720],[1024,768],[1440,900],[2560,1440]];const audits=[];
    for(const [width,height] of sizes){win.setContentSize(width,height);await delay(450);for(const page of ['wave','queue','smart','local','duplicates','listening','jobs']){await run(`window.hex.openNative('${page}')`);await delay(70);const result=await run(`(()=>{const e=document.querySelector('#native-${page}');return {visible:!e.hidden,overflow:Math.max(document.documentElement.scrollWidth-innerWidth,e.scrollWidth-e.clientWidth)}})()`);audits.push({page,width,...result});if(!result.visible||result.overflow>2)throw Error('Layout failed: '+JSON.stringify(audits.at(-1)));if(width===360&&page==='wave')fs.writeFileSync(path.join(out,'wave-mobile.png'),(await win.capturePage()).toPNG());}}
    await run(`window.hex.playerControl('toggle')`);if(errors.some(e=>/Content Security|Uncaught|not defined|Failed to load resource/i.test(e)))throw Error('Renderer errors: '+errors.join('\n'));
    fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify({nativeAudio:true,seek:true,queue:true,mini:true,smart:true,wave:true,audits,errors},null,2));console.log('EXPERIENCE_AUDIT_OK '+out);app.exit(0);
  }catch(error){console.error('EXPERIENCE_AUDIT_FAILED',error.stack);app.exit(1);}
}

async function runLibraryAudit(){
  const out=path.join(app.isPackaged?app.getPath('temp'):path.join(__dirname,'..','artifacts'),'hexsound-library-0.7');fs.mkdirSync(out,{recursive:true});
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),run=code=>win.webContents.executeJavaScript(code),writes=[];
  const track=(id,title)=>({id,name:title,type:'track',artists:[{name:'HexSound Demo'}],duration_ms:title==='Night drive'?180000:204000,external_urls:{spotify:'https://open.spotify.com/track/'+id},album:{name:'Demo',images:[]}});
  try{
    services.dispose();services=createServiceHub({directory:path.join(app.getPath('userData'),'audit-services'),safeStorage,onChange:value=>send('services',value),fetcher:async(value,init={})=>{
      const url=new URL(value),method=init.method||'GET';let data={};
      if(method==='GET'&&url.pathname==='/v1/me')data={id:'hexsound-demo',display_name:'Demo'};
      else if(method==='GET'&&url.pathname==='/v1/search')data={tracks:{items:(url.searchParams.get('q').includes('Night')?[track('nightA','Night drive'),track('nightB','Night drive')]:[track('morningA','Morning light')])}};
      else if(method==='POST'&&url.pathname==='/v1/me/playlists'){writes.push('create');data={id:'newPlaylist',name:'UI test',external_urls:{spotify:'https://open.spotify.com/playlist/newPlaylist'}};}
      else if(method==='POST'&&url.pathname==='/v1/playlists/newPlaylist/items'){writes.push('add');data={snapshot_id:'audit'};}
      else throw Error('Unexpected audit API endpoint: '+method+' '+url.pathname);
      return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
    }});
    library=createLibrary(path.join(app.getPath('userData'),'audit-library.json'),{getAdapter:id=>services.getAdapter(id)});
    library.importData({service:'yandex',tracks:[{id:'demo-night',title:'Night drive',artist:'HexSound Demo',duration:180,url:'https://music.yandex.ru/album/1/track/1'},{id:'demo-morning',title:'Morning light',artist:'HexSound Demo',duration:204,url:'https://music.yandex.ru/album/1/track/2'}],playlists:[{id:'demo-list',title:'Демонстрационная подборка',trackIds:['demo-night','demo-morning']}]});
    await run(`window.hex.openNative('services')`);await delay(250);
    if(await run(`document.querySelectorAll('.service-card').length`)!==4)throw Error('Missing provider cards');
    await run(`(()=>{const form=document.querySelector('[data-service="spotify"] .service-manual form');form.querySelector('input').value='hexsound-audit-token';form.requestSubmit();})()`);await delay(300);
    const statuses=await run('window.hex.services()');if(!statuses.find(s=>s.id==='spotify')?.connected||JSON.stringify(statuses).includes('hexsound-audit-token'))throw Error('Token connection/status redaction failed');
    await run(`window.hex.openNative('library')`);await delay(220);
    if(await run(`document.querySelectorAll('.library-track').length`)!==2)throw Error('Native library did not render');
    await run(`document.querySelectorAll('#library-tracks input[type=checkbox]').forEach(el=>el.click());document.querySelector('#library-transfer').click()`);await delay(180);
    await run(`document.querySelector('#transfer-target').value='spotify';document.querySelector('#transfer-form').requestSubmit()`);await delay(350);
    const review=await run(`({rows:document.querySelectorAll('.transfer-row').length,disabled:document.querySelector('#transfer-run').disabled,ambiguous:document.querySelectorAll('#transfer-review select').length})`);
    if(review.rows!==2||!review.disabled||review.ambiguous!==1||writes.length)throw Error('Transfer preview did not require explicit match review');
    await run(`(()=>{const el=document.querySelector('#transfer-review select');el.value='nightA';el.dispatchEvent(new Event('change'));})()`);
    if(await run(`document.querySelector('#transfer-run').disabled`))throw Error('Reviewed transfer stayed disabled');
    await run(`document.querySelector('#transfer-name').value='Проверенная подборка';document.querySelector('#transfer-name').dispatchEvent(new Event('input'))`);
    if(!(await run(`document.querySelector('#transfer-run').hidden`))||writes.length)throw Error('Changed transfer settings reused an old plan');
    await run(`document.querySelector('#transfer-form').requestSubmit()`);await delay(200);
    await run(`(()=>{const el=document.querySelector('#transfer-review select');el.value='nightA';el.dispatchEvent(new Event('change'));})()`);
    win.setContentSize(1280,800);await delay(500);fs.writeFileSync(path.join(out,'transfer-review.png'),(await win.capturePage()).toPNG());
    await run(`document.querySelector('#transfer-run').click()`);await delay(350);
    const completion=await run(`document.querySelector('#transfer-status').textContent`);
    if(writes.join(',')!=='create,add'||!completion.includes('Перенос завершён'))throw Error('Reviewed transfer did not execute exactly once: '+JSON.stringify({writes,completion}));
    await run(`window.hex.saveSettings({theme:'dark',palette:'obsidian',effect:'constellation',effectIntensity:40,lyricsOnline:false})`);
    await run(`window.hex.openPlayer()`);await delay(80);
    const cover='data:image/svg+xml;base64,'+Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#e8e2d6"/><g fill="none" stroke="#252929" stroke-width="1.8">${Array.from({length:32},(_,i)=>`<ellipse cx="300" cy="292" rx="${50+i*6}" ry="${48+i*5.2}" transform="rotate(${i*2.4} 300 292)"/>`).join('')}</g><text x="38" y="52" font-family="Arial" font-size="13" letter-spacing="3" fill="#303333">HEX / SESSIONS</text><text x="38" y="552" font-family="Arial" font-size="34" fill="#252929">Night drive</text></svg>`).toString('base64');
    const demo={sampledAt:Date.now(),profile:{loggedIn:false},track:{provider:'soundcloud',title:'Night drive',artist:'HexSound Demo',url:'https://soundcloud.com/demo/night-drive',artwork:cover,duration:180,position:3,playing:true,available:true,seekable:true,volume:.65}};
    const text={status:'synced',source:'Демонстрационный текст',lines:[{time:0,text:'Город медленно гасит огни'},{time:2.4,text:'И звучит чуть тише внутри'},{time:6,text:'Мы оставим весь шум позади'},{time:10,text:'Только музыка. Только наш ритм.'}]};
    await run(`window.HexPlayerUI.update(${JSON.stringify(demo)},false);window.HexPlayerUI.renderLyrics(${JSON.stringify(text)})`);await delay(20);
    const onset=await run(`(()=>{const el=document.querySelector('.lyric-line.is-active');return el?{opacity:Number(getComputedStyle(el).opacity),filter:getComputedStyle(el).filter}:null})()`);
    if(!onset||onset.opacity<.99||!['none','blur(0px)'].includes(onset.filter))throw Error('Active lyrics are not readable immediately: '+JSON.stringify(onset));
    await run(`window.HexPlayerUI.update(${JSON.stringify({...demo,track:{...demo.track,clockKnown:false}})},false)`);
    const unsynced=await run(`document.querySelector('#lyrics-lines').dataset.synced==='false'&&!document.querySelector('.lyric-line.is-active')`);if(!unsynced)throw Error('Unknown media clock pretends to have synchronized lyrics');
    await run(`window.HexPlayerUI.update(${JSON.stringify({...demo,track:{...demo.track,clockKnown:true}})},false);window.HexPlayerUI.updateLine(3)`);
    await delay(630);fs.writeFileSync(path.join(out,'player-dark.png'),(await win.capturePage()).toPNG());
    await run(`window.hex.saveSettings({theme:'light',palette:'porcelain',effect:'none'})`);await delay(650);fs.writeFileSync(path.join(out,'player-light.png'),(await win.capturePage()).toPNG());
    await run(`window.hex.saveSettings({theme:'dark',palette:'obsidian',effect:'constellation',effectIntensity:40})`);
    const results=[];
    for(const [width,height] of [[360,480],[390,844],[640,480],[800,600],[1024,768],[1280,800],[1920,1080],[3840,2160]]){
      win.setContentSize(width,height);await delay(160);
      for(const page of ['library','services','transfer']){
        await run(`window.hex.openNative(${JSON.stringify(page)})`);await delay(180);
        const info=await run(`(()=>{const el=document.querySelector('#native-${page}');return{overflow:el.scrollWidth>el.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1,node:typeof process,visible:!el.hidden,bridge:typeof window.hex};})()`);
        if(info.overflow||info.node!=='undefined'||!info.visible)throw Error('Native page layout/isolation: '+JSON.stringify({width,height,page,...info}));
        if(view.getVisible())throw Error('SoundCloud view overlaps native page');results.push({width,height,page,passed:true});
        if(width===1280&&page!=='transfer')fs.writeFileSync(path.join(out,page+'.png'),(await win.capturePage()).toPNG());
        if(page==='services'&&width===360){await run(`document.querySelector('.service-config').open=true`);const overflowing=await run(`document.querySelector('#native-services').scrollWidth>document.querySelector('#native-services').clientWidth+1`);if(overflowing)throw Error('Credential form overflows');}
      }
    }
    win.setContentSize(1280,1000);await run(`window.hex.openNative('services')`);await delay(500);fs.writeFileSync(path.join(out,'services.png'),(await win.capturePage()).toPNG());
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({results,review,writes},null,2));console.log('LIBRARY PASS: 24 page/size cases; token connection without secret disclosure; reviewed transfer through real IPC; API write only after confirmation');quitting=true;app.quit();
  }catch(error){console.error('LIBRARY FAIL',error);quitting=true;app.exit(1);}
}

async function runSmoke() {
  try {
    const out = app.isPackaged ? path.join(app.getPath('temp'), 'hexsound-smoke-artifacts') : path.join(__dirname, '..', 'artifacts'); fs.mkdirSync(out, { recursive: true });
    await new Promise(resolve => setTimeout(resolve, 16000));
    const remote = await view.webContents.executeJavaScript('({ title:document.title, url:location.href, text:document.body.innerText.slice(0,1200), node:typeof process, login:!!document.querySelector(".loginButton") })');
    console.log('REMOTE', JSON.stringify(remote));
    const chrome=await view.webContents.executeJavaScript('getComputedStyle(document.querySelector(".header")).display');
    if(chrome!=='none')throw new Error('Service header still visible');
    view.webContents.setAudioMuted(true);
    await view.webContents.executeJavaScript(`document.querySelector('#onetrust-reject-all-handler')?.click()`,true);
    await new Promise(resolve=>setTimeout(resolve,500));
    const playRequested=await view.webContents.executeJavaScript(`(()=>{const b=document.querySelector('.playableTile__playButton .sc-button-play,button.playableTile__playButton,.playableTile__playButton');if(b){b.click();return true;}return false;})()`,true);
    if(playRequested){await new Promise(resolve=>setTimeout(resolve,3500));await pollPlayback();console.log('LIVE PLAYER',JSON.stringify({track:playback.track.title,artist:playback.track.artist,available:playback.track.available,duration:playback.track.duration}));}
    fs.writeFileSync(path.join(out, 'music.png'), (await win.capturePage()).toPNG());
    fs.writeFileSync(path.join(out, 'soundcloud.png'), (await view.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(out, 'remote-dom.html'), await view.webContents.executeJavaScript('document.documentElement.outerHTML'));
    settingsOpen = true; layout(); send('page', 'settings');
    await new Promise(resolve => setTimeout(resolve, 1000));
    await win.webContents.executeJavaScript(`document.querySelector('button[data-theme="light"]').click()`);
    await new Promise(resolve => setTimeout(resolve, 700));
    fs.writeFileSync(path.join(out, 'settings-light.png'), (await win.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('button[data-theme="dark"]').click()`);
    await new Promise(resolve => setTimeout(resolve, 700));
    if (settings.theme !== 'dark') throw new Error('Theme did not persist through IPC');
    fs.writeFileSync(path.join(out, 'settings-dark.png'), (await win.capturePage()).toPNG());
    const local = await win.webContents.executeJavaScript('({width:innerWidth, overflow:document.documentElement.scrollWidth>innerWidth, theme:document.documentElement.dataset.theme, bridge:typeof window.hex, node:typeof process})');
    if (local.overflow || local.node !== 'undefined' || remote.node !== 'undefined') throw new Error('Isolation or layout check failed');
    const gallery = await win.webContents.executeJavaScript(`({themes:document.querySelectorAll('[data-palette]').length,effects:document.querySelectorAll('button[data-effect]').length})`);
    if(gallery.themes!==32||gallery.effects!==10)throw new Error('Incomplete theme or effect gallery');
    await win.webContents.executeJavaScript(`document.querySelector('[data-palette="aurora"]').click()`);
    await new Promise(resolve=>setTimeout(resolve,800));
    if(settings.palette!=='aurora'||settings.theme!=='dark')throw new Error('Preset did not persist');
    const renderedAccent=await win.webContents.executeJavaScript(`getComputedStyle(document.documentElement).getPropertyValue('--blue').trim()`);
    if(renderedAccent!==Visual.resolve(settings,true).accent)throw new Error('Shell palette overridden by legacy CSS');
    fs.writeFileSync(path.join(out,'studio-aurora.png'),(await win.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('[data-tab="atmosphere"]').click();document.querySelector('button[data-effect="aurora"]').click()`);
    await new Promise(resolve=>setTimeout(resolve,800));
    const remoteEffect=await view.webContents.executeJavaScript('window.HexAtmosphere.inspect()');
    if(settings.effect!=='aurora'||remoteEffect.effect!=='aurora'||remoteEffect.canvases!==1)throw new Error('Remote atmosphere not applied');
    const liveEffect=await win.webContents.executeJavaScript('window.HexAtmosphere.setActive(true);window.HexAtmosphere.inspect()');
    if(!liveEffect.running)throw new Error('Live atmosphere animation did not start');
    await win.webContents.executeJavaScript(`document.querySelector('#content').scrollTo({top:0,behavior:'instant'})`);
    fs.writeFileSync(path.join(out,'studio-atmosphere.png'),(await win.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('#pause-atmosphere').click()`);
    await new Promise(resolve=>setTimeout(resolve,400));
    const paused=await win.webContents.executeJavaScript('window.HexAtmosphere.inspect()');
    if(settings.effectPlaying!==false||paused.running)throw new Error('Atmosphere did not pause');
    await win.webContents.executeJavaScript(`document.querySelector('[data-tab="movement"]').click();document.querySelector('[data-motion-style="spring"]').click();document.querySelector('#replay-motion').click()`);
    await new Promise(resolve=>setTimeout(resolve,500));
    if(settings.motionStyle!=='spring')throw new Error('Motion style not persisted');
    const animations=await win.webContents.executeJavaScript(`document.getAnimations().filter(a=>a.effect?.target?.closest('#motion-playground')).length`);
    if(animations<1)throw new Error('Motion demonstration not animated');
    fs.writeFileSync(path.join(out,'studio-motion.png'),(await win.capturePage()).toPNG());
    for(const effect of Visual.effects){await win.webContents.executeJavaScript(`window.HexAtmosphere.mount({...window.HexVisual.atmosphereConfig(${JSON.stringify({...settings,resolvedDark:true})},window.HexVisual.resolve(${JSON.stringify(settings)},true)),effect:${JSON.stringify(effect.id)}})`);}
    if((await win.webContents.executeJavaScript('window.HexAtmosphere.inspect()')).canvases!==1)throw new Error('Effect canvas leaked');
    await win.webContents.executeJavaScript(`document.querySelector('[data-tab="interface"]').click(); document.querySelector('[data-setting="showLikes"]').click()`);
    await new Promise(resolve => setTimeout(resolve, 400));
    if (settings.showLikes !== false) throw new Error('Visibility setting failed');
    await win.webContents.executeJavaScript(`document.querySelector('[data-setting="zoom"]').value='110'; document.querySelector('[data-setting="zoom"]').dispatchEvent(new Event('change'))`);
    await new Promise(resolve => setTimeout(resolve, 400));
    if (view.webContents.getZoomFactor() !== 1.1) throw new Error('Zoom setting failed');
    win.setContentSize(900, 700);
    await new Promise(resolve => setTimeout(resolve, 500));
    const narrow = await win.webContents.executeJavaScript('document.documentElement.scrollWidth>innerWidth || document.querySelector("#settings").scrollWidth>document.querySelector("#settings").clientWidth');
    if (narrow) throw new Error('Narrow window overflow');
    fs.writeFileSync(path.join(out, 'settings-900.png'), (await win.capturePage()).toPNG());
    win.setContentSize(1440,960);
    await win.webContents.executeJavaScript('window.hex.openPlayer()');
    await new Promise(resolve=>setTimeout(resolve,500));
    const fixture={profile:{loggedIn:true,name:'Проверка профиля',url:'https://soundcloud.com/hexsound-test',avatar:''},track:{title:'Проверка оформления плеера',artist:'Локальная демонстрация интерфейса',url:'https://soundcloud.com/hexsound-test/player',duration:180,position:16,playing:false,volume:.7,available:true,seekable:true,shuffle:false,repeat:'off',liked:false,artwork:''}};
    const originalLyrics={status:'synced',source:'Локальный тест',lines:[{time:0,text:'Этот текст — проверка оформления.'},{time:10,text:'Здесь свет движется вместе со строкой.'},{time:20,text:'И следующая строка становится ближе.'},{time:30,text:'Музыка остаётся в вашем ритме.'}]};
    clearInterval(pollTimer);
    await win.webContents.executeJavaScript(`window.HexPlayerUI.update(${JSON.stringify(fixture)},false);window.HexPlayerUI.renderLyrics(${JSON.stringify(originalLyrics)});window.HexPlayerUI.updateLine(16);`);
    await new Promise(resolve=>setTimeout(resolve,900));
    const playerUI=await win.webContents.executeJavaScript(`({profile:document.querySelector('#account-login').textContent,active:document.querySelectorAll('.lyric-line.is-active').length,lines:document.querySelectorAll('.lyric-line').length,player:!document.querySelector('#player').hidden,overflow:document.querySelector('#player').scrollWidth>document.querySelector('#player').clientWidth})`);
    fs.writeFileSync(path.join(out,'player-demo.png'),(await win.capturePage()).toPNG());
    console.log('PLAYER UI',JSON.stringify(playerUI));
    if(playerUI.profile!==fixture.profile.name||playerUI.active!==1||playerUI.lines!==4||!playerUI.player||playerUI.overflow)throw new Error('Profile or lyrics screen failed');
    win.setContentSize(900,700);await new Promise(resolve=>setTimeout(resolve,400));
    const playerOverflow=await win.webContents.executeJavaScript(`document.querySelector('#player').scrollWidth>document.querySelector('#player').clientWidth`);
    if(playerOverflow)throw new Error('Player overflows at 900px');
    fs.writeFileSync(path.join(out,'player-900.png'),(await win.capturePage()).toPNG());
    console.log('PLAYER UI PASS',JSON.stringify(playerUI));
    const bridgeWindow=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
    const bridgeHTML=`<button class="header__userNavUsernameButton"><span class="header__userNavUsername">Contract profile</span></button><a class="playbackSoundBadge__titleLink" href="https://soundcloud.com/example/contract" title="Contract track">Contract track</a><a class="playbackSoundBadge__lightLink">Contract artist</a><button class="playControls__play">Play</button><div class="playbackTimeline is-scrubbable"><span class="playbackTimeline__timePassed">0:16</span><span class="playbackTimeline__duration">3:00</span><div class="playbackTimeline__progressWrapper"><div class="playbackTimeline__progressBackground" style="width:200px;height:2px"></div></div></div><audio></audio><script>window.contractPaused=true;const a=document.querySelector('audio');Object.defineProperty(a,'duration',{get:()=>180});Object.defineProperty(a,'paused',{get:()=>window.contractPaused});document.querySelector('button.playControls__play').onclick=()=>{window.contractPaused=!window.contractPaused};window.mouseUps=0;document.addEventListener('mouseup',()=>window.mouseUps++);</script>`;
    await bridgeWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(bridgeHTML));
    const bridge=await bridgeWindow.webContents.executeJavaScript(remotePlayerSource+`;(()=>{const p=window.HexRemotePlayer;p.control('toggle');p.control('seek',42);p.control('volume',.25);const snapshot=p.snapshot();document.querySelector('audio').remove();p.control('seek',70);return{profile:snapshot.profile.name,title:snapshot.track.title,playing:snapshot.track.playing,position:snapshot.track.position,volume:snapshot.track.volume,mouseUps:window.mouseUps};})()`,true);
    bridgeWindow.destroy();
    if(bridge.profile!=='Contract profile'||bridge.title!=='Contract track'||!bridge.playing||bridge.position!==42||bridge.volume!==.25||bridge.mouseUps!==1)throw new Error('Remote playback bridge contract failed: '+JSON.stringify(bridge));
    console.log('PLAYER BRIDGE PASS');
    const provider=await lyricsService.lookup({title:'I Want to Live',artist:'Borislav Slavov',duration:233,url:'https://soundcloud.com/hexsound-provider-test'});
    console.log('LYRICS PROVIDER',JSON.stringify({status:provider.status,lines:provider.lines?.length||0}));
    if (remote.login) {
      await view.webContents.executeJavaScript('window.__hexRouteProbe = true');
      await navigate('https://soundcloud.com/search?q=ambient');
      await new Promise(resolve => setTimeout(resolve, 2500));
      const routed = await view.webContents.executeJavaScript('({ preserved:window.__hexRouteProbe===true, url:location.href })');
      console.log('ROUTER',JSON.stringify(routed));
      if (!routed.preserved || !routed.url.includes('/search')) throw new Error('SPA player-preserving navigation failed');
      await win.webContents.executeJavaScript('window.hex.login()');
      await new Promise(resolve => setTimeout(resolve, 3000));
      const authUI = await view.webContents.executeJavaScript(`({frames:[...document.querySelectorAll('iframe')].map(f=>f.src).filter(u=>u.includes('soundcloud.com')), dialog:!!document.querySelector('.modal, .signIn, .webAuthContainer')})`);
      console.log('LOGIN UI',JSON.stringify({dialog:authUI.dialog, soundcloudFrames:authUI.frames.length, windows:authWindows.size}));
      if (!authUI.dialog && !authUI.frames.length && !authWindows.size) throw new Error('Official sign-in did not open');
    }
    console.log('SMOKE PASS', JSON.stringify(local));
    quitting = true; app.quit();
  } catch (e) { console.error('SMOKE FAIL', e); quitting = true; app.exit(1); }
}

async function runLayoutAudit(){
  const out=path.join(app.isPackaged?app.getPath('temp'):path.join(__dirname,'..','artifacts'),'hexsound-layout-0.4');fs.mkdirSync(out,{recursive:true});
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const fixture={profile:{loggedIn:true,name:'Профиль с очень длинным именем для проверки',url:'https://soundcloud.com/example',avatar:''},track:{title:'Проверка адаптивного плеера с длинным названием композиции',artist:'Локальная проверка интерфейса',url:'https://soundcloud.com/example/test',duration:180,position:12,playing:false,volume:.7,available:true,seekable:true,shuffle:false,repeat:'off',liked:false,artwork:''}};
  const text={status:'synced',source:'Тест адаптивности',lines:[{time:0,text:'Каждая строка на своём месте.'},{time:5,text:'Мягкий свет проходит по словам.'},{time:10,text:'Здесь начинается ваше звучание.'},{time:15,text:'Текст остаётся читаемым на маленьком окне.'},{time:20,text:'Длинноесловодляпроверкипереносадлинноесловодляпроверкипереносадлинноесловодляпроверкипереноса'},{time:25,text:'Музыка движется в вашем ритме.'}]};
  const sizes=[[360,480],[360,640],[390,844],[480,640],[640,480],[800,600],[800,1280],[900,650],[1024,768],[1280,720],[1366,768],[1536,864],[1920,1080],[2560,1440],[3440,1440],[3840,2160]];
  const results=[];
  try{
    await delay(350);
    await win.webContents.executeJavaScript(`window.hex.saveSettings({palette:'aurora',theme:'dark',effect:'none'})`);
    for(const [width,height] of sizes){
      win.setContentSize(width,height);await delay(150);
      await win.webContents.executeJavaScript(`window.hex.openPlayer()`);
      await win.webContents.executeJavaScript(`window.HexPlayerUI.update(${JSON.stringify(fixture)},false);window.HexPlayerUI.renderLyrics(${JSON.stringify(text)});window.HexPlayerUI.updateLine(12);document.querySelector('#content').scrollTop=0;`);
      await delay(150);
      const player=await win.webContents.executeJavaScript(`(()=>{const main=document.querySelector('#content'),p=document.querySelector('#player'),art=document.querySelector('.record-art').getBoundingClientRect();const rect=main.getBoundingClientRect();return{width:innerWidth,height:innerHeight,overflow:p.scrollWidth>p.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1,art:[Math.round(art.width),Math.round(art.height)],controls:[...document.querySelectorAll('#player-play,#player-volume,.lyrics-footer')].map(el=>({name:el.id||el.className,top:Math.round(el.getBoundingClientRect().top),bottom:Math.round(el.getBoundingClientRect().bottom)})),mainBottom:rect.bottom,playerHeight:p.scrollHeight,mainHeight:main.clientHeight};})()`);
      const settings=[];
      await win.webContents.executeJavaScript(`window.hex.showSettings(true);showPage('settings');`);
      for(const tab of ['appearance','atmosphere','movement','interface','general','account']){
        const info=await win.webContents.executeJavaScript(`(()=>{document.querySelector('[data-tab="${tab}"]').click();document.querySelector('#content').scrollTo({top:0,behavior:'instant'});const p=document.querySelector('#settings');return{tab:${JSON.stringify(tab)},overflow:p.scrollWidth>p.clientWidth+1||document.documentElement.scrollWidth>innerWidth+1};})()`);settings.push(info);
        if(tab==='appearance'&&[360,800,1280,1920].includes(width)&&height>=600){await delay(600);fs.writeFileSync(path.join(out,`settings-${width}x${height}.png`),(await win.capturePage()).toPNG());}
      }
      const result={requested:[width,height],player,settings};results.push(result);console.log('LAYOUT',JSON.stringify(result));
      if(width<640){await win.webContents.executeJavaScript('window.hex.showSidebar(true)');await delay(100);if(view.getVisible())throw new Error('Native content covers mobile menu');await win.webContents.executeJavaScript('window.hex.showSidebar(false)');}
      await win.webContents.executeJavaScript(`window.hex.openPlayer()`);
      await win.webContents.executeJavaScript(`window.HexPlayerUI.update(${JSON.stringify(fixture)},false);window.HexPlayerUI.renderLyrics(${JSON.stringify(text)});window.HexPlayerUI.updateLine(12);document.querySelector('#content').scrollTo({top:0,behavior:'instant'});`);
      await delay(1000);
      const held=await win.webContents.executeJavaScript(`({title:document.querySelector('#record-title').textContent,lines:document.querySelectorAll('.lyric-line').length,profileBottom:document.querySelector('.account').getBoundingClientRect().bottom})`);
      if(held.title!==fixture.track.title||held.lines!==text.lines.length)throw new Error('Delayed update replaced newer lyrics fixture: '+JSON.stringify(held));
      if(width>=640&&held.profileBottom>height+1)throw new Error('Profile is clipped at '+width+'x'+height);
      if([360,800,1280,1920,3440].includes(width))fs.writeFileSync(path.join(out,`player-${width}x${height}.png`),(await win.capturePage()).toPNG());
    }
    win.setContentSize(1440,960);await delay(200);
    await win.webContents.executeJavaScript(`window.hex.openPlayer()`);
    await win.webContents.executeJavaScript(`window.HexPlayerUI.update(${JSON.stringify(fixture)},false);window.HexPlayerUI.renderLyrics(${JSON.stringify(text)});window.HexPlayerUI.updateLine(12);`);
    for(const style of ['cascade','wave','cinema']){
      await win.webContents.executeJavaScript(`window.hex.saveSettings({lyricAnimation:${JSON.stringify(style)}})`);
      await win.webContents.executeJavaScript(`document.querySelector('#lyrics-replay').click()`);await delay(80);
      const animated=await win.webContents.executeJavaScript('window.HexLyricMotion.inspect()');if(!animated.runningWords)throw new Error('Lyric animation not running: '+style);
    }
    await win.webContents.executeJavaScript(`document.querySelector('#lyrics-scroll').dispatchEvent(new WheelEvent('wheel',{deltaY:100}))`);
    if((await win.webContents.executeJavaScript('window.HexLyricMotion.inspect()')).scrolling)throw new Error('User scroll did not stop following');
    await win.webContents.executeJavaScript(`window.hex.saveSettings({motion:false})`);await delay(80);
    if((await win.webContents.executeJavaScript('window.HexLyricMotion.inspect()')).runningWords)throw new Error('Disabled motion still running');
    const failures=results.filter(r=>r.player.overflow||Math.abs(r.player.art[0]-r.player.art[1])>2||r.settings.some(s=>s.overflow)||(r.player.width>=860&&r.player.controls.some(c=>c.bottom>r.player.mainBottom+2)));
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({results,failures},null,2));
    if(failures.length)throw new Error('Layout failures: '+failures.map(r=>r.requested.join('x')).join(', '));
    console.log('LAYOUT PASS',results.length,'sizes; six settings tabs; three lyric animations; manual scroll; motion disabled');quitting=true;app.quit();
  }catch(e){console.error('LAYOUT FAIL',e);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({results,error:String(e)},null,2));quitting=true;app.exit(1);}
}

async function runVisualAudit(){
  const out=path.join(app.isPackaged?app.getPath('temp'):path.join(__dirname,'..','artifacts'),'hexsound-visual-0.5');fs.mkdirSync(out,{recursive:true});
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const changed=(a,b)=>{const x=a.toBitmap(),y=b.toBitmap();let count=0,total=0;for(let i=0;i<Math.min(x.length,y.length);i+=4){const d=(Math.abs(x[i]-y[i])+Math.abs(x[i+1]-y[i+1])+Math.abs(x[i+2]-y[i+2]))/3;total+=d;if(d>=3)count++;}return{pixels:count,mean:total/(x.length/4)};};
  const fixture={profile:{loggedIn:true,name:'Проверка',url:'https://soundcloud.com/example',avatar:''},track:{title:'Проверка обложки',artist:'Локальный тест',url:'https://soundcloud.com/example/test',duration:180,position:12,playing:false,volume:.7,available:true,seekable:true,shuffle:false,repeat:'off',liked:false,artwork:''}};
  const results={};
  try{
    await delay(12000);clearInterval(pollTimer);await delay(100);
    await win.webContents.executeJavaScript(`window.hex.saveSettings({palette:'obsidian',theme:'dark',background:'graphite',glass:true,blur:24,effect:'constellation',effectIntensity:55,effectSpeed:1,effectPlaying:true,motion:true,respectReducedMotion:false})`);
    const cfg=Visual.atmosphereConfig({...settings,resolvedDark:true},Visual.resolve(settings,true));
    await win.webContents.executeJavaScript('(async()=>{await window.hex.showSettings(false);showPage("music");})()');
    if(isSoundCloud(view.webContents.getURL())){
      await view.webContents.executeJavaScript(`document.querySelector('#onetrust-reject-all-handler')?.click()`,true);await delay(450);
      await view.webContents.executeJavaScript(`window.HexAtmosphere.mount(${JSON.stringify({...cfg,effect:'none'})});window.HexAtmosphere.setActive(true)`);await delay(100);
      const nativeBare=await view.webContents.capturePage(undefined,{stayAwake:true});
      await view.webContents.executeJavaScript(`window.HexAtmosphere.mount(${JSON.stringify(cfg)});window.HexAtmosphere.setActive(true)`);await delay(600);
      const nativeFirst=await view.webContents.capturePage(undefined,{stayAwake:true});await delay(700);const nativeSecond=await view.webContents.capturePage(undefined,{stayAwake:true});
      const css=await view.webContents.executeJavaScript(`(()=>{const el=document.querySelector('.l-content');return{background:el?getComputedStyle(el).backgroundColor:'',filter:el?getComputedStyle(el).backdropFilter:'',engine:window.HexAtmosphere.inspect()};})()`);
      results.remote={visible:changed(nativeBare,nativeFirst),moving:changed(nativeFirst,nativeSecond),css};
      fs.writeFileSync(path.join(out,'soundcloud-background.png'),nativeSecond.toPNG());
      if(results.remote.visible.pixels<100||results.remote.moving.pixels<50||css.filter!=='none'||!css.engine.running)throw new Error('Native SoundCloud background is obscured: '+JSON.stringify(results.remote));
    }else throw new Error('SoundCloud did not load');
    await win.webContents.executeJavaScript('window.hex.openPlayer()');
    await win.webContents.executeJavaScript(`window.HexPlayerUI.update(${JSON.stringify(fixture)},false)`);await delay(900);
    await win.webContents.executeJavaScript(`window.HexAtmosphere.mount(${JSON.stringify({...cfg,effect:'none'})})`);await delay(150);
    const bare=await win.webContents.capturePage();
    await win.webContents.executeJavaScript(`window.HexAtmosphere.mount(${JSON.stringify(cfg)})`);await delay(450);
    const first=await win.webContents.capturePage(),stateA=await win.webContents.executeJavaScript('window.HexAtmosphere.inspect()');
    await delay(900);const second=await win.webContents.capturePage(),stateB=await win.webContents.executeJavaScript('window.HexAtmosphere.inspect()');
    results.local={visible:changed(bare,first),moving:changed(first,second),frames:stateB.frames-stateA.frames};
    fs.writeFileSync(path.join(out,'background.png'),second.toPNG());
    if(results.local.visible.pixels<400||results.local.moving.pixels<100||results.local.frames<5)throw new Error('Background is not visibly moving: '+JSON.stringify(results.local));
    win.emit('blur');const blurA=await win.webContents.executeJavaScript('window.HexAtmosphere.inspect()');await delay(400);const blurB=await win.webContents.executeJavaScript('window.HexAtmosphere.inspect()');
    if(blurB.frames<=blurA.frames)throw new Error('Visible background stops when window loses focus');
    await win.webContents.executeJavaScript('window.hex.saveSettings({effectPlaying:false})');await delay(180);const pauseA=await win.webContents.executeJavaScript('window.HexAtmosphere.inspect()');await delay(400);const pauseB=await win.webContents.executeJavaScript('window.HexAtmosphere.inspect()');
    if(pauseB.clock!==pauseA.clock||pauseB.running)throw new Error('Effect pause failed');
    await win.webContents.executeJavaScript('window.hex.saveSettings({effectPlaying:true,sidebarCollapsed:true})');await delay(450);
    const collapsed=await win.webContents.executeJavaScript(`({left:document.querySelector('#content').getBoundingClientRect().left,inert:document.querySelector('#app-sidebar').inert,toggle:getComputedStyle(document.querySelector('#menu-toggle')).display})`);
    if(view.getBounds().x!==0||collapsed.left!==0||!collapsed.inert||collapsed.toggle==='none')throw new Error('Desktop sidebar did not collapse');
    await win.webContents.executeJavaScript(`document.querySelector('#menu-toggle').click()`);await delay(600);
    if(view.getBounds().x!==236)throw new Error('Desktop sidebar did not restore');
    results.sidebar='collapse and restore passed';
    await win.webContents.executeJavaScript('window.hex.openPlayer()');await win.webContents.executeJavaScript('window.hex.saveSettings({artworkMotion:"turn"})');
    await win.webContents.executeJavaScript(`window.HexPlayerUI.update(${JSON.stringify({...fixture,track:{...fixture.track,playing:true}})},false)`);await delay(350);
    const artA=await win.webContents.executeJavaScript('window.HexArtwork.inspect()');await delay(700);const artB=await win.webContents.executeJavaScript('window.HexArtwork.inspect()');
    if(!artB.running||artB.frames<=artA.frames||artA.transform===artB.transform)throw new Error('Cover turn is not animated');
    await win.webContents.executeJavaScript(`(()=>{const el=document.querySelector('#record-art'),r=el.getBoundingClientRect();el.dispatchEvent(new PointerEvent('pointermove',{clientX:r.right-5,clientY:r.top+5,pointerType:'mouse'}));})()`);await delay(350);
    const tilt=await win.webContents.executeJavaScript('window.HexArtwork.inspect()');if(!/rotateY\([1-9]/.test(tilt.transform))throw new Error('Cover does not react to pointer: '+tilt.transform);
    await win.webContents.executeJavaScript('window.hex.saveSettings({motion:false})');await delay(150);if((await win.webContents.executeJavaScript('window.HexArtwork.inspect()')).running)throw new Error('Cover animation ignores motion toggle');
    results.artwork='turn, pointer tilt, motion off passed';
    await win.webContents.executeJavaScript('window.hex.saveSettings({motion:true})');
    const intro=win.webContents.executeJavaScript('window.HexLaunch.replay()');
    await delay(240);fs.writeFileSync(path.join(out,'launch-symbol.png'),(await win.capturePage()).toPNG());
    const symbol=await win.webContents.executeJavaScript(`({hidden:document.querySelector('#launch-screen').hidden,width:parseFloat(getComputedStyle(document.querySelector('.launch-name')).maxWidth)})`);
    await delay(520);fs.writeFileSync(path.join(out,'launch-name.png'),(await win.capturePage()).toPNG());
    const name=await win.webContents.executeJavaScript(`parseFloat(getComputedStyle(document.querySelector('.launch-name')).maxWidth)`);
    await intro;
    const launch=await win.webContents.executeJavaScript('window.HexLaunch.inspect()');
    if(symbol.hidden||symbol.width!==0||name<80||!launch.hidden||!launch.finished)throw new Error('Launch reveal failed: '+JSON.stringify({symbol,name,launch}));
    results.launch='symbol, name reveal and shell passed';
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));console.log('VISUAL PASS',JSON.stringify(results));quitting=true;app.quit();
  }catch(error){console.error('VISUAL FAIL',error);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({...results,error:String(error)},null,2));quitting=true;app.exit(1);}
}

async function runMemoryAudit(){
  const delay=ms=>new Promise(r=>setTimeout(r,ms)),snapshots=[];
  try{
    settingsOpen=true;layout();send('page','library');
    if(process.argv.includes('--memory-remote'))await view.webContents.loadURL(currentURL).catch(()=>{});
    else if(!['','about:blank'].includes(view.webContents.getURL()))throw Error('Native startup loaded a remote service');
    for(const stage of ['startup','settled']){
      await delay(4000);
      const metrics=app.getAppMetrics().map(({pid,type,memory})=>({pid,type,memory}));
      const canvas=await win.webContents.executeJavaScript('(()=>{const c=document.querySelector("#hex-atmosphere");return c?{width:c.width,height:c.height,bytes:c.width*c.height*4}:null})()');
      const workingSetMiB=metrics.reduce((sum,p)=>sum+(p.memory.workingSetSize||0),0)/1024;
      snapshots.push({stage,remoteURL:view.webContents.getURL(),workingSetMiB,canvas,metrics});
      console.log('MEMORY_SAMPLE '+JSON.stringify({stage,workingSetMiB,canvas,remoteLoaded:isSoundCloud(view.webContents.getURL())}));
    }
    const label=process.argv.find(s=>s.startsWith('--memory-label='))?.split('=')[1]||'audit';
    const out=path.join(app.isPackaged?app.getPath('temp'):path.join(__dirname,'..','artifacts'),'memory-'+label.replace(/[^a-z0-9-]/gi,'')+'.json');
    fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({platform:process.platform,note:'Working sets include shared pages; this sum is not private RAM.',snapshots},null,2));console.log('MEMORY_AUDIT_OK '+out);app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
}
