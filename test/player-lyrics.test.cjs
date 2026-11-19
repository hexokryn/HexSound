const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parseLRC,queryTrack,createLyricsService,key}=require('../src/lyrics.cjs');
const {sanitize,imageURL}=require('../src/player-state.cjs');
const response=(value,status=200,headers={})=>({ok:status===200,status,headers:{get:name=>headers[name]??null},text:async()=>JSON.stringify(value)});
test('LRC parser handles repeated timestamps, fractional seconds and signed offsets',()=>{
  assert.deepEqual(parseLRC('[ar:Example]\n[offset:+500]\n[00:20.25][00:10.125]Repeat\n[00:05.5]First\n[00:66]Invalid'),[{time:5,text:'First'},{time:9.625,text:'Repeat'},{time:19.75,text:'Repeat'}]);
  assert.equal(parseLRC('[offset:-250]\n[00:00]Start')[0].time,.25);
  assert.equal(parseLRC('No timestamps here').length,0);
});
test('matching strips official-video labels and rejects wrong artists or remix durations',async()=>{
  assert.deepEqual(queryTrack({title:'Artist - Song (Official Audio)',artist:'Uploader',duration:200.1}),{title:'Song',artist:'Artist',duration:200});
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hexsound-lyrics-test-'));let calls=0;
  const service=createLyricsService(dir,{fetcher:async()=>++calls===1?response(null,404):response([{trackName:'Song',artistName:'Other',duration:200,syncedLyrics:'[00:01]wrong'},{trackName:'Song',artistName:'Artist',duration:300,syncedLyrics:'[00:01]wrong mix'}])});
  assert.equal((await service.lookup({title:'Song',artist:'Artist',duration:200})).status,'missing');assert.equal(calls,2);
});
test('lyrics cache avoids repeated network requests and respects retry-after',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hexsound-lyrics-test-'));let calls=0;
  const service=createLyricsService(dir,{fetcher:async()=>{calls++;return response({syncedLyrics:'[00:03]Original test line',duration:200});}});
  const track={title:'Test',artist:'Example',duration:200};assert.equal((await service.lookup(track)).status,'synced');await service.lookup(track);assert.equal(calls,1);
  let rateCalls=0;const limited=createLyricsService(dir,{fetcher:async()=>{rateCalls++;return response({},429,{'retry-after':'60'});}});
  assert.equal((await limited.lookup(track)).status,'limited');assert.equal((await limited.lookup({...track,title:'Another'})).status,'limited');assert.equal(rateCalls,1);
});
test('local LRC is stored by hashed track identity and works with online search disabled',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hexsound-lyrics-test-'));const service=createLyricsService(dir,{fetcher:async()=>{throw Error('Network must not run');}});
  const track={title:'../../example',artist:'Example',url:'https://soundcloud.com/example/test',duration:123};
  assert.match(key(track),/^[a-f0-9]{64}$/);service.importText(track,'[00:01]Original local test');const data=await service.lookup(track,false);assert.equal(data.status,'synced');assert.equal(data.source,'Локальный LRC');assert.throws(()=>service.importText(track,'No timestamps'));
  assert.equal((await service.lookup({...track,title:'different'},false)).status,'offline');
});
test('plain lyrics never receive invented timing, and remote metadata is constrained',()=>{
  const {record}=require('../src/lyrics.cjs');assert.equal(record({plainLyrics:'Original test'}).status,'plain');assert.equal(record({instrumental:true}).status,'instrumental');
  const data=sanitize({profile:{loggedIn:true,name:'Test user',url:'javascript:alert(1)',avatar:'https://evil.test/pixel'},track:{title:'Track',url:'file:///C:/test',artwork:'https://i1.sndcdn.com/art.jpg',duration:200,position:999,volume:2}});
  assert.equal(data.profile.url,'');assert.equal(data.profile.avatar,'');assert.equal(data.track.url,'');assert.equal(data.track.position,200);assert.equal(data.track.volume,1);assert.ok(data.track.artwork);assert.equal(imageURL('https://sndcdn.com.evil.test/a'),'');
});
