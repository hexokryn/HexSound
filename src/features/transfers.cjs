const crypto=require('node:crypto');
const {createStore}=require('./store.cjs');
function createTransferJournal(file,{getAdapter,getAccount,onChange=()=>{},now=Date.now}={}){
  const store=createStore(file,{schema:1,jobs:[]});let jobs=(store.read().jobs||[]).slice(-100),active=null;
  for(const job of jobs)if(['running','creating'].includes(job.status)){job.status='interrupted';job.uncertain=true;}
  const save=()=>{store.write({schema:1,jobs});onChange(snapshot());};
  const snapshot=()=>jobs.map(({approved,...j})=>({...structuredClone(j),total:approved.length,resumable:!!j.playlist?.id&&!['complete'].includes(j.status)})).reverse();
  function approved(plan,choices){const out=[],seen=new Set();for(const i of plan.items){if(i.status==='ambiguous'&&!Object.hasOwn(choices,i.sourceId))throw Error('Проверьте неоднозначные совпадения.');const id=Object.hasOwn(choices,i.sourceId)?choices[i.sourceId]:i.selectedId;if(!id)continue;if(!i.candidates.some(c=>c.id===id))throw Error('Некорректное совпадение.');if(!seen.has(id)){seen.add(id);out.push({sourceId:i.sourceId,track:i.source,targetId:id,result:'pending'});}}return out;}
  async function start(plan,choices,execute,{signal,onProgress=()=>{}}={}){
    if(active)throw Error('Другой перенос ещё выполняется.');const account=getAccount(plan.targetService);if(!account)throw Error('Подключите аккаунт назначения.');
    const items=approved(plan,choices||{});if(!items.length)throw Error('Нет треков для переноса.');
    const job={id:crypto.randomUUID(),service:plan.targetService,account,name:plan.name,createdAt:now(),updatedAt:now(),status:'creating',playlist:null,approved:items,added:0,failed:0,skipped:(plan.total||plan.items.length)-items.length,uncertain:false};jobs.push(job);if(jobs.length>100)jobs.shift();active=job.id;save();
    try{const result=await execute({signal,onProgress:p=>{if(p.playlist)job.playlist=p.playlist;job.added=p.added||0;job.failed=p.failed||0;job.status=p.status||'running';job.updatedAt=now();save();onProgress(p);}});job.status=result.status;job.playlist=result.playlist||job.playlist;job.added=result.added||0;job.failed=result.failed||0;job.uncertain=!!result.uncertain||result.items?.some(i=>i.uncertain)||false;job.error=result.error||'';for(const i of job.approved){const original=result.items?.find(x=>x.targetId===i.targetId);if(original)i.result=original.result;}save();return {...result,jobId:job.id};}
    catch(error){job.status='failed';job.error=String(error.message).slice(0,250);job.uncertain=!job.playlist;save();throw error;}finally{active=null;}
  }
  async function resume(id,{signal,onProgress=()=>{}}={}){
    if(active)throw Error('Другой перенос ещё выполняется.');const job=jobs.find(j=>j.id===id);if(!job?.playlist?.id)throw Error('Сервис не подтвердил создание плейлиста. Проверьте его вручную: повторное создание может дать дубль.');if(job.status==='complete')throw Error('Этот перенос уже завершён.');if(getAccount(job.service)!==job.account)throw Error('Подключите тот же аккаунт, в котором создан плейлист.');
    const adapter=getAdapter(job.service),version=adapter.connectionVersion,check=()=>{if(signal?.aborted)throw Error('Перенос остановлен.');if(getAccount(job.service)!==job.account||adapter.connectionVersion!==version)throw Error('Аккаунт изменился. Перенос остановлен.');};
    if(typeof adapter.getPlaylistTracks!=='function')throw Error('Этот сервис пока не позволяет проверить незавершённую запись.');active=id;job.status='running';save();
    try{check();const current=await adapter.getPlaylistTracks({playlistId:job.playlist.id,signal});check();if(!current?.complete||!Array.isArray(current.ids))throw Error('Сервис вернул неполный состав плейлиста. Без проверки продолжение остановлено.');const present=new Set(current.ids.map(String));for(const item of job.approved)if(present.has(item.targetId))item.result='added';
      job.added=job.approved.filter(i=>i.result==='added').length;job.failed=0;save();const pending=job.approved.filter(i=>i.result!=='added'),size=Math.min(100,Math.max(1,Number(adapter.maxAddBatch)||1));
      for(let offset=0;offset<pending.length;offset+=size){check();const batch=pending.slice(offset,offset+size);job.uncertain=true;job.updatedAt=now();save();try{const r=await adapter.addTracks({playlistId:job.playlist.id,trackIds:batch.map(i=>i.targetId),signal});check();const accepted=new Set(r?.addedIds||batch.map(i=>i.targetId));for(const item of batch)item.result=accepted.has(item.targetId)?'added':'failed';if(batch.some(i=>i.result==='failed'))throw Error('Сервис подтвердил только часть треков.');job.uncertain=false;}catch(error){const accepted=new Set(error.addedIds||[]);for(const item of batch)if(accepted.has(item.targetId))item.result='added';throw error;}finally{job.added=job.approved.filter(i=>i.result==='added').length;job.failed=job.approved.filter(i=>i.result==='failed').length;save();onProgress({jobId:id,status:job.status,playlist:job.playlist,added:job.added,total:job.approved.length,failed:job.failed});}}
      job.status='complete';job.error='';job.uncertain=false;save();return report(id);
    }catch(error){job.status=signal?.aborted?'cancelled':job.added?'partial':'failed';job.error=String(error.message||error).slice(0,250);save();return report(id);}finally{active=null;}
  }
  function report(id){const job=jobs.find(j=>j.id===id);if(!job)throw Error('Перенос не найден.');return structuredClone(job);}
  return {snapshot,start,resume,report};
}
module.exports={createTransferJournal};
