(function(){
 const bindings=new WeakMap();
 window.HexVolume={bind(input,send){let desired=null,busy=false,dragging=false;const pump=async()=>{if(busy)return;busy=true;try{while(desired!==null){const value=desired;desired=null;await send(value);}}catch(e){desired=null;toast(e.message);}finally{busy=false;}};input.addEventListener('pointerdown',()=>dragging=true);window.addEventListener('pointerup',()=>dragging=false);input.addEventListener('blur',()=>dragging=false);input.oninput=()=>{desired=Number(input.value);pump();};input.onchange=input.oninput;bindings.set(input,{held:()=>busy||desired!==null||dragging||document.activeElement===input});},sync(input,value){if(!bindings.get(input)?.held())input.value=String(value);}};
})();
