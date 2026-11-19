const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hex', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  introComplete:animate=>ipcRenderer.invoke('intro-complete',animate),
  getPlayback:()=>ipcRenderer.invoke('get-playback'),
  openPlayer:()=>ipcRenderer.invoke('player-open'),
  showSidebar:open=>ipcRenderer.invoke('sidebar-open',open),
  playerControl:(action,value)=>ipcRenderer.invoke('player-control',action,value),
  lyrics:expected=>ipcRenderer.invoke('lyrics',expected),
  importLyrics:expected=>ipcRenderer.invoke('import-lyrics',expected),
  saveSettings: patch => ipcRenderer.invoke('save-settings', patch),
  resetSettings: () => ipcRenderer.invoke('reset-settings'),
  navigate: route => ipcRenderer.invoke('navigate', route),
  search: query => ipcRenderer.invoke('search', query),
  showSettings: open => ipcRenderer.invoke('settings-open', open),
  window: action => ipcRenderer.invoke('window', action),
  history: direction => ipcRenderer.invoke('history', direction),
  reload: () => ipcRenderer.invoke('reload'),
  openBrowser: () => ipcRenderer.invoke('open-browser'),
  login: () => ipcRenderer.invoke('login'),
  chooseBackground: () => ipcRenderer.invoke('choose-background'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  logout: () => ipcRenderer.invoke('logout'),
  on: (channel, callback) => {
    if (!['settings', 'status', 'location', 'page', 'maximized', 'focus-search','playback','sidebar'].includes(channel)) return;
    const listener = (_, value) => callback(value);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
