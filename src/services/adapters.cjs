const {ServiceError,text,id,safeURL}=require('./registry.cjs');
const CAPABILITIES=Object.freeze({libraryRead:true,search:true,playlistCreate:true,playlistAdd:true,nativePlayback:false});
const unavailable=Object.freeze({libraryRead:false,search:false,playlistCreate:false,playlistAdd:false,nativePlayback:false});
const key=t=>t?.id;
function scTrack(value){const t=value?.track||value;if(!t?.urn&&!t?.id)return null;return {service:'soundcloud',id:id(t.urn||t.id),title:text(t.title),artist:text(t.publisher_metadata?.artist||t.user?.username),album:text(t.publisher_metadata?.album_title),duration:Math.max(0,Number(t.duration)||0)/1000,url:safeURL(t.permalink_url),artwork:safeURL(t.artwork_url||t.user?.avatar_url),isrc:text(t.isrc||t.publisher_metadata?.isrc,32)};}
function validTitle(value){const title=text(value,200);if(!title)throw new ServiceError('INVALID_PLAYLIST','Введите название плейлиста.');return title;}
function trackIds(values,max=10000){if(!Array.isArray(values)||values.length>max)throw new ServiceError('INVALID_TRACKS','Некорректный список треков.');return values.map(id);}
function uniqueTracks(tracks){return [...new Map(tracks.filter(Boolean).map(t=>[t.id,t])).values()];}
function createAdapter(provider,request,{connectionVersion=()=>null}={}){
  const checkVersion=version=>{if(connectionVersion()!==version)throw new ServiceError('AUTH_CANCELLED','Подключение изменено. Перенос остановлен.');};
  async function paginate(first,{signal,field='items',nextField='next',maxPages=200}={}){
    const items=[],visited=new Set();let next=first,pages=0,total;
    while(next&&pages<maxPages&&items.length<100000){if(visited.has(next))throw new ServiceError('INVALID_PAGINATION','Сервис вернул повторяющуюся страницу.');visited.add(next);const value=await request(next,{signal});if(Number.isFinite(value?.total))total=Math.max(0,Math.floor(value.total));items.push(...(Array.isArray(value)?value:Array.isArray(value?.[field])?value[field]:[]));next=Array.isArray(value)?null:value?.[nextField];pages++;}
    return {items,complete:!next,total};
  }
  if(provider==='soundcloud')return {
    id:provider,capabilities:CAPABILITIES,maxAddBatch:50,
    async getPlaylistTracks({playlistId,signal}={}){const p=await request('playlists/'+encodeURIComponent(id(playlistId))+'?show_tracks=true',{signal});const tracks=(p.tracks||[]).map(scTrack).filter(Boolean);return{ids:tracks.map(t=>t.id),complete:Array.isArray(p.tracks)&&!(Number(p.track_count)>tracks.length)};},
    async relatedTracks({trackId,signal}={}){const d=await request('tracks/'+encodeURIComponent(id(trackId))+'/related?linked_partitioning=true&limit=20',{signal});return uniqueTracks((Array.isArray(d)?d:d.collection||[]).map(scTrack));},
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
  throw new ServiceError('UNSUPPORTED_SERVICE','Доступен только SoundCloud.');
}
module.exports={createAdapter,scTrack};
