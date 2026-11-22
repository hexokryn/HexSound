const Visual = require('./visual-system.js');
function themeCSS(s, dark) {
  const palette=Visual.resolve(s,dark);
  const { bg, surface, ink, muted, line, accent:blue }=palette;
  const atmosphere=s.effect!=='none'||s.background==='image';
  const ease={silk:'cubic-bezier(.22,1,.36,1)',spring:'cubic-bezier(.34,1.3,.4,1)',precise:'cubic-bezier(.2,.8,.2,1)'}[s.motionStyle]||'ease';
  const duration=Math.round(320/(s.animationSpeed||1));
  return `
    :root { color-scheme: ${dark ? 'dark' : 'light'}; --hex-ink:${ink}; }
    html, body, #app, .l-container, .l-content, .l-main, .l-fluid-fixed { background-color:${bg}!important; color:${ink}!important; }
    body, input, button, textarea, select { font-family:'SF Pro Text',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important; letter-spacing:-.2px; }
    .header { background:${surface}!important; border-bottom:1px solid ${line}!important; }
    .header__inner { background:transparent!important; }
    .header__logo, .header__left, .header__middle { display:none!important; }
    .header__inner { display:flex!important; justify-content:flex-end!important; }
    .header__right { width:auto!important; float:none!important; }
    .header a, .header button, .header__userNavUsername { color:${ink}!important; }
    .header__navMenu a { border:0!important; }
    .headerSearch__input { background:${bg}!important; color:${ink}!important; border:1px solid ${line}!important; border-radius:999px!important; }
    .header__userNavButton.selected, .header__moreButton.selected { background:${line}!important; }
    a, .sc-link-dark, .soundTitle__title, .trackItem__trackTitle, .collectionSection__title, h1,h2,h3,h4 { color:${ink}; }
    .sc-text-light, .soundTitle__username, .sc-link-light, .sound__uploadTime, .sc-type-light { color:${muted}!important; }
    .sc-button { border-radius:8px!important; border-color:${line}!important; background-color:${surface}; color:${ink}; }
    .sc-button-cta, .sc-button-play, .playButton, .sc-button-follow.sc-button-selected { background-color:${blue}!important; border-color:${blue}!important; color:${dark?bg:'#ffffff'}!important; }
    .sc-button-play:before, .playButton:before { filter:brightness(0) ${dark?'':'invert(1)'}; }
    .sc-button-like.sc-button-selected, .sc-button-repost.sc-button-selected { color:${blue}!important; }
    .playableTile__mainHeading { color:${ink}!important; }
    .playableTile__usernameHeading, .playableTile__releaseData { color:${muted}!important; }
    .playControls { background:${surface}!important; border-top:1px solid ${line}!important; }
    .playControls__inner, .playControls__bg { background:${surface}!important; }
    .playControls a, .playControls button { color:${ink}!important; }
    .playbackTimeline__progressBar, .playbackTimeline__progressHandle, .volume__sliderProgress, .volume__sliderHandle { background:${blue}!important; }
    .playbackTimeline__timePassed { color:${blue}!important; }
    .sound, .trackList__item, .collectionSection, .sidebarModule, .l-sidebar-left, .l-sidebar-right, .g-tabs, .sc-border-light-bottom, .sc-border-light { border-color:${line}!important; }
    .g-tabs-link.active { color:${blue}!important; border-color:${blue}!important; }
    .sound__body, .commentForm, .commentForm__wrapper, .listenEngagement, .dropdownMenu, .dialog, .modal__content { background-color:${surface}!important; color:${ink}!important; }
    input, textarea { color:${ink}; }
    .soundTitle__title span, .soundTitle__usernameText { color:inherit; }
    .sc-artwork, .sound__artwork, .playableTile__artwork, .sc-artwork > span { border-radius:${s.roundedArtwork ? '12' : '0'}px!important; overflow:hidden; }
    ${s.compact ? '.sound { padding-top:12px!important; padding-bottom:12px!important; } .collectionSection { margin-bottom:20px!important; }' : '.collectionSection { margin-bottom:36px; }'}
    ${!s.showRecommendations ? '.l-sidebar-right, .listenDetails__relatedSounds { display:none!important; } .l-fluid-fixed .l-main { margin-right:0!important; }' : ''}
    ${!s.showComments ? '.commentsList, .commentForm, .listenComments, .sound__waveform .commentPopover { display:none!important; }' : ''}
    ${!s.showStats ? '.soundStats, .sound__soundStats, .playableTile__stats { display:none!important; }' : ''}
    ${s.glass ? '.playControls, .playControls__inner { background-color:' + (dark ? 'rgba(36,36,38,.92)' : 'rgba(255,255,255,.92)') + '!important; backdrop-filter:blur(20px) saturate(180%); }' : ''}
    ${s.motion ? 'button, .sc-button, a { transition:background-color .16s,color .16s,border-radius .16s; } .sc-button:active { transform:scale(.97); }' : '*,*::before,*::after { animation-duration:0s!important; transition:none!important; scroll-behavior:auto!important; }'}
    ${s.background === 'sand' && !dark ? 'body,#app,.l-container,.l-content,.l-main,.l-fluid-fixed { background-color:#f3f0ea!important; }' : ''}
    ${s.background === 'graphite' && !dark ? 'body,#app,.l-container,.l-content,.l-main,.l-fluid-fixed { background-color:#e8e9ec!important; }' : ''}
    ${s.background === 'image' && s.customBackground ? `body { background-image:url("${s.customBackground}")!important; background-size:cover!important; background-attachment:fixed!important; } #app,.l-container { background:transparent!important; } .l-content { background:${dark ? 'rgba(24,24,26,.94)' : 'rgba(250,250,252,.94)'}!important; }` : ''}
    /* Keep the native controls in the DOM for authentication and playback bridges. */
    .header { display:none!important; }
    .playControls { opacity:0!important; pointer-events:none!important; transform:translateY(160px)!important; }
    body { padding-bottom:24px!important; }
    .announcement, .announcement__dismiss, .upsellBanner, .premiumContentBanner, .sidebarModule__pro, .creatorSubscriptionsUpsell { display:none!important; }
    .soundTitle__title, .collectionSection__title { font-weight:500!important; }
    .g-tabs-link { font-size:15px!important; font-weight:500!important; }
    .sc-button, .playableTile__artwork, .sound__artwork { box-shadow:none!important; }

    body { padding-top:0!important; }
    .l-container.l-content { padding-top:24px!important; }
    @media(max-width:900px){html,body,#app{min-width:0!important}.l-container{min-width:0!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important}.l-container.l-content{padding-left:18px!important;padding-right:18px!important}.l-sidebar-right{display:none!important}.l-fluid-fixed .l-main{margin-right:0!important;width:auto!important}.g-tabs{display:flex!important;overflow-x:auto!important;white-space:nowrap!important}.g-tabs-item{flex-shrink:0!important}}
    @media(max-width:600px){.l-sidebar-left{float:none!important;width:auto!important}.l-fluid-fixed .l-main{margin-left:0!important}.listenDetails{display:block!important}.playControls__wrapper{padding:0 8px!important}.playControls__soundBadge{max-width:35%!important}.playControls__shuffle,.playControls__repeat{display:none!important}}
    ${s.respectReducedMotion?'@media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; } }':''}
    ${Visual.tokens(s,palette,':root')}
    html, body { background-color:${bg}!important; }
    body { isolation:isolate; }
    #app { position:relative; z-index:1; }
    ${atmosphere ? `#app,.l-container,.l-main,.l-fluid-fixed { background:transparent!important; } .l-content { background:${Visual.rgba(bg,s.glass?.16:.3)}!important; backdrop-filter:none!important; } .l-sidebar-right { background:transparent!important; }` : ''}
    .announcements,.mobileApps,.l-product-banners:has(.firstFansPromotionBanner__link) { display:none!important; }
    .header, .playControls, .playControls__inner, .playControls__bg { background:${Visual.rgba(surface,s.glass?.83:1)}!important; backdrop-filter:blur(${s.glass?s.blur:0}px) saturate(150%)!important; }
    .header__inner { background:transparent!important; }
    .playableTile__artwork, .sound__artwork, .sc-artwork { border-radius:${s.roundedArtwork?16:0}px!important; }
    /* Keep every action inside the artwork, including narrow tiles and zoomed layouts. */
    .tileGallery .tileGallery__sliderPanelSlide { min-width:152px!important; }
    @media(max-width:900px){.tileGallery .tileGallery__sliderPeekContainer { overflow-x:auto!important; overscroll-behavior-x:contain; scrollbar-width:thin; }}
    .playableTile .playableTile__actions { position:absolute!important; inset:auto 0 0!important; width:100%!important; height:44px!important; padding:8px!important; box-sizing:border-box!important; display:flex!important; justify-content:center!important; align-items:center!important; }
    .playableTile .playableTile__actions .playableTile__actionWrapper { position:static!important; display:flex!important; align-items:center!important; justify-content:center!important; gap:6px!important; width:100%!important; max-width:120px!important; min-width:0!important; margin:0!important; padding:0!important; float:none!important; transform:none!important; }
    .playableTile .playableTile__actionWrapper>.sc-button { box-sizing:border-box!important; flex:1 1 0!important; width:36px!important; min-width:0!important; max-width:36px!important; height:28px!important; min-height:28px!important; margin:0!important; padding:0!important; display:flex!important; align-items:center!important; justify-content:center!important; border-radius:8px!important; background:${Visual.rgba(surface,.96)}!important; color:${ink}!important; border:1px solid ${line}!important; }
    .playableTile .playableTile__actionWrapper>.sc-button:hover { background:${line}!important; }
    .playableTile .playableTile__actionWrapper>.sc-button.sc-button-selected { color:${blue}!important; }
    .playableTile .playableTile__actionWrapper>.sc-button>div { flex:0 0 16px!important; width:16px!important; height:16px!important; margin:0!important; padding:0!important; }
    .playableTile .playableTile__actionWrapper>.sc-button>div>svg { display:block!important; width:16px!important; height:16px!important; }
    ${s.motion ? `
      body,.l-content,.header,.playControls,.playControls__inner,.dialog,.dropdownMenu,input,textarea { transition:background-color ${duration}ms ${ease},color ${duration}ms ${ease},border-color ${duration}ms ${ease}!important; }
      button,.sc-button,a,.playableTile__artwork,.sound__artwork { transition:background-color ${duration}ms ${ease},color ${duration}ms ${ease},border-color ${duration}ms ${ease},transform ${duration}ms ${ease},border-radius ${duration}ms ${ease},opacity ${duration}ms ${ease}!important; }
      .playableTile__artwork:hover,.sound__artwork:hover { transform:none; }
      .playableTile__playButton,.sound__playButton { transition:opacity ${duration}ms ${ease},transform ${duration}ms ${ease}!important; }
      .sc-button:hover { transform:none; } .sc-button:active { transform:scale(.95); }
      .playControls__soundBadge { transition:opacity ${duration}ms ${ease}; }
      .dropdownMenu { animation:hex-menu ${duration}ms ${ease} both; transform-origin:top right; }
      @keyframes hex-menu { from { opacity:0; transform:translateY(-6px) scale(.98); } to { opacity:1; transform:none; } }
    ` : ''}
    ${s.respectReducedMotion?'@media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; } }':''}
  `;
}
module.exports = { themeCSS };
