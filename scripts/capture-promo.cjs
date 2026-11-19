const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const delay=ms=>new Promise(r=>setTimeout(r,ms));

// Capture the real renderer in an isolated profile; never open a personal account.
module.exports=async({win})=>{
  const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/promo'),shots=path.join(root,'docs/screenshots'),media=path.join(root,'docs/media');
  for(const dir of [out,shots,media])fs.mkdirSync(dir,{recursive:true});
  const cover=`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#e8e2d6"/><g fill="none" stroke="#252929" stroke-width="1.8">${Array.from({length:32},(_,i)=>`<ellipse cx="300" cy="292" rx="${50+i*6}" ry="${48+i*5.2}" transform="rotate(${i*2.4} 300 292)"/>`).join('')}</g><text x="38" y="52" font-family="Arial" font-size="13" letter-spacing="3" fill="#303333">HEX / SESSIONS</text><text x="38" y="552" font-family="Arial" font-size="34" letter-spacing="-1" fill="#252929">Night drive</text><text x="560" y="550" text-anchor="end" font-family="Arial" font-size="13" fill="#303333">01</text></svg>`;
  fs.writeFileSync(path.join(media,'demo-cover.svg'),cover);
  const fixture={profile:{loggedIn:true,name:'HexSound Demo',url:'https://soundcloud.com',avatar:''},track:{title:'Night drive',artist:'HexSound · Demo',url:'https://soundcloud.com',duration:180,position:0,playing:true,volume:.65,available:true,seekable:true,shuffle:false,repeat:'off',liked:true,artwork:pathToFileURL(path.join(media,'demo-cover.svg')).href}};
  const lyrics={status:'synced',source:'Демонстрационный текст',lines:[{time:0,text:'Город медленно гасит огни'},{time:2.4,text:'И звучит чуть тише внутри'},{time:4.8,text:'Мы оставим весь шум позади'},{time:7.2,text:'Только музыка. Только наш ритм.'},{time:9.6,text:'Этот вечер останется с нами'}]};
  const run=code=>win.webContents.executeJavaScript(code);
  const look=patch=>run(`window.hex.saveSettings(${JSON.stringify(patch)})`);
  const shot=async name=>{await delay(650);fs.writeFileSync(path.join(shots,name+'.png'),(await win.webContents.capturePage()).toPNG());};
  win.setContentSize(1280,800);
  await delay(400);
  await run(`window.hex.showSettings(true);showPage('settings');document.querySelector('[data-tab="appearance"]').click()`);
  await look({palette:'obsidian',theme:'dark',effect:'constellation',effectIntensity:45,motion:true,lyricsOnline:false,sidebarCollapsed:false,animationSpeed:1});
  await shot('themes-dark');
  await look({palette:'porcelain',theme:'light',effect:'none'});await shot('themes-light');
  await look({palette:'aurora',theme:'dark',effect:'aurora',effectIntensity:65});
  await run(`document.querySelector('[data-tab="atmosphere"]').click()`);await shot('atmosphere');
  await run(`window.hex.openPlayer()`);await run(`window.HexPlayerUI.update(${JSON.stringify(fixture)},false);window.HexPlayerUI.renderLyrics(${JSON.stringify(lyrics)});window.HexPlayerUI.updateLine(2.6)`);await shot('player-dark');
  await look({palette:'porcelain',theme:'light',effect:'none'});await shot('player-light');
  await look({palette:'obsidian',theme:'dark',effect:'constellation',effectIntensity:45});
  await run(`window.hex.showSettings(true);showPage('settings');document.querySelector('[data-tab="appearance"]').click()`);
  await delay(450);
  const ffmpeg=require('../.tools/media/node_modules/ffmpeg-static');
  const encoder=spawn(ffmpeg,['-y','-hide_banner','-loglevel','error','-f','image2pipe','-vcodec','mjpeg','-framerate','24','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'interface.mp4')],{windowsHide:true});
  let stderr='';encoder.stderr.on('data',data=>stderr+=data);
  const done=new Promise((resolve,reject)=>{encoder.on('error',reject);encoder.on('close',code=>code===0?resolve():reject(Error(stderr)))});
  encoder.stdin.on('error',()=>{});
  const start=Date.now();
  for(let frame=0;frame<432;frame++){
    if(frame===0)run('window.HexLaunch.replay()');
    if(frame===48)await look({palette:'aurora',theme:'dark',effect:'none'});
    if(frame===88)await look({palette:'cobalt',theme:'dark'});
    if(frame===116)await look({palette:'porcelain',theme:'light'});
    if(frame===144){await look({palette:'aurora',theme:'dark',effect:'aurora',effectIntensity:70});await run(`document.querySelector('[data-tab="atmosphere"]').click()`);}
    if(frame===180)await look({effect:'constellation',effectIntensity:80});
    if(frame===216){await look({palette:'obsidian',theme:'dark',effect:'constellation',effectIntensity:45,artworkMotion:'turn',lyricAnimation:'cascade'});await run(`window.hex.openPlayer()`);await run(`window.HexPlayerUI.update(${JSON.stringify(fixture)},false);window.HexPlayerUI.renderLyrics(${JSON.stringify(lyrics)})`);}
    if(frame>=216){const at=(frame-216)/24;await run(`window.HexPlayerUI.update(${JSON.stringify({...fixture,track:{...fixture.track,position:at,playing:true}})},false);window.HexPlayerUI.updateLine(${at})`);}
    const frameImage=(await win.webContents.capturePage()).toJPEG(92);
    await new Promise((resolve,reject)=>encoder.stdin.write(frameImage,error=>error?reject(error):resolve()));
    if(frame%72===0)console.log('PROMO FRAME',frame,'/432');
    await delay(Math.max(0,start+(frame+1)*1000/24-Date.now()));
  }
  encoder.stdin.end();await done;
  console.log('PROMO CAPTURE PASS: real interface, five screenshots, 432 frames; isolated demo profile');
};
