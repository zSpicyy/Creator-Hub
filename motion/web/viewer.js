// Kompositionsfenster: Vorschau, Auswahl, Verschieben/Skalieren/Drehen, Ankerpunkt, Formen, Zeichenstift, Text, Masken.
const Viewer=(()=>{const V={zoom:.5,pan:[0,0],fitNext:true};let cv,ov,stage,W=0,H=0,dpr=1;
 const comp=()=>App.comp();
 const toScr=(p)=>[V.pan[0]+p[0]*V.zoom,V.pan[1]+p[1]*V.zoom];
 const toComp=(x,y)=>[(x-V.pan[0])/V.zoom,(y-V.pan[1])/V.zoom];
 V.fit=()=>{const c=comp();if(!c||!W)return;V.zoom=Math.min((W-40)/c.w,(H-40)/c.h);V.pan=[(W-c.w*V.zoom)/2,(H-c.h*V.zoom)/2];$('#vzoom').value='fit';App.redraw('view')};
 V.setZoom=(z,cx,cy)=>{const c=comp();if(!c)return;z=M.clamp(z,.02,16);if(cx===undefined){cx=W/2;cy=H/2}const p=toComp(cx,cy);V.zoom=z;V.pan=[cx-p[0]*z,cy-p[1]*z];const o=[...$('#vzoom').options].find(o=>Math.abs(+o.value-z)<1e-3);$('#vzoom').value=o?o.value:'';App.redraw('view')};
 V.zoomBy=(k,cx,cy)=>V.setZoom(V.zoom*k,cx,cy);
 // ---------- Werkzeuge ----------
 const TOOLS=[['select','Auswahl (V)','<path d="M5 3l14 8-6 2-3 6z"/>'],['hand','Hand (H)','<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14c0 4-3 7-7 7-3 0-4.5-1.5-6-4l-1.5-3a1.5 1.5 0 0 1 2.6-1.5L8 15"/>'],['zoom','Zoom (Z)','<circle cx="10" cy="10" r="6"/><path d="M15 15l5 5M8 10h4M10 8v4"/>'],['rotate','Drehen (W)','<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>'],['anchor','Ankerpunkt (Y)','<circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>'],
  ['shape','Form (Q)',''],['pen','Zeichenstift (G)','<path d="M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6"/><circle cx="11" cy="11" r="2"/>'],['text','Text (Strg+T)','<path d="M5 6V4h14v2M12 4v16M9 20h6"/>']];
 const SHAPES=[['rect','Rechteck','<rect x="4" y="6" width="16" height="12" rx="1"/>'],['rrect','Abgerundetes Rechteck','<rect x="4" y="6" width="16" height="12" rx="4"/>'],['ellipse','Ellipse','<ellipse cx="12" cy="12" rx="8" ry="6"/>'],['polygon','Polygon','<path d="M12 3l8 6-3 10H7L4 9z"/>'],['star','Stern','<path d="M12 3l2.6 6 6.4.6-4.8 4.3 1.4 6.4L12 17l-5.6 3.3 1.4-6.4L3 9.6 9.4 9z"/>']];
 V.setTool=id=>{if(V.penPath&&id!=='pen')finishPen();E.tool=id;renderTools();cursor()};
 V.cycleShape=()=>{if(E.tool==='shape'){const i=SHAPES.findIndex(s=>s[0]===E.shapeTool);E.shapeTool=SHAPES[(i+1)%SHAPES.length][0]}V.setTool('shape')};
 const renderTools=()=>{const sh=SHAPES.find(s=>s[0]===E.shapeTool);
  $('#tools').innerHTML=TOOLS.map(([id,n,ic])=>`<button class="ib ${E.tool===id?'on':''}" data-tool="${id}" title="${esc(t(n))}"><svg viewBox="0 0 24 24">${id==='shape'?sh[2]:ic}</svg>${id==='shape'?'<i class="tri"></i>':''}</button>`).join('')
   +`<span class="tsep"></span><span class="tmode ${E.tool==='shape'||E.tool==='pen'?'':'off'}"><span class="muted">${esc(t('Zeichnet als'))}</span><div class="seg sm"><button data-tmode="shape" class="${E.toolMode==='shape'?'on':''}">${esc(t('Form'))}</button><button data-tmode="mask" class="${E.toolMode==='mask'?'on':''}" title="${esc(t('Zeichnet eine Maske auf die ausgewählte Ebene'))}">${esc(t('Maske'))}</button></div></span>`
   +`<span class="tsep"></span><label class="tcol" title="${esc(t('Füllfarbe für neue Formen'))}">${esc(t('Füllung'))}<input type="color" id="tfill" value="${E.newFill}"></label><label class="tcol" title="${esc(t('Kontur für neue Formen'))}"><input type="checkbox" id="tstrokeOn" ${E.newStrokeOn?'checked':''}>${esc(t('Kontur'))}<input type="color" id="tstroke" value="${E.newStroke}"><input type="number" id="tstrokeW" value="${E.newStrokeW||8}" min="0" max="200" style="width:56px"> px</label>`
   +`<div class="grow"></div><span class="muted hintt" id="thint">${esc(t(HINT[E.tool]||''))}</span>`};
 const HINT={select:'Klicken wählt eine Ebene, Ziehen verschiebt. Griffe am Rahmen skalieren (Umschalt = Seitenverhältnis). Doppelklick auf Text zum Bearbeiten.',hand:'Ziehen verschiebt die Ansicht. Mausrad zoomt.',zoom:'Klick vergrößert, Alt+Klick verkleinert.',rotate:'Ziehen dreht die ausgewählte Ebene um ihren Ankerpunkt (Umschalt = 45°).',anchor:'Ankerpunkt ziehen – die Ebene bleibt, wo sie ist.',
  shape:'Aufziehen erstellt eine Form (Umschalt = gleichmäßig). Doppelklick aufs Werkzeug = ganze Fläche. Q wechselt die Form.',pen:'Klicken setzt Punkte, Ziehen macht Kurven. Klick auf den ersten Punkt schließt, Enter beendet.',text:'Klicken setzt einen Text. Klick auf vorhandenen Text bearbeitet ihn.'};
 document.addEventListener('click',e=>{const b=e.target.closest('[data-tool]');if(b){if(b.dataset.tool==='shape'&&E.tool==='shape'){shapeMenu(b);return}V.setTool(b.dataset.tool);return}const m=e.target.closest('[data-tmode]');if(m){E.toolMode=m.dataset.tmode;renderTools()}const s=e.target.closest('[data-shp]');if(s){E.shapeTool=s.dataset.shp;$('#ctx').hidden=true;V.setTool('shape')}});
 document.addEventListener('dblclick',e=>{const b=e.target.closest('[data-tool="shape"]');if(b){const c=comp();if(!c)return;const l=E.toolMode==='mask'&&App.sel1();if(l){addMask(l,[0,0],[c.w,c.h],true)}else makeShape([0,0],[c.w,c.h])}});
 document.addEventListener('contextmenu',e=>{const b=e.target.closest('[data-tool="shape"]');if(b){e.preventDefault();shapeMenu(b)}});
 const shapeMenu=b=>{const r=b.getBoundingClientRect();const m=$('#ctx');m.innerHTML=SHAPES.map(([id,n,ic])=>`<button data-shp="${id}"><svg viewBox="0 0 24 24">${ic}</svg>${esc(t(n))}</button>`).join('');m.style.left=r.left+'px';m.style.top=r.bottom+4+'px';m.hidden=false};
 document.addEventListener('input',e=>{if(e.target.id==='tfill')E.newFill=e.target.value;if(e.target.id==='tstroke')E.newStroke=e.target.value;if(e.target.id==='tstrokeW')E.newStrokeW=+e.target.value;if(e.target.id==='tstrokeOn')E.newStrokeOn=e.target.checked});
 const cursor=()=>{if(!ov)return;ov.style.cursor={hand:'grab',zoom:'zoom-in',rotate:'alias',anchor:'crosshair',shape:'crosshair',pen:'crosshair',text:'text'}[E.tool]||'default'};
 // ---------- Zeichnen ----------
 const checker=(x,a,b,w,h)=>{const s=10;x.save();x.beginPath();x.rect(a,b,w,h);x.clip();x.fillStyle='#bfbfbf';x.fillRect(a,b,w,h);x.fillStyle='#8a8a8a';for(let yy=0;yy<h;yy+=s)for(let xx=((yy/s)%2)*s;xx<w;xx+=2*s)x.fillRect(a+xx,b+yy,s,s);x.restore()};
 V.draw=()=>{const c=comp();if(!cv)init();const r=stage.getBoundingClientRect();dpr=window.devicePixelRatio||1;const nw=Math.max(1,Math.round(r.width)),nh=Math.max(1,Math.round(r.height));if(nw!==W||nh!==H){W=nw;H=nh;for(const k of[cv,ov]){k.width=W*dpr;k.height=H*dpr;k.style.width=W+'px';k.style.height=H+'px'}}
  if(!c){const x=cv.getContext('2d');x.clearRect(0,0,cv.width,cv.height);return}if(V.fitNext){V.fitNext=false;V.fit();return}
  const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,W,H);const q=+$('#vq').value||.5;const S=Math.min(1,V.zoom*dpr*q*(E.playing?1:1.0001));
  const a=V.pan[0],b=V.pan[1],w=c.w*V.zoom,h=c.h*V.zoom;x.fillStyle='#000';x.shadowColor='#0008';x.shadowBlur=14;x.fillRect(a,b,w,h);x.shadowBlur=0;if(E.view.checker)checker(x,a,b,w,h);
  let img;try{img=M.render(c,E.time,S,{transparent:E.view.checker})}catch(err){console.error(err);return}x.imageSmoothingEnabled=V.zoom*dpr<=S*1.01||true;x.drawImage(img,a,b,w,h);M.putCv(img);
  drawOverlay();$('#vtime').value=fmtT(E.time,c.fps);$('#vinfo').textContent=`${c.w}×${c.h} · ${c.fps} fps`};
 const drawOverlay=()=>{const c=comp();const x=ov.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,W,H);if(!c)return;const a=V.pan[0],b=V.pan[1],w=c.w*V.zoom,h=c.h*V.zoom;
  if(E.view.grid){x.strokeStyle='#ffffff22';x.lineWidth=1;const st=Math.max(10,c.w/12);for(let gx=st;gx<c.w;gx+=st){const s=toScr([gx,0]);x.beginPath();x.moveTo(Math.round(s[0])+.5,b);x.lineTo(Math.round(s[0])+.5,b+h);x.stroke()}for(let gy=st;gy<c.h;gy+=st){const s=toScr([0,gy]);x.beginPath();x.moveTo(a,Math.round(s[1])+.5);x.lineTo(a+w,Math.round(s[1])+.5);x.stroke()}}
  if(E.view.safe){x.strokeStyle='#ffffff55';x.setLineDash([4,4]);x.strokeRect(a+w*.05,b+h*.05,w*.9,h*.9);x.strokeRect(a+w*.1,b+h*.1,w*.8,h*.8);x.setLineDash([]);x.beginPath();x.moveTo(a+w/2-8,b+h/2);x.lineTo(a+w/2+8,b+h/2);x.moveTo(a+w/2,b+h/2-8);x.lineTo(a+w/2,b+h/2+8);x.stroke()}
  for(const l of App.selLayers()){if(E.time<l.in||E.time>=l.out||l.type==='audio')continue;const m=M.matrix(c,l,E.time);const bd=M.bounds(c,l,E.time);const corners=[[bd[0],bd[1]],[bd[0]+bd[2],bd[1]],[bd[0]+bd[2],bd[1]+bd[3]],[bd[0],bd[1]+bd[3]]].map(p=>toScr(M.apply(m,p)));
   x.strokeStyle=l.label||'#7c6cff';x.lineWidth=1;x.beginPath();corners.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.closePath();x.stroke();
   if(App.selLayers().length===1&&!l.locked)for(const p of handles(corners)){x.fillStyle='#fff';x.fillRect(p[0]-3.5,p[1]-3.5,7,7);x.strokeRect(p[0]-3.5,p[1]-3.5,7,7)}
   const an=toScr(M.apply(m,M.val(l.tr.anchor,{comp:c,layer:l,t:M.ltime(l,E.time),ct:E.time})));x.strokeStyle='#fff';x.lineWidth=1.5;x.beginPath();x.arc(an[0],an[1],5,0,7);x.moveTo(an[0]-9,an[1]);x.lineTo(an[0]+9,an[1]);x.moveTo(an[0],an[1]-9);x.lineTo(an[0],an[1]+9);x.stroke();
   // Bewegungspfad
   if(E.view.paths&&l.tr.pos.k&&l.tr.pos.k.length>1){const ks=l.tr.pos.k;const t0=ks[0].t,t1=ks[ks.length-1].t;x.fillStyle=l.label||'#7c6cff';const par=l.parent?M.matrix(c,c.layers.find(q=>q.id===l.parent)||l,E.time):[1,0,0,1,0,0];
    const step=1/c.fps;x.globalAlpha=.8;for(let tt=t0;tt<=t1+1e-6;tt+=step){const p=toScr(M.apply(l.parent?par:[1,0,0,1,0,0],M.kfVal(l.tr.pos,tt)));x.fillRect(p[0]-1,p[1]-1,2,2)}x.globalAlpha=1;for(const k of ks){const p=toScr(M.apply(l.parent?par:[1,0,0,1,0,0],k.v));x.strokeStyle='#fff';x.strokeRect(p[0]-3,p[1]-3,6,6)}}
   // Masken und Pfade
   for(const ed of editables(c,l)){x.strokeStyle=ed.color;x.lineWidth=1.5;x.beginPath();const P=ed.path;const sp=P.v.map(v=>toScr(M.apply(m,v)));
    const n=P.v.length;for(let i=0;i<=n;i++){if(i===n&&!P.c)break;const j=i%n;if(i===0){x.moveTo(sp[0][0],sp[0][1]);continue}const pa=P.v[i-1],pb=P.v[j];const o=P.o[i-1]||[0,0],ii=P.i[j]||[0,0];const c1=toScr(M.apply(m,[pa[0]+o[0],pa[1]+o[1]])),c2=toScr(M.apply(m,[pb[0]+ii[0],pb[1]+ii[1]]));x.bezierCurveTo(c1[0],c1[1],c2[0],c2[1],sp[j][0],sp[j][1])}x.stroke();
    P.v.forEach((v,i)=>{const s=sp[i];for(const hk of['i','o']){const hv=P[hk][i];if(hv&&(hv[0]||hv[1])){const hs=toScr(M.apply(m,[v[0]+hv[0],v[1]+hv[1]]));x.beginPath();x.moveTo(s[0],s[1]);x.lineTo(hs[0],hs[1]);x.stroke();x.beginPath();x.arc(hs[0],hs[1],3,0,7);x.fillStyle=ed.color;x.fill()}}x.fillStyle='#fff';x.fillRect(s[0]-3.5,s[1]-3.5,7,7);x.strokeRect(s[0]-3.5,s[1]-3.5,7,7)})}}
  if(drag&&drag.k==='shape'){x.strokeStyle='#7c6cff';x.setLineDash([5,4]);const p0=toScr(drag.a),p1=toScr(drag.b);if(E.shapeTool==='ellipse'){x.beginPath();x.ellipse((p0[0]+p1[0])/2,(p0[1]+p1[1])/2,Math.abs(p1[0]-p0[0])/2,Math.abs(p1[1]-p0[1])/2,0,0,7);x.stroke()}else x.strokeRect(p0[0],p0[1],p1[0]-p0[0],p1[1]-p0[1]);x.setLineDash([])}
  if(V.penPath){const P=V.penPath;x.strokeStyle='#7c6cff';x.lineWidth=1.5;x.beginPath();P.v.forEach((v,i)=>{const s=toScr(v);if(!i){x.moveTo(s[0],s[1]);return}const pa=P.v[i-1],o=P.o[i-1],ii=P.i[i];const c1=toScr([pa[0]+o[0],pa[1]+o[1]]),c2=toScr([v[0]+ii[0],v[1]+ii[1]]);x.bezierCurveTo(c1[0],c1[1],c2[0],c2[1],s[0],s[1])});x.stroke();P.v.forEach((v,i)=>{const s=toScr(v);x.fillStyle=i===0?'#7c6cff':'#fff';x.fillRect(s[0]-4,s[1]-4,8,8)})}
  if(drag&&drag.k==='marq'){x.strokeStyle='#7c6cff';x.fillStyle='#7c6cff22';const p0=drag.s0,p1=drag.s1;x.fillRect(p0[0],p0[1],p1[0]-p0[0],p1[1]-p0[1]);x.strokeRect(p0[0],p0[1],p1[0]-p0[0],p1[1]-p0[1])}};
 const handles=c=>[c[0],[(c[0][0]+c[1][0])/2,(c[0][1]+c[1][1])/2],c[1],[(c[1][0]+c[2][0])/2,(c[1][1]+c[2][1])/2],c[2],[(c[2][0]+c[3][0])/2,(c[2][1]+c[3][1])/2],c[3],[(c[3][0]+c[0][0])/2,(c[3][1]+c[0][1])/2]];
 // bearbeitbare Pfade einer Ebene (Masken und Formpfade)
 const editables=(c,l)=>{const out=[];const ctx={comp:c,layer:l,t:M.ltime(l,E.time),ct:E.time};for(const ms of l.masks||[]){if(Panels.selMask&&Panels.selMask!==ms.id)continue;out.push({path:M.val(ms.path,{...ctx,key:ms.id}),prop:ms.path,color:'#ffd23f'})}
  if(l.shape)for(const it of l.shape.items||[]){if(it.type==='path')out.push({path:M.val(it.path,{...ctx,key:it.id}),prop:it.path,color:'#45b8c4'})}return out};
 // ---------- Maus ----------
 let drag=null,spaceDown=false;
 const pos=e=>{const r=ov.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]};
 const near=(a,b,d=7)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=d;
 const kSet=(l,p,v)=>{M.setVal(p,M.ltime(l,E.time),v)};
 const lctx=(c,l)=>({comp:c,layer:l,t:M.ltime(l,E.time),ct:E.time});
 const parentLin=(c,l)=>{if(!l.parent)return[1,0,0,1,0,0];const p=c.layers.find(q=>q.id===l.parent);return p?M.matrix(c,p,E.time):[1,0,0,1,0,0]};
 function down(e){const c=comp();if(!c)return;const s=pos(e);const pt=toComp(...s);$('#ctx').hidden=true;
  if(e.button===1||spaceDown||E.tool==='hand'){drag={k:'pan',s0:s,p0:[...V.pan]};ov.setPointerCapture(e.pointerId);return}
  if(e.button!==0)return;
  if(E.tool==='zoom'){V.zoomBy(e.altKey?.66:1.5,s[0],s[1]);return}
  if(E.tool==='text'){e.preventDefault();const hit=M.hit(c,E.time,...pt);if(hit&&hit.type==='text'){E.sel=new Set([hit.id]);V.editText(hit)}else{const l=App.newText(pt,'');V.editText(l,true)}return}
  if(E.tool==='pen'){penDown(pt,s,e);return}
  if(E.tool==='shape'){drag={k:'shape',a:pt,b:pt};ov.setPointerCapture(e.pointerId);return}
  const one=App.selLayers().length===1?App.sel1():null;
  // Pfadpunkte (Masken/Formpfade)
  if(one&&E.tool==='select'&&!one.locked){const m=M.matrix(c,one,E.time);for(const ed of editables(c,one)){const P=ed.path;for(let i=0;i<P.v.length;i++){for(const hk of['o','i']){const hv=P[hk][i];if(hv&&(hv[0]||hv[1])&&near(s,toScr(M.apply(m,[P.v[i][0]+hv[0],P.v[i][1]+hv[1]])),6)){App.begin();drag={k:'handle',l:one,ed,i,hk,mi:M.minv(m),p0:M.clone(P)};ov.setPointerCapture(e.pointerId);return}}
     if(near(s,toScr(M.apply(m,P.v[i])))){App.begin();drag={k:'vert',l:one,ed,i,mi:M.minv(m),p0:M.clone(P),s0:pt,alt:e.altKey};ov.setPointerCapture(e.pointerId);return}}}}
  // Griffe zum Skalieren / Ankerpunkt / Drehen
  if(one&&!one.locked&&(E.tool==='select'||E.tool==='rotate'||E.tool==='anchor')){const m=M.matrix(c,one,E.time),cx=lctx(c,one);const bd=M.bounds(c,one,E.time);const an=M.val(one.tr.anchor,cx);const anS=toScr(M.apply(m,an));
   if(E.tool==='anchor'||(E.tool==='select'&&near(s,anS,6)&&e.altKey)){App.begin();drag={k:'anchor',l:one,m0:m,a0:an,p0:M.val(one.tr.pos,cx),s0:pt,mi:M.minv(m)};ov.setPointerCapture(e.pointerId);return}
   if(E.tool==='rotate'){App.begin();drag={k:'rot',l:one,c0:anS,ang0:Math.atan2(s[1]-anS[1],s[0]-anS[0]),r0:M.val(one.tr.rot,cx)};ov.setPointerCapture(e.pointerId);return}
   const corners=[[bd[0],bd[1]],[bd[0]+bd[2],bd[1]],[bd[0]+bd[2],bd[1]+bd[3]],[bd[0],bd[1]+bd[3]]].map(p=>toScr(M.apply(m,p)));const hs=handles(corners);
   for(let i=0;i<8;i++)if(near(s,hs[i],6)){App.begin();const loc=[[bd[0],bd[1]],[bd[0]+bd[2]/2,bd[1]],[bd[0]+bd[2],bd[1]],[bd[0]+bd[2],bd[1]+bd[3]/2],[bd[0]+bd[2],bd[1]+bd[3]],[bd[0]+bd[2]/2,bd[1]+bd[3]],[bd[0],bd[1]+bd[3]],[bd[0],bd[1]+bd[3]/2]][i];
     drag={k:'scale',l:one,i,mi:M.minv(m),an,loc,s0:M.val(one.tr.scale,cx)};ov.setPointerCapture(e.pointerId);return}}
  // Ebenen auswählen und verschieben
  const hit=M.hit(c,E.time,...pt);
  if(hit){if(e.shiftKey||e.ctrlKey){if(E.sel.has(hit.id))E.sel.delete(hit.id);else E.sel.add(hit.id)}else if(!E.sel.has(hit.id))E.sel=new Set([hit.id]);E.selKeys.clear();App.redraw();
   const ls=App.selLayers().filter(l=>!l.locked);if(!ls.length)return;App.begin();drag={k:'move',s0:pt,ls:ls.map(l=>({l,p0:M.val(l.tr.pos,lctx(c,l)),pi:M.minv(parentLin(c,l))}))};ov.setPointerCapture(e.pointerId);return}
  if(!e.shiftKey){E.sel.clear();E.selKeys.clear();Panels.selMask=null}drag={k:'marq',s0:s,s1:s};ov.setPointerCapture(e.pointerId);App.redraw()}
 function move(e){if(!drag)return;const c=comp();const s=pos(e);const pt=toComp(...s);
  if(drag.k==='pan'){V.pan=[drag.p0[0]+s[0]-drag.s0[0],drag.p0[1]+s[1]-drag.s0[1]];App.redraw('view');return}
  if(drag.k==='marq'){drag.s1=s;const a=toComp(...drag.s0),b=pt;const x0=Math.min(a[0],b[0]),x1=Math.max(a[0],b[0]),y0=Math.min(a[1],b[1]),y1=Math.max(a[1],b[1]);
   for(const l of c.layers){if(l.locked||l.hidden||E.time<l.in||E.time>=l.out)continue;const m=M.matrix(c,l,E.time);const bd=M.bounds(c,l,E.time);const cc=M.apply(m,[bd[0]+bd[2]/2,bd[1]+bd[3]/2]);if(cc[0]>=x0&&cc[0]<=x1&&cc[1]>=y0&&cc[1]<=y1)E.sel.add(l.id)}App.redraw();return}
  if(drag.k==='shape'){drag.b=pt;if(e.shiftKey){const d=Math.max(Math.abs(pt[0]-drag.a[0]),Math.abs(pt[1]-drag.a[1]));drag.b=[drag.a[0]+Math.sign(pt[0]-drag.a[0]||1)*d,drag.a[1]+Math.sign(pt[1]-drag.a[1]||1)*d]}App.redraw('view');return}
  if(drag.k==='pen'){const P=V.penPath;const i=P.v.length-1;const d=[pt[0]-P.v[i][0],pt[1]-P.v[i][1]];if(Math.hypot(...d)*V.zoom>3){P.o[i]=d;P.i[i]=[-d[0],-d[1]]}App.redraw('view');return}
  if(drag.k==='move'){let d=[pt[0]-drag.s0[0],pt[1]-drag.s0[1]];if(e.shiftKey){if(Math.abs(d[0])>Math.abs(d[1]))d[1]=0;else d[0]=0}
   // Einrasten an der Mitte der Komposition
   for(const it of drag.ls){const li=[it.pi[0],it.pi[1],it.pi[2],it.pi[3],0,0];const dl=M.apply(li,d);let np=[it.p0[0]+dl[0],it.p0[1]+dl[1]];if(!it.l.parent&&!e.altKey){for(const ax of[0,1]){const ctr=ax?c.h/2:c.w/2;if(Math.abs(np[ax]-ctr)*V.zoom<6)np[ax]=ctr}}kSet(it.l,it.l.tr.pos,np)}App.redraw('view');Timeline.update();Panels.update();return}
  if(drag.k==='rot'){let a=(Math.atan2(s[1]-drag.c0[1],s[0]-drag.c0[0])-drag.ang0)*180/Math.PI;if(e.shiftKey)a=Math.round(a/45)*45;kSet(drag.l,drag.l.tr.rot,drag.r0+a);App.redraw('view');Timeline.update();Panels.update();return}
  if(drag.k==='scale'){const p=M.apply(drag.mi,pt);const i=drag.i;const ax=i%2===0?[1,1]:(i===1||i===5?[0,1]:[1,0]);let rx=(p[0]-drag.an[0])/((drag.loc[0]-drag.an[0])||1e-9),ry=(p[1]-drag.an[1])/((drag.loc[1]-drag.an[1])||1e-9);
   if(!ax[0])rx=1;if(!ax[1])ry=1;if(e.shiftKey&&ax[0]&&ax[1]){const k=Math.abs(rx)>Math.abs(ry)?rx:ry;rx=ry=k}kSet(drag.l,drag.l.tr.scale,[drag.s0[0]*rx,drag.s0[1]*ry]);App.redraw('view');Timeline.update();Panels.update();return}
  if(drag.k==='anchor'){const l=drag.l;const p=M.apply(drag.mi,pt),p0=M.apply(drag.mi,drag.s0);const dl=[p[0]-p0[0],p[1]-p0[1]];const na=[drag.a0[0]+dl[0],drag.a0[1]+dl[1]];
   const pm=parentLin(c,l);const lin=M.mmul(M.minv([pm[0],pm[1],pm[2],pm[3],0,0]),[drag.m0[0],drag.m0[1],drag.m0[2],drag.m0[3],0,0]);const dp=M.apply(lin,dl);kSet(l,l.tr.anchor,na);kSet(l,l.tr.pos,[drag.p0[0]+dp[0],drag.p0[1]+dp[1]]);App.redraw('view');Timeline.update();Panels.update();return}
  if(drag.k==='vert'||drag.k==='handle'){const l=drag.l;const p=M.apply(drag.mi,pt);const P=M.clone(drag.p0);if(drag.k==='vert'){P.v[drag.i]=p}else{const v=P.v[drag.i];const h=[p[0]-v[0],p[1]-v[1]];P[drag.hk][drag.i]=h;if(!e.altKey){const other=drag.hk==='o'?'i':'o';P[other][drag.i]=[-h[0],-h[1]]}}
   M.setVal(drag.ed.prop,M.ltime(l,E.time),P);App.redraw('view');return}}
 function up(e){if(!drag)return;const d=drag;drag=null;const c=comp();
  if(d.k==='shape'){const a=d.a,b=d.b;if(Math.abs(b[0]-a[0])<3&&Math.abs(b[1]-a[1])<3){App.redraw('view');return}const x0=Math.min(a[0],b[0]),y0=Math.min(a[1],b[1]),w=Math.abs(b[0]-a[0]),h=Math.abs(b[1]-a[1]);
   const l=App.sel1();if(E.toolMode==='mask'&&l)addMask(l,[x0,y0],[x0+w,y0+h]);else makeShape([x0,y0],[x0+w,y0+h]);return}
  if(d.k==='pen'){App.redraw('view');return}
  if(d.k==='marq'||d.k==='pan'){App.redraw();return}
  App.commit()}
 // Form aus Rechteck erstellen
 const makeShape=(a,b)=>{const c=comp();const w=b[0]-a[0],h=b[1]-a[1];const ctr=[a[0]+w/2,a[1]+h/2];const st=E.shapeTool;let it;
  if(st==='rect')it=M.newItem('rect',{size:[w,h]});else if(st==='rrect')it=M.newItem('rect',{size:[w,h],round:Math.min(w,h)*.18});else if(st==='ellipse')it=M.newItem('ellipse',{size:[w,h]});else it=M.newItem(st,{or:Math.max(w,h)/2,ir:Math.max(w,h)/4.5});
  const l=M.newLayer('shape',c,{name:t({rect:'Rechteck',rrect:'Rechteck',ellipse:'Ellipse',star:'Stern',polygon:'Polygon'}[st]),items:[it],fill:E.newFill,stroke:E.newStrokeOn,strokeColor:E.newStroke,strokeW:E.newStrokeW||8});l.tr.pos.v=ctr;App.addLayer(l);V.setTool('select')};
 const addMask=(l,a,b,full)=>{const c=comp();const mi=M.minv(M.matrix(c,l,E.time));let path;const st=E.shapeTool;
  if(full){const bd=M.bounds(c,l,E.time);path=M.rectPath(bd[0],bd[1],bd[2],bd[3])}else{const corners=[a,[b[0],a[1]],b,[a[0],b[1]]].map(p=>M.apply(mi,p));
   if(st==='ellipse'){const cx=(corners[0][0]+corners[2][0])/2,cy=(corners[0][1]+corners[2][1])/2;path=M.ellipsePath(cx,cy,Math.abs(corners[2][0]-corners[0][0])/2,Math.abs(corners[2][1]-corners[0][1])/2)}else path={c:true,v:corners,i:corners.map(()=>[0,0]),o:corners.map(()=>[0,0])}}
  App.change(()=>{l.masks.push(M.newMask(path,{name:t('Maske')+' '+(l.masks.length+1)}));l.open=true})};
 // Zeichenstift
 const penDown=(pt,s,e)=>{if(!V.penPath){V.penPath={c:false,v:[pt],i:[[0,0]],o:[[0,0]]}}else{const P=V.penPath;if(P.v.length>2&&near(s,toScr(P.v[0]),8)){P.c=true;finishPen();return}P.v.push(pt);P.i.push([0,0]);P.o.push([0,0])}drag={k:'pen'};ov.setPointerCapture(e.pointerId);App.redraw('view')};
 const finishPen=()=>{const P=V.penPath;V.penPath=null;if(!P||P.v.length<2){App.redraw('view');return}const c=comp();const l=App.sel1();
  if(E.toolMode==='mask'&&l){const mi=M.minv(M.matrix(c,l,E.time));const lin=[mi[0],mi[1],mi[2],mi[3],0,0];const path={c:true,v:P.v.map(v=>M.apply(mi,v)),i:P.i.map(v=>M.apply(lin,v)),o:P.o.map(v=>M.apply(lin,v))};App.change(()=>{l.masks.push(M.newMask(path,{name:t('Maske')+' '+(l.masks.length+1)}));l.open=true});return}
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const v of P.v){x0=Math.min(x0,v[0]);x1=Math.max(x1,v[0]);y0=Math.min(y0,v[1]);y1=Math.max(y1,v[1])}const ctr=[(x0+x1)/2,(y0+y1)/2];
  const path={c:P.c,v:P.v.map(v=>[v[0]-ctr[0],v[1]-ctr[1]]),i:P.i,o:P.o};const l2=M.newLayer('shape',c,{name:t('Pfad'),items:[M.newItem('path',{path})],fill:E.newFill,stroke:!P.c||E.newStrokeOn,strokeColor:E.newStroke,strokeW:E.newStrokeW||8});if(!P.c)l2.shape.fill.on=false;l2.tr.pos.v=ctr;App.addLayer(l2)};
 // ---------- Text direkt bearbeiten ----------
 let editing=null;
 V.editText=(l,fresh)=>{const c=comp();const ta=$('#tedit');editing=l;App.begin();ta.hidden=false;ta.value=l.text.str;let typed=false;place();ta.focus();ta.select();setTimeout(()=>{if(editing===l){ta.focus();if(!fresh)ta.select()}},30);if(fresh)ta.value='';
  function place(){const m=M.matrix(c,l,E.time);const lay=M.textLayout(c,l,E.time);const p=toScr(M.apply(m,[lay.x0,lay.y0]));const sc=Math.hypot(m[0],m[1])*V.zoom;ta.style.left=p[0]+'px';ta.style.top=p[1]+'px';ta.style.minWidth=Math.max(80,(lay.x1-lay.x0)*sc+20)+'px';ta.style.fontSize=Math.max(10,lay.size*sc)+'px';ta.style.lineHeight=lay.lead*sc+'px';ta.style.height=Math.max(1,lay.lines)*lay.lead*sc+lay.size*sc*.3+'px';ta.style.color='transparent';ta.style.caretColor='#fff'}
  ta.oninput=()=>{typed=true;l.text.str=ta.value;if(!l._named){l.name=ta.value.split('\n')[0].slice(0,30)||t('Text')}App.redraw('view');place()};
  ta.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape'||(e.key==='Enter'&&e.ctrlKey)){ta.blur()}};
  ta.onblur=()=>{ta.hidden=true;editing=null;if(!l.text.str.trim()||(fresh&&!typed)){const cc=comp();cc.layers=cc.layers.filter(x=>x!==l);E.sel.delete(l.id)}App.commit();V.setTool('select')}};
 // ---------- Start ----------
 function init(){cv=$('#cv');ov=$('#ov');stage=$('#stage');renderTools();cursor();
  ov.addEventListener('pointerdown',down);ov.addEventListener('pointermove',move);ov.addEventListener('pointerup',up);ov.addEventListener('pointercancel',up);
  ov.addEventListener('dblclick',e=>{const c=comp();if(!c)return;const pt=toComp(...pos(e));const hit=M.hit(c,E.time,...pt);if(hit&&hit.type==='text'){E.sel=new Set([hit.id]);V.editText(hit)}else if(hit&&hit.type==='comp'){Panels.openComp(hit.comp)}});
  ov.addEventListener('wheel',e=>{e.preventDefault();const s=pos(e);if(e.ctrlKey||e.metaKey||!e.shiftKey)V.zoomBy(e.deltaY<0?1.12:1/1.12,s[0],s[1]);else{V.pan[0]-=e.deltaY;App.redraw('view')}},{passive:false});
  ov.addEventListener('dragover',e=>e.preventDefault());ov.addEventListener('drop',e=>{e.preventDefault();const d=e.dataTransfer.getData('text/motion');if(d)Panels.dropItem(JSON.parse(d),toComp(...pos(e)))});
  new ResizeObserver(()=>App.redraw('view')).observe(stage);
  addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&document.activeElement===document.body){spaceDown=true}if(e.key==='Enter'&&V.penPath&&!$('#editor').hidden){finishPen()}if(e.key==='Escape'&&V.penPath){V.penPath=null;App.redraw('view')}});
  addEventListener('keyup',e=>{if(e.code==='Space')spaceDown=false});
  $('#vzoom').addEventListener('change',e=>{const v=e.target.value;if(v==='fit')V.fit();else V.setZoom(+v)});$('#vq').addEventListener('change',()=>App.redraw('view'));
  $('#vtime').addEventListener('change',e=>{const c=comp();const s=parseT(e.target.value,c.fps);if(s!=null)App.setTime(s)})}
 V.init=init;
 return V})();
