const crypto=require('node:crypto');
const {createStore}=require('./store.cjs'),{track}=require('./tracks.cjs');
function createQueue(file,{onChange=()=>{},random=Math.random}={}){
  const store=createStore(file,{schema:1,entries:[],cursor:-1,repeat:'off',shuffle:false}),saved=store.read();
  let state={schema:1,entries:[],cursor:-1,repeat:['off','all','one'].includes(saved.repeat)?saved.repeat:'off',shuffle:!!saved.shuffle};
  for(const e of (Array.isArray(saved.entries)?saved.entries:[]).slice(0,5000))try{state.entries.push({id:typeof e.id==='string'?e.id:crypto.randomUUID(),track:track(e.track),origin:typeof e.origin==='string'?e.origin.slice(0,50):'library'});}catch{}
  state.cursor=Number.isSafeInteger(saved.cursor)&&saved.cursor>=0&&saved.cursor<state.entries.length?saved.cursor:-1;
  const snapshot=()=>({...structuredClone(state),current:state.entries[state.cursor]||null});
  const save=()=>{store.write(state);onChange(snapshot());return snapshot();};
  function add(tracks,{next=false,origin='library'}={}){if(!Array.isArray(tracks)||!tracks.length||tracks.length+state.entries.length>5000)throw Error('Очередь должна содержать не больше 5000 треков.');const entries=tracks.map(t=>({id:crypto.randomUUID(),track:track(t),origin:String(origin).slice(0,50)}));const at=next?state.cursor+1:state.entries.length;state.entries.splice(at,0,...entries);save();return entries;}
  function jump(id){const index=state.entries.findIndex(e=>e.id===id);if(index<0)throw Error('Трека нет в очереди.');state.cursor=index;save();return state.entries[index];}
  function advance({previous=false,ended=false}={}){
    if(!state.entries.length)return null;if(ended&&state.repeat==='one'&&state.cursor>=0)return state.entries[state.cursor];
    let index=state.cursor+(previous?-1:1);
    if(state.shuffle&&!previous&&state.entries.length>1){const choices=state.entries.map((_,i)=>i).filter(i=>i!==state.cursor);index=choices[Math.floor(random()*choices.length)];}
    if(index>=state.entries.length){if(state.repeat==='all')index=0;else return null;}if(index<0)index=state.repeat==='all'?state.entries.length-1:0;
    state.cursor=index;save();return state.entries[index];
  }
  function move(id,beforeId){const active=state.entries[state.cursor]?.id,from=state.entries.findIndex(e=>e.id===id);if(from<0||id===beforeId)return snapshot();const [entry]=state.entries.splice(from,1);const to=beforeId?state.entries.findIndex(e=>e.id===beforeId):state.entries.length;if(to<0){state.entries.splice(from,0,entry);throw Error('Некорректная позиция.');}state.entries.splice(to,0,entry);state.cursor=active?state.entries.findIndex(e=>e.id===active):-1;return save();}
  return {trim(){if(state.cursor>20){state.entries.splice(0,state.cursor-20);state.cursor=20;save();}},truncate(){state.entries.splice(state.cursor+1);return save();},snapshot,current:()=>state.entries[state.cursor]?structuredClone(state.entries[state.cursor]):null,mode:()=>({repeat:state.repeat,shuffle:state.shuffle}),add,jump,advance,move,remove(id){const at=state.entries.findIndex(e=>e.id===id);if(at<0)return snapshot();state.entries.splice(at,1);if(at<state.cursor)state.cursor--;else if(at===state.cursor)state.cursor=-1;return save();},clear(){state.entries=[];state.cursor=-1;return save();},setMode({repeat,shuffle}={}){if(repeat!==undefined){if(!['off','all','one'].includes(repeat))throw Error('Некорректный повтор.');state.repeat=repeat;}if(shuffle!==undefined)state.shuffle=!!shuffle;return save();}};
}
module.exports={createQueue};
