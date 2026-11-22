const { palettes, effects } = require('./visual-system.js');
const defaults = Object.freeze({
  theme: 'system', background: 'pearl', glass: true, motion: true,
  roundedArtwork: true, compact: false, zoom: 100,
  showRecommendations: true, showComments: true, showStats: true,
  showFeed: true, showLikes: true, showPlaylists: true, showHistory: true,
  showUpload: true, notifications: false, closeToTray: true,
  launchAtLogin: false, customBackground: '',
  palette: 'studio', effect: 'none', effectIntensity: 55, effectSpeed: 1,
  effectPlaying: true, effectQuality: 'balanced', motionStyle: 'silk',
  animationSpeed: 1, blur: 24, respectReducedMotion: true, lyricsOnline: true, lyricAnimation:'cascade',
  sidebarCollapsed:false, artworkMotion:'still', artworkTilt:false
});
function validate(input) {
  const out = { ...defaults };
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(defaults)) {
    if (typeof value === 'boolean' && typeof input[key] === 'boolean') out[key] = input[key];
  }
  if (['light', 'dark', 'system'].includes(input.theme)) out.theme = input.theme;
  if (['pearl', 'graphite', 'sand', 'image'].includes(input.background)) out.background = input.background;
  if ([85, 90, 100, 110, 125].includes(input.zoom)) out.zoom = input.zoom;
  if (palettes.some(p=>p.id===input.palette)) out.palette=input.palette;
  if (effects.some(e=>e.id===input.effect)) out.effect=input.effect;
  if (['balanced','battery'].includes(input.effectQuality)) out.effectQuality=input.effectQuality;
  if (['silk','spring','precise'].includes(input.motionStyle)) out.motionStyle=input.motionStyle;
  if (['cascade','wave','cinema'].includes(input.lyricAnimation)) out.lyricAnimation=input.lyricAnimation;
  if (['still','float','turn'].includes(input.artworkMotion)) out.artworkMotion=input.artworkMotion;
  for (const [key,min,max] of [['effectIntensity',0,100],['effectSpeed',.25,2],['animationSpeed',.5,1.75],['blur',0,48]]) {
    if (typeof input[key]==='number' && Number.isFinite(input[key])) out[key]=Math.min(max,Math.max(min,input[key]));
  }
  // Custom artwork is supplied only by the main process's native file picker.
  if (typeof input.customBackground === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.customBackground) && input.customBackground.length < 12_000_000) out.customBackground = input.customBackground;
  return out;
}
function isSoundCloud(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && (u.hostname === 'soundcloud.com' || u.hostname.endsWith('.soundcloud.com')); } catch { return false; }
}
function isAuthURL(value) {
  if (isSoundCloud(value)) return true;
  try { const u = new URL(value); return u.protocol === 'https:' && ['accounts.google.com', 'appleid.apple.com', 'www.facebook.com', 'm.facebook.com'].includes(u.hostname); } catch { return false; }
}
function externalURL(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}
module.exports = { defaults, validate, isSoundCloud, isAuthURL, externalURL };
