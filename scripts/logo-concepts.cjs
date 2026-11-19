const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const out = path.resolve(__dirname, '../design/logo-options');
const stroke = 'fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';
const concepts = [
  {id:'01', file:'mono', name:'Моно', shape:`<path ${stroke} d="M20 12v40m0-20a12 12 0 0 1 24 0v20"/>`},
  {id:'02', file:'pulse', name:'Пульс', shape:'<rect x="16" y="23" width="6" height="18" rx="3"/><rect x="29" y="12" width="6" height="40" rx="3"/><rect x="42" y="19" width="6" height="26" rx="3"/>'},
  {id:'03', file:'loop', name:'Петля', shape:`<path ${stroke} d="M44 19C39 12 25 12 20 21C13 34 51 29 44 43C39 53 25 53 20 45"/>`},
  {id:'04', file:'record', name:'Диск', shape:`<path ${stroke} d="M31 13a19 19 0 1 0 20 20M32 32l15-15"/><circle cx="32" cy="32" r="3.5"/>`},
  {id:'05', file:'flow', name:'Волна', shape:`<path ${stroke} d="M11 35c8 0 7-13 15-13s6 20 14 20 7-13 13-13"/>`},
  {id:'06', file:'shift', name:'Сдвиг', shape:'<path d="M18 14h7v23l14-10V14h7v36h-7V35L25 45v5h-7z"/>'},
];

fs.mkdirSync(out, {recursive:true});
for (const c of concepts) {
  c.svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="currentColor">${c.shape}</svg>`;
  fs.writeFileSync(path.join(out, `${c.id}-${c.file}.svg`), c.svg);
}
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>HexSound — варианты знака</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:1440px;height:1080px;background:#f4f3f0;color:#191a1b;font-family:Arial,sans-serif}
body{padding:62px 72px 38px}.head{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:33px;border-bottom:1px solid #d6d5d1}
h1{margin:0;font-size:32px;letter-spacing:-1.5px;font-weight:600}.head span{font-size:14px;color:#747571;letter-spacing:.2px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:398px 398px}.option{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;border-bottom:1px solid #d6d5d1}
.option:not(:nth-child(3n)){border-right:1px solid #d6d5d1}.option:nth-child(n+4){border-bottom:0}.large{width:116px;height:116px;display:block;margin-top:2px}
.lockup{display:flex;align-items:center;gap:8px;margin-top:28px;height:28px;font-size:18px;font-weight:600;letter-spacing:-.65px}.lockup svg{width:25px;height:25px}
.label{position:absolute;left:27px;bottom:25px;display:flex;align-items:center;gap:12px;font-size:13px;color:#777873}.label b{font-size:12px;color:#262727;font-weight:500;font-variant-numeric:tabular-nums}
.footer{display:flex;justify-content:space-between;padding-top:23px;border-top:1px solid #d6d5d1;color:#777873;font-size:12px}
</style><div class="head"><h1>HexSound</h1><span>Шесть вариантов знака</span></div><main class="grid">${concepts.map(c=>`<section class="option">${c.svg.replace('<svg ', '<svg class="large" ')}<div class="lockup">${c.svg}<span>HexSound</span></div><div class="label"><b>${c.id}</b><span>${c.name}</span></div></section>`).join('')}</main><div class="footer"><span>Одна краска · Без рамки · Прозрачный фон</span><span>01 — 06</span></div></html>`;
fs.writeFileSync(path.join(out, 'index.html'), html);
const board = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1080" viewBox="0 0 1440 1080" fill="#191a1b" color="#191a1b" font-family="Arial, sans-serif">
<rect width="1440" height="1080" fill="#f4f3f0"/>
<text x="72" y="92" font-size="32" font-weight="600" letter-spacing="-1.5">HexSound</text>
<text x="1368" y="91" text-anchor="end" font-size="14" fill="#747571">Шесть вариантов знака</text>
<path d="M72 134H1368M72 532H1368M72 930H1368M504 134V930M936 134V930" fill="none" stroke="#d6d5d1"/>
${concepts.map((c,i)=>{const x=72+(i%3)*432,y=134+Math.floor(i/3)*398;return `<svg x="${x+158}" y="${y+100}" width="116" height="116" viewBox="0 0 64 64">${c.shape}</svg><svg x="${x+145}" y="${y+255}" width="25" height="25" viewBox="0 0 64 64">${c.shape}</svg><text x="${x+178}" y="${y+274}" font-size="18" font-weight="600" letter-spacing="-.65">HexSound</text><text x="${x+27}" y="${y+373}" font-size="12">${c.id}</text><text x="${x+56}" y="${y+373}" font-size="13" fill="#777873">${c.name}</text>`}).join('')}
<text x="72" y="965" font-size="12" fill="#777873">Одна краска · Без рамки · Прозрачный фон</text>
<text x="1368" y="965" text-anchor="end" font-size="12" fill="#777873">01 — 06</text></svg>`;
fs.writeFileSync(path.join(out, 'six-logos.svg'), board);
app.setPath('userData', path.join(os.tmpdir(), `hexsound-concepts-${process.pid}`));
app.whenReady().then(async()=>{
  try {
    const win = new BrowserWindow({show:false,width:1440,height:1080,useContentSize:true,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    await win.loadURL('data:text/html,<html><body></body></html>');
    const data = await win.webContents.executeJavaScript(`(async()=>{const image=new Image();image.src=${JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(board).toString('base64'))};await image.decode();const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=1080;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/png');})()`);
    fs.writeFileSync(path.join(out, 'six-logos.png'), Buffer.from(data.split(',')[1], 'base64'));
    console.log(path.join(out, 'six-logos.png'));
    app.quit();
  } catch(error) { console.error(error);app.exit(1); }
});
