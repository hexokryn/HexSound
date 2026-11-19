const path=require('node:path'),fs=require('node:fs');
const {createQueue}=require('./queue.cjs'),{createCollection}=require('./collection.cjs'),{createWave}=require('./wave.cjs'),{createLocal}=require('./local.cjs'),{createMediaBroker}=require('./media.cjs'),{createTransferJournal}=require('./transfers.cjs'),{track,recordingKey}=require('./tracks.cjs');
function createExperience({directory,services,library,send,handle,win,BrowserWindow,protocol,dialog,Visual,getSettings,getPlayback,openSource,activateNative,openPlayer,control}){
  let active=false,native=null,generation=0,playRequest=0,mini=null,miniLine='',lyricKey='',miniLines=[],closed=false;const plans=new Map();
  const collection=createCollection(path.join(directory,'collection.json'));
  const queue=createQueue(path.join(directory,'queue.json'),{onChange:value=>send('queue',value)});
  const local=createLocal(path.join(directory,'music'),{onProgress:value=>send('local-progress',value)});
  const media=createMediaBroker({local,fetchRemote:(url,init)=>services.fetchMedia(url,init)});
  protocol.handle('hexmedia',request=>media.handle(request));
  const wave=createWave(path.join(directory,'wave.json'),{getTracks:()=>library.tracks(),getStatuses:()=>services.statuses(),getAdapter:id=>services.getAdapter(id),getPreferences:collection.preferences,getHistory:()=>collection.history(),onChange:value=>send('wave',value)});
  const journal=createTransferJournal(path.join(directory,'transfers.json'),{getAdapter:id=>services.getAdapter(id),getAccount:id=>services.status(id)?.profile?.id||'',onChange:value=>send('transfer-jobs',value)});
  function updateLocal(){const provider=library.exportData().providers.local;library.importData({service:'local',tracks:[...(provider?.tracks||[]).filter(t=>!t.id.startsWith('local-')),...local.raw()],playlists:provider?.playlists||[]},{replace:true});}
  const decorate=t=>{const source=t.sources?.find(s=>s.service==='local');return source?{...t,artwork:t.artwork||media.cover(source.id)}:t;};
  async function play(value){const request=++playRequest,t=track(value),source=t.sources.find(s=>s.service==='local')||t.sources.find(s=>s.service==='soundcloud'&&services.status('soundcloud')?.connected)||t.sources[0];let src='',kind='',provider=source.service;
    if(provider==='local')src=media.file(source.id);
    else if(provider==='soundcloud'&&services.status('soundcloud')?.connected){const result=await services.resolveStream(source.id);if(result.preview)send('feature-notice','Сервис предоставил только превью трека.');src=media.remote(result.url,result.kind);kind=result.kind;}
    if(request!==playRequest)return false;if(src){active=true;native={...decorate(t),provider,url:source.url,generation:++generation};await activateNative();await win.webContents.executeJavaScript(`window.HexAudio.start(${JSON.stringify({src,kind,generation,track:native})})`,true);return true;}
    native=null;await win.webContents.executeJavaScript('window.HexAudio.control("stop")').catch(()=>{});await openSource(provider,source);active=true;return true;
  }
  async function playEntry(entry){const old=queue.snapshot().current;queue.jump(entry.id);try{return await play(entry.track);}catch(error){if(old&&queue.snapshot().entries.some(e=>e.id===old.id))queue.jump(old.id);throw error;}}
  async function advance(options){const old=queue.snapshot().current,next=queue.advance(options);if(!next)return false;try{return await play(next.track);}catch(error){if(old)queue.jump(old.id);throw error;}}
  async function playerControl(action,value){
    if(['next','previous'].includes(action)&&active&&queue.snapshot().entries.length){const current=queue.snapshot().current?.track;if(action==='next'&&current&&getPlayback().track.playing)collection.feedback(current,'skip');return advance({previous:action==='previous'});}
    if(['shuffle','repeat'].includes(action)&&queue.snapshot().entries.length){const q=queue.snapshot();queue.setMode(action==='shuffle'?{shuffle:!q.shuffle}:{repeat:{off:'all',all:'one',one:'off'}[q.repeat]});return true;}
    if(action==='like'&&active&&queue.snapshot().current){const t=queue.snapshot().current.track;collection.feedback(t,collection.preferences()[recordingKey(t)]?.action==='like'?'clear':'like');return true;}
    if(!native)return null;return win.webContents.executeJavaScript(`window.HexAudio.control(${JSON.stringify(action)},${JSON.stringify(value??null)})`,true);
  }
  async function snapshot(){if(!native)return null;const sample=await win.webContents.executeJavaScript('window.HexAudio.snapshot()');if(!native||sample.generation!==native.generation)return null;const q=queue.snapshot();return {sampledAt:Date.now(),profile:getPlayback().profile,track:{...native,available:true,position:sample.position,duration:sample.duration||native.duration,playing:sample.playing,volume:sample.volume,clockKnown:true,seekable:true,repeat:q.repeat,shuffle:q.shuffle,liked:collection.preferences()[recordingKey(native)]?.action==='like',controls:Object.fromEntries(['toggle','seek','volume','like','shuffle','repeat','next','previous'].map(k=>[k,true]))}};}
  function miniState(){const s=getSettings(),p=Visual.resolve(s,s.resolvedDark);return {tokens:Visual.tokens(s,p,'html:root'),dark:s.resolvedDark,motion:s.motion,playback:getPlayback(),line:miniLine,lines:miniLines};}
  async function openMini(){if(mini&&!mini.isDestroyed()){mini.show();return true;}mini=new BrowserWindow({width:350,height:440,minWidth:280,minHeight:190,frame:false,alwaysOnTop:true,show:false,backgroundColor:'#18181a',webPreferences:{preload:path.join(__dirname,'..','mini-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});mini.webContents.on('will-navigate',e=>e.preventDefault());mini.webContents.setWindowOpenHandler(()=>({action:'deny'}));mini.on('closed',()=>mini=null);await mini.loadFile(path.join(__dirname,'..','mini.html'));mini.show();return true;}
  const miniURL=require('node:url').pathToFileURL(path.join(__dirname,'..','mini.html')).href;
  const miniHandle=(name,fn)=>require('electron').ipcMain.handle(name,(e,...args)=>{if(e.sender!==mini?.webContents||e.senderFrame?.url!==miniURL)throw Error('Untrusted sender');return fn(...args);});
  miniHandle('mini-get',miniState);miniHandle('mini-control',action=>['toggle','next','previous'].includes(action)?control(action):false);miniHandle('mini-window',action=>{if(action==='close')mini.close();if(action==='expand'){win.show();win.focus();openPlayer();}if(action==='pin'){mini.setAlwaysOnTop(!mini.isAlwaysOnTop());return mini.isAlwaysOnTop();}return true;});
  handle('experience',async(action,input={})=>{
    if(!input||typeof input!=='object')throw Error('Некорректные параметры.');
    if(action==='snapshot')return {queue:queue.snapshot(),wave:wave.snapshot(),local:local.snapshot(),smart:collection.smart(),tags:collection.allTags(),history:collection.history(input),duplicates:library.duplicateGroups(),jobs:journal.snapshot()};
    if(action==='play'){const entries=queue.add([input.track],{next:true});await playEntry(entries[0]);openPlayer();return true;}
    if(action==='queue-selected'){if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>5000)throw Error('Выберите до 5000 треков.');const ids=new Set(input.ids),tracks=library.tracks().filter(t=>ids.has(t.id));if(tracks.length!==ids.size)throw Error('Обновите выбор треков.');return queue.add(tracks);}
    if(action==='queue-add')return queue.add(input.tracks,{next:input.next,origin:input.origin});
    if(action==='queue-play'){const entry=queue.snapshot().entries.find(e=>e.id===input.id);if(!entry)throw Error('Трека нет в очереди.');return playEntry(entry);}
    if(action==='queue-move')return queue.move(input.id,input.beforeId);
    if(action==='queue-remove')return queue.remove(input.id);
    if(action==='queue-clear')return queue.clear();
    if(action==='queue-mode')return queue.setMode(input);
    if(action==='wave-generate')return wave.generate(input);
    if(action==='wave-cancel'){wave.cancel();return true;}
    if(action==='wave-play'){const items=wave.snapshot().items;if(!items.length)throw Error('Сначала соберите волну.');queue.clear();queue.add(items,{origin:'wave'});await advance({});return true;}
    if(action==='feedback'){collection.feedback(track(input.track),input.action);if(['skip','dislike'].includes(input.action)){wave.remove(recordingKey(input.track));if(input.advance)await advance({});}return true;}
    if(action==='tags-get')return collection.tags(input.id);
    if(action==='tags-set')return collection.setTags(input.id,input.tags);
    if(action==='smart-preview')return collection.evaluate(library.tracks(),input.rules).slice(0,500).map(decorate);
    if(action==='smart-save')return collection.saveSmart(input);
    if(action==='smart-remove'){collection.removeSmart(input.id);return true;}
    if(action==='merge'){const result=library.mergeTracks(input.ids);send('library-updated');return result;}
    if(action==='split'){const result=library.splitTrack(input.id);send('library-updated');return result;}
    if(action==='history-clear'){collection.clearHistory();return true;}
    if(action==='local-cancel'){local.cancel();return true;}
    if(action==='local-remove'){local.removeFolder(input.id);updateLocal();send('library-updated');return local.snapshot();}
    if(action==='local-add'){const chosen=await dialog.showOpenDialog(win,{title:'Папка с музыкой',properties:['openDirectory']});if(chosen.canceled)return null;const result=await local.scan(chosen.filePaths[0]);updateLocal();send('library-updated');return result;}
    if(action==='mini')return openMini();
    if(action==='transfer-report'){const chosen=await dialog.showSaveDialog(win,{title:'Отчёт о переносе',defaultPath:'HexSound-transfer.json',filters:[{name:'JSON',extensions:['json']}]});if(chosen.canceled)return false;fs.writeFileSync(chosen.filePath,JSON.stringify(journal.report(input.id),null,2));return true;}
    throw Error('Неизвестное действие.');
  });
  handle('audio-event',async event=>{if(!event||event.generation!==native?.generation)return false;if(event.type==='ended')try{await advance({ended:true});}catch(error){send('feature-notice',String(error.message).slice(0,250));return false;}if(event.type==='error')send('feature-notice','Не удалось воспроизвести поток. Проверьте доступность трека или откройте его в сервисе.');return true;});
  return {async stopNative(){playRequest++;active=false;native=null;await win.webContents.executeJavaScript('window.HexAudio?.control("stop")').catch(()=>{});},snapshot,playerControl,decorate,plans,journal,queue,collection,local,wave,play,openMini,async tick(p,lyricsService){const current=active?queue.snapshot().current?.track:null;collection.record(p,current&&recordingKey(current)===recordingKey(p.track)?current:undefined);if(!mini||mini.isDestroyed())return;const t=p.track,key=[t.url,t.title,t.artist,Math.round(t.duration||0)].join('|');if(key!==lyricKey){lyricKey=key;miniLines=[];miniLine='';lyricsService.lookup(t,getSettings().lyricsOnline).then(result=>{if(lyricKey===key)miniLines=result.lines||[];}).catch(()=>{});}miniLine='';if(t.clockKnown!==false)for(const line of miniLines){if(line.time<=t.position)miniLine=line.text;else break;}mini.webContents.send('mini-state',miniState());},dispose(){if(closed)return;closed=true;collection.flush();wave.cancel();local.cancel();if(mini&&!mini.isDestroyed())mini.destroy();media.clear();}};
}
module.exports={createExperience};
