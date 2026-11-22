const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {allowed,providers,createServiceWindows}=require('../src/service-windows.cjs');
const {canControl,createPlaybackClock}=require('../src/player-renderer.js');

function webFixture({audio=null,buttons=[]}={}){
  let time=0;const media={metadata:{title:'Track',artist:'Artist',artwork:[{src:'https://i.ytimg.com/vi/example/hqdefault.jpg'}]},playbackState:'playing',setPositionState(){},setActionHandler(){}};
  const context={window:{},navigator:{mediaSession:media},location:{href:'https://music.youtube.com/watch?v=example'},performance:{now:()=>time},Date:{now:()=>1700000000000+time},document:{querySelectorAll:selector=>selector==='audio,video'?(audio?[audio]:[]):buttons}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/web-player.js'),'utf8'),context);
  return {player:context.window.HexWebPlayer,media,advance:ms=>time+=ms};
}

test('generic audio snapshots preserve zero currentTime over a nonzero MediaSession clock',async()=>{
  const audio={duration:180,currentTime:0,paused:false,volume:.6,async play(){this.paused=false;},pause(){this.paused=true;}};
  const h=webFixture({audio});h.media.setPositionState({duration:180,position:45});h.advance(300);
  const s=h.player.snapshot('youtube');assert.equal(s.track.position,0);assert.equal(s.track.duration,180);assert.equal(s.track.playing,true);assert.equal(s.sampledAt,1700000000300);
  assert.equal(await h.player.control('seek',200),true);assert.equal(audio.currentTime,180);
  assert.equal(await h.player.control('seek',-10),true);assert.equal(audio.currentTime,0);
  assert.equal(await h.player.control('seek',NaN),false);assert.equal(audio.currentTime,0);
  assert.equal(await h.player.control('volume',2),true);assert.equal(audio.volume,1);
  assert.equal(await h.player.control('toggle'),true);assert.equal(audio.paused,true);
  assert.equal(await h.player.control('toggle'),true);assert.equal(audio.paused,false);
});

test('MediaSession-only clock freezes on pause and excludes paused time after resuming',()=>{
  const h=webFixture();h.media.setPositionState({duration:180,position:10});h.advance(1000);
  assert.equal(h.player.snapshot('spotify').track.position,11);
  h.media.playbackState='paused';assert.equal(h.player.snapshot('spotify').track.position,11);
  h.advance(3000);assert.equal(h.player.snapshot('spotify').track.position,11);
  h.media.playbackState='playing';assert.equal(h.player.snapshot('spotify').track.position,11);
  h.advance(1000);assert.equal(h.player.snapshot('spotify').track.position,12);
  h.media.setPositionState({duration:180});assert.equal(h.player.snapshot('spotify').track.position,0);
  h.media.setPositionState({duration:180,position:179.5,playbackRate:2});h.advance(1000);assert.equal(h.player.snapshot('spotify').track.position,180);
});

test('generic handlers expose real capabilities and await the registered action',async()=>{
  const h=webFixture();let finish,received;
  h.media.setActionHandler('seekto',args=>{received=args;return new Promise(resolve=>{finish=resolve;});});
  const s=h.player.snapshot('spotify');assert.equal(s.track.controls.seek,true);assert.equal(s.track.controls.volume,false);assert.equal(s.track.controls.like,false);assert.equal(s.track.controls.next,false);
  let settled=false;const pending=h.player.control('seek',32).then(value=>{settled=true;return value;});await Promise.resolve();assert.equal(settled,false);assert.equal(received.seekTime,32);assert.equal(received.action,'seekto');finish();assert.equal(await pending,true);
  assert.equal(await h.player.control('seek',NaN),false);assert.equal(await h.player.control('volume',NaN),false);
  h.media.setActionHandler('seekto',null);assert.equal(await h.player.control('seek',32),false);
  for(const action of ['next','previous','like','repeat','shuffle','volume'])assert.equal(await h.player.control(action,.5),false);
  h.media.setActionHandler('nexttrack',async()=>{throw Error('provider denied');});await assert.rejects(h.player.control('next'),/provider denied/);
});

test('generic toggle fallback only invokes an enabled visible playback button',async()=>{
  let clicks=0;const button=(label,width=20,disabled=false)=>({disabled,getAttribute:()=>label,getBoundingClientRect:()=>({width}),click:()=>clicks++});
  const h=webFixture({buttons:[button('Play',0),button('Pause',20,true),button('Pause'),button('Delete')]});
  assert.equal(await h.player.control('toggle'),true);assert.equal(clicks,1);
  h.media.playbackState='paused';assert.equal(await h.player.control('toggle'),false);assert.equal(clicks,1);
});

test('provider URLs stay inside HTTPS host allowlists without userinfo or lookalike hosts',()=>{
  for(const [id,p] of Object.entries(providers)){assert.equal(allowed(id,p.home),true);assert.equal(allowed(id,p.login),true);}
  for(const value of ['http://open.spotify.com/','https://open.spotify.com.attacker.test/','https://attacker.test/?next=https://open.spotify.com','https://user:pass@open.spotify.com/','file:///etc/passwd','javascript:alert(1)','data:text/html,hello'])assert.equal(allowed('spotify',value),false,value);
  assert.equal(allowed('unknown','https://open.spotify.com'),false);
  assert.equal(allowed('spotify','https://music.youtube.com',true),false);
  assert.equal(allowed('youtube','https://open.spotify.com',true),false);
  assert.equal(allowed('spotify','https://accounts.google.com'),false);
  assert.equal(allowed('spotify','https://accounts.google.com',true),true);
});

function windowFixture(){
  const windows=[],external=[];
  class Contents extends EventEmitter{
    constructor(){super();this.url='';this.session={setPermissionRequestHandler:handler=>this.permission=handler,setPermissionCheckHandler:handler=>this.permissionCheck=handler};}
    getURL(){return this.url;}
    setWindowOpenHandler(handler){this.openHandler=handler;}
    async executeJavaScript(){throw Error('provider unavailable');}
  }
  class Window extends EventEmitter{
    constructor(options){super();this.options=options;this.webContents=new Contents();this.destroyed=false;windows.push(this);}
    isDestroyed(){return this.destroyed;}
    show(){this.visible=true;}
    hide(){this.visible=false;}
    isVisible(){return !!this.visible;}
    async loadURL(url){this.webContents.url=url;}
    destroy(){this.destroyed=true;this.emit('closed');}
  }
  const services=createServiceWindows({BrowserWindow:Window,parent:{},onExternal:url=>external.push(url)});
  return {services,windows,external};
}

test('service windows isolate provider sessions and convert failed remote actions to false',async()=>{
  const h=windowFixture();await h.services.open('spotify');await h.services.open('youtube');
  const [spotify,youtube]=h.windows;
  assert.notEqual(spotify.options.webPreferences.partition,youtube.options.webPreferences.partition);
  for(const win of h.windows){assert.equal(win.options.webPreferences.nodeIntegration,false);assert.equal(win.options.webPreferences.contextIsolation,true);assert.equal(win.options.webPreferences.sandbox,true);let permitted;win.webContents.permission(null,'camera',value=>permitted=value);assert.equal(permitted,false);assert.equal(win.webContents.permissionCheck(),false);}
  assert.equal(await h.services.control('spotify','next'),false);assert.equal(await h.services.control('missing','toggle'),false);assert.equal(await h.services.snapshot('spotify'),null);
  let blocked=false;spotify.webContents.emit('will-navigate',{preventDefault(){blocked=true;}},'https://music.youtube.com');assert.equal(blocked,true);assert.equal(h.external[0],'https://music.youtube.com');
  assert.equal(spotify.webContents.openHandler({url:'https://attacker.test'}).action,'deny');
  await assert.rejects(h.services.open('spotify',{url:'https://music.youtube.com'}),/Недопустимая/);
  h.services.close();assert.equal(h.services.status().length,0);assert.equal(spotify.isDestroyed(),true);
});

test('closing an idle service releases its renderer while playing and reopened windows survive',async()=>{
  const h=windowFixture();await h.services.open('spotify');let win=h.windows[0];
  win.webContents.executeJavaScript=async()=>({track:{playing:false}});win.emit('close',{preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(win.isDestroyed(),true);
  await h.services.open('spotify');win=h.windows[1];win.webContents.executeJavaScript=async()=>({track:{playing:true}});win.emit('close',{preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(win.isDestroyed(),false);
  let resolve;win.webContents.executeJavaScript=()=>new Promise(r=>resolve=r);win.emit('close',{preventDefault(){}});win.show();resolve({track:{playing:false}});await new Promise(r=>setImmediate(r));assert.equal(win.isDestroyed(),false);h.services.close();
});

function remoteFixture({audio=null,filled=25.5,full=100,elapsed='0:10'}={}){
  let time=0;const state={filled,full,elapsed,title:'Track',playing:true};
  const nodes=new Map([
    ['.playbackSoundBadge__titleLink, .playbackSoundBadge__title a',{get textContent(){return state.title;},getAttribute:name=>name==='href'?'/artist/track':state.title}],
    ['.playbackTimeline__duration',{textContent:'3:00'}],['.playbackTimeline__timePassed',{get textContent(){return state.elapsed;}}],
    ['.playbackTimeline__progressBackground',{getBoundingClientRect:()=>({left:0,top:0,width:state.full})}],
    ['.playbackTimeline__progressBar',{getBoundingClientRect:()=>({width:state.filled})}],
    ['.playControls__play',{classList:{contains:()=>state.playing}}],
    ['.playbackTimeline__progressWrapper',{dispatchEvent(){}}]
  ]);
  const context={window:{},navigator:{mediaSession:{metadata:{title:'Track',artist:'Artist'},get playbackState(){return state.playing?'playing':'paused';}}},location:{href:'https://soundcloud.com/discover'},performance:{now:()=>time},Date:{now:()=>1700000000123+time},URL,MouseEvent:function(type,options){return {type,...options};},getComputedStyle:()=>({backgroundImage:'none'}),document:{addEventListener(){},querySelector:s=>nodes.get(s)||null,querySelectorAll:s=>s==='audio'&&audio?[audio]:[],dispatchEvent(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/remote-player.js'),'utf8'),context);
  const player=context.window.HexRemotePlayer;player.advance=ms=>time+=ms;player.set=patch=>Object.assign(state,patch);player.hook=track=>context.window.HexWebPlayer={snapshot:()=>({track})};return player;
}

test('SoundCloud samples fractional timeline progress instead of rounded text with a timestamp',()=>{
  const remote=remoteFixture(),s=remote.snapshot();assert.equal(s.sampledAt,1700000000123);assert.equal(s.track.position,45.9);
  assert.equal(remoteFixture({filled:0,elapsed:'0:10'}).snapshot().track.position,0);
  assert.equal(remoteFixture({full:0,elapsed:'0:10'}).snapshot().track.position,10);
  assert.equal(remoteFixture({filled:120}).snapshot().track.position,180);
});

test('SoundCloud audio currentTime zero takes priority over nonzero timeline and text',()=>{
  const audio={duration:180,currentTime:0,paused:true,volume:.5};const remote=remoteFixture({audio});
  remote.hook({clockKnown:true,position:45,duration:180,playing:true});
  assert.equal(remote.snapshot().track.position,0);assert.equal(remote.snapshot().track.playing,false);
  assert.equal(remote.control('seek',40),true);assert.equal(audio.currentTime,40);
  assert.equal(remote.control('seek',NaN),false);assert.equal(audio.currentTime,40);
  assert.equal(remote.control('volume',2),true);assert.equal(audio.volume,1);
});

test('repeated fractional or integer DOM samples never rewind or freeze a playing fallback clock',()=>{
  for(const initial of [{filled:25.5,full:100},{filled:undefined,full:0,elapsed:'0:10'}]){
    const remote=remoteFixture(initial),start=remote.snapshot().track.position;
    for(let n=1;n<=20;n++){remote.advance(200);const s=remote.snapshot();assert.ok(Math.abs(s.track.position-(start+n*.2))<1e-8);assert.equal(s.track.clockEstimated,true);}
  }
});

test('rounded fresh labels correct forward without moving an estimated clock backwards',()=>{
  const remote=remoteFixture({full:0,elapsed:'0:10'});remote.snapshot();remote.advance(650);remote.set({elapsed:'0:11'});assert.equal(remote.snapshot().track.position,11);
  remote.advance(1100);remote.set({elapsed:'0:12'});assert.ok(Math.abs(remote.snapshot().track.position-12.1)<1e-8);
  remote.advance(200);assert.ok(Math.abs(remote.snapshot().track.position-12.3)<1e-8);
});

test('fallback clocks freeze on pause, resume without paused time and reset on seek or track change',()=>{
  const remote=remoteFixture({full:0,elapsed:'0:10'});remote.snapshot();remote.advance(2000);remote.set({playing:false});assert.equal(remote.snapshot().track.position,12);
  remote.advance(4000);assert.equal(remote.snapshot().track.position,12);remote.set({playing:true});assert.equal(remote.snapshot().track.position,12);
  remote.advance(1000);assert.equal(remote.snapshot().track.position,13);
  remote.set({elapsed:'0:45'});assert.equal(remote.snapshot().track.position,45);remote.set({elapsed:'0:08'});assert.equal(remote.snapshot().track.position,8);
  remote.set({title:'Next track',elapsed:'0:00'});assert.equal(remote.snapshot().track.position,0);remote.advance(500000);assert.equal(remote.snapshot().track.position,180);
});

test('hidden-view seek commands anchor the estimate even before a frozen bar repaints',()=>{
  const remote=remoteFixture({filled:10,full:180});assert.equal(remote.snapshot().track.position,10);
  assert.equal(remote.control('seek',60),true);remote.advance(400);assert.equal(remote.snapshot().track.position,60.4);
  remote.set({filled:60.5});remote.advance(100);assert.ok(Math.abs(remote.snapshot().track.position-60.5)<1e-8);
  assert.equal(remote.control('seek',15),true);remote.advance(200);assert.equal(remote.snapshot().track.position,15.2);
});

test('unknown DOM clocks do not extrapolate, and a known MediaSession clock takes priority',()=>{
  const unknown=remoteFixture({full:0,elapsed:''});assert.equal(unknown.snapshot().track.clockKnown,false);unknown.advance(10000);assert.equal(unknown.snapshot().track.position,0);
  const remote=remoteFixture({filled:10,full:180});remote.hook({clockKnown:true,position:27.125,duration:200,playing:true});
  const s=remote.snapshot();assert.equal(s.track.position,27.125);assert.equal(s.track.duration,200);assert.equal(s.track.clockEstimated,false);
  remote.hook({clockKnown:false,position:0,duration:0,playing:true});remote.advance(500);assert.ok(remote.snapshot().track.position>27);
});

test('remote-to-renderer clock stays continuous through frequent samples from a frozen hidden timeline',()=>{
  let time=0;const remote=remoteFixture({full:0,elapsed:'0:10'}),clock=createPlaybackClock({now:()=>time,wallNow:()=>1700000000123+time});
  for(let n=0;n<=100;n++){
    const sample=remote.snapshot();clock.update(sample.track,{key:'same-track',sampledAt:sample.sampledAt});
    assert.ok(Math.abs(clock.read()-(10+time/1000))<1e-8);
    time+=200;remote.advance(200);
  }
  // A changed observation that contradicts extrapolation is authoritative:
  // e.g. playback stalled while no media clock was available.
  remote.set({elapsed:'0:11'});const corrected=remote.snapshot();clock.update(corrected.track,{key:'same-track',sampledAt:corrected.sampledAt});assert.equal(clock.read(),11);
});

test('player capability flags disable unsupported provider controls while native controls remain available',()=>{
  const native={available:true};assert.equal(canControl(native,'like'),true);assert.equal(canControl(native,'seek'),true);
  const provider={available:true,controls:{toggle:true,seek:true,volume:false,like:false,shuffle:false,repeat:false,previous:false,next:false}};
  for(const action of ['volume','like','shuffle','repeat','previous','next'])assert.equal(canControl(provider,action),false);
  assert.equal(canControl(provider,'toggle'),true);assert.equal(canControl(provider,'seek'),true);assert.equal(canControl({...provider,available:false},'toggle'),false);
});
