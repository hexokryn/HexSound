const {test}=require('node:test');
const assert=require('node:assert/strict');
const {yandexTrack}=require('../src/services/yandex.cjs');
const {scoreMatch}=require('../src/library/model.cjs');
test('Yandex separate version metadata cannot auto-match a remix as the original recording',()=>{
  const track=yandexTrack({id:1,title:'Night drive',version:'Club Remix',artists:[{name:'Artist'}],durationMs:180000,albums:[{id:2}]});
  assert.equal(track.title,'Night drive (Club Remix)');
  assert.equal(scoreMatch({title:'Night drive',artist:'Artist',duration:180},track).score,0);
  assert.equal(yandexTrack({id:1,title:'Night drive (Live)',version:'Live',artists:[]}).title,'Night drive (Live)');
});
