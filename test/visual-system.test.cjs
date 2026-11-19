const {test}=require('node:test');
const assert=require('node:assert/strict');
const V=require('../src/visual-system.js');
const {defaults,validate}=require('../src/settings.cjs');
const {themeCSS}=require('../src/soundcloud-theme.cjs');
const luminance=c=>{const a=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;};
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('every palette is readable in both modes, including alternate backgrounds',()=>{
  assert.equal(V.palettes.length,32);assert.equal(new Set(V.palettes.map(p=>p.id)).size,32);
  for(const palette of V.palettes)for(const dark of [true,false])for(const background of ['pearl','graphite','sand']){
    const p=V.resolve({...defaults,palette:palette.id,background},dark);
    for(const surface of [p.bg,p.surface]){
      assert.ok(contrast(p.ink,surface)>=7,`${palette.id}: primary text`);
      assert.ok(contrast(p.muted,surface)>=4.5,`${palette.id}: secondary text ${background}`);
      assert.ok(contrast(p.accent,surface)>=4.5,`${palette.id}: accent ${background}`);
    }
  }
});
test('old settings migrate and malformed animation values cannot enter styles',()=>{
  const migrated=validate({theme:'dark',glass:false});assert.equal(migrated.palette,'studio');assert.equal(migrated.effect,'none');assert.equal(migrated.glass,false);
  const s=validate({palette:'url(evil)',effect:'</style>',effectSpeed:Infinity,effectIntensity:1000,animationSpeed:-2,blur:'40;display:none',effectQuality:'unlimited',motionStyle:'evil'});
  assert.equal(s.palette,'studio');assert.equal(s.effect,'none');assert.equal(s.effectSpeed,1);assert.equal(s.effectIntensity,100);assert.equal(s.animationSpeed,.5);assert.equal(s.blur,24);assert.equal(s.effectQuality,'balanced');assert.equal(s.motionStyle,'silk');
  assert.equal(validate({lyricAnimation:'wave'}).lyricAnimation,'wave');assert.equal(validate({lyricAnimation:'invalid'}).lyricAnimation,'cascade');
});
test('remote and local UI use the same palette and native animations preserve reduced motion',()=>{
  for(const palette of V.palettes){const s={...defaults,palette:palette.id,effect:'aurora',respectReducedMotion:true};const p=V.resolve(s,true);const css=themeCSS(s,true);assert.ok(css.includes(p.accent));assert.ok(css.includes(p.bg));assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);}
  assert.equal(V.atmosphereConfig({...defaults,motion:false,effectPlaying:true},V.resolve(defaults,true)).animated,false);
  assert.equal(V.effects.length,10);
});
