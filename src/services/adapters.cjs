const {ServiceError,text,id,safeURL}=require('./registry.cjs');
const CAPABILITIES=Object.freeze({libraryRead:true,search:true,playlistCreate:true,playlistAdd:true,nativePlayback:false});
const unavailable=Object.freeze({libraryRead:false,search:false,playlistCreate:false,playlistAdd:false,nativePlayback:false});
const key=t=>t?.id;
function spotifyTrack(value){const t=value?.item||value?.track||value;if(!t?.id||t.is_local||t.type&&t.type!=='track')return null;return {service:'spotify',id:id(t.id),title:text(t.name),artist:text(t.artists?.map(a=>a.name).join(', ')),album:text(t.album?.name),duration:Math.max(0,Number(t.duration_ms)||0)/1000,url:safeURL(t.external_urls?.spotify)||`https://open.spotify.com/track/${id(t.id)}`,artwork:safeURL(t.album?.images?.[0]?.url),isrc:text(t.external_ids?.isrc,32)};}
function scTrack(value){const t=value?.track||value;if(!t?.urn&&!t?.id)return null;return {service:'soundcloud',id:id(t.urn||t.id),title:text(t.title),artist:text(t.publisher_metadata?.artist||t.user?.username),album:text(t.publisher_metadata?.album_title),duration:Math.max(0,Number(t.duration)||0)/1000,url:safeURL(t.permalink_url),artwork:safeURL(t.artwork_url||t.user?.avatar_url),isrc:text(t.isrc||t.publisher_metadata?.isrc,32)};}
function youtubeTrack(value){const t=value?.snippet||{},videoId=value?.id?.videoId||t.resourceId?.videoId||value?.contentDetails?.videoId||(typeof value?.id==='string'&&value?.kind==='youtube#video'?value.id:'');if(!videoId||t.title==='Deleted video'||t.title==='Private video')return null;return {service:'youtube',id:id(videoId),title:text(t.title),artist:text(t.videoOwnerChannelTitle||t.channelTitle),album:'',duration:parseDuration(value?.contentDetails?.duration),url:`https://music.youtube.com/watch?v=${id(videoId)}`,artwork:safeURL(t.thumbnails?.high?.url||t.thumbnails?.medium?.url||t.thumbnails?.default?.url),isrc:''};}
function parseDuration(value){const m=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value||'');return m?Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0):0;}
function validTitle(value){const title=text(value,200);if(!title)throw new ServiceError('INVALID_PLAYLIST','Введите название плейлиста.');return title;}
function trackIds(values,max=10000){if(!Array.isArray(values)||values.length>max)throw new ServiceError('INVALID_TRACKS','Некорректный список треков.');return values.map(id);}
function uniqueTracks(tracks){return [...new Map(tracks.filter(Boolean).map(t=>[t.id,t])).values()];}
function createAdapter(provider,request,{connectionVersion=()=>null}={}){
  const checkVersion=version=>{if(connectionVersion()!==version)throw new ServiceError('AUTH_CANCELLED','Подключение изменено. Перенос остановлен.');};
  if(provider==='yandex')return require('./yandex.cjs').createYandexAdapter(request,{connectionVersion});
  async function paginate(first,{signal,field='items',nextField='next',maxPages=200}={}){
    const items=[],visited=new Set();let next=first,pages=0,total;
    while(next&&pages<maxPages&&items.length<100000){if(visited.has(next))throw new ServiceError('INVALID_PAGINATION','Сервис вернул повторяющуюся страницу.');visited.add(next);const value=await request(next,{signal});if(Number.isFinite(value?.total))total=Math.max(0,Math.floor(value.total));items.push(...(Array.isArray(value)?value:Array.isArray(value?.[field])?value[field]:[]));next=Array.isArray(value)?null:value?.[nextField];pages++;}
    return {items,complete:!next,total};
  }
  if(provider==='spotify')return {
    id:provider,capabilities:CAPABILITIES,maxAddBatch:100,
    async profile({signal}={}){const p=await request('me',{signal});return {id:text(p.id,180),name:text(p.display_name||p.id,160),url:safeURL(p.external_urls?.spotify)};},
    async listLibrary({signal}={}){
      const saved=await paginate('me/tracks?limit=50',{signal}),lists=await paginate('me/playlists?limit=50',{signal});let complete=saved.complete&&lists.complete;const tracks=saved.items.map(spotifyTrack).filter(Boolean),playlists=[];
      for(const p of lists.items){const playlist={id:id(p.id),name:text(p.name),title:text(p.name),url:safeURL(p.external_urls?.spotify),trackIds:[],trackCount:Number(p.items?.total??p.tracks?.total)||0};try{const data=await paginate(`playlists/${encodeURIComponent(id(p.id))}/items?limit=50`,{signal});const items=data.items.map(spotifyTrack).filter(Boolean);tracks.push(...items);playlist.trackIds=items.map(key);playlist.trackCount=Math.max(playlist.trackCount,data.total??data.items.length);complete&&=data.complete;}catch(error){if(error.status!==403&&error.status!==404)throw error;playlist.incomplete=true;complete=false;}playlists.push(playlist);}
      return {tracks:uniqueTracks(tracks),playlists,complete};
    },
    async searchTracks({query,title,artist,signal}={}){const q=text(query||[title,artist].filter(Boolean).join(' '),300);if(!q)return [];const data=await request('search?'+new URLSearchParams({q,type:'track',limit:'10'}),{signal});return (data.tracks?.items||[]).map(spotifyTrack).filter(Boolean);},
    async createPlaylist({title,name,description,public:isPublic=false,signal}={}){const p=await request('me/playlists',{method:'POST',json:{name:validTitle(title||name),description:text(description,300),public:!!isPublic},signal});return {id:id(p.id),name:text(p.name),title:text(p.name),url:safeURL(p.external_urls?.spotify)};},
    async addTracks({playlistId,trackIds:values,signal}={}){const version=connectionVersion(),ids=trackIds(values),addedIds=[];for(let i=0;i<ids.length;i+=100){const batch=ids.slice(i,i+100);try{checkVersion(version);await request(`playlists/${encodeURIComponent(id(playlistId))}/items`,{method:'POST',json:{uris:batch.map(n=>'spotify:track:'+n)},signal});addedIds.push(...batch);}catch(error){error.addedIds=addedIds;throw error;}}return {added:addedIds.length,addedIds};}
  };
  if(provider==='soundcloud')return {
    id:provider,capabilities:CAPABILITIES,maxAddBatch:50,
    async profile({signal}={}){const p=await request('me',{signal});return {id:text(p.urn||String(p.id||''),180),name:text(p.username,160),url:safeURL(p.permalink_url)};},
    async listLibrary({signal}={}){
      const liked=await paginate('me/likes/tracks?linked_partitioning=true&limit=200',{signal,field:'collection',nextField:'next_href'}),lists=await paginate('me/playlists?show_tracks=true&linked_partitioning=true&limit=200',{signal,field:'collection',nextField:'next_href'});let complete=liked.complete&&lists.complete;const tracks=liked.items.map(scTrack).filter(Boolean),playlists=[];
      for(let p of lists.items){const playlistId=id(p.urn||p.id);if(!Array.isArray(p.tracks)||p.tracks.some(t=>!t.title)){p=await request(`playlists/${encodeURIComponent(playlistId)}?show_tracks=true`,{signal});}const items=(p.tracks||[]).map(scTrack).filter(Boolean);if(Number(p.track_count)>items.length)complete=false;tracks.push(...items);playlists.push({id:playlistId,name:text(p.title),title:text(p.title),url:safeURL(p.permalink_url),trackIds:items.map(key),trackCount:Math.max(Number(p.track_count)||0,(p.tracks||[]).length)});}
      return {tracks:uniqueTracks(tracks),playlists,complete};
    },
    async searchTracks({query,title,artist,signal}={}){const q=text(query||[title,artist].filter(Boolean).join(' '),300);if(!q)return [];const data=await request('tracks?'+new URLSearchParams({q,limit:'20',linked_partitioning:'true'}),{signal});return (Array.isArray(data)?data:data.collection||[]).map(scTrack).filter(Boolean);},
    async createPlaylist({title,name,description,public:isPublic=false,signal}={}){const p=await request('playlists',{method:'POST',json:{playlist:{title:validTitle(title||name),description:text(description,1000),sharing:isPublic?'public':'private',tracks:[]}},signal});return {id:id(p.urn||p.id),name:text(p.title),title:text(p.title),url:safeURL(p.permalink_url)};},
    async addTracks({playlistId,trackIds:values,signal}={}){
      const version=connectionVersion(),ids=trackIds(values),path=`playlists/${encodeURIComponent(id(playlistId))}`,p=await request(path+'?show_tracks=true',{signal});
      if(!Array.isArray(p.tracks)||Number(p.track_count)>p.tracks.length)throw new ServiceError('INCOMPLETE_PLAYLIST','SoundCloud вернул неполный плейлист. Обновление остановлено, чтобы сохранить треки.');
      const urns=p.tracks.map(t=>id(t.urn||(/^[0-9]+$/.test(String(t.id))?'soundcloud:tracks:'+t.id:t.id))).concat(ids.map(n=>/^\d+$/.test(n)?'soundcloud:tracks:'+n:n));
      checkVersion(version);await request(path,{method:'PUT',json:{playlist:{tracks:urns.map(urn=>({urn}))}},signal});return {added:ids.length,addedIds:ids};
    }
  };
  if(provider==='youtube'){
    async function youtubePages(path,params,signal){const items=[];let token='',pages=0;do{const q=new URLSearchParams({...params,maxResults:'50',...(token?{pageToken:token}:{})});const data=await request(path+'?'+q,{signal});items.push(...data.items||[]);token=data.nextPageToken||'';pages++;}while(token&&pages<200&&items.length<100000);return {items,complete:!token};}
    return {
      id:provider,capabilities:CAPABILITIES,maxAddBatch:1,
      async profile({signal}={}){const d=await request('channels?part=snippet&mine=true',{signal});const p=d.items?.[0];return {id:text(p?.id||'youtube',180),name:text(p?.snippet?.title||'YouTube',160),url:p?.id?'https://www.youtube.com/channel/'+id(p.id):'https://music.youtube.com/'};},
      async listLibrary({signal}={}){const lists=await youtubePages('playlists',{part:'snippet,contentDetails',mine:'true'},signal),tracks=[],playlists=[];let complete=lists.complete;for(const p of lists.items){const data=await youtubePages('playlistItems',{part:'snippet,contentDetails',playlistId:id(p.id)},signal);const raw=data.items.map(youtubeTrack).filter(Boolean),details=new Map();for(let i=0;i<raw.length;i+=50){const ids=raw.slice(i,i+50).map(key);if(ids.length){const v=await request('videos?'+new URLSearchParams({part:'contentDetails',id:ids.join(',')}),{signal});for(const x of v.items||[])details.set(x.id,parseDuration(x.contentDetails?.duration));}}for(const t of raw)t.duration=details.get(t.id)||0;tracks.push(...raw);complete&&=data.complete;playlists.push({id:id(p.id),name:text(p.snippet?.title),title:text(p.snippet?.title),url:'https://music.youtube.com/playlist?list='+id(p.id),trackIds:raw.map(key),trackCount:Math.max(Number(p.contentDetails?.itemCount)||0,data.items.length)});}return {tracks:uniqueTracks(tracks),playlists,complete};},
      async searchTracks({query,title,artist,signal}={}){const q=text(query||[title,artist].filter(Boolean).join(' '),300);if(!q)return [];const d=await request('search?'+new URLSearchParams({part:'snippet',type:'video',videoCategoryId:'10',maxResults:'10',q}),{signal,publicSearch:true});const tracks=(d.items||[]).map(youtubeTrack).filter(Boolean);if(tracks.length){const details=await request('videos?'+new URLSearchParams({part:'contentDetails',id:tracks.map(key).join(',')}),{signal,publicSearch:true});const map=new Map((details.items||[]).map(v=>[v.id,parseDuration(v.contentDetails?.duration)]));for(const t of tracks)t.duration=map.get(t.id)||0;}return tracks;},
      async createPlaylist({title,name,description,public:isPublic=false,signal}={}){const p=await request('playlists?part=snippet,status',{method:'POST',json:{snippet:{title:validTitle(title||name),description:text(description,1000)},status:{privacyStatus:isPublic?'public':'private'}},signal});return {id:id(p.id),name:text(p.snippet?.title),title:text(p.snippet?.title),url:'https://music.youtube.com/playlist?list='+id(p.id)};},
      async addTracks({playlistId,trackIds:values,signal}={}){const version=connectionVersion(),ids=trackIds(values),addedIds=[];for(const videoId of ids){try{checkVersion(version);await request('playlistItems?part=snippet',{method:'POST',json:{snippet:{playlistId:id(playlistId),resourceId:{kind:'youtube#video',videoId}}},signal});addedIds.push(videoId);}catch(error){error.addedIds=addedIds;throw error;}}return {added:addedIds.length,addedIds};}
    };
  }
  throw new ServiceError('INVALID_SERVICE','Неизвестный музыкальный сервис.');
}
function unsupported(){throw new ServiceError('UNSUPPORTED_API','У Яндекс Музыки нет подключённого публичного API библиотеки. Используйте вход на сайте и импорт файла.');}
module.exports={createAdapter,spotifyTrack,scTrack,youtubeTrack,parseDuration,CAPABILITIES,unavailable};
