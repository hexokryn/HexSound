const path=require('node:path'),fs=require('node:fs');
const {createQueue}=require('./features/queue.cjs');
const {createCollection}=require('./features/collection.cjs');
const {createWave}=require('./features/wave.cjs');
const {createTransferJournal}=require('./features/transfers.cjs');
const {track,recordingKey}=require('./features/tracks.cjs');

function createExperience({directory,services,library,send,handle,dialog,win,getPlayback,openSource,webDiscovery,ensureLibrary}){
 let active=false,closed=false;const plans=new Map();
 const collection=createCollection(path.join(directory,'collection.json'));
 const queue=createQueue(path.join(directory,'wave-queue.json'),{onChange:value=>send('queue',value)});
 const tracks=()=>library.tracks().filter(t=>t.sources.some(s=>s.service==='soundcloud'));
 const wave=createWave(path.join(directory,'soundcloud-wave.json'),{getTracks:tracks,getStatuses:()=>[{id:'soundcloud',connected:false,webOnly:true,capabilities:{search:true}}],getAdapter:()=>({searchTracks:args=>webDiscovery.searchTracks(args),relatedTracks:({trackId,signal})=>{const source=tracks().flatMap(t=>t.sources).find(s=>s.id===trackId);return source?.url?webDiscovery.relatedTracks({url:source.url,signal}):[];}}),libraryFallback:true,getPreferences:collection.preferences,getHistory:()=>collection.history(),onChange:value=>send('wave',value)});
 const journal=createTransferJournal(path.join(directory,'transfers.json'),{getAdapter:id=>services.getAdapter(id),getAccount:id=>services.status(id)?.profile?.id||'',onChange:value=>send('transfer-jobs',value)});
 async function play(value){const t=track(value),source=t.sources.find(s=>s.service==='soundcloud');if(!source?.url)throw Error('У трека нет ссылки SoundCloud.');active=false;const ok=await openSource('soundcloud',{...source,play:true});active=ok===true;return active;}
 async function playEntry(entry){send('playback-pending',{entryId:entry.id,track:entry.track});const previous=queue.current();queue.jump(entry.id);try{return await play(entry.track);}catch(error){if(previous)queue.jump(previous.id);throw error;}finally{send('playback-pending',{entryId:entry.id,track:null});}}
 async function advance(options={}){const previous=queue.current(),next=queue.advance(options);if(!next){active=false;return false;}try{return await playEntry(next);}catch(error){if(previous)queue.jump(previous.id);throw error;}}
 async function ensure(){if(!tracks().length)await ensureLibrary?.();}
 handle('experience',async(action,input={})=>{
  if(!input||typeof input!=='object')throw Error('Некорректные параметры.');
  if(action==='snapshot')return{wave:wave.snapshot(),queue:queue.snapshot(),jobs:journal.snapshot()};
  if(action==='play'){const entries=queue.add([input.track],{next:true,origin:'wave'});return playEntry(entries[0]);}
  if(action==='wave-generate'){await ensure();return wave.generate({...input,service:'soundcloud'});}
  if(action==='wave-cancel'){wave.cancel();return true;}
  if(action==='wave-play'){await ensure();const cached=wave.snapshot().items.length,items=cached?wave.snapshot().items:wave.prime().items;queue.clear();queue.add(items,{origin:'wave'});if(!cached)wave.generate({service:'soundcloud'}).then(result=>{if(closed||queue.current()?.origin!=='wave')return;const known=new Set(queue.snapshot().entries.map(e=>recordingKey(e.track)));queue.add(result.items.filter(t=>!known.has(recordingKey(t))),{origin:'wave'});}).catch(e=>send('feature-notice',e.message));return advance();}
  if(action==='feedback'){collection.feedback(track(input.track),input.action);if(input.action==='dislike')wave.remove(recordingKey(input.track));return true;}
  if(action==='queue-play'){const entry=queue.snapshot().entries.find(e=>e.id===input.id);if(!entry)throw Error('Трека нет в очереди.');return playEntry(entry);}
  if(action==='transfer-report'){const chosen=await dialog.showSaveDialog(win,{defaultPath:'HexSound-transfer.json',filters:[{name:'JSON',extensions:['json']}]});if(chosen.canceled)return false;fs.writeFileSync(chosen.filePath,JSON.stringify(journal.report(input.id),null,2));return true;}
  throw Error('Неизвестное действие.');
 });
 return{plans,journal,wave,queue,decorate:t=>t,queuedControls:()=>active&&!!queue.current(),stopNative:async()=>{active=false;},remoteEnded:()=>active?advance({ended:true}):false,
 async playerControl(action){if(active&&['next','previous'].includes(action))return advance({previous:action==='previous'});return null;},
 async tick(p){collection.record(p);const source=queue.current()?.track.sources.find(s=>s.service==='soundcloud');if(active&&p.track.available&&source?.url&&p.track.url!==source.url)active=false;},
 dispose(){if(closed)return;closed=true;collection.flush();wave.cancel();}};
}
module.exports={createExperience};
