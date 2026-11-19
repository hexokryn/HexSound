const fs=require('node:fs'),path=require('node:path');
const clone=value=>JSON.parse(JSON.stringify(value));
function createStore(file,initial,{limit=32*1024*1024}={}){
  let value=clone(initial),warning='';
  for(const name of [file,file+'.bak'])try{if(fs.statSync(name).size>limit)throw Error('limit');const candidate=JSON.parse(fs.readFileSync(name,'utf8'));if(candidate?.schema!==initial.schema)throw Error('schema');value=candidate;if(name!==file)warning='recovered';break;}catch(error){if(error.code!=='ENOENT')warning='invalid';}
  return {read:()=>clone(value),warning:()=>warning,write(next){const text=JSON.stringify(next);if(Buffer.byteLength(text)>limit)throw Error('Слишком много локальных данных.');fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.tmp';fs.writeFileSync(temp,text,{mode:0o600});if(fs.existsSync(file))fs.copyFileSync(file,file+'.bak');fs.renameSync(temp,file);value=clone(next);warning='';return clone(value);}};
}
module.exports={createStore,clone};
