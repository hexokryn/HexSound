const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
app.setPath('userData',path.join(os.tmpdir(),'hexsound-icon-'+process.pid));
app.whenReady().then(async()=>{try{
  const svg=fs.readFileSync(path.join(__dirname,'../src/assets/mark.svg'),'utf8');
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  await win.loadURL('data:text/html,<html><body></body></html>');
  const data=await win.webContents.executeJavaScript(`(async()=>{const image=new Image();image.src=${JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'))};await image.decode();const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#f4f3f0';ctx.beginPath();ctx.roundRect(0,0,256,256,58);ctx.fill();ctx.drawImage(image,0,0,256,256);return c.toDataURL('image/png');})()`);
  const png=Buffer.from(data.split(',')[1],'base64'),dir=path.join(__dirname,'../src/assets');fs.writeFileSync(path.join(dir,'icon.png'),png);
  fs.mkdirSync(path.join(dir,'icons'),{recursive:true});fs.writeFileSync(path.join(dir,'icons','256x256.png'),png);
  const large=await win.webContents.executeJavaScript(`(async()=>{const image=new Image();image.src=${JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'))};await image.decode();const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');ctx.fillStyle='#f4f3f0';ctx.beginPath();ctx.roundRect(0,0,512,512,116);ctx.fill();ctx.drawImage(image,0,0,512,512);return c.toDataURL('image/png');})()`);fs.writeFileSync(path.join(dir,'icons','512x512.png'),Buffer.from(large.split(',')[1],'base64'));
  const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);fs.writeFileSync(path.join(dir,'icon.ico'),Buffer.concat([ico,png]));
  console.log('Icon built');app.quit();
}catch(error){console.error(error);app.exit(1);}});
