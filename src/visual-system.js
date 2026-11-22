(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HexVisual = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Every preset has its own ground, accent and atmosphere, rather than a hue filter.
  const entries = [
    ['studio','Studio','light','#f6f7fa','#0066cc','#5da8f5','#adcce8'],
    ['midnight','Midnight','dark','#0b1222','#8aafff','#416bb4','#8b7dd4'],
    ['obsidian','Obsidian','dark','#111214','#bec6d4','#788498','#adb6c6'],
    ['deep-ocean','Deep Ocean','dark','#071b25','#5bd3e5','#086b91','#2caaa0'],
    ['aurora','Aurora','dark','#0b1d1c','#67e4bc','#227e87','#3c658e'],
    ['evergreen','Evergreen','dark','#111d17','#9bdaa9','#3d7855','#97ad64'],
    ['moss','Moss','dark','#1a1d13','#c2d18a','#66783d','#a39b62'],
    ['espresso','Espresso','dark','#211813','#e6b68b','#936343','#c39972'],
    ['copper','Copper','dark','#241815','#f1ae86','#aa5442','#cf8b4e'],
    ['ember','Ember','dark','#251411','#ffac83','#bd4f28','#e5a251'],
    ['ruby','Ruby','dark','#241218','#ff98ae','#a92e55','#d06d70'],
    ['bordeaux','Bordeaux','dark','#20131d','#e5a3c9','#81476e','#b9788c'],
    ['plum','Plum','dark','#1b1527','#c7a4ff','#7854aa','#b170b7'],
    ['iris','Iris','dark','#15152b','#aba7ff','#6558c4','#638fcf'],
    ['ultraviolet','Ultraviolet','dark','#171027','#d2a0ff','#8a45c7','#df6dad'],
    ['cobalt','Cobalt','dark','#0b162b','#82b8ff','#205da9','#4a8ebe'],
    ['arctic-night','Arctic Night','dark','#101d27','#a3d8ef','#42798f','#709bac'],
    ['solar','Solar','dark','#211c10','#f1d18a','#ac8731','#dcab64'],
    ['neon-mint','Neon Mint','dark','#0c1b1b','#76f4d1','#22917a','#46a6b2'],
    ['rose-noir','Rose Noir','dark','#22181e','#f3b6c9','#9a5d77','#b993a3'],
    ['porcelain','Porcelain','light','#f6f4ef','#6d6254','#b2aa97','#d6c9b0'],
    ['cloud','Cloud','light','#f0f4f9','#436d9c','#a8c5e5','#d0deed'],
    ['glacier','Glacier','light','#edf7f8','#137a8c','#86c6ce','#aadce0'],
    ['lagoon','Lagoon','light','#edf6f2','#207767','#8ac6b6','#bbd9cb'],
    ['matcha','Matcha','light','#f1f4e9','#5b743b','#b3c28e','#d1d8b6'],
    ['pistachio','Pistachio','light','#f5f6ec','#6b763d','#bdc498','#d8d9b4'],
    ['sandstone','Sandstone','light','#f6f0e6','#98672f','#d1b78f','#e4caa1'],
    ['latte','Latte','light','#f3ede7','#886445','#c6ac94','#dcc6b2'],
    ['peach','Peach','light','#fff1e9','#a64e2a','#f0b29b','#f4c9a5'],
    ['sakura','Sakura','light','#fbeef2','#ad426b','#dea0b7','#ecc7d5'],
    ['lavender','Lavender','light','#f2effa','#7951aa','#b6a3dc','#d5c8eb'],
    ['lemon','Lemon','light','#f8f6e9','#827022','#d6c97b','#ebe0aa']
  ];
  const palettes = entries.map(([id,name,mode,bg,accent,fx1,fx2]) => ({id,name,mode,bg,accent,fx1,fx2}));
  const effects = [
    ['none','Тишина','Чистый цвет без движения'],
    ['aurora','Северное сияние','Медленные переливы света'],
    ['orbs','Жидкий свет','Невесомые световые сферы'],
    ['waves','Шёлковые волны','Плавные линии в глубине'],
    ['stars','Звёздная пыль','Тихое мерцание частиц'],
    ['constellation','Созвездия','Движущиеся точки и связи'],
    ['rain','Дождь на стекле','Тонкие диагональные струи'],
    ['bokeh','Боке','Размытые круги света'],
    ['grid','Цифровой горизонт','Перспективная сетка'],
    ['grain','Киноплёнка','Мягкое аналоговое зерно'],
    ['nebula','Туманность','Облака света в глубине'],
    ['prism','Призма','Медленно плывущие грани'],
    ['fireflies','Светлячки','Тёплые огоньки в воздухе'],
    ['ribbons','Ленты','Переплетающиеся световые линии'],
    ['ripples','Круги на воде','Расходящиеся тонкие кольца'],
    ['snow','Снег','Спокойное движение снежинок'],
    ['comets','Кометы','Лёгкие световые следы'],
    ['pulse','Пульс','Дыхание геометрических волн']
  ].map(([id,name,description])=>({id,name,description}));
  function mix(a,b,t) { const aa=a.replace('#',''),bb=b.replace('#',''); return '#'+[0,2,4].map(i=>Math.round(parseInt(aa.slice(i,i+2),16)*(1-t)+parseInt(bb.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join(''); }
  function rgba(hex,alpha) { return `rgba(${[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(',')},${alpha})`; }
  function luminance(hex){const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
  function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  function readable(color,grounds,ink){for(let i=0;i<30&&grounds.some(bg=>contrast(color,bg)<4.7);i++)color=mix(color,ink,.06);return color;}
  function resolve(s,dark) {
    const p=palettes.find(p=>p.id===s.palette)||palettes[0];
    let bg=p.mode===(dark?'dark':'light')?p.bg:mix(p.bg,dark?'#080b12':'#ffffff',dark?.92:.94);
    if (s.background==='sand') bg=mix(bg,dark?'#64523a':'#decbab',dark?.08:.2);
    if (s.background==='graphite') bg=mix(bg,dark?'#000000':'#9298a3',dark?.35:.13);
    const ink=dark?'#f5f5f7':'#1d1d26';
    let accent=p.accent;
    if (dark&&p.mode==='light') accent=mix(accent,'#ffffff',.42);
    if (!dark&&p.mode==='dark') accent=mix(accent,'#10213b',.57);
    const surface=mix(bg,dark?'#ffffff':'#ffffff',dark?.055:.76);
    accent=readable(accent,[bg,surface],ink);
    return {...p,bg,ink,accent,surface,sidebar:mix(bg,dark?'#ffffff':'#777777',dark?.025:.025),muted:readable(mix(ink,bg,dark?.36:.35),[bg,surface],ink),line:mix(bg,ink,dark?.13:.12),selected:mix(bg,accent,dark?.18:.11),hover:mix(bg,ink,.055),fx1:p.fx1,fx2:p.fx2};
  }
  function tokens(s,p,selector='html:root[data-theme]') {
    const easings={silk:'cubic-bezier(.22,1,.36,1)',spring:'cubic-bezier(.34,1.3,.4,1)',precise:'cubic-bezier(.2,.8,.2,1)'};
    return `${selector}{--bg:${p.bg};--surface:${p.surface};--sidebar:${p.sidebar};--ink:${p.ink};--muted:${p.muted};--line:${p.line};--blue:${p.accent};--selected:${p.selected};--hover:${p.hover};--fx1:${p.fx1};--fx2:${p.fx2};--surface-glass:${rgba(p.surface,s.glass?.78:1)};--ground-glass:${rgba(p.bg,s.effect==='none'&&s.background!=='image'?1:.12)};--sidebar-glass:${rgba(p.sidebar,s.glass?.80:1)};--ease:${easings[s.motionStyle]||easings.silk};--duration:${Math.round(280/(s.animationSpeed||1))}ms;--duration-long:${Math.round(620/(s.animationSpeed||1))}ms;--blur:${s.glass?s.blur:0}px;--effect-opacity:${s.effectIntensity/100};--effect-period:${30/(s.effectSpeed||1)}s;}`;
  }
  function atmosphereConfig(s,p) { return {effect:s.effect,intensity:s.effectIntensity/100,speed:s.effectSpeed,animated:s.motion&&s.effectPlaying,respectReducedMotion:s.respectReducedMotion,quality:s.effectQuality,colors:[p.accent,p.fx1,p.fx2],dark:!!s.resolvedDark,backgroundImage:s.background==='image'?s.customBackground||'':''}; }
  return {palettes,effects,mix,rgba,resolve,tokens,atmosphereConfig};
});
