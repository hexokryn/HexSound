(function () {
  if (window.HexAtmosphere) return;
  let canvas, ctx, config, raf=0, last=0, clock=0, width=1, height=1, particles=[], observer, frames=0;
  let active=true;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  function seeded(n) { const x=Math.sin(n*127.1+311.7)*43758.5453; return x-Math.floor(x); }
  function size() {
    if (!canvas) return;
    const rect=canvas.getBoundingClientRect(); width=Math.max(1,rect.width);height=Math.max(1,rect.height);
    const dpr=Math.min(window.devicePixelRatio||1,config?.quality==='battery'?1:1.5);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    draw();
  }
  function glow(x,y,r,color,alpha) {
    const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,color+'00');
    ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  function draw() {
    if (!ctx||!config) return;
    frames++;
    ctx.clearRect(0,0,width,height);
    if(config.effect==='none')return;
    const t=clock, [c1,c2,c3]=config.colors;
    const strength=config.intensity*(config.dark?1:.72);
    ctx.save();
    if(['aurora','orbs','bokeh'].includes(config.effect)) {
      const count=config.effect==='bokeh'?13:config.effect==='orbs'?5:4;
      for(let i=0;i<count;i++) {
        const x=width*(.1+seeded(i+6)*.8)+Math.sin(t*.12+i*1.8)*width*.2;
        const y=height*(.15+seeded(i+50)*.7)+Math.cos(t*.1+i*2)*height*.17;
        const r=Math.max(width,height)*(config.effect==='bokeh'?.06+seeded(i+90)*.08:config.effect==='aurora'?.45:.26);
        glow(x,y,r,[c1,c2,c3][i%3],strength*(config.effect==='bokeh'?.5:.65));
      }
      if(config.effect==='aurora') {
        ctx.lineWidth=2;ctx.strokeStyle=c2;
        for(let band=0;band<24;band++){
          ctx.globalAlpha=Math.sin(band/24*Math.PI)*.045*strength;
          ctx.beginPath();for(let x=-100;x<width+100;x+=15){const y=height*.42+Math.sin(x/width*4+t*.13+band*.014)*height*.16+band*3;x===-100?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();
        }
      }
    } else if(config.effect==='waves') {
      for(let i=0;i<18;i++) {
        ctx.globalAlpha=strength*(.09+i*.009);ctx.strokeStyle=i%2?c1:c3;ctx.lineWidth=1.2;ctx.beginPath();
        for(let x=-10;x<width+10;x+=8) { const y=height*(.38+i*.023)+Math.sin(x/width*5+t*.24+i*.12)*height*.12+Math.sin(x/width*2-t*.12)*height*.08;x===-10?ctx.moveTo(x,y):ctx.lineTo(x,y); }ctx.stroke();
      }
    } else if(config.effect==='stars'||config.effect==='constellation') {
      const points=particles.slice(0,config.quality==='battery'?38:90).map(p=>({x:((p.x*width+t*p.v*10)%(width+30))-15,y:p.y*height+Math.sin(t*.22+p.x*6)*22,r:p.r}));
      if(config.effect==='constellation') for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
        const a=points[i],b=points[j],d=Math.hypot(a.x-b.x,a.y-b.y);
        if(d<165){ctx.strokeStyle=c1;ctx.globalAlpha=(1-d/165)*.6*strength;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
      }
      points.forEach((p,i)=>{ctx.globalAlpha=strength*(.72+Math.sin(t*.4+i)*.24);ctx.fillStyle=i%3?c1:c3;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();});
    } else if(config.effect==='rain') {
      ctx.strokeStyle=c1;ctx.lineWidth=.8;
      particles.slice(0,55).forEach(p=>{const y=(p.y*height+t*(18+p.v*14))%(height+90)-45,x=p.x*width-y*.15;ctx.globalAlpha=strength*(.08+p.r*.08);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-8,y+35);ctx.stroke();});
    } else if(config.effect==='grid') {
      ctx.strokeStyle=c1;ctx.lineWidth=.7;ctx.globalAlpha=strength*.23;
      const horizon=height*.24,center=width*.52;
      for(let i=-14;i<=14;i++){ctx.beginPath();ctx.moveTo(center+i*22,horizon);ctx.lineTo(center+i*130,height);ctx.stroke();}
      for(let i=0;i<18;i++){const f=(i/18+t*.015)%1,y=horizon+f*f*(height-horizon);ctx.globalAlpha=strength*f*.3;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
      glow(center,horizon,width*.5,c2,strength*.18);
    } else if(config.effect==='grain') {
      ctx.fillStyle=c1;
      const step=Math.floor(t*4);
      for(let i=0;i<1100;i++){ctx.globalAlpha=seeded(i+step*10)*strength*.22;ctx.fillRect(seeded(i+step*3)*width,seeded(i+800+step)*height,1.4,1.4);}
      glow(width*.6,height*.3,width*.5,c2,strength*.15);
    }
    ctx.restore();ctx.globalAlpha=1;
  }
  function running() { return active && !document.hidden && !(reduce.matches&&config?.respectReducedMotion) && config?.animated && config.effect!=='none' && config.intensity>0; }
  function tick(now) {
    raf=0;if(!running()){draw();return;}
    const interval=config.quality==='battery'?66:33;
    if(now-last>=interval){clock+=Math.min((now-last)/1000,.1)*config.speed;last=now;draw();}
    raf=requestAnimationFrame(tick);
  }
  function resume() {cancelAnimationFrame(raf);raf=0;last=performance.now();draw();if(running())raf=requestAnimationFrame(tick);}
  window.HexAtmosphere={
    mount(next) {
      config=next;
      if(!canvas||!canvas.isConnected){
        canvas=document.createElement('canvas');canvas.id='hex-atmosphere';canvas.setAttribute('aria-hidden','true');
        canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;contain:strict;';
        document.body.prepend(canvas);ctx=canvas.getContext('2d',{alpha:true});
        particles=Array.from({length:90},(_,i)=>({x:seeded(i),y:seeded(i+200),v:.25+seeded(i+400),r:1+seeded(i+600)*1.5}));
        observer=new ResizeObserver(size);observer.observe(canvas);
      }
      canvas.style.backgroundImage=next.backgroundImage?`url("${next.backgroundImage}")`:'none';
      canvas.style.backgroundSize='cover';canvas.style.backgroundPosition='center';
      if(ctx){size();resume();}
    },
    setActive(value){active=!!value;document.documentElement.dataset.visualActive=String(active);resume();},
    inspect(){return{effect:config?.effect,running:!!raf,canvases:document.querySelectorAll('#hex-atmosphere').length,animated:!!config?.animated,frames,clock,width,height};}
  };
  document.addEventListener('visibilitychange',resume);reduce.addEventListener('change',resume);
})();
