// Bereiche frei anordnen (Medien, Eigenschaften, Zeitleiste, Player):
// - Trenner ziehen ändert die Größen, Doppelklick verteilt gleichmäßig.
// - Am Griff oben in der Mitte packen und an den Rand eines anderen Bereichs ziehen (links/rechts/oben/unten)
//   oder auf seine Mitte (tauschen). Schon beim Ziehen rücken die anderen zur Seite und eine umrandete
//   Vorschau zeigt, wo der Bereich landet. Ganz am Fensterrand: über die volle Breite/Höhe.
const Dock=(()=>{const {$,api}=Kit;const D={};
 const PANES={lib:'Medien',props:'Eigenschaften',tl:'Zeitleiste',player:'Player'};
 const MIN={lib:[260,180],props:[220,160],tl:[300,150],player:[260,200],__ph:[120,100]};
 const DEF={d:'row',c:[{d:'col',c:[{d:'row',c:['lib','props'],s:[.7,.3]},'tl'],s:[.56,.44]},'player'],s:[.72,.28]};
 const clone=o=>JSON.parse(JSON.stringify(o));
 let tree=clone(DEF);const ws=()=>$('#ws');const hold=()=>$('#hidden');
 // ---------- Baum-Werkzeuge ----------
 const leaves=n=>typeof n==='string'?[n]:n.c.flatMap(leaves);
 const norm=n=>{if(typeof n==='string')return n;
  n.c=n.c.map(norm);
  // gleiche Richtung zusammenfassen
  const c=[],s=[];n.c.forEach((x,i)=>{const si=n.s[i]??1/n.c.length;if(typeof x!=='string'&&x.d===n.d){const sum=x.s.reduce((a,b)=>a+b,0)||1;x.c.forEach((y,j)=>{c.push(y);s.push(si*x.s[j]/sum)})}else{c.push(x);s.push(si)}});
  n.c=c;const tot=s.reduce((a,b)=>a+b,0)||1;n.s=s.map(v=>v/tot);
  return n.c.length===1?n.c[0]:n};
 const remove=(n,id)=>{if(typeof n==='string')return n===id?null:n;const c=[],s=[];n.c.forEach((x,i)=>{const r=remove(x,id);if(r!=null){c.push(r);s.push(n.s[i])}});if(!c.length)return null;n.c=c;n.s=s;return n};
 const replace=(n,id,w)=>{if(typeof n==='string')return n===id?w:n;n.c=n.c.map(x=>replace(x,id,w));return n};
 // x neben Blatt p einsetzen; zone L/R/T/B
 const insert=(n,p,zone,x)=>{const dir=zone==='L'||zone==='R'?'row':'col',before=zone==='L'||zone==='T';
  if(p==='__root'){const t={d:dir,c:before?[x,n]:[n,x],s:before?[.3,.7]:[.7,.3]};return norm(t)}
  const walk=m=>{if(typeof m==='string')return m===p?{d:dir,c:before?[x,m]:[m,x],s:before?[.42,.58]:[.58,.42]}:m;
   const i=m.c.indexOf(p);if(i>=0&&m.d===dir){const sz=m.s[i];m.c.splice(before?i:i+1,0,x);m.s.splice(i,1,...(before?[sz*.42,sz*.58]:[sz*.58,sz*.42]));return m}
   m.c=m.c.map(walk);return m};
  return norm(walk(n))};
 const valid=t=>{try{const l=leaves(t).sort().join();return l===Object.keys(PANES).sort().join()}catch(e){return false}};
 // ---------- Darstellung ----------
 let after=()=>{};D.onChange=f=>{after=f};
 const ph=(()=>{let e;return()=>{if(!e){e=document.createElement('div');e.className='dk-ph';e.innerHTML='<div><b></b><span>Hier ablegen</span></div>'}return e}})();
 const elOf=id=>id==='__ph'?ph():$('#'+id);
 function build(n,parentDir){
  if(typeof n==='string'){const e=elOf(n);return e}
  const box=document.createElement('div');box.className='dk dk-'+n.d;n.c.forEach((x,i)=>{
   if(i){const g=document.createElement('div');g.className='gut dk-gut '+(n.d==='row'?'v':'h');g.title='Größe ändern';g._split=n;g._i=i;box.append(g)}
   const e=build(x,n.d);e.style.flex=`${n.s[i]} 1 0px`;e._node=x;box.append(e)});
  return box}
 function render(t,{anim=true,hide=null}={}){const W=ws();const before=anim?rects():null;
  for(const id of Object.keys(PANES))hold().append($('#'+id));
  W.innerHTML='';const root=build(t);root.style.flex='1 1 0px';W.append(root);
  for(const id of Object.keys(PANES)){const e=$('#'+id);e.classList.toggle('dk-src',id===hide)}
  if(hide){const e=$('#'+hide);if(!W.contains(e))hold().append(e)}
  if(before)flip(before);
  dispatchEvent(new Event('resize'))}
 const rects=()=>{const r={};for(const id of [...Object.keys(PANES),'__ph']){const e=elOf(id);if(e&&ws().contains(e))r[id]=e.getBoundingClientRect()}return r};
 function flip(before){for(const id in before){const e=elOf(id);if(!ws().contains(e))continue;const a=before[id],b=e.getBoundingClientRect();if(!b.width||!b.height)continue;
  const dx=a.left-b.left,dy=a.top-b.top,sx=a.width/b.width,sy=a.height/b.height;if(Math.abs(dx)<1&&Math.abs(dy)<1&&Math.abs(sx-1)<.01&&Math.abs(sy-1)<.01)continue;
  e.animate([{transformOrigin:'0 0',transform:`translate(${dx}px,${dy}px) scale(${sx},${sy})`},{transformOrigin:'0 0',transform:'none'}],{duration:200,easing:'cubic-bezier(.2,.8,.2,1)'})}}
 // ---------- Speichern ----------
 const store=()=>{const j={v:2,tree};api('api/layout',j).catch(()=>{});try{localStorage.setItem('vs.dock',JSON.stringify(j))}catch(e){}};
 D.load=async()=>{let j=null;try{j=await api('api/layout')}catch(e){}if(!j||!j.tree){try{j=JSON.parse(localStorage.getItem('vs.dock')||'null')}catch(e){}}
  if(j&&j.tree&&valid(j.tree))tree=norm(j.tree);render(tree,{anim:false});after()};
 D.reset=()=>{tree=clone(DEF);render(tree);store();after()};
 // ---------- Trenner ----------
 document.addEventListener('pointerdown',e=>{const g=e.target.closest('.dk-gut');if(!g)return;e.preventDefault();const n=g._split,i=g._i,row=n.d==='row';
  const A=g.previousElementSibling,B=g.nextElementSibling;const ra=A.getBoundingClientRect(),rb=B.getBoundingClientRect();
  const start=row?ra.left:ra.top,total=row?(rb.right-ra.left):(rb.bottom-ra.top);const sum=n.s[i-1]+n.s[i];
  const minOf=(node,k)=>Math.max(...leaves(node).map(l=>(MIN[l]||[120,100])[k]));const mA=minOf(n.c[i-1],row?0:1),mB=minOf(n.c[i],row?0:1);
  g.classList.add('drag');document.body.classList.add('resizing');document.body.classList.toggle('hres',!row);
  const mv=ev=>{let p=(row?ev.clientX:ev.clientY)-start;p=Math.max(mA,Math.min(total-mB-6,p));const f=p/(total-6);n.s[i-1]=sum*f;n.s[i]=sum*(1-f);A.style.flex=`${n.s[i-1]} 1 0px`;B.style.flex=`${n.s[i]} 1 0px`;dispatchEvent(new Event('resize'))};
  const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);g.classList.remove('drag');document.body.classList.remove('resizing','hres');store();after()};
  addEventListener('pointermove',mv);addEventListener('pointerup',up)});
 document.addEventListener('dblclick',e=>{const g=e.target.closest('.dk-gut');if(!g)return;const n=g._split,i=g._i;const sum=n.s[i-1]+n.s[i];n.s[i-1]=n.s[i]=sum/2;render(tree,{anim:true});store();after()});
 // ---------- Bereiche verschieben ----------
 function grips(){for(const id of Object.keys(PANES)){const p=$('#'+id);if(p.querySelector(':scope>.dk-grip'))continue;const g=document.createElement('div');g.className='dk-grip';g.dataset.pane=id;g.title=Kit.t('Bereich verschieben')+' ('+Kit.t(PANES[id])+')';g.innerHTML='<i></i><i></i><i></i><i></i><i></i><i></i>';p.append(g)}}
 let drag=null;
 document.addEventListener('pointerdown',e=>{const g=e.target.closest('.dk-grip');if(!g||e.button!==0)return;e.preventDefault();e.stopPropagation();
  drag={id:g.dataset.pane,x:e.clientX,y:e.clientY,on:false,base:clone(tree),key:'',pend:'',timer:0,cur:null}});
 const zoneOf=(r,x,y)=>{const dx=(x-r.left)/r.width,dy=(y-r.top)/r.height;const m=Math.min(dx,1-dx,dy,1-dy);if(m>.28)return'C';return m===dx?'L':m===1-dx?'R':m===dy?'T':'B'};
 function startDrag(){drag.on=true;document.body.classList.add('dk-dragging');const gh=document.createElement('div');gh.className='dk-ghost';gh.innerHTML=`<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>${Kit.t(PANES[drag.id])}`;document.body.append(gh);drag.gh=gh;$('#'+drag.id).classList.add('dk-src');
  const hint=document.createElement('div');hint.className='dk-hint';hint.textContent=Kit.t('An den Rand eines Bereichs ziehen zum Andocken, auf die Mitte zum Tauschen · Esc bricht ab');document.body.append(hint);drag.hint=hint}
 function preview(key){const [p,zone]=key.split('|');let t;
  if(zone==='C'){t=clone(drag.base);t=replace(t,p,'__swap');t=replace(t,drag.id,p);t=replace(t,'__swap','__ph')}
  else{t=remove(clone(drag.base),drag.id);t=norm(t||'__ph');t=insert(t,p,zone,'__ph')}
  drag.cur=t;const lb=ph().querySelector('b');lb.textContent=Kit.t(PANES[drag.id]);ph().querySelector('span').textContent=Kit.t(zone==='C'?'Tauschen':'Hier andocken');render(t,{hide:drag.id})}
 addEventListener('pointermove',e=>{if(!drag)return;if(!drag.on){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;startDrag()}
  drag.gh.style.transform=`translate(${e.clientX+14}px,${e.clientY+12}px)`;
  const W=ws().getBoundingClientRect();let key='';
  const edge=18;if(e.clientX>=W.left&&e.clientX<=W.right&&e.clientY>=W.top&&e.clientY<=W.bottom){
   if(e.clientX-W.left<edge)key='__root|L';else if(W.right-e.clientX<edge)key='__root|R';else if(e.clientY-W.top<edge)key='__root|T';else if(W.bottom-e.clientY<edge)key='__root|B'}
  if(!key){const el=document.elementFromPoint(e.clientX,e.clientY);if(!el)return;if(el.closest('.dk-ph'))return;const pn=el.closest('.pane');if(!pn||!ws().contains(pn))return;if(pn.id===drag.id)return;key=pn.id+'|'+zoneOf(pn.getBoundingClientRect(),e.clientX,e.clientY)}
  if(key===drag.key||key===drag.pend)return;clearTimeout(drag.timer);drag.pend=key;
  drag.timer=setTimeout(()=>{if(!drag)return;drag.key=key;drag.pend='';preview(key)},drag.key?130:60)});
 function end(commit){if(!drag)return;const d=drag;drag=null;clearTimeout(d.timer);document.body.classList.remove('dk-dragging');if(d.gh)d.gh.remove();if(d.hint)d.hint.remove();
  if(!d.on)return;
  if(commit&&d.cur){tree=norm(replace(d.cur,'__ph',d.id));const r=ph().getBoundingClientRect();render(tree,{anim:false});
   const e=$('#'+d.id),b=e.getBoundingClientRect();if(r.width&&b.width)e.animate([{transformOrigin:'0 0',transform:`translate(${r.left-b.left}px,${r.top-b.top}px) scale(${r.width/b.width},${r.height/b.height})`,opacity:.6},{transformOrigin:'0 0',transform:'none',opacity:1}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
   e.classList.add('dk-land');setTimeout(()=>e.classList.remove('dk-land'),650);store()}
  else render(tree,{anim:true});
  $('#'+d.id).classList.remove('dk-src');after()}
 addEventListener('pointerup',()=>end(true));
 addEventListener('keydown',e=>{if(drag&&e.key==='Escape'){e.preventDefault();e.stopPropagation();end(false)}},true);
 addEventListener('blur',()=>end(false));
 // Bereiche, die ihren Inhalt neu zeichnen (z. B. Eigenschaften), verlieren sonst den Griff
 const mo=new MutationObserver(()=>{for(const id of Object.keys(PANES)){const p=$('#'+id);if(p&&!p.querySelector(':scope>.dk-grip')){grips();break}}});
 D.init=()=>{grips();for(const id of Object.keys(PANES))mo.observe($('#'+id),{childList:true});return D.load()};
 return D})();
