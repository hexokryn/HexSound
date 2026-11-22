const {createStore}=require('./store.cjs'),{track,norm,recordingKey,hash}=require('./tracks.cjs');
function createWave(file,{getTracks,getStatuses,getAdapter,getPreferences=()=>({}),getHistory=()=>({recent:[]}),now=Date.now,onChange=()=>{},random=Math.random,libraryFallback=false}={}){
  const store=createStore(file,{schema:1,items:[],generatedAt:0}),cached=store.read();let items=Array.isArray(cached.items)?cached.items:[],generatedAt=cached.generatedAt||0,controller=null;
  const snapshot=()=>({items:structuredClone(items),generatedAt,busy:!!controller});
  async function generate({novelty='balanced',service='',limit=30}={}){
    if(controller)throw Error('Подборка уже создаётся.');const library=getTracks();if(!library.length)throw Error('Добавьте треки в библиотеку: волна учится по вашей музыке.');
    const available=getStatuses().filter(s=>s.capabilities.search&&(!service||s.id===service));if(!available.length)throw Error('Подключите API хотя бы одного каталога, чтобы искать похожую музыку.');
    const abort=new AbortController();controller=abort;onChange(snapshot());
    try{
      const preferences=getPreferences(),known=new Set(library.map(recordingKey)),recent=new Set((getHistory().recent||[]).slice(0,30).map(e=>e.key)),artistCounts=new Map();
      for(const t of library){const key=norm(t.artist);if(key)artistCounts.set(key,(artistCounts.get(key)||0)+1);}
      const seeds=[...library].filter(t=>preferences[recordingKey(t)]?.action!=='dislike').map(t=>({t,rank:(artistCounts.get(norm(t.artist))||1)+(preferences[recordingKey(t)]?.action==='like'?4:0)+random()*4})).sort((a,b)=>b.rank-a.rank).slice(0,6).map(x=>x.t);
      const candidates=new Map(),errors=[];let requests=0;
      const accept=(raw,provider,seed,related=false)=>{try{const candidate=track({...raw,service:provider,sources:[{service:provider,id:raw.id,url:raw.url}]});const key=recordingKey(candidate),feedback=preferences[key];if(feedback?.action==='dislike'||feedback?.action==='skip'&&now()-feedback.at<7*86400000||recent.has(key)||novelty==='discover'&&known.has(key)||candidate.title===seed.title&&norm(candidate.artist)===norm(seed.artist))return;const sameArtist=!!norm(seed.artist)&&norm(candidate.artist)===norm(seed.artist),score=(related?7:0)+(sameArtist?4:0)+Math.min(3,artistCounts.get(norm(candidate.artist))||0)+(known.has(key)?(novelty==='familiar'?5:-3):2)+(feedback?.action==='like'?3:0);if(score<3)return;const value={...candidate,id:'wave-'+hash(key),reason:related?'Похож на «'+seed.title+'»':sameArtist?'Вы слушаете '+seed.artist:'По исполнителям из вашей библиотеки',seed:{title:seed.title,artist:seed.artist},score,known:known.has(key)};const old=candidates.get(key);if(!old||old.score<score)candidates.set(key,value);}catch{}};
      for(const provider of available){const adapter=getAdapter(provider.id);for(const seed of seeds.slice(0,provider.id==='youtube'||provider.webOnly?2:4)){
        if(abort.signal.aborted)throw Error('Подбор остановлен.');if(requests>=18)break;
        try{const own=seed.sources.find(s=>s.service===provider.id);if(own&&typeof adapter.relatedTracks==='function'){requests++;const related=await adapter.relatedTracks({trackId:own.id,signal:abort.signal});for(const t of related||[])accept(t,provider.id,seed,true);}
          if(requests<18){requests++;const found=await adapter.searchTracks({query:seed.artist||seed.title,signal:abort.signal});for(const t of Array.isArray(found)?found:found?.tracks||[])accept(t,provider.id,seed,false);}
        }catch(error){if(abort.signal.aborted)throw Error('Подбор остановлен.');errors.push({service:provider.id,message:String(error.message||'Поиск недоступен').slice(0,200)});if([401,403,429].includes(error.status))break;}
      }}
      if(abort.signal.aborted)throw Error('Подбор остановлен.');const sorted=[...candidates.values()].map(t=>({...t,rank:t.score+random()*2})).sort((a,b)=>b.rank-a.rank),counts=new Map(),result=[];
      for(const t of sorted){const key=norm(t.artist),count=counts.get(key)||0;if(count>=3&&novelty!=='familiar')continue;counts.set(key,count+1);delete t.rank;result.push(t);if(result.length>=Math.min(60,Math.max(1,limit)))break;}
      if(!result.length&&libraryFallback&&novelty!=='discover'){const seen=new Set();for(const seed of [...library].sort(()=>random()-.5)){const key=recordingKey(seed);if(seen.has(key)||preferences[key]?.action==='dislike'||preferences[key]?.action==='skip'&&now()-preferences[key].at<7*86400000)continue;seen.add(key);result.push({...seed,reason:'Из вашей медиатеки',known:true});if(result.length>=limit)break;}}
      if(!result.length){if(errors.length)throw Error(errors[0].message);throw Error('Пока нет подходящих новых треков. Добавьте других исполнителей или смените каталог.');}
      items=result;generatedAt=now();store.write({schema:1,items,generatedAt});return {...snapshot(),errors,requests};
    }finally{controller=null;onChange(snapshot());}
  }
  return {snapshot,prime(){if(items.length)return snapshot();const prefs=getPreferences(),seen=new Set();items=getTracks().filter(t=>{const key=recordingKey(t);if(seen.has(key)||prefs[key]?.action==='dislike'||prefs[key]?.action==='skip'&&now()-prefs[key].at<7*86400000)return false;seen.add(key);return true;}).sort(()=>random()-.5).slice(0,25).map(t=>({...t,reason:'Из вашей медиатеки',known:true}));if(!items.length)throw Error('Добавьте музыку в медиатеку.');onChange(snapshot());return snapshot();},generate,cancel(){controller?.abort();},remove(key){items=items.filter(t=>recordingKey(t)!==key);store.write({schema:1,items,generatedAt});onChange(snapshot());}};
}
module.exports={createWave};
