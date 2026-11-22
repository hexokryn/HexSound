const SERVICES=Object.freeze({
  soundcloud:{id:'soundcloud',name:'SoundCloud',api:'https://api.soundcloud.com/',authorize:'https://secure.soundcloud.com/authorize',token:'https://secure.soundcloud.com/oauth/token',web:'https://soundcloud.com/',scopes:[],redirect:'http://127.0.0.1:8766/callback/soundcloud'},
});
class ServiceError extends Error{constructor(code,message,{status,retryAfter,retryAfterMs}={}){super(message);this.name='ServiceError';this.code=code;if(status)this.status=status;if(retryAfter)this.retryAfter=retryAfter;if(retryAfterMs||retryAfter)this.retryAfterMs=retryAfterMs||retryAfter*1000;}}
function service(id){if(typeof id!=='string'||!Object.hasOwn(SERVICES,id))throw new ServiceError('INVALID_SERVICE','Неизвестный музыкальный сервис.');return SERVICES[id];}
function text(value,max=500){return typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max):'';}
function id(value){const out=String(value??'');if(!/^[A-Za-z0-9_:-]{1,180}$/.test(out))throw new ServiceError('INVALID_ID','Некорректный идентификатор.');return out;}
function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function redirectURI(value,provider){const s=service(provider);let u;try{if(value&&(typeof value!=='string'||value.length>1000))throw Error();u=new URL(value||s.redirect);}catch{throw new ServiceError('INVALID_REDIRECT','Некорректный Redirect URI.');}if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.search||u.hash||!u.pathname.startsWith('/callback/'))throw new ServiceError('INVALID_REDIRECT','Redirect URI должен иметь вид http://127.0.0.1:порт/callback/сервис.');return u.href;}
module.exports={SERVICES,ServiceError,service,text,id,safeURL,redirectURI};
