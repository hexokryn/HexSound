(function(){
 const byId=id=>document.getElementById(id),make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const dock=make('div');dock.hidden=true;dock.id='legacy-controls';document.body.append(dock);
 const navigation=document.querySelector('.sidebar-navigation'),group=make('div');group.className='nav-group unified-navigation';
 const originals=[...navigation.children];
 const wave=[...navigation.querySelectorAll('.feature-nav')].find(e=>e.title==='Моя волна'),queue=[...navigation.querySelectorAll('.feature-nav')].find(e=>e.title==='Очередь'),smart=[...navigation.querySelectorAll('.feature-nav')].find(e=>e.title==='Умные плейлисты');
 byId('library-button').querySelector('span').textContent='Медиатека';
 for(const el of [byId('library-button'),wave,queue,smart,byId('player-button')])if(el)group.append(el);
 const history=make('button');history.className='nav-item';history.dataset.icon='clock';history.append(make('span','История'));history.onclick=()=>window.hex.openNative('listening');group.append(history);
 for(const old of originals)dock.append(old);navigation.replaceChildren(group);
 for(const el of document.querySelectorAll('.sidebar-bottom [data-route=upload]'))dock.append(el);
 const tabs=document.querySelector('.settings-tabs');
 for(const [name,label] of [['services','Подключения'],['transfer','Перенос']]){const b=make('button',label);b.dataset.nativeSettings=name;b.onclick=()=>window.hex.openNative(name);tabs.insertBefore(b,tabs.querySelector('.tab-indicator'));}
 const tools=make('section');tools.dataset.panel='library-tools';tools.hidden=true;tools.className='settings-tools';tools.innerHTML='<div class="section-heading"><h2>Управление медиатекой</h2></div><div class="setting-card" id="library-tools-links"></div><div id="library-files-settings"></div>';
 document.querySelector('.settings-panels').append(tools);
 for(const [name,label,description] of [['local','Музыка на устройстве','Добавление и обновление музыкальных папок'],['duplicates','Совпадения','Объединение записей и разделение источников'],['jobs','История переносов','Продолжение операций и отчёты']]){const b=make('button');b.className='setting-row tool-link';const text=make('span');text.append(make('strong',label),make('small',description));b.append(text,make('span','↗'));b.onclick=()=>window.hex.openNative(name);byId('library-tools-links').append(b);}
 const fileTools=document.querySelector('.library-files');if(fileTools){fileTools.open=true;byId('library-files-settings').append(fileTools);}
 const toolsTab=make('button','Медиатека');toolsTab.dataset.tab='library-tools';toolsTab.onclick=async()=>{await showSettings();document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b===toolsTab));document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p!==tools);moveTabIndicator();};tabs.insertBefore(toolsTab,tabs.querySelector('.tab-indicator'));
 const accountTab=document.querySelector('[data-tab=account]');accountTab.hidden=true;accountTab.onclick=()=>window.hex.openNative('services');
 for(const name of ['services','transfer','local','duplicates','jobs']){const el=byId('native-'+name);if(el)byId('settings').append(el);}
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{if(page!=='settings'&&b!==accountTab){window.hex.showSettings(true);showPage('settings');}},true));
 byId('library-service').closest('label').hidden=true;byId('wave-service').closest('label').hidden=true;byId('smart-service').closest('label').hidden=true;byId('library-transfer').hidden=true;byId('library-connect').textContent='Подключения';byId('library-connect').classList.add('subtle-link');
 const toolbar=document.querySelector('.library-toolbar');const actions=[...toolbar.querySelectorAll(':scope > button')].filter(b=>b.id!=='library-refresh');const menu=make('details');menu.className='library-more';const summary=make('summary','•••');summary.setAttribute('aria-label','Действия с выбранными записями');menu.append(summary);const panel=make('div');for(const b of actions)panel.append(b);menu.append(panel);toolbar.append(menu);
 const badges=document.querySelectorAll('.provider-badge');badges.forEach(b=>b.hidden=true);
 const connect=()=>window.hex.openNative('services');for(const id of ['login-button','account-login','profile-settings'])byId(id).addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();connect();},true);
 const footer=(snapshot)=>{byId('profile-menu-name').textContent=snapshot?.profile?.name||'Аккаунты';byId('profile-caption').textContent='Аккаунты';if(/^(Spotify|SoundCloud|YouTube Music|Яндекс Музыка|Файл)$/.test(byId('account-login').textContent))byId('account-login').textContent='Аккаунты';if(byId('account-login').textContent==='Войти в аккаунт')byId('account-login').textContent='Подключить музыку';};window.hex.on('playback',footer);footer();
 document.addEventListener('hex-page',event=>{const name=event.detail;for(const [element,target] of [[wave,'wave'],[queue,'queue'],[smart,'smart']])element?.classList.toggle('active',name===target);const sub=['services','transfer','local','duplicates','jobs'].includes(name);tabs.querySelectorAll('[data-native-settings]').forEach(b=>b.classList.toggle('selected',b.dataset.nativeSettings===name));if(sub){tabs.querySelectorAll('[data-tab]').forEach(b=>b.classList.remove('selected'));requestAnimationFrame(()=>{tabs.querySelector('.selected')?.scrollIntoView({block:'nearest',inline:'center'});moveTabIndicator();});}document.querySelector('.settings-footer').hidden=sub;byId('settings-button').classList.toggle('active',name==='settings'||sub);byId('browser').hidden=name!=='music';byId('search').placeholder='Поиск музыки';document.querySelectorAll('.settings-aside').forEach(e=>e.hidden=sub);});
 byId('background-hint').textContent='Фон и эффекты применяются ко всему приложению.';
 byId('profile-logout').textContent='Управление аккаунтами';byId('profile-logout').addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();connect();},true);for(const b of [...byId('profile-menu').querySelectorAll('[data-route]')])dock.append(b);renderIcons();
})();

window.hex.getSettings().then(s=>{document.querySelector('.settings-footer>span').textContent='HexSound '+s.version+' · Музыкальная библиотека';});
