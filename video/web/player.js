// Vorschau-Player: setzt alle sichtbaren Clips der aktuellen Zeit auf eine Leinwand, mit Übergängen und Effekten.
const Player=(()=>{
 const P={playing:false};let cv,ctx,cw,ch,els=new Map(),raf=0,t0=0,start=0,offA,offB;
 const url=m=>`api/file?id=${App.P.id}&m=${m.id}&k=play&p=${m.proxy}`;
 P.init=()=>{cv=$('#cv');const W=App.P.w,H=App.P.h;const k=Math.min(1,(+$('#pq').value||1280)/Math.max(W,H));const r=RATIOS.find(x=>Math.abs(x[1]/x[2]-W/H)<.01);$('#ratiolbl').textContent=r?r[0]:W+'×'+H;cw=Math.round(W*k);ch=Math.round(H*k);cv.width=cw;cv.height=ch;ctx=cv.getContext('2d');
  offA=document.createElement('canvas');offB=document.createElement('canvas');for(const o of[offA,offB]){o.width=cw;o.height=ch}
  for(const e of els.values())e.remove?.();els.clear();$('#hidden').innerHTML='';P.pause();P.seek(App.t||0)};
 // Ein Element je Clip (dieselbe Datei kann mehrmals gleichzeitig laufen)
 function el(c){const m=App.media(c.mediaId);if(!m||!(m.proxy==='ok'||m.proxy==='direct'))return null;const key=c.id+'|'+m.id+'|'+m.proxy;let e=els.get(key);
  // fertige Vorschau-Kopie ersetzt das direkt abgespielte Original: altes Element aufräumen
  if(!e)for(const [k,o] of els)if(k.startsWith(c.id+'|'+m.id+'|')){try{o.pause&&o.pause();o.removeAttribute('src');o.load&&o.load()}catch(x){}els.delete(k)}
  if(!e){if(m.kind==='image'){e=new Image();e.src=url(m);e.onload=()=>P.draw()}else{e=document.createElement(m.kind==='video'?'video':'audio');e.preload='auto';e.src=url(m);e.playsInline=true;e.addEventListener('seeked',()=>{if(!P.playing)P.draw()});e.addEventListener('loadeddata',()=>{if(!P.playing){seekEl(c,e);P.draw()}})}
   e.dataset.kind=m.kind;e.dataset.clip=c.id;els.set(key,e);if(m.kind!=='image')$('#hidden').append(e)}return e}
 const srcTime=(c,t)=>c.reverse?Math.max(c.in,c.out-(t-c.start)*(c.speed||1)-0.001):c.in+(t-c.start)*(c.speed||1);
 function seekEl(c,e){if(e.tagName==='IMG')return;const tt=srcTime(c,App.t);if(Math.abs(e.currentTime-tt)>0.02)try{e.currentTime=Math.max(0,tt)}catch(x){}}
 function active(t){const out=[];for(const tr of App.P.tracks)for(const c of tr.clips){const L=App.len(c);if(t>=c.start&&t<c.start+L)out.push({tr,c})}return out}
 // Ton und Bild der Elemente zur Zeit passend steuern
 function steer(force){const t=App.t;const act=new Set();
  for(const tr of App.P.tracks)for(const c of tr.clips){if(c.type!=='media')continue;const L=App.len(c);const near=t>=c.start-3&&t<c.start+L;if(!near&&!els.has(c.id+'|'+c.mediaId))continue;const e=el(c);if(!e||e.tagName==='IMG')continue;
   const on=t>=c.start&&t<c.start+L;
   if(on){act.add(e);const tt=srcTime(c,t);
    if(P.playing){let vol=(tr.mute||c.mute||P.muted)?0:Math.min(1,App.kv(c,'volume',t)*(tr.vol||1));const into=t-c.start,left=c.start+L-t;if(c.fadeIn>0&&into<c.fadeIn)vol*=into/c.fadeIn;if(c.fadeOut>0&&left<c.fadeOut)vol*=left/c.fadeOut;
     const R=P.rate||1,pr=Math.min(16,(c.speed||1)*Math.abs(R));e.volume=clamp(vol,0,1);e.muted=vol<=0;if(R>0&&Math.abs(e.playbackRate-pr)>1e-3)e.playbackRate=pr;
     if(c.reverse||R<0){e.muted=true;if(!e.paused)e.pause();if(Math.abs(e.currentTime-tt)>1/12&&!e.seeking)try{e.currentTime=tt}catch(x){}}
     else{if(Math.abs(e.currentTime-tt)>0.3||force)try{e.currentTime=tt}catch(x){}
     if(e.paused)e.play().catch(()=>{})}}
    else{if(!e.paused)e.pause();seekEl(c,e)}}
   else{if(!e.paused)e.pause();if(t<c.start&&Math.abs(e.currentTime-c.in)>0.05&&!P.playing)try{e.currentTime=c.in}catch(x){}}}}
 function fitSize(m,c){const W=App.P.w,H=App.P.h,mw=m.w*cropK(c)[0],mh=m.h*cropK(c)[1],k=Math.min(W/mw,H/mh)*(App.kv(c,'scale')||1);return[mw*k*cw/W,mh*k*ch/H]}
 const cropK=c=>[Math.max(.05,1-(c.cropL||0)-(c.cropR||0)),Math.max(.05,1-(c.cropT||0)-(c.cropB||0))];
 // Quelle vorbereiten: zuschneiden und Farbe freistellen (Chroma Key)
 const srcCv=new Map();
 function source(c,e,m,fw,fh){const crop=(c.cropL||0)+(c.cropT||0)+(c.cropR||0)+(c.cropB||0)>0.001;const extra=typeof Pro!=='undefined'&&Pro.needs(c);if(!crop&&!c.key&&!extra)return e;
  const iw=e.videoWidth||e.naturalWidth||m.w,ih=e.videoHeight||e.naturalHeight||m.h;const[kw,kh]=cropK(c);
  let cv2=srcCv.get(c.id);if(!cv2){cv2=document.createElement('canvas');srcCv.set(c.id,cv2)}const w=Math.max(2,Math.min(Math.round(fw),960)),h=Math.max(2,Math.round(w*fh/fw));if(cv2.width!==w||cv2.height!==h){cv2.width=w;cv2.height=h}
  const x=cv2.getContext('2d',{willReadFrequently:!!c.key});x.clearRect(0,0,w,h);x.drawImage(e,iw*(c.cropL||0),ih*(c.cropT||0),iw*kw,ih*kh,0,0,w,h);
  if(c.key)FX.chroma(x,w,h,c.key,c.keySim||.3,c.keyEdge||.1);if(c.key&&c.spill>0.01&&typeof Grade!=='undefined')Grade.despill(x,w,h,c.key,c.spill);if(extra)Pro.process(c,cv2,x,w,h,e,m);return cv2}
 // Maße eines Textes auf der Vorschau (Breite, Höhe, Mitte) – gleiche Formel wie beim Export
 function textMetrics(x,c){const tx=c.text,H=App.P.h,k=ch/H;const fs=Math.max(6,tx.size*H)*k;x.font=`${tx.bold?'bold ':''}${fs}px "${tx.font||'Arial'}", sans-serif`;
  const lines=String(tx.content||'').split('\n');const lh=fs*1.15+fs*.15;const w=Math.max(1,...lines.map(l=>x.measureText(l).width));const h=lines.length*lh-fs*.15;return{fs,lines,lh,w,h,cx:cw/2+App.kv(c,'x')*cw,cy:ch/2+App.kv(c,'y')*ch}}
 function drawText(x,c0){if(!c0.text)return;const A=App.anim(c0);let c=c0;if(A){const s=[...c0.text.content];c=Object.assign({},c0,{text:Object.assign({},c0.text,{content:A.chars>=0?s.slice(0,A.chars).join(''):c0.text.content,size:c0.text.size*A.s})})}
  const tx=c.text;x.save();const M=textMetrics(x,c),op=App.kv(c,'opacity')*(A?A.a:1);if(A){M.cx+=A.dx*cw;M.cy+=A.dy*ch}x.globalAlpha=op;x.textBaseline='top';
  x.translate(M.cx,M.cy);x.rotate(App.kv(c,'rot')*Math.PI/180);const X=-M.w/2,Y=-M.h/2,fs=M.fs;
  if(tx.box){const b=fs*.35;x.fillStyle=tx.box;x.globalAlpha=op*.85;x.fillRect(X-b,Y-b,M.w+2*b,M.h+2*b);x.globalAlpha=op}
  M.lines.forEach((l,i)=>{const y=Y+i*M.lh;if(tx.shadow){x.fillStyle='rgba(0,0,0,.6)';const o=Math.max(2,fs*.05);x.fillText(l,X+o,y+o)}
   if(tx.outline>0){x.lineWidth=Math.max(1,tx.outline*fs*.08)*2;x.strokeStyle=tx.ocolor||'#000';x.lineJoin='round';x.strokeText(l,X,y)}
   x.fillStyle=tx.color||'#fff';x.fillText(l,X,y)});x.restore()}
 function drawClip(x,c){const g=App.BLEND[c.blend];if(!g)return drawClip0(x,c);x.save();x.globalCompositeOperation=g;drawClip0(x,c);x.restore()}
 function drawClip0(x,c){
  if(c.type==='color'){x.save();x.globalAlpha=App.kv(c,'opacity');x.fillStyle=c.color||'#000';x.fillRect(0,0,cw,ch);x.restore();return}
  if(c.type==='text')return drawText(x,c);
  const m=App.media(c.mediaId);if(!m||m.kind==='audio')return;const e=el(c);
  if(!e||(e.tagName==='VIDEO'&&e.readyState<2)||(e.tagName==='IMG'&&!e.complete)){placeholder(x,m);return}
  const[fw,fh]=fitSize(m,c);x.save();x.globalAlpha=App.kv(c,'opacity');{const f0=FX.cssFor(c);x.filter=c.hue?((f0&&f0!=='none'?f0+' ':'')+`hue-rotate(${c.hue}deg)`):f0}
  const def=FX.effects.find(z=>z.id===c.effect),spec=def&&def.css.startsWith('@')?def.css.slice(1).split('|')[0]:'';const mo=spec?FX.motion(spec,App.t):null;
  x.translate(cw/2+App.kv(c,'x')*cw,ch/2+App.kv(c,'y')*ch);x.rotate(App.kv(c,'rot')*Math.PI/180);x.scale(c.flipH?-1:1,c.flipV?-1:1);
  if(mo){x.beginPath();x.rect(-fw/2,-fh/2,fw,fh);x.clip();x.translate(mo.dx*fw,mo.dy*fh);x.scale(mo.s,mo.s)}
  if(c.effect==='pixel'){const s=document.createElement('canvas');s.width=Math.max(1,fw/16);s.height=Math.max(1,fh/16);s.getContext('2d').drawImage(source(c,e,m,fw,fh),0,0,s.width,s.height);x.imageSmoothingEnabled=false;x.drawImage(s,-fw/2,-fh/2,fw,fh)}
  else{let im=source(c,e,m,fw,fh);if(spec)im=FX.special(spec,im,Math.round(fw),Math.round(fh),App.t)||im;x.drawImage(im,-fw/2,-fh/2,fw,fh)}
  x.filter='none';x.translate(-fw/2,-fh/2);if(c.effect==='grain')FX.grain(x,fw,fh);if(c.effect==='vignette')FX.vignette(x,fw,fh);if(c.vig>0)FX.vignette(x,fw,fh,c.vig);x.restore()}
 function placeholder(x,m){x.save();x.fillStyle='#1b1e24';x.fillRect(0,0,cw,ch);x.fillStyle='#98a0ad';x.font=`${Math.max(12,ch/24)}px Segoe UI`;x.textAlign='center';
  x.fillText(m.proxy==='error'?Kit.t('Vorschau nicht möglich'):(Kit.t('Vorschau wird vorbereitet …')+' '+Math.round((m.proxyPct||0)*100)+' %'),cw/2,ch/2);x.restore()}
 P.draw=()=>{if(!ctx||!App.P)return;const t=App.t;ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.filter='none';ctx.fillStyle='#000';ctx.fillRect(0,0,cw,ch);
  const vids=App.P.tracks.filter(tr=>tr.kind==='video');
  for(let i=vids.length-1;i>=0;i--){const tr=vids[i];if(tr.hidden)continue;
   const cl=tr.clips.filter(c=>t>=c.start&&t<c.start+App.len(c)).sort((a,b)=>a.start-b.start);const done=new Set();
   for(const c of cl){if(done.has(c.id))continue;
    // Übergang: dieser Clip überlappt mit dem vorigen und hat einen Übergang
    const nb=cl.find(b=>b!==c&&b.transIn&&b.start>c.start&&b.start<c.start+App.len(c));
    if(nb){const end=c.start+App.len(c);const p=(t-nb.start)/Math.max(.01,end-nb.start);
     for(const[o,cc]of[[offA,c],[offB,nb]]){const x=o.getContext('2d');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,cw,ch);drawClip(x,cc)}
     FX.trans(ctx,nb.transIn.type,p,offA,offB,cw,ch,nb.transIn.custom);done.add(nb.id)}
    else drawClip(ctx,c);done.add(c.id)}}
  const tot0=App.total(),pc=tot0?Math.min(1,t/tot0)*100:0;$('#scrub i').style.width=pc+'%';$('#scrub b').style.left=pc+'%';const tc=$('#tcur');if(document.activeElement!==tc)tc.value=App.fmt(t);$('#ttot').textContent=App.fmt(App.total());
  const empty=!App.P.tracks.some(tr=>tr.clips.length);const msg=$('#pmsg');msg.classList.toggle('show',empty);if(empty)msg.textContent=Kit.t('Ziehe Medien aus der Bibliothek in die Zeitleiste.');
  Timeline.playhead();TB.update()};
 P.sync=(force)=>{if(!App.P)return;steer(force);P.draw()};
 function loop(){if(!P.playing)return;App.t=t0+(performance.now()-start)/1000*(P.rate||1);const tot=App.total();if(App.t>=tot){App.t=tot;P.pause();P.draw();return}if(App.t<=0){App.t=0;P.pause();P.draw();return}steer(false);P.draw();Timeline.follow();raf=requestAnimationFrame(loop)}
 P.play=()=>{if(P.playing||!App.P)return;if((P.rate||1)>0&&App.t>=App.total()-0.01)App.t=0;P.playing=true;t0=App.t;start=performance.now();steer(true);$('#playbtn').innerHTML='<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';raf=requestAnimationFrame(loop)};
 P.pause=()=>{P.playing=false;cancelAnimationFrame(raf);for(const e of els.values())if(e.pause&&!e.paused)e.pause();const b=$('#playbtn');if(b)b.innerHTML='<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>'};
 P.stop=()=>P.pause();
 P.toggle=()=>{P.rate=1;P.playing?P.pause():P.play()};
 // Shuttle wie in Resolve (J/K/L): Tempo setzen, negativ = rückwärts
 P.shuttle=r=>{if(!App.P)return;const was=P.playing;if(was){P.pause()}P.rate=r;if(r)P.play()};
 P.seek=(t)=>{App.t=clamp(t,0,Math.max(0,App.total()));if(P.playing){t0=App.t;start=performance.now();steer(true)}else steer(false);P.draw();Panels.syncKf&&Panels.syncKf()};
 P.snapshot=async()=>{const vis=active(App.t).filter(({tr,c})=>tr.kind==='video'&&c.type==='media'&&App.media(c.mediaId)?.kind==='video');
  const pick=(App.sel&&vis.find(v=>v.c.id===App.sel.clip))||vis[0];if(!pick)return Kit.toast(Kit.t('An dieser Stelle ist kein Video.'));
  const ms=await api(`api/snapshot?id=${App.P.id}&m=${pick.c.mediaId}&t=${srcTime(pick.c,App.t)}`,{});for(const m of ms)if(!App.media(m.id))App.P.media.push(m);App.tab='media';Panels.lib();Kit.toast(Kit.t('Standbild gespeichert und zu den Medien hinzugefügt.'))};
 // Zeit direkt eintippen (Stunden:Minuten:Sekunden:Bilder)
 document.addEventListener('change',e=>{if(e.target.id!=='tcur')return;const p=e.target.value.split(':').map(Number).reverse();if(p.some(isNaN))return P.draw();
  const fps=App.P.fps;let s=0;if(p.length===4)s=p[3]*3600+p[2]*60+p[1]+p[0]/fps;else if(p.length===3)s=p[2]*3600+p[1]*60+p[0];else if(p.length===2)s=p[1]*60+p[0];else s=p[0];P.seek(s)});
 // Auswahlrahmen auf dem Bild: Ecken und Kantenmitten ziehen = Größe, Kreis oben = Drehen, Innen ziehen = Verschieben
 function bounds(c){if(c.type==='text'){if(!c.text)return null;const M=textMetrics(ctx,c);const b=c.text.box?M.fs*.35:0;return{cx:M.cx,cy:M.cy,w:M.w+2*b,h:M.h+2*b}}
  if(c.type!=='media')return null;const m=App.media(c.mediaId);if(!m||m.kind==='audio'||!m.w)return null;const[fw,fh]=fitSize(m,c);return{cx:cw/2+App.kv(c,'x')*cw,cy:ch/2+App.kv(c,'y')*ch,w:fw,h:fh}}
 function visibleAt(t){const out=[];for(const tr of App.P.tracks){if(tr.kind!=='video'||tr.hidden)continue;for(const c of tr.clips)if(t>=c.start&&t<c.start+App.len(c)&&(c.type==='text'||c.type==='media'))out.push({tr,c})}return out} // oberste Spur zuerst
 const TB=(()=>{const st=$('#stage');const box=document.createElement('div');box.id='tbox';box.innerHTML='<span class="stem"></span>'+['nw','n','ne','e','se','s','sw','w'].map(h=>`<i data-h="${h}"></i>`).join('')+'<b data-h="rot"></b>';st.append(box);
  const geo=()=>{const r=cv.getBoundingClientRect(),s=st.getBoundingClientRect();return{ox:r.left-s.left,oy:r.top-s.top,k:r.width/cw,r}};
  const cur=()=>{const id=App.sel&&App.sel.clip;if(!id||P.playing)return null;const f=App.find(id);if(!f||f.t.locked||f.t.hidden||f.t.kind!=='video')return null;const c=f.c;if(App.t<c.start||App.t>=c.start+App.len(c))return null;const b=bounds(c);return b?{c,b}:null};
  function update(){const s=cur();box.style.display=s?'block':'none';if(!s)return;const g=geo(),b=s.b;box.style.left=(g.ox+(b.cx-b.w/2)*g.k)+'px';box.style.top=(g.oy+(b.cy-b.h/2)*g.k)+'px';box.style.width=b.w*g.k+'px';box.style.height=b.h*g.k+'px';box.style.transform=`rotate(${App.kv(s.c,'rot')}deg)`}
  // Bildschirmpunkt -> Leinwandpunkt
  const toCv=(e,g)=>[(e.clientX-g.r.left)/g.k,(e.clientY-g.r.top)/g.k];
  function hit(px,py){for(const{c}of visibleAt(App.t)){const b=bounds(c);if(!b)continue;const a=-App.kv(c,'rot')*Math.PI/180,dx=px-b.cx,dy=py-b.cy;const lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);if(Math.abs(lx)<=b.w/2&&Math.abs(ly)<=b.h/2)return c}return null}
  function drag(e,mode,c){e.preventDefault();e.stopPropagation();const g=geo();const snap=JSON.stringify(App.P.tracks);const b0=bounds(c);const[p0x,p0y]=toCv(e,g);
   const o={x:App.kv(c,'x'),y:App.kv(c,'y'),scale:App.kv(c,'scale')||1,rot:App.kv(c,'rot'),size:c.text?c.text.size:0};const a=-(o.rot)*Math.PI/180;const loc=(px,py)=>{const dx=px-b0.cx,dy=py-b0.cy;return[dx*Math.cos(a)-dy*Math.sin(a),dx*Math.sin(a)+dy*Math.cos(a)]};const[l0x,l0y]=loc(p0x,p0y);let moved=false;
   const mv=ev=>{const[px,py]=toCv(ev,g);moved=true;
    if(mode==='move'){let nx=o.x+(px-p0x)/cw,ny=o.y+(py-p0y)/ch;if(!ev.shiftKey){if(Math.abs(nx)<.012)nx=0;if(Math.abs(ny)<.012)ny=0}App.setv(c,'x',clamp(nx,-1.5,1.5));App.setv(c,'y',clamp(ny,-1.5,1.5))}
    else if(mode==='rot'){let r=Math.atan2(py-b0.cy,px-b0.cx)*180/Math.PI+90;r=((r+540)%360)-180;if(!ev.shiftKey){const q=Math.round(r/15)*15;if(Math.abs(r-q)<4)r=q}App.setv(c,'rot',Math.round(r*10)/10)}
    else{const[lx,ly]=loc(px,py);let f;if(mode==='e'||mode==='w')f=Math.abs(lx)/Math.max(1,Math.abs(l0x));else if(mode==='n'||mode==='s')f=Math.abs(ly)/Math.max(1,Math.abs(l0y));else f=Math.hypot(lx,ly)/Math.max(1,Math.hypot(l0x,l0y));
     if(c.type==='text')c.text.size=clamp(o.size*f,.01,.8);else App.setv(c,'scale',clamp(o.scale*f,.05,10))}
    P.draw()};
   const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);if(moved&&snap!==JSON.stringify(App.P.tracks)){App.undo.push(snap);App.redo=[];App.save()}Panels.props()};
   addEventListener('pointermove',mv);addEventListener('pointerup',up)}
  box.addEventListener('pointerdown',e=>{const s=cur();if(!s)return;const h=e.target.dataset.h;drag(e,h||'move',s.c)});
  $('#cv').addEventListener('pointerdown',e=>{if(!App.P||e.button!==0)return;if(P.playing)P.pause();const g=geo();const[px,py]=toCv(e,g);const c=hit(px,py);
   if(!c){if(App.sel){App.sel=null;Timeline.render();Panels.props();update()}return}
   if(!(App.sel&&App.sel.clip===c.id)){App.sel={clip:c.id};Timeline.render();Panels.props()}update();const f=App.find(c.id);if(f&&!f.t.locked)drag(e,'move',c)});
  addEventListener('resize',update);return{update}})();
 // Fortschrittsleiste unter dem Bild: klicken oder ziehen
 document.addEventListener('pointerdown',e=>{const sc=e.target.closest('#scrub');if(!sc||!App.P)return;e.preventDefault();const go=ev=>{const r=sc.getBoundingClientRect();P.seek(clamp((ev.clientX-r.left)/r.width,0,1)*App.total())};go(e);
  const up=()=>{removeEventListener('pointermove',go);removeEventListener('pointerup',up)};addEventListener('pointermove',go);addEventListener('pointerup',up)});
 document.addEventListener('change',e=>{if(e.target.id==='pq'&&App.P){const t=App.t;P.init();P.seek(t)}});
 return P})();
