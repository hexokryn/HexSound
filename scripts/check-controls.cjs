const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {themeCSS}=require('../src/soundcloud-theme.cjs');
const {defaults}=require('../src/settings.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const out=path.resolve(__dirname,'../artifacts/controls-0.5.1');
app.setPath('userData',path.join(os.tmpdir(),'hex-controls-'+process.pid));
app.whenReady().then(async()=>{try{
  fs.mkdirSync(out,{recursive:true});
  const win=new BrowserWindow({show:false,width:1280,height:900,useContentSize:true,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
  await win.loadURL('https://soundcloud.com/discover');
  for(let n=0;n<40;n++){
    if(await win.webContents.executeJavaScript(`document.querySelector('.playableTile__actionWrapper')!==null`))break;
    await delay(500);
  }
  if(!await win.webContents.executeJavaScript(`document.querySelector('.playableTile__actionWrapper')!==null`))throw Error('SoundCloud tiles did not load');
  win.showInactive();
  await win.webContents.executeJavaScript(`document.querySelector('#onetrust-reject-all-handler')?.click()`);
  const check=`(()=>{const wrappers=Array.from(document.querySelectorAll('.playableTile__actionWrapper')).slice(0,20);let checked=0;const errors=[];for(const wrapper of wrappers){const art=wrapper.closest('.playableTile__artwork').getBoundingClientRect();let previous=-Infinity;for(const button of wrapper.querySelectorAll(':scope>.sc-button')){const b=button.getBoundingClientRect(),svg=button.querySelector('svg'),icon=svg?.getBoundingClientRect();checked++;if(b.left<art.left+1||b.right>art.right-1||b.top<art.top||b.bottom>art.bottom||b.left<previous||b.width<22||!button.getAttribute('aria-label')||icon&&(icon.left<b.left||icon.right>b.right||icon.top<b.top||icon.bottom>b.bottom))errors.push({button:button.className,width:b.width,art:[art.left,art.right],buttonBounds:[b.left,b.right]});previous=b.right}}return {checked,errors}})()`;
  const results=[];let css;
  for(const dark of [true,false]){
    if(css)await win.webContents.removeInsertedCSS(css);
    css=await win.webContents.insertCSS(themeCSS({...defaults,theme:dark?'dark':'light',palette:'obsidian',motion:false},dark));
    for(const width of [360,640,1000,1204,1440])for(const zoom of [.85,1,1.25]){
      win.setContentSize(width,900);win.webContents.setZoomFactor(zoom);await delay(70);
      const result=await win.webContents.executeJavaScript(check);
      if(result.errors.length)console.log(await win.webContents.executeJavaScript(`(()=>{let el=document.querySelector('.playableTile');const list=[];for(let i=0;el&&i<8;i++,el=el.parentElement){const s=getComputedStyle(el);list.push({class:el.className,style:el.getAttribute('style'),width:s.width,display:s.display,grid:s.gridTemplateColumns,flex:s.flex})}return JSON.stringify(list)})()`));
      if(!result.checked||result.errors.length)throw Error(JSON.stringify({width,zoom,dark,...result}));
      results.push({width,zoom,dark,checked:result.checked});
    }
  }
  win.setContentSize(1280,900);win.webContents.setZoomFactor(1);
  await win.webContents.removeInsertedCSS(css);
  css=await win.webContents.insertCSS(themeCSS({...defaults,theme:'dark',palette:'obsidian',motion:false},true));
  await win.webContents.executeJavaScript(`(()=>{const a=document.querySelector('.playableTile__artwork');a.style.setProperty('width','140px','important');a.style.setProperty('height','140px','important');a.style.setProperty('padding-top','0','important');document.querySelectorAll('.playableTile__actions').forEach(el=>{el.style.setProperty('opacity','1','important');el.style.setProperty('visibility','visible','important')})})()`);
  for(const width of [96,112,120,140,160]){
    await win.webContents.executeJavaScript(`document.querySelector('.playableTile__artwork').style.setProperty('width','${width}px','important')`);await delay(80);
    const result=await win.webContents.executeJavaScript(check);
    if(result.errors.length)throw Error(JSON.stringify({tileWidth:width,...result}));
  }
  await win.webContents.executeJavaScript(`document.querySelector('.playableTile__artwork').style.setProperty('width','140px','important')`);await delay(180);
  const box=await win.webContents.executeJavaScript(`(()=>{const r=document.querySelector('.playableTile__artwork').getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()`);
  fs.writeFileSync(path.join(out,'fixed-controls.png'),(await win.webContents.capturePage(box,{stayAwake:true})).toPNG());
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));
  console.log('CONTROLS PASS: 30 viewport/zoom/theme combinations; five narrow artwork widths; native button and icon bounds, labels and spacing');app.quit();
}catch(error){console.error('CONTROLS FAIL',error);app.exit(1)}});
