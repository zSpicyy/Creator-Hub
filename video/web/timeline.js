// Zeitleiste: Spuren, Clips verschieben und kürzen, Übergänge, Einrasten, Teilen, Kopieren.
const Timeline=(()=>{
 const T={pps:40};const VH=56,AH=46,RUL=26;let lanes,rows,heads,ruler;
 const H=tr=>tr.kind==='audio'?AH:VH;
 T.init=()=>{lanes=$('#lanes');rows=$('#rows');heads=$('#heads');ruler=$('#ruler');lanes.onscroll=()=>{heads.scrollTop=lanes.scrollTop};T.render()};
 const x2t=x=>Math.max(0,x/T.pps);
 T.zoomFromSlider=v=>{T.pps=4*Math.pow(2,v/10)};
 const sliderFromZoom=()=>Math.round(10*Math.log2(T.pps/4));
 T.zoomBy=f=>{const c=App.t;T.pps=clamp(T.pps*f,4,4096);$('#zoom').value=sliderFromZoom();T.render();lanes.scrollLeft=c*T.pps-lanes.clientWidth/2};
 T.fit=()=>{const tot=Math.max(10,App.total());T.pps=clamp((lanes.clientWidth-40)/tot,4,4096);$('#zoom').value=sliderFromZoom();T.render();lanes.scrollLeft=0};
 $('#zoom').addEventListener('input',e=>{const c=App.t;T.zoomFromSlider(+e.target.value);T.render();lanes.scrollLeft=c*T.pps-lanes.clientWidth/2});
 lanes&&0;

 const isSel=id=>App.sel&&(App.sel.clip===id||(App.sel.clips||[]).includes(id));
 function prevOf(tr,c){let best=null;for(const o of tr.clips){if(o===c)continue;const e=o.start+App.len(o);if(o.start<c.start&&e>c.start-0.06&&(!best||o.start>best.start))best=o}return best}
 T.overlap=(tr,c)=>{const p=prevOf(tr,c);return p?Math.max(0,p.start+App.len(p)-c.start):0};

 T.render=()=>{if(!App.P)return;const P=App.P;const tot=App.total();const W=Math.max(lanes.clientWidth,(tot+30)*T.pps);
  heads.innerHTML=P.tracks.map((tr,i)=>`<div class="trh ${tr.kind}" data-tr="${tr.id}"><span class="nm" title="${esc(tr.name)}">${esc(tr.name)}</span><div class="ic">
   ${tr.kind==='video'?`<button class="ib ${tr.hidden?'off':''}" data-th="hide" title="${tr.hidden?'Spur einblenden':'Spur ausblenden'}">${tr.hidden?'<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6.1A9 9 0 0 1 21 12a14 14 0 0 1-2.4 3.2M6.6 6.6A14 14 0 0 0 3 12s3.5 6 9 6a8.5 8.5 0 0 0 4-1"/></svg>':'<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'}</button>`:''}
   <button class="ib ${tr.mute?'off':''}" data-th="mute" title="${tr.mute?'Ton an':'Ton aus'}">${tr.mute?'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/></svg>':'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>'}</button>
   <button class="ib ${tr.locked?'off':''}" data-th="lock" title="${tr.locked?'Spur entsperren':'Spur sperren'}">${tr.locked?'<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>':'<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>'}</button>
   ${tr.clips.length?'':`<button class="ib" data-th="remove" title="Leere Spur entfernen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`}</div></div>`).join('');
  rows.style.width=W+'px';ruler.style.width=W+'px';
  // Lineal mit passenden Abständen
  const steps=[.1,.2,.5,1,2,5,10,15,30,60,120,300,600,1800,3600];const major=steps.find(s=>s*T.pps>=90)||3600;const minor=steps.filter(s=>s<major).reverse().find(s=>s*T.pps>=14);
  let rh='';for(let s=0;s<=W/T.pps;s+=major){rh+=`<span style="left:${s*T.pps}px">${App.fmt(s,false)}${major<1?'.'+Math.round((s%1)*10):''}</span>`;if(minor)for(let m=minor;m<major-1e-6;m+=minor)rh+=`<span class="minor" style="left:${(s+m)*T.pps}px"></span>`}
  ruler.innerHTML=rh;
  rows.innerHTML=P.tracks.map(tr=>`<div class="row ${tr.kind} ${tr.locked?'locked':''}" data-tr="${tr.id}">${tr.clips.map(c=>clipHTML(tr,c)).join('')}</div>`).join('');
  rows.querySelectorAll('canvas.wave').forEach(drawWave);$('#tlempty').classList.toggle('show',!P.tracks.some(t=>t.clips.length));T.playhead()};

 function clipHTML(tr,c){const L=App.len(c),m=c.type==='media'?App.media(c.mediaId):null;const w=Math.max(4,L*T.pps);
  const kind=c.type==='media'?(m?m.kind:'video'):c.type;let inner='';
  if(m&&(m.kind==='video'||m.kind==='image')&&m.thumbs>0){const th=tr.kind==='audio'?AH:VH;const tw=th*1.6;const n=Math.min(200,Math.ceil(w/tw));let s='';
   for(let i=0;i<n;i++){const srcT=c.in+(i*tw/T.pps)*(c.speed||1);const k=m.kind==='image'?0:clamp(Math.floor(srcT/(m.step||1))+1,1,m.thumbs);s+=`<img src="api/file?id=${App.P.id}&m=${m.id}&k=thumb&n=${k}" style="width:${tw}px" alt="" loading="lazy">`}inner+=`<div class="strip">${s}</div>`}
  if(m&&m.wave&&(m.kind==='audio'))inner+=`<canvas class="wave" data-m="${m.id}" data-in="${c.in}" data-sp="${c.speed||1}" width="${Math.min(8000,Math.round(w))}" height="40" style="width:${w}px"></canvas>`;
  const label=c.type==='text'?(c.text?.content||'Text').split('\n')[0]:c.type==='color'?Kit.t('Farbfläche'):(m?m.name:'?');
  let tags=[];if((c.speed||1)!==1)tags.push((c.speed).toFixed(2).replace(/\.?0+$/,'')+'×');if(c.effect)tags.push('fx');if(c.mute)tags.push(Kit.t('stumm'));
  let tr_='';if(c.transIn){const ov=T.overlap(tr,c);if(ov>0.01)tr_=`<div class="tr ${App.sel&&App.sel.trans===c.id?'sel':''}" data-trans="${c.id}" style="width:${ov*T.pps}px" title="${esc(transName(c.transIn))}"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="8" height="12" rx="1"/><rect x="13" y="6" width="8" height="12" rx="1"/></svg></div>`}
  return`<div class="clip ${kind} ${isSel(c.id)?'sel':''} ${(m&&m.missing)?'dim':''}" data-clip="${c.id}" style="left:${c.start*T.pps}px;width:${w}px${c.type==='color'?';background:'+esc(c.color):''}">${inner}${tr_}<span class="lbl">${esc(label)}</span>${tags.length?`<span class="tag">${tags.join(' ')}</span>`:''}<div class="hl"></div><div class="hr"></div></div>`}
 const transName=tr=>{if(!tr)return'';if(tr.type.startsWith('custom'))return tr.custom?.name||Kit.t('Eigener Übergang');const d=App.S.transitions.find(x=>x.id===tr.type);return d?Kit.t(d.name):tr.type};
 T.transName=transName;
 const waves=new Map();
 async function drawWave(cv){const id=cv.dataset.m;let w=waves.get(id);if(!w){try{const r=await fetch(`api/file?id=${App.P.id}&m=${id}&k=wave`);w=new Uint8Array(await r.arrayBuffer());waves.set(id,w)}catch(e){return}}
  const x=cv.getContext('2d'),W=cv.width,Hh=cv.height,inn=+cv.dataset.in,sp=+cv.dataset.sp,scale=parseFloat(cv.style.width)/W;x.clearRect(0,0,W,Hh);x.fillStyle='#ffffffb0';
  for(let i=0;i<W;i++){const t=inn+(i*scale/T.pps)*sp;const k=Math.floor(t*50);const v=(w[k]||0)/255;const h=Math.max(1,v*Hh);x.fillRect(i,Hh-h,1,h)}}

 T.playhead=()=>{const ph=$('#ph');if(!ph||!App.P)return;ph.style.left=App.t*T.pps+'px';ph.style.height=(rows.offsetHeight+RUL)+'px'};
 T.follow=()=>{const x=App.t*T.pps;if(x>lanes.scrollLeft+lanes.clientWidth-60||x<lanes.scrollLeft)lanes.scrollLeft=x-60};

 // Lineal und Abspielkopf: klicken oder ziehen springt an die Stelle
 function scrubAt(e){const r=rows.getBoundingClientRect();Player.seek(x2t(e.clientX-r.left))}
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('#ruler')&&!(e.target.closest('#ph')))return;e.preventDefault();scrubAt(e);const mv=ev=>scrubAt(ev),up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up)};addEventListener('pointermove',mv);addEventListener('pointerup',up)});

 // Clips anfassen: verschieben, an den Rändern kürzen
 document.addEventListener('pointerdown',e=>{const ce=e.target.closest('.clip');const lan=e.target.closest('#rows');if(!lan||e.button!==0)return;
  if(e.target.closest('[data-trans]')){App.sel={trans:e.target.closest('[data-trans]').dataset.trans};T.render();Panels.props();return}
  if(!ce){App.sel=null;T.render();Panels.props();const r=rows.getBoundingClientRect();Player.seek(x2t(e.clientX-r.left));return}
  const id=ce.dataset.clip;const f=App.find(id);if(!f)return;if(f.t.locked){App.sel={clip:id};T.render();Panels.props();return}
  if(e.ctrlKey||e.shiftKey){const s=new Set(App.sel?.clips||(App.sel?.clip?[App.sel.clip]:[]));s.has(id)?s.delete(id):s.add(id);App.sel=s.size===1?{clip:[...s][0]}:{clips:[...s]};T.render();Panels.props();return}
  const mode=e.target.classList.contains('hl')?'l':e.target.classList.contains('hr')?'r':'m';
  if(!isSel(id)||App.sel.clips){App.sel={clip:id};T.render();Panels.props()}
  const c=f.c,tr0=f.t,orig=JSON.stringify(App.P.tracks),x0=e.clientX,y0=e.clientY;const o={start:c.start,in:c.in,out:c.out,dur:c.dur};const L0=App.len(c);const m=App.media(c.mediaId);
  let moved=false,line=null;
  const snaps=()=>{const s=[0,App.t];for(const tr of App.P.tracks)for(const k of tr.clips){if(k===c)continue;s.push(k.start,k.start+App.len(k))}return s};const S=snaps();
  const snap=(t)=>{if(!App.snap)return[t,null];let best=null;for(const s of S){const d=Math.abs(s-t)*T.pps;if(d<9&&(!best||d<best.d))best={s,d}}return best?[best.s,best.s]:[t,null]};
  const showLine=s=>{if(s==null){line&&line.remove();line=null;return}if(!line){line=document.createElement('div');line.className='snapline';rows.append(line)}line.style.left=s*T.pps+'px'};
  const mv=ev=>{const dx=(ev.clientX-x0)/T.pps;if(!moved&&Math.abs(ev.clientX-x0)<3&&Math.abs(ev.clientY-y0)<3)return;moved=true;
   if(mode==='m'){let ns=Math.max(0,o.start+dx);let[a,la]=snap(ns),[b,lb]=snap(ns+L0);if(la!=null)ns=a;else if(lb!=null)ns=b-L0;c.start=Math.max(0,ns);showLine(la??lb);
    // auf eine andere Spur derselben Art ziehen
    const row=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.row');if(row){const nt=App.track(row.dataset.tr);const cur=App.P.tracks.find(t=>t.clips.includes(c));
     const ok=nt&&!nt.locked&&nt!==cur&&(nt.kind===cur.kind||(c.type==='media'&&m&&m.kind==='audio'&&nt.kind==='audio'));if(ok&&(nt.kind==='video'?(c.type!=='media'||m.kind!=='audio'):(c.type==='media'&&(m.kind==='audio'||m.hasAudio)&&m.kind!=='image'))){cur.clips.splice(cur.clips.indexOf(c),1);nt.clips.push(c)}}}
   else if(mode==='l'){let ns=o.start+dx;let[s,l]=snap(ns);ns=s;showLine(l);
    if(c.type==='media'&&m.kind!=='image'){const sp=c.speed||1;let ni=o.in+(ns-o.start)*sp;ni=clamp(ni,0,o.out-0.05);c.in=ni;c.start=Math.max(0,o.start+(ni-o.in)/sp)}
    else{const end=o.start+o.dur;ns=clamp(ns,0,end-0.05);c.start=ns;c.dur=end-ns}}
   else{let ne=o.start+L0+dx;let[s,l]=snap(ne);ne=s;showLine(l);
    if(c.type==='media'&&m.kind!=='image'){const sp=c.speed||1;c.out=clamp(o.in+(ne-o.start)*sp,o.in+0.05,m.dur)}else c.dur=Math.max(0.05,ne-o.start)}
   T.render();Player.sync()};
  const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);showLine(null);
   if(moved){App.undo.push(orig);App.redo=[];App.afterChange()}else{const r=rows.getBoundingClientRect();if(!e.target.closest('.hl,.hr'))Player.seek(x2t(e.clientX-r.left))}};
  addEventListener('pointermove',mv);addEventListener('pointerup',up)});

 // Spurköpfe
 document.addEventListener('click',e=>{const b=e.target.closest('[data-th]');if(!b)return;const tr=App.track(b.closest('[data-tr]').dataset.tr);
  App.change(()=>{const k=b.dataset.th;if(k==='hide')tr.hidden=!tr.hidden;else if(k==='mute')tr.mute=!tr.mute;else if(k==='lock')tr.locked=!tr.locked;else if(k==='remove'&&!tr.clips.length)App.P.tracks.splice(App.P.tracks.indexOf(tr),1)})});
 T.addTrackMenu=()=>{const v=App.P.tracks.filter(t=>t.kind==='video').length,a=App.P.tracks.filter(t=>t.kind==='audio').length;
  Panels.modal(`<div class="mhead"><h3>Spur hinzufügen</h3></div><div class="mbody"><div class="frow"><button class="btn big" data-addtr="video">Videospur</button><button class="btn big" data-addtr="audio">Audiospur</button></div></div>`);
  $('#mbox').onclick=ev=>{const k=ev.target.closest('[data-addtr]')?.dataset.addtr;if(!k)return;Panels.close();App.change(()=>{if(k==='video')App.P.tracks.unshift({id:uid(),kind:'video',name:'Video '+(v+1),clips:[]});else App.P.tracks.push({id:uid(),kind:'audio',name:'Audio '+(a+1),clips:[]})})}};

 // Freien Platz finden oder eine neue Spur anlegen
 function free(tr,s,L,skip){return tr.clips.every(c=>c===skip||c.start>=s+L-1e-3||c.start+App.len(c)<=s+1e-3)}
 T.place=(kind,s,L)=>{let tr=App.P.tracks.filter(t=>t.kind===kind&&!t.locked);if(kind==='video')tr=tr.reverse();
  for(const t of tr)if(free(t,s,L))return t;const n=App.P.tracks.filter(t=>t.kind===kind).length+1;const nt={id:uid(),kind,name:(kind==='video'?'Video ':'Audio ')+n,clips:[]};
  if(kind==='video')App.P.tracks.unshift(nt);else App.P.tracks.push(nt);return nt};
 T.clipFromMedia=(m,s)=>m.kind==='image'?App.newClip({mediaId:m.id,start:s,dur:5,name:m.name}):App.newClip({mediaId:m.id,start:s,in:0,out:m.dur,name:m.name});
 T.addMediaAt=(ms,at)=>App.change(()=>{let s=at.t;for(const m of ms){const c=T.clipFromMedia(m,s);const L=App.len(c);let tr=at.tr&&App.track(at.tr);
   const okKind=tr&&(m.kind==='audio'?tr.kind==='audio':tr.kind==='video');if(!okKind||tr.locked)tr=T.place(m.kind==='audio'?'audio':'video',s,L);tr.clips.push(c);App.sel={clip:c.id};s+=L}});
 T.addMediaEnd=(m)=>{const kind=m.kind==='audio'?'audio':'video';const tr=App.P.tracks.filter(t=>t.kind===kind);const main=kind==='video'?tr[tr.length-1]:tr[0];
  const end=main?Math.max(0,...main.clips.map(c=>c.start+App.len(c))):0;T.addMediaAt([m],{t:main&&main.clips.length?end:App.t,tr:main&&main.id})};

 // Elemente aus der Bibliothek in die Zeitleiste ziehen
 let dragItem=null;T.startDrag=item=>{dragItem=item};
 document.addEventListener('dragstart',e=>{const el=e.target.closest('[data-drag]');if(!el)return;dragItem=JSON.parse(el.dataset.drag);e.dataTransfer.setData('text/plain',dragItem.kind);e.dataTransfer.effectAllowed='copy'});
 document.addEventListener('dragover',e=>{if(dragItem||!e.dataTransfer||![...e.dataTransfer.types].includes('Files'))return;const row=e.target.closest('.row');if(!row){App.dropAt=null;return}const r=rows.getBoundingClientRect();App.dropAt={t:x2t(e.clientX-r.left),tr:row.dataset.tr}});
 document.addEventListener('dragend',()=>{dragItem=null;$$('.row.drop').forEach(r=>r.classList.remove('drop'))});
 document.addEventListener('dragover',e=>{if(!dragItem)return;const row=e.target.closest('.row');const clip=e.target.closest('.clip');if(!row&&!clip)return;e.preventDefault();$$('.row.drop').forEach(r=>r.classList.remove('drop'));if(row&&!clip)row.classList.add('drop');if(clip)clip.closest('.row').classList.add('drop')});
 document.addEventListener('drop',async e=>{if(!dragItem)return;const row=e.target.closest('.row');if(!row)return;e.preventDefault();e.stopPropagation();const it=dragItem;dragItem=null;$$('.row.drop').forEach(r=>r.classList.remove('drop'));
  const r=rows.getBoundingClientRect();const t=x2t(e.clientX-r.left);const clipEl=e.target.closest('.clip');const at={t,tr:row.dataset.tr};
  if(it.kind==='media'){const m=App.media(it.id);if(m)T.addMediaAt([m],at)}
  else if(it.kind==='sound'){const ms=await Panels.useSound(it.id);if(ms.length)T.addMediaAt(ms,{t,tr:row.dataset.tr})}
  else if(it.kind==='title')Panels.addTitle(it.id,at);
  else if(it.kind==='color')T.addColorAt(it.color,at);
  else if(it.kind==='sticker')Panels.addSticker(it.id,at);
  else if(it.kind==='tpl')Panels.addTemplate(it.id,at);
  else if(it.kind==='trans'){if(!clipEl)return Kit.toast(Kit.t('Ziehe den Übergang auf den zweiten von zwei Clips.'));T.applyTrans(clipEl.dataset.clip,it.id)}
  else if(it.kind==='fx'){if(!clipEl)return Kit.toast(Kit.t('Ziehe den Effekt auf einen Clip.'));T.applyFx(clipEl.dataset.clip,it.id)}},true);
 T.addColorAt=(color,at)=>App.change(()=>{let tr=at.tr&&App.track(at.tr);if(!tr||tr.kind!=='video'||tr.locked)tr=T.place('video',at.t,5);const c=App.newClip({type:'color',color,start:at.t,dur:5});tr.clips.push(c);App.sel={clip:c.id}});

 // Übergang: der Clip rückt so weit nach links, dass er sich mit dem vorigen um die Übergangsdauer überlappt
 T.applyTrans=(clipId,type,custom)=>{const f=App.find(clipId);if(!f)return;const{t:tr,c}=f;const p=prevOf(tr,c);
  if(!p){const nx=tr.clips.filter(o=>o.start>c.start).sort((a,b)=>a.start-b.start)[0];if(nx&&nx.start-(c.start+App.len(c))<0.06)return T.applyTrans(nx.id,type,custom);return Kit.toast(Kit.t('Ein Übergang braucht direkt davor einen Clip auf derselben Spur.'))}
  if(tr.kind!=='video')return Kit.toast(Kit.t('Übergänge gibt es nur auf Videospuren. Für Ton nimm Ein- und Ausblenden.'));
  App.change(()=>{const cust=custom||(type.startsWith('custom:')?App.S.library.custom.find(x=>'custom:'+x.id===type):null);
   const want=clamp(cust?.dur||1,0.1,Math.min(App.len(p),App.len(c))*0.9);const cur=T.overlap(tr,c);const shift=want-cur;
   for(const o of tr.clips)if(o.start>=c.start-1e-3)o.start=Math.max(0,o.start-shift);
   c.transIn={type,dur:want};if(cust)c.transIn.custom=Object.assign({},cust);App.sel={trans:c.id}})};
 T.setTransDur=(clipId,d)=>{const f=App.find(clipId);if(!f||!f.c.transIn)return;const{t:tr,c}=f;const p=prevOf(tr,c);if(!p)return;d=clamp(d,0.1,Math.min(App.len(p),App.len(c))*0.9);
  const shift=d-T.overlap(tr,c);for(const o of tr.clips)if(o.start>=c.start-1e-3)o.start=Math.max(0,o.start-shift);c.transIn.dur=d};
 T.removeTrans=(clipId)=>{const f=App.find(clipId);if(!f)return;const{t:tr,c}=f;const ov=T.overlap(tr,c);App.change(()=>{for(const o of tr.clips)if(o.start>=c.start-1e-3)o.start+=ov;delete c.transIn;App.sel={clip:c.id}})};
 T.applyFx=(clipId,fx)=>{const f=App.find(clipId);if(!f||f.c.type==='text')return Kit.toast(Kit.t('Effekte wirken auf Videos, Bilder und Farbflächen.'));App.change(()=>{f.c.effect=fx;App.sel={clip:f.c.id}})};

 // Bearbeiten-Befehle
 const selected=()=>{if(!App.sel)return[];const ids=App.sel.clips||(App.sel.clip?[App.sel.clip]:[]);return ids.map(App.find).filter(Boolean)};
 T.split=()=>{const t=App.t;let targets=selected().filter(f=>t>f.c.start+0.02&&t<f.c.start+App.len(f.c)-0.02&&!f.t.locked);
  if(!targets.length)for(const tr of App.P.tracks)if(!tr.locked)for(const c of tr.clips)if(t>c.start+0.02&&t<c.start+App.len(c)-0.02)targets.push({t:tr,c});
  if(!targets.length)return Kit.toast(Kit.t('Setze den Abspielkopf auf einen Clip, um ihn zu teilen.'));
  App.change(()=>{for(const{t:tr,c}of targets){const n=JSON.parse(JSON.stringify(c));n.id=uid();delete n.transIn;if(c.kf){const[a,b]=App.kfCut(c,t-c.start);c.kf=a;n.kf=b}
   if(c.type==='media'&&App.media(c.mediaId)?.kind!=='image'){const cut=c.in+(t-c.start)*(c.speed||1);c.out=cut;n.in=cut;n.start=t;n.fadeIn=0;c.fadeOut=0}
   else{c.dur=t-c.start;n.start=t;n.dur-=c.dur}tr.clips.push(n);App.sel={clip:n.id}}})};
 T.del=()=>{if(App.sel&&App.sel.trans)return T.removeTrans(App.sel.trans);const s=selected().filter(f=>!f.t.locked);if(!s.length)return;
  App.change(()=>{for(const{t:tr,c}of s){const nx=tr.clips.find(o=>o.transIn&&o.start>c.start&&o.start<c.start+App.len(c));if(nx){const ov=T.overlap(tr,nx);delete nx.transIn;nx.start+=0;void ov}tr.clips.splice(tr.clips.indexOf(c),1)}App.sel=null})};
 T.copy=()=>{const s=selected();if(s.length)App.clipboard=s.map(f=>({tr:f.t.id,c:JSON.parse(JSON.stringify(f.c))}))};
 T.paste=()=>{if(!App.clipboard)return;const min=Math.min(...App.clipboard.map(x=>x.c.start));App.change(()=>{let last=null;for(const x of App.clipboard){const c=JSON.parse(JSON.stringify(x.c));c.id=uid();delete c.transIn;c.start=App.t+(c.start-min);
   let tr=App.track(x.tr);const L=App.len(c);if(!tr||tr.locked||!free(tr,c.start,L))tr=T.place(tr?tr.kind:'video',c.start,L);tr.clips.push(c);last=c}App.sel={clip:last.id}})};
 T.selectAll=()=>{const ids=[];for(const tr of App.P.tracks)if(!tr.locked)for(const c of tr.clips)ids.push(c.id);App.sel=ids.length?{clips:ids}:null;T.render();Panels.props()};
 T.detachAudio=()=>{const f=selected()[0];const m=f&&App.media(f.c.mediaId);if(!f||!m||m.kind!=='video'||!m.hasAudio)return Kit.toast(Kit.t('Wähle ein Video mit Ton aus.'));
  App.change(()=>{const c=f.c;const a=JSON.parse(JSON.stringify(c));a.id=uid();delete a.transIn;a.effect='';const tr=T.place('audio',c.start,App.len(c));tr.clips.push(a);c.mute=true;App.sel={clip:a.id}})};
 window.addEventListener('resize',()=>{if(App.P)T.render()});
 return T})();

// ---- Filmora-Befehle: Ausschneiden, Duplizieren, Lückenlos löschen, Lücke schließen, Kürzen, Standbild, Drehen, Marker, Farbmarkierung ----
(()=>{const T=Timeline;const sel=()=>{if(!App.sel)return[];const ids=App.sel.clips||(App.sel.clip?[App.sel.clip]:[]);return ids.map(App.find).filter(f=>f&&!f.t.locked)};
 const need=()=>{const s=sel();if(!s.length)Kit.toast(Kit.t('Wähle zuerst in der Zeitleiste einen Clip aus.'));return s};
 const clone=c=>{const n=JSON.parse(JSON.stringify(c));n.id=uid();delete n.transIn;return n};
 T.cut=()=>{if(!need().length)return;T.copy();T.del()};
 T.duplicate=()=>{const s=need();if(!s.length)return;App.change(()=>{let last;for(const{t:tr,c}of s){const n=clone(c);n.start=c.start+App.len(c);let t2=tr;if(!tr.clips.every(o=>o.start>=n.start+App.len(n)-1e-3||o.start+App.len(o)<=n.start+1e-3))t2=T.place(tr.kind,n.start,App.len(n));t2.clips.push(n);last=n}App.sel={clip:last.id}})};
 T.rippleDel=()=>{const s=need();if(!s.length)return;App.change(()=>{for(const{t:tr,c}of s){const L=App.len(c),e=c.start+L;tr.clips.splice(tr.clips.indexOf(c),1);for(const o of tr.clips)if(o.start>=e-1e-3)o.start=Math.max(0,o.start-L)}App.sel=null})};
 T.closeGap=()=>{const s=sel();const tracks=s.length?[...new Set(s.map(f=>f.t))]:App.P.tracks.filter(t=>!t.locked);App.change(()=>{for(const tr of tracks){const cs=tr.clips.slice().sort((a,b)=>a.start-b.start);let end=0;
   for(let i=0;i<cs.length;i++){const c=cs[i];const gap=c.start-end;if(gap>1e-3)for(let j=i;j<cs.length;j++)cs[j].start-=gap;end=Math.max(end,c.start+App.len(c))}}},true)};
 T.trimTo=(side)=>{const t=App.t;let s=sel().filter(f=>t>f.c.start+0.02&&t<f.c.start+App.len(f.c)-0.02);if(!s.length){for(const tr of App.P.tracks)if(!tr.locked)for(const c of tr.clips)if(t>c.start+0.02&&t<c.start+App.len(c)-0.02)s.push({t:tr,c})}
  if(!s.length)return Kit.toast(Kit.t('Setze den Abspielkopf auf einen Clip.'));App.change(()=>{for(const{c}of s){const m=App.media(c.mediaId),med=c.type==='media'&&m&&m.kind!=='image',sp=c.speed||1;
   if(c.kf)c.kf=App.kfCut(c,t-c.start)[side==='start'?1:0];
   if(side==='start'){if(med){if(c.reverse)c.out-=(t-c.start)*sp;else c.in+=(t-c.start)*sp}else c.dur-=t-c.start;c.start=t;delete c.transIn}
   else{if(med){if(c.reverse)c.in=c.out-(t-c.start)*sp;else c.out=c.in+(t-c.start)*sp}else c.dur=t-c.start}}})};
 T.freeze=async()=>{const t=App.t;const f=sel().find(x=>x.c.type==='media'&&App.media(x.c.mediaId)?.kind==='video'&&t>=x.c.start&&t<x.c.start+App.len(x.c))||
   App.P.tracks.filter(tr=>tr.kind==='video'&&!tr.locked).flatMap(tr=>tr.clips.map(c=>({t:tr,c}))).find(x=>x.c.type==='media'&&App.media(x.c.mediaId)?.kind==='video'&&t>=x.c.start&&t<x.c.start+App.len(x.c));
  if(!f)return Kit.toast(Kit.t('An dieser Stelle ist kein Video.'));const c=f.c,sp=c.speed||1;const src=c.reverse?c.out-(t-c.start)*sp:c.in+(t-c.start)*sp;
  let ms;try{ms=await api(`api/snapshot?id=${App.P.id}&m=${c.mediaId}&t=${src}`,{})}catch(e){return Kit.toast(e.message)}for(const m of ms)if(!App.media(m.id))App.P.media.push(m);const img=App.media(ms[0].id);const D=3;
  App.change(()=>{const tr=f.t;for(const o of tr.clips)if(o!==c&&o.start>=t-1e-3)o.start+=D;
   if(t>c.start+0.02){const n=clone(c);if(c.reverse){c.in=src;n.out=src}else{c.out=src;n.in=src}n.start=t+D;n.fadeIn=0;c.fadeOut=0;tr.clips.push(n)}else c.start+=D;
   const fr=App.newClip({mediaId:img.id,start:t,dur:D,name:Kit.t('Standbild'),x:c.x,y:c.y,scale:c.scale,rot:c.rot,flipH:c.flipH,flipV:c.flipV,effect:c.effect,bright:c.bright,contrast:c.contrast,sat:c.sat,
    cropL:c.cropL,cropT:c.cropT,cropR:c.cropR,cropB:c.cropB,temp:c.temp,tint:c.tint,expo:c.expo,vig:c.vig,enhance:c.enhance,key:c.key,keySim:c.keySim,keyEdge:c.keyEdge,opacity:c.opacity});tr.clips.push(fr);App.sel={clip:fr.id}})};
 T.rot90=d=>{const s=need().filter(f=>f.c.type!=='color');if(!s.length)return;App.change(()=>{for(const{c}of s){let r=Math.round((c.rot||0)/90)*90+90*d;r=((r+540)%360)-180;c.rot=r}},true)};
 T.nudge=d=>{const s=sel();if(!s.length)return;App.change(()=>{for(const{c}of s)c.start=Math.max(0,c.start+d/App.P.fps)},true)};
 T.toggleMute=()=>{const s=need();if(!s.length)return;App.change(()=>{const v=!s[0].c.mute;for(const{c}of s)c.mute=v},true)};
 const FXK=['effect','bright','contrast','sat','temp','tint','expo','vig','enhance','key','keySim','keyEdge','opacity','flipH','flipV','cropL','cropT','cropR','cropB'];let fxClip=null;
 T.copyFx=()=>{const s=need();if(!s.length)return;fxClip={};for(const k of FXK)fxClip[k]=s[0].c[k];Kit.toast(Kit.t('Effekte kopiert.'))};
 T.pasteFx=()=>{if(!fxClip)return Kit.toast(Kit.t('Kopiere zuerst die Effekte eines Clips.'));const s=need().filter(f=>f.c.type==='media');if(!s.length)return;App.change(()=>{for(const{c}of s)Object.assign(c,JSON.parse(JSON.stringify(fxClip)))},true)};
 T.label=col=>{const s=need();if(!s.length)return;App.change(()=>{for(const{c}of s)c.label=col},true)};
 T.selColor=()=>{const f=sel()[0];if(!f||!f.c.label)return;const ids=[];for(const tr of App.P.tracks)for(const c of tr.clips)if(c.label===f.c.label)ids.push(c.id);App.sel={clips:ids};T.render();Panels.props()};
 // Sprungmarken
 const points=()=>{const s=new Set([0,App.total()]);for(const tr of App.P.tracks)for(const c of tr.clips){s.add(c.start);s.add(c.start+App.len(c))}return[...s].sort((a,b)=>a-b)};
 T.editPoint=d=>{const t=App.t,p=points();const n=d>0?p.find(x=>x>t+1e-3):p.reverse().find(x=>x<t-1e-3);if(n!=null)Player.seek(n)};
 T.clipEdge=e=>{const f=sel()[0]||App.sel&&App.find(App.sel.clip);if(f)Player.seek(e?f.c.start+App.len(f.c)-1/App.P.fps:f.c.start)};
 // Marker auf dem Lineal
 const MCOL=['#ff4d4d','#ff9f1c','#ffd23f','#3fbf7f','#25c2b8','#4c8dff','#9a78f0','#9aa0a6'];
 const mk=()=>App.P.markers||(App.P.markers=[]);
 T.addMarker=()=>{if(mk().some(m=>Math.abs(m.t-App.t)<1/App.P.fps))return;mk().push({id:uid(),t:App.t,color:MCOL[0],name:''});App.save();T.render()};
 T.markerNav=d=>{const ms=mk().map(m=>m.t).sort((a,b)=>a-b);const t=App.t;const n=d>0?ms.find(x=>x>t+1e-3):ms.reverse().find(x=>x<t-1e-3);if(n!=null)Player.seek(n)};
 T.editMarker=id=>{const m=id?mk().find(x=>x.id===id):mk().find(x=>Math.abs(x.t-App.t)<.05);if(!m)return Kit.toast(Kit.t('Hier ist kein Marker.'));
  Panels.modal(`<div class="mhead"><h3>${Kit.t('Marker bearbeiten')}</h3><button class="ib" data-close><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="mbody"><div class="fld"><label><span>${Kit.t('Name')}</span></label><input id="mkname" value="${esc(m.name)}"></div>
   <div class="fld"><label><span>${Kit.t('Farbe')}</span></label><div class="frow">${MCOL.map(c=>`<button class="mkc ${c===m.color?'on':''}" data-mkc="${c}" style="background:${c}"></button>`).join('')}</div></div><p class="muted">${App.fmt(m.t)}</p></div>
   <div class="mfoot"><button class="btn danger" id="mkdel" style="margin-right:auto">${Kit.t('Löschen')}</button><button class="btn" data-close>${Kit.t('Abbrechen')}</button><button class="btn primary" id="mksave">${Kit.t('Speichern')}</button></div>`);
  let col=m.color;$('#mbox').onclick=e=>{const b=e.target.closest('[data-mkc]');if(b){col=b.dataset.mkc;$$('[data-mkc]').forEach(x=>x.classList.toggle('on',x===b));return}
   if(e.target.closest('#mkdel')){App.P.markers=mk().filter(x=>x!==m);Panels.close();App.save();T.render()}
   if(e.target.closest('#mksave')){m.name=$('#mkname').value.trim();m.color=col;Panels.close();App.save();T.render()}}};
 // Marker zeichnen (nach jedem Neuzeichnen der Zeitleiste)
 const render0=T.render;T.render=()=>{render0();if(!App.P)return;const r=$('#ruler');r.querySelectorAll('.mkr').forEach(e=>e.remove());
  for(const m of mk()){const e=document.createElement('i');e.className='mkr';e.dataset.mkr=m.id;e.style.left=m.t*T.pps+'px';e.style.setProperty('--c',m.color);e.title=m.name||App.fmt(m.t);r.append(e)}
  // Farbmarkierung der Clips
  for(const tr of App.P.tracks)for(const c of tr.clips){const el=document.querySelector(`.clip[data-clip="${c.id}"]`);if(!el)continue;if(c.label)el.style.boxShadow=`inset 0 4px 0 ${c.label}`;
   if(c.kf){const ts=new Set();for(const k in c.kf)for(const[t]of c.kf[k])ts.add(Math.round(t*100)/100);for(const t of ts){const d=document.createElement('i');d.className='kfd';d.style.left=t*T.pps+'px';el.append(d)}}}};
 document.addEventListener('pointerdown',e=>{const m=e.target.closest('.mkr');if(!m||e.button!==0)return;e.stopPropagation();const mm=mk().find(x=>x.id===m.dataset.mkr);if(mm)Player.seek(mm.t)},true);
 document.addEventListener('dblclick',e=>{const m=e.target.closest('.mkr');if(m)T.editMarker(m.dataset.mkr)});
 // Rechtsklick-Menü wie in Filmora
 let menu=null;const closeMenu=()=>{if(menu){menu.remove();menu=null}};
 const K=(a,b)=>`<button data-cm="${a}">${Kit.t(b[0])}${b[1]?`<kbd>${Kit.t(b[1])}</kbd>`:''}</button>`;
 function show(x,y,html){closeMenu();menu=document.createElement('div');menu.className='ddm ctxm';menu.innerHTML=html;document.body.append(menu);const r=menu.getBoundingClientRect();
  menu.style.left=Math.max(6,Math.min(x,innerWidth-r.width-6))+'px';menu.style.top=Math.max(6,Math.min(y,innerHeight-r.height-6))+'px'}
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu){closeMenu();e.stopPropagation()}},true);addEventListener('resize',closeMenu);addEventListener('blur',closeMenu);T.closeMenu=closeMenu;
 document.addEventListener('contextmenu',e=>{const mkEl=e.target.closest('.mkr');const clip=e.target.closest('#rows .clip');const lane=e.target.closest('#lanes');if(!lane&&!e.target.closest('#cv'))return;e.preventDefault();
  if(mkEl){show(e.clientX,e.clientY,`<button data-cm="mk-edit" data-id="${mkEl.dataset.mkr}">${Kit.t('Marker bearbeiten')}</button><button data-cm="mk-del" data-id="${mkEl.dataset.mkr}">${Kit.t('Marker löschen')}</button>`);return}
  if(clip){const id=clip.dataset.clip;if(!(App.sel&&((App.sel.clips||[]).includes(id)||App.sel.clip===id))){App.sel={clip:id};T.render();Panels.props()}
   const f=App.find(id);const m=f&&App.media(f.c.mediaId);const vid=m&&m.kind==='video';
   show(e.clientX,e.clientY,K('cut',['Ausschneiden','Strg+X'])+K('copy',['Kopieren','Strg+C'])+K('paste',['Einfügen','Strg+V'])+K('dup',['Duplizieren','Strg+D'])+K('del',['Löschen','Entf'])+K('ripple',['Lückenlos löschen','Umschalt+Entf'])+'<hr>'
    +K('split',['Teilen','Strg+B'])+K('trims',['Anfang bis Abspielkopf kürzen','Alt+['])+K('trime',['Ende ab Abspielkopf kürzen','Alt+]'])+'<hr>'
    +(vid?K('freeze',['Standbild einfügen','Alt+F']):'')+(m&&m.kind!=='image'?K('reverse',[f.c.reverse?'Vorwärts abspielen':'Rückwärts abspielen','']):'')+(m&&m.kind!=='image'?K('speed',['Tempo …','']):'')+(vid&&m.hasAudio?K('detach',['Ton abtrennen','Strg+Alt+D']):'')+(m&&(m.kind==='audio'||m.hasAudio)?K('mute',[f.c.mute?'Ton an':'Stumm','Strg+Umschalt+M']):'')+'<hr>'
    +(f.c.type!=='color'?K('rotr',['90° nach rechts drehen','Strg+Alt+→'])+K('rotl',['90° nach links drehen','Strg+Alt+←']):'')+(f.c.type==='media'?K('copyfx',['Effekte kopieren','Strg+Alt+C'])+K('pastefx',['Effekte einfügen','Strg+Alt+V']):'')
    +`<hr><div class="cmcols">${MCOL.map((c,i)=>`<button data-cm="label" data-col="${c}" style="background:${c}" title="Alt+${i+1}"></button>`).join('')}<button data-cm="label" data-col="" title="${Kit.t('Ohne Farbe')}">×</button></div>`+K('selcol',['Alle Clips mit dieser Farbe auswählen','Alt+Umschalt+^'])+'<hr>'+(f.c.type==='media'&&m?(vid||m.kind==='image'?K(f.c.matte?'act:matteoff':'act:matte',[f.c.matte?'KI-Hintergrund wieder anzeigen':'Hintergrund entfernen (KI)','']):'')+(m.kind==='audio'||m.hasAudio?K('act:autosubs',['Untertitel aus Sprache (KI) …',''])+K('act:silence',['Stille herausschneiden …','']):'')+(vid?K('act:ramp',['Tempo-Rampe …',''])+K('act:curves',['Kurven …','']):'')+'<hr>':'')+((App.sel.clips||[]).length>1?K('act:nest',['Clips verschachteln',''])+'<hr>':'')+(f.c.nested?K('act:unnest',['Verschachtelung auflösen',''])+'<hr>':'')+K('props',['Eigenschaften','Alt+E']));return}
  show(e.clientX,e.clientY,K('paste',['Einfügen','Strg+V'])+K('gap',['Lücken schließen','Alt+Entf'])+K('marker',['Marker hinzufügen','M'])+K('addtrack',['Spur hinzufügen',''])+'<hr>'+K('selall',['Alles auswählen','Strg+A']))});
 document.addEventListener('pointerdown',e=>{if(menu&&!e.target.closest('.ctxm'))closeMenu()});
 document.addEventListener('click',e=>{const b=e.target.closest('.ctxm [data-cm]');if(!b)return;const a=b.dataset.cm;closeMenu();if(a.startsWith('act:'))return App.act(a.slice(4),b);
  ({cut:T.cut,copy:T.copy,paste:T.paste,dup:T.duplicate,del:T.del,ripple:T.rippleDel,split:T.split,trims:()=>T.trimTo('start'),trime:()=>T.trimTo('end'),freeze:T.freeze,
   reverse:()=>{const s=sel();App.change(()=>{for(const{c}of s)c.reverse=!c.reverse},true)},speed:()=>Panels.props('speed'),detach:T.detachAudio,mute:T.toggleMute,rotr:()=>T.rot90(1),rotl:()=>T.rot90(-1),
   copyfx:T.copyFx,pastefx:T.pasteFx,label:()=>T.label(b.dataset.col),selcol:T.selColor,props:()=>Panels.props(),gap:T.closeGap,marker:T.addMarker,addtrack:T.addTrackMenu,selall:T.selectAll,
   'mk-edit':()=>T.editMarker(b.dataset.id),'mk-del':()=>{App.P.markers=mk().filter(x=>x.id!==b.dataset.id);App.save();T.render()}})[a]?.()});
})();
