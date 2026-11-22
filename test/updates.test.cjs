const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createUpdates,newer,allowed,requestUpdate}=require('../src/updates.cjs');
function fixture(t,extra={}){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hexsound-updates-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const bytes=Buffer.from('test installer'),digest='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');const asset={name:'HexSound-1.2.0-setup.exe',size:bytes.length,digest,browser_download_url:'https://github.com/hexokryn/HexSound/releases/download/v1.2.0/HexSound-1.2.0-setup.exe'};const release={tag_name:'v1.2.0',body:'<script>text only</script>',assets:[asset]};let installed=null;const updater=createUpdates({version:'1.1.0',directory,platform:'win32',portable:false,fetcher:async url=>url.includes('/releases/latest')?Response.json(release):new Response(bytes),install:async value=>installed=value,...extra});return{updater,asset,release,directory,installed:()=>installed};}
test('updates compare numeric stable versions and constrain hosts',()=>{assert.equal(newer('v1.10.0','1.9.9'),true);assert.equal(newer('v1.2.0','1.2.0'),false);assert.equal(newer('v0.9.0','1.2.0'),false);assert.equal(newer('v2.0.0-beta','1.2.0'),false);for(const url of ['http://github.com/a','https://github.com.evil.test/a','https://secret@github.com/a','file:///a'])assert.equal(allowed(url),false);});
test('verified update downloads, checks size and digest again before installation',async t=>{const f=fixture(t);assert.equal((await f.updater.check()).status,'available');assert.equal((await f.updater.download()).status,'ready');await f.updater.apply();assert.ok(f.installed().file.endsWith('.exe'));fs.appendFileSync(f.installed().file,'tampered');await assert.rejects(f.updater.apply(),/изменён/);});
test('foreign repositories, missing hashes and draft releases cannot become updates',async t=>{const f=fixture(t);f.asset.browser_download_url='https://github.com/attacker/HexSound/releases/download/v1.2.0/a.exe';assert.equal((await f.updater.check(true)).status,'error');f.asset.browser_download_url='https://github.com/hexokryn/HexSound/releases/download/v1.2.0/a.exe';f.asset.digest='';assert.equal((await f.updater.check(true)).status,'error');f.release.draft=true;assert.equal((await f.updater.check(true)).status,'current');assert.equal(f.installed(),null);});
test('invalid download content is discarded and never launched',async t=>{const f=fixture(t);f.asset.digest='sha256:'+'0'.repeat(64);await f.updater.check();assert.equal((await f.updater.download()).status,'error');await assert.rejects(f.updater.apply(),/не загружено/);assert.equal(fs.existsSync(path.join(f.directory,f.asset.name+'.part')),false);assert.equal(f.installed(),null);});
test('update checking handles offline and development mode without blocking launch',async t=>{const f=fixture(t,{fetcher:async()=>{throw Error('offline');}});assert.equal((await f.updater.check()).status,'error');const d=fixture(t,{packaged:false});assert.equal((await d.updater.check()).status,'development');});
test('download redirects cannot reach arbitrary hosts',async t=>{let requests=0;const f=fixture(t,{fetcher:async()=>{requests++;return new Response(null,{status:302,headers:{Location:'https://evil.test/file'}});}});assert.equal((await f.updater.check()).status,'error');assert.equal(requests,1);});

test('the Node fetch transport exposes redirect headers and downloads verified CDN bytes',async t=>{
 const http=require('node:http'),requests=[];let f;
 const server=http.createServer((req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{Location:'https://release-assets.githubusercontent.com/installer.exe'});res.end();}else{res.end('test installer');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 f=fixture(t,{fetcher:async(url,init)=>{requests.push(url);if(url.includes('/releases/latest'))return Response.json(f.release);assert.equal(init.redirect,'manual');return fetch('http://127.0.0.1:'+server.address().port+(new URL(url).hostname==='github.com'?'/redirect':'/bytes'),init);}});
 assert.equal((await f.updater.check()).status,'available');
 assert.equal((await f.updater.download()).status,'ready');
 assert.equal(requests.at(-1),'https://release-assets.githubusercontent.com/installer.exe');
 assert.equal(fs.readFileSync(path.join(f.directory,f.asset.name),'utf8'),'test installer');
 assert.equal(f.installed(),null);
});

test('every redirect hop is checked before a request and redirect loops are bounded',async()=>{
 const seen=[];
 await assert.rejects(requestUpdate('https://github.com/asset',{fetcher:async url=>{seen.push(url);return new Response(null,{status:302,headers:{Location:seen.length===1?'https://release-assets.githubusercontent.com/file':'https://evil.test/file'}});}}),/Недопустимый сервер/);
 assert.deepEqual(seen,['https://github.com/asset','https://release-assets.githubusercontent.com/file']);
 let count=0;
 await assert.rejects(requestUpdate('https://github.com/asset',{fetcher:async()=>{count++;return new Response(null,{status:302,headers:{Location:'/asset'}});}}),/Слишком много/);
 assert.equal(count,6);
});
