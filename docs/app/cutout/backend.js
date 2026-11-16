// Freisteller im Browser: beantwortet die api/…-Anfragen der App-Oberfläche (wie main.go in der App).
// Projekte und Zwischenbilder liegen in der Datenbank des Browsers, gerechnet wird im Worker.
(()=>{document.head.insertAdjacentHTML('beforeend','<style id="web-dl">#dl{display:none!important}.two{grid-template-columns:1fr!important}</style>');const W=window.WEB,T=W.T,db=W.db('freisteller'),wk=W.worker('worker.js');
const projects=new Map();const blobs=new Map();// id -> {view,mask,maskKI,fg,thumb,src}
let AI={ready:false,loading:false,done:0,error:'',step:''};
const rid=()=>Math.random().toString(16).slice(2,14);
const save=p=>db.set('p:'+p.id,{...p});
const putBlob=(id,k,b)=>{const o=blobs.get(id)||{};o[k]=b;blobs.set(id,o);return db.set('b:'+id+':'+k,b)};
const getBlob=async(id,k)=>{const o=blobs.get(id)||{};if(o[k])return o[k];const b=await db.get('b:'+id+':'+k);if(b){o[k]=b;blobs.set(id,o)}return b};
const ready=(async()=>{for(const k of await db.keys()){if(!String(k).startsWith('p:'))continue;const p=await db.get(k);if(!p)continue;if(p.status==='running'||p.status==='waiting'){p.status='error';p.error=T('Wurde unterbrochen. Klicke auf „Neu berechnen“.','Was interrupted. Click “Recalculate”.')}projects.set(p.id,p)}})();
async function aiStatus(){try{AI=await wk.call('status')}catch(e){AI.error=e.message}return AI}
function installAI(){if(AI.loading||AI.ready)return;AI.loading=true;AI.error='';wk.call('install',{},p=>{AI.done=p}).then(()=>{AI.ready=true;AI.loading=false;AI.done=1}).catch(e=>{AI.loading=false;AI.error=e.message})}
// Warteschlange: ein Bild nach dem anderen
const queue=[];let working=false;
function enqueue(p){p.status='waiting';p.error='';p.done=0;queue.push(p.id);save(p);pump()}
async function pump(){if(working)return;working=true;
 while(queue.length){const p=projects.get(queue.shift());if(!p||p.status!=='waiting')continue;p.status='running';p.done=.02;
  try{if(!AI.ready&&!AI.loading)installAI();const view=await getBlob(p.id,'view');
   const r=await wk.call('compute',{id:p.id,view},(d,step)=>{if(step==='ai'){AI.loading=true;AI.done=d/.05}else{AI.ready=true;AI.loading=false;p.done=.05+(d-.05)}});
   AI.ready=true;AI.loading=false;
   await putBlob(p.id,'mask',r.mask);await putBlob(p.id,'maskKI',r.maskKI);await putBlob(p.id,'fg',r.fg);await putBlob(p.id,'thumb',r.thumb);
   p.status='ready';p.error='';p.done=1;p.ver++}
  catch(e){p.status='error';p.error=e.message;if(/KI/.test(e.message)){AI.error=e.message;AI.loading=false}}
  p.updated=Date.now()/1e3|0;save(p)}
 working=false}
const out=p=>({...p,outDir:T('Download-Ordner deines Browsers','your browser’s download folder')});
W.api=async(path,q,init)=>{await ready;const body=async()=>{try{return JSON.parse(init.body||'{}')}catch(e){return{}}};
 switch(path){
 case 'projects':return W.json([...projects.values()].sort((a,b)=>b.created-a.created).map(out));
 case 'ai':if(init.method==='POST')installAI();else await aiStatus();return W.json(AI);
 case 'open':{const {paths}=await body();const res=[];let last=null;
  for(const path of paths||[]){const f=W.file(path);if(!f){last=T('Diese Datei gibt es nicht.','This file does not exist.');continue}
   try{const r=await wk.call('prepare',{file:f});const id=rid(),now=Date.now()/1e3|0;
    const p={id,name:f.name.replace(/\.[^.]+$/,''),source:path,w:r.W,h:r.H,mw:r.MW,mh:r.MH,created:now,updated:now,detail:`${r.W.toLocaleString(W.lang()==='de'?'de-DE':'en-US')} × ${r.H.toLocaleString(W.lang()==='de'?'de-DE':'en-US')} ${T('Pixel','pixels')}`,status:'waiting',done:0,ver:0,bg:''};
    projects.set(id,p);await putBlob(id,'view',r.view);await putBlob(id,'thumb',r.thumb);await putBlob(id,'src',f);enqueue(p);res.push(out(p))}
   catch(e){last=T('Das Bild ließ sich nicht öffnen.','The image could not be opened.')}}
  return res.length?W.json(res):W.fail(last||T('Keine Datei ausgewählt.','No file selected.'))}
 case 'project':{const p=projects.get(q.get('id'));return p?W.json(out(p)):W.fail(T('Projekt nicht gefunden.','Project not found.'),404)}
 case 'img':{const k={view:'view',mask:'mask',fg:'fg',thumb:'thumb'}[q.get('k')];const b=k&&await getBlob(q.get('id'),k);return b?new Response(b,{headers:{'Content-Type':'image/png'}}):new Response('',{status:404})}
 case 'mask':{const p=projects.get(q.get('id'));if(!p)return W.fail(T('Projekt nicht gefunden.','Project not found.'),404);
  const r=await wk.call('mask',{id:p.id,view:await getBlob(p.id,'view'),blob:init.body,w:p.mw,h:p.mh});
  await putBlob(p.id,'mask',r.mask);await putBlob(p.id,'fg',r.fg);await putBlob(p.id,'thumb',r.thumb);p.ver++;p.result='';p.updated=Date.now()/1e3|0;save(p);return W.json({ver:p.ver})}
 case 'region':{const rq=await body();const p=projects.get(rq.id);if(!p)return W.fail(T('Projekt nicht gefunden.','Project not found.'),404);
  let x0=Math.floor(rq.x*p.mw),y0=Math.floor(rq.y*p.mh),x1=Math.floor((rq.x+rq.w)*p.mw),y1=Math.floor((rq.y+rq.h)*p.mh);x0=Math.max(0,x0);y0=Math.max(0,y0);x1=Math.min(p.mw,x1);y1=Math.min(p.mh,y1);
  if(x1-x0<16||y1-y0<16)return W.fail(T('Der Bereich ist zu klein. Ziehe einen größeren Rahmen um das Motiv.','The area is too small. Draw a bigger frame around the subject.'));
  const r=await wk.call('region',{id:p.id,view:await getBlob(p.id,'view'),mask:await getBlob(p.id,'mask'),x0,y0,x1,y1,mode:rq.mode});
  await putBlob(p.id,'mask',r.mask);await putBlob(p.id,'fg',r.fg);await putBlob(p.id,'thumb',r.thumb);p.ver++;p.result='';save(p);return W.json({ver:p.ver})}
 case 'reset':{const p=projects.get(q.get('id'));if(!p)return W.fail(T('Projekt nicht gefunden.','Project not found.'),404);wk.call('forget',{id:p.id});if(p.status!=='running'&&p.status!=='waiting')enqueue(p);return W.json({ok:true})}
 case 'export':{const rq=await body();const p=projects.get(rq.id);if(!p)return W.fail(T('Projekt nicht gefunden.','Project not found.'),404);
  if(p.status!=='ready')return W.fail(T('Das Bild ist noch nicht fertig freigestellt.','The image is not finished yet.'));
  const src=await getBlob(p.id,'src');const r=await wk.call('export',{id:p.id,view:await getBlob(p.id,'view'),mask:await getBlob(p.id,'mask'),file:src,bg:rq.bg,format:rq.format});
  const name=`${p.name} ${T('freigestellt','cut out')}.${r.ext}`;W.download(r.blob,name);p.result=name;p.bg=rq.bg;p.bytes=r.blob.size;save(p);return W.json({path:name,bytes:r.blob.size})}
 case 'delete':{const id=q.get('id');const p=projects.get(id);if(p&&p.status!=='running'){projects.delete(id);blobs.delete(id);wk.call('forget',{id});for(const k of ['view','mask','maskKI','fg','thumb','src'])db.del('b:'+id+':'+k);db.del('p:'+id)}return W.json({ok:true})}
 }return new Response('',{status:404})};
})();
