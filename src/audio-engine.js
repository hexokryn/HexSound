(function(){
  const audio=document.createElement('audio');audio.preload='auto';audio.id='native-audio';audio.hidden=true;document.body.append(audio);let hls=null,generation=0,track=null;
  const notify=type=>window.hex.audioEvent({type,generation,code:audio.error?.code||0});
  audio.addEventListener('ended',()=>notify('ended'));audio.addEventListener('error',()=>notify('error'));audio.addEventListener('loadedmetadata',()=>notify('ready'));
  async function start(value){hls?.destroy();hls=null;audio.pause();audio.removeAttribute('src');audio.load();generation=value.generation;track=value.track;
    if(value.kind==='hls'&&window.Hls?.isSupported()){
      hls=new Hls({enableWorker:false,maxBufferLength:30,backBufferLength:20});hls.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal)notify('error');});hls.on(Hls.Events.MANIFEST_PARSED,()=>audio.play().catch(()=>notify('autoplay')));hls.loadSource(value.src);hls.attachMedia(audio);
    }else{audio.src=value.src;try{await audio.play();}catch{notify('autoplay');}}
    if(navigator.mediaSession){try{navigator.mediaSession.metadata=new MediaMetadata({title:track.title,artist:track.artist,album:track.album||'',artwork:track.artwork?[{src:track.artwork}]:[]});}catch{}for(const [name,action] of [['play','toggle'],['pause','toggle'],['nexttrack','next'],['previoustrack','previous']])navigator.mediaSession.setActionHandler(name,()=>{if(name==='play'&&!audio.paused||name==='pause'&&audio.paused)return;window.hex.playerControl(action);});navigator.mediaSession.setActionHandler('seekto',details=>window.hex.playerControl('seek',details.seekTime));}
    return true;
  }
  async function control(action,value){if(action==='toggle'){if(audio.paused)await audio.play();else audio.pause();return true;}if(action==='seek'&&Number.isFinite(value)){audio.currentTime=Math.max(0,Math.min(Number.isFinite(audio.duration)?audio.duration:Infinity,value));return true;}if(action==='volume'&&Number.isFinite(value)){audio.volume=Math.max(0,Math.min(1,value));return true;}if(action==='stop'){hls?.destroy();hls=null;audio.pause();audio.removeAttribute('src');audio.load();track=null;return true;}return false;}
  window.HexAudio={start,control,snapshot:()=>({generation,position:audio.currentTime||0,duration:Number.isFinite(audio.duration)?audio.duration:0,playing:!audio.paused&&!audio.ended,ended:audio.ended,volume:audio.volume,ready:audio.readyState})};
})();
