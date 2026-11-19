const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {defaults,validate}=require('../src/settings.cjs'),V=require('../src/visual-system.js'),{themeCSS}=require('../src/soundcloud-theme.cjs');
test('constellation is not obscured by the content layer or a full-page blur',()=>{
  const s={...defaults,palette:'obsidian',background:'graphite',effect:'constellation',glass:true,blur:24};const p=V.resolve(s,true);const css=themeCSS(s,true);
  assert.ok(css.includes(`background:${V.rgba(p.bg,.16)}!important; backdrop-filter:none!important`));
  assert.ok(V.tokens(s,p).includes(`--ground-glass:${V.rgba(p.bg,.12)}`));
});
test('cover motion and persistent sidebar state reject invalid values',()=>{
  const s=validate({sidebarCollapsed:true,artworkMotion:'turn',artworkTilt:false});assert.equal(s.sidebarCollapsed,true);assert.equal(s.artworkMotion,'turn');assert.equal(s.artworkTilt,false);
  assert.equal(validate({artworkMotion:'arbitrary-code',sidebarCollapsed:'true'}).artworkMotion,'float');assert.equal(validate({sidebarCollapsed:'true'}).sidebarCollapsed,false);
});
test('photo background is provided to both atmosphere engines',()=>{
  const s={...defaults,background:'image',customBackground:'data:image/png;base64,YQ=='};const c=V.atmosphereConfig(s,V.resolve(s,true));assert.equal(c.backgroundImage,s.customBackground);
  assert.equal(V.atmosphereConfig({...s,background:'pearl'},V.resolve(s,true)).backgroundImage,'');
});
test('the player has one compact options menu and no promotional preview',()=>{
  const html=fs.readFileSync(require('node:path').join(__dirname,'../src/index.html'),'utf8');
  assert.match(html,/id="player-options"/);assert.doesNotMatch(html,/HEX STUDIO|feel<br>the sound|МУЗЫКА БЛИЖЕ|32 ТЕМЫ · БЕЗ ОГРАНИЧЕНИЙ|Музыка обретает слова/);
  for(const id of ['player-import','lyrics-replay','lyrics-retry','record-link'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
});
