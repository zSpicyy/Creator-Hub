// Browser-Ersatz für das Programm hinter den Werkzeugen.
// Die Oberflächen der App laufen unverändert; was sie sonst beim Programm abfragen (/kit/… und api/…),
// beantwortet dieser Baustein direkt im Browser. Dateien bleiben auf dem Computer des Besuchers.
(()=>{
const W=window.WEB={files:new Map(),api:null,urls:new Map()};
const ls={get:k=>{try{return localStorage.getItem(k)||''}catch(e){return''}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
const json=(v,st=200)=>new Response(JSON.stringify(v),{status:st,headers:{'Content-Type':'application/json'}});
W.json=json;W.fail=(msg,st=400)=>json({error:msg},st);
W.lang=()=>{let l=ls.get('ch-lang');if(l!=='de'&&l!=='en')l=(navigator.language||'en').toLowerCase().startsWith('de')?'de':'en';return l};
W.T=(de,en)=>W.lang()==='de'?de:en;
// Design wie auf der Webseite (gleiche Speicherstelle)
const ACC={black:'#7c6cff',dark:'#7c6cff',light:'#6657e6',latte:'#8839ef',frappe:'#ca9ee6',macchiato:'#c6a0f6',mocha:'#cba6f7'};
W.theme=()=>{const m=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';const t=ls.get('ch-theme')||ls.get('ch-theme-'+m)||(m==='light'?'light':'black');return{lang:W.lang(),theme:t,accent:ACC[t]||'#7c6cff',density:'normal'}};
// Dateien, die der Besucher auswählt oder ins Fenster zieht, bekommen einen Schein-Pfad
let fid=0;W.addFile=f=>{const p='/Browser/'+(++fid)+'/'+f.name;W.files.set(p,f);return p};
W.file=p=>W.files.get(p);
// Herunterladen statt „Speichern in Ordner“
W.download=(blob,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000)};
function pick(mode,filter){return new Promise(ok=>{if(mode==='folder'){toast(W.T('Im Browser landen Dateien im Download-Ordner deines Browsers.','In the browser, files go to your browser’s download folder.'));return ok([])}
 const i=document.createElement('input');i.type='file';i.multiple=mode!=='file';
 const ext=(String(filter||'').split('|')[1]||'').split(';').map(s=>s.trim().replace(/^\*/,'')).filter(s=>s&&s!=='.*');if(ext.length)i.accept=ext.join(',');
 i.style.display='none';document.body.append(i);let done=false;const fin=v=>{if(done)return;done=true;i.remove();ok(v)};
 i.onchange=()=>fin([...i.files].map(W.addFile));i.addEventListener('cancel',()=>fin([]));
 window.addEventListener('focus',()=>setTimeout(()=>{if(!i.files.length)fin([])},1500),{once:true});i.click()})}
function toast(m){if(window.Kit&&Kit.toast)Kit.toast(m)}
async function kitRoute(u,init){const p=u.pathname.replace(/^.*\/kit\//,'');const q=u.searchParams;
 switch(p){
 case 'theme':return json(W.theme());
 case 'alive':case 'ready':case 'closeack':return new Response(null,{status:204});
 case 'inbox':return json({paths:[]});
 case 'solo':return new Response('',{status:404});
 case 'keys':{const k='ch-keys-'+(q.get('app')||'');if(init&&init.method==='POST'){ls.set(k,typeof init.body==='string'?init.body:'{}')}let v={};try{v=JSON.parse(ls.get(k)||'{}')}catch(e){}return json(v)}
 case 'pick':return json({paths:await pick(q.get('mode'),q.get('filter'))});
 case 'upload':return json({path:W.addFile(new File([init.body],q.get('name')||'datei'))});
 case 'open-folder':toast(W.T('Die Datei liegt im Download-Ordner deines Browsers.','The file is in your browser’s download folder.'));return json({ok:true});
 case 'quit':return json({});
 }return new Response('',{status:404})}
// fetch umleiten
const of=window.fetch.bind(window);
window.fetch=async(input,init)=>{const s=typeof input==='string'?input:input.url;const u=new URL(s,location.href);
 if(u.origin===location.origin){if(u.pathname.includes('/kit/')&&!/\.(css|js|svg|png|woff2?)$/.test(u.pathname))return kitRoute(u,init||{});
  if(/\/api\//.test(u.pathname)&&W.api){try{return await W.api(u.pathname.replace(/^.*\/api\//,''),u.searchParams,init||{})}catch(e){return W.fail(e&&e.message||String(e),500)}}}
 return of(input,init)};
// Synchrone Abfrage in kit.js (Sprache beim Laden)
const OX=window.XMLHttpRequest;
window.XMLHttpRequest=function(){const x=new OX();let fake=null;const o={};
 return new Proxy(x,{get(t,k){if(fake&&k in fake)return fake[k];if(k==='open')return(m,url,...r)=>{if(/\/kit\/theme/.test(url)){fake={status:200,readyState:4,responseText:JSON.stringify(W.theme()),send:()=>{}};return}return t.open(m,url,...r)};const v=t[k];return typeof v==='function'?v.bind(t):v},set(t,k,v){t[k]=v;return true}})};
// Bilder aus api/img… : als Blob vom Ersatz-Programm holen
async function apiSrc(url){const r=await window.fetch(url);if(!r.ok)throw new Error('img');const b=await r.blob();const old=W.urls.get(url);if(old)URL.revokeObjectURL(old);const o=URL.createObjectURL(b);W.urls.set(url,o);if(W.urls.size>400){const [k,v]=W.urls.entries().next().value;URL.revokeObjectURL(v);W.urls.delete(k)}return o}
const desc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
Object.defineProperty(HTMLImageElement.prototype,'src',{get(){return desc.get.call(this)},set(v){if(typeof v==='string'&&/^api\//.test(v)){const el=this;el.dataset.api=v;apiSrc(v).then(o=>{if(el.dataset.api===v)desc.set.call(el,o)}).catch(()=>{el.dispatchEvent(new Event('error'))});return}desc.set.call(this,v)}});
const bgFix=el=>{const m=/url\(['"]?(api\/[^'")]+)['"]?\)/.exec(el.getAttribute('style')||'');if(!m)return;const v=m[1];el.style.backgroundImage='none';apiSrc(v).then(o=>{el.style.backgroundImage=`url("${o}")`}).catch(()=>{})};
const fix=root=>{if(!root.querySelectorAll)return;for(const im of root.querySelectorAll('img[data-api-src]')){const v=im.getAttribute('data-api-src');im.removeAttribute('data-api-src');im.src=v}for(const el of root.querySelectorAll('[style*="api/"]'))bgFix(el)};
new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1){if(n.matches&&n.matches('img[data-api-src]')){const v=n.getAttribute('data-api-src');n.removeAttribute('data-api-src');n.src=v}if(n.matches&&n.matches('[style*="api/"]'))bgFix(n);fix(n)}}).observe(document.documentElement,{childList:true,subtree:true});
// Ziehen & Ablegen: kit.js überträgt Dateien über /kit/upload (oben abgefangen) – nichts weiter nötig.
// Kleine Unterschiede zur App: kein „Ordner wählen“, „Im Ordner zeigen“ öffnet nichts.
document.documentElement.classList.add('web');
const st=document.createElement('style');st.textContent='.kit-back{display:none!important}#pickdir,#showres{display:none!important}.web-app{color:inherit!important;text-decoration:none!important;display:inline-flex;align-items:center;gap:7px}.web-app svg{width:16px;height:16px}@media(max-width:700px){.web-app .wt{display:none}.start .hero,.start .hero *{max-width:100%;min-width:0}.hero{flex-wrap:wrap}main{padding:12px!important}}';document.head.append(st);
// Im Kopf des Werkzeugs: Hinweis auf die App (ohne Einschränkungen), öffnet die Download-Seite im selben Tab
document.addEventListener('DOMContentLoaded',()=>{const top=document.querySelector('header.top');if(!top)return;const a=document.createElement('a');a.className='btn web-app';a.href='../../download.html';a.target='_top';
 a.innerHTML='<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg><span class="wt">'+W.T('Ohne Einschränkungen: App holen','No limits: get the app')+'</span>';a.title=W.T('In der App gibt es keine Größengrenze, sie ist schneller und arbeitet offline.','The app has no size limit, is faster and works offline.');
 const pk=top.querySelector('#pick');top.insertBefore(a,pk||null);
 const sm=document.querySelector('nav small');if(sm)sm.insertAdjacentHTML('afterend','<small style="margin-top:8px;display:block">'+W.T('Läuft in deinem Browser. Deine Dateien verlassen deinen Computer nicht.','Runs in your browser. Your files never leave your computer.')+'</small>')});

// ---------- Rechen-Helfer im Hintergrund (Web Worker) ----------
W.worker=src=>{const w=new Worker(src);let n=0;const wait=new Map();
 w.onmessage=e=>{const d=e.data;const h=wait.get(d.id);if(!h)return;if(d.progress!==undefined){h.p&&h.p(d.progress,d.step);return}wait.delete(d.id);d.ok?h.ok(d.result):h.no(new Error(d.error))};
 w.onerror=e=>{for(const [,h] of wait)h.no(new Error(e.message||'Worker'));wait.clear()};
 return{call:(op,args,onp,transfer)=>new Promise((ok,no)=>{const id=++n;wait.set(id,{ok,no,p:onp});w.postMessage({id,op,args},transfer||[])}),
  kill:msg=>{w.terminate();for(const [,h] of wait)h.no(new Error(msg||'Abgebrochen'));wait.clear()}}};
// ZIP ohne Kompression (Videos, Bilder und Musik sind ohnehin schon komprimiert)
W.zip=async files=>{const crcT=W._crc||(W._crc=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})());
 const enc=new TextEncoder(),parts=[],cen=[];let off=0;const d=new Date(),dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xffff,dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xffff;
 for(const f of files){const data=new Uint8Array(await f.blob.arrayBuffer());let c=0xFFFFFFFF;for(let i=0;i<data.length;i++)c=crcT[(c^data[i])&255]^(c>>>8);c=(c^0xFFFFFFFF)>>>0;const name=enc.encode(f.name);
  const h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(10,dt,true);h.setUint16(12,dd,true);h.setUint32(14,c,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);
  parts.push(h.buffer,name,data);const ch=new DataView(new ArrayBuffer(46));ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x800,true);ch.setUint16(12,dt,true);ch.setUint16(14,dd,true);ch.setUint32(16,c,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);ch.setUint16(28,name.length,true);ch.setUint32(42,off,true);
  cen.push(ch.buffer,name);off+=30+name.length+data.length}
 const cs=cen.reduce((a,b)=>a+(b.byteLength),0),e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cs,true);e.setUint32(16,off,true);
 return new Blob([...parts,...cen,e.buffer],{type:'application/zip'})};

// ---------- Kleine Datenbank im Browser (Projekte bleiben nach dem Neuladen erhalten) ----------
W.db=name=>{let dbp=null;const open=()=>dbp||(dbp=new Promise((ok,no)=>{const r=indexedDB.open('creatorhub-'+name,1);r.onupgradeneeded=()=>{r.result.createObjectStore('kv')};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}));
 const tx=async(mode,f)=>{const d=await open();return new Promise((ok,no)=>{const t=d.transaction('kv',mode),s=t.objectStore('kv');let res;const r=f(s);if(r)r.onsuccess=()=>res=r.result;t.oncomplete=()=>ok(res);t.onerror=()=>no(t.error)})};
 return{get:k=>tx('readonly',s=>s.get(k)).catch(()=>undefined),set:(k,v)=>tx('readwrite',s=>s.put(v,k)).catch(()=>{}),del:k=>tx('readwrite',s=>s.delete(k)).catch(()=>{}),
  keys:()=>tx('readonly',s=>s.getAllKeys()).catch(()=>[])}};
})();
