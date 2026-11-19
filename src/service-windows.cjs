const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'web-player.js'),'utf8');
const providers=Object.freeze({
  spotify:{name:'Spotify',home:'https://open.spotify.com',login:'https://accounts.spotify.com/login',hosts:['open.spotify.com','accounts.spotify.com']},
  soundcloud:{name:'SoundCloud',home:'https://soundcloud.com/discover',login:'https://soundcloud.com/signin',hosts:['soundcloud.com','secure.soundcloud.com']},
  youtube:{name:'YouTube Music',home:'https://music.youtube.com',login:'https://music.youtube.com',hosts:['music.youtube.com','www.youtube.com','accounts.google.com','consent.youtube.com','consent.google.com']},
  yandex:{name:'Яндекс Музыка',home:'https://music.yandex.ru',login:'https://music.yandex.ru',hosts:['music.yandex.ru','music.yandex.com','passport.yandex.ru','passport.yandex.com','id.yandex.ru','id.yandex.com','oauth.yandex.ru']}
});
const authHosts=['accounts.google.com','appleid.apple.com','www.facebook.com','m.facebook.com'];
function allowed(service,value,auth=false){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!!providers[service]&&(providers[service].hosts.includes(u.hostname)||(auth&&authHosts.includes(u.hostname)));}catch{return false;}}
function createServiceWindows({BrowserWindow,parent,onActive=()=>{},onChange=()=>{},onExternal=()=>{},isQuitting=()=>false}){
  const windows=new Map(),children=new Set();
  function protect(contents,id){
    const guard=(event,url)=>{if(!allowed(id,url,true)){event.preventDefault();if(/^https?:\/\//i.test(url))onExternal(url);}};
    contents.on('will-navigate',guard);contents.on('will-redirect',guard);contents.on('will-attach-webview',event=>event.preventDefault());
    contents.setWindowOpenHandler(({url})=>{if(url==='about:blank'||allowed(id,url,true))return{action:'allow',overrideBrowserWindowOptions:{parent:windows.get(id),width:540,height:740,autoHideMenuBar:true,webPreferences:{partition:'persist:hexsound-'+id,nodeIntegration:false,contextIsolation:true,sandbox:true}}};onExternal(url);return{action:'deny'};});
    contents.on('did-create-window',child=>{children.add(child);child.on('closed',()=>children.delete(child));protect(child.webContents,id);child.setMenuBarVisibility(false);});
    contents.on('dom-ready',()=>{if(allowed(id,contents.getURL()))contents.executeJavaScript(source).catch(()=>{});});
  }
  async function open(id,{url,login=false}={}){
    const p=providers[id];if(!p)throw Error('Неизвестный сервис.');
    const target=url||(login?p.login:p.home);if(!allowed(id,target))throw Error('Недопустимая страница сервиса.');
    let win=windows.get(id);
    if(!win||win.isDestroyed()){
      win=new BrowserWindow({parent,width:1200,height:820,minWidth:480,minHeight:520,title:p.name+' · HexSound',autoHideMenuBar:true,show:false,webPreferences:{partition:'persist:hexsound-'+id,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
      windows.set(id,win);protect(win.webContents,id);
      win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));win.webContents.session.setPermissionCheckHandler(()=>false);
      win.on('focus',()=>onActive(id));win.on('closed',()=>{windows.delete(id);onChange();});
      win.on('close',event=>{if(!isQuitting()){event.preventDefault();win.hide();}});
    }
    win.show();onActive(id);onChange();
    if(url||!win.webContents.getURL()||login)await win.loadURL(target).catch(()=>{});
    return {service:id,opened:true};
  }
  async function snapshot(id){const win=windows.get(id);if(!win||win.isDestroyed()||!allowed(id,win.webContents.getURL()))return null;return win.webContents.executeJavaScript(source+`;window.HexWebPlayer.snapshot(${JSON.stringify(id)})`).catch(()=>null);}
  async function control(id,action,value){const win=windows.get(id);if(!win||win.isDestroyed()||!allowed(id,win.webContents.getURL()))return false;return win.webContents.executeJavaScript(source+`;window.HexWebPlayer.control(${JSON.stringify(action)},${JSON.stringify(value??null)})`,true).catch(()=>false);}
  function close(){for(const win of children)if(!win.isDestroyed())win.destroy();children.clear();for(const win of windows.values())if(!win.isDestroyed())win.destroy();windows.clear();}
  return {open,snapshot,control,close,status:()=>[...windows.keys()].map(service=>({service,webSession:true})),currentURL:id=>windows.get(id)?.webContents.getURL()||providers[id]?.home||''};
}
module.exports={createServiceWindows,providers,allowed};
