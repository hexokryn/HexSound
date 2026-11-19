'use strict';
const crypto=require('node:crypto');
const SERVICES=Object.freeze(['spotify','soundcloud','youtube','yandex','local']);
const clean=(value,max=400)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const digest=value=>crypto.createHash('sha256').update(value).digest('hex').slice(0,24);
const normalize=value=>clean(value,1000).normalize('NFKC').toLocaleLowerCase('en').replace(/[’‘`]/g,"'").replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const NOISE=/\s*[([{]\s*(?:(?:official\s+)?(?:music\s+)?(?:audio|video|lyrics?|visuali[sz]er)|hd|hq|4k)\s*[)\]}]/gi;
const EDITION=/\b(remix|remaster(?:ed)?|live|acoustic|instrumental|cover|karaoke|radio\s+edit|extended|sped[ -]?up|slowed|clean|explicit|demo)\b/gi;
function pageURL(value){try{const u=new URL(clean(value,2048));if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}return '';}
function titleKey(value){return normalize(clean(value).replace(NOISE,''));}
function edition(value){
  const title=clean(value,1000),parts=[];
  for(const match of title.matchAll(/[([{]([^\])}]+)[)\]}]/g))if(new RegExp(EDITION.source,'i').test(match[1]))parts.push(normalize(match[1]).replace(/remastered/g,'remaster'));
  const flags=[...title.matchAll(new RegExp(EDITION.source,'gi'))].map(m=>normalize(m[0]).replace(/remastered/g,'remaster'));
  return [...new Set([...parts,...flags])].sort().join('|');
}
function normalizeTrack(raw,service){
  if(!raw||typeof raw!=='object'||!SERVICES.includes(service))return null;
  const title=clean(raw.title||raw.name),artist=clean(raw.artist||(Array.isArray(raw.artists)?raw.artists.map(a=>typeof a==='string'?a:a?.name).filter(Boolean).join(', '):''));
  if(!title)return null;
  const url=pageURL(raw.url),rawId=typeof raw.id==='number'&&Number.isSafeInteger(raw.id)?String(raw.id):clean(raw.id,500);
  const id=rawId||'import-'+digest(url||[title,artist,raw.duration||0].join('|'));
  const duration=typeof raw.duration==='number'&&Number.isFinite(raw.duration)?Math.max(0,Math.min(86400,raw.duration)):0;
  const isrc=clean(raw.isrc,30).toUpperCase().replace(/-/g,'');
  return {id,service,title,artist,album:clean(raw.album,300),duration,url,artwork:pageURL(raw.artwork),isrc:/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)?isrc:''};
}
const sourceKey=track=>track.service+':'+encodeURIComponent(track.id);
function sameRecording(a,b){
  if(edition(a.title)!==edition(b.title))return false;
  if(a.isrc&&b.isrc&&a.isrc!==b.isrc)return false;
  const gap=a.duration&&b.duration?Math.abs(a.duration-b.duration):null;
  if(a.isrc&&a.isrc===b.isrc)return gap===null||gap<=Math.max(3,Math.min(7,a.duration*.02));
  return !!a.artist&&!!b.artist&&titleKey(a.title)===titleKey(b.title)&&normalize(a.artist)===normalize(b.artist)&&gap!==null&&gap<=2.5;
}
function buildIndex(providers,oldLinks={}){
  const tracks=Object.values(providers).flatMap(p=>p.tracks).sort((a,b)=>sourceKey(a).localeCompare(sourceKey(b),'en'));
  const groups=[],byMetadata=new Map(),byISRC=new Map(),usedIds=new Set(),links={},sourceGroups=new Map();
  for(const track of tracks){
    const metadata=titleKey(track.title)+'|'+normalize(track.artist),candidates=new Set([...(byMetadata.get(metadata)||[]),...(track.isrc?byISRC.get(track.isrc)||[]:[])]);
    let group=[...candidates].find(g=>g.sources.every(s=>sameRecording(s,track)));
    if(!group){
      let id=oldLinks[sourceKey(track)];
      if(!/^track-[a-f0-9]{24}$/.test(id||'')||usedIds.has(id))id='track-'+digest(metadata+'|'+edition(track.title)+'|'+Math.round(track.duration/5)*5+'|'+track.isrc);
      if(usedIds.has(id))id='track-'+digest(id+'|'+sourceKey(track));
      usedIds.add(id);group={id,title:track.title,artist:track.artist,album:track.album,duration:track.duration,artwork:track.artwork,sources:[]};groups.push(group);
    }
    group.sources.push(track);if(!group.artwork&&track.artwork)group.artwork=track.artwork;if(!group.album&&track.album)group.album=track.album;
    links[sourceKey(track)]=group.id;sourceGroups.set(sourceKey(track),group.id);
    if(!byMetadata.has(metadata))byMetadata.set(metadata,[]);if(!byMetadata.get(metadata).includes(group))byMetadata.get(metadata).push(group);
    if(track.isrc){if(!byISRC.has(track.isrc))byISRC.set(track.isrc,[]);if(!byISRC.get(track.isrc).includes(group))byISRC.get(track.isrc).push(group);}
  }
  // An older source may sort after a newly connected provider. Preserve its ID
  // after grouping so connecting a provider cannot rename existing library rows.
  const resolvedIds=new Set();
  for(const group of groups){
    const existing=[...new Set(group.sources.map(s=>oldLinks[sourceKey(s)]).filter(id=>/^track-[a-f0-9]{24}$/.test(id||'')))].sort();
    let id=existing.find(id=>!resolvedIds.has(id))||group.id;
    if(resolvedIds.has(id))id='track-'+digest(id+'|'+sourceKey(group.sources[0]));
    group.id=id;resolvedIds.add(id);
    for(const source of group.sources){links[sourceKey(source)]=id;sourceGroups.set(sourceKey(source),id);}
  }
  const playlists=[];
  for(const [service,provider] of Object.entries(providers))for(const p of provider.playlists){
    const mapped=p.trackIds.map(id=>sourceGroups.get(sourceKey({service,id}))).filter(Boolean),trackIds=[...new Set(mapped)];
    const trackCount=Math.max(p.trackCount??p.trackIds.length,p.trackIds.length),unavailableTrackCount=p.trackIds.length-mapped.length+Math.max(0,trackCount-p.trackIds.length);
    playlists.push({id:'playlist-'+digest(service+'|'+p.id),service,remoteId:p.id,title:p.title,url:p.url,trackIds,trackCount,unavailableTrackCount,duplicateTrackCount:mapped.length-trackIds.length});
  }
  return {tracks:groups,playlists,links};
}
function similarity(a,b){
  if(a===b)return 1;if(!a||!b)return 0;
  const x=new Set(a.split(' ')),y=new Set(b.split(' '));let intersection=0;for(const word of x)if(y.has(word))intersection++;
  return 2*intersection/(x.size+y.size);
}
function scoreMatch(source,target){
  if(edition(source.title)!==edition(target.title))return {score:0,reason:'version_mismatch'};
  if(source.isrc&&target.isrc&&source.isrc!==target.isrc)return {score:0,reason:'isrc_mismatch'};
  const gap=source.duration&&target.duration?Math.abs(source.duration-target.duration):null;
  if(gap!==null&&gap>Math.max(3,Math.min(8,source.duration*.025)))return {score:0,reason:'duration_mismatch'};
  if(source.isrc&&source.isrc===target.isrc)return {score:1,reason:'isrc'};
  const title=similarity(titleKey(source.title),titleKey(target.title)),artistKnown=!!source.artist&&!!target.artist,artist=artistKnown?similarity(normalize(source.artist),normalize(target.artist)):.3;
  if(title<.65||artistKnown&&artist<.65||!artistKnown&&title<.9)return {score:0,reason:'metadata_mismatch'};
  let score=.5*title+.35*artist+.15*(gap===null?.4:1-Math.min(gap/20,.3));
  if(gap===null)score=Math.min(score,.86);
  if(!artistKnown)score=Math.min(score,.82);
  return {score:Math.round(score*1000)/1000,reason:!artistKnown?'artist_unknown':gap===null?'duration_unknown':'metadata'};
}
module.exports={SERVICES,clean,digest,normalize,pageURL,titleKey,edition,normalizeTrack,sourceKey,sameRecording,buildIndex,scoreMatch};
