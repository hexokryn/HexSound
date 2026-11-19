const { app, BrowserWindow, WebContentsView, ipcMain, nativeTheme, dialog, shell, Tray, Menu, nativeImage, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { defaults, validate, isSoundCloud, isAuthURL, externalURL } = require('./settings.cjs');
const { themeCSS } = require('./soundcloud-theme.cjs');
const Visual = require('./visual-system.js');
const atmosphereSource = fs.readFileSync(path.join(__dirname, 'atmosphere.js'), 'utf8');
const remotePlayerSource = fs.readFileSync(path.join(__dirname, 'remote-player.js'), 'utf8');
const {sanitize:playerSnapshot}=require('./player-state.cjs');
const {createLyricsService}=require('./lyrics.cjs');

app.setName('HexSound');
const layoutTest=process.argv.includes('--layout-test');
const visualTest=process.argv.includes('--effects-test');
const promoCapture=!app.isPackaged&&process.argv.includes('--capture-promo');
const smoke = process.argv.includes('--smoke-test')||layoutTest||visualTest||promoCapture;
if (smoke) app.setPath('userData', path.join(app.getPath('temp'), 'hexsound-smoke-' + process.pid));
const settingsFile = path.join(app.getPath('userData'), 'settings.json');
const lyricsService=createLyricsService(path.join(app.getPath('userData'),'lyrics'),{fetcher:(url,init)=>net.fetch(url,init)});
let playback=playerSnapshot(null),polling=false,pollTimer;
let settings = { ...defaults };
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
  if (!smoke) app.setLoginItemSettings({ openAtLogin: enabled, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: [] });
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
      await view.webContents.executeJavaScript(atmosphereSource + `;window.HexAtmosphere.mount(${JSON.stringify(config)});window.HexAtmosphere.setActive(${!settingsOpen && !sidebarOpen && win.isVisible() && !win.isMinimized()});`).catch(()=>{});
    }
  }
  send('settings', { ...settings, resolvedDark: dark() });
}
function status(value) { send('status', value); }
async function navigate(route) {
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
  if(polling||!view||view.webContents.isDestroyed()||!isSoundCloud(view.webContents.getURL()))return;
  polling=true;
  try{const raw=await view.webContents.executeJavaScript(remotePlayerSource+';window.HexRemotePlayer.snapshot()');const next=playerSnapshot(raw);if(JSON.stringify(next)!==JSON.stringify(playback)){playback=next;send('playback',playback);}}catch{}finally{polling=false;}
}
async function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 960, minWidth: 360, minHeight: 480,
    title: 'HexSound', icon: path.join(__dirname, 'assets', 'icon.ico'), backgroundColor: dark() ? '#18181a' : '#fafafc',
    frame: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
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
    if (mainFrame && code !== -3) { settingsOpen = true; layout(); status({ error: description, url }); }
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
  win.on('closed', () => { if (!view.webContents.isDestroyed()) view.webContents.close(); for (const child of authWindows) child.destroy(); });
  await win.loadFile(path.join(__dirname, 'index.html'));
  await applyTheme();
  layout();
  win.show();
  createTray();
  if(promoCapture){try{await require('../scripts/capture-promo.cjs')({win,view});quitting=true;app.quit();}catch(error){console.error('PROMO FAIL',error);quitting=true;app.exit(1);}return;}
  if(layoutTest){runLayoutAudit();return;}
  navigate('discover');
  pollTimer=setInterval(pollPlayback,650);pollTimer.unref();
  if(visualTest)runVisualAudit();else if (smoke) runSmoke();
}

function trusted(event) { return event.sender === win?.webContents && event.senderFrame?.url === shellURL; }
function handle(name, fn) { ipcMain.handle(name, async (event, ...args) => { if (!trusted(event)) throw new Error('Untrusted sender'); return fn(...args); }); }
handle('get-settings', () => ({ ...settings, resolvedDark: dark(), version: app.getVersion(), skipIntro:smoke }));
handle('intro-complete',animate=>{const first=introOpen;introOpen=false;layout();if(first&&animate&&settings.motion&&isSoundCloud(view.webContents.getURL()))view.webContents.executeJavaScript(`document.documentElement.animate([{opacity:0,translate:'0 5px'},{opacity:1,translate:'0 0'}],{duration:650,easing:'cubic-bezier(.22,1,.36,1)'})`).catch(()=>{});return true;});
handle('get-playback',()=>playback);
handle('player-open',()=>{settingsOpen=true;sidebarOpen=false;send('sidebar',false);layout();send('page','player');pollPlayback();return true;});
handle('sidebar-open',open=>{sidebarOpen=!!open&&win.getContentSize()[0]<640;layout();send('sidebar',sidebarOpen);return sidebarOpen;});
handle('player-control',async(action,value)=>{
  if(!['toggle','previous','next','shuffle','repeat','like','seek','volume'].includes(action))return false;
  if(['seek','volume'].includes(action)&&!Number.isFinite(value))return false;
  if(!isSoundCloud(view.webContents.getURL()))return false;
  const result=await view.webContents.executeJavaScript(remotePlayerSource+`;window.HexRemotePlayer.control(${JSON.stringify(action)},${JSON.stringify(Number.isFinite(value)?value:null)})`,true).catch(()=>false);
  setTimeout(pollPlayback,120);return result;
});
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
handle('reset-settings', async () => { settings = { ...defaults }; save(); setAutoLaunch(false); await applyTheme(); return { ...settings, resolvedDark: dark() }; });
handle('navigate', navigate);
handle('search', q => { if (typeof q === 'string' && q.trim()) navigate('https://soundcloud.com/search?q=' + encodeURIComponent(q.trim().slice(0, 500))); });
handle('settings-open', open => { settingsOpen = !!open;sidebarOpen=false;send('sidebar',false); layout(); return true; });
handle('window', action => {
  if (action === 'minimize') win.minimize();
  if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  if (action === 'close') win.close();
});
handle('history', direction => { const h = view.webContents.navigationHistory; if (direction === 'back' && h.canGoBack()) h.goBack(); if (direction === 'forward' && h.canGoForward()) h.goForward(); });
handle('reload', () => { settingsOpen = false; layout(); send('page','music'); view.webContents.loadURL(currentURL).catch(() => {}); });
handle('open-browser', () => { if (isSoundCloud(currentURL)) return shell.openExternal(currentURL); });
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
app.on('before-quit', () => { quitting = true;clearInterval(pollTimer); });
app.on('window-all-closed', () => app.quit());
nativeTheme.on('updated', () => { if (win) applyTheme(); });
if (!smoke && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { win.show(); if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
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
