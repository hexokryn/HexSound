const { app, BrowserWindow, WebContentsView, ipcMain, nativeTheme, dialog, shell, Tray, Menu, nativeImage, net, safeStorage } = require('electron');
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
const {createSessionLibrary}=require('./session-library.cjs');
const {createUpdates}=require('./updates.cjs');
const {spawn}=require('node:child_process');
let sessionLibrary,updates,webDiscovery,loginReturn=false,sourcePlayRevision=0;const remoteEnds=new Map();const syncingSources=new Map();
const {createServiceHub}=require('./services/index.cjs');
const {createLibrary}=require('./library/index.cjs');
const providers={soundcloud:{home:'https://soundcloud.com/'}};const providerURL=(id,url)=>id==='soundcloud'&&isSoundCloud(url);

app.setName('HexSound');
const {createExperience}=require('./soundcloud-experience.cjs');
let experience,imports;const nativePages=['services','transfer','wave','jobs'];
const layoutTest=process.argv.includes('--layout-test');
const visualTest=process.argv.includes('--effects-test');
const unifiedTest=process.argv.includes('--unified-test');
const memoryTest=process.argv.includes('--memory-test');
const experienceTest=process.argv.includes('--experience-test');
const libraryTest=process.argv.includes('--library-test');
const smoke = process.argv.includes('--smoke-test')||layoutTest||visualTest||libraryTest||experienceTest||memoryTest||unifiedTest;
if (smoke) app.setPath('userData', path.join(app.getPath('temp'), 'hexsound-smoke-' + process.pid));
const settingsFile = path.join(app.getPath('userData'), 'settings.json');
const lyricsService=createLyricsService(path.join(app.getPath('userData'),'lyrics'),{fetcher:(url,init)=>net.fetch(url,init)});
let playback=playerSnapshot(null),polling=false,pollTimer;
let services,library,nativePage='music',playbackProvider='soundcloud',nextPoll=0,libraryOperation;
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
  view.setBounds({ x:left,y:100,width:Math.max(1,w-left),height:Math.max(1,h-100-(w<640?112:96)) });
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
async function navigate(route,{background=false,preserveWave=false}={}) {
  if(!preserveWave)await experience?.stopNative();
  if(!background)nativePage='music';playbackProvider='soundcloud';nextPoll=0;
  sidebarOpen=false;send('sidebar',false);
  const routes = { discover: '/discover', feed: '/feed', library: '/you/library', likes: '/you/likes', playlists: '/you/sets', history: '/you/history', upload: '/upload', account: '/you' };
  if(route==='account'&&!playback.profile.url&&isSoundCloud(view.webContents.getURL())){const found=await view.webContents.executeJavaScript(remotePlayerSource+';window.HexRemotePlayer.profileURL()',true).catch(()=>'');if(isSoundCloud(found))playback.profile.url=found;}
  const url = route==='account'&&playback.profile.url?playback.profile.url:routes[route] ? 'https://soundcloud.com' + routes[route] : route;
  if (!isSoundCloud(url)) return;
  settingsOpen = background;
  layout();
  if(!background)send('page','music');
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
  try{if(!isSoundCloud(view.webContents.getURL()))return;const raw=await view.webContents.executeJavaScript(remotePlayerSource+';window.HexRemotePlayer.snapshot()');if(!raw)return;const next=playerSnapshot(raw);if(experience.queuedControls())next.track.controls={...next.track.controls,next:true,previous:true};if(next.profile.loggedIn&&loginReturn){loginReturn=false;await navigate('likes');}if(Number.isFinite(raw.endedAt)&&raw.endedAt>(remoteEnds.get('soundcloud')||0)){remoteEnds.set('soundcloud',raw.endedAt);experience.remoteEnded().catch(e=>send('feature-notice',e.message));}if(JSON.stringify(next)!==JSON.stringify(playback)){playback=next;send('playback',playback);}await experience.tick(playback);}catch{}finally{polling=false;}
}
async function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 960, minWidth: 360, minHeight: 480,
    title: 'HexSound', icon: path.join(__dirname, 'assets', process.platform==='linux'?'icon.png':'icon.ico'), backgroundColor: dark() ? '#18181a' : '#fafafc',
    frame: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling:false }
  });
  services=createServiceHub({directory:path.join(app.getPath('userData'),'services'),safeStorage,enabled:['soundcloud'],fetcher:(url,init)=>net.fetch(url,init),openExternal:url=>shell.openExternal(url),onChange:value=>send('services',value)});
  library=createLibrary(path.join(app.getPath('userData'),'library.json'),{getAdapter:id=>services.getAdapter(id)});imports=createLibrary(path.join(app.getPath('userData'),'file-imports.json'),{getAdapter:id=>services.getAdapter(id)});
  webDiscovery=require('./web-discovery.cjs').createWebDiscovery({BrowserWindow,parent:win});
  experience=createExperience({directory:app.getPath('userData'),services,library,send,handle,win,dialog,control:playerControl,getPlayback:()=>playback,openSource,webDiscovery,ensureLibrary:()=>syncSource('soundcloud')});
  sessionLibrary=createSessionLibrary({BrowserWindow,parent:win,directory:app.getPath('userData'),onImport:document=>{library.importData(document);send('library-updated');},onChange:()=>send('services',publicServices())});
  updates=createUpdates({version:app.getVersion(),directory:path.join(app.getPath('userData'),'updates'),packaged:app.isPackaged&&!smoke,onChange:value=>send('updates',value),install:installUpdate});
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
  win.on('closed', () => {webDiscovery?.dispose();sessionLibrary?.dispose();experience?.dispose();services.dispose();libraryOperation?.abort();if (!view.webContents.isDestroyed()) view.webContents.close(); for (const child of authWindows) child.destroy(); });
  await win.loadFile(path.join(__dirname, 'index.html'));
  await applyTheme();
  layout();
  win.show();
  try{createTray();}catch{tray=undefined;}
  pollTimer=setInterval(pollPlayback,200);pollTimer.unref();
  if(smoke){require('./soundcloud-audit.cjs')({win,view,app,Visual,base:__dirname,prepare:()=>{settingsOpen=true;introOpen=false;layout();},getPlayback:()=>playback,refresh:()=>{nextPoll=0;return pollPlayback();},navigate,layout});return;}
  navigate('discover');
}

function trusted(event) { return event.sender === win?.webContents && event.senderFrame?.url === shellURL; }
function handle(name, fn) { ipcMain.handle(name, async (event, ...args) => { if (!trusted(event)) throw new Error('Untrusted sender'); if(name.startsWith('services-')&&['services-configure','services-connect','services-cancel','services-token','services-disconnect','services-web','services-browser','services-search'].includes(name)&&args[0]!=='soundcloud')throw Error('Доступен только SoundCloud.');return fn(...args); }); }
handle('get-settings', () => ({ ...settings, resolvedDark: dark(), version: app.getVersion(), skipIntro:smoke,nativeHome:false }));
handle('intro-complete',animate=>{const first=introOpen;introOpen=false;layout();if(first&&animate&&settings.motion&&isSoundCloud(view.webContents.getURL()))view.webContents.executeJavaScript(`document.documentElement.animate([{opacity:0,translate:'0 5px'},{opacity:1,translate:'0 0'}],{duration:650,easing:'cubic-bezier(.22,1,.36,1)'})`).catch(()=>{});return true;});
handle('get-playback',()=>playback);
handle('native-page',name=>{if(!nativePages.includes(name))throw Error('Неизвестный экран.');nativePage=name;settingsOpen=true;sidebarOpen=false;send('sidebar',false);layout();send('page',name);return true;});
function publicServices(){return services.statuses().filter(s=>s.id==='soundcloud').map(s=>s.id==='soundcloud'?{...s,webSession:!!sessionLibrary?.status().connected||playback.profile.loggedIn,webLibrary:sessionLibrary?.status(),capabilities:{...s.capabilities,libraryRead:s.capabilities.libraryRead||!!sessionLibrary?.status().connected||playback.profile.loggedIn}}:s);}
handle('services-status',publicServices);
handle('services-configure',(id,patch)=>services.configure(id,patch));
handle('services-connect',async id=>{const result=await services.connect(id);syncSource(id).catch(()=>{});return result;});
handle('services-cancel',id=>{services.cancelConnect(id);return services.status(id);});
handle('services-token',async(id,input)=>{const result=await services.importToken(id,input);syncSource(id).catch(()=>{});return result;});
handle('services-disconnect',id=>services.disconnect(id));
async function openSource(id,source={}){
 if(id!=='soundcloud')throw Error('Доступен только SoundCloud.');const url=typeof source.url==='string'?source.url:'';if(url&&!isSoundCloud(url))throw Error('Нужна ссылка SoundCloud.');
 if(source.login){loginReturn=true;return navigate('https://soundcloud.com/signin');}
 if(!source.play)return navigate(url||'discover');
 const revision=++sourcePlayRevision;await navigate(url||'discover',{background:nativePage==='wave',preserveWave:true});const target=new URL(url||'https://soundcloud.com/discover').pathname;
 for(let i=0;i<24;i++){await new Promise(r=>setTimeout(r,400));if(revision!==sourcePlayRevision)return false;if(!isSoundCloud(view.webContents.getURL())||new URL(view.webContents.getURL()).pathname!==target)continue;const result=await view.webContents.executeJavaScript(require('./soundcloud-play.cjs').startTrackScript(url),true).catch(()=>false);if(result){nextPoll=0;await pollPlayback();return true;}}
 throw Error('SoundCloud не запустил трек. Страница открыта — проверьте вход и доступность записи.');
}
handle('library-list',options=>{const value=imports.snapshot(options&&typeof options==='object'?options:{});value.tracks=value.tracks.map(experience.decorate);return value;});
async function syncSource(id){if(syncingSources.has(id))return syncingSources.get(id);const pending=(async()=>{try{if(id==='soundcloud'&&!services.status(id).connected){const data=await sessionLibrary.sync();const value=library.importData(data);send('library-updated');return value;}return await library.sync(id);}finally{send('library-updated');send('services',publicServices());syncingSources.delete(id);}})();syncingSources.set(id,pending);return pending;}
handle('library-sync',id=>{if(id!=='soundcloud')throw Error('Доступен только SoundCloud.');return syncSource(id);});
handle('library-plan',async options=>{if(libraryOperation)throw Error('Дождитесь завершения текущей операции.');const controller=new AbortController();libraryOperation=controller;try{if(options?.targetService!=='soundcloud')throw Error('Доступен только SoundCloud.');const plan=await imports.planTransfer(options,{signal:controller.signal});experience.plans.set(plan.id,plan);return plan;}finally{if(libraryOperation===controller)libraryOperation=null;}});
handle('library-transfer',async options=>{if(libraryOperation)throw Error('Дождитесь завершения текущей операции.');const controller=new AbortController();libraryOperation=controller;try{const plan=experience.plans.get(options?.planId);if(!plan)throw Error('Найдите совпадения снова.');const result=await experience.journal.start(plan,options.choices,opts=>imports.executeTransfer(options,opts),{signal:controller.signal,onProgress:value=>send('transfer-progress',value)});experience.plans.delete(plan.id);return result;}finally{if(libraryOperation===controller)libraryOperation=null;}});
handle('transfer-resume',async id=>{if(libraryOperation)throw Error('Дождитесь завершения текущей операции.');const controller=new AbortController();libraryOperation=controller;try{return await experience.journal.resume(id,{signal:controller.signal,onProgress:value=>send('transfer-progress',value)});}finally{libraryOperation=null;}});
handle('library-cancel',()=>{libraryOperation?.abort();imports.cancelTransfer();return true;});
handle('library-import',async service=>{
  if(!['local','spotify','soundcloud','youtube','yandex'].includes(service))throw Error('Неизвестный источник импорта.');
  const chosen=await dialog.showOpenDialog(win,{title:'Импорт библиотеки',properties:['openFile'],filters:[{name:'Библиотека',extensions:['json','csv','tsv']}]});
  if(chosen.canceled)return null;const file=chosen.filePaths[0];if(fs.statSync(file).size>10*1024*1024)throw Error('Файл должен быть меньше 10 МБ.');
  const {parseImport}=require('./library/import-file.cjs');
  const document=parseImport(fs.readFileSync(file,'utf8'),{format:path.extname(file).toLowerCase()==='.json'?'json':'csv',service});
  const value=imports.importData(document);send('library-updated');return value;
});
handle('player-open',()=>{nativePage='player';nextPoll=0;settingsOpen=true;sidebarOpen=false;send('sidebar',false);layout();send('page','player');pollPlayback();return true;});
handle('sidebar-open',open=>{sidebarOpen=!!open&&win.getContentSize()[0]<640;layout();send('sidebar',sidebarOpen);return sidebarOpen;});
async function playerControl(action,value){
  if(!['toggle','previous','next','shuffle','repeat','like','seek','volume'].includes(action))return false;
  if(['seek','volume'].includes(action)&&!Number.isFinite(value))return false;
  const own=await experience.playerControl(action,value);if(own!==null){nextPoll=0;setTimeout(pollPlayback,20);return own;}
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
handle('open-browser', () => {const url=currentURL;if(providerURL(playbackProvider,url))return shell.openExternal(url); });
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
  sessionLibrary.reset();playback=playerSnapshot(null);send('playback',playback);await navigate('discover');return true;
});
app.on('before-quit', () => { quitting = true;clearInterval(pollTimer);updates?.cancel();sessionLibrary?.dispose();experience?.dispose(); });
app.on('window-all-closed', () => app.quit());
nativeTheme.on('updated', () => { if (win) applyTheme(); });
if (!smoke && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { win.show(); if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
}

handle('updates-check',force=>updates.check(force===true));handle('updates-download',()=>updates.download());handle('updates-apply',()=>updates.apply());handle('updates-cancel',()=>{updates.cancel();return true;});
async function installUpdate({file,portable,platform,sha256}){
 if(platform==='win32'&&portable){const target=process.env.PORTABLE_EXECUTABLE_FILE;if(!target||!path.isAbsolute(target))throw Error('Не найден исходный Portable-файл.');const quote=value=>"'"+value.replace(/'/g,"''")+"'";const script=`$ErrorActionPreference='Stop'; $target=${quote(target)}; $source=${quote(file)}; $old=Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue; if($old -and -not $old.WaitForExit(60000)){throw 'Application did not exit'}; if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne '${sha256}'){throw 'Hash mismatch'}; Copy-Item -LiteralPath $source -Destination ($target+'.new') -Force; Move-Item -LiteralPath $target -Destination ($target+'.bak') -Force; Move-Item -LiteralPath ($target+'.new') -Destination $target; Start-Process -FilePath $target`;await new Promise((resolve,reject)=>{const helper=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{detached:true,stdio:'ignore',windowsHide:true});helper.once('error',reject);helper.once('spawn',()=>{helper.unref();resolve();});});quitting=true;app.quit();return;
 }
 if(platform==='win32'){await new Promise((resolve,reject)=>{const helper=spawn(file,[],{detached:true,stdio:'ignore'});helper.once('error',reject);helper.once('spawn',()=>{helper.unref();resolve();});});quitting=true;app.quit();return;}
 if(platform==='linux'&&process.env.APPIMAGE){const target=process.env.APPIMAGE;await fs.promises.copyFile(file,target+'.new');await fs.promises.chmod(target+'.new',0o755);await fs.promises.rename(target+'.new',target);const env={...process.env};delete env.APPIMAGE;delete env.APPDIR;const child=spawn(target,[],{detached:true,stdio:'ignore',env});child.unref();quitting=true;app.quit();return;}
 const error=await shell.openPath(file);if(error)throw Error(error);
}
