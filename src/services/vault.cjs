const fs=require('node:fs'),path=require('node:path');
function createVault(directory,safeStorage){
  const file=path.join(directory,'connections.enc');let data={version:1,services:{}};
  const secure=()=>{try{return !!safeStorage?.isEncryptionAvailable()&&safeStorage.getSelectedStorageBackend?.()!=='basic_text';}catch{return false;}};
  if(secure())try{const parsed=JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));if(parsed?.version===1&&parsed.services&&typeof parsed.services==='object'&&!Array.isArray(parsed.services))data=parsed;}catch{}
  function save(){if(!secure())return false;const encrypted=safeStorage.encryptString(JSON.stringify(data));fs.mkdirSync(directory,{recursive:true,mode:0o700});const temp=file+'.tmp';fs.writeFileSync(temp,encrypted,{mode:0o600});fs.renameSync(temp,file);return true;}
  return{get:()=>data,save,secure,file};
}
module.exports={createVault};
