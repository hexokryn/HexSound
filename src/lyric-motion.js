(function(){
  let words=[],entrances=[],scrollFrame=0;
  function cancelScroll(){cancelAnimationFrame(scrollFrame);scrollFrame=0;}
  function clearWords(){words.forEach(a=>a.cancel());words=[];}
  function stop(){clearWords();entrances.forEach(a=>a.cancel());entrances=[];cancelScroll();}
  function activate(line,{enabled=true,speed=1,style='cascade',windowSeconds=4}={}){
    clearWords();if(!enabled||!line)return;
    const nodes=[...line.children];
    const budget=Math.min(1100,Math.max(260,windowSeconds*1000*.75));
    const duration=Math.min(style==='cinema'?1000:820,budget)/speed;
    const spread=Math.min(style==='cinema'?230:430,budget*.4)/speed;
    nodes.forEach((word,index)=>{
      const delay=nodes.length>1?index/(nodes.length-1)*spread:0;
      const rise=style==='wave'?16+Math.sin(index*.7)*11:style==='cinema'?12:25;
      const frames=[
        {opacity:0,transform:`translate3d(0,${rise}px,0) rotateX(${style==='cinema'?0:12}deg) scale(.985)`,filter:`blur(${style==='cinema'?9:6}px)`,clipPath:'inset(0 0 90% 0)'},
        {opacity:1,transform:'translate3d(0,-1.5px,0) rotateX(0) scale(1)',filter:'blur(0px)',clipPath:'inset(0 0 0 0)',offset:.7},
        {opacity:1,transform:'translate3d(0,0,0) rotateX(0) scale(1)',filter:'blur(0px)',clipPath:'inset(0 0 0 0)'}
      ];
      const animation=word.animate(frames,{duration,delay,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'});
      words.push(animation);
    });
  }
  function enter(container,{enabled=true,speed=1}={}){
    entrances.forEach(a=>a.cancel());entrances=[];if(!enabled)return;
    [...container.children].slice(0,7).forEach((line,index)=>{
      entrances.push(line.animate([{translate:'0 20px',clipPath:'inset(0 0 100% 0)'},{translate:'0 0',clipPath:'inset(0 0 0 0)'}],{duration:800/speed,delay:index*55/speed,easing:'cubic-bezier(.22,1,.36,1)'}));
    });
  }
  function scrollTo(container,target,{enabled=true,speed=1}={}){
    cancelScroll();const from=container.scrollTop,to=Math.max(0,Math.min(target,container.scrollHeight-container.clientHeight));
    if(!enabled||Math.abs(to-from)<1){container.scrollTop=to;return;}
    const duration=Math.min(1050,Math.max(580,Math.abs(to-from)*.6))/speed,start=performance.now();
    function step(now){const p=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-p,5);container.scrollTop=from+(to-from)*ease;if(p<1)scrollFrame=requestAnimationFrame(step);else scrollFrame=0;}
    scrollFrame=requestAnimationFrame(step);
  }
  window.HexLyricMotion={activate,enter,scrollTo,cancelScroll,stop,inspect:()=>({words:words.length,runningWords:words.filter(a=>a.playState==='running').length,scrolling:!!scrollFrame})};
})();
