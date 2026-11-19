(function(){
  let config={enabled:true,playing:false,mode:'float',tilt:true},element,raf=0,last=0,clock=0;
  let targetX=0,targetY=0,x=0,y=0,pressed=false,hovered=false,frames=0;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const enabled=()=>config.enabled&&!(config.respectReducedMotion&&reduce.matches)&&!document.hidden;
  function reset(){if(element){element.style.transform='';element.style.removeProperty('--glare-x');element.style.removeProperty('--glare-y');element.dataset.tiltActive='false';}}
  function tick(now){
    raf=0;if(!enabled()){reset();return;}
    clock+=Math.min((now-last)/1000,.05);last=now;frames++;
    x+=(targetX-x)*.11;y+=(targetY-y)*.11;
    const idle=config.playing&&config.mode!=='still';
    const drift=idle&&config.mode==='float'?Math.sin(clock*.65)*2.8:0;
    const turn=idle?Math.sin(clock*.43)*(config.mode==='turn'?2.6:.55):0;
    element.style.transform=`perspective(900px) translate3d(0,${drift}px,0) rotateX(${-y*4}deg) rotateY(${x*5}deg) rotateZ(${x*.8+turn}deg) scale(${pressed?.985:config.playing?1:.98})`;
    element.dataset.tiltActive=String(hovered&&config.tilt);
    element.style.setProperty('--glare-x',`${50+x*30}%`);element.style.setProperty('--glare-y',`${45+y*30}%`);
    if(idle||hovered||Math.abs(targetX-x)+Math.abs(targetY-y)>.005)raf=requestAnimationFrame(tick);
  }
  function resume(){cancelAnimationFrame(raf);raf=0;if(!element)return;if(!enabled()){reset();return;}last=performance.now();raf=requestAnimationFrame(tick);}
  function pointer(event){if(!config.tilt||!enabled())return;const r=element.getBoundingClientRect();targetX=Math.max(-1,Math.min(1,(event.clientX-r.left)/r.width*2-1));targetY=Math.max(-1,Math.min(1,(event.clientY-r.top)/r.height*2-1));hovered=true;if(!raf)resume();}
  window.HexArtwork={
    mount(next){config=next;if(!element){element=document.querySelector('#record-art');if(!element)return;element.addEventListener('pointermove',pointer);element.addEventListener('pointerleave',()=>{hovered=false;pressed=false;targetX=targetY=0;resume();});element.addEventListener('pointerdown',()=>{pressed=true;resume();});window.addEventListener('pointerup',()=>{if(pressed){pressed=false;resume();}});}if(!next.tilt){hovered=false;targetX=targetY=0;}resume();},
    inspect:()=>({running:!!raf,frames,mode:config.mode,tilt:config.tilt,transform:element?.style.transform||''})
  };
  document.addEventListener('visibilitychange',resume);reduce.addEventListener('change',resume);
})();
