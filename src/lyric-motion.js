(function(){
  let words=[],entrances=[],highlight=null,scrollFrame=0,scrollContext=null;
  function cancelScroll(){cancelAnimationFrame(scrollFrame);scrollFrame=0;if(scrollContext){scrollContext.container.style.scrollBehavior=scrollContext.behavior;scrollContext=null;}}
  function clearWords(){words.forEach(a=>a.cancel());words=[];highlight?.cancel();highlight=null;}
  function stop(){clearWords();entrances.forEach(({animation})=>animation.cancel());entrances=[];cancelScroll();}
  function activate(line,{enabled=true,speed=1,style='cascade',windowSeconds=4,elapsedSeconds=0}={}){
    clearWords();if(!enabled||!line)return;
    // A line must be readable at its timestamp. Movement decorates that onset;
    // neither a word stagger nor a still-running page entrance may mask it.
    entrances=entrances.filter(entry=>{if(entry.line!==line)return true;entry.animation.cancel();return false;});
    const nodes=[...line.children];
    const budget=Math.min(380,Math.max(120,windowSeconds*1000*.35));
    const duration=Math.min(style==='cinema'?340:280,budget)/speed;
    const spread=Math.min(style==='cinema'?70:110,budget*.25)/speed;
    highlight=line.animate([{opacity:1,filter:'blur(0px)'},{opacity:1,filter:'blur(0px)'}],{duration:duration+spread,fill:'both'});
    const elapsed=Math.max(0,elapsedSeconds*1000);
    if(elapsed>=duration+spread)return;
    nodes.forEach((word,index)=>{
      const delay=nodes.length>1?index/(nodes.length-1)*spread:0;
      const rise=style==='wave'?5+Math.sin(index*.7)*2:style==='cinema'?3:5;
      const frames=[
        {opacity:1,transform:`translate3d(0,${rise}px,0) rotateX(${style==='cinema'?0:2}deg) scale(.995)`,filter:'blur(0px)',clipPath:'inset(0 0 0 0)'},
        {opacity:1,transform:'translate3d(0,-1.5px,0) rotateX(0) scale(1)',filter:'blur(0px)',clipPath:'inset(0 0 0 0)',offset:.7},
        {opacity:1,transform:'translate3d(0,0,0) rotateX(0) scale(1)',filter:'blur(0px)',clipPath:'inset(0 0 0 0)'}
      ];
      const animation=word.animate(frames,{duration,delay,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'});
      animation.currentTime=elapsed;
      words.push(animation);
    });
  }
  function enter(container,{enabled=true,speed=1}={}){
    entrances.forEach(({animation})=>animation.cancel());entrances=[];if(!enabled)return;
    [...container.children].slice(0,7).forEach((line,index)=>{
      if(line.classList.contains('is-active'))return;
      entrances.push({line,animation:line.animate([{translate:'0 12px',clipPath:'inset(0 0 100% 0)'},{translate:'0 0',clipPath:'inset(0 0 0 0)'}],{duration:420/speed,delay:index*25/speed,easing:'cubic-bezier(.22,1,.36,1)'})});
    });
  }
  function scrollTo(container,target,{enabled=true,speed=1}={}){
    cancelScroll();const from=container.scrollTop,to=Math.max(0,Math.min(target,container.scrollHeight-container.clientHeight));
    scrollContext={container,behavior:container.style.scrollBehavior};container.style.scrollBehavior='auto';
    if(!enabled||Math.abs(to-from)<1){container.scrollTop=to;cancelScroll();return;}
    const duration=Math.min(360,Math.max(180,Math.abs(to-from)*.25))/speed,start=performance.now();
    function step(now){const p=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-p,5);container.scrollTop=from+(to-from)*ease;if(p<1)scrollFrame=requestAnimationFrame(step);else cancelScroll();}
    scrollFrame=requestAnimationFrame(step);
  }
  window.HexLyricMotion={activate,enter,scrollTo,cancelScroll,stop,inspect:()=>({words:words.length,runningWords:words.filter(a=>a.playState==='running').length,scrolling:!!scrollFrame})};
})();
