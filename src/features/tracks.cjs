const crypto=require('node:crypto');
const providers=new Set(['soundcloud','spotify','youtube','yandex','local']);
const clean=(x,max=400)=>typeof x==='string'?x.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max):'';
const norm=x=>clean(x,1000).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const hash=x=>crypto.createHash('sha256').update(x).digest('hex').slice(0,24);
function https(x){try{const u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function track(raw){
  if(!raw||typeof raw!=='object')throw Error('Некорректный трек.');const title=clean(raw.title||raw.name),artist=clean(raw.artist,250);if(!title)throw Error('У трека нет названия.');
  const sources=(Array.isArray(raw.sources)?raw.sources:[raw]).slice(0,12).map(s=>({service:clean(s.service||s.provider,30),id:clean(String(s.id??''),500),url:https(s.url)})).filter(s=>providers.has(s.service)&&(s.id||s.url));
  if(!sources.length)throw Error('У трека нет доступного источника.');
  const id=clean(raw.id,100)||'item-'+hash(sources.map(s=>s.service+':'+s.id+':'+s.url).join('|')+'|'+title+'|'+artist);
  return {id,title,artist,album:clean(raw.album,250),duration:Number.isFinite(raw.duration)?Math.max(0,Math.min(86400,raw.duration)):0,artwork:https(raw.artwork),sources,addedAt:Number.isFinite(raw.addedAt)?Math.max(0,raw.addedAt):0};
}
const recordingKey=t=>norm(t.title)+'|'+norm(t.artist);
module.exports={track,clean,norm,hash,https,providers,recordingKey};
