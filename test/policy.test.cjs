const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaults, validate, isSoundCloud, isAuthURL, externalURL } = require('../src/settings.cjs');
const { themeCSS } = require('../src/soundcloud-theme.cjs');
test('remote navigation accepts only HTTPS SoundCloud, not lookalike hosts or local protocols', () => {
  for (const url of ['https://soundcloud.com/discover','https://secure.soundcloud.com/authorize']) assert.equal(isSoundCloud(url), true);
  for (const url of ['https://soundcloud.com.evil.test','https://evilsoundcloud.com','file:///C:/Windows','javascript:alert(1)','http://soundcloud.com','garbage']) assert.equal(isSoundCloud(url), false);
});
test('authentication windows use an explicit provider allowlist', () => {
  assert.equal(isAuthURL('https://accounts.google.com/o/oauth2/auth'), true);
  assert.equal(isAuthURL('https://appleid.apple.com/auth/authorize'), true);
  assert.equal(isAuthURL('https://accounts.google.com.evil.test'), false);
});
test('external links cannot execute local protocols or hide credentials', () => {
  for (const url of ['javascript:alert(1)','file:///etc/passwd','ms-settings:test','https://user:secret@example.org']) assert.equal(externalURL(url), false);
  assert.equal(externalURL('https://example.org'), true);
});
test('persisted settings are validated before use in injected styles', () => {
  assert.deepEqual(validate(null), defaults);
  const s = validate({theme:'dark',zoom:999,glass:'true',customBackground:'url("x");}body{display:none}',background:'evil'});
  assert.equal(s.theme,'dark'); assert.equal(s.zoom,100); assert.equal(s.customBackground,''); assert.equal(s.background,'pearl'); assert.equal(s.glass,true);
  assert.equal(validate({customBackground:'data:image/png;base64,YQ=='}).customBackground,'data:image/png;base64,YQ==');
});
test('themes hide service chrome but preserve the official playback controls', () => {
  const css = themeCSS({...defaults,showComments:false,showRecommendations:false},true);
  assert.match(css, /color-scheme: dark/);
  assert.match(css, /\.commentsList.*display:none/);
  assert.match(css, /\.header\s*\{[^}]*display:none/);
  assert.doesNotMatch(css, /\.playControls\s*\{[^}]*display:none/);
});
