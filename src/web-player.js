(function(){
  if(window.HexWebPlayer)return;
  let mediaClock=null;const actions=new Map();
  const media=navigator.mediaSession;
  if(media){
    const setPosition=media.setPositionState?.bind(media),setAction=media.setActionHandler?.bind(media);
    if(setPosition)media.setPositionState=state=>{const result=setPosition(state);mediaClock=state?{...state,position:state.position??0,at:performance.now(),playing:media.playbackState==='playing'}:null;return result;};
    if(setAction)media.setActionHandler=(name,handler)=>{const result=setAction(name,handler);if(handler)actions.set(name,handler);else actions.delete(name);return result;};
  }
  let lastElement=null;
  const element=()=>{const all=[...document.querySelectorAll('audio,video')].filter(el=>Number.isFinite(el.duration)&&el.duration>0);lastElement=all.find(el=>!el.paused&&!el.ended)||(all.includes(lastElement)?lastElement:all[0]);return lastElement;};
  function snapshot(provider){
    const a=element(),metadata=media?.metadata,playing=a?!a.paused:media?.playbackState==='playing';
    if(mediaClock){const at=performance.now();mediaClock.position=Math.min(mediaClock.duration,mediaClock.position+(mediaClock.playing?(at-mediaClock.at)/1000*(mediaClock.playbackRate||1):0));mediaClock.at=at;mediaClock.playing=playing;}
    return {sampledAt:Date.now(),profile:{loggedIn:false,name:'',url:'',avatar:''},track:{provider,clockKnown:!!a||!!mediaClock,title:metadata?.title||'',artist:metadata?.artist||'',artwork:metadata?.artwork?.at(-1)?.src||'',url:location.href,duration:a?.duration||mediaClock?.duration||0,position:a?.currentTime??mediaClock?.position??0,playing,volume:a?.volume??1,available:!!metadata?.title,seekable:!!a||actions.has('seekto'),controls:{toggle:true,seek:!!a||actions.has('seekto'),volume:!!a,previous:actions.has('previoustrack'),next:actions.has('nexttrack'),shuffle:false,repeat:false,like:false}}};
  }
  async function control(action,value){
    if(['seek','volume'].includes(action)&&!Number.isFinite(value))return false;
    const a=element();
    if(a){if(action==='toggle'){if(a.paused)await a.play();else a.pause();return true;}if(action==='seek'&&Number.isFinite(value)){a.currentTime=Math.max(0,Math.min(a.duration,value));return true;}if(action==='volume'&&Number.isFinite(value)){a.volume=Math.max(0,Math.min(1,value));return true;}}
    const name={toggle:media?.playbackState==='playing'?'pause':'play',previous:'previoustrack',next:'nexttrack',seek:'seekto'}[action],handler=actions.get(name);
    if(handler){await handler(name==='seekto'?{action:name,seekTime:value,fastSeek:false}:{action:name});return true;}
    if(action==='toggle'){
      const name=media?.playbackState==='playing'?/^(pause|пауза|приостановить)(\s|$)/i:/^(play|воспроизвести|слушать)(\s|$)/i;
      const button=[...document.querySelectorAll('button,[role=button]')].find(el=>name.test(el.getAttribute('aria-label')||'')&&!el.disabled&&el.getBoundingClientRect().width>0);
      if(button){button.click();return true;}
    }
    return false;
  }
  window.HexWebPlayer={snapshot,control};
})();
