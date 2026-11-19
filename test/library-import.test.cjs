'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseImport}=require('../src/library/import-file.cjs');

test('CSV import accepts real Spotify export headers, BOM, quoted commas and explicit milliseconds',()=>{
  const text='\uFEFFTrack URI,Track Name,Artist Name(s),Album Name,Duration (ms),ISRC\r\nspotify:track:abc123,"Night, drive","Artist A, Artist B",Album,180500,USUM71710000\r\n';
  const data=parseImport(text,{service:'spotify'});assert.equal(data.tracks.length,1);assert.equal(data.tracks[0].title,'Night, drive');assert.equal(data.tracks[0].artist,'Artist A, Artist B');assert.equal(data.tracks[0].duration,180.5);assert.equal(data.tracks[0].url,'https://open.spotify.com/track/abc123');assert.equal(data.tracks[0].id,'abc123');
});

test('semicolon CSV accepts Russian headers, mm:ss and playlist grouping',()=>{
  const data=parseImport('Название трека;Исполнитель;Длительность;Плейлист\nНочь;Исполнитель;03:05;Дорога\nУтро;Другой;02:10;Дорога',{service:'yandex'});
  assert.equal(data.service,'yandex');assert.deepEqual(data.tracks.map(t=>t.duration),[185,130]);assert.equal(data.playlists.length,1);assert.equal(data.playlists[0].title,'Дорога');assert.equal(data.playlists[0].trackIds.length,2);
});

test('tab CSV supports quoted newlines and escaped quotes without treating them as records',()=>{
  const data=parseImport('title\tartist\tduration\n"A ""quoted""\nname"\tExample\t1:02:03');assert.equal(data.tracks.length,1);assert.equal(data.tracks[0].title,'A "quoted" name');assert.equal(data.tracks[0].duration,3723);
});

test('CSV rejects missing headers, malformed quoting, inconsistent columns and ambiguous duration',()=>{
  for(const text of ['Night drive,Example artist\nOther,Name','title,artist\n"unclosed,Artist','title,artist\nSong,Artist,Extra'])assert.throws(()=>parseImport(text),error=>error.name==='ImportError'&&!!error.message);
  assert.throws(()=>parseImport('title,duration\nSong,180000'),{code:'ambiguous_duration'});
  assert.throws(()=>parseImport('title,duration,duration_ms\nSong,180,180000'),{code:'ambiguous_duration'});
  assert.throws(()=>parseImport('title,duration\nSong,3:99'),{code:'invalid_duration'});
  assert.throws(()=>parseImport('title,artist\n,Someone'),{code:'missing_title'});
});

test('empty, oversized and excessive-record imports fail before library changes',()=>{
  assert.throws(()=>parseImport(''),{code:'empty_file'});assert.throws(()=>parseImport('x'.repeat(10*1024*1024+1)),{code:'file_too_large'});
  assert.throws(()=>parseImport('title\n'+'Track\n'.repeat(50001)),{code:'too_many_tracks'});
  assert.throws(()=>parseImport('title\n'),{code:'no_tracks'});
  assert.throws(()=>parseImport('title,title\nA,B'),{code:'ambiguous_columns'});
});

test('JSON backups preserve provider provenance and omit credentials and unsafe links',()=>{
  const data=parseImport(JSON.stringify({schema:1,providers:{spotify:{tracks:[{id:'one',title:'Song',artist:'Artist',duration:180,url:'javascript:bad',artwork:'https://user:pass@example.test/a',token:'secret'}],playlists:[{id:'p',title:'List',trackIds:['one']}]}},access_token:'never-return'}));
  assert.equal(data.providers.spotify.tracks[0].service,'spotify');assert.equal(data.providers.spotify.tracks[0].url,'');assert.equal(data.providers.spotify.tracks[0].artwork,'');assert.equal(data.providers.spotify.playlists[0].trackIds[0],'one');assert.ok(!JSON.stringify(data).includes('secret'));assert.ok(!JSON.stringify(data).includes('never-return'));
});

test('flat JSON and JSON arrays normalize durations and selected manual provenance',()=>{
  const flat=parseImport(JSON.stringify({service:'spotify',tracks:[{id:'one',title:'Song',artist:'Artist',duration:'3:05',url:'spotify:track:abc'}]}),{service:'yandex'});
  assert.equal(flat.service,'yandex');assert.equal(flat.tracks[0].duration,185);assert.equal(flat.tracks[0].url,'https://open.spotify.com/track/abc');
  const array=parseImport(JSON.stringify([{title:'Song',artist:'Artist',duration:180}]));assert.equal(array.service,'local');assert.equal(array.tracks.length,1);
});

test('unsupported and invalid JSON documents produce Russian import errors',()=>{
  assert.throws(()=>parseImport('{bad}',{format:'json'}),{code:'invalid_json'});
  assert.throws(()=>parseImport('{}',{format:'json'}),{code:'invalid_json'});
  assert.throws(()=>parseImport('{"tracks":[]}',{format:'json'}),{code:'no_tracks'});
  assert.throws(()=>parseImport('{"tracks":[{"artist":"Someone"}]}',{format:'json'}),{code:'missing_title'});
  assert.throws(()=>parseImport('title\nSong',{format:'xml'}),{code:'unsupported_format'});
});
