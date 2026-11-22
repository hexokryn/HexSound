const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {requestUpdate}=require('../src/updates.cjs');

async function check(){
 const signal=AbortSignal.timeout(30000);
 // A small, immutable release asset exercises GitHub's actual CDN redirect.
 const release=await(await requestUpdate('https://api.github.com/repos/hexokryn/HexSound/releases/tags/v0.9.2',{signal})).json();
 const asset=release.assets.find(a=>a.name==='SHA256SUMS.txt');
 assert.match(asset.digest,/^sha256:[a-f0-9]{64}$/);
 const response=await requestUpdate(asset.browser_download_url,{signal});
 const bytes=Buffer.from(await response.arrayBuffer());
 assert.equal(bytes.length,asset.size);
 assert.equal('sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'),asset.digest);
 console.log(JSON.stringify({check:'update-transport',runtime:process.versions.electron?'electron':'node',bytes:bytes.length,githubRedirect:'verified',installed:false}));
}
const app=process.versions.electron&&!process.env.ELECTRON_RUN_AS_NODE?require('electron').app:null;
(app?app.whenReady():Promise.resolve()).then(check).then(()=>app?.quit()).catch(error=>{console.error(error);if(app)app.exit(1);else process.exitCode=1;});
