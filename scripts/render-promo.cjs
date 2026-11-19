const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/promo'),media=path.join(root,'docs/media'),deliver=path.join(root,'media');
for(const dir of [out,media,deliver])fs.mkdirSync(dir,{recursive:true});
const mark=fs.readFileSync(path.join(root,'src/assets/mark.svg'),'utf8').replace('<svg ', '<svg x="20" y="20" width="104" height="104" ');
const symbol=(x,y,size)=>`<g transform="translate(${x} ${y}) scale(${size/144})"><rect width="144" height="144" rx="33" fill="#f4f3f0"/>${mark}</g>`;
const svg=(contents,w=1080,h=1080)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Arial, sans-serif" fill="#f4f3f0">${contents}</svg>`;
const titles=[['HexSound.','SoundCloud на Windows.'],['32 темы.','Светлый и тёмный режим.'],['Живой фон.','Эффекты, стекло и свои изображения.'],['Слова в ритме.','Анимации текста и обложки.']];
const headers=titles.map(([a,b],i)=>svg(`<text x="52" y="124" font-size="70" font-weight="600" letter-spacing="-2.8">${a}</text><text x="55" y="188" font-size="27" fill="#a0a7ae">${b}</text><path d="M54 958H1026" stroke="#24272b"/><text x="54" y="1008" font-size="22" fill="#c7cbcf">zexokky://DEV</text><text x="1026" y="1008" text-anchor="end" font-size="19" fill="#8a929b">${i===3?'Демонстрационный трек':'Windows x64'}</text>`));
const end=svg(`<rect width="1080" height="1080" fill="#0b0c0e"/>${symbol(468,215,144)}<text x="540" y="496" text-anchor="middle" font-size="88" font-weight="600" letter-spacing="-4">HexSound.</text><text x="540" y="570" text-anchor="middle" font-size="28" fill="#a0a7ae">SoundCloud на Windows.</text><rect x="337" y="635" width="406" height="66" rx="33" fill="#f4f3f0"/><text x="540" y="677" text-anchor="middle" font-size="23" fill="#111214">Setup + Portable</text><text x="540" y="805" text-anchor="middle" font-size="25" fill="#c7cbcf">github.com/hexokryn/HexSound</text><text x="540" y="981" text-anchor="middle" font-size="22" fill="#818a94">t.me/zexokkydev</text>`);
const banner=svg(`<rect width="1600" height="640" fill="#0b0c0e"/><text x="94" y="148" font-size="19" letter-spacing="3" fill="#9199a2">WINDOWS ×64</text><text x="88" y="312" font-size="116" font-weight="600" letter-spacing="-5">HexSound.</text><text x="96" y="390" font-size="32" fill="#a0a7ae">SoundCloud desktop for Windows.</text><text x="96" y="553" font-size="22" fill="#8b949d">32 themes · Live backgrounds · Lyrics</text>${symbol(1200,215,210)}`,1600,640);
fs.writeFileSync(path.join(media,'banner.svg'),banner);
app.setPath('userData',path.join(os.tmpdir(),'hex-promo-render-'+process.pid));
const ffmpeg=require('../.tools/media/node_modules/ffmpeg-static');
function run(args){return new Promise((resolve,reject)=>{const p=spawn(ffmpeg,args,{windowsHide:true});let log='';p.stderr.on('data',x=>{log+=x});p.on('error',reject);p.on('close',code=>code===0?resolve(log):reject(Error(log)))});}
function audio(){
  const rate=44100,duration=20,count=rate*duration,data=new Float32Array(count*2),beat=60/108;
  let seed=71237;const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1};
  const chords=[[220,261.6256,329.6276,391.9954],[174.6141,220,261.6256,329.6276],[130.8128,164.8138,195.9977,246.9417],[195.9977,246.9417,293.6648,329.6276]];
  for(let n=0;n<count;n++){
    const t=n/rate,bar=Math.floor(t/(beat*4)),chord=chords[bar%4],pulse=t%beat,step=Math.floor(t/(beat/2)),pluckAt=t%(beat/2),note=chord[step%4]*2;
    let l=0,r=0;
    for(let j=0;j<4;j++){const f=chord[j],a=.033*(.75+.25*Math.sin(t*.7+j));l+=a*(Math.sin(2*Math.PI*f*t)+.22*Math.sin(2*Math.PI*f*2*t));r+=a*(Math.sin(2*Math.PI*(f*1.001)*t)+.22*Math.sin(2*Math.PI*f*2.002*t));}
    const pluck=.13*Math.exp(-pluckAt*10)*Math.min(1,pluckAt*800)*(Math.sin(2*Math.PI*note*t)+.23*Math.sin(2*Math.PI*note*2*t));
    const kick=.3*Math.exp(-pulse*24)*Math.sin(2*Math.PI*(47*pulse+1.9*(1-Math.exp(-pulse*32))));
    const hat=.025*noise()*Math.exp(-pluckAt*95),snare=Math.floor(t/beat)%2===1?.07*noise()*Math.exp(-pulse*38):0;
    const bass=.075*Math.sin(2*Math.PI*(chord[0]/2)*t)*(.6+.4*Math.exp(-pulse*6));
    const fade=Math.min(1,t/.5,(duration-t)/1.3);
    data[n*2]=(l+pluck+kick+hat+snare+bass)*fade;data[n*2+1]=(r+pluck+kick+hat+snare+bass)*fade;
  }
  let peak=0;for(const v of data)peak=Math.max(peak,Math.abs(v));
  const pcm=Buffer.alloc(count*4+44);pcm.write('RIFF');pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(2,22);pcm.writeUInt32LE(rate,24);pcm.writeUInt32LE(rate*4,28);pcm.writeUInt16LE(4,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(count*4,40);
  for(let i=0;i<data.length;i++)pcm.writeInt16LE(Math.round(data[i]/peak*.78*32767),44+i*2);
  fs.writeFileSync(path.join(out,'soundtrack.wav'),pcm);
}
app.whenReady().then(async()=>{try{
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  await win.loadURL('data:text/html,<html><body></body></html>');
  const render=async(source,file)=>{const data=await win.webContents.executeJavaScript(`(async()=>{const i=new Image();i.src=${JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(source).toString('base64'))};await i.decode();const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;c.getContext('2d').drawImage(i,0,0);return c.toDataURL('image/png')})()`);fs.writeFileSync(file,Buffer.from(data.split(',')[1],'base64'));};
  for(let i=0;i<headers.length;i++)await render(headers[i],path.join(out,`header-${i}.png`));
  await render(end,path.join(out,'end.png'));await render(end,path.join(media,'video-cover.png'));await render(banner,path.join(media,'banner.png'));
  audio();
  const args=['-y','-hide_banner','-loglevel','error','-filter_complex_threads','2','-i',path.join(out,'interface.mp4'),'-i',path.join(out,'soundtrack.wav')];
  for(const file of ['header-0.png','header-1.png','header-2.png','header-3.png','end.png'])args.push('-loop','1','-framerate','24','-i',path.join(out,file));
  const times=[[0,2],[2,6],[6,9],[9,18]];
  let filters='[0:v]scale=984:615:flags=lanczos,pad=1080:1080:48:270:color=0x0b0c0e,tpad=stop_mode=clone:stop_duration=2,setsar=1[base];';
  for(let i=0;i<4;i++){const [a,b]=times[i];filters+=`[${i+2}:v]format=rgba,fade=t=in:st=${a}:d=0.22:alpha=1,fade=t=out:st=${b-.15}:d=0.15:alpha=1[h${i}];[${i===0?'base':'v'+(i-1)}][h${i}]overlay=0:0[v${i}];`;}
  filters+='[6:v]format=rgba,fade=t=in:st=18:d=0.35:alpha=1[end];[v3][end]overlay=0:0,fade=t=out:st=19.75:d=0.25[final]';
  args.push('-filter_complex',filters,'-map','[final]','-map','1:a','-t','20','-r','24','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',path.join(deliver,'HexSound-telegram.mp4'));
  await run(args);
  await run(['-y','-hide_banner','-loglevel','error','-i',path.join(deliver,'HexSound-telegram.mp4'),'-vf','fps=1/4,scale=320:320,tile=5x1','-frames:v','1',path.join(out,'contact-sheet.png')]);
  await run(['-hide_banner','-loglevel','error','-i',path.join(deliver,'HexSound-telegram.mp4'),'-f','null','-']);
  console.log('PROMO VIDEO PASS: 20 seconds, 1080x1080, 24 fps, H.264 + AAC, faststart; full decode passed');app.quit();
}catch(error){console.error('PROMO RENDER FAIL',error);app.exit(1)}});
