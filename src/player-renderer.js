(function(){
  function createPlaybackClock({now=()=>performance.now(),wallNow=()=>Date.now()}={}){
    let anchor=0,anchorAt=now(),playing=false,duration=Infinity,key='',sampledAt=0,pendingSeek=null;
    const clamp=value=>Math.max(0,Math.min(duration,Number.isFinite(value)?value:0));
    const read=()=>clamp(anchor+(playing?(now()-anchorAt)/1000:0));
    return {
      read,
      update(track,{key:nextKey='',sampledAt:nextSample=0}={}){
        const changed=nextKey!==key;
        const stamp=Number.isFinite(nextSample)&&nextSample>0?nextSample:0;
        if(!changed&&stamp&&sampledAt&&stamp<sampledAt)return false;
        if(!changed&&pendingSeek&&stamp&&stamp<pendingSeek.wallAt)return false;
        const current=read(),at=now(),nextPlaying=!!track.playing&&track.clockKnown!==false;
        duration=Number.isFinite(track.duration)&&track.duration>0?track.duration:Infinity;
        const age=stamp?Math.max(0,Math.min(2000,wallNow()-stamp))/1000:0;
        const observed=clamp((Number.isFinite(track.position)?track.position:0)+(nextPlaying?age:0));
        if(changed)pendingSeek=null;
        if(pendingSeek&&at-pendingSeek.at<2000&&Math.abs(observed-current)>1){
          // The next poll can still describe playback before the seek command.
          anchor=current;anchorAt=at;playing=nextPlaying;return true;
        }
        pendingSeek=null;key=nextKey;sampledAt=stamp;anchor=observed;anchorAt=at;playing=nextPlaying;
        return true;
      },
      seek(position){anchor=clamp(position);anchorAt=now();pendingSeek={at:anchorAt,wallAt:wallNow()};}
    };
  }
  function lineAt(lines,at){let low=0,high=lines.length-1,index=-1;while(low<=high){const mid=(low+high)>>1;if(lines[mid].time<=at){index=mid;low=mid+1;}else high=mid-1;}return index;}
  function canControl(track,action){return !!track.available&&(!track.controls||track.controls[action]===true);}
  if(typeof module==='object'&&module.exports){module.exports={createPlaybackClock,lineAt,canControl};return;}
  window.HexPlaybackClock=createPlaybackClock;
  const clock=createPlaybackClock();
  let live={profile:{loggedIn:false},track:{available:false}},lyrics={status:'idle',lines:[]},lyricsKey='',requestVersion=0,activeLine=-2,follow=true,frame=0,scrubbing=false,online;
  const trackKey=t=>[t.url,t.title,t.artist,Math.round(t.duration||0)].join('|');
  const time=seconds=>{const n=Math.max(0,Math.floor(seconds||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
  const motion=window.HexLyricMotion;
  const syncArtwork=()=>window.HexArtwork.mount({enabled:!!state.motion&&page==='player',playing:!!live.track.playing,mode:state.artworkMotion||'float',tilt:state.artworkTilt!==false,respectReducedMotion:!!state.respectReducedMotion});
  const motionOptions=()=>({enabled:canAnimate(),speed:state.animationSpeed||1,style:state.lyricAnimation||'cascade'});
  function revealActive(replay=false,at=position()){const active=$('.lyric-line.is-active');if(!active)return;const index=Number(active.dataset.index);motion.activate(active,{...motionOptions(),windowSeconds:(lyrics.lines[index+1]?.time??lyrics.lines[index].time+4)-lyrics.lines[index].time,elapsedSeconds:replay===true?0:Math.max(0,at-lyrics.lines[index].time)});}
  function icon(button,name){if(button.dataset.currentIcon===name)return;button.dataset.currentIcon=name;button.querySelector('svg')?.remove();button.dataset.icon=name;renderIcons(button.parentElement);}
  function image(el,src){if(src){if(el.getAttribute('src')!==src)el.src=src;el.hidden=false;}else{el.hidden=true;el.removeAttribute('src');}el.onerror=()=>{el.hidden=true;if(el.id==='profile-avatar')$('#login-button').classList.remove('has-avatar');};}
  function position(){return clock.read();}
  function syncClockPresentation(){
    if(lyrics.status!=='synced')return;
    const known=live.track.clockKnown!==false,root=$('#lyrics-lines');root.dataset.synced=String(known);
    $('#lyrics-mode').textContent=known?'LIVE LYRICS':'ТЕКСТ БЕЗ СИНХРОНИЗАЦИИ';
    $('#lyrics-source').textContent=(lyrics.source==='Локальный LRC'?'Локальный файл':lyrics.source||'')+(!known?' · Сервис не передаёт позицию':live.track.clockEstimated?' · Оценка позиции':'');
    if(!known){activeLine=-2;motion.activate(null,{enabled:false});for(const line of root.children){line.classList.remove('is-active','is-near','is-past');line.removeAttribute('aria-current');}}
  }
  function setStatus(status){
    const messages={idle:['Текст песни','Выберите трек.'],loading:['Загрузка текста…',''],missing:['Текст не найден','Можно добавить LRC-файл через меню плеера.'],instrumental:['Инструментальный трек',''],error:['Не удалось загрузить текст','Повторите поиск через меню плеера.'],limited:['Поиск временно недоступен','Попробуйте позже.'],offline:['Поиск текста выключен','Можно открыть локальный LRC-файл.']};
    $('#lyrics-lines').hidden=true;$('#lyrics-status').hidden=false;$('#lyrics-status').classList.toggle('is-loading',status==='loading');
    const [title,body]=messages[status]||messages.missing;$('#lyrics-status h2').textContent=title;$('#lyrics-status p').textContent=body;
    $('#lyrics-mode').textContent='ТЕКСТ ПЕСНИ';$('#lyrics-source').textContent='';
  }
  function renderLyrics(result){
    requestVersion++;
    motion.stop();
    lyrics=result;activeLine=-2;follow=true;$('#lyrics-resume').hidden=true;
    const root=$('#lyrics-lines');root.replaceChildren();
    if(!['synced','plain'].includes(result.status)){setStatus(result.status);return;}
    $('#lyrics-status').hidden=true;root.hidden=false;root.dataset.synced=String(result.status==='synced');
    $('#lyrics-mode').textContent=result.status==='synced'?'LIVE LYRICS':'ТЕКСТ БЕЗ ТАЙМКОДОВ';
    $('#lyrics-source').textContent=result.source==='Локальный LRC'?'Локальный файл':result.source||'';
    const lines=result.status==='synced'?result.lines:result.plain.split(/\r?\n/).filter(Boolean).map(text=>({text}));
    const fragment=document.createDocumentFragment();
    lines.forEach((line,index)=>{
      const el=document.createElement(result.status==='synced'?'button':'p');el.className='lyric-line';el.dataset.index=index;
      if(result.status==='synced'){
        el.setAttribute('aria-label',`${time(line.time)} — ${line.text||'Музыкальный проигрыш'}`);
        el.onclick=async()=>{if(!live.track.seekable){toast('Этот трек не разрешает перемотку.');return;}const ok=await window.hex.playerControl('seek',line.time);if(ok){clock.seek(line.time);follow=true;$('#lyrics-resume').hidden=true;activeLine=-2;updateLine(line.time,{immediate:true});}else toast('SoundCloud не выполнил перемотку.');};
      }
      const words=(line.text||'•••').split(/\s+/);words.forEach((word,i)=>{if(i)el.append(' ');const span=document.createElement('span');span.textContent=word;span.style.setProperty('--word',String(i));el.append(span);});
      fragment.append(el);
    });root.append(fragment);$('#lyrics-scroll').scrollTop=0;syncClockPresentation();updateLine(position(),{immediate:true});motion.enter(root,motionOptions());
  }
  async function fetchLyrics(force=false){
    if(page!=='player')return;const key=trackKey(live.track);
    if(!live.track.available){lyricsKey='';renderLyrics({status:'idle',lines:[]});return;}
    if(!force&&lyricsKey===key)return;lyricsKey=key;const version=++requestVersion;setStatus('loading');
    try{const result=await window.hex.lyrics(key);if(version!==requestVersion||key!==trackKey(live.track))return;if(result.status==='stale'||(result.trackKey&&result.trackKey!==key)){lyricsKey='';window.hex.getPlayback().then(snapshot=>{if(version===requestVersion)update(snapshot);});return;}renderLyrics(result);}catch{if(version===requestVersion)renderLyrics({status:'error',lines:[]});}
  }
  function updateLine(at,{immediate=false}={}){
    if(live.track.clockKnown===false)return;
    if(lyrics.status!=='synced')return;const index=lineAt(lyrics.lines,at);
    if(index===activeLine)return;activeLine=index;
    const nodes=[...$('#lyrics-lines').children];nodes.forEach((el,i)=>{el.classList.toggle('is-active',i===index);el.classList.toggle('is-near',Math.abs(i-index)===1);el.classList.toggle('is-past',i<index);if(i===index)el.setAttribute('aria-current','true');else el.removeAttribute('aria-current');});
    const active=nodes[index];if(!active){motion.activate(null,{enabled:false});return;}
    revealActive(false,at);
    if(follow)scrollToActive(immediate);
  }
  function scrollToActive(immediate=false){const line=$('.lyric-line.is-active');if(!line)return;const scroll=$('#lyrics-scroll');motion.scrollTo(scroll,Math.max(0,line.offsetTop-scroll.clientHeight*.34+line.clientHeight*.1),{...motionOptions(),enabled:!immediate&&canAnimate()});}
  new ResizeObserver(()=>{if(page==='player'&&follow)scrollToActive();}).observe($('#lyrics-scroll'));
  function tick(){frame=0;if(page!=='player'||document.hidden)return;const at=position();if(!scrubbing){$('#player-seek').value=String(at);$('#player-time').textContent=time(at);}updateLine(at);frame=requestAnimationFrame(tick);}
  function update(next,fetch=true){
    const previous=live.track;const changed=trackKey(previous)!==trackKey(next.track);
    if(!clock.update(next.track,{key:trackKey(next.track),sampledAt:next.sampledAt}))return;
    live=next;const {profile,track}=live;
    if(previous.clockKnown!==track.clockKnown||previous.clockEstimated!==track.clockEstimated)syncClockPresentation();
    $('#account-login').textContent=profile.loggedIn?(profile.name||'Мой профиль'):'Войти в аккаунт';$('#account-login').title=profile.name||'SoundCloud';
    $('#profile-caption').textContent=profile.loggedIn?'Профиль':'SoundCloud';$('#profile-menu-name').textContent=profile.name||'SoundCloud';$('#login-button').setAttribute('aria-label',profile.loggedIn?'Открыть профиль':'Войти в SoundCloud');
    image($('#profile-avatar'),profile.avatar);$('#login-button').classList.toggle('has-avatar',!!profile.avatar);
    $('#profile-menu-button').hidden=!profile.loggedIn;
    $('#settings-login').textContent=profile.loggedIn?'Открыть мой профиль':'Войти в SoundCloud';
    $('#sidebar-track').hidden=!track.available;$('#sidebar-track-title').textContent=track.title||'';$('#sidebar-track-artist').textContent=track.artist||'';image($('#sidebar-track-art'),track.artwork);$('#sidebar-track').classList.toggle('has-art',!!track.artwork);icon($('#sidebar-play'),track.playing?'pause':'play');$('#sidebar-play').setAttribute('aria-label',track.playing?'Пауза':'Воспроизвести');
    $('#record-title').textContent=track.title||'Выберите музыку';$('#record-title').title=track.title||'';$('#record-artist').textContent=track.artist||'Откройте трек в SoundCloud';$('#record-artist').title=track.artist||'';image($('#record-image'),track.artwork);$('#record-placeholder').hidden=!!track.artwork;$('#record-art').classList.toggle('is-playing',track.playing);
    $('#record-live').textContent=track.playing?'СЕЙЧАС ЗВУЧИТ':'НА ПАУЗЕ';$('#record-live').hidden=!track.available;
    document.querySelectorAll('[data-control]').forEach(el=>el.disabled=!canControl(track,el.dataset.control));$('#sidebar-play').disabled=!canControl(track,'toggle');
    icon($('#player-play'),track.playing?'pause':'play');$('#player-play').setAttribute('aria-label',track.playing?'Приостановить':'Воспроизвести');
    $('#record-like').setAttribute('aria-pressed',String(!!track.liked));$('[data-control="shuffle"]').setAttribute('aria-pressed',String(!!track.shuffle));$('#player-repeat').setAttribute('aria-pressed',String(track.repeat!=='off'));$('#repeat-one').hidden=track.repeat!=='one';
    $('#player-seek').max=String(track.duration||1);$('#player-seek').disabled=!track.seekable||!canControl(track,'seek');$('#player-duration').textContent=time(track.duration);$('#player-volume').disabled=!canControl(track,'volume');window.HexVolume.sync($('#player-volume'),track.volume??1);
    $('#record-link').disabled=!track.url;
    syncArtwork();
    if(changed){lyricsKey='';lyrics={status:'idle',lines:[]};activeLine=-2;if(page==='player'){enter($('.record-side'));if(fetch)fetchLyrics();else requestVersion++;}}
  }
  const account=()=>{if(live.profile.loggedIn){showPage('music');window.hex.navigate('account');}else{showPage('music');window.hex.login();}};
  $('#login-button').onclick=$('#account-login').onclick=$('#settings-login').onclick=account;
  $('#profile-menu-button').onclick=e=>{e.stopPropagation();$('#profile-menu').hidden=!$('#profile-menu').hidden;$('#profile-menu-button').setAttribute('aria-expanded',String(!$('#profile-menu').hidden));};
  document.addEventListener('click',e=>{if(!e.target.closest('#profile-menu')&&!e.target.closest('#profile-menu-button')){$('#profile-menu').hidden=true;$('#profile-menu-button').setAttribute('aria-expanded','false');}});
  $('#profile-settings').onclick=()=>{showPage('music');window.hex.navigate('https://soundcloud.com/settings');};
  $('#profile-logout').onclick=()=>$('#logout').click();
  $('#player-button').onclick=$('#sidebar-track-open').onclick=()=>window.hex.openPlayer();
  $('#player-back').onclick=()=>{showPage('music');window.hex.showSettings(false);};
  $('#sidebar-play').onclick=()=>window.hex.playerControl('toggle');
  document.querySelectorAll('[data-control]').forEach(el=>el.onclick=async()=>{if(!await window.hex.playerControl(el.dataset.control))toast('Это действие сейчас недоступно в сервисе.');});
  $('#player-seek').oninput=()=>{scrubbing=true;$('#player-time').textContent=time(Number($('#player-seek').value));};
  $('#player-seek').onchange=async()=>{const at=Number($('#player-seek').value);scrubbing=false;if(await window.hex.playerControl('seek',at)){clock.seek(at);activeLine=-2;updateLine(at,{immediate:true});}else toast('Этот трек не разрешает перемотку.');};
  window.HexVolume.bind($('#player-volume'),value=>window.hex.playerControl('volume',value));
  $('#record-link').onclick=()=>{if(live.track.url){showPage('music');window.hex.navigate(live.track.url);}};
  $('#lyrics-retry').onclick=()=>fetchLyrics(true);
  $('#lyrics-replay').onclick=()=>revealActive(true);
  $('#player-import').onclick=async()=>{try{const result=await window.hex.importLyrics(trackKey(live.track));if(result&&result.trackURL===live.track.url&&result.trackTitle===live.track.title){requestVersion++;lyricsKey=trackKey(live.track);renderLyrics(result);}}catch(e){toast(e.message);}};
  const stopFollowing=()=>{follow=false;motion.cancelScroll();$('#lyrics-resume').hidden=lyrics.status!=='synced';};
  $('#lyrics-scroll').addEventListener('wheel',stopFollowing,{passive:true});
  $('#lyrics-scroll').addEventListener('touchstart',stopFollowing,{passive:true});
  $('#lyrics-scroll').addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key))stopFollowing();});
  $('#lyrics-resume').onclick=()=>{follow=true;$('#lyrics-resume').hidden=true;scrollToActive();};
  document.addEventListener('hex-page',e=>{cancelAnimationFrame(frame);motion.stop();syncArtwork();if(e.detail==='player'){fetchLyrics();enter($('.record-side'));motion.enter($('#lyrics-lines'),motionOptions());revealActive();frame=requestAnimationFrame(tick);}});
  document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frame);if(document.hidden)motion.stop();if(!document.hidden&&page==='player')frame=requestAnimationFrame(tick);});
  document.addEventListener('keydown',e=>{if(page==='player'&&e.code==='Space'&&!['INPUT','BUTTON','TEXTAREA','SELECT'].includes(e.target.tagName)){e.preventDefault();window.hex.playerControl('toggle');}if(e.key==='Escape'&&!$('#profile-menu').hidden)$('#profile-menu').hidden=true;});
  let animationStyle;
  window.hex.on('playback',update);window.hex.on('settings',s=>{if(online!==undefined&&online!==s.lyricsOnline){lyricsKey='';fetchLyrics(true);}online=s.lyricsOnline;if(animationStyle!==undefined&&animationStyle!==s.lyricAnimation&&page==='player')requestAnimationFrame(()=>revealActive(true));animationStyle=s.lyricAnimation;if(!s.motion)motion.stop();requestAnimationFrame(syncArtwork);});window.hex.getPlayback().then(update);
  document.addEventListener('click',event=>{if(!event.target.closest('#player-options'))$('#player-options').open=false;});
  window.HexPlayerUI={update,renderLyrics,updateLine};
})();
