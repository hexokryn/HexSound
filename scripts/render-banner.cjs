const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
app.setPath('userData',path.join(os.tmpdir(),'hexsound-banner-'+process.pid));
app.whenReady().then(async()=>{try{
  const file=path.join(__dirname,'../docs/media/banner.svg'),svg=fs.readFileSync(file,'utf8');
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  await win.loadURL('data:text/html,<html></html>');
  const result=await win.webContents.executeJavaScript(`(async()=>{const image=new Image();image.src=${JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'))};await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d').drawImage(image,0,0);return c.toDataURL('image/png')})()`);
  fs.writeFileSync(file.replace('.svg','.png'),Buffer.from(result.split(',')[1],'base64'));console.log('Banner rendered');app.quit();
}catch(error){console.error(error);app.exit(1)}});
