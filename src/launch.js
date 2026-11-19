(function(){
  let finished=false,previewVersion=0;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function finish(animate){
    if(finished)return;finished=true;
    const screen=document.querySelector('#launch-screen');
    if(animate){screen.classList.add('is-leaving');await sleep(320);}
    screen.hidden=true;document.body.classList.remove('is-launching');
    if(animate){document.body.classList.add('app-entrance');setTimeout(()=>document.body.classList.remove('app-entrance'),700);}
    await window.hex.introComplete(animate);
  }
  async function start(preview=false){
    const version=++previewVersion;
    const s=await window.hex.getSettings();const animate=s.motion&&!(s.respectReducedMotion&&matchMedia('(prefers-reduced-motion: reduce)').matches);
    if((s.skipIntro&&!preview)||!animate){await finish(false);return;}
    const screen=document.querySelector('#launch-screen');screen.hidden=false;screen.classList.remove('is-leaving');document.body.classList.add('is-launching');
    screen.classList.add('is-running');
    await sleep(1240);if(version===previewVersion)await finish(true);
  }
  const watchdog=setTimeout(()=>finish(false),3000);
  start().catch(()=>finish(false)).finally(()=>clearTimeout(watchdog));
  window.HexLaunch={replay:async()=>{finished=false;const screen=document.querySelector('#launch-screen');screen.classList.remove('is-running');void screen.offsetWidth;await start(true);},inspect:()=>({finished,hidden:document.querySelector('#launch-screen').hidden})};
})();
