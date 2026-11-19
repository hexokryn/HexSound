const {createHash}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
function parseLRC(input){
  const text=String(input||'').slice(0,500000);const offset=Number(text.match(/\[offset:([+-]?\d+)\]/i)?.[1]||0)/1000;
  const lines=[];
  for(const line of text.split(/\r?\n/)){
    const stamps=[...line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const words=line.replace(/\[[^\]]*\]/g,'').trim();
    for(const stamp of stamps){if(Number(stamp[2])>=60)continue;lines.push({time:Math.max(0,Number(stamp[1])*60+Number(stamp[2])+Number('0.'+(stamp[3]||'0'))-offset),text:words});}
  }
  return lines.sort((a,b)=>a.time-b.time).slice(0,3000);
}
function clean(value){return String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');}
function queryTrack(track){
  let title=String(track.title||'').trim(),artist=String(track.artist||'').trim();
  const split=title.match(/^(.{1,120}?)\s+[-–—]\s+(.+)$/);
  if(split){artist=split[1];title=split[2];}
  title=title.replace(/\s*\((official (audio|video)|lyrics?|lyric video)\)\s*/ig,' ').replace(/\s*\[(official (audio|video)|lyrics?)\]\s*/ig,' ').trim();
  return {title:title.slice(0,250),artist:artist.slice(0,200),duration:Math.round(Number(track.duration)||0)};
}
function key(track){return createHash('sha256').update([track.url||'',track.title||'',track.artist||'',Math.round(track.duration||0)].join('|')).digest('hex');}
function record(data,source='LRCLIB'){
  const lines=parseLRC(data.syncedLyrics);
  const plain=typeof data.plainLyrics==='string'?data.plainLyrics.slice(0,500000):'';
  return {status:data.instrumental?'instrumental':lines.length?'synced':plain?'plain':'missing',lines,plain,source,id:Number(data.id)||null};
}
function createLyricsService(directory,{fetcher=fetch,now=Date.now}={}){
  const cache=new Map();let queue=Promise.resolve(),blockedUntil=0,lastRequest=0;
  const localFile=track=>path.join(directory,key(track)+'.json');
  async function request(url){
    if(now()<blockedUntil)throw new Error('rate-limited');
    const delay=Math.max(0,300-(now()-lastRequest));if(delay)await new Promise(r=>setTimeout(r,delay));lastRequest=now();
    const response=await fetcher(url,{headers:{'User-Agent':'HexSound/0.4.0 (local desktop music client)','Accept':'application/json'},credentials:'omit',signal:AbortSignal.timeout(10000),redirect:'error'});
    if(response.status===429||response.status===503){const raw=response.headers.get('retry-after'),seconds=raw===null?NaN:Number(raw),date=Date.parse(raw);const delay=Number.isFinite(seconds)?Math.max(1,seconds)*1000:Number.isFinite(date)?Math.max(1000,date-now()):30000;blockedUntil=now()+delay+200;throw new Error('rate-limited');}
    if(response.status===404)return null;if(!response.ok)throw new Error('service-error');
    const text=await response.text();if(text.length>1500000)throw new Error('response-too-large');return JSON.parse(text);
  }
  async function lookup(track,online=true){
    try{const local=JSON.parse(fs.readFileSync(localFile(track),'utf8'));if(local?.lines?.length)return local;}catch{}
    if(!online)return{status:'offline',lines:[],plain:'',source:''};
    const id=key(track);if(cache.has(id))return cache.get(id);
    const work=async()=>{
      const q=queryTrack(track);if(!q.title||!q.artist)return{status:'missing',lines:[],plain:'',source:''};
      try{
        const params=new URLSearchParams({track_name:q.title,artist_name:q.artist});if(q.duration>0&&q.duration<=3600)params.set('duration',String(q.duration));
        let found=await request('https://lrclib.net/api/get?'+params);
        if(!found){const rows=await request('https://lrclib.net/api/search?'+new URLSearchParams({track_name:q.title,artist_name:q.artist}));if(Array.isArray(rows))found=rows.filter(r=>clean(r.trackName)===clean(q.title)&&clean(r.artistName)===clean(q.artist)&&(!q.duration||Math.abs(Number(r.duration)-q.duration)<=4)).sort((a,b)=>Math.abs(a.duration-q.duration)-Math.abs(b.duration-q.duration))[0];}
        const result=found?record(found):{status:'missing',lines:[],plain:'',source:'LRCLIB'};
        cache.set(id,result);if(cache.size>60)cache.delete(cache.keys().next().value);return result;
      }catch(e){return{status:e.message==='rate-limited'?'limited':'error',lines:[],plain:'',source:'LRCLIB'};}
    };
    const result=queue.catch(()=>{}).then(work);queue=result;return result;
  }
  function importText(track,text){const lines=parseLRC(text);if(!lines.some(l=>l.text))throw new Error('В файле нет строк с таймкодами LRC.');const data={status:'synced',lines,plain:'',source:'Локальный LRC'};fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(localFile(track),JSON.stringify(data));cache.delete(key(track));return data;}
  return{lookup,importText};
}
module.exports={parseLRC,queryTrack,record,createLyricsService,key};
