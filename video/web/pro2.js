// Videoschnitt – Paket 2: Bewegungsverfolgung, Tempo-Rampen, Split-Screen, verschachtelte Clips, Aufnahme.
(()=>{const t=s=>Kit.t(s),A=Pro.ACTS;
 const selIds=()=>!App.sel?[]:App.sel.clips||(App.sel.clip?[App.sel.clip]:[]);
 const one=()=>{const f=App.sel&&App.sel.clip&&App.find(App.sel.clip);if(!f)Kit.toast(t('Wähle zuerst einen Clip aus.'));return f};
 const fileURL=m=>`api/file?id=${App.P.id}&m=${m.id}&k=play&p=${m.proxy}`;
 const wait=(el,ev)=>new Promise((ok,no)=>{const f=()=>{el.removeEventListener(ev,f);el.removeEventListener('error',g);ok()},g=()=>{el.removeEventListener(ev,f);el.removeEventListener('error',g);no(new Error(t('Das Video ließ sich nicht laden.')))};el.addEventListener(ev,f);el.addEventListener('error',g)});
 const prog=(title,onCancel)=>{Panels.modal(`<div class="mhead"><h3>${Kit.esc(t(title))}</h3></div><div class="mbody"><div class="bar2"><i id="p2bar" style="width:0%"></i></div><p class="muted" id="p2txt" style="font-size:12px;margin-top:8px"></p></div><div class="mfoot"><div class="sp"></div><button class="btn" id="p2cancel">${t('Abbrechen')}</button></div>`);Panels.locked=true;
  document.getElementById('p2cancel').onclick=()=>onCancel&&onCancel();return(p,txt)=>{const b=document.getElementById('p2bar');if(b)b.style.width=Math.round(p*100)+'%';const x=document.getElementById('p2txt');if(x&&txt!=null)x.textContent=txt}};
 const endProg=()=>{Panels.locked=false;Panels.close()};

 // ---------- Bewegungsverfolgung ----------
 // Vorschau: Lage des Bereichs zur aktuellen Zeit
 Pro.regionAt=(c,lt)=>{const P=c.region.path;if(!P||P.length<2)return[c.region.x,c.region.y];if(lt<=P[0][0])return[P[0][1],P[0][2]];
  for(let i=1;i<P.length;i++)if(lt<P[i][0]){const a=P[i-1],b=P[i],u=(lt-a[0])/Math.max(1e-6,b[0]-a[0]);return[a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u]}const l=P[P.length-1];return[l[1],l[2]]};
 const baseProcess=Pro.process;
 Pro.process=(c,cv,x,w,h)=>{if(c.region&&c.region.path){const[px,py]=Pro.regionAt(c,App.t-c.start);const c2=Object.assign({},c,{region:Object.assign({},c.region,{x:px,y:py})});return baseProcess(c2,cv,x,w,h)}return baseProcess(c,cv,x,w,h)};
 A.track=async()=>{const f=one();if(!f)return;const c=f.c,m=App.media(c.mediaId);if(!m||m.kind!=='video')return Kit.toast(t('Bewegung lässt sich nur in Videos verfolgen.'));
  if(!c.region)return Kit.toast(t('Lege zuerst einen Bereich fest (Reiter Bild → Bereich unkenntlich machen).'));
  let stop=false;const up=prog('Bewegung wird verfolgt …',()=>{stop=true});
  try{const v=document.createElement('video');v.muted=true;v.preload='auto';v.playsInline=true;v.src=fileURL(m);await wait(v,'loadeddata');
   const iw=v.videoWidth,ih=v.videoHeight;const sx=iw*(c.cropL||0),sy=ih*(c.cropT||0),sw=iw*Math.max(.05,1-(c.cropL||0)-(c.cropR||0)),sh=ih*Math.max(.05,1-(c.cropT||0)-(c.cropB||0));
   const AW=320,AH=Math.max(16,Math.round(AW*sh/sw));const cv=document.createElement('canvas');cv.width=AW;cv.height=AH;const x=cv.getContext('2d',{willReadFrequently:true});
   const seek=s=>{const p=wait(v,'seeked');v.currentTime=Math.max(0,Math.min(v.duration-0.01,s));return p};
   const gray=()=>{x.drawImage(v,sx,sy,sw,sh,0,0,AW,AH);const d=x.getImageData(0,0,AW,AH).data,g=new Float32Array(AW*AH);for(let i=0,j=0;j<g.length;i+=4,j++)g[j]=d[i]*.3+d[i+1]*.59+d[i+2]*.11;return g};
   const R=c.region,tw=Math.max(8,Math.round(R.w*AW)),th=Math.max(8,Math.round(R.h*AH)),st=Math.max(1,Math.round(Math.min(tw,th)/24));
   const patch=(g,cx,cy)=>{const p=new Float32Array(tw*th);const x0=Math.round(cx-tw/2),y0=Math.round(cy-th/2);for(let yy=0;yy<th;yy++){const Y=Math.max(0,Math.min(AH-1,y0+yy));for(let xx=0;xx<tw;xx++){const X=Math.max(0,Math.min(AW-1,x0+xx));p[yy*tw+xx]=g[Y*AW+X]}}return p};
   const sad=(g,tpl,cx,cy,lim)=>{const x0=Math.round(cx-tw/2),y0=Math.round(cy-th/2);let s=0;for(let yy=0;yy<th;yy+=st){const Y=Math.max(0,Math.min(AH-1,y0+yy)),row=Y*AW;for(let xx=0;xx<tw;xx+=st){const X=Math.max(0,Math.min(AW-1,x0+xx));s+=Math.abs(g[row+X]-tpl[yy*tw+xx])}if(s>lim)return s}return s};
   const S=Math.max(10,Math.round(AW*.07));
   const match=(g,tpl,px,py)=>{let best=Infinity,bx=px,by=py;for(let dy=-S;dy<=S;dy+=2)for(let dx=-S;dx<=S;dx+=2){const v2=sad(g,tpl,px+dx,py+dy,best);if(v2<best){best=v2;bx=px+dx;by=py+dy}}
    const cx0=bx,cy0=by;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const v2=sad(g,tpl,cx0+dx,cy0+dy,best);if(v2<best){best=v2;bx=cx0+dx;by=cy0+dy}}return[Math.max(0,Math.min(AW,bx)),Math.max(0,Math.min(AH,by))]};
   const sp=c.speed||1,L=App.len(c),src=lt=>c.reverse?c.out-lt*sp:c.in+lt*sp;const step=.1;
   const lt0=Math.max(0,Math.min(L-.01,App.t-c.start));const[rx0,ry0]=Pro.regionAt(c,lt0);
   await seek(src(lt0));const tpl0=patch(gray(),rx0*AW,ry0*AH);const pts=[[lt0,rx0,ry0]];
   const total=Math.max(1,Math.ceil(L/step));let n=0;
   for(const dir of[1,-1]){let px=rx0*AW,py=ry0*AH,tpl=tpl0;
    for(let lt=lt0+dir*step;dir>0?lt<=L:lt>=0;lt+=dir*step){if(stop)throw new Error('stop');await seek(src(lt));const g=gray();[px,py]=match(g,tpl,px,py);
     const np=patch(g,px,py);const mix=new Float32Array(np.length);for(let i=0;i<np.length;i++)mix[i]=tpl0[i]*.5+np[i]*.5;tpl=mix;
     pts.push([+lt.toFixed(3),px/AW,py/AH]);n++;up(n/total,Math.round(n/total*100)+' %')}}
   pts.sort((a,b)=>a[0]-b[0]);const sm=pts.map((p,i)=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];return[p[0],+((a[1]+2*p[1]+b[1])/4).toFixed(4),+((a[2]+2*p[2]+b[2])/4).toFixed(4)]});
   endProg();App.change(()=>{const g=App.find(c.id);if(g&&g.c.region)g.c.region.path=sm},true);Panels.props();Kit.toast(t('Bewegung verfolgt. Der Bereich folgt jetzt dem Objekt.'))
  }catch(e){endProg();if(e.message!=='stop')Kit.toast(e.message)}};
 A.trackoff=()=>Panels.edit(c=>{if(c.region)delete c.region.path},true);
 // Ein anderes Element (Text, Sticker, Bild) dem verfolgten Objekt folgen lassen
 A.trackattach=()=>{const f=one();if(!f||!f.c.region||!f.c.region.path)return;const c=f.c,m=App.media(c.mediaId);const L=App.len(c);
  const cand=App.P.tracks.filter(tr=>tr.kind==='video'&&tr!==f.t).flatMap(tr=>tr.clips).filter(o=>o.start<c.start+L&&o.start+App.len(o)>c.start);
  if(!cand.length)return Kit.toast(t('Lege zuerst einen Text, Sticker oder ein Bild auf eine andere Spur über diesen Clip.'));
  const name=o=>o.type==='text'?(o.text.content||'Text').slice(0,40):(o.name||(App.media(o.mediaId)||{}).name||o.type);
  Panels.modal(`<div class="mhead"><h3>${t('Element folgen lassen')}</h3></div><div class="mbody"><p class="muted">${t('Welches Element soll dem verfolgten Objekt folgen?')}</p>${cand.map(o=>`<button class="btn" data-att="${o.id}" style="display:block;width:100%;text-align:left;margin-bottom:6px">${Kit.esc(name(o))}</button>`).join('')}</div><div class="mfoot"><button class="btn" data-close>${t('Abbrechen')}</button></div>`);
  document.getElementById('mbox').onclick=e=>{const b=e.target.closest('[data-att]');if(!b)return;Panels.close();
   const W=App.P.w,H=App.P.h,kw=Math.max(.05,1-(c.cropL||0)-(c.cropR||0)),kh=Math.max(.05,1-(c.cropT||0)-(c.cropB||0));const mw=(m.w||W)*kw,mh=(m.h||H)*kh;const s=Math.min(W/mw,H/mh)*(c.scale||1);const fw=mw*s,fh=mh*s;
   const at=lt=>{const[rx,ry]=Pro.regionAt(c,lt);return[(c.x||0)+(rx-.5)*fw/W,(c.y||0)+(ry-.5)*fh/H]};
   App.change(()=>{const o=App.find(b.dataset.att).c;const oL=App.len(o);const ref=Math.max(0,Math.min(L,o.start-c.start));const[ax,ay]=at(ref);let dx=App.kv(o,'x',o.start)-ax,dy=App.kv(o,'y',o.start)-ay;if(Math.hypot(dx,dy)>.15){dx=0;dy=0}
    const kx=[],ky=[];const P=c.region.path;const stp=Math.max(1,Math.round(P.length/150));
    for(let i=0;i<P.length;i+=stp){const tt=c.start+P[i][0]-o.start;if(tt<-.05||tt>oL+.05)continue;const[x2,y2]=at(P[i][0]);kx.push([+Math.max(0,tt).toFixed(3),+(x2+dx).toFixed(4)]);ky.push([+Math.max(0,tt).toFixed(3),+(y2+dy).toFixed(4)])}
    if(kx.length<2)return;o.kf=o.kf||{};o.kf.x=kx;o.kf.y=ky;o.kfLin=true;App.sel={clip:o.id}});Kit.toast(t('Das Element folgt jetzt dem Objekt.'))}};

 // ---------- Tempo-Rampen ----------
 const RAMPS=[['montage','Montage',[1,1,.35,.35,.35,1,1,1]],['hero','Held',[2,2,.3,.3,.3,.3,2,2]],['bullet','Bullet-Time',[1,1,.15,.15,.15,.15,1,1]],['jump','Sprung',[.4,.6,1,1.6,2.4,3,3,3]],['flashin','Flash rein',[4,3,2,1.4,1,1,1,1]],['flashout','Flash raus',[1,1,1,1,1.4,2,3,4]],['slowend','Langsam ausklingen',[1,1,1,1,.8,.6,.4,.3]]];
 A.ramp=()=>{const f=one();if(!f)return;const c=f.c,m=App.media(c.mediaId);if(c.type!=='media'||!m||m.kind!=='video')return Kit.toast(t('Tempo-Rampen gehen nur mit Video-Clips.'));
  const svg=v=>{const mx=Math.max(...v);return`<svg viewBox="0 0 80 30" style="width:80px;height:30px"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${v.map((s,i)=>`${i*80/(v.length-1)},${28-26*Math.log2(s*4)/Math.log2(mx*4)}`).join(' ')}"/></svg>`};
  Panels.modal(`<div class="mhead"><h3>${t('Tempo-Rampe')}</h3></div><div class="mbody"><p class="muted">${t('Der Clip wird in Abschnitte mit wechselndem Tempo geteilt.')}</p><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${RAMPS.map(([k,n,v])=>`<button class="btn" data-ramp="${k}" style="display:flex;align-items:center;gap:10px;justify-content:flex-start">${svg(v)}<b>${t(n)}</b></button>`).join('')}</div>
   <label class="chk" style="margin-top:12px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="rsmooth" checked> ${t('Flüssige Zeitlupe in langsamen Abschnitten')}</label></div><div class="mfoot"><button class="btn" data-close>${t('Abbrechen')}</button></div>`);
  document.getElementById('mbox').onclick=e=>{const b=e.target.closest('[data-ramp]');if(!b)return;const R=RAMPS.find(r=>r[0]===b.dataset.ramp)[2];const smooth=document.getElementById('rsmooth').checked;Panels.close();
   const base=c.speed||1,n=R.length,seg=(c.out-c.in)/n,oldL=App.len(c),end0=c.start+oldL;
   App.change(()=>{const tr=f.t,i=tr.clips.indexOf(c);tr.clips.splice(i,1);let cur=c.start;const parts=[];
    for(let k=0;k<n;k++){const kk=c.reverse?n-1-k:k;const p=JSON.parse(JSON.stringify(c));p.id=uid();p.in=c.in+kk*seg;p.out=p.in+seg;p.speed=+(base*R[k]).toFixed(3);p.start=cur;if(k>0){p.fadeIn=0;delete p.transIn}if(k<n-1)p.fadeOut=0;delete p.kf;if(smooth&&p.speed<.99)p.smooth=true;cur+=seg/p.speed;parts.push(p)}
    const d=cur-end0;for(const o of tr.clips)if(o.start>=end0-1e-3)o.start=Math.max(0,o.start+d);tr.clips.push(...parts);App.sel={clips:parts.map(p=>p.id)}});
   Kit.toast(t('Tempo-Rampe angewendet.'))}};

 // ---------- Split-Screen ----------
 const LAYOUTS=[['2h','Zwei nebeneinander',[[0,0,.5,1],[.5,0,.5,1]]],['2v','Zwei übereinander',[[0,0,1,.5],[0,.5,1,.5]]],['3h','Drei Spalten',[[0,0,1/3,1],[1/3,0,1/3,1],[2/3,0,1/3,1]]],['3v','Drei Zeilen',[[0,0,1,1/3],[0,1/3,1,1/3],[0,2/3,1,1/3]]],
  ['1p2','Groß + zwei klein',[[0,0,2/3,1],[2/3,0,1/3,.5],[2/3,.5,1/3,.5]]],['4','Raster 2 × 2',[[0,0,.5,.5],[.5,0,.5,.5],[0,.5,.5,.5],[.5,.5,.5,.5]]],['pip','Bild im Bild',[[0,0,1,1],[.66,.64,.3,.3]]],['pipl','Bild im Bild links',[[0,0,1,1],[.04,.64,.3,.3]]]];
 A.splitscreen=()=>{const ts=App.t;const vis=App.P.tracks.filter(tr=>tr.kind==='video'&&!tr.hidden&&!tr.subs).map(tr=>tr.clips.find(c=>(c.type==='media'||c.type==='color')&&c.start<=ts+1e-3&&c.start+App.len(c)>ts)).filter(Boolean);
  const sel=selIds().map(App.find).filter(x=>x&&(x.c.type==='media'||x.c.type==='color')).map(x=>x.c);const use=sel.length>=2?sel:vis;
  if(use.length<2)return Kit.toast(t('Lege dafür 2 bis 4 Clips auf verschiedene Spuren übereinander und stelle den Abspielkopf darauf.'));
  const icon=cells=>`<svg viewBox="0 0 64 36" style="width:64px;height:36px">${cells.map(([x,y,w,h],i)=>`<rect x="${x*64+1}" y="${y*36+1}" width="${w*64-2}" height="${h*36-2}" rx="2" fill="${i?'var(--accent)':'currentColor'}" opacity="${i?.85:.35}"/>`).join('')}</svg>`;
  Panels.modal(`<div class="mhead"><h3>${t('Split-Screen')}</h3></div><div class="mbody"><p class="muted">${use.length} ${t('Clips werden angeordnet (oberste Spur zuerst).')}</p><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${LAYOUTS.filter(l=>l[2].length<=use.length).map(([k,n,cells])=>`<button class="btn" data-lay="${k}" style="flex-direction:column;gap:4px;padding:8px">${icon(cells)}<small>${t(n)}</small></button>`).join('')}</div></div><div class="mfoot"><button class="btn" data-close>${t('Abbrechen')}</button></div>`);
  document.getElementById('mbox').onclick=e=>{const b=e.target.closest('[data-lay]');if(!b)return;const cells=LAYOUTS.find(l=>l[0]===b.dataset.lay)[2];Panels.close();const W=App.P.w,H=App.P.h;
   App.change(()=>{const pip=b.dataset.lay.startsWith('pip');const order=pip?[...use].reverse():use;
    cells.forEach((cell,i)=>{const c=App.find(order[i].id).c;const m=c.type==='media'?App.media(c.mediaId):null;const mw=m?m.w||W:W,mh=m?m.h||H:H;const [cx,cy,cw,ch]=cell;
     const as=mw/mh,ac=cw*W/(ch*H);c.cropL=c.cropR=c.cropT=c.cropB=0;if(as>ac){const k=ac/as;c.cropL=c.cropR=+((1-k)/2).toFixed(4)}else if(as<ac){const k=as/ac;c.cropT=c.cropB=+((1-k)/2).toFixed(4)}
     const fitW=Math.min(W,H*ac);c.scale=+(cw*W/fitW).toFixed(4);c.x=+(cx+cw/2-.5).toFixed(4);c.y=+(cy+ch/2-.5).toFixed(4);c.rot=0;if(c.kf){delete c.kf.x;delete c.kf.y;delete c.kf.scale}});
    // Bild im Bild: das kleine Bild muss oben liegen
    if(pip){const big=App.find(order[0].id),small=App.find(order[1].id);const ti=App.P.tracks.indexOf(big.t),si=App.P.tracks.indexOf(small.t);if(si>ti){const tmp=App.P.tracks[ti];App.P.tracks[ti]=App.P.tracks[si];App.P.tracks[si]=tmp}}});
   Kit.toast(t('Split-Screen angewendet.'))}};

 // ---------- Verschachtelte Clips ----------
 A.nest=async()=>{const ids=selIds();const fs=ids.map(App.find).filter(Boolean);if(fs.length<2)return Kit.toast(t('Wähle mindestens zwei Clips aus (Strg+Klick).'));
  if(fs.some(x=>x.c.nested))return Kit.toast(t('Ein verschachtelter Clip ist schon dabei. Löse ihn zuerst auf.'));
  if(!App.S.engine.ready)return Kit.toast(t('Dafür fehlt noch ffmpeg. Richte es im Startfenster einmalig ein.'));
  await App.flush();let r;try{r=await api('api/nest',{id:App.P.id,clips:ids})}catch(e){return Kit.toast(e.message)}
  const up=prog('Clips werden verschachtelt …',()=>api('api/export/cancel?id='+App.P.id,{}).catch(()=>{}));
  let j;for(;;){await new Promise(z=>setTimeout(z,500));try{j=await api('api/export/job?id='+App.P.id)}catch(e){continue}if(!j.running)break;up(j.done,Math.round(j.done*100)+' %')}
  endProg();if(!j.finish)return Kit.toast(j.error||t('Abgebrochen'));
  const ms=await App.importPaths([r.out]);if(!ms[0])return;const nm=ms[0];
  App.change(()=>{const saved=[];let topIdx=Infinity;for(const id of ids){const x=App.find(id);if(!x)continue;topIdx=Math.min(topIdx,App.P.tracks.indexOf(x.t));saved.push({tr:x.t.id,c:x.c});x.t.clips.splice(x.t.clips.indexOf(x.c),1)}
   const trs=App.P.tracks.filter(tr=>tr.kind==='video');let tr=App.P.tracks[topIdx];if(!tr||tr.kind!=='video')tr=trs[trs.length-1];
   const c=App.newClip({type:'media',mediaId:nm.id,start:r.start,in:0,out:r.dur,name:t('Verschachtelt'),label:'#8b5cf6',nested:{t0:r.start,clips:saved}});tr.clips.push(c);App.sel={clip:c.id}});
  Kit.toast(t('Clips verschachtelt. Mit „Verschachtelung auflösen“ kommen die Originale zurück.'))};
 A.unnest=()=>{const f=one();if(!f)return;const c=f.c;if(!c.nested)return Kit.toast(t('Das ist kein verschachtelter Clip.'));
  App.change(()=>{const d=c.start-c.nested.t0;f.t.clips.splice(f.t.clips.indexOf(c),1);const ids=[];for(const s of c.nested.clips){let tr=App.track(s.tr)||f.t;const o=s.c;o.start+=d;tr.clips.push(o);ids.push(o.id)}App.sel={clips:ids}});Kit.toast(t('Verschachtelung aufgelöst.'))};

 // ---------- Aufnahme: Bildschirm, Webcam, Mikrofon ----------
 let rec=null;
 A.record=()=>{if(rec)return;const md=navigator.mediaDevices;const can={screen:!!(md&&md.getDisplayMedia),cam:!!(md&&md.getUserMedia),mic:!!(md&&md.getUserMedia)};
  if(typeof MediaRecorder==='undefined'||!(can.screen||can.cam))return Kit.toast(t('Aufnehmen wird in diesem Fenster nicht unterstützt. Öffne den Videoschnitt im Browser oder nimm mit einem anderen Programm auf und importiere die Datei.'));
  const opt=(k,n,d)=>`<button class="btn" data-rec="${k}" ${can[k]?'':'disabled'} style="flex-direction:column;align-items:flex-start;gap:2px;padding:12px;text-align:left"><b>${t(n)}</b><small class="muted">${t(can[k]?d:'Hier nicht verfügbar')}</small></button>`;
  Panels.modal(`<div class="mhead"><h3>${t('Aufnehmen')}</h3></div><div class="mbody"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${opt('screen','Bildschirm','Ganzer Bildschirm oder ein Fenster')}${opt('cam','Webcam','Kamera mit Ton')}${opt('mic','Mikrofon','Nur Ton, z. B. für Kommentare')}</div>
   <label style="margin-top:12px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="recmic" checked> ${t('Mikrofon mit aufnehmen')}</label><p class="muted" style="font-size:12px">${t('Die Aufnahme landet in den Projektmedien und am Abspielkopf in der Zeitleiste.')}</p></div><div class="mfoot"><button class="btn" data-close>${t('Abbrechen')}</button></div>`);
  document.getElementById('mbox').onclick=async e=>{const b=e.target.closest('[data-rec]');if(!b||b.disabled)return;const kind=b.dataset.rec,mic=document.getElementById('recmic').checked;Panels.close();
   let streams=[];try{if(kind==='screen'){streams.push(await md.getDisplayMedia({video:{frameRate:30},audio:true}));if(mic)try{streams.push(await md.getUserMedia({audio:true}))}catch(x){}}
    else if(kind==='cam')streams.push(await md.getUserMedia({video:{width:{ideal:1920},height:{ideal:1080}},audio:mic}));else streams.push(await md.getUserMedia({audio:true}))}
   catch(x){streams.forEach(s=>s.getTracks().forEach(k=>k.stop()));return Kit.toast(t('Keine Erlaubnis für die Aufnahme oder kein Gerät gefunden.'))}
   // Ton mischen (Systemton + Mikrofon)
   const vt=streams.flatMap(s=>s.getVideoTracks()),at=streams.flatMap(s=>s.getAudioTracks());let out,actx=null;
   if(at.length>1){actx=new AudioContext();const dst=actx.createMediaStreamDestination();for(const a of at)actx.createMediaStreamSource(new MediaStream([a])).connect(dst);out=new MediaStream([...vt,...dst.stream.getAudioTracks()])}else out=new MediaStream([...vt,...at]);
   const type=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4','audio/webm;codecs=opus','audio/webm','audio/mp4'].find(x=>(vt.length?!x.startsWith('audio'):x.startsWith('audio'))&&MediaRecorder.isTypeSupported(x))||'';
   let mr;try{mr=new MediaRecorder(out,type?{mimeType:type,videoBitsPerSecond:8e6}:{})}catch(x){streams.forEach(s=>s.getTracks().forEach(k=>k.stop()));return Kit.toast(x.message)}
   const chunks=[];mr.ondataavailable=ev=>{if(ev.data.size)chunks.push(ev.data)};const t0=Date.now();
   const bar=document.createElement('div');bar.className='recbar';bar.innerHTML=`<i></i><b id="rect">0:00</b><span>${t({screen:'Bildschirm',cam:'Webcam',mic:'Mikrofon'}[kind])}</span><button class="btn danger" id="recstop">${t('Aufnahme beenden')}</button>`;document.body.append(bar);
   const tick=setInterval(()=>{const s=Math.floor((Date.now()-t0)/1000);const el=document.getElementById('rect');if(el)el.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0')},500);
   const finish=()=>{if(mr.state!=='inactive')mr.stop()};document.getElementById('recstop').onclick=finish;vt.forEach(v=>v.onended=finish);
   rec={mr};mr.onstop=async()=>{clearInterval(tick);bar.remove();streams.forEach(s=>s.getTracks().forEach(k=>k.stop()));if(actx)actx.close();rec=null;
    const blob=new Blob(chunks,{type:mr.mimeType||type||'video/webm'});if(!blob.size)return Kit.toast(t('Die Aufnahme ist leer.'));const ext=/mp4/.test(blob.type)?'.mp4':'.webm';
    Kit.toast(t('Aufnahme wird gespeichert …'));try{const r=await fetch(`api/upload?id=${App.P.id}&kind=${kind}&name=rec${ext}`,{method:'POST',body:blob});const ms=await r.json();if(!r.ok)throw new Error(ms.error||t('Die Aufnahme ließ sich nicht speichern.'));
     for(const m of ms)if(!App.media(m.id))App.P.media.push(m);Panels.libRefreshMedia&&Panels.libRefreshMedia();Timeline.addMediaAt(ms,{t:App.t});Kit.toast(t('Aufnahme hinzugefügt.'))}catch(x){Kit.toast(x.message)}};
   mr.start(1000)}};
 // ---------- YouTube-Kapitel aus Markern ----------
 A.chapters=()=>{const ms=[...(App.P.markers||[])].filter(m=>m.name!=='Beat').sort((a,b)=>a.t-b.t);if(!ms.length)return Kit.toast(t('Setze zuerst Marker (Taste M) und gib ihnen Namen.'));
  const fmt=v=>{v=Math.floor(v);const h=Math.floor(v/3600),m=Math.floor(v/60)%60,s=v%60;return(h?h+':'+String(m).padStart(2,'0'):m)+':'+String(s).padStart(2,'0')};
  const list=ms.map((m,i)=>({t:m.t,name:(m.name||'').trim()||t('Kapitel')+' '+(i+1)}));if(list[0].t>=1)list.unshift({t:0,name:t('Intro')});else list[0].t=0;
  const txt=list.map(x=>fmt(x.t)+' '+x.name).join('\n');const warn=[];if(list.length<3)warn.push(t('YouTube braucht mindestens 3 Kapitel.'));
  for(let i=1;i<list.length;i++)if(list[i].t-list[i-1].t<10){warn.push(t('Jedes Kapitel muss mindestens 10 Sekunden lang sein.'));break}
  Panels.modal(`<div class="mhead"><h3>${t('YouTube-Kapitel')}</h3></div><div class="mbody"><p class="muted">${t('In die Videobeschreibung einfügen. Die Namen kommen von den Markern.')}</p><textarea id="chtx" rows="${Math.min(14,list.length+1)}" style="width:100%;font-family:ui-monospace,monospace">${Kit.esc(txt)}</textarea>${warn.map(w=>`<p class="muted" style="color:var(--warn,#f5a524)">${Kit.esc(w)}</p>`).join('')}</div>
   <div class="mfoot"><button class="btn" data-close>${t('Schließen')}</button><button class="btn primary" id="chcopy">${t('Kopieren')}</button></div>`);
  document.getElementById('chcopy').onclick=async()=>{const ta=document.getElementById('chtx');try{await navigator.clipboard.writeText(ta.value)}catch(e){ta.select();document.execCommand('copy')}Kit.toast(t('Kapitel kopiert.'))}};
 // ---------- Erste Schritte ----------
 A.guide=()=>{const st=[['Medien holen','Ziehe Videos, Bilder und Musik ins Fenster oder klicke auf Importieren. Aus der Bibliothek links ziehst du sie in die Zeitleiste.'],
  ['Schneiden','Abspielkopf an die Stelle setzen und Strg+B drücken. Mit Umschalt+Entf löschst du einen Teil, ohne eine Lücke zu lassen.'],
  ['Anpassen','Klicke einen Clip an: Rechts findest du Bild, Farbe, Ton und Tempo. Mit der Raute setzt du Schlüsselbilder für Bewegungen.'],
  ['Texte und Effekte','Oben links gibt es Texte, Übergänge, Effekte, Filter, Sticker und fertige Vorlagen. Einfach auf einen Clip oder in die Zeitleiste ziehen.'],
  ['Profi-Werkzeuge','Unter Extras: Stille herausschneiden, Beats, Kurven, LUTs, Tempo-Rampen, Bewegung verfolgen, Split-Screen und Aufnahme. Unter KI: Untertitel, Hintergrund entfernen, Hochformat.'],
  ['Fertig machen','Klicke auf Exportieren und wähle eine Vorlage (YouTube, TikTok, Instagram …). Rechtsklick auf einen Clip zeigt alle Befehle.']];
  Panels.modal(`<div class="mhead"><h3>${t('Erste Schritte')}</h3></div><div class="mbody">${st.map(([h,x],i)=>`<div style="display:flex;gap:12px;margin-bottom:12px"><b style="flex:none;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center">${i+1}</b><div><b>${t(h)}</b><div class="muted" style="font-size:13px">${t(x)}</div></div></div>`).join('')}</div><div class="mfoot"><div class="sp"></div><button class="btn primary" data-close>${t('Los geht’s')}</button></div>`)};
})();
