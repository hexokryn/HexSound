'use strict';
const {SERVICES,clean,digest,normalize,pageURL,normalizeTrack}=require('./model.cjs');
const MAX_BYTES=10*1024*1024,MAX_TRACKS=50000;
class ImportError extends Error{constructor(code,message,row){super(message);this.name='ImportError';this.code=code;if(row)this.row=row;}}
const invalid=(code,message,row)=>{throw new ImportError(code,message,row);};
function duration(value,{milliseconds=false,row}={}){
  if(value===undefined||value===null||value==='')return 0;
  if(typeof value==='number'){if(!Number.isFinite(value)||value<0)invalid('invalid_duration',`Некорректная длительность${row?' в строке '+row:''}.`,row);value=String(value);}
  if(typeof value!=='string')invalid('invalid_duration','Длительность должна быть числом секунд или временем mm:ss.',row);
  const text=value.trim();if(!text)return 0;let seconds;
  if(text.includes(':')){
    if(milliseconds||!/^\d{1,3}:[0-5]\d(?:\.[0-9]{1,3})?$|^\d{1,2}:[0-5]\d:[0-5]\d(?:\.[0-9]{1,3})?$/.test(text))invalid('invalid_duration',`Укажите длительность в формате mm:ss${row?' (строка '+row+')':''}.`,row);
    seconds=text.split(':').reduce((n,part)=>n*60+Number(part),0);
  }else{
    if(!/^\d+(?:\.[0-9]{1,3}|,[0-9]{1,2})?$/.test(text))invalid('ambiguous_duration',`Не удалось определить единицы длительности${row?' в строке '+row:''}. Используйте секунды, mm:ss или колонку duration_ms.`,row);
    seconds=Number(text.replace(',','.'))/(milliseconds?1000:1);
  }
  if(!Number.isFinite(seconds)||seconds>86400)invalid('ambiguous_duration',`Слишком большая длительность${row?' в строке '+row:''}. Для миллисекунд используйте колонку duration_ms.`,row);
  return seconds;
}
function trackURL(value){
  const raw=clean(value,2048),spotify=/^spotify:track:([A-Za-z0-9]{1,100})$/.exec(raw);
  return spotify?'https://open.spotify.com/track/'+spotify[1]:pageURL(raw);
}
function csvRecords(text,delimiter){
  const records=[];let row=[],cell='',quoted=false,closed=false;
  const endCell=()=>{if(cell.length>4096)invalid('cell_too_large','Слишком длинное поле CSV.');row.push(cell);cell='';closed=false;if(row.length>100)invalid('too_many_columns','В CSV больше 100 колонок.');};
  const endRow=()=>{endCell();if(row.some(v=>v.trim()))records.push(row);row=[];if(records.length>MAX_TRACKS+1)invalid('too_many_tracks','Можно импортировать не больше 50 000 треков за один раз.');};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
    else if(c===delimiter)endCell();
    else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();}
    else if(c==='"'){if(cell.trim()||closed)invalid('invalid_csv','Некорректные кавычки в CSV.');cell='';quoted=true;}
    else if(closed){if(!/\s/.test(c))invalid('invalid_csv','После закрывающей кавычки CSV должен быть разделитель.');}
    else cell+=c;
    if(cell.length>4096)invalid('cell_too_large','Слишком длинное поле CSV.');
  }
  if(quoted)invalid('invalid_csv','В CSV не закрыта кавычка.');if(cell||row.length||closed)endRow();return records;
}
function separator(text){
  let quoted=false;const counts={',':0,';':0,'\t':0};
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"')i++;else quoted=!quoted;}else if(!quoted){if(c==='\r'||c==='\n')break;if(Object.hasOwn(counts,c))counts[c]++;}}
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}
const aliases={
  title:['title','name','track','track name','song','song name','название','название трека','трек'],
  artist:['artist','artists','artist name','artist names','artist name s','исполнитель','исполнители','автор'],
  album:['album','album name','альбом'],duration:['duration','duration seconds','duration s','duration sec','length','длительность','длительность сек'],
  durationMs:['duration ms','duration milliseconds','track duration ms','durationms','длительность мс'],
  url:['url','track url','track uri','uri','link','ссылка','ссылка на трек'],isrc:['isrc'],id:['id','track id'],playlist:['playlist','playlist name','плейлист','название плейлиста']
};
function parseCSV(text,service){
  const rows=csvRecords(text,separator(text));if(rows.length<2)invalid('no_tracks','Файл не содержит треков. Нужны заголовки колонок и хотя бы одна строка.');
  const headers=rows.shift().map(normalize),columns={};
  for(const [key,names] of Object.entries(aliases)){
    const indices=headers.map((h,i)=>names.includes(h)?i:-1).filter(i=>i>=0);
    if(indices.length>1)invalid('ambiguous_columns',`В CSV несколько колонок для поля «${key}». Оставьте одну.`);if(indices.length)columns[key]=indices[0];
  }
  if(columns.title===undefined)invalid('missing_title_header','Не найдена колонка названия трека. Используйте title или Track Name.');
  if(columns.duration!==undefined&&columns.durationMs!==undefined)invalid('ambiguous_duration','Оставьте одну колонку длительности: duration или duration_ms.');
  const tracks=[],playlists=new Map();
  for(let i=0;i<rows.length;i++){
    const row=rows[i],line=i+2,get=key=>columns[key]===undefined?'':row[columns[key]]||'';
    if(row.length!==headers.length)invalid('invalid_csv',`В строке ${line} другое количество колонок. Проверьте разделители и кавычки.`,line);
    const title=clean(get('title'));if(!title)invalid('missing_title',`В строке ${line} нет названия трека.`,line);
    const url=trackURL(get('url')),uriID=/^spotify:track:([A-Za-z0-9]+)$/.exec(get('url'))?.[1];
    const track=normalizeTrack({id:get('id')||uriID||undefined,title,artist:get('artist'),album:get('album'),duration:duration(columns.durationMs!==undefined?get('durationMs'):get('duration'),{milliseconds:columns.durationMs!==undefined,row:line}),url,isrc:get('isrc')},service);
    tracks.push(track);const name=clean(get('playlist'),200);if(name){if(!playlists.has(name))playlists.set(name,{id:'import-'+digest(name),title:name,trackIds:[]});playlists.get(name).trackIds.push(track.id);}
  }
  if(!tracks.length)invalid('no_tracks','В файле нет треков для импорта.');return {service,tracks,playlists:[...playlists.values()]};
}
function jsonProvider(raw,service,count){
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.tracks))invalid('invalid_json','Нужен JSON с массивом tracks или резервная копия HexSound.');
  count.value+=raw.tracks.length;if(count.value>MAX_TRACKS)invalid('too_many_tracks','Можно импортировать не больше 50 000 треков за один раз.');
  const tracks=raw.tracks.map((value,i)=>{
    if(!value||typeof value!=='object'||!clean(value.title||value.name))invalid('missing_title',`У трека ${i+1} нет названия.`);
    return normalizeTrack({...value,duration:duration(value.duration),url:trackURL(value.url)},service);
  });
  const playlists=[];
  if(raw.playlists!==undefined&&!Array.isArray(raw.playlists))invalid('invalid_json','Поле playlists должно быть массивом.');
  if((raw.playlists?.length||0)>10000)invalid('too_many_playlists','В файле слишком много плейлистов.');
  let refs=0;
  for(const p of raw.playlists||[]){
    if(!p||typeof p!=='object')invalid('invalid_json','Некорректная запись плейлиста.');
    const title=clean(p.title||p.name,200),id=clean(String(p.id??''),500)||'import-'+digest(title);if(!title)invalid('invalid_json','У плейлиста нет названия.');
    const ids=Array.isArray(p.trackIds)?p.trackIds.map(x=>clean(String(x),500)).filter(Boolean):[];
    if(Array.isArray(p.tracks)){
      count.value+=p.tracks.length;if(count.value>MAX_TRACKS)invalid('too_many_tracks','Можно импортировать не больше 50 000 треков за один раз.');
      for(const item of p.tracks){if(!item||!clean(item.title||item.name))invalid('missing_title','В плейлисте есть трек без названия.');const t=normalizeTrack({...item,duration:duration(item.duration),url:trackURL(item.url)},service);tracks.push(t);ids.push(t.id);}
    }
    refs+=ids.length;if(refs>MAX_TRACKS*4)invalid('too_many_tracks','В плейлистах слишком много записей.');playlists.push({id,title,url:pageURL(p.url),trackIds:ids,trackCount:ids.length});
  }
  return {tracks,playlists,partial:raw.partial===true||raw.complete===false};
}
function parseImport(text,{format,service='local'}={}){
  if(typeof text!=='string'||!text.trim())invalid('empty_file','Файл пуст.');
  if(Buffer.byteLength(text,'utf8')>MAX_BYTES)invalid('file_too_large','Файл больше 10 МБ. Разделите библиотеку на несколько файлов.');
  if(!SERVICES.includes(service))invalid('invalid_service','Неизвестный сервис для импорта.');
  if(format!==undefined&&typeof format!=='string')invalid('unsupported_format','Поддерживаются файлы JSON и CSV.');
  text=text.replace(/^\uFEFF/,'');const type=(format||(/^[\s]*[\[{]/.test(text)?'json':'csv')).toLowerCase();
  if(type==='csv')return parseCSV(text,service);if(type!=='json')invalid('unsupported_format','Поддерживаются файлы JSON и CSV.');
  let data;try{data=JSON.parse(text);}catch{invalid('invalid_json','Некорректный JSON. Проверьте скобки и кавычки.');}
  if(Array.isArray(data))data={tracks:data};const count={value:0};
  if(data?.schema===1&&data.providers&&typeof data.providers==='object'){
    const providers={};for(const id of SERVICES)if(Object.hasOwn(data.providers,id))providers[id]=jsonProvider(data.providers[id],id,count);
    if(!count.value)invalid('no_tracks','В резервной копии нет треков.');return {schema:1,providers,...(data.decisions?{decisions:data.decisions}:{})};
  }
  const selected=service==='local'&&SERVICES.includes(data?.service)?data.service:service,provider=jsonProvider(data,selected,count);
  if(!provider.tracks.length)invalid('no_tracks','В файле нет треков для импорта.');return {service:selected,...provider};
}
module.exports={parseImport,ImportError};
