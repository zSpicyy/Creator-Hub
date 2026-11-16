// Upscaler im Browser: beantwortet die api/…-Anfragen der App-Oberfläche (wie main.go in der App).
(()=>{const W=window.WEB,T=W.T,db=W.db('upscaler'),wk=W.worker('worker.js');
const projects=new Map(),jobs=new Map(),blobs=new Map();let AI={ready:false,loading:false,done:0,error:'',step:''};
const rid=()=>Math.random().toString(16).slice(2,14);const nf=n=>Number(n).toLocaleString(W.lang()==='de'?'de-DE':'en-US');
const save=p=>db.set('p:'+p.id,{...p});
const putBlob=(id,k,b)=>{const o=blobs.get(id)||{};o[k]=b;blobs.set(id,o);return db.set('b:'+id+':'+k,b)};
const getBlob=async(id,k)=>{const o=blobs.get(id)||{};if(o[k])return o[k];const b=await db.get('b:'+id+':'+k);if(b){o[k]=b;blobs.set(id,o)}return b};
const ready=(async()=>{for(const k of await db.keys()){if(!String(k).startsWith('p:'))continue;const p=await db.get(k);if(p)projects.set(p.id,p)}})();
async function aiStatus(){try{AI=await wk.call('status')}catch(e){AI.error=e.message}return AI}
function installAI(){if(AI.loading||AI.ready)return;AI.loading=true;AI.error='';wk.call('install',{},p=>{AI.done=p}).then(()=>{AI.ready=true;AI.loading=false;AI.done=1}).catch(e=>{AI.loading=false;AI.error=e.message})}
const out=p=>({...p,outDir:T('Download-Ordner deines Browsers','your browser’s download folder')});
W.api=async(path,q,init)=>{await ready;const body=async()=>{try{return JSON.parse(init.body||'{}')}catch(e){return{}}};
 switch(path){
 case 'projects':return W.json([...projects.values()].sort((a,b)=>b.updated-a.updated).map(out));
 case 'ai':if(init.method==='POST')installAI();else await aiStatus();return W.json(AI);
 case 'open':{const {path:fp}=await body();const f=W.file(fp);if(!f)return W.fail(T('Diese Datei gibt es nicht.','This file does not exist.'));
  const id=rid();let r;try{r=await wk.call('prepare',{id,file:f})}catch(e){return W.fail(T('Das Bild ließ sich nicht öffnen.','The image could not be opened.'))}
  const now=Date.now()/1e3|0;const p={id,name:f.name.replace(/\.[^.]+$/,''),created:now,updated:now,detail:`${nf(r.W)} × ${nf(r.H)} ${T('Pixel','pixels')}`,source:fp.replace(/^.*\//,''),w:r.W,h:r.H,factor:4,sharp:.6,format:'png',quality:95,result:'',resultW:0,resultH:0,bytes:0,ai:true};
  projects.set(id,p);await putBlob(id,'src',f);await putBlob(id,'preview',r.preview);await putBlob(id,'thumb',r.thumb);save(p);return W.json(out(p))}
 case 'img':{const b=await getBlob(q.get('id'),q.get('k')==='thumb'?'thumb':'preview');return b?new Response(b):new Response('',{status:404})}
 case 'sample':{const p=projects.get(q.get('id'));if(!p)return new Response('',{status:404});
  const g=k=>parseFloat(q.get(k));try{const b=await wk.call('sample',{id:p.id,file:await getBlob(p.id,'src'),x:g('x'),y:g('y'),f:g('f'),bw:g('bw'),bh:g('bh'),raw:q.get('raw')==='1',ai:q.get('ai')==='1'});return new Response(b,{headers:{'Content-Type':'image/png'}})}catch(e){return W.fail(e.message,500)}}
 case 'render':{const rq=await body();const p=projects.get(rq.id);if(!p)return W.fail(T('Projekt nicht gefunden.','Project not found.'));
  const j=jobs.get(p.id);if(j&&j.running)return W.fail(T('Es läuft schon eine Berechnung.','A calculation is already running.'));
  if(!(rq.factor>=1.1&&rq.factor<=64))return W.fail(T('Der Faktor muss zwischen 1,1 und 64 liegen.','The factor must be between 1.1 and 64.'));
  if(!AI.ready){await aiStatus();if(!AI.ready)return W.fail(T('Die KI ist noch nicht eingerichtet.','The AI is not set up yet.'))}
  const format=/\.jpe?g$/i.test(p.source)?'jpg':'png';p.factor=rq.factor;p.format=format;
  const job={running:true,done:0,error:'',finish:false,eta:0};jobs.set(p.id,job);const t0=Date.now();
  wk.call('render',{id:p.id,file:await getBlob(p.id,'src'),factor:rq.factor,format,quality:rq.quality||95},d=>{job.done=d*.98;if(d>.02){const el=(Date.now()-t0)/1e3;job.eta=Math.round(el/d-el)}})
   .then(r=>{const name=`${p.name}_x${String(+rq.factor.toFixed(2))}.${format}`;W.download(r.blob,name);Object.assign(p,{result:name,resultW:r.w,resultH:r.h,bytes:r.blob.size,updated:Date.now()/1e3|0,detail:`${nf(p.w)} × ${nf(p.h)} → ${nf(r.w)} × ${nf(r.h)}`});save(p);Object.assign(job,{running:false,done:1,finish:true})})
   .catch(e=>{job.running=false;job.error=e.message});
  return W.json({ok:true})}
 case 'job':return W.json(jobs.get(q.get('id'))||{running:false,done:0,error:'',finish:false,eta:0});
 case 'delete':{const id=q.get('id');projects.delete(id);jobs.delete(id);blobs.delete(id);wk.call('forget',{id});for(const k of ['src','preview','thumb'])db.del('b:'+id+':'+k);db.del('p:'+id);return W.json({ok:true})}
 }return new Response('',{status:404})};
})();
