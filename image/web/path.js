// Pfade (Bézier): setzen, bearbeiten, zu Auswahl, nachziehen, füllen, Text entlang Pfad.
// Gespeichert in Doc.d.extra.paths = [{name, closed, pts:[[x,y, inX,inY, outX,outY]]}] (Bildkoordinaten).
const Paths=(()=>{const P={};const {$,esc}=Kit;const t=s=>Kit.t(s);
 P.cur=-1;
 P.list=()=>{const d=Doc.d;if(!d)return[];d.extra=d.extra||{};return d.extra.paths||(d.extra.paths=[])};
 P.active=()=>P.list()[P.cur]||null;
 // Path2D in Bildkoordinaten
 P.path2d=p=>{const g=new Path2D();const a=p.pts;if(!a.length)return g;g.moveTo(a[0][0],a[0][1]);
  for(let i=1;i<a.length;i++){const q=a[i-1],r=a[i];g.bezierCurveTo(q[4],q[5],r[2],r[3],r[0],r[1])}
  if(p.closed&&a.length>1){const q=a[a.length-1],r=a[0];g.bezierCurveTo(q[4],q[5],r[2],r[3],r[0],r[1]);g.closePath()}return g};
 // Pfad in eine Punktliste mit Längen zerlegen (für Text entlang Pfad)
 P.flatten=p=>{const out=[];const a=p.pts;const seg=(q,r)=>{for(let k=0;k<=32;k++){const s=k/32,u=1-s;const x=u*u*u*q[0]+3*u*u*s*q[4]+3*u*s*s*r[2]+s*s*s*r[0],y=u*u*u*q[1]+3*u*u*s*q[5]+3*u*s*s*r[3]+s*s*s*r[1];if(k||!out.length)out.push([x,y])}};
  for(let i=1;i<a.length;i++)seg(a[i-1],a[i]);if(p.closed&&a.length>1)seg(a[a.length-1],a[0]);let L=0;const res=[];out.forEach((pt,i)=>{if(i)L+=Math.hypot(pt[0]-out[i-1][0],pt[1]-out[i-1][1]);res.push([...pt,L])});return res};
 const at=(F,s)=>{let i=1;while(i<F.length-1&&F[i][2]<s)i++;const a=F[i-1],b=F[i];const k=(s-a[2])/Math.max(1e-6,b[2]-a[2]);return[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,Math.atan2(b[1]-a[1],b[0]-a[0])]};
 const changed=()=>{Doc.mark(true);View.draw();if(Tools.tool==='path')Tools.opts()};
 // ---- Befehle ----
 P.toSel=mode=>{const p=P.active();if(!p||p.pts.length<2)return Kit.toast(t('Es gibt keinen Pfad.'));const d=Doc.d,m=Doc.mk(d.w,d.h),c=m.getContext('2d');c.fillStyle='#fff';c.fill(P.path2d({...p,closed:true}));Doc._label='Pfad zu Auswahl';Sel.combine(m,mode||'replace')};
 const pixTarget=()=>{let L=Doc.layer();if(!L||L.type!=='pixel'){Doc.addEmpty();UI.layers();L=Doc.layer()}return L};
 P.stroke=()=>{const p=P.active();if(!p||p.pts.length<2)return Kit.toast(t('Es gibt keinen Pfad.'));Doc._label='Pfad nachziehen';const L=pixTarget();Doc.begin();
  const cv=Doc.clone(L.cv),c=cv.getContext('2d');c.setTransform(Doc.pixMatrix(L).inverse());c.strokeStyle=Tools.color;c.lineWidth=Tools.o.brush.size;c.lineCap='round';c.lineJoin='round';c.stroke(P.path2d(p));L.cv=Sel.merge(L,L.cv,cv);Doc.changed('canvas');UI.thumbs()};
 P.fill=()=>{const p=P.active();if(!p||p.pts.length<3)return Kit.toast(t('Es gibt keinen Pfad.'));Doc._label='Pfad füllen';const L=pixTarget();Doc.begin();
  const cv=Doc.clone(L.cv),c=cv.getContext('2d');c.setTransform(Doc.pixMatrix(L).inverse());c.fillStyle=Tools.color;c.fill(P.path2d({...p,closed:true}));L.cv=Sel.merge(L,L.cv,cv);Doc.changed('canvas');UI.thumbs()};
 P.del=()=>{const a=P.list();if(P.cur<0||!a[P.cur])return;a.splice(P.cur,1);P.cur=a.length-1;changed()};
 P.fromSel=()=>Kit.toast(t('Diese Richtung ist noch nicht möglich.'));
 // Text entlang Pfad: eigene Bild-Ebene, mit Vorschau
 P.textDlg=()=>{const p=P.active();if(!p||p.pts.length<2)return Kit.toast(t('Zeichne zuerst einen Pfad mit dem Pfad-Werkzeug.'));
  const o={text:t('Dein Text entlang des Pfads'),font:'Arial Black',size:Math.round(Math.max(18,Math.min(Doc.d.w,Doc.d.h)/14)),color:'#ffffff',stroke:'#000000',sw:4,off:0,ls:0,side:'top'};
  Doc._label='Text entlang Pfad';Doc.addPixel(Doc.mk(Doc.d.w,Doc.d.h),t('Text entlang Pfad'),{x:0,y:0,w:Doc.d.w,h:Doc.d.h});const L=Doc.layer();
  const F=P.flatten(p),total=F[F.length-1][2];
  const draw=()=>{const cv=Doc.mk(Doc.d.w,Doc.d.h),c=cv.getContext('2d');c.font=`${o.size}px "${o.font}", sans-serif`;c.textBaseline=o.side==='top'?'alphabetic':o.side==='mid'?'middle':'top';c.lineJoin='round';
   const chars=[...o.text];const ws=chars.map(ch=>c.measureText(ch).width+o.ls);let s=o.off/100*total;
   for(let i=0;i<chars.length;i++){const w=ws[i];if(s+w/2>total&&!p.closed)break;const [x,y,a]=at(F,(s+w/2)%Math.max(1,total));c.save();c.translate(x,y);c.rotate(a);
    if(o.sw>0){c.strokeStyle=o.stroke;c.lineWidth=o.sw*2;c.strokeText(chars[i],-w/2+o.ls/2,0)}c.fillStyle=o.color;c.fillText(chars[i],-w/2+o.ls/2,0);c.restore();s+=w}
   L.cv=cv;Doc.need=true;View.draw()};
  const fonts=[...new Set([o.font,...Doc.FONTS])];
  UI.modal(`<div class="mhead"><h3>${esc(t('Text entlang Pfad'))}</h3></div><div class="mbody"><textarea data-tp="text" rows="2">${esc(o.text)}</textarea>
   <div class="row" style="margin-top:8px"><span>${esc(t('Schrift'))}</span><select data-tp="font">${fonts.map(f=>`<option${f===o.font?' selected':''}>${esc(f)}</option>`).join('')}</select></div>
   <div class="row"><span>${esc(t('Größe'))}</span><input type="range" min="6" max="400" value="${o.size}" data-tp="size"></div>
   <div class="row"><span>${esc(t('Farbe'))}</span><input type="color" value="${o.color}" data-tp="color"><span style="width:auto;margin-left:10px">${esc(t('Kontur'))}</span><input type="color" value="${o.stroke}" data-tp="stroke"><input type="range" min="0" max="30" value="${o.sw}" data-tp="sw"></div>
   <div class="row"><span>${esc(t('Startpunkt'))}</span><input type="range" min="0" max="100" value="0" data-tp="off"></div>
   <div class="row"><span>${esc(t('Abstand'))}</span><input type="range" min="-20" max="80" value="0" data-tp="ls"></div>
   <div class="row"><span>${esc(t('Lage'))}</span><div class="seg" style="flex:1">${[['top','Über dem Pfad'],['mid','Mittig'],['bot','Unter dem Pfad']].map(([k,n])=>`<button data-tside="${k}" class="${o.side===k?'on':''}">${esc(t(n))}</button>`).join('')}</div></div>
   </div><div class="mfoot"><button class="btn" data-tpc>${esc(t('Abbrechen'))}</button><button class="btn primary" data-tpok>${esc(t('OK'))}</button></div>`);
  UI.locked=true;$('#modal').classList.add('peek');$('#mbox').style.width='min(440px,94vw)';draw();
  const mb=$('#mbox');mb.oninput=e=>{const k=e.target.dataset.tp;if(!k)return;o[k]=e.target.type==='range'?+e.target.value:e.target.value;draw()};
  mb.addEventListener('keydown',e=>e.stopPropagation());
  mb.onclick=e=>{const b=e.target.closest('[data-tside]');if(b){o.side=b.dataset.tside;mb.querySelectorAll('[data-tside]').forEach(x=>x.classList.toggle('on',x===b));draw();return}
   const fin=ok=>{$('#modal').classList.remove('peek');$('#mbox').style.width='';UI.close();if(ok){L.name=o.text.slice(0,32);Doc.changed('layers')}else{Doc.doUndo();Doc.redo.pop();UI.side()}};
   if(e.target.closest('[data-tpok]'))fin(true);if(e.target.closest('[data-tpc]'))fin(false)}};
 // ---- Werkzeug ----
 let drag=null;
 const hitPt=(s)=>{const p=P.active();if(!p)return null;for(let i=0;i<p.pts.length;i++){const q=p.pts[i];for(const [k,ix,iy] of[['a',0,1],['in',2,3],['out',4,5]]){const [sx,sy]=View.toScr(q[ix],q[iy]);if(Math.hypot(sx-s[0],sy-s[1])<7)return{i,k}}}return null};
 Tools.ext('path','Pfade (Bézier)','P','<path d="M4 20C4 10 20 14 20 4"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="4" r="2"/><path d="M4 20l6-10M20 4l-6 10" opacity=".5"/>',{
  down(s,x,y,e){const a=P.list();let p=P.active();const h=hitPt(s);
   if(h&&!e.shiftKey){if(h.k==='a'&&h.i===0&&!p.closed&&p.pts.length>2&&!e.altKey){p.closed=true;changed();return false}
    if(h.k==='a'&&e.ctrlKey){p.pts.splice(h.i,1);if(!p.pts.length){a.splice(P.cur,1);P.cur=a.length-1}changed();return false}
    drag={h,x0:x,y0:y,q0:[...p.pts[h.i]]};return}
   if(!p||p.closed||e.shiftKey){p={name:t('Pfad')+' '+(a.length+1),closed:false,pts:[]};a.push(p);P.cur=a.length-1}
   p.pts.push([x,y,x,y,x,y]);drag={add:p.pts.length-1,x0:x,y0:y};changed()},
  move(s,x,y,e){if(!drag)return;const p=P.active();if(!p)return;
   if(drag.add!=null){const q=p.pts[drag.add];q[4]=x;q[5]=y;q[2]=2*q[0]-x;q[3]=2*q[1]-y;View.draw();return}
   const q=p.pts[drag.h.i],q0=drag.q0,dx=x-drag.x0,dy=y-drag.y0;
   if(drag.h.k==='a'){for(let k=0;k<6;k+=2){q[k]=q0[k]+dx;q[k+1]=q0[k+1]+dy}}
   else{const [ix,iy,ox,oy]=drag.h.k==='in'?[2,3,4,5]:[4,5,2,3];q[ix]=q0[ix]+dx;q[iy]=q0[iy]+dy;if(!e.altKey){q[ox]=2*q[0]-q[ix];q[oy]=2*q[1]-q[iy]}}
   View.draw()},
  up(){drag=null;changed()},
  overlay(c,active){const a=P.list();if(!a.length||(!active&&!UI.showPaths))return;c.save();
   a.forEach((p,pi)=>{const on=pi===P.cur&&active;c.save();const z=View.z;c.translate(View.ox,View.oy);c.scale(z,z);c.lineWidth=(on?1.6:1)/z;c.strokeStyle=on?'#ff3fb4':'#ff3fb488';c.stroke(P.path2d(p));c.restore();
    if(!on)return;p.pts.forEach((q,i)=>{const [ax,ay]=View.toScr(q[0],q[1]);for(const [hx,hy] of[[q[2],q[3]],[q[4],q[5]]]){if(hx===q[0]&&hy===q[1])continue;const [sx,sy]=View.toScr(hx,hy);c.strokeStyle='#ff3fb4aa';c.lineWidth=1;c.beginPath();c.moveTo(ax,ay);c.lineTo(sx,sy);c.stroke();c.beginPath();c.arc(sx,sy,3.5,0,7);c.fillStyle='#ff3fb4';c.fill()}
     c.beginPath();c.rect(ax-4,ay-4,8,8);c.fillStyle=i===0?'#ff3fb4':'#fff';c.fill();c.strokeStyle='#ff3fb4';c.stroke()})});c.restore()},
  opts(){const a=P.list();return`<div class="olab">${esc(t('Pfade'))}</div><div class="plist">${a.map((p,i)=>`<button data-pcur="${i}" class="${i===P.cur?'on':''}">${esc(p.name)}${p.closed?' ◯':''}</button>`).join('')||`<span class="hint2">${esc(t('Noch kein Pfad.'))}</span>`}</div>
   <div class="btns"><button class="btn sm" data-pa="new">${esc(t('Neuer Pfad'))}</button><button class="btn sm" data-pa="del">${esc(t('Löschen'))}</button></div>
   <div class="btns"><button class="btn sm" data-pa="sel">${esc(t('Zu Auswahl'))}</button><button class="btn sm" data-pa="stroke">${esc(t('Nachziehen'))}</button><button class="btn sm" data-pa="fill">${esc(t('Füllen'))}</button></div>
   <div class="btns"><button class="btn sm" data-pa="text">${esc(t('Text entlang Pfad …'))}</button></div>
   <p class="hint2">${esc(t('Klicken setzt Punkte, ziehen formt Kurven. Klick auf den ersten Punkt schließt den Pfad. Alt+Ziehen am Griff = Ecke, Strg+Klick auf Punkt = löschen, Umschalt = neuer Pfad. Nachziehen nutzt Farbe und Größe des Pinsels.'))}</p>`},
  cursor:'crosshair'},'lasso');
 for(const o of['#opts','#topts'])document.querySelector(o).addEventListener('click',e=>{let b;if(b=e.target.closest('[data-pcur]')){P.cur=+b.dataset.pcur;Tools.opts();View.draw();return}
  if(b=e.target.closest('[data-pa]')){const a=b.dataset.pa;if(a==='new'){P.cur=-1;Kit.toast(t('Klicke ins Bild, um den neuen Pfad zu beginnen.'))}else if(a==='del')P.del();else if(a==='sel')P.toSel();else if(a==='stroke')P.stroke();else if(a==='fill')P.fill();else if(a==='text')P.textDlg();Tools.opts()}});
 return P})();
