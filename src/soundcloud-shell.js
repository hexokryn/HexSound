(function(){
 const byId=id=>document.getElementById(id);
 for(const name of ['services','transfer','jobs']){const el=byId('native-'+name);if(el)byId('settings').append(el);}
 const upload=document.querySelector('.sidebar-bottom [data-route=upload]');if(upload)byId('profile-menu').append(upload);
 const tabs=document.querySelector('.settings-tabs');
 for(const [name,label] of [['transfer','Перенос'],['services','API SoundCloud'],['jobs','Результаты импорта']]){const b=document.createElement('button');b.textContent=label;b.dataset.nativeSettings=name;b.onclick=()=>window.hex.openNative(name);tabs.insertBefore(b,tabs.querySelector('.tab-indicator'));}
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{if(page!=='settings'){window.hex.showSettings(true);showPage('settings');}},true));
 const wave=document.createElement('button');wave.className='nav-item';wave.dataset.icon='radio';wave.innerHTML='<span>Моя волна</span>';wave.onclick=()=>window.hex.openNative('wave');document.querySelector('.sidebar-navigation').append(wave);renderIcons();
 document.addEventListener('hex-page',e=>{const name=e.detail,sub=['services','transfer','jobs'].includes(name);wave.classList.toggle('active',name==='wave');byId('browser').hidden=name!=='music';byId('settings-button').classList.toggle('active',sub||name==='settings');tabs.querySelectorAll('[data-native-settings]').forEach(b=>b.classList.toggle('selected',b.dataset.nativeSettings===name));if(sub){tabs.querySelectorAll('[data-tab]').forEach(b=>b.classList.remove('selected'));requestAnimationFrame(()=>{tabs.querySelector('.selected')?.scrollIntoView({block:'nearest',inline:'center'});moveTabIndicator();});}document.querySelector('.settings-footer').hidden=sub;});
 window.hex.getSettings().then(s=>{document.querySelector('.settings-footer>span').textContent='HexSound '+s.version+' · SoundCloud';});
})();
