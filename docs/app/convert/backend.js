// Dateityp-Umwandler im Browser: beantwortet die api/…-Anfragen der App-Oberfläche (wie main.go in der App).
(()=>{const W=window.WEB,T=W.T,db=W.db('umwandler');
const FORMATS=[
 ['mp3','MP3','audio','mp3','Spielt jedes Gerät ab'],['wav','WAV','audio','wav','Volle Qualität, große Datei'],['flac','FLAC','audio','flac','Volle Qualität, kleiner als WAV'],['m4a','M4A','audio','m4a','Gut für iPhone und Apple'],
 ['ogg','OGG','audio','ogg',''],['opus','Opus','audio','opus','Sehr kleine Datei, guter Klang'],['aiff','AIFF','audio','aiff',''],['wma','WMA','audio','wma',''],
 ['mp4','MP4','video','mp4','Spielt jedes Gerät ab'],['mkv','MKV','video','mkv','Behält mehrere Tonspuren'],['webm','WebM','video','webm','Für Webseiten'],['mov','MOV','video','mov',''],['avi','AVI','video','avi',''],['gif','GIF','video','gif','Bewegtes Bild ohne Ton'],
 ['png','PNG','image','png','Volle Qualität, durchsichtiger Hintergrund bleibt'],['jpg','JPG','image','jpg',''],['webp','WebP','image','webp',''],['bmp','BMP','image','bmp',''],['tiff','TIFF','image','tiff',''],['ico','ICO','image','ico','Programm-Symbol, höchstens 256 × 256'],['avif','AVIF','image','avif','Sehr kleine Datei, neue Geräte']
].map(([id,label,cat,ext,note])=>({id,label,cat,ext,note}));
const set=s=>new Set(s.split(' '));const AUD=set('mp3 wav flac m4a aac ogg oga opus wma aiff aif ape alac amr ac3 dts mka mp2 wv'),VID=set('mp4 mkv webm mov avi wmv flv mpg mpeg m4v 3gp ts mts m2ts vob ogv divx asf f4v rm rmvb'),IMG=set('png jpg jpeg webp bmp tif tiff gif ico avif heic heif jxl tga ppm pgm pbm pcx exr hdr psd');
const kindOf=p=>{const e=(p.split('.').pop()||'').toLowerCase();return AUD.has(e)?'audio':VID.has(e)?'video':IMG.has(e)?'image':'unknown'};
const possible=(k,f)=>k==='audio'?f.cat==='audio':k==='image'?(f.cat==='image'||f.id==='gif'):true;
const base=p=>String(p).split('/').pop();
let pool=[],eng={ready:false,loading:false,done:0,error:''};const batches=new Map(),outs=new Map(),thumbs=new Map();
const mk=()=>W.worker('worker.js');
function workers(n){while(pool.length<n)pool.push(mk());return pool.slice(0,n)}
function install(){if(eng.ready||eng.loading)return;eng.loading=true;eng.error='';workers(1)[0].call('install',{},p=>eng.done=p).then(()=>{eng.ready=true;eng.loading=false;eng.done=1}).catch(e=>{eng.loading=false;eng.error=e.message})}
const save=b=>db.set('b:'+b.id,JSON.parse(JSON.stringify(b,(k,v)=>k==='_c'?undefined:v)));
const ready=(async()=>{for(const k of await db.keys()){if(!String(k).startsWith('b:'))continue;const b=await db.get(k);if(!b)continue;b.running=false;for(const it of b.items)if(it.status==='running'||it.status==='waiting'){it.status='error';it.msg=T('Unterbrochen','Interrupted')}batches.set(b.id,b)}})();
install(); // gleich im Hintergrund laden
async function run(b,f){const video=b.items.some(i=>i.kind==='video');const ws=workers(video?1:Math.max(1,Math.min(2,(navigator.hardwareConcurrency||2)>>1)));
 const queue=b.items.filter(i=>i.status==='waiting');const taken=new Set();
 await Promise.all(ws.map(async w=>{while(queue.length&&!b._c){const it=queue.shift();it.status='running';it.pct=0;
  const nm=base(it.src).replace(/\.[^.]+$/,'');let out=nm+'.'+f.ext;for(let i=2;taken.has(out);i++)out=`${nm} (${i}).${f.ext}`;taken.add(out);
  try{const r=await w.call('convert',{file:W.file(it.src),target:f.id,ext:f.ext,quality:b.quality},p=>it.pct=p);it.status='done';it.pct=1;it.out=out;it.outBytes=r.blob.size;outs.set(b.id+':'+b.items.indexOf(it),r.blob);db.set('o:'+b.id+':'+b.items.indexOf(it),r.blob)}
  catch(e){if(b._c){it.status='skipped';it.msg=T('Abgebrochen','Cancelled')}else{it.status='error';it.msg=e.message}}}}));
 for(const it of b.items)if(it.status==='waiting'){it.status='skipped';it.msg=T('Abgebrochen','Cancelled')}
 b.running=false;b.updated=Date.now()/1e3|0;const done=b.items.filter(i=>i.status==='done').length;b.detail=`${done} ${T('von','of')} ${b.items.length} → ${f.label}`;save(b);
 // Vorschaubild für den Verlauf
 const first=b.items.find(i=>i.status==='done'&&i.kind!=='audio');if(first){try{const t=await workers(1)[0].call('thumb',{file:W.file(first.src),video:first.kind==='video',dur:first.dur||0});if(t){thumbs.set(b.id,t);db.set('t:'+b.id,t)}}catch(e){}}}
const getOut=async(id,i)=>outs.get(id+':'+i)||await db.get('o:'+id+':'+i);
W.api=async(path,q,init)=>{await ready;const body=async()=>{try{return JSON.parse(init.body||'{}')}catch(e){return{}}};
 switch(path){
 case 'state':return W.json({engine:eng,formats:FORMATS,batches:[...batches.values()].sort((a,b)=>b.updated-a.updated).map(b=>({...b,_c:undefined,outDir:''}))});
 case 'engine/install':install();return W.json({ok:true});
 case 'probe':{const {files}=await body();const res=[];for(const p of files||[]){const f=W.file(p),info={path:p,kind:kindOf(p),size:f?f.size:0,w:0,h:0,dur:0,codec:'',err:''};
   if(!f){info.err=T('Datei nicht gefunden','File not found');res.push(info);continue}
   try{if(!eng.ready){install();await new Promise(r=>{const iv=setInterval(()=>{if(eng.ready||!eng.loading){clearInterval(iv);r()}},300)})}
    const r=await workers(1)[0].call('probe',{file:f});info.dur=r.dur;info.w=r.w;info.h=r.h;info.codec=r.codec;
    if(info.kind==='unknown'){info.kind=r.hasV&&r.dur>.5?'video':r.hasV?'image':r.hasA?'audio':'unknown';if(info.kind==='unknown')info.err=T('Kein Bild, Ton oder Video','Not an image, audio or video')}}catch(e){}
   res.push(info)}return W.json(res)}
 case 'convert':{const rq=await body();if(!eng.ready)return W.fail(T('Die Umwandlung ist noch nicht eingerichtet.','Conversion is not set up yet.'));
  const f=FORMATS.find(x=>x.id===rq.target);if(!f)return W.fail(T('Unbekanntes Zielformat.','Unknown target format.'));
  const quality=rq.quality==='high'||rq.quality==='small'?rq.quality:'medium';const now=Date.now()/1e3|0;
  const b={id:Math.random().toString(16).slice(2,14),created:now,updated:now,target:f.id,quality,outDir:'',items:[],running:true,detail:''};
  for(const p of rq.files||[]){const fl=W.file(p);const it={src:p,out:'',kind:kindOf(p),status:'waiting',msg:'',pct:0,inBytes:fl?fl.size:0,outBytes:0};
   if(!fl){it.status='skipped';it.msg=T('Datei nicht gefunden','File not found')}else if(!possible(it.kind,f)){it.status='skipped';it.msg=T('Lässt sich nicht in ','Cannot be converted to ')+f.label+T(' umwandeln','')}b.items.push(it)}
  if(!b.items.length)return W.fail(T('Keine Dateien ausgewählt.','No files selected.'));
  b.name=base(b.items[0].src)+(b.items.length>1?T(` und ${b.items.length-1} weitere`,` and ${b.items.length-1} more`):'')+' → '+f.label;b.detail=`${b.items.length} ${T('Datei(en)','file(s)')} → ${f.label}`;
  batches.set(b.id,b);save(b);run(b,f);return W.json({id:b.id})}
 case 'cancel':{const b=batches.get(q.get('id'));if(b&&b.running){b._c=true;for(const w of pool)w.kill(T('Abgebrochen','Cancelled'));pool=[];eng.ready=false;install()}return W.json({ok:true})}
 case 'delete':{const id=q.get('id');const b=batches.get(id);if(b&&b.running)return W.fail(T('Erst abbrechen.','Cancel first.'));if(b){b.items.forEach((_,i)=>{outs.delete(id+':'+i);db.del('o:'+id+':'+i)})}batches.delete(id);thumbs.delete(id);db.del('b:'+id);db.del('t:'+id);return W.json({ok:true})}
 case 'download':{const b=batches.get(q.get('id'));if(!b)return W.fail(T('Keine fertigen Dateien zum Herunterladen.','No finished files to download.'));
  const list=[];for(let i=0;i<b.items.length;i++){const it=b.items[i];if(it.status==='done'&&(!q.get('i')||q.get('i')===String(i))){const bl=await getOut(b.id,i);if(bl)list.push({name:it.out,blob:bl})}}
  if(!list.length)return W.fail(T('Keine fertigen Dateien zum Herunterladen.','No finished files to download.'));
  if(q.get('zip')==='1'&&list.length>1){const z=await W.zip(list);const nm=b.name.replace(/[\\/:*?"<>|]/g,'_').slice(0,80)+'.zip';W.download(z,nm);return W.json({path:nm})}
  for(const x of list)W.download(x.blob,x.name);return W.json({path:list[0].name})}
 case 'img':{const id=q.get('id');const t=thumbs.get(id)||await db.get('t:'+id);return t?new Response(t):new Response('',{status:404})}
 }return new Response('',{status:404})};
})();
