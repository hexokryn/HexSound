const {isSoundCloud}=require('./settings.cjs');
const short=(v,n=300)=>typeof v==='string'?v.slice(0,n).trim():'';
function imageURL(value){try{const u=new URL(value);if(u.protocol==='https:'&&(u.hostname==='sndcdn.com'||u.hostname.endsWith('.sndcdn.com')))return u.href;}catch{}return '';}
function pageURL(value){if(!isSoundCloud(value))return '';const u=new URL(value);u.search='';u.hash='';return u.href;}
function sanitize(raw){
  const p=raw?.profile||{},t=raw?.track||{};
  const duration=Number.isFinite(t.duration)?Math.max(0,Math.min(86400,t.duration)):0;
  const position=Number.isFinite(t.position)?Math.max(0,Math.min(duration||86400,t.position)):0;
  return{profile:{loggedIn:!!p.loggedIn,name:short(p.name,100),url:pageURL(p.url),avatar:imageURL(p.avatar)},track:{title:short(t.title),artist:short(t.artist,200),url:pageURL(t.url),artwork:imageURL(t.artwork),duration,position,playing:!!t.playing&&!!t.title,available:!!t.title,seekable:!!t.seekable,volume:Number.isFinite(t.volume)?Math.max(0,Math.min(1,t.volume)):1,shuffle:!!t.shuffle,repeat:['off','one','all'].includes(t.repeat)?t.repeat:'off',liked:!!t.liked}};
}
module.exports={sanitize,imageURL};
