const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createPlaybackClock,lineAt}=require('../src/player-renderer.js');
test('an explicitly unknown media clock does not invent playback progress',()=>{let time=0;const clock=createPlaybackClock({now:()=>time,wallNow:()=>1700000000000+time});clock.update({position:0,duration:180,playing:true,clockKnown:false},{key:'unknown'});time=5000;assert.equal(clock.read(),0);clock.update({position:12,duration:180,playing:true,clockKnown:true},{key:'unknown'});time+=500;assert.equal(clock.read(),12.5);const dto=require('../src/player-state.cjs').sanitize({track:{provider:'youtube',title:'A',clockKnown:false,clockEstimated:false}});assert.equal(dto.track.clockKnown,false);assert.equal(dto.track.clockEstimated,false);});

function timing(){let time=0;const epoch=1700000000000;return {clock:createPlaybackClock({now:()=>time,wallNow:()=>epoch+time}),stamp:offset=>epoch+time+offset,advance:ms=>time+=ms};}
test('playback samples compensate IPC age and correct sub-second drift',()=>{
  const t=timing(),c=t.clock;
  c.update({position:10,duration:180,playing:true},{key:'a',sampledAt:t.stamp(-250)});
  assert.equal(c.read(),10.25);t.advance(250);assert.equal(c.read(),10.5);
  c.update({position:10.2,duration:180,playing:true},{key:'a',sampledAt:t.stamp(0)});
  assert.equal(c.read(),10.2); // Formerly ignored for drift below 1.2 seconds.
  t.advance(200);assert.ok(Math.abs(c.read()-10.4)<1e-9);
});
test('older snapshots cannot rewind playback and paused clocks stay still',()=>{
  const t=timing(),c=t.clock;
  c.update({position:12,duration:180,playing:true},{key:'a',sampledAt:t.stamp(0)});t.advance(300);
  assert.equal(c.update({position:8,duration:180,playing:true},{key:'a',sampledAt:t.stamp(-500)}),false);
  assert.equal(c.read(),12.3);
  c.update({position:12.25,duration:180,playing:false},{key:'a',sampledAt:t.stamp(0)});t.advance(2000);
  assert.equal(c.read(),12.25);
});
test('seeks survive an in-flight old sample, then accept confirmation and track changes',()=>{
  const t=timing(),c=t.clock;
  c.update({position:5,duration:180,playing:true},{key:'a',sampledAt:t.stamp(0)});
  c.seek(60);t.advance(250);
  c.update({position:5.1,duration:180,playing:true},{key:'a',sampledAt:t.stamp(0)});
  assert.equal(c.read(),60.25);
  t.advance(250);c.update({position:60.5,duration:180,playing:true},{key:'a',sampledAt:t.stamp(0)});assert.equal(c.read(),60.5);
  c.update({position:0,duration:20,playing:false},{key:'b',sampledAt:t.stamp(0)});assert.equal(c.read(),0);
  c.seek(50);assert.equal(c.read(),20);
});
test('transport compensation is bounded and lyrics activate exactly at line timestamps',()=>{
  const t=timing(),c=t.clock;
  c.update({position:5,duration:180,playing:true},{key:'a',sampledAt:t.stamp(-9000)});assert.equal(c.read(),7);
  const lines=[{time:0},{time:2.4},{time:5}];
  assert.equal(lineAt(lines,-.01),-1);assert.equal(lineAt(lines,2.3999),0);assert.equal(lineAt(lines,2.4),1);assert.equal(lineAt(lines,5),2);
});
test('a pre-seek sample cannot undo even a small seek across a lyric boundary',()=>{
  const t=timing(),c=t.clock;
  c.update({position:2.2,duration:180,playing:false},{key:'a',sampledAt:t.stamp(0)});
  t.advance(100);const stale=t.stamp(-50);c.seek(2.5);t.advance(50);
  assert.equal(c.update({position:2.2,duration:180,playing:false},{key:'a',sampledAt:stale}),false);
  assert.equal(c.read(),2.5);
});

function motionHarness(){
  let time=0,id=0;const frames=new Map(),animations=[];
  const context={window:{},performance:{now:()=>time},requestAnimationFrame:cb=>{frames.set(++id,cb);return id;},cancelAnimationFrame:key=>frames.delete(key)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/lyric-motion.js'),'utf8'),context);
  const element=(active=false,words=0)=>{
    const el={children:[],classList:{contains:name=>active&&name==='is-active'},animate:(keyframes,options)=>{const a={element:el,keyframes,options,currentTime:0,playState:'running',cancel(){this.playState='idle';}};animations.push(a);return a;}};
    el.children=Array.from({length:words},()=>element());return el;
  };
  return {motion:context.window.HexLyricMotion,element,animations,frames,advance:ms=>{time+=ms;const next=[...frames];frames.clear();next.forEach(([,cb])=>cb(time));}};
}
test('every word is readable at onset in every animation style, including the last staggered word',()=>{
  for(const style of ['cascade','wave','cinema']){
    const h=motionHarness(),line=h.element(true,8);h.motion.activate(line,{style,windowSeconds:1});
    const words=h.animations.filter(a=>line.children.includes(a.element));assert.equal(words.length,8);
    for(const a of words){assert.equal(a.keyframes[0].opacity,1);assert.equal(a.keyframes[0].filter,'blur(0px)');assert.equal(a.keyframes[0].clipPath,'inset(0 0 0 0)');assert.ok(a.options.duration+a.options.delay<=500);}
  }
});
test('line entrances never mask an active line and are cancelled if the line becomes active',()=>{
  const h=motionHarness(),active=h.element(true,3),next=h.element(false,3);
  h.motion.enter({children:[active,next]});assert.equal(h.animations.length,1);assert.equal(h.animations[0].element,next);
  const entrance=h.animations[0];h.motion.activate(next);assert.equal(entrance.playState,'idle');
  h.motion.stop();assert.equal(h.motion.inspect().runningWords,0);
});
test('loading lyrics mid-line skips an expired reveal rather than replaying late',()=>{
  const h=motionHarness(),line=h.element(true,5);h.motion.activate(line,{elapsedSeconds:2});
  assert.equal(h.animations.filter(a=>line.children.includes(a.element)).length,0);
  h.motion.activate(line,{enabled:false});assert.equal(h.motion.inspect().runningWords,0);
});
test('lyrics scroll bypasses native smooth scrolling and manual cancellation restores it',()=>{
  const h=motionHarness(),container={style:{scrollBehavior:'smooth'},scrollTop:0,scrollHeight:2000,clientHeight:400};
  h.motion.scrollTo(container,800);assert.equal(container.style.scrollBehavior,'auto');h.advance(100);assert.ok(container.scrollTop>0);
  h.motion.cancelScroll();const stopped=container.scrollTop;assert.equal(container.style.scrollBehavior,'smooth');h.advance(500);assert.equal(container.scrollTop,stopped);assert.equal(h.frames.size,0);
  h.motion.scrollTo(container,1200,{enabled:false});assert.equal(container.scrollTop,1200);assert.equal(container.style.scrollBehavior,'smooth');
  h.motion.scrollTo(container,400);h.advance(400);assert.equal(container.scrollTop,400);assert.equal(container.style.scrollBehavior,'smooth');
});
