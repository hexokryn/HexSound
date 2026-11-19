(function(){
  if(window.HexRemotePlayer)return;
  const text=(selector)=>document.querySelector(selector)?.textContent?.trim()||'';
  const url=(value)=>{if(!value)return '';try{const u=new URL(value,location.href);return u.protocol==='https:'?u.href:'';}catch{return '';}};
  const image=(element)=>{if(!element)return '';const img=element.matches('img')?element:element.querySelector('img');if(img?.src)return url(img.currentSrc||img.src);const nodes=[element,...element.querySelectorAll('[style]')];for(const node of nodes){const match=getComputedStyle(node).backgroundImage.match(/url\(["']?(.*?)["']?\)/);if(match)return url(match[1]);}return '';};
  const seconds=value=>{const times=String(value).match(/\d+:\d+(?::\d+)?/g);if(!times)return 0;return times[times.length-1].split(':').reduce((n,v)=>n*60+Number(v),0);};
  function snapshot(){
    const profileButton=document.querySelector('.header__userNavUsernameButton');
    const me=Array.isArray(window.__sc_hydration)?window.__sc_hydration.find(x=>x.hydratable==='me')?.data:null;
    const profileHref=profileButton?.getAttribute('href')||'';
    const profile={loggedIn:!!profileButton||!!me?.username,name:text('.header__userNavUsername')||me?.username||'',url:url(me?.permalink_url||(profileHref.startsWith('#')?'':profileHref)),avatar:image(document.querySelector('.header__userNavAvatar'))||url(me?.avatar_url||'')};
    const metadata=navigator.mediaSession?.metadata;
    const titleLink=document.querySelector('.playbackSoundBadge__titleLink, .playbackSoundBadge__title a');
    const title=titleLink?.getAttribute('title')||titleLink?.textContent?.trim()||metadata?.title||'';
    const audio=[...document.querySelectorAll('audio')].find(a=>Number.isFinite(a.duration)&&a.duration>0);
    const play=document.querySelector('.playControls__play');
    const isPlaying=audio?!audio.paused:!!play?.classList.contains('playing')||navigator.mediaSession?.playbackState==='playing';
    const artwork=image(document.querySelector('.playbackSoundBadge__avatar'))||metadata?.artwork?.at(-1)?.src||'';
    return {profile,track:{title,artist:metadata?.artist||text('.playbackSoundBadge__lightLink'),url:url(titleLink?.getAttribute('href')||''),artwork:url(artwork).replace(/-t(?:50x50|120x120|200x200)\./,'-t500x500.'),duration:audio?.duration||seconds(text('.playbackTimeline__duration')),position:audio?.currentTime||seconds(text('.playbackTimeline__timePassed')),playing:isPlaying,volume:audio?.volume??Number(document.querySelector('.volume__sliderWrapper')?.getAttribute('aria-valuenow')??1),shuffle:!!document.querySelector('.shuffleControl.m-shuffling'),repeat:document.querySelector('.repeatControl')?.classList.contains('m-one')?'one':document.querySelector('.repeatControl')?.classList.contains('m-all')?'all':'off',liked:!!document.querySelector('.playbackSoundBadge .sc-button-like.sc-button-selected'),available:!!title,seekable:!!audio||!!document.querySelector('.playbackTimeline.is-scrubbable')}};
  }
  function control(action,value){
    const selectors={toggle:'.playControls__play',previous:'.playControls__prev',next:'.playControls__next',shuffle:'.shuffleControl',repeat:'.repeatControl',like:'.playbackSoundBadge .sc-button-like'};
    if(selectors[action]){const button=document.querySelector(selectors[action]);if(!button||button.disabled||button.classList.contains('disabled'))return false;button.click();return true;}
    const audio=[...document.querySelectorAll('audio')].find(a=>Number.isFinite(a.duration)&&a.duration>0);
    if(action==='seek'){
      const duration=snapshot().track.duration;if(!duration||!Number.isFinite(value))return false;
      const target=Math.max(0,Math.min(duration,value));
      if(audio){audio.currentTime=target;return true;}
      const wrapper=document.querySelector('.playbackTimeline__progressWrapper'),bar=document.querySelector('.playbackTimeline__progressBackground');
      if(!wrapper||!bar)return false;const r=bar.getBoundingClientRect();if(r.width<=0)return false;
      const args={bubbles:true,cancelable:true,view:window,clientX:r.left+r.width*target/duration,clientY:r.top+1,button:0,buttons:1};
      wrapper.dispatchEvent(new MouseEvent('mousedown',args));document.dispatchEvent(new MouseEvent('mousemove',args));document.dispatchEvent(new MouseEvent('mouseup',{...args,buttons:0}));return true;
    }
    if(action==='volume'){
      if(!Number.isFinite(value))return false;const level=Math.max(0,Math.min(1,value));
      if(audio){audio.volume=level;audio.muted=false;return true;}
      const slider=document.querySelector('.volume__sliderWrapper');if(!slider)return false;
      const volume=document.querySelector('.volume');const expanded=volume?.classList.contains('expanded');volume?.classList.add('expanded');
      const bar=document.querySelector('.volume__sliderBackground');const r=bar?.getBoundingClientRect();if(!r?.height){if(!expanded)volume?.classList.remove('expanded');return false;}
      const args={bubbles:true,cancelable:true,view:window,clientX:r.left+2,clientY:r.bottom-r.height*level,button:0,buttons:1};
      slider.dispatchEvent(new MouseEvent('mousedown',args));document.dispatchEvent(new MouseEvent('mousemove',args));document.dispatchEvent(new MouseEvent('mouseup',{...args,buttons:0}));if(!expanded)volume?.classList.remove('expanded');return true;
    }
    return false;
  }
  async function profileURL(){
    const known=snapshot().profile.url;if(known&&!known.endsWith('/#'))return known;
    const button=document.querySelector('.header__userNavUsernameButton');if(!button)return '';
    button.click();await new Promise(resolve=>setTimeout(resolve,180));
    const link=[...document.querySelectorAll('.dropdownMenu a,.userMenu a')].find(a=>/^(profile|профиль)$/i.test(a.textContent.trim())||a.classList.contains('userMenu__profile'));
    const result=url(link?.getAttribute('href')||'');button.click();return result;
  }
  window.HexRemotePlayer={snapshot,control,profileURL};
})();
