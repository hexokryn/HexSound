const icons = {
 compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>', radio:'<circle cx="12" cy="12" r="2"/><path d="M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16"/>', library:'<path d="M4 4v16M9 4v16M14 4l5 16M3 20h18"/>', heart:'<path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4L12 21l8.8-8a5.2 5.2 0 0 0 0-7.4Z"/>', playlist:'<path d="M4 5h15M4 10h15M4 15h8M17 14v7m-3-3h6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',settings:'<path d="m10 3-.6 2.2-2 .9-2-.6-2 3.5 1.6 1.6v2.8L3.4 15l2 3.5 2-.6 2 .9.6 2.2h4l.6-2.2 2-.9 2 .6 2-3.5-1.6-1.6v-2.8L20.6 9l-2-3.5-2 .6-2-.9L14 3Z"/><circle cx="12" cy="12" r="3"/>',user:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',back:'<path d="m14 5-7 7 7 7"/>',forward:'<path d="m10 5 7 7-7 7"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',reload:'<path d="M20 7v5h-5M4 17v-5h5M19 11a7 7 0 0 0-12-5L4 9m16 6-3 3A7 7 0 0 1 5 13"/>',external:'<path d="M14 3h7v7M21 3 11 13M10 5H4v15h15v-6"/>',cloud:'<path d="M7 18h11a5 5 0 0 0 0-10A7 7 0 0 0 4.5 8 5 5 0 0 0 7 18Z"/>',layers:'<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',sparkles:'<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3ZM20 2v4m-2-2h4"/>',square:'<rect x="4" y="4" width="16" height="16" rx="5"/>',image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',play:'<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',pause:'<path d="M9 5v14M16 5v14" stroke-width="4"/>',previous:'<path d="M5 5v14m14-14L8 12l11 7Z" fill="currentColor"/>',next:'<path d="M19 5v14M5 5l11 7-11 7Z" fill="currentColor"/>',shuffle:'<path d="M3 6h3l12 12h3m-4-4 4 4-4 4M3 18h3l4-4m4-4 4-4h3m-4-4 4 4-4 4"/>',repeat:'<path d="m17 2 4 4-4 4M3 11V6h18M7 22l-4-4 4-4m14-1v5H3"/>'
};
const $ = s => document.querySelector(s);
function renderIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { if (el.querySelector('svg')) return; el.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[el.dataset.icon] || icons.square}</svg>`); }); }
function rows(target, items) { $(target).innerHTML = items.map(([key, name, description, icon]) => `<label class="setting-row">${icon ? `<span class="setting-icon" data-icon="${icon}"></span>` : ''}<span class="setting-copy"><strong>${name}</strong><small>${description}</small></span><input type="checkbox" data-setting="${key}" role="switch"></label>`).join(''); }
rows('#nav-settings', [['showFeed','Моя лента','Новые публикации ваших подписок','radio'],['showLikes','Любимые треки','Музыка, которую вы отметили','heart'],['showPlaylists','Плейлисты','Ваши музыкальные подборки','playlist'],['showHistory','История','Недавно прослушанные треки','clock'],['showUpload','Загрузка музыки','Публикация ваших треков','upload']]);
rows('#content-settings', [['showRecommendations','Рекомендации','Боковая колонка с похожей музыкой'],['showComments','Комментарии','Обсуждения на страницах треков'],['showStats','Статистика треков','Счётчики прослушиваний и активности']]);
rows('#general-settings', [['closeToTray','Сворачивать в трей при закрытии','Музыка продолжит играть в фоне','square'],['launchAtLogin','Запускать вместе с Windows','Открывать HexSound при входе в систему','sparkles'],['notifications','Разрешить уведомления SoundCloud','Показывать уведомления, отправленные сайтом','radio']]);
const Visual=window.HexVisual;
$('#palette-grid').innerHTML=Visual.palettes.map(p=>`<button class="palette-card" data-palette="${p.id}" data-mode="${p.mode}" aria-pressed="false"><span class="palette-art"><i class="palette-rail"></i><span class="palette-cover"></span><span class="palette-lines"><i></i><i></i><i></i></span><i class="palette-dot"></i><span class="palette-selected">✓</span></span><span class="palette-name">${p.name}<i></i></span></button>`).join('');
document.querySelectorAll('[data-palette]').forEach(el=>{
  const p=Visual.resolve({palette:el.dataset.palette,background:'pearl'},el.dataset.mode==='dark');
  for(const [key,value] of Object.entries({'--card-bg':p.bg,'--card-surface':p.surface,'--card-ink':p.ink,'--card-accent':p.accent,'--card-fx':p.fx2}))el.style.setProperty(key,value);
});
$('#effect-grid').innerHTML=Visual.effects.map(e=>`<button class="effect-card" data-effect="${e.id}" aria-pressed="false"><span class="effect-art" data-fx="${e.id}"><i></i><i></i><i></i><i></i><b>✓</b></span><strong>${e.name}</strong><small>${e.description}</small></button>`).join('');
renderIcons();
document.querySelectorAll('.nav-item').forEach(el => { const label = el.querySelector('span')?.textContent.trim(); if (label) { el.setAttribute('aria-label', label); el.title = label; } });
let state = {}, page = 'music', toastTimer, themeFilter='all', saveTimer, saveRevision=0, pendingSaves=0, pendingPatch={}, saveQueue=Promise.resolve();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function canAnimate(){return state.motion&&(!state.respectReducedMotion||!reduced.matches);}
function enter(el){if(!el||!canAnimate())return;el.animate([{opacity:0,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:440/(state.animationSpeed||1),easing:'cubic-bezier(.22,1,.36,1)'});}
function moveTabIndicator(){ const button=$('.settings-tabs .selected');if(button){$('.tab-indicator').style.width=button.offsetWidth+'px';$('.tab-indicator').style.transform=`translateX(${button.offsetLeft}px)`;} }
new ResizeObserver(moveTabIndicator).observe($('.settings-tabs'));
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4000); }
function apply(s) {
  const themeChanged=state.palette!==s.palette||state.resolvedDark!==s.resolvedDark;
  const navPositions=new Map([...document.querySelectorAll('.sidebar .nav-item')].filter(el=>!el.hidden).map(el=>[el,el.getBoundingClientRect().top]));
  state = s;
  document.documentElement.dataset.sidebarCollapsed=String(!!s.sidebarCollapsed);
  if(typeof syncSidebar==='function')syncSidebar();
  const root = document.documentElement;
  const palette=Visual.resolve(s,s.resolvedDark);
  const updateLook=()=>{ $('#visual-tokens').textContent=Visual.tokens(s,palette);root.dataset.theme=s.resolvedDark?'dark':'light'; };
  if(themeChanged&&canAnimate()&&document.startViewTransition&&!document.hidden) {
    if(window.hexThemeTransition)window.hexThemeTransition.skipTransition();
    window.hexThemeTransition=document.startViewTransition(updateLook);
    window.hexThemeTransition.ready.catch(()=>{});
  } else updateLook();
  root.dataset.theme = s.resolvedDark ? 'dark' : 'light'; root.dataset.motion = s.motion; root.dataset.rounded = s.roundedArtwork; root.dataset.glass = s.glass; root.dataset.background = s.background;
  root.dataset.effect=s.effect;root.dataset.playing=!!s.effectPlaying&&!!s.motion;root.dataset.motionStyle=s.motionStyle;
  root.dataset.reduceMotion=s.respectReducedMotion?'system':'ignore';
  if(!canAnimate()){document.getAnimations().forEach(a=>a.cancel());if(window.hexThemeTransition)window.hexThemeTransition.skipTransition();}
  window.HexAtmosphere.mount(Visual.atmosphereConfig(s,palette));
  document.querySelectorAll('[data-setting]').forEach(el => { el.type === 'checkbox' ? el.checked = s[el.dataset.setting] : el.value = s[el.dataset.setting]; });
  document.querySelectorAll('[data-theme]').forEach(el => { if (el.tagName === 'BUTTON') { el.classList.toggle('selected', el.dataset.theme === s.theme); el.setAttribute('aria-pressed', String(el.dataset.theme === s.theme)); } });
  document.querySelectorAll('[data-background]').forEach(el => { if (el.tagName === 'BUTTON') el.classList.toggle('selected', el.dataset.background === s.background); });
  $('#choose-background').classList.toggle('selected', s.background === 'image');
  document.querySelectorAll('[data-palette]').forEach(el=>{el.classList.toggle('selected',el.dataset.palette===s.palette);el.setAttribute('aria-pressed',String(el.dataset.palette===s.palette));});
  document.querySelectorAll('button[data-effect]').forEach(el=>{el.classList.toggle('selected',el.dataset.effect===s.effect);el.setAttribute('aria-pressed',String(el.dataset.effect===s.effect));});
  document.querySelectorAll('[data-motion-style]').forEach(el=>{el.classList.toggle('selected',el.dataset.motionStyle===s.motionStyle);el.setAttribute('aria-pressed',String(el.dataset.motionStyle===s.motionStyle));});
  document.querySelectorAll('[data-output]').forEach(el=>{const key=el.dataset.output;el.textContent=key==='effectIntensity'?s[key]+'%':key==='blur'?s[key]+' px':Number(s[key]).toFixed(2).replace(/0$/,'')+'×';});
  $('#active-palette-name').textContent=palette.name;
  $('#active-effect-name').textContent=(Visual.effects.find(e=>e.id===s.effect)?.name||'Тишина')+(s.effect!=='none'&&!s.effectPlaying?' · пауза':'');
  $('#pause-atmosphere').lastChild.textContent=s.effectPlaying?' Пауза фона':' Продолжить фон';
  $('#pause-atmosphere').disabled=s.effect==='none'||!s.motion;
  $('#pause-atmosphere').setAttribute('aria-pressed',String(!s.effectPlaying));
  document.querySelectorAll('[data-feature]').forEach(el => el.hidden = !s[el.dataset.feature]);
  if(canAnimate())for(const [el,top] of navPositions){if(el.hidden)continue;const delta=top-el.getBoundingClientRect().top;if(delta)el.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:450/s.animationSpeed,easing:'cubic-bezier(.22,1,.36,1)'});}
  $('#background-hint').textContent = s.background === 'image' ? 'Ваше фото используется во всём приложении. Эффект можно наложить поверх.' : 'Оттенок фона сочетается с выбранной темой. Живые фоны — во вкладке «Атмосфера».';
}
function save(patch,delay=0) {
  pendingPatch={...pendingPatch,...patch};clearTimeout(saveTimer);const revision=++saveRevision;
  const optimistic={...state,...pendingPatch};
  if(patch.theme==='dark'||patch.theme==='light')optimistic.resolvedDark=patch.theme==='dark';
  apply(optimistic);$('#save-status').textContent='Сохраняем…';
  const flush=()=>{const changes=pendingPatch;pendingPatch={};pendingSaves++;
    saveQueue=saveQueue.catch(()=>{}).then(()=>window.hex.saveSettings(changes)).then(s=>{pendingSaves--;if(revision===saveRevision){apply(s);$('#save-status').textContent='✓ Изменения сохранены';}}).catch(e=>{pendingSaves--;toast('Не удалось сохранить: '+e.message);$('#save-status').textContent='Ошибка сохранения';});
  };
  if(delay)saveTimer=setTimeout(flush,delay);else flush();
}
function showPage(next) { page = next;document.querySelectorAll('.native-page').forEach(el=>el.hidden=el.id!=='native-'+next);$('#player').hidden=next!=='player'; $('#settings').hidden = next !== 'settings'&&!['services','transfer','local','duplicates','jobs'].includes(next);$('.settings-layout').hidden=['services','transfer','local','duplicates','jobs'].includes(next); $('#loading').hidden = next !== 'music'; $('#error').hidden = true;$('#profile-menu').hidden=true;$('#profile-menu-button').setAttribute('aria-expanded','false');$('#player-button').classList.toggle('active',next==='player'); $('#settings-button').classList.toggle('active', next === 'settings'); if (next !== 'music') document.querySelectorAll('.nav-item[data-route]').forEach(el => el.classList.remove('active'));document.dispatchEvent(new CustomEvent('hex-page',{detail:next})); }
async function showSettings() { await window.hex.showSettings(true); showPage('settings');requestAnimationFrame(moveTabIndicator);enter($('#settings')); }
document.querySelectorAll('[data-window]').forEach(el => el.onclick = () => window.hex.window(el.dataset.window));
document.querySelectorAll('[data-route]').forEach(el => el.onclick = () => { document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); el.classList.add('active'); showPage('music'); window.hex.navigate(el.dataset.route); });
document.querySelectorAll('button[data-theme]').forEach(el => el.onclick = () => save({ theme: el.dataset.theme }));
document.querySelectorAll('button[data-background]').forEach(el => el.onclick = () => save({ background: el.dataset.background }));
document.querySelectorAll('[data-setting]').forEach(el=>{
  const change=delay=>save({[el.dataset.setting]:el.type==='checkbox'?el.checked:['range'].includes(el.type)||el.dataset.setting==='zoom'?Number(el.value):el.value},delay);
  el.onchange=()=>change(0);if(el.type==='range')el.oninput=()=>change(140);
});
document.querySelectorAll('[data-palette]').forEach(el=>el.onclick=()=>{save({palette:el.dataset.palette,theme:el.dataset.mode});});
document.querySelectorAll('button[data-effect]').forEach(el=>el.onclick=()=>save({effect:el.dataset.effect,effectPlaying:true}));
document.querySelectorAll('[data-motion-style]').forEach(el=>el.onclick=()=>{save({motionStyle:el.dataset.motionStyle});enter(el);});
document.querySelectorAll('[data-filter]').forEach(el=>el.onclick=()=>{themeFilter=el.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('selected',b===el);b.setAttribute('aria-pressed',String(b===el));});document.querySelectorAll('[data-palette]').forEach(b=>b.hidden=themeFilter!=='all'&&b.dataset.mode!==themeFilter);enter($('#palette-grid'));});
document.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => { document.querySelectorAll('[data-tab]').forEach(t => { t.classList.toggle('selected', t === el); t.setAttribute('aria-selected', t === el); }); document.querySelectorAll('[data-panel]').forEach(p => {p.hidden = p.dataset.panel !== el.dataset.tab;if(!p.hidden)enter(p);});moveTabIndicator();$('#content').scrollTo({top:0,behavior:canAnimate()?'smooth':'instant'}); });
$('#pause-atmosphere').onclick=()=>save({effectPlaying:!state.effectPlaying});
$('#shuffle-look').onclick=()=>{const choices=Visual.palettes.filter(p=>p.id!==state.palette),p=choices[Math.floor(Math.random()*choices.length)];save({palette:p.id,theme:p.mode});};
$('#replay-motion').onclick=()=>{if(!canAnimate()){toast('Включите анимации или отключите системное уменьшение движения.');return;}document.querySelectorAll('#motion-playground i').forEach((el,i)=>el.animate([{opacity:0,transform:'translateY(35px) scale(.5)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:850/state.animationSpeed,delay:i*90,easing:state.motionStyle==='spring'?'cubic-bezier(.34,1.5,.4,1)':'cubic-bezier(.22,1,.36,1)'}));enter($('#motion-playground span'));};
$('#settings-button').onclick = showSettings; $('#error-settings').onclick = showSettings;
$('#menu-toggle').onclick=()=>innerWidth<640?window.hex.showSidebar(document.documentElement.dataset.sidebarOpen!=='true'):save({sidebarCollapsed:!state.sidebarCollapsed});
$('#sidebar-scrim').onclick=()=>window.hex.showSidebar(false);
function syncSidebar(){ const narrow=innerWidth<640,open=narrow?document.documentElement.dataset.sidebarOpen==='true':!state.sidebarCollapsed;$('#app-sidebar').inert=!open;$('#menu-toggle').setAttribute('aria-expanded',String(open));$('#menu-toggle').setAttribute('aria-label',open?'Скрыть боковую панель':'Показать боковую панель'); }
matchMedia('(max-width:639px)').addEventListener('change',syncSidebar);syncSidebar();
window.hex.on('sidebar',open=>{document.documentElement.dataset.sidebarOpen=String(open);syncSidebar();if(open)$('#app-sidebar .nav-item').focus();else if(innerWidth<640)$('#menu-toggle').focus();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.documentElement.dataset.sidebarOpen==='true')window.hex.showSidebar(false);});
$('.brand').onclick = e => { e.preventDefault(); showPage('music'); window.hex.navigate('discover'); };
$('#return-music').onclick = () => { showPage('music'); window.hex.showSettings(false); };
$('#search-form').onsubmit = e => { e.preventDefault(); if ($('#search').value.trim()) { showPage('music'); window.hex.search($('#search').value); $('#search').blur(); } };
$('#back').onclick = () => window.hex.history('back'); $('#forward').onclick = () => window.hex.history('forward');
$('#reload').onclick = $('#retry').onclick = () => { showPage('music'); window.hex.reload(); };
$('#browser').onclick = () => window.hex.openBrowser();
$('#login-button').onclick = $('#account-login').onclick = $('#settings-login').onclick = () => { showPage('music'); window.hex.login(); };
$('#choose-background').onclick = async () => { try { const s = await window.hex.chooseBackground(); if (s) apply(s); } catch (e) { toast(e.message); } };
$('#clear-cache').onclick = async () => { try { await window.hex.clearCache(); toast('Кэш очищен'); } catch { toast('Не удалось очистить кэш'); } };
$('#reset-settings').onclick = async () => { if (confirm('Вернуть исходные настройки HexSound?')) apply(await window.hex.resetSettings()); };
$('#logout').onclick = async () => { if (await window.hex.logout()) { showPage('music'); toast('Вы вышли из SoundCloud'); } };
document.addEventListener('keydown', e => { if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search').focus(); } if (e.ctrlKey && e.code === 'Comma') { e.preventDefault(); showSettings(); } if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); window.hex.reload(); } if (e.altKey && e.key === 'ArrowLeft') window.hex.history('back'); });
window.hex.on('settings',s=>{if(!pendingSaves&&!Object.keys(pendingPatch).length)apply(s);}); window.hex.on('page',next=>{showPage(next);if(next==='settings'){requestAnimationFrame(moveTabIndicator);enter($('#settings'));}});
window.hex.on('focus-search', () => $('#search').focus());
window.hex.on('status', s => { if (s.error&&page==='music') { $('#loading').hidden = true; $('#settings').hidden = true; $('#error').hidden = false; $('#error-detail').textContent = s.error; } if ('loading' in s) { $('#connection').classList.toggle('loading', s.loading); $('#connection').lastChild.textContent = s.loading ? ' подключение…' : ' soundcloud.com'; } });
window.hex.on('location', s => { $('#back').disabled = !s.back; $('#forward').disabled = !s.forward; });
window.hex.getSettings().then(apply).catch(e => toast(e.message));
