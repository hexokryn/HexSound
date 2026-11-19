'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createLibrary}=require('../src/library/index.cjs');
const {normalizeTrack,scoreMatch}=require('../src/library/model.cjs');
const caps={libraryRead:true,search:true,playlistCreate:true,playlistAdd:true};
const song=(id,extra={})=>({id,title:'Night drive',artist:'Example artist',duration:180,url:'https://example.test/tracks/'+id,...extra});
function setup(t,adapters={},options={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hexsound-library-test-')),file=path.join(dir,'library.json');
  t.after(()=>{if(path.dirname(path.resolve(dir))!==path.resolve(os.tmpdir())||!path.basename(dir).startsWith('hexsound-library-test-'))throw Error('Unexpected test directory');fs.rmSync(dir,{recursive:true,force:true});});
  const getAdapter=service=>adapters[service]||{capabilities:{}};
  return {file,getAdapter,lib:createLibrary(file,{getAdapter,...options})};
}

test('library normalization stores metadata and provenance without imported secrets or executable URLs',t=>{
  const {lib}=setup(t);lib.importData({service:'spotify',tracks:[song(42,{url:'javascript:alert(1)',artwork:'https://user:secret@example.test/a',duration:Infinity,access_token:'do-not-save',isrc:'US-UM7-17-10000'})],playlists:[]});
  const track=lib.snapshot().tracks[0];assert.equal(track.sources[0].id,'42');assert.equal(track.sources[0].url,'');assert.equal(track.artwork,'');assert.equal(track.duration,0);assert.equal(track.sources[0].isrc,'USUM71710000');
  assert.ok(!JSON.stringify(lib.exportData()).includes('do-not-save'));
  assert.equal(normalizeTrack({title:'',artist:'Unknown'},'spotify'),null);
});

test('unified tracks retain stable IDs when a second service is connected; alternate recordings remain separate',t=>{
  const {lib}=setup(t);lib.importData({service:'spotify',tracks:[song('sp')]});const original=lib.snapshot().tracks[0].id;
  lib.importData({service:'soundcloud',tracks:[song('sc',{duration:181,isrc:'USUM71710000'}),song('live',{title:'Night drive (Live)',duration:180})]});
  const view=lib.snapshot();assert.equal(view.total,2);const joined=view.tracks.find(track=>track.sources.length===2);assert.equal(joined.id,original);assert.deepEqual(joined.sources.map(s=>s.service).sort(),['soundcloud','spotify']);
  lib.importData({service:'youtube',tracks:[song('different',{isrc:'GBUM71710000'})]});assert.equal(lib.snapshot().total,3);
});

test('sync only removes cached provider tracks after a complete successful refresh',async t=>{
  let response={tracks:[song('fresh')],playlists:[],complete:false},fail=false;
  const {lib}=setup(t,{spotify:{capabilities:caps,listLibrary:async()=>{if(fail)throw Object.assign(Error('token=secret'),{code:'not_connected'});return response;}}});
  lib.importData({service:'spotify',tracks:[song('old',{title:'Older song'})]});lib.importData({service:'soundcloud',tracks:[song('other',{title:'Other service'})]});
  let view=await lib.sync('spotify');assert.equal(view.total,3);assert.equal(view.providers.spotify.partial,true);assert.equal(view.providers.spotify.syncing,false);
  fail=true;await assert.rejects(lib.sync('spotify'),{code:'not_connected'});assert.equal(lib.snapshot().total,3);assert.equal(lib.snapshot().providers.spotify.error,'not_connected');assert.ok(!JSON.stringify(lib.snapshot()).includes('secret'));
  fail=false;response={tracks:[song('fresh')],playlists:[],complete:true};view=await lib.sync('spotify');assert.equal(view.total,2);assert.equal(view.providers.spotify.partial,false);assert.equal(view.providers.soundcloud.tracks,1);
});

test('playlist provenance, local search, export and recovery survive a restart',t=>{
  const {lib,file,getAdapter}=setup(t);lib.importData({service:'spotify',tracks:[song('a'),song('b',{title:'Morning',artist:'Other'})],playlists:[{id:'list',name:'Road',url:'https://example.test/list',trackIds:['a','b']}]});
  const playlist=lib.snapshot().playlists[0];assert.equal(lib.snapshot({query:'MORNING',playlistId:playlist.id}).tracks[0].title,'Morning');assert.equal(lib.snapshot({service:'soundcloud'}).total,0);assert.equal(lib.snapshot({limit:1,offset:1}).tracks.length,1);
  const reopened=createLibrary(file,{getAdapter});assert.deepEqual(reopened.snapshot().tracks,lib.snapshot().tracks);assert.equal(reopened.snapshot().playlists[0].id,playlist.id);
  const backup=lib.exportData();lib.importData(backup);fs.writeFileSync(file,'invalid JSON');const recovered=createLibrary(file,{getAdapter});assert.equal(recovered.snapshot().storageWarning,'library_recovered');assert.equal(recovered.snapshot().total,2);
});

test('partial or merged imports preserve existing playlist membership until an authoritative refresh',async t=>{
  let complete=false;const source={capabilities:caps,listLibrary:async()=>({tracks:[song('new',{title:'New'})],playlists:[{id:'same',title:'List',trackIds:['new']}],complete})};
  const {lib}=setup(t,{spotify:source});lib.importData({service:'spotify',tracks:[song('old',{title:'Old'})],playlists:[{id:'same',title:'List',trackIds:['old']}]});
  await lib.sync('spotify');assert.equal(lib.snapshot().playlists[0].trackIds.length,2);assert.equal(lib.snapshot().total,2);
  complete=true;await lib.sync('spotify');assert.equal(lib.snapshot().playlists[0].trackIds.length,1);assert.equal(lib.snapshot().tracks[0].title,'New');
});

test('transfer matching rejects different versions and durations and leaves unknown timing for review',()=>{
  const source=normalizeTrack(song('src'),'spotify');
  assert.equal(scoreMatch(source,normalizeTrack(song('x',{title:'Night drive (Live)'}),'youtube')).reason,'version_mismatch');
  assert.equal(scoreMatch(source,normalizeTrack(song('x',{duration:220}),'youtube')).reason,'duration_mismatch');
  assert.equal(scoreMatch(normalizeTrack(song('src',{title:'Night drive (DJ A Remix)'}),'spotify'),normalizeTrack(song('x',{title:'Night drive (DJ B Remix)'}),'youtube')).reason,'version_mismatch');
  assert.equal(scoreMatch(source,normalizeTrack(song('x',{title:'Night drive (Official Audio)'}),'youtube')).score,1);
  assert.ok(scoreMatch(source,normalizeTrack(song('x',{duration:0}),'youtube')).score<.92);
  const missingArtist=scoreMatch({...source,artist:''},normalizeTrack(song('x'),'youtube'));assert.equal(missingArtist.reason,'artist_unknown');assert.ok(missingArtist.score>=.55&&missingArtist.score<.92);
});

test('manually imported provider IDs are searched, while API-verified target records can reuse their catalog ID',async t=>{
  let searches=0;const target={capabilities:caps,listLibrary:async()=>({tracks:[song('api-id')],playlists:[],complete:true}),searchTracks:async()=>{searches++;return[song('found-id')];}};
  const {lib}=setup(t,{spotify:target});lib.importData({service:'spotify',tracks:[song('file-id',{verified:true})]});let plan=await lib.planTransfer({targetService:'spotify',trackIds:lib.snapshot().tracks.map(t=>t.id)});assert.equal(searches,1);assert.equal(plan.items[0].selectedId,'found-id');assert.equal(lib.snapshot().tracks[0].sources[0].verified,false);
  await lib.sync('spotify');plan=await lib.planTransfer({targetService:'spotify',trackIds:lib.snapshot().tracks.map(t=>t.id)});assert.equal(searches,1);assert.equal(plan.items[0].selectedId,'api-id');assert.equal(plan.items[0].candidates[0].reason,'same_service');
});

test('catalog IDs verified under a previous account are searched again for the current connection',async t=>{
  let version='1:a',searches=0;const target={capabilities:caps,get connectionVersion(){return version;},listLibrary:async()=>({tracks:[song('private-old-id')],playlists:[],complete:true}),searchTracks:async()=>{searches++;return[song('new-account-id')];}};
  const {lib}=setup(t,{spotify:target});await lib.sync('spotify');let plan=await lib.planTransfer({targetService:'spotify',trackIds:lib.snapshot().tracks.map(t=>t.id)});assert.equal(plan.items[0].selectedId,'private-old-id');assert.equal(searches,0);
  version='2:b';plan=await lib.planTransfer({targetService:'spotify',trackIds:lib.snapshot().tracks.map(t=>t.id)});assert.equal(plan.items[0].selectedId,'new-account-id');assert.equal(searches,1);
});

test('search concurrency is bounded and individual search failures remain visible in preview',async t=>{
  let running=0,max=0,calls=0;
  const target={capabilities:caps,searchTracks:async({title})=>{running++;max=Math.max(max,running);calls++;await new Promise(r=>setTimeout(r,3));running--;if(title==='Unavailable')throw Object.assign(Error('offline'),{code:'network_error'});return [song(title,{title})];}};
  const {lib}=setup(t,{youtube:target},{searchConcurrency:2});lib.importData({tracks:['First','Second','Third','Unavailable'].map((title,i)=>song(String(i),{title}))});
  const plan=await lib.planTransfer({targetService:'youtube',trackIds:lib.snapshot().tracks.map(t=>t.id)});assert.equal(max,2);assert.equal(calls,4);assert.equal(plan.counts.matched,3);assert.equal(plan.counts.unavailable,1);assert.equal(plan.items.find(i=>i.status==='unavailable').error,'network_error');
});

test('ambiguous matches require explicit review before any playlist is created',async t=>{
  let created=0;const target={capabilities:caps,searchTracks:async()=>[song('one'),song('two')],createPlaylist:async()=>{created++;return{id:'new'};},addTracks:async()=>({addedIds:['two']})};
  const {lib}=setup(t,{spotify:target});lib.importData({tracks:[song('local')]});const plan=await lib.planTransfer({targetService:'spotify',trackIds:lib.snapshot().tracks.map(t=>t.id)});assert.equal(plan.counts.ambiguous,1);
  await assert.rejects(lib.executeTransfer({planId:plan.id}),{code:'review_required'});assert.equal(created,0);
  await assert.rejects(lib.executeTransfer({planId:plan.id,choices:{[plan.items[0].sourceId]:'not-a-candidate'}}),{code:'invalid_choice'});assert.equal(created,0);
  const result=await lib.executeTransfer({planId:plan.id,choices:{[plan.items[0].sourceId]:'two'}});assert.equal(result.status,'complete');assert.equal(result.added,1);assert.equal(created,1);
  await assert.rejects(lib.executeTransfer({planId:plan.id}),{code:'plan_not_found'});
});

test('provider-wide authorization errors stop further catalog requests instead of consuming an entire library quota',async t=>{
  let calls=0;const target={capabilities:caps,searchTracks:async()=>{calls++;throw Object.assign(Error('denied'),{code:'ACCESS_DENIED',status:403});}};
  const {lib}=setup(t,{spotify:target},{searchConcurrency:3});lib.importData({tracks:Array.from({length:20},(_,i)=>song(String(i),{title:'Track '+i}))});
  const plan=await lib.planTransfer({targetService:'spotify',trackIds:lib.snapshot().tracks.map(t=>t.id)});assert.ok(calls<=3);assert.equal(plan.counts.unavailable,20);assert.ok(plan.items.every(i=>i.error==='ACCESS_DENIED'));
});

test('unmatched tracks and unsupported services never fabricate a remote transfer',async t=>{
  let writes=0;const target={capabilities:caps,searchTracks:async()=>[song('wrong',{artist:'Different artist'})],createPlaylist:async()=>{writes++;return{id:'bad'};}};
  const {lib}=setup(t,{spotify:target});lib.importData({tracks:[song('local')]});const plan=await lib.planTransfer({targetService:'spotify',trackIds:lib.snapshot().tracks.map(t=>t.id)});assert.equal(plan.counts.unmatched,1);const result=await lib.executeTransfer({planId:plan.id});assert.equal(result.status,'nothing_to_transfer');assert.equal(writes,0);
  await assert.rejects(lib.sync('yandex'),{code:'unsupported_operation'});await assert.rejects(lib.planTransfer({targetService:'yandex',trackIds:lib.snapshot().tracks.map(t=>t.id)}),{code:'unsupported_operation'});
});

test('preview discloses missing source records and collapsed duplicates instead of silently dropping them',async t=>{
  const target={capabilities:caps,searchTracks:async()=>[song('one')],createPlaylist:async()=>({id:'new'}),addTracks:async()=>({addedIds:['one']})};
  const {lib}=setup(t,{spotify:target});lib.importData({tracks:[song('local')],playlists:[{id:'p',title:'Source',trackIds:['local','local','missing'],trackCount:5}]});
  const p=lib.snapshot().playlists[0];assert.equal(p.unavailableTrackCount,3);assert.equal(p.duplicateTrackCount,1);
  const plan=await lib.planTransfer({targetService:'spotify',playlistId:p.id});assert.equal(plan.sourceUnavailable,3);assert.equal(plan.sourceDuplicates,1);assert.equal(plan.total,5);assert.equal(plan.counts.unavailable,3);assert.equal(plan.counts.matched,1);
  const result=await lib.executeTransfer({planId:plan.id});assert.equal(result.added,1);assert.equal(result.skipped,4);assert.equal(result.sourceUnavailable,3);
});

test('transfer creates a new playlist, preserves source playlists and reports per-track partial writes',async t=>{
  const calls=[];let batches=0;
  const target={capabilities:caps,maxAddBatch:2,searchTracks:async({title})=>[song(title,{title})],createPlaylist:async params=>{calls.push(params);return{id:'destination',url:'https://example.test/new'};},addTracks:async({playlistId,trackIds})=>{calls.push({playlistId,trackIds});if(++batches===2)throw Object.assign(Error('server unavailable'),{code:'network_error',addedIds:[trackIds[0]]});return{addedIds:trackIds};}};
  const {lib}=setup(t,{spotify:target});lib.importData({service:'local',tracks:['A','B','C','D','E'].map(title=>song(title,{title})),playlists:[{id:'source',title:'Original',trackIds:['A','B','C','D','E']}]});
  const before=lib.exportData(),plan=await lib.planTransfer({targetService:'spotify',playlistId:lib.snapshot().playlists[0].id}),progress=[];
  const result=await lib.executeTransfer({planId:plan.id},{onProgress:p=>progress.push(p)});assert.equal(result.status,'partial');assert.equal(result.added,3);assert.equal(result.failed,1);assert.equal(result.items.filter(i=>i.result==='not_attempted').length,1);assert.equal(result.items.filter(i=>i.uncertain).length,1);assert.equal(calls.length,3);assert.equal(calls[0].title,'Original');assert.deepEqual(lib.exportData(),before);assert.equal(progress.at(-1).status,'partial');
});

test('cancelling after playlist creation leaves a visible destination and makes no add request',async t=>{
  let writes=0;const target={capabilities:caps,searchTracks:async()=>[song('one')],createPlaylist:async()=>({id:'empty',url:'https://example.test/new'}),addTracks:async()=>{writes++;}};
  const {lib}=setup(t,{spotify:target});lib.importData({tracks:[song('local')]});const plan=await lib.planTransfer({targetService:'spotify',trackIds:lib.snapshot().tracks.map(t=>t.id)});
  const result=await lib.executeTransfer({planId:plan.id},{onProgress:p=>{if(p.playlist)lib.cancelTransfer();}});assert.equal(result.status,'cancelled');assert.equal(result.playlist.id,'empty');assert.equal(result.added,0);assert.equal(writes,0);assert.equal(lib.cancelTransfer(),false);
});

test('uncertain write failures are never retried automatically',async t=>{
  let calls=0;const target={capabilities:caps,searchTracks:async()=>[song('one')],createPlaylist:async()=>{calls++;throw Object.assign(Error('connection lost'),{code:'network_error'});}};
  const {lib}=setup(t,{spotify:target});lib.importData({tracks:[song('local')]});const plan=await lib.planTransfer({targetService:'spotify',trackIds:lib.snapshot().tracks.map(t=>t.id)});const result=await lib.executeTransfer({planId:plan.id});assert.equal(result.status,'failed');assert.equal(result.uncertain,true);assert.equal(calls,1);
});

test('the same cancel action aborts an in-progress preview and leaves no late plan',async t=>{
  const target={capabilities:caps,searchTracks:()=>new Promise(()=>{})};const {lib}=setup(t,{spotify:target});lib.importData({tracks:[song('local')]});
  const pending=lib.planTransfer({targetService:'spotify',trackIds:lib.snapshot().tracks.map(t=>t.id)});assert.equal(lib.inspect().planning,true);assert.equal(lib.cancelTransfer(),true);await assert.rejects(pending,{code:'cancelled'});assert.equal(lib.inspect().planning,false);assert.equal(lib.inspect().plans,0);
});

test('a reviewed plan cannot create a playlist after the target connection changes or disconnects',async t=>{
  let version='1:account-a',connected=true,writes=0;
  const target={get connectionVersion(){return version;},get capabilities(){return connected?caps:{};},searchTracks:async()=>[song('one')],createPlaylist:async()=>{writes++;return{id:'new'};},addTracks:async()=>{writes++;return{addedIds:['one']};}};
  const {lib}=setup(t,{spotify:target});lib.importData({tracks:[song('local')]});const ids=lib.snapshot().tracks.map(t=>t.id),plan=await lib.planTransfer({targetService:'spotify',trackIds:ids});assert.equal(plan.connectionVersion,'1:account-a');
  version='2:account-b';await assert.rejects(lib.executeTransfer({planId:plan.id}),{code:'connection_changed',message:'Подключение изменилось. Найдите совпадения снова.'});assert.equal(writes,0);
  version='3:';connected=false;await assert.rejects(lib.executeTransfer({planId:plan.id}),{code:'connection_changed'});assert.equal(writes,0);
});

test('an account switch while catalog search is pending does not publish a stale plan',async t=>{
  let version='1:a',release;const gate=new Promise(resolve=>release=resolve);
  const target={capabilities:caps,get connectionVersion(){return version;},searchTracks:async()=>{await gate;return[song('one')];}};
  const {lib}=setup(t,{spotify:target});lib.importData({tracks:[song('local')]});const pending=lib.planTransfer({targetService:'spotify',trackIds:lib.snapshot().tracks.map(t=>t.id)});version='2:b';release();await assert.rejects(pending,{code:'connection_changed'});assert.equal(lib.inspect().plans,0);assert.equal(lib.inspect().planning,false);
});

test('a mid-sync account switch cannot replace the previous local snapshot with mixed-account results',async t=>{
  let version='1:a',release;const gate=new Promise(resolve=>release=resolve),source={capabilities:caps,get connectionVersion(){return version;},listLibrary:async()=>{await gate;return {tracks:[song('new',{title:'Other account'})],playlists:[],complete:true};}};
  const {lib}=setup(t,{spotify:source});lib.importData({service:'spotify',tracks:[song('old')]});const pending=lib.sync('spotify');version='2:b';release();await assert.rejects(pending,{code:'connection_changed'});assert.equal(lib.snapshot().tracks[0].sources[0].id,'old');assert.equal(lib.snapshot().providers.spotify.error,'connection_changed');
});

test('ordinary token refresh can retain a reviewed connection version, but a mid-transfer account switch stops subsequent writes',async t=>{
  let version='1:a',writes=0;
  const target={capabilities:caps,maxAddBatch:1,get connectionVersion(){return version;},searchTracks:async({title})=>[song(title,{title})],createPlaylist:async()=>({id:'new'}),addTracks:async({trackIds})=>{writes++;version='2:b';return{addedIds:trackIds};}};
  const {lib}=setup(t,{spotify:target});lib.importData({tracks:[song('first',{title:'First'}),song('second',{title:'Second'})]});const ids=lib.snapshot().tracks.map(t=>t.id),plan=await lib.planTransfer({targetService:'spotify',trackIds:ids});
  const result=await lib.executeTransfer({planId:plan.id});assert.equal(result.status,'partial');assert.equal(result.error,'connection_changed');assert.equal(result.added,1);assert.equal(writes,1);assert.equal(result.items.filter(i=>i.result==='not_attempted').length,1);
  const next=await lib.planTransfer({targetService:'spotify',trackIds:[ids[0]]});target.addTracks=async({trackIds})=>({addedIds:trackIds});assert.equal((await lib.executeTransfer({planId:next.id})).status,'complete');
});

test('rate-limited reads retry within bounds; hanging searches time out and cancellation aborts preview',async t=>{
  let calls=0;const target={capabilities:caps,searchTracks:async()=>{if(++calls===1)throw Object.assign(Error('rate limited'),{status:429,retryAfterMs:1});return[song('one')];}};
  const {lib}=setup(t,{spotify:target},{requestTimeout:10});lib.importData({tracks:[song('local')]});const ids=lib.snapshot().tracks.map(t=>t.id);
  assert.equal((await lib.planTransfer({targetService:'spotify',trackIds:ids})).counts.matched,1);assert.equal(calls,2);
  target.searchTracks=()=>new Promise(()=>{});const plan=await lib.planTransfer({targetService:'spotify',trackIds:ids});assert.equal(plan.counts.unavailable,1);assert.equal(plan.items[0].error,'request_timeout');
  const controller=new AbortController(),pending=lib.planTransfer({targetService:'spotify',trackIds:ids},{signal:controller.signal});controller.abort();await assert.rejects(pending,{code:'cancelled'});
});
