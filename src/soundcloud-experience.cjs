const path=require('node:path'),fs=require('node:fs');
const {createQueue}=require('./features/queue.cjs');
const {createCollection}=require('./features/collection.cjs');
const {createWave}=require('./features/wave.cjs');
const {createTransferJournal}=require('./features/transfers.cjs');
const {track,recordingKey}=require('./features/tracks.cjs');

function createExperience({directory,services,library,send,handle,dialog,win,getPlayback,openSource,webDiscovery,ensureLibrary,control=async()=>false}){
 let active=false,closed=false,radio=false,preparing=false,epoch=0,refilling=null,nextRefillAt=0;const plans=new Map();
 const prefStore=require('./features/store.cjs').createStore(path.join(directory,'wave-preferences.json'),{schema:1,novelty:'balanced',mood:'any'});
 const valid=raw=>({novelty:['balanced','familiar','discover'].includes(raw?.novelty)?raw.novelty:'balanced',mood:['any','calm','energy','focus'].includes(raw?.mood)?raw.mood:'any'});let preferences=valid(prefStore.read());
 const state=()=>({...wave.snapshot(),preferences,active:radio,preparing,current:radio?queue.current()?.track:null,playing:radio&&!!getPlayback().track?.playing});
 const emit=()=>send('wave',state());
 async function refill(recycle=false){if(refilling)return refilling;const revision=epoch;nextRefillAt=Date.now()+60000;refilling=(async()=>{const result=await wave.generate({...preferences,service:'soundcloud'});if(closed||revision!==epoch||!radio)return;let q=queue.snapshot(),keys=new Set(q.entries.map(e=>recordingKey(e.track))),added=result.items.filter(t=>!keys.has(recordingKey(t)));if(!added.length&&recycle&&preferences.novelty!=='discover'){queue.clear();added=result.items;}if(added.length)queue.add(added,{origin:'wave'});})().finally(()=>{refilling=null;emit();});return refilling;}

 const collection=createCollection(path.join(directory,'collection.json'));
 const queue=createQueue(path.join(directory,'wave-queue.json'),{onChange:value=>send('queue',value)});
 const tracks=()=>library.tracks().filter(t=>t.sources.some(s=>s.service==='soundcloud'));
 const wave=createWave(path.join(directory,'soundcloud-wave.json'),{getTracks:tracks,getStatuses:()=>[{id:'soundcloud',connected:false,webOnly:true,capabilities:{search:true}}],getAdapter:()=>({searchTracks:args=>webDiscovery.searchTracks(args),relatedTracks:({trackId,signal})=>{const source=tracks().flatMap(t=>t.sources).find(s=>s.id===trackId);return source?.url?webDiscovery.relatedTracks({url:source.url,signal}):[];}}),libraryFallback:true,getPreferences:collection.preferences,getHistory:()=>collection.history(),onChange:()=>emit()});
 const journal=createTransferJournal(path.join(directory,'transfers.json'),{getAdapter:id=>services.getAdapter(id),getAccount:id=>services.status(id)?.profile?.id||'',onChange:value=>send('transfer-jobs',value)});
 async function play(value){const t=track(value),source=t.sources.find(s=>s.service==='soundcloud');if(!source?.url)throw Error('У трека нет ссылки SoundCloud.');active=false;const ok=await openSource('soundcloud',{...source,play:true});active=ok===true;return active;}
 async function playEntry(entry){send('playback-pending',{entryId:entry.id,track:entry.track});const previous=queue.current();queue.jump(entry.id);try{return await play(entry.track);}catch(error){if(previous)queue.jump(previous.id);throw error;}finally{send('playback-pending',{entryId:entry.id,track:null});}}
 async function advance(options={}){const previous=queue.current();let next=queue.advance(options);if(!next&&radio){if(refilling)await refilling;next=queue.advance(options);if(!next){await refill(true);next=queue.advance(options);}}if(!next){active=false;radio=false;emit();return false;}try{const result=await playEntry(next);queue.trim();emit();return result;}catch(error){if(previous)queue.jump(previous.id);throw error;}}
 async function ensure(){if(!tracks().length)await ensureLibrary?.();}
 handle('experience',async(action,input={})=>{
  if(!input||typeof input!=='object')throw Error('Некорректные параметры.');
  if(action==='snapshot')return{wave:state(),queue:queue.snapshot(),jobs:journal.snapshot()};
  if(action==='play'){const entries=queue.add([input.track],{next:true,origin:'wave'});return playEntry(entries[0]);}
  if(action==='wave-settings'){preferences=valid(input);prefStore.write({schema:1,...preferences});epoch++;preparing=false;wave.cancel();if(refilling)await refilling.catch(()=>{});queue.truncate();emit();if(radio)refill().catch(e=>send('feature-notice',e.message));return state();}
  if(action==='wave-stop'||action==='wave-cancel'){epoch++;radio=false;active=false;preparing=false;wave.cancel();emit();if(getPlayback().track?.playing)await control('toggle');return true;}
  if(action==='wave-toggle'&&radio)return control('toggle');
  if(action==='wave-generate'){await ensure();return wave.generate({...preferences,service:'soundcloud'});}
  if(action==='wave-play'||action==='wave-toggle'){if(preparing)return state();const revision=++epoch;preparing=true;emit();try{await ensure();if(revision!==epoch||closed)return false;if(refilling)await refilling.catch(()=>{});radio=true;queue.clear();const items=preferences.novelty==='discover'||preferences.mood!=='any'?(await wave.generate({...preferences,service:'soundcloud'})).items:wave.prime().items;if(revision!==epoch||closed){radio=false;return false;}queue.add(items,{origin:'wave'});await advance();if(!wave.snapshot().busy)refill().catch(e=>{if(revision===epoch)send('feature-notice',e.message);});return true;}catch(e){radio=false;throw e;}finally{if(revision===epoch)preparing=false;emit();}}
  if(action==='feedback'){collection.feedback(track(input.track),input.action);if(['dislike','skip'].includes(input.action)){wave.remove(recordingKey(input.track));for(const entry of queue.snapshot().entries)if(entry.id!==queue.current()?.id&&recordingKey(entry.track)===recordingKey(input.track))queue.remove(entry.id);if(input.advance&&radio)await advance();}emit();return true;}
  if(action==='queue-play'){const entry=queue.snapshot().entries.find(e=>e.id===input.id);if(!entry)throw Error('Трека нет в очереди.');return playEntry(entry);}
  if(action==='transfer-report'){const chosen=await dialog.showSaveDialog(win,{defaultPath:'HexSound-transfer.json',filters:[{name:'JSON',extensions:['json']}]});if(chosen.canceled)return false;fs.writeFileSync(chosen.filePath,JSON.stringify(journal.report(input.id),null,2));return true;}
  throw Error('Неизвестное действие.');
 });
 return{plans,journal,wave,queue,decorate:t=>t,queuedControls:()=>active&&!!queue.current(),stopNative:async()=>{active=false;radio=false;preparing=false;epoch++;wave.cancel();emit();},remoteEnded:()=>active?advance({ended:true}):false,
 async playerControl(action){if(active&&['next','previous'].includes(action)){if(action==='next'&&queue.current())collection.feedback(queue.current().track,'skip');return advance({previous:action==='previous'});}return null;},
 async tick(p){collection.record(p);const source=queue.current()?.track.sources.find(s=>s.service==='soundcloud');if(active&&p.track.available&&source?.url&&new URL(p.track.url).pathname!==new URL(source.url).pathname){active=false;radio=false;}if(active&&radio){const q=queue.snapshot();if(q.entries.length-q.cursor<=4&&!refilling&&!wave.snapshot().busy&&Date.now()>=nextRefillAt)refill().catch(()=>{});}emit();},
 dispose(){if(closed)return;closed=true;epoch++;radio=false;collection.flush();wave.cancel();}};
}
module.exports={createExperience};
