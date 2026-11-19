'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {SERVICES,clean,normalize,pageURL,normalizeTrack,sourceKey,buildIndex,scoreMatch}=require('./model.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
class LibraryError extends Error{constructor(code,message){super(message||code);this.name='LibraryError';this.code=code;}}
const aborted=()=>new LibraryError('cancelled','Операция отменена.');
function check(signal){if(signal?.aborted)throw aborted();}
function wait(ms,signal){check(signal);return new Promise((resolve,reject)=>{const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);},cancel=()=>{done();reject(aborted());},timer=setTimeout(()=>{done();resolve();},ms);signal?.addEventListener('abort',cancel,{once:true});});}
function createLibrary(file,{getAdapter,now=Date.now,maxTracks=50000,searchConcurrency=3,readRetries=1,requestTimeout=45000}={}){
  if(typeof getAdapter!=='function')throw new TypeError('getAdapter is required');
  const allowed=new Set(SERVICES),plans=new Map(),syncing=new Set(),errors={};let active=null,planning=null,warning='';
  let state={schema:1,providers:{},links:{},decisions:{merges:[],splits:[]},updatedAt:0},index={tracks:[],playlists:[],links:{}};
  const storedVersion=value=>typeof value==='string'?clean(value,1000):typeof value==='number'&&Number.isFinite(value)?value:undefined;
  function normalizeProvider(raw,service,{verified=false,preserveVerified=false,connectionVersion}={}){
    const map=new Map(),playlistMap=new Map(),previous=new Map((state.providers[service]?.tracks||[]).map(t=>[t.id,t]));
    if(!raw||typeof raw!=='object')throw new LibraryError('invalid_import');
    if(!Array.isArray(raw.tracks)||raw.tracks.length>maxTracks)throw new LibraryError('library_limit','Слишком большая библиотека.');
    for(const item of raw.tracks){const track=normalizeTrack(item,service);if(track)map.set(track.id,{...track,addedAt:track.addedAt||previous.get(track.id)?.addedAt||now(),verified:verified||preserveVerified&&item.verified===true,verifiedFor:storedVersion(verified?connectionVersion:preserveVerified&&item.verified===true?item.verifiedFor:undefined)});}
    if(Array.isArray(raw.playlists)&&raw.playlists.length>10000)throw new LibraryError('library_limit');
    let references=0;
    for(const rawPlaylist of (Array.isArray(raw.playlists)?raw.playlists:[])){
      const id=clean(String(rawPlaylist.id??''),500),title=clean(rawPlaylist.title||rawPlaylist.name,200);if(!id||!title)continue;
      const trackIds=[];
      if(Array.isArray(rawPlaylist.tracks)&&rawPlaylist.tracks.length>maxTracks||Array.isArray(rawPlaylist.trackIds)&&rawPlaylist.trackIds.length>maxTracks)throw new LibraryError('library_limit');
      if(Array.isArray(rawPlaylist.tracks))for(const item of rawPlaylist.tracks){const track=normalizeTrack(item,service);if(track){map.set(track.id,{...track,addedAt:track.addedAt||previous.get(track.id)?.addedAt||now(),verified:verified||preserveVerified&&item.verified===true,verifiedFor:storedVersion(verified?connectionVersion:preserveVerified&&item.verified===true?item.verifiedFor:undefined)});trackIds.push(track.id);}}
      if(Array.isArray(rawPlaylist.trackIds))for(const value of rawPlaylist.trackIds){const id=typeof value==='number'?String(value):clean(value,500);if(id)trackIds.push(id);}
      references+=trackIds.length;if(references>maxTracks*4||map.size>maxTracks)throw new LibraryError('library_limit');
      playlistMap.set(id,{id,title,url:pageURL(rawPlaylist.url),trackIds,trackCount:Number.isSafeInteger(rawPlaylist.trackCount)&&rawPlaylist.trackCount>=0?rawPlaylist.trackCount:trackIds.length});
    }
    if(map.size>maxTracks)throw new LibraryError('library_limit');
    return {tracks:[...map.values()],playlists:[...playlistMap.values()],syncedAt:typeof raw.syncedAt==='number'?raw.syncedAt:now(),partial:raw.complete===false||raw.partial===true};
  }
  function loaded(raw){
    if(!raw||raw.schema!==1||!raw.providers||typeof raw.providers!=='object')throw Error('Unsupported library');
    const providers={};for(const service of SERVICES)if(Object.hasOwn(raw.providers,service))providers[service]=normalizeProvider(raw.providers[service],service,{preserveVerified:true});
    const decisions={merges:Array.isArray(raw.decisions?.merges)?raw.decisions.merges.filter(g=>Array.isArray(g)&&g.length<=200&&g.every(k=>typeof k==='string'&&k.length<1000)).slice(0,1000):[],splits:Array.isArray(raw.decisions?.splits)?raw.decisions.splits.filter(g=>Array.isArray(g)&&g.length===2&&g.every(k=>typeof k==='string'&&k.length<1000)).slice(0,10000):[]};const rebuilt=buildIndex(providers,raw.links||{},decisions);
    return {schema:1,providers,links:rebuilt.links,decisions,updatedAt:typeof raw.updatedAt==='number'?raw.updatedAt:0};
  }
  function read(name){if(fs.statSync(name).size>64*1024*1024)throw Error('File too large');return loaded(JSON.parse(fs.readFileSync(name,'utf8')));}
  try{state=read(file);}catch(error){if(error.code!=='ENOENT'){warning='library_recovered';try{state=read(file+'.bak');}catch{warning='library_file_invalid';}}}
  index=buildIndex(state.providers,state.links,state.decisions);
  function commit(providers,decisions=state.decisions){
    const rebuilt=buildIndex(providers,state.links,decisions),next={schema:1,providers,links:rebuilt.links,decisions,updatedAt:now()},temp=file+'.tmp-'+crypto.randomBytes(5).toString('hex');
    fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    try{fs.writeFileSync(temp,JSON.stringify(next),{mode:0o600});fs.writeFileSync(file+'.bak',JSON.stringify(state),{mode:0o600});fs.renameSync(temp,file);}catch(error){try{fs.unlinkSync(temp);}catch{}throw error;}
    state=next;index=rebuilt;warning='';
  }
  function snapshot({query='',service='',playlistId='',offset=0,limit=100}={}){
    const text=normalize(clean(query,300));let tracks=index.tracks;
    if(service)tracks=tracks.filter(t=>t.sources.some(s=>s.service===service));
    if(playlistId){const list=index.playlists.find(p=>p.id===playlistId);const ids=new Set(list?.trackIds||[]);tracks=tracks.filter(t=>ids.has(t.id));}
    if(text)tracks=tracks.filter(t=>normalize([t.title,t.artist,t.album].join(' ')).includes(text));
    const total=tracks.length,start=Number.isSafeInteger(offset)?Math.max(0,offset):0,size=Number.isSafeInteger(limit)?Math.max(1,Math.min(500,limit)):100;
    const providers={};for(const [id,p] of Object.entries(state.providers))providers[id]={syncedAt:p.syncedAt,partial:p.partial,tracks:p.tracks.length,playlists:p.playlists.length,error:errors[id]||'',syncing:syncing.has(id)};
    return copy({schema:1,tracks:tracks.slice(start,start+size),playlists:index.playlists,total,offset:start,limit:size,stats:{tracks:index.tracks.length,playlists:index.playlists.length,sources:Object.values(state.providers).reduce((n,p)=>n+p.tracks.length,0)},providers,updatedAt:state.updatedAt,storageWarning:warning});
  }
  function adapter(service,capabilities){
    if(!allowed.has(service)||service==='local')throw new LibraryError('unsupported_service');
    const a=getAdapter(service);for(const capability of capabilities)if(!a?.capabilities?.[capability])throw new LibraryError('unsupported_operation','Сервис не поддерживает эту операцию через API.');return a;
  }
  function checkConnection(a,version){if(a?.connectionVersion!==version)throw new LibraryError('connection_changed','Подключение изменилось. Найдите совпадения снова.');}
  async function request(operation,signal,{retry=true,timeout=requestTimeout}={}){
    for(let attempt=0;;attempt++){
      check(signal);const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,timeout);signal?.addEventListener('abort',abort,{once:true});
      let onAbort;const stopped=new Promise((_,reject)=>{onAbort=()=>reject(signal?.aborted?aborted():new LibraryError('request_timeout'));controller.signal.addEventListener('abort',onAbort,{once:true});});
      try{return await Promise.race([Promise.resolve().then(()=>operation(controller.signal)),stopped]);}
      catch(error){if(signal?.aborted)throw aborted();if(!retry||attempt>=readRetries||![429,503].includes(error.status))throw error;await wait(Math.max(100,Math.min(10000,Number(error.retryAfterMs)||300*(attempt+1))),signal);}
      finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',onAbort);}
    }
  }
  function mergeProvider(old,next,replace){
    if(!old||replace)return next;
    const lists=new Map(old.playlists.map(p=>[p.id,p]));
    for(const p of next.playlists){const previous=lists.get(p.id);if(!previous){lists.set(p.id,p);continue;}const trackIds=[...new Set([...previous.trackIds,...p.trackIds])];lists.set(p.id,{...p,trackIds,trackCount:Math.max(previous.trackCount,p.trackCount,trackIds.length)});}
    const merged={...next,tracks:[...new Map([...old.tracks,...next.tracks].map(t=>[t.id,t])).values()],playlists:[...lists.values()]};
    if(merged.tracks.length>maxTracks||merged.playlists.length>10000||merged.playlists.reduce((n,p)=>n+p.trackIds.length,0)>maxTracks*4)throw new LibraryError('library_limit');return merged;
  }
  async function sync(service,{signal}={}){
    if(syncing.has(service))throw new LibraryError('sync_in_progress');const a=adapter(service,['libraryRead']),connectionVersion=a.connectionVersion;syncing.add(service);delete errors[service];
    try{const raw=await request(s=>a.listLibrary({signal:s}),signal);check(signal);checkConnection(a,connectionVersion);const normalized=normalizeProvider({...raw,tracks:raw?.tracks||[],complete:raw?.complete===true},service,{verified:true,connectionVersion});commit({...state.providers,[service]:mergeProvider(state.providers[service],normalized,raw?.complete===true)});syncing.delete(service);return snapshot();}
    catch(error){errors[service]=clean(error.code,60)||'sync_failed';throw error;}finally{syncing.delete(service);}
  }
  function importData(document,{replace=false}={}){
    if(!document||typeof document!=='object')throw new LibraryError('invalid_import');let incoming={};
    if(document.providers&&document.schema===1){for(const service of SERVICES)if(Object.hasOwn(document.providers,service))incoming[service]=normalizeProvider(document.providers[service],service);}
    else{
      const service=SERVICES.includes(document.service)?document.service:'local';
      incoming[service]=normalizeProvider({tracks:document.tracks,playlists:document.playlists,complete:false},service);
    }
    if(!Object.keys(incoming).length)throw new LibraryError('invalid_import');const providers={...state.providers};
    for(const [service,p] of Object.entries(incoming))providers[service]=mergeProvider(providers[service],p,replace===true);
    const decisions=document.decisions?loaded({...document,providers:{}}).decisions:state.decisions;commit(providers,decisions);return snapshot();
  }
  function duplicateGroups(){const groups=new Map();for(const t of index.tracks){const key=normalize(t.artist)+'|'+normalize(t.title.replace(/\s*[([{].*?[)\]}]/g,''));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}return copy({merged:index.tracks.filter(t=>t.sources.length>1).slice(0,100),candidates:[...groups.values()].filter(g=>g.length>1&&g.length<=12).slice(0,100)});}
  function mergeTracks(ids){if(!Array.isArray(ids)||ids.length<2||ids.length>12)throw new LibraryError('invalid_selection','Выберите от 2 до 12 записей.');const selected=ids.map(id=>index.tracks.find(t=>t.id===id));if(selected.some(t=>!t))throw new LibraryError('track_not_found');const keys=[...new Set(selected.flatMap(t=>t.sources.map(sourceKey)))];if(keys.length>200)throw new LibraryError('library_limit');const set=new Set(keys);const decisions={merges:[...(state.decisions?.merges||[]).filter(g=>!g.every(k=>set.has(k))),keys].slice(-1000),splits:(state.decisions?.splits||[]).filter(p=>!p.every(k=>set.has(k)))};commit(state.providers,decisions);return snapshot();}
  function splitTrack(id){const t=index.tracks.find(t=>t.id===id);if(!t||t.sources.length<2)return snapshot();const keys=t.sources.map(sourceKey);if(keys.length>100)throw new LibraryError('library_limit','Слишком много источников для одного разделения.');const set=new Set(keys),pairs=[];for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++)pairs.push([keys[i],keys[j]]);const decisions={merges:(state.decisions?.merges||[]).map(g=>g.filter(k=>!set.has(k))).filter(g=>g.length>1),splits:[...(state.decisions?.splits||[]),...pairs].slice(-10000)};commit(state.providers,decisions);return snapshot();}
  function exportData(){return copy(state);}
  async function planTransfer({targetService,playlistId,trackIds,name}={}, {signal}={}){
    if(active||planning)throw new LibraryError('transfer_in_progress');
    const a=adapter(targetService,['search','playlistCreate','playlistAdd']),connectionVersion=a.connectionVersion;let sources,sourceUnavailable=0,sourceDuplicates=0,sourcePlaylist=null;
    if(playlistId){const p=index.playlists.find(p=>p.id===playlistId);if(!p)throw new LibraryError('playlist_not_found');const byId=new Map(index.tracks.map(t=>[t.id,t]));sources=p.trackIds.map(id=>byId.get(id)).filter(Boolean);name=name||p.title;sourceUnavailable=p.unavailableTrackCount;sourceDuplicates=p.duplicateTrackCount;sourcePlaylist={id:p.id,title:p.title,trackCount:p.trackCount};}
    else{if(!Array.isArray(trackIds)||!trackIds.length||trackIds.length>5000)throw new LibraryError('invalid_selection');const ids=new Set(trackIds);sources=index.tracks.filter(t=>ids.has(t.id));if(sources.length!==ids.size)throw new LibraryError('track_not_found');}
    if(!sources.length||sources.length>5000)throw new LibraryError('invalid_selection');
    const external=signal,controller=new AbortController(),abort=()=>controller.abort();external?.addEventListener('abort',abort,{once:true});if(external?.aborted)controller.abort();signal=controller.signal;planning={controller};
    try{
    const items=new Array(sources.length);let cursor=0,fatal='';
    async function worker(){while(cursor<sources.length){check(signal);checkConnection(a,connectionVersion);const i=cursor++,source=sources[i],own=source.sources.find(s=>s.service===targetService&&s.verified&&s.verifiedFor===connectionVersion);let candidates=[];
      if(fatal&&!own){items[i]={sourceId:source.id,source:copy(source),status:'unavailable',selectedId:'',candidates:[],error:fatal};continue;}
      try{
        if(own)candidates=[{...own,score:1,reason:'same_service'}];
        else{
          const raw=await request(s=>a.searchTracks({query:source.title+' '+source.artist,title:source.title,artist:source.artist,duration:source.duration,signal:s}),signal);
          checkConnection(a,connectionVersion);const found=Array.isArray(raw)?raw:raw?.tracks||[];
          const dedup=new Map();for(const value of found.slice(0,40)){const t=normalizeTrack(value,targetService);if(!t)continue;const score=scoreMatch({...source,isrc:source.sources.find(s=>s.isrc)?.isrc||''},t);if(score.score>=.55)dedup.set(t.id,{...t,...score});}
          candidates=[...dedup.values()].sort((x,y)=>y.score-x.score||x.id.localeCompare(y.id)).slice(0,6);
        }
        const matched=candidates[0]?.score>=.92&&(!candidates[1]||candidates[0].score-candidates[1].score>=.08);
        items[i]={sourceId:source.id,source:copy(source),status:matched?'matched':candidates.length?'ambiguous':'unmatched',selectedId:matched?candidates[0].id:'',candidates};
      }catch(error){if(signal?.aborted||error.code==='cancelled')throw aborted();if(error.code==='connection_changed')throw error;const code=clean(error.code,60)||'search_failed';if([401,403,429].includes(error.status)||['AUTH_REQUIRED','AUTH_EXPIRED','AUTH_CANCELLED','CONFIG_REQUIRED','ACCESS_DENIED','RATE_LIMITED','UNSUPPORTED_API','NETWORK','TIMEOUT','request_timeout'].includes(code))fatal=code;items[i]={sourceId:source.id,source:copy(source),status:'unavailable',selectedId:'',candidates:[],error:code};}
    }}
    await Promise.all(Array.from({length:Math.min(Math.max(1,searchConcurrency),sources.length)},worker));check(signal);checkConnection(a,connectionVersion);
    const plan={id:crypto.randomBytes(16).toString('hex'),targetService,connectionVersion,name:clean(name,200)||'HexSound · Library',createdAt:now(),items,total:sources.length+sourceUnavailable+sourceDuplicates,sourceUnavailable,sourceDuplicates,sourcePlaylist,counts:{matched:0,ambiguous:0,unmatched:0,unavailable:sourceUnavailable}};
    for(const item of items)plan.counts[item.status]++;plans.set(plan.id,plan);while(plans.size>10)plans.delete(plans.keys().next().value);return copy(plan);
    }finally{controller.abort();external?.removeEventListener('abort',abort);planning=null;}
  }
  function cancelTransfer(){const operation=active||planning;if(!operation)return false;operation.controller.abort();return true;}
  async function executeTransfer({planId,choices={}}={}, {signal,onProgress=()=>{}}={}){
    if(active||planning)throw new LibraryError('transfer_in_progress');const plan=plans.get(planId);if(!plan)throw new LibraryError('plan_not_found');if(now()-plan.createdAt>15*60*1000)throw new LibraryError('plan_expired');
    const a=adapter(plan.targetService,[]);checkConnection(a,plan.connectionVersion);for(const key of ['playlistCreate','playlistAdd'])if(!a?.capabilities?.[key])throw new LibraryError('unsupported_operation','Сервис не поддерживает эту операцию через API.');
    const items=plan.items.map(i=>({...copy(i),targetId:Object.hasOwn(choices||{},i.sourceId)?choices[i.sourceId]:i.selectedId}));
    for(const item of items){if(item.status==='ambiguous'&&!Object.hasOwn(choices||{},item.sourceId))throw new LibraryError('review_required','Выберите совпадение или пропустите неоднозначный трек.');if(item.targetId&&!item.candidates.some(c=>c.id===item.targetId))throw new LibraryError('invalid_choice');}
    const seen=new Set(),selected=[];for(const item of items){if(!item.targetId){item.result='skipped';continue;}if(seen.has(item.targetId)){item.result='duplicate';continue;}seen.add(item.targetId);item.result='pending';selected.push(item);}
    const result={planId,service:plan.targetService,status:'nothing_to_transfer',playlist:null,added:0,skipped:items.length-selected.length+plan.sourceUnavailable+plan.sourceDuplicates,sourceUnavailable:plan.sourceUnavailable,sourceDuplicates:plan.sourceDuplicates,failed:0,items};if(!selected.length)return result;
    // A reviewed plan authorizes one new playlist, never an automatic repeat.
    plans.delete(planId);
    const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();active={planId,controller};
    const progress=()=>{try{onProgress(copy({planId,status:result.status,playlist:result.playlist,added:result.added,total:selected.length,skipped:result.skipped,failed:result.failed}));}catch{}};
    let created=false;result.status='running';progress();
    try{
      check(controller.signal);const playlist=await request(s=>{checkConnection(a,plan.connectionVersion);return a.createPlaylist({title:plan.name,description:'Transferred with HexSound',signal:s});},controller.signal,{retry:false});
      if(!playlist?.id)throw new LibraryError('invalid_playlist_response');result.playlist={id:clean(String(playlist.id),500),url:pageURL(playlist.url)};created=true;progress();
      const batchSize=Math.min(100,Math.max(1,Number(a.maxAddBatch)||1));
      for(let start=0;start<selected.length;start+=batchSize){
        check(controller.signal);checkConnection(a,plan.connectionVersion);const batch=selected.slice(start,start+batchSize),ids=batch.map(i=>i.targetId);
        try{
          const added=await request(s=>{checkConnection(a,plan.connectionVersion);return a.addTracks({playlistId:result.playlist.id,trackIds:ids,signal:s});},controller.signal,{retry:false});
          const accepted=Array.isArray(added?.addedIds)?new Set(added.addedIds.map(String)):new Set(ids);
          for(const item of batch){if(accepted.has(item.targetId)){item.result='added';result.added++;}else{item.result='failed';result.failed++;}}
          if(batch.some(i=>i.result==='failed'))throw new LibraryError('partial_add');progress();
        }catch(error){
          const accepted=new Set(Array.isArray(error.addedIds)?error.addedIds.map(String):[]);
          for(const item of batch)if(item.result==='pending'){if(accepted.has(item.targetId)){item.result='added';result.added++;}else{item.result=error.code==='connection_changed'?'not_attempted':controller.signal.aborted?'cancelled':'failed';item.uncertain=error.code!=='connection_changed'&&(!Number.isFinite(error.status)||error.status>=500);if(item.result==='failed')result.failed++;}}
          throw error;
        }
      }
      result.status=result.failed?'partial':'complete';plans.delete(planId);return copy(result);
    }catch(error){
      result.status=controller.signal.aborted?'cancelled':result.added?'partial':'failed';result.error=clean(error.code,60)||'transfer_failed';
      if(!created)result.uncertain=error.code!=='connection_changed'&&(!Number.isFinite(error.status)||error.status>=500);
      for(const item of selected)if(item.result==='pending')item.result='not_attempted';return copy(result);
    }finally{progress();signal?.removeEventListener('abort',abort);active=null;}
  }
  return {snapshot,tracks:()=>copy(index.tracks),duplicateGroups,mergeTracks,splitTrack,sync,importData,exportData,planTransfer,executeTransfer,cancelTransfer,inspect:()=>({syncing:[...syncing],transfer:active?.planId||'',planning:!!planning,plans:plans.size})};
}
module.exports={createLibrary,LibraryError};
