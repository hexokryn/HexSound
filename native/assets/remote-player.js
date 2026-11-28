(function(){
  if(window.HexRemotePlayer)return;
  const text=(selector)=>document.querySelector(selector)?.textContent?.trim()||'';
  const url=(value)=>{if(!value)return '';try{const u=new URL(value,location.href);return u.protocol==='https:'?u.href:'';}catch{return '';}};
  const image=(element)=>{if(!element)return '';const img=element.matches('img')?element:element.querySelector('img');if(img?.src)return url(img.currentSrc||img.src);const nodes=[element,...element.querySelectorAll('[style]')];for(const node of nodes){const match=getComputedStyle(node).backgroundImage.match(/url\(["']?(.*?)["']?\)/);if(match)return url(match[1]);}return '';};
  const seconds=value=>{const times=String(value).match(/\d+:\d+(?::\d+)?/g);if(!times)return 0;return times[times.length-1].split(':').reduce((n,v)=>n*60+Number(v),0);};
  let endedAt=0;document.addEventListener('ended',e=>{if(e.target.matches?.('audio,video'))endedAt=Date.now();},true);
  let clock=null;
  const now=()=>performance.now();
  function observedPosition({key,position,duration,playing,source,quantum=0,known=false,precise=false}){
    const at=now(),bound=value=>Math.max(0,Math.min(duration,Number.isFinite(value)?value:0));
    if(!known||!duration){clock=null;return Number.isFinite(position)?position:0;}
    if(precise||!clock||clock.key!==key){clock={key,position:bound(position),at,playing,lastRaw:position,source};return clock.position;}
    let current=bound(clock.position+(clock.playing?(at-clock.at)/1000:0));
    const sourceChanged=source!==clock.source,changed=Math.abs(position-clock.lastRaw)>.001;
    if(changed&&!sourceChanged){
      // Integer labels and pixel widths are observations, not a new clock on
      // every poll. Correct real jumps, but don't rewind on quantization.
      if(position<clock.lastRaw-.05||Math.abs(position-current)>quantum+.25)current=bound(position);
      else current=Math.max(current,bound(position));
    }
    if(changed||sourceChanged||playing!==clock.playing){clock={key,position:current,at,playing,lastRaw:position,source};}
    return current;
  }
  function requestedSeek(position){if(clock)clock={...clock,position,at:now()};}
  function volumeLevel(audio){
    const slider=document.querySelector('.volume__sliderWrapper'),input=document.querySelector('.volume input[type=range]');
    if(input){const min=Number(input.min)||0,max=Number(input.max)||1,value=Number(input.value);return Math.max(0,Math.min(1,(value-min)/(max-min||1)));}
    const raw=slider?.getAttribute('aria-valuenow');if(raw!==null&&raw!==undefined){const max=Number(slider.getAttribute('aria-valuemax'))||1;return Math.max(0,Math.min(1,Number(raw)/(max>1?max:1)));}
    return audio?.muted?0:audio?.volume??1;
  }
  function snapshot(){
    const profileButton=document.querySelector('.header__userNavUsernameButton');
    const me=Array.isArray(window.__sc_hydration)?window.__sc_hydration.find(x=>x.hydratable==='me')?.data:null;
    const profileHref=profileButton?.getAttribute('href')||'';
    const profile={id:String(me?.urn||me?.id||''),loggedIn:!!profileButton||!!me?.username,name:text('.header__userNavUsername')||me?.username||'',url:url(me?.permalink_url||(profileHref.startsWith('#')?'':profileHref)),avatar:image(document.querySelector('.header__userNavAvatar'))||url(me?.avatar_url||'')};
    const metadata=navigator.mediaSession?.metadata;
    const titleLink=document.querySelector('.playbackSoundBadge__titleLink, .playbackSoundBadge__title a');
    const title=titleLink?.getAttribute('title')||titleLink?.textContent?.trim()||metadata?.title||'';
    const audio=[...document.querySelectorAll('audio')].find(a=>Number.isFinite(a.duration)&&a.duration>0);
    const play=document.querySelector('.playControls__play');
    const nativePlaying=!!play?.classList.contains('playing')||navigator.mediaSession?.playbackState==='playing';
    let hooked;try{hooked=window.HexWebPlayer?.snapshot('soundcloud')?.track;}catch{}
    const hookKnown=!!hooked?.clockKnown&&Number.isFinite(hooked.position)&&Number.isFinite(hooked.duration)&&hooked.duration>0&&['playing','paused'].includes(navigator.mediaSession?.playbackState);
    const isPlaying=audio?!audio.paused:hookKnown?!!hooked.playing:nativePlaying;
    const duration=audio?.duration||(hookKnown?hooked.duration:0)||seconds(text('.playbackTimeline__duration'));
    const bar=document.querySelector('.playbackTimeline__progressBackground'),progress=document.querySelector('.playbackTimeline__progressBar');
    const full=bar?.getBoundingClientRect().width||0,filled=progress?.getBoundingClientRect().width;
    const elapsed=text('.playbackTimeline__timePassed'),barKnown=full>0&&Number.isFinite(filled)&&duration>0;
    const precise=!!audio||hookKnown,known=precise||barKnown||/\d+:\d+/.test(elapsed);
    const raw=audio?audio.currentTime:hookKnown?hooked.position:barKnown?duration*Math.max(0,Math.min(1,filled/full)):seconds(elapsed);
    const position=observedPosition({key:[titleLink?.getAttribute('href')||'',title,metadata?.artist||''].join('|'),position:raw,duration,playing:isPlaying,source:precise?'precise':barKnown?'bar':'text',quantum:barKnown?Math.max(.02,Math.min(1,duration/full)):1,known,precise});
    const artwork=image(document.querySelector('.playbackSoundBadge__avatar'))||metadata?.artwork?.at(-1)?.src||'';
    return {sampledAt:Date.now(),endedAt,profile,track:{title,artist:metadata?.artist||text('.playbackSoundBadge__lightLink'),url:url(titleLink?.getAttribute('href')||''),artwork:url(artwork).replace(/-t(?:50x50|120x120|200x200)\./,'-t500x500.'),duration,position,clockKnown:known&&duration>0,clockEstimated:!precise&&known&&duration>0,playing:isPlaying,volume:volumeLevel(audio),shuffle:!!document.querySelector('.shuffleControl.m-shuffling'),repeat:document.querySelector('.repeatControl')?.classList.contains('m-one')?'one':document.querySelector('.repeatControl')?.classList.contains('m-all')?'all':'off',liked:!!document.querySelector('.playbackSoundBadge .sc-button-like.sc-button-selected'),available:!!title,seekable:!!audio||!!document.querySelector('.playbackTimeline.is-scrubbable')}};
  }
  function control(action,value){
    const selectors={toggle:'.playControls__play',previous:'.playControls__prev',next:'.playControls__next',shuffle:'.shuffleControl',repeat:'.repeatControl',like:'.playbackSoundBadge .sc-button-like'};
    if(selectors[action]){const button=document.querySelector(selectors[action]);if(!button||button.disabled||button.classList.contains('disabled'))return false;button.click();return true;}
    const audio=[...document.querySelectorAll('audio')].find(a=>Number.isFinite(a.duration)&&a.duration>0);
    if(action==='seek'){
      const duration=snapshot().track.duration;if(!duration||!Number.isFinite(value))return false;
      const target=Math.max(0,Math.min(duration,value));
      if(audio){audio.currentTime=target;requestedSeek(target);return true;}
      const wrapper=document.querySelector('.playbackTimeline__progressWrapper'),bar=document.querySelector('.playbackTimeline__progressBackground');
      if(!wrapper||!bar)return false;const r=bar.getBoundingClientRect();if(r.width<=0)return false;
      const args={bubbles:true,cancelable:true,view:window,clientX:r.left+r.width*target/duration,clientY:r.top+1,button:0,buttons:1};
      wrapper.dispatchEvent(new MouseEvent('mousedown',args));document.dispatchEvent(new MouseEvent('mousemove',args));document.dispatchEvent(new MouseEvent('mouseup',{...args,buttons:0}));requestedSeek(target);return true;
    }
    if(action==='volume'){
      if(!Number.isFinite(value))return false;const level=Math.max(0,Math.min(1,value));
      const input=document.querySelector('.volume input[type=range]');
      if(input){const min=Number(input.min)||0,max=Number(input.max)||1;input.value=String(min+level*(max-min));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true;}
      const slider=document.querySelector('.volume__sliderWrapper'),volume=document.querySelector('.volume'),footer=document.querySelector('.playControls');
      if(slider&&volume){const expanded=volume.classList.contains('expanded'),style=footer?.getAttribute('style');try{
        // The themed footer is translated off-screen; native handlers clamp
        // viewport coordinates. Restore its geometry for this synchronous drag.
        footer?.style.setProperty('transform','none','important');footer?.style.setProperty('transition','none','important');volume.classList.add('expanded');
        const r=document.querySelector('.volume__sliderBackground')?.getBoundingClientRect();if(r?.height>0){const args={bubbles:true,cancelable:true,view:window,clientX:r.left+r.width/2,clientY:r.bottom-r.height*level,button:0,buttons:1};slider.dispatchEvent(new MouseEvent('mousedown',args));document.dispatchEvent(new MouseEvent('mousemove',args));document.dispatchEvent(new MouseEvent('mouseup',{...args,buttons:0}));return true;}
      }finally{if(!expanded)volume.classList.remove('expanded');if(footer){if(style===null)footer.removeAttribute('style');else if(style!==undefined)footer.setAttribute('style',style);}}}
      if(audio){audio.volume=level;audio.muted=level===0;return true;}return false;
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
