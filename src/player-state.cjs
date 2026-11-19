const {isSoundCloud}=require('./settings.cjs');
const {allowed}=require('./service-windows.cjs');
const short=(v,n=300)=>typeof v==='string'?v.slice(0,n).trim():'';
function imageURL(value){try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&['sndcdn.com','scdn.co','spotifycdn.com','ytimg.com','ggpht.com','googleusercontent.com','yandex.net'].some(host=>u.hostname===host||u.hostname.endsWith('.'+host)))return u.href;}catch{}return '';}
function pageURL(value,provider='soundcloud'){if(!(provider==='soundcloud'?isSoundCloud(value):allowed(provider,value)))return '';const u=new URL(value);u.hash='';return u.href;}
function sanitize(raw,{trustedMedia=false}={}){
  const p=raw?.profile||{},t=raw?.track||{};
  const duration=Number.isFinite(t.duration)?Math.max(0,Math.min(86400,t.duration)):0;
  const position=Number.isFinite(t.position)?Math.max(0,Math.min(duration||86400,t.position)):0;
  const provider=['soundcloud','spotify','youtube','yandex',...(trustedMedia?['local']:[])].includes(t.provider)?t.provider:'soundcloud';
  const controls=t.controls&&typeof t.controls==='object'?Object.fromEntries(['toggle','previous','next','seek','volume','shuffle','repeat','like'].map(key=>[key,t.controls[key]===true])):null;
  const clockFlags={...(typeof t.clockKnown==='boolean'?{clockKnown:t.clockKnown}:{}),...(typeof t.clockEstimated==='boolean'?{clockEstimated:t.clockEstimated}:{})};
  const artwork=trustedMedia&&typeof t.artwork==='string'&&t.artwork.startsWith('hexmedia://asset/')&&/^[a-f0-9]{48}$/.test(t.artwork.slice(17))?t.artwork:imageURL(t.artwork);
  return{sampledAt:Number.isFinite(raw?.sampledAt)&&raw.sampledAt>0?Math.min(Date.now()+1000,raw.sampledAt):0,profile:{loggedIn:!!p.loggedIn,name:short(p.name,100),url:pageURL(p.url,provider),avatar:imageURL(p.avatar)},track:{provider,...clockFlags,title:short(t.title),artist:short(t.artist,200),url:pageURL(t.url,provider),artwork,duration,position,playing:!!t.playing&&!!t.title,available:!!t.title,seekable:!!t.seekable,volume:Number.isFinite(t.volume)?Math.max(0,Math.min(1,t.volume)):1,shuffle:!!t.shuffle,repeat:['off','one','all'].includes(t.repeat)?t.repeat:'off',liked:!!t.liked,...(controls?{controls}:{})}};
}
module.exports={sanitize,imageURL};
