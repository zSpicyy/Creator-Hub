// Weitere Werkzeuge aus GIMP: Nach Farbe auswählen, Intelligente Schere, Tinte, Verformen (Warp), Drehen, Skalieren,
// Spiegeln, Ausrichten, Maßband. Gleiche Tasten wie in GIMP (Umschalt/Strg für Auswahl-Modi, Strg = 15°-Schritte usw.).
(()=>{const {esc}=Kit;const t=s=>Kit.t(s);const T=Tools;
 const hint=s=>`<p class="hint2">${esc(t(s))}</p>`;
 const smode=e=>e.shiftKey&&(e.ctrlKey||e.metaKey)?'int':e.shiftKey?'add':(e.ctrlKey||e.metaKey)?'sub':T.o.sel.mode;
 const slider=(o,key,lab,min,max,unit='',step=1)=>`<label class="o"><span>${esc(t(lab))}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${o[key]}" data-t2="${key}"><b>${o[key]}${unit}</b></label>`;
 const segs=(o,key,opts,id)=>`<div class="seg">${opts.map(([v,n])=>`<button data-t2s="${id}.${key}" data-v="${v}" class="${o[key]===v?'on':''}">${esc(t(n))}</button>`).join('')}</div>`;
 const O={ink:{size:12,angle:30,speed:60,shape:'ellipse'},warp:{mode:'move',size:80,strength:50},rotate:{},scale:{},flip:{dir:'h'},align:{rel:'image'},measure:{unit:'px',ref:'h'},scissors:{},bycolor:{}};
 T.o2=O;
 // Einstellungen der neuen Werkzeuge verdrahten (eigene Felder, damit sie T.o nicht stören)
 document.addEventListener('input',e=>{const el=e.target;if(!el.dataset||!el.dataset.t2)return;const o=O[T.tool];if(!o)return;o[el.dataset.t2]=+el.value;const b=el.parentElement.querySelector('b');if(b)b.textContent=el.value+(b.textContent.replace(/^[\d.-]+/,''))});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-t2s]');if(b){const [id,key]=b.dataset.t2s.split('.');O[id][key]=b.dataset.v;T.opts();return}const a=e.target.closest('[data-t2a]');if(a)ACT[a.dataset.t2a]&&ACT[a.dataset.t2a]()});
 const ACT={};
 const active=()=>{const L=Doc.layer();return L&&!L.locked?L:null};
 const toPix=L=>{if(L.type==='pixel')return L;Doc.begin();const n=Doc.rasterize(L);UI.layers();return n};

 // ---------- Nach Farbe auswählen ----------
 T.ext('bycolor','Nach Farbe auswählen','Umschalt+O','<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M13 7h5v4M11 17H6v-4" stroke-dasharray="2 2"/>',{
  down:(s,x,y,e)=>{Doc._label=t('Nach Farbe auswählen');Sel.wand(x,y,T.o.sel.tol,smode(e),true);return false},
  opts:()=>`<h4>${esc(t('Nach Farbe auswählen'))}</h4><label class="o"><span>${esc(t('Schwelle'))}</span><input type="range" min="0" max="255" value="${T.o.sel.tol}" data-o="sel.tol"><b data-ov="sel.tol">${T.o.sel.tol}</b></label>`+hint('Wählt alle Stellen mit ähnlicher Farbe im ganzen Bild aus, auch wenn sie nicht zusammenhängen. Umschalt = hinzufügen, Strg = abziehen, beides = Schnittmenge.')},'wand');

 // ---------- Intelligente Schere ----------
 let sc=null;// {pts:[[x,y]], segs:[[[x,y]...]], gray, W, H}
 const scGray=()=>{const o=Doc.need?Doc.render():Doc.out;const W=o.width,H=o.height,d=o.getContext('2d').getImageData(0,0,W,H).data;const g=new Float32Array(W*H);for(let i=0;i<W*H;i++)g[i]=d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11;
  const cost=new Float32Array(W*H);for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;const gx=g[i+1]-g[i-1],gy=g[i+W]-g[i-W];cost[i]=1/(1+Math.hypot(gx,gy)/8)}return{W,H,cost}};
 // kürzester Weg entlang starker Kanten (Dijkstra in einem Fenster um beide Punkte)
 const liveWire=(a,b)=>{const {W,H,cost}=sc.g;const pad=40;const x0=Math.max(0,Math.floor(Math.min(a[0],b[0])-pad)),y0=Math.max(0,Math.floor(Math.min(a[1],b[1])-pad)),x1=Math.min(W-1,Math.ceil(Math.max(a[0],b[0])+pad)),y1=Math.min(H-1,Math.ceil(Math.max(a[1],b[1])+pad));
  const w=x1-x0+1,h=y1-y0+1;if(w*h>1.2e6)return[a,b];const dist=new Float32Array(w*h).fill(Infinity),prev=new Int32Array(w*h).fill(-1);const s0=(Math.round(a[1])-y0)*w+(Math.round(a[0])-x0),e0=(Math.round(b[1])-y0)*w+(Math.round(b[0])-x0);
  const heap=[];const push=(d,i)=>{heap.push([d,i]);let k=heap.length-1;while(k){const p=(k-1)>>1;if(heap[p][0]<=heap[k][0])break;[heap[p],heap[k]]=[heap[k],heap[p]];k=p}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let k=0;for(;;){const l=2*k+1,r=l+1;let m=k;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===k)break;[heap[m],heap[k]]=[heap[k],heap[m]];k=m}}return top};
  dist[s0]=0;push(0,s0);const N=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.41],[-1,1,1.41],[1,-1,1.41],[-1,-1,1.41]];
  while(heap.length){const [d,i]=pop();if(i===e0)break;if(d>dist[i])continue;const x=i%w,y=(i/w)|0;for(const [dx,dy,f] of N){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const j=ny*w+nx;const nd=d+f*(.05+cost[(ny+y0)*W+nx+x0]);if(nd<dist[j]){dist[j]=nd;prev[j]=i;push(nd,j)}}}
  const path=[];let i=e0;let guard=0;while(i>=0&&guard++<w*h){path.push([(i%w)+x0+.5,((i/w)|0)+y0+.5]);if(i===s0)break;i=prev[i]}return path.reverse()};
 const scFinish=()=>{if(!sc||sc.pts.length<3){sc=null;View.draw();return}const pts=sc.segs.flat();if(sc.pts.length>1)pts.push(...liveWire(sc.pts[sc.pts.length-1],sc.pts[0]));Doc._label=t('Intelligente Schere');Sel.combine(T.feath(Sel.shape('poly',{pts})),sc.mode);sc=null;View.draw()};
 T.ext('scissors','Intelligente Schere','I','<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6 20 18M8.6 16.4 20 6"/>',{
  down:(s,x,y,e)=>{if(!sc)sc={pts:[],segs:[],g:scGray(),mode:smode(e)};const p0=sc.pts[0];if(p0&&sc.pts.length>2&&Math.hypot((x-p0[0])*View.z,(y-p0[1])*View.z)<9){scFinish();return false}
   if(sc.pts.length)sc.segs.push(liveWire(sc.pts[sc.pts.length-1],[x,y]));sc.pts.push([x,y]);View.draw();return false},
  key:k=>{if(!sc)return false;if(k==='Enter'||k==='confirm'){scFinish();return true}if(k==='cancel'||k==='Escape'){sc=null;View.draw();return true}if(k==='Backspace'){sc.pts.pop();sc.segs.pop();if(!sc.pts.length)sc=null;View.draw();return true}return false},
  leave:()=>{sc=null},
  overlay:(c,act)=>{if(!act||!sc)return;c.save();c.lineWidth=2;c.strokeStyle='#ffd400';c.beginPath();for(const sg of sc.segs)sg.forEach(([x,y],i)=>{const [a,b]=View.toScr(x,y);i?c.lineTo(a,b):c.moveTo(a,b)});c.stroke();c.fillStyle='#fff';c.strokeStyle='#000';c.lineWidth=1;for(const [x,y] of sc.pts){const [a,b]=View.toScr(x,y);c.beginPath();c.arc(a,b,4,0,7);c.fill();c.stroke()}c.restore()},
  opts:()=>`<h4>${esc(t('Intelligente Schere'))}</h4>`+T.selModesHTML()+hint('Setze Punkte entlang des Motivs, die Linie folgt automatisch den Kanten. Schließen: ersten Punkt anklicken oder Enter. Rücktaste = letzter Punkt weg, Esc = abbrechen.')},'bycolor');
 addEventListener('keydown',e=>{if(T.tool!=='scissors'||!sc||e.target.matches('input,textarea,select'))return;if(T.EXT.scissors.key(e.key)){e.preventDefault();e.stopImmediatePropagation()}},true);

 // ---------- Tinte (Kalligrafie) ----------
 let ink=null;
 T.ext('ink','Tinte','K','<path d="M12 2 8 10l4 12 4-12z"/><path d="M12 10v6"/>',{
  down:(s,x,y,e)=>{if(e.ctrlKey||e.metaKey){T.sample(x,y,e);return false}let L=Doc.layer();if(!L){Doc.addEmpty();L=Doc.layer()}else L=toPix(L);Doc._label=t('Tinte');Doc.begin();const inv=Doc.pixMatrix(L).inverse();const p=inv.transformPoint(new DOMPoint(x,y));
   ink={L,inv,cv:Doc.clone(L.cv),last:[p.x,p.y],lt:performance.now(),lw:O.ink.size};L.cv=ink.cv;dab(p.x,p.y,O.ink.size);Doc.need=true;View.draw()},
  move:(s,x,y)=>{if(!ink)return;const p=ink.inv.transformPoint(new DOMPoint(x,y));const now=performance.now();const dist=Math.hypot(p.x-ink.last[0],p.y-ink.last[1]);const v=dist/Math.max(1,now-ink.lt);
   // schneller = dünner (wie GIMP-Tinte mit Geschwindigkeit)
   const w=Math.max(1,O.ink.size*(1-Math.min(.8,v*O.ink.speed/100)));const steps=Math.max(1,Math.ceil(dist/1.5));for(let i=1;i<=steps;i++){const k=i/steps;dab(ink.last[0]+(p.x-ink.last[0])*k,ink.last[1]+(p.y-ink.last[1])*k,ink.lw+(w-ink.lw)*k)}ink.last=[p.x,p.y];ink.lt=now;ink.lw=w;Doc.need=true;View.draw()},
  up:()=>{if(ink){ink.L.rev=(ink.L.rev||0)+1;ink=null;Doc.changed('canvas');UI.thumbs()}},
  opts:()=>`<h4>${esc(t('Tinte'))}</h4>`+slider(O.ink,'size','Größe',1,100,' px')+slider(O.ink,'angle','Winkel',-90,90,'°')+slider(O.ink,'speed','Empfindlichkeit (Tempo)',0,100,' %')+`<div class="olab">${esc(t('Spitze'))}</div>`+segs(O.ink,'shape',[['ellipse','Rund'],['square','Eckig'],['diamond','Raute']],'ink')+hint('Schreibt wie eine Füllfeder: Die Breite hängt von Richtung und Tempo ab. Strg+Klick nimmt eine Farbe auf.')},'airbrush');
 function dab(x,y,w){const c=ink.cv.getContext('2d');c.save();c.translate(x,y);c.rotate(O.ink.angle*Math.PI/180);c.fillStyle=T.color;c.beginPath();const a=w/2,b=Math.max(.6,w/7);
  if(O.ink.shape==='square')c.rect(-a,-b,a*2,b*2);else if(O.ink.shape==='diamond'){c.moveTo(-a,0);c.lineTo(0,-b*1.6);c.lineTo(a,0);c.lineTo(0,b*1.6);c.closePath()}else c.ellipse(0,0,a,b,0,0,Math.PI*2);c.fill();c.restore()}

 // ---------- Verformen (Warp Transform / Verflüssigen) ----------
 let wp=null;
 T.ext('warp','Verformen (Warp)','W','<path d="M3 12c3-6 6 6 9 0s6 6 9 0"/><path d="M3 6c3-3 6 3 9 0s6 3 9 0M3 18c3-3 6 3 9 0s6 3 9 0" opacity=".5"/>',{
  down:(s,x,y)=>{let L=active();if(!L)return Kit.toast(t('Wähle zuerst eine Ebene aus.')),false;L=toPix(L);Doc._label=t('Verformen');Doc.begin();const inv=Doc.pixMatrix(L).inverse();const p=inv.transformPoint(new DOMPoint(x,y));wp={L,inv,cv:Doc.clone(L.cv),last:[p.x,p.y]};L.cv=wp.cv;if(O.warp.mode!=='move')warpDab(p.x,p.y,0,0);
   if(O.warp.mode!=='move')wp.timer=setInterval(()=>{if(wp){warpDab(wp.last[0],wp.last[1],0,0);Doc.need=true;View.draw()}},50)},
  move:(s,x,y)=>{if(!wp)return;const p=wp.inv.transformPoint(new DOMPoint(x,y));const dx=p.x-wp.last[0],dy=p.y-wp.last[1];if(Math.hypot(dx,dy)<1)return;warpDab(wp.last[0],wp.last[1],dx,dy);wp.last=[p.x,p.y];Doc.need=true;View.draw()},
  up:()=>{if(wp){clearInterval(wp.timer);wp.L.rev=(wp.L.rev||0)+1;wp=null;Doc.changed('canvas');UI.thumbs()}},
  overlay:(c,act)=>{if(!act||!T.mouse())return;const [mx,my]=T.mouse();c.save();c.strokeStyle='#fff';c.setLineDash([3,3]);c.beginPath();c.arc(mx,my,O.warp.size/2*View.z,0,7);c.stroke();c.restore()},
  cursor:'crosshair',
  opts:()=>`<h4>${esc(t('Verformen (Warp)'))}</h4><div class="olab">${esc(t('Verhalten'))}</div>`+segs(O.warp,'mode',[['move','Verschieben'],['grow','Vergrößern'],['shrink','Verkleinern'],['cw','Wirbel rechts'],['ccw','Wirbel links'],['smooth','Glätten']],'warp')+slider(O.warp,'size','Größe',5,500,' px')+slider(O.warp,'strength','Stärke',1,100,' %')+hint('Schiebt Pixel wie flüssige Farbe: Verschieben zieht mit, Vergrößern/Verkleinern blähen auf oder ziehen zusammen, Wirbel dreht. Halten wirkt weiter.')},'transform');
 function warpDab(cx,cy,dx,dy){const cv=wp.cv,W=cv.width,H=cv.height,R=O.warp.size/2,k=O.warp.strength/100;const x0=Math.max(0,Math.floor(cx-R-2)),y0=Math.max(0,Math.floor(cy-R-2)),x1=Math.min(W,Math.ceil(cx+R+2)),y1=Math.min(H,Math.ceil(cy+R+2));const w=x1-x0,h=y1-y0;if(w<1||h<1)return;
  const c=cv.getContext('2d'),src=c.getImageData(x0,y0,w,h),s=src.data,dst=c.createImageData(w,h),q=dst.data;const m=O.warp.mode;
  const at=(fx,fy,ch)=>{fx=Math.max(0,Math.min(w-1.001,fx));fy=Math.max(0,Math.min(h-1.001,fy));const ix=fx|0,iy=fy|0,ax=fx-ix,ay=fy-iy,i=(iy*w+ix)*4+ch;return(s[i]*(1-ax)+s[i+4]*ax)*(1-ay)+(s[i+w*4]*(1-ax)+s[i+w*4+4]*ax)*ay};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const px=x+x0+.5-cx,py=y+y0+.5-cy,r=Math.hypot(px,py),j=(y*w+x)*4;if(r>=R){q[j]=s[j];q[j+1]=s[j+1];q[j+2]=s[j+2];q[j+3]=s[j+3];continue}
   const f=Math.pow(1-r/R,2)*k;let sx=x,sy=y;
   if(m==='move'){sx=x-dx*f*1.5;sy=y-dy*f*1.5}else if(m==='grow'){sx=x-px*f*.15;sy=y-py*f*.15}else if(m==='shrink'){sx=x+px*f*.15;sy=y+py*f*.15}
   else if(m==='cw'||m==='ccw'){const a=(m==='cw'?-1:1)*f*.12,co=Math.cos(a),si=Math.sin(a);sx=cx-x0-.5+px*co-py*si;sy=cy-y0-.5+px*si+py*co}
   if(m==='smooth'){for(let ch=0;ch<4;ch++){let acc=0;for(const [ox,oy] of[[0,0],[1,0],[-1,0],[0,1],[0,-1]])acc+=at(x+ox,y+oy,ch);q[j+ch]=s[j+ch]+(acc/5-s[j+ch])*f*2}continue}
   for(let ch=0;ch<4;ch++)q[j+ch]=at(sx,sy,ch)}
  c.putImageData(dst,x0,y0)}

 // ---------- Drehen (wie GIMP: Drehpunkt verschiebbar, Umschalt = 15°, Winkel eintippen) ----------
 let rt=null;O.rotate.piv=null;O.rotate.pid=null;
 const pivOf=L=>{if(O.rotate.pid!==L.id||!O.rotate.piv){O.rotate.pid=L.id;O.rotate.piv=[L.x+L.w/2,L.y+L.h/2]}return O.rotate.piv};
 const rotTo=(L,a,piv,c0,r0)=>{const d=(a-r0)*Math.PI/180,co=Math.cos(d),si=Math.sin(d);const cx=piv[0]+(c0[0]-piv[0])*co-(c0[1]-piv[1])*si,cy=piv[1]+(c0[0]-piv[0])*si+(c0[1]-piv[1])*co;L.rot=a;L.x=cx-L.w/2;L.y=cy-L.h/2};
 T.ext('rotate','Drehen','Umschalt+R','<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',{
  down:(s,x,y)=>{let L=active();if(!L){L=Doc.pick(x,y);if(L){Doc.sel=L.id;UI.layers()}}if(!L)return false;const pv=pivOf(L);const [px,py]=View.toScr(...pv);
   if(Math.hypot(px-s[0],py-s[1])<10){rt={piv:true,L};return}
   Doc._label=t('Drehen');Doc.begin();rt={L,pv:[...pv],c0:[L.x+L.w/2,L.y+L.h/2],a0:Math.atan2(y-pv[1],x-pv[0]),r0:L.rot||0}},
  move:(s,x,y,e)=>{if(!rt)return;if(rt.piv){O.rotate.piv=[x,y];View.draw();return}let a=rt.r0+(Math.atan2(y-rt.pv[1],x-rt.pv[0])-rt.a0)*180/Math.PI;a=((a+540)%360)-180;if(e.ctrlKey||e.shiftKey)a=Math.round(a/15)*15;
   rotTo(rt.L,a,rt.pv,rt.c0,rt.r0);Doc.need=true;View.draw();UI.propsLive();const b=document.getElementById('rotv');if(b&&document.activeElement!==b)b.value=a.toFixed(1)},
  leave:()=>{O.rotate.piv=null},
  up:()=>{if(rt){const p=rt.piv;rt=null;if(!p){Doc.changed('canvas');UI.props()}T.opts()}},
  overlay:(c,act)=>{if(!act)return;const L=Doc.layer();if(!L)return;const [sx,sy]=View.toScr(...pivOf(L));c.save();c.beginPath();c.arc(sx,sy,7,0,7);c.moveTo(sx-12,sy);c.lineTo(sx+12,sy);c.moveTo(sx,sy-12);c.lineTo(sx,sy+12);c.strokeStyle='#000';c.lineWidth=3;c.stroke();c.strokeStyle='#fff';c.lineWidth=1.3;c.stroke();c.restore()},
  opts:()=>{const L=Doc.layer();const pv=L?pivOf(L):[0,0];return`<h4>${esc(t('Drehen'))}</h4><label class="o"><span>${esc(t('Winkel'))}</span><input type="number" id="rotv" step="0.1" min="-180" max="180" value="${L?(L.rot||0).toFixed(1):0}" data-t2n="angle"><b>°</b></label>
   <label class="o"><span>${esc(t('Drehpunkt X'))}</span><input type="number" value="${Math.round(pv[0])}" data-t2n="px"><b>px</b></label><label class="o"><span>${esc(t('Drehpunkt Y'))}</span><input type="number" value="${Math.round(pv[1])}" data-t2n="py"><b>px</b></label>
   <div class="btns"><button class="btn sm" data-t2a="rot90l">−90°</button><button class="btn sm" data-t2a="rot90r">+90°</button><button class="btn sm" data-t2a="rot0">0°</button><button class="btn sm" data-t2a="pivreset">${esc(t('Drehpunkt mittig'))}</button></div><div class="btns"><button class="btn sm" data-t2a="rotcrop" title="${esc(t('Schneidet die schrägen Ränder weg, wie „Auf Ergebnis zuschneiden“ in GIMP.'))}">${esc(t('Auf Ergebnis zuschneiden'))}</button></div>`+hint('Im Bild ziehen dreht die aktive Ebene um den Drehpunkt (Kreis mit Kreuz). Den Drehpunkt kannst du an eine andere Stelle ziehen. Umschalt = 15°-Schritte.')}},'move');
 const setRot=v=>{const L=active();if(!L)return;Doc._label=t('Drehen');Doc.begin();rotTo(L,((v+540)%360)-180,pivOf(L),[L.x+L.w/2,L.y+L.h/2],L.rot||0);Doc.changed('canvas');UI.props();T.opts()};
 ACT.rot90l=()=>{const L=active();if(L)setRot((L.rot||0)-90)};ACT.rot90r=()=>{const L=active();if(L)setRot((L.rot||0)+90)};ACT.rot0=()=>setRot(0);
 ACT.pivreset=()=>{O.rotate.piv=null;View.draw();T.opts()};
 // größtes gerades Rechteck innerhalb der gedrehten Ebene
 const inRect=(w,h,a)=>{const L1=Math.max(w,h),S=Math.min(w,h),si=Math.abs(Math.sin(a)),co=Math.abs(Math.cos(a));if(si<1e-9)return[w,h];if(S<=2*si*co*L1||Math.abs(si-co)<1e-10){const x=S/2;return w>=h?[x/si,x/co]:[x/co,x/si]}const c2=co*co-si*si;return[(w*co-h*si)/c2,(h*co-w*si)/c2]};
 ACT.rotcrop=()=>{let L=active();if(!L)return;if(!(L.rot%360))return Kit.toast(t('Die Ebene ist nicht gedreht.'));Doc._label=t('Auf Ergebnis zuschneiden');Doc.begin();if(L.type!=='pixel')L=Doc.rasterize(L);
  const [rw,rh]=inRect(L.w,L.h,L.rot*Math.PI/180).map(v=>Math.max(1,Math.floor(v)));const cx=L.x+L.w/2,cy=L.y+L.h/2,x=Math.round(cx-rw/2),y=Math.round(cy-rh/2),m=Doc.matrix(L);
  const cut=src=>{const cv=Doc.mk(rw,rh),c=cv.getContext('2d');c.translate(-x,-y);c.transform(m.a,m.b,m.c,m.d,m.e,m.f);c.drawImage(src,0,0,L.w,L.h);return cv};if(L.mask)L.mask=cut(L.mask);
  Object.assign(L,{cv:cut(L.cv),x,y,w:rw,h:rh,rot:0,fx:false,fy:false});L.rev=(L.rev||0)+1;O.rotate.piv=null;Doc.changed('layers');UI.props();T.opts()};

 // ---------- Skalieren (wie GIMP: Seitenverhältnis sperren, Breite/Höhe eintippen) ----------
 let scl=null;O.scale.keep=true;
 T.ext('scale','Skalieren','Umschalt+S','<rect x="3" y="11" width="10" height="10" rx="1"/><path d="M13 11V3h8v8h-8M16 8l5-5"/>',{
  down:(s,x,y)=>{let L=active();if(!L){L=Doc.pick(x,y);if(L){Doc.sel=L.id;UI.layers()}}if(!L)return false;Doc._label=t('Skalieren');Doc.begin();const c=[L.x+L.w/2,L.y+L.h/2];scl={L,c,w0:L.w,h0:L.h,size0:L.size,d0:Math.max(4,Math.hypot(x-c[0],y-c[1])),dx0:Math.max(2,Math.abs(x-c[0])),dy0:Math.max(2,Math.abs(y-c[1]))}},
  move:(s,x,y,e)=>{if(!scl)return;const L=scl.L;let kx,ky;if(O.scale.keep!==e.shiftKey){kx=ky=Math.max(.01,Math.hypot(x-scl.c[0],y-scl.c[1])/scl.d0)}else{kx=Math.max(.01,Math.abs(x-scl.c[0])/scl.dx0);ky=Math.max(.01,Math.abs(y-scl.c[1])/scl.dy0)}
   if(L.type==='text'){L.size=Math.max(4,scl.size0*kx);L.w=0;Doc.measure(L,false)}else{L.w=scl.w0*kx;L.h=scl.h0*ky}L.x=scl.c[0]-L.w/2;L.y=scl.c[1]-L.h/2;Doc.need=true;View.draw();UI.propsLive();
   const a=document.querySelector('[data-t2n="sw"]'),b=document.querySelector('[data-t2n="sh"]');if(a)a.value=Math.round(L.w);if(b)b.value=Math.round(L.h)},
  up:()=>{if(scl){scl=null;Doc.changed('canvas');UI.props()}},
  opts:()=>{const L=Doc.layer();return`<h4>${esc(t('Skalieren'))}</h4><label class="o"><span>${esc(t('Breite'))}</span><input type="number" min="1" value="${L?Math.round(L.w):0}" data-t2n="sw"><b>px</b></label><label class="o"><span>${esc(t('Höhe'))}</span><input type="number" min="1" value="${L?Math.round(L.h):0}" data-t2n="sh"><b>px</b></label>
   <label class="o ck"><input type="checkbox" data-t2c="keep"${O.scale.keep?' checked':''}><span>${esc(t('Seitenverhältnis beibehalten'))}</span></label>`+hint('Im Bild ziehen ändert die Größe der aktiven Ebene von ihrer Mitte aus. Umschalt schaltet das Seitenverhältnis kurz um.')}},'rotate');
 // Zahlenfelder und Häkchen von Drehen/Skalieren
 document.addEventListener('change',e=>{const el=e.target;if(!el.dataset)return;if(el.dataset.t2c){const o=O[T.tool];if(o){o[el.dataset.t2c]=el.checked}return}const k=el.dataset.t2n;if(!k)return;const v=+el.value;if(!isFinite(v))return;const L=active();
  if(k==='angle'&&L)return setRot(v);
  if(k==='px'||k==='py'){if(!L)return;const pv=pivOf(L);O.rotate.piv=k==='px'?[v,pv[1]]:[pv[0],v];View.draw();return}
  if((k==='sw'||k==='sh')&&L&&v>=1&&L.type!=='text'){Doc._label=t('Skalieren');Doc.begin();const c=[L.x+L.w/2,L.y+L.h/2],r=L.h/L.w;if(k==='sw'){L.w=v;if(O.scale.keep)L.h=v*r}else{L.h=v;if(O.scale.keep)L.w=v/r}L.x=c[0]-L.w/2;L.y=c[1]-L.h/2;Doc.changed('canvas');UI.props();T.opts()}});

 // ---------- Spiegeln ----------
 T.ext('flip','Spiegeln','Umschalt+F','<path d="M12 3v18"/><path d="M9 7 3 12l6 5zM15 7l6 5-6 5z"/>',{
  down:(s,x,y,e)=>{let L=Doc.pick(x,y)||active();if(!L)return false;Doc.sel=L.id;const v=(O.flip.dir==='v')!==!!(e.shiftKey||e.ctrlKey);Doc._label=t('Spiegeln');Doc.begin();if(v)L.fy=!L.fy;else L.fx=!L.fx;Doc.changed('canvas');UI.layers();UI.props();return false},
  opts:()=>`<h4>${esc(t('Spiegeln'))}</h4><div class="olab">${esc(t('Richtung'))}</div>`+segs(O.flip,'dir',[['h','Waagerecht'],['v','Senkrecht']],'flip')+hint('Klicke eine Ebene an, um sie zu spiegeln. Umschalt = andere Richtung.')},'scale');

 // ---------- Ausrichten ----------
 T.ext('align','Ausrichten','Q','<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4" rx="1"/><rect x="7" y="14" width="7" height="4" rx="1"/>',{
  down:(s,x,y)=>{const L=Doc.pick(x,y);Doc.sel=L?L.id:null;UI.layers();UI.props();View.draw();return false},
  opts:()=>{const b=(k,n)=>`<button class="btn sm" data-t2a="al_${k}" title="${esc(t(n))}">${esc(t(n))}</button>`;return`<h4>${esc(t('Ausrichten'))}</h4><div class="olab">${esc(t('Relativ zu'))}</div>`+segs(O.align,'rel',[['image','Bild'],['sel','Auswahl']],'align')+`<div class="olab">${esc(t('Ausrichten'))}</div><div class="btns" style="flex-wrap:wrap">${b('l','Links')}${b('cx','Mitte')}${b('r','Rechts')}${b('t','Oben')}${b('cy','Mitte senkrecht')}${b('b','Unten')}</div>`+hint('Klicke eine Ebene an und richte sie am Bild oder an der Auswahl aus.')}},'flip');
 for(const k of['l','cx','r','t','cy','b'])ACT['al_'+k]=()=>{const L=active();if(!L)return Kit.toast(t('Wähle zuerst eine Ebene aus.'));let R={x:0,y:0,r:Doc.d.w,b:Doc.d.h};if(O.align.rel==='sel'){const bb=Sel.bbox&&Sel.bbox();if(!bb)return Kit.toast(t('Es ist nichts ausgewählt.'));R={x:bb.x,y:bb.y,r:bb.x+bb.w,b:bb.y+bb.h}}
  const a=Doc.aabb(L);Doc._label=t('Ausrichten');Doc.begin();const dx=k==='l'?R.x-a.x:k==='r'?R.r-a.r:k==='cx'?(R.x+R.r)/2-(a.x+a.r)/2:0,dy=k==='t'?R.y-a.y:k==='b'?R.b-a.b:k==='cy'?(R.y+R.b)/2-(a.y+a.b)/2:0;
  for(const q of L.type==='group'?Doc.desc(L.id).filter(q=>q.type!=='group'):[L]){q.x+=dx;q.y+=dy}Doc.changed('canvas');UI.props()};

 // ---------- Maßband ----------
 let ms=null,msLast=null;
 T.ext('measure','Maßband','Umschalt+M','<path d="M3 17 17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',{
  down:(s,x,y)=>{ms={a:[x,y],b:[x,y]};View.draw()},
  move:(s,x,y,e)=>{if(!ms)return;ms.b=(e.ctrlKey||e.shiftKey)?T.snap15(ms.a,[x,y]):[x,y];info();View.draw()},
  up:()=>{if(ms){msLast=ms;ms=null;T.opts()}},
  leave:()=>{msLast=null},
  overlay:(c,act)=>{const m=ms||msLast;if(!act||!m)return;const [ax,ay]=View.toScr(...m.a),[bx,by]=View.toScr(...m.b);c.save();c.strokeStyle='#fff';c.lineWidth=1.5;c.beginPath();c.moveTo(ax,ay);c.lineTo(bx,by);c.stroke();c.fillStyle='#fff';for(const [x,y] of[[ax,ay],[bx,by]]){c.beginPath();c.arc(x,y,4,0,7);c.fill()}
   const d=calc(m);c.font='600 12px system-ui';const txt=`${fu(d.len)} · ${d.ang.toFixed(1)}°`;const tw=c.measureText(txt).width+12;c.fillStyle='#000b';c.fillRect(bx+10,by-26,tw,20);c.fillStyle='#fff';c.fillText(txt,bx+16,by-12);c.restore()},
  opts:()=>{const m=msLast;const d=m?calc(m):null;return`<h4>${esc(t('Maßband'))}</h4><div class="olab">${esc(t('Einheit'))}</div>`+segs(O.measure,'unit',[['px','px'],['mm','mm'],['cm','cm'],['in','in']],'measure')+`<div class="olab">${esc(t('Winkel gegen'))}</div>`+segs(O.measure,'ref',[['h','Waagerecht'],['v','Senkrecht']],'measure')+`<p class="hint2" id="msinfo">${d?info(d,true):esc(t('Ziehe eine Linie, um zu messen.'))}</p>${d?`<button class="btn sm" data-t2a="straighten">${esc(t('Begradigen'))}</button>`:''}`+hint('Zeigt Länge, Winkel und Abstände. Strg = 15°-Schritte. „Begradigen“ dreht die aktive Ebene so, dass die Linie waagerecht ist (wie GIMP).')}},'align');
 const uf=()=>{const u=O.measure.unit,p=(Doc.d&&Doc.d.ppi)||300;return u==='in'?p:u==='cm'?p/2.54:u==='mm'?p/25.4:1};
 const fu=v=>{const u=O.measure.unit;return(u==='px'?v.toFixed(1):(v/uf()).toFixed(2))+' '+u};
 const calc=m=>{const dx=m.b[0]-m.a[0],dy=m.b[1]-m.a[1];let ang=-Math.atan2(dy,dx)*180/Math.PI;if(O.measure.ref==='v'){ang=90-ang;ang=((ang+540)%360)-180}return{dx,dy,len:Math.hypot(dx,dy),ang}};
 function info(d,ret){d=d||calc(ms);const s=`${esc(t('Länge'))}: <b>${fu(d.len)}</b> · ${esc(t('Winkel'))}: <b>${d.ang.toFixed(2)}°</b><br>Δx ${fu(Math.abs(d.dx))} · Δy ${fu(Math.abs(d.dy))}`;if(ret)return s;const e=document.getElementById('msinfo');if(e)e.innerHTML=s}
 ACT.straighten=()=>{const L=active();if(!L||!msLast)return Kit.toast(t('Wähle zuerst eine Ebene aus.'));let a=-Math.atan2(msLast.b[1]-msLast.a[1],msLast.b[0]-msLast.a[0])*180/Math.PI;if(a>90)a-=180;if(a<-90)a+=180;if(Math.abs(a)>45)a=a>0?a-90:a+90;Doc._label=t('Begradigen');Doc.begin();L.rot=((L.rot||0)+a+540)%360-180;Doc.changed('canvas');UI.props();msLast=null;View.draw();T.opts()};
 // Tastenbelegung wie GIMP 2.10 (Anzeige im Tooltip)
 const KEYS={move:'M',rsel:'R',esel:'E',lasso:'F',wand:'U',bycolor:'Umschalt+O',scissors:'I',fgsel:'Umschalt+X',path:'B',crop:'Umschalt+C',transform:'Umschalt+P',warp:'W',rotate:'Umschalt+R',scale:'Umschalt+S',flip:'Umschalt+F',align:'Q',brush:'P',pencil:'N',airbrush:'A',ink:'K',eraser:'Umschalt+E',fill:'Umschalt+B',gradient:'G',clone:'C',heal:'H',smudge:'S',dodge:'Umschalt+D',burn:'Umschalt+Alt+D',blurb:'Umschalt+U',sharpb:'Umschalt+Alt+U',text:'T',shape:'Umschalt+Y',picker:'O',measure:'Umschalt+M',hand:'Leertaste',zoom:'Z'};
 for(const x of T.LIST)if(KEYS[x[0]])x[2]=KEYS[x[0]];
})();
