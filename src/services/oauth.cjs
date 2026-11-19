const http=require('node:http'),crypto=require('node:crypto');
const {ServiceError,redirectURI}=require('./registry.cjs');
function pkce(){const verifier=crypto.randomBytes(48).toString('base64url');return {verifier,challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),state:crypto.randomBytes(32).toString('base64url')};}
function sameState(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
async function startLoopback({provider,redirectUri,state,timeout=180000}){
  const requested=new URL(redirectURI(redirectUri,provider));let settle,fail,closed=false,timer;
  const result=new Promise((resolve,reject)=>{settle=resolve;fail=reject;});result.catch(()=>{});
  const server=http.createServer((req,res)=>{
    const expectedHost='127.0.0.1:'+server.address().port;
    let u;try{u=new URL(req.url,'http://'+expectedHost);}catch{res.writeHead(400).end();return;}
    if(req.method!=='GET'||req.headers.host!==expectedHost||u.pathname!==requested.pathname){res.writeHead(404).end();return;}
    res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'");res.setHeader('Referrer-Policy','no-referrer');
    if(!sameState(u.searchParams.get('state'),state)){res.writeHead(400).end('Invalid authorization state.');return;}
    if(u.searchParams.has('error')){res.writeHead(400).end('Sign-in was cancelled. Return to HexSound.');finish(new ServiceError('AUTH_DENIED','Вход отменён на стороне сервиса.'));return;}
    const code=u.searchParams.get('code');if(!code||code.length>4000){res.writeHead(400).end('Missing authorization code.');return;}
    res.writeHead(200).end('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>HexSound</title><body style="background:#111214;color:#f4f3f0;font:18px system-ui;display:grid;place-items:center;min-height:90vh"><main><h1>Авторизация подтверждена</h1><p>Вернитесь в HexSound. Приложение проверит подключение.</p></main></body></html>');finish(null,code);
  });
  function finish(error,code){if(closed)return;closed=true;clearTimeout(timer);server.close();if(error)fail(error);else settle(code);}
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(requested.port)||0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});}).catch(()=>{throw new ServiceError('AUTH_PORT','Порт обратного входа занят. Измените Redirect URI.');});
  server.on('error',()=>finish(new ServiceError('AUTH_PORT','Ошибка локального подключения авторизации.')));
  requested.port=String(server.address().port);timer=setTimeout(()=>finish(new ServiceError('AUTH_TIMEOUT','Время ожидания входа истекло.')),timeout);timer.unref?.();
  return {redirectUri:requested.href,result,cancel:()=>finish(new ServiceError('AUTH_CANCELLED','Вход отменён.'))};
}
module.exports={pkce,sameState,startLoopback};
