// Transformieren: Perspektive, Scheren und Verkrümmen (Gitter). Gerendert über ein feines Dreiecksnetz.
const Warp=(()=>{const W={};const {esc}=Kit;const t=s=>Kit.t(s);
 // Dreieck aus der Quelle (s0,s1,s2) ins Ziel (d0,d1,d2) zeichnen
 const tri=(c,img,s,d)=>{const [x0,y0,x1,y1,x2,y2]=s,[u0,v0,u1,v1,u2,v2]=d;const den=x0*(y2-y1)-x1*y2+x2*y1+(x1-x2)*y0;if(Math.abs(den)<1e-9)return;
  const a=-(y0*(u2-u1)-y1*u2+y2*u1+(y1-y2)*u0)/den,cc=(x0*(u2-u1)-x1*u2+x2*u1+(x1-x2)*u0)/den,e=(x0*(y2*u1-y1*u2)+y0*(x1*u2-x2*u1)+(x2*y1-x1*y2)*u0)/den;
  const b=-(y0*(v2-v1)-y1*v2+y2*v1+(y1-y2)*v0)/den,dd=(x0*(v2-v1)-x1*v2+x2*v1+(x1-x2)*v0)/den,f=(x0*(y2*v1-y1*v2)+y0*(x1*v2-x2*v1)+(x2*y1-x1*y2)*v0)/den;
  const mx=(u0+u1+u2)/3,my=(v0+v1+v2)/3,g=(x,y)=>{const dx=x-mx,dy=y-my,l=Math.hypot(dx,dy)||1;return[x+dx/l*.7,y+dy/l*.7]};
  c.save();c.beginPath();c.moveTo(...g(u0,v0));c.lineTo(...g(u1,v1));c.lineTo(...g(u2,v2));c.closePath();c.clip();c.transform(a,b,cc,dd,e,f);
  const sx=Math.max(0,Math.floor(Math.min(x0,x1,x2))-1),sy=Math.max(0,Math.floor(Math.min(y0,y1,y2))-1),ex=Math.min(img.width,Math.ceil(Math.max(x0,x1,x2))+1),ey=Math.min(img.height,Math.ceil(Math.max(y0,y1,y2))+1);
  if(ex>sx&&ey>sy)c.drawImage(img,sx,sy,ex-sx,ey-sy,sx,sy,ex-sx,ey-sy);c.restore()};
 // Netz: map(u,v) liefert für u,v in 0..1 den Zielpunkt im Bild. Ergebnis: Leinwand in Bildkoordinaten (Begrenzung)
 W.render=(img,map,n=20)=>{const P=[];let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){const p=map(i/n,j/n);P.push(p);x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1])}
  if(!isFinite(x0+y0+x1+y1))return null;x0=Math.floor(x0);y0=Math.floor(y0);const w=Math.min(16000,Math.ceil(x1-x0)),h=Math.min(16000,Math.ceil(y1-y0));if(w<1||h<1)return null;const cv=Doc.mk(w,h),c=cv.getContext('2d');c.imageSmoothingQuality='high';
  const S=(i,j)=>[i/n*img.width,j/n*img.height],D=(i,j)=>{const p=P[j*(n+1)+i];return[p[0]-x0,p[1]-y0]};
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){tri(c,img,[...S(i,j),...S(i+1,j),...S(i,j+1)],[...D(i,j),...D(i+1,j),...D(i,j+1)]);tri(c,img,[...S(i+1,j),...S(i+1,j+1),...S(i,j+1)],[...D(i+1,j),...D(i+1,j+1),...D(i,j+1)])}
  return{cv,x:x0,y:y0}};
 // Projektive Abbildung Einheitsquadrat -> Viereck p0..p3 (oben links, oben rechts, unten rechts, unten links)
 const homog=q=>{const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=q;const dx1=x1-x2,dx2=x3-x2,dy1=y1-y2,dy2=y3-y2,sx=x0-x1+x2-x3,sy=y0-y1+y2-y3;let g=0,h=0;
  if(Math.abs(sx)>1e-9||Math.abs(sy)>1e-9){const den=dx1*dy2-dx2*dy1;g=(sx*dy2-dx2*sy)/den;h=(dx1*sy-sx*dy1)/den}
  const a=x1-x0+g*x1,b=x3-x0+h*x3,c=x0,d=y1-y0+g*y1,e=y3-y0+h*y3,f=y0;return(u,v)=>{const z=g*u+h*v+1;return[(a*u+b*v+c)/z,(d*u+e*v+f)/z]}};
 // ---------- Transformieren wie GIMP 2.10 ----------
 // Eigene Werkzeuge: Vereinheitlicht, Perspektive, Scheren, 3D, Griff-Transformation, Käfig.
 // „Transformieren“ fasst alle Arten zusammen (dazu Verkrümmen mit Gitter).
 let st=null;const N=4;
 const FIX={unified:'unified',perspective:'persp',shear:'shear',tf3d:'3d',handle:'handle',cage:'cage'};
 const mode=()=>FIX[Tools.tool]||Tools.o.tf.mode;
 const LABEL={unified:'Vereinheitlichte Transformation',persp:'Perspektive',shear:'Scheren',warp:'Verkrümmen','3d':'3D-Transformation',handle:'Griff-Transformation',cage:'Käfig-Transformation'};
 const cornersOf=L=>{const m=Doc.matrix(L);return[[0,0],[L.w,0],[L.w,L.h],[0,L.h]].map(([x,y])=>{const p=m.transformPoint(new DOMPoint(x,y));return[p.x,p.y]})};
 const ctr=q=>[(q[0][0]+q[1][0]+q[2][0]+q[3][0])/4,(q[0][1]+q[1][1]+q[2][1]+q[3][1])/4];
 const start=()=>{let L=Doc.layer();if(!L||L.type==='group'){st=null;return false}if(L.locked){Kit.toast(t('Die Ebene ist gesperrt.'));st=null;return false}
  const q=cornersOf(L);const lat=[];for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){const u=i/N,v=j/N;lat.push([q[0][0]*(1-u)*(1-v)+q[1][0]*u*(1-v)+q[2][0]*u*v+q[3][0]*(1-u)*v,q[0][1]*(1-u)*(1-v)+q[1][1]*u*(1-v)+q[2][1]*u*v+q[3][1]*(1-u)*v])}
  st={L,id:L.id,q,base:q.map(p=>[...p]),lat,changed:false,piv:ctr(q),ang:{x:0,y:0,z:0},sh:{x:0,y:0},hs:[],cage:null};return true};
 // Gleichungssystem lösen (Gauß), Matrizen aus Punktpaaren
 const solve=(A,b)=>{const n=b.length;const M=A.map((r,i)=>[...r,b[i]]);for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;if(Math.abs(M[p][c])<1e-12)return null;[M[c],M[p]]=[M[p],M[c]];
  for(let r=0;r<n;r++){if(r===c)continue;const f=M[r][c]/M[c][c];for(let k=c;k<=n;k++)M[r][k]-=f*M[c][k]}}return M.map((r,i)=>r[n]/r[i])};
 // 1 Griff = verschieben, 2 = drehen + skalieren, 3 = scheren (affin), 4 = Perspektive – wie GIMPs Griff-Transformation
 const fromPairs=(S,D)=>{const n=S.length;if(!n)return[1,0,0,0,1,0,0,0,1];
  if(n===1)return[1,0,D[0][0]-S[0][0],0,1,D[0][1]-S[0][1],0,0,1];
  if(n===2){const sx=S[1][0]-S[0][0],sy=S[1][1]-S[0][1],dx=D[1][0]-D[0][0],dy=D[1][1]-D[0][1],den=sx*sx+sy*sy;if(den<1e-9)return null;const a=(dx*sx+dy*sy)/den,b=(dy*sx-dx*sy)/den;
   return[a,-b,D[0][0]-(a*S[0][0]-b*S[0][1]),b,a,D[0][1]-(b*S[0][0]+a*S[0][1]),0,0,1]}
  const A=[],B=[];if(n===3){for(let i=0;i<3;i++){A.push([S[i][0],S[i][1],1,0,0,0]);B.push(D[i][0]);A.push([0,0,0,S[i][0],S[i][1],1]);B.push(D[i][1])}const r=solve(A,B);return r?[...r,0,0,1]:null}
  for(let i=0;i<4;i++){const [x,y]=S[i],[u,v]=D[i];A.push([x,y,1,0,0,0,-u*x,-u*y]);B.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);B.push(v)}const r=solve(A,B);return r?[...r,1]:null};
 const ap=(H,[x,y])=>{const z=H[6]*x+H[7]*y+H[8];return[(H[0]*x+H[1]*y+H[2])/z,(H[3]*x+H[4]*y+H[5])/z]};
 const inv3=m=>{const [a,b,c,d,e,f,g,h,i]=m;const A=e*i-f*h,B=-(d*i-f*g),C=d*h-e*g,det=a*A+b*B+c*C;if(Math.abs(det)<1e-12)return null;
  return[A/det,-(b*i-c*h)/det,(b*f-c*e)/det,B/det,(a*i-c*g)/det,-(a*f-c*d)/det,C/det,-(a*h-b*g)/det,(a*e-b*d)/det]};
 const hApply=()=>{const H=fromPairs(st.hs.map(h=>h.s),st.hs.map(h=>h.d));if(H)st.q=st.base.map(p=>ap(H,p))};
 // 3D: um X/Y/Z drehen und mit Fluchtpunkt projizieren
 const q3d=()=>{const b=st.base,c=ctr(b),R=Math.PI/180,ax=st.ang.x*R,ay=st.ang.y*R,az=st.ang.z*R;const f=Math.max(Doc.d.w,Doc.d.h)*1.6;
  return b.map(([x,y])=>{let X=x-c[0],Y=y-c[1],Z=0,u;
   u=X*Math.cos(az)-Y*Math.sin(az);Y=X*Math.sin(az)+Y*Math.cos(az);X=u;
   u=X*Math.cos(ay)+Z*Math.sin(ay);Z=-X*Math.sin(ay)+Z*Math.cos(ay);X=u;
   u=Y*Math.cos(ax)-Z*Math.sin(ax);Z=Y*Math.sin(ax)+Z*Math.cos(ax);Y=u;
   const k=f/Math.max(f*.15,f+Z);return[c[0]+X*k,c[1]+Y*k]})};
 const shearBy=(q,dx,dy)=>q.map(([x,y],i)=>[x+(i<2?dx/2:-dx/2),y+(i===1||i===2?dy/2:-dy/2)]);
 // Käfig: Mittelwert-Koordinaten (mean value coordinates)
 const mvc=(P,Q,x,y)=>{const n=P.length,r=[],a=[];for(let i=0;i<n;i++){r[i]=Math.hypot(P[i][0]-x,P[i][1]-y);if(r[i]<1e-6)return[Q[i][0],Q[i][1]]}
  for(let i=0;i<n;i++){const j=(i+1)%n,ax=P[i][0]-x,ay=P[i][1]-y,bx=P[j][0]-x,by=P[j][1]-y;a[i]=Math.atan2(ax*by-ay*bx,ax*bx+ay*by)}
  let X=0,Y=0,S=0;for(let i=0;i<n;i++){const p=(i+n-1)%n,w=(Math.tan(a[p]/2)+Math.tan(a[i]/2))/r[i];S+=w;X+=w*Q[i][0];Y+=w*Q[i][1]}
  return!isFinite(S)||Math.abs(S)<1e-12?[x,y]:[X/S,Y/S]};
 const mapFn=()=>{const m=mode();if(m==='warp'){const lat=st.lat;return(u,v)=>{const fx=u*N,fy=v*N,i=Math.min(N-1,Math.floor(fx)),j=Math.min(N-1,Math.floor(fy)),a=fx-i,b=fy-j;const P=(ii,jj)=>lat[jj*(N+1)+ii];
   const p00=P(i,j),p10=P(i+1,j),p01=P(i,j+1),p11=P(i+1,j+1);return[p00[0]*(1-a)*(1-b)+p10[0]*a*(1-b)+p01[0]*(1-a)*b+p11[0]*a*b,p00[1]*(1-a)*(1-b)+p10[1]*a*(1-b)+p01[1]*(1-a)*b+p11[1]*a*b]}}
  if(m==='cage'&&st.cage&&st.cage.closed){const base=homog(st.base),P=st.cage.src.map(p=>[...p]),Q=st.cage.dst.map(p=>[...p]);return(u,v)=>{const p=base(u,v);return mvc(P,Q,p[0],p[1])}}
  return homog(st.q)};
 const srcOf=L=>{if(L.type==='pixel')return L.cv;const cv=Doc.mk(L.w,L.h);const c=cv.getContext('2d');c.translate(L.w/2,L.h/2);Doc.drawLayer(c,{...L,x:-L.w/2,y:-L.h/2,rot:0,fx:false,fy:false},1,true);return cv};
 const srcFlip=(L,img)=>{if(!L.fx&&!L.fy)return img;const o=Doc.mk(img.width,img.height),c=o.getContext('2d');c.translate(L.fx?img.width:0,L.fy?img.height:0);c.scale(L.fx?-1:1,L.fy?-1:1);c.drawImage(img,0,0);return o};
 const res=fin=>{const m=mode();return m==='cage'?(fin?48:24):m==='persp'||m==='shear'||m==='3d'||m==='handle'||m==='unified'?(fin?40:24):(fin?40:20)};
 let tm=0;const preview=()=>{clearTimeout(tm);tm=setTimeout(()=>{if(!st)return;const L=st.L;const img=srcFlip(L,srcOf(L));const r=W.render(img,mapFn(),res(false));if(r)st.L._tf=r;else delete st.L._tf;Doc.need=true;View.draw();info()},16)};
 W.apply=()=>{if(!st||!st.changed){W.cancel();return}let L=st.L;const fn=mapFn();Doc._label=t(LABEL[mode()]||'Transformieren');Doc.begin();
  const img=srcFlip(L,srcOf(L));const r=W.render(img,fn,res(true));if(!r){Doc.undo.pop();Kit.toast(t('Diese Form ist ungültig.'));return W.cancel()}let mask=null;if(L.mask)mask=W.render(srcFlip(L,L.mask),fn,res(true));
  if(L.type!=='pixel')L=Doc.rasterize(L);delete L._tf;Object.assign(L,{cv:r.cv,x:r.x,y:r.y,w:r.cv.width,h:r.cv.height,rot:0,fx:false,fy:false});
  if(mask){const m=Doc.mk(r.cv.width,r.cv.height),mc=m.getContext('2d');mc.fillStyle='#000';mc.fillRect(0,0,m.width,m.height);mc.drawImage(mask.cv,mask.x-r.x,mask.y-r.y);L.mask=m}
  st=null;Doc.changed('layers');start();Tools.opts()};
 W.cancel=()=>{if(st&&st.L)delete st.L._tf;st=null;Doc.need=true;View.draw();start();Tools.opts()};
 // Griffe je Art
 const edges=()=>[[0,1],[1,2],[2,3],[3,0]].map(([a,b],i)=>({p:[(st.q[a][0]+st.q[b][0])/2,(st.q[a][1]+st.q[b][1])/2],i,k:'edge',a,b}));
 const pts=()=>{const m=mode();if(m==='warp')return st.lat.map((p,i)=>({p,i,k:'lat'}));if(m==='shear')return edges();if(m==='unified')return[...st.q.map((p,i)=>({p,i,k:'cs'})),...edges()];if(m==='persp')return st.q.map((p,i)=>({p,i,k:'corner'}));return[]};
 const near=(pt,s,r=10)=>{const [sx,sy]=View.toScr(...pt);return Math.hypot(sx-s[0],sy-s[1])<r};
 const inQuad=(q,x,y)=>{let c=false;for(let i=0,j=3;i<4;j=i++){const [xi,yi]=q[i],[xj,yj]=q[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)c=!c}return c};
 let drag=null;
 const ensure=()=>{const L=Doc.layer();if(!st||!L||st.id!==L.id){if(st&&st.L)delete st.L._tf;start()}return!!st};
 Tools.o.tf={mode:'unified',center:false,axis:'xy'};
 const tool={
  down(s,x,y,e){if(!ensure())return Kit.toast(t('Wähle zuerst eine Ebene aus.')),false;const m=mode();
   drag={x0:x,y0:y,s0:[...s],q0:st.q.map(p=>[...p]),lat0:st.lat.map(p=>[...p]),piv0:[...st.piv],pivC:Math.hypot(...[0,1].map(i=>st.piv[i]-ctr(st.q)[i]))<.5,ang0:{...st.ang},sh0:{...st.sh}};
   if(m==='handle'){const i=st.hs.findIndex(h=>near(h.d,s));
    if(i>=0&&(e.ctrlKey||e.metaKey)){st.hs.splice(i,1);drag=null;View.draw();return false}
    const H=fromPairs(st.hs.map(h=>h.s),st.hs.map(h=>h.d)),Hi=H&&inv3(H);
    if(i>=0){Object.assign(drag,{k:'hd',i,shift:e.shiftKey,d0:[...st.hs[i].d],Hi});return}
    if(st.hs.length>=4){drag=null;return false}st.hs.push({s:Hi?ap(Hi,[x,y]):[x,y],d:[x,y]});Object.assign(drag,{k:'hd',i:st.hs.length-1,shift:false,d0:[x,y],Hi});View.draw();return}
   if(m==='cage'){if(!st.cage)st.cage={src:[],dst:[],closed:false};const C=st.cage;
    if(!C.closed){if(C.src.length>=3&&near(C.src[0],s)){C.closed=true;drag=null;View.draw();Tools.opts();return false}C.src.push([x,y]);C.dst.push([x,y]);drag=null;View.draw();Tools.opts();return false}
    const i=C.dst.findIndex(p=>near(p,s));if(i<0){drag=null;return false}Object.assign(drag,{k:'cg',i,d0:[...C.dst[i]]});return}
   if(m==='3d'){drag.k='3d';drag.a0=Math.atan2(y-ctr(st.base)[1],x-ctr(st.base)[0]);return}
   if(m==='unified'&&near(st.piv,s,9)){drag.k='piv';return}
   const P=pts();let best=null,bd=12;for(const h of P){const [sx,sy]=View.toScr(...h.p);const dd=Math.hypot(sx-s[0],sy-s[1]);if(dd<bd){bd=dd;best=h}}
   if(best){Object.assign(drag,{k:best.k,i:best.i,a:best.a,b:best.b});return}
   if(m==='unified'){drag.k=inQuad(st.q,x,y)?'mv':'rot';return}
   if(m==='persp'){let bi=0,bdd=1e18;st.q.forEach((p,i)=>{const dd=(p[0]-x)**2+(p[1]-y)**2;if(dd<bdd){bdd=dd;bi=i}});Object.assign(drag,{k:'corner',i:bi});return}
   if(m==='shear'){drag.k='shear';return}
   drag=null;return false},
  move(s,x,y,e){if(!drag)return;const dx=x-drag.x0,dy=y-drag.y0,k=drag.k,q0=drag.q0,ctrl=e.ctrlKey||e.metaKey;
   if(k==='corner'){const i=drag.i;st.q=q0.map(p=>[...p]);st.q[i]=[q0[i][0]+dx,q0[i][1]+dy];if(Tools.o.tf.center!==ctrl){const o=(i+2)%4;st.q[o]=[q0[o][0]-dx,q0[o][1]-dy]}}
   else if(k==='edge'){st.q=q0.map(p=>[...p]);for(const j of[drag.a,drag.b])st.q[j]=[q0[j][0]+dx,q0[j][1]+dy];if(mode()==='shear'){/* Kante ziehen = scheren */}}
   else if(k==='lat'){const N1=N+1,i=drag.i%N1,j=Math.floor(drag.i/N1);for(let jj=0;jj<=N;jj++)for(let ii=0;ii<=N;ii++){const q=jj*N1+ii;const w=e.shiftKey?(q===drag.i?1:0):Math.max(0,1-Math.hypot(ii-i,jj-j)/1.6);st.lat[q]=[drag.lat0[q][0]+dx*w,drag.lat0[q][1]+dy*w]}}
   else if(k==='mv'){st.q=q0.map(p=>[p[0]+dx,p[1]+dy]);st.piv=[drag.piv0[0]+dx,drag.piv0[1]+dy]}
   else if(k==='piv'){st.piv=[drag.piv0[0]+dx,drag.piv0[1]+dy];View.draw();return}
   else if(k==='rot'){const c=st.piv;let a=Math.atan2(y-c[1],x-c[0])-Math.atan2(drag.y0-c[1],drag.x0-c[0]);if(e.shiftKey)a=Math.round(a/(Math.PI/12))*(Math.PI/12);const co=Math.cos(a),si=Math.sin(a);
    st.q=q0.map(([px,py])=>[c[0]+(px-c[0])*co-(py-c[1])*si,c[1]+(px-c[0])*si+(py-c[1])*co]);drag.deg=a*180/Math.PI}
   else if(k==='cs'){const i=drag.i;if(ctrl){st.q=q0.map(p=>[...p]);st.q[i]=[q0[i][0]+dx,q0[i][1]+dy]}
    else{const o=(i+2)%4,A=(i+1)%4,B=(i+3)%4,ov=q0[o],a=[q0[A][0]-ov[0],q0[A][1]-ov[1]],b=[q0[B][0]-ov[0],q0[B][1]-ov[1]],det=a[0]*b[1]-a[1]*b[0];
     const co=(px,py)=>Math.abs(det)<1e-9?[0,0]:[(px*b[1]-py*b[0])/det,(a[0]*py-a[1]*px)/det];
     const [ka0,kb0]=co(q0[i][0]-ov[0],q0[i][1]-ov[1]),[ka1,kb1]=co(q0[i][0]+dx-ov[0],q0[i][1]+dy-ov[1]);let sa=Math.abs(ka0)>1e-9?ka1/ka0:1,sb=Math.abs(kb0)>1e-9?kb1/kb0:1;if(e.shiftKey){const mm=(sa+sb)/2;sa=sb=mm}
     st.q=q0.map(([px,py])=>{const [al,be]=co(px-ov[0],py-ov[1]);return[ov[0]+al*sa*a[0]+be*sb*b[0],ov[1]+al*sa*a[1]+be*sb*b[1]]})}}
   else if(k==='shear'){if(!drag.dir){if(Math.hypot(dx,dy)*View.z<5)return;drag.dir=Math.abs(dx)>=Math.abs(dy)?'h':'v'}const sx=drag.dir==='h'?dx:0,sy=drag.dir==='v'?dy:0;st.q=shearBy(q0,sx,sy);st.sh={x:drag.sh0.x+sx,y:drag.sh0.y+sy}}
   else if(k==='3d'){if(Tools.o.tf.axis==='z'||e.shiftKey){const c=ctr(st.base);let a=(Math.atan2(y-c[1],x-c[0])-drag.a0)*180/Math.PI;if(ctrl)a=Math.round(a/15)*15;st.ang.z=((drag.ang0.z+a+540)%360)-180}
    else{const cl=v=>Math.max(-85,Math.min(85,v));let ay=cl(drag.ang0.y+(s[0]-drag.s0[0])*.35),ax=cl(drag.ang0.x-(s[1]-drag.s0[1])*.35);if(ctrl){if(Math.abs(s[0]-drag.s0[0])>Math.abs(s[1]-drag.s0[1]))ax=drag.ang0.x;else ay=drag.ang0.y}st.ang.x=ax;st.ang.y=ay}st.q=q3d()}
   else if(k==='hd'){const h=st.hs[drag.i];h.d=[drag.d0[0]+dx,drag.d0[1]+dy];if(drag.shift&&drag.Hi)h.s=ap(drag.Hi,h.d);else hApply()}
   else if(k==='cg'){st.cage.dst[drag.i]=[drag.d0[0]+dx,drag.d0[1]+dy]}
   if(drag.pivC&&k!=='rot')st.piv=ctr(st.q);
   st.changed=true;preview()},
  up(){drag=null;info()},
  overlay(c,active){if(!active||!st)return;const ac='#22d3ee',m=mode();c.save();c.strokeStyle=ac;c.lineWidth=1;
   const dot=(p,r=5,sq)=>{const [sx,sy]=View.toScr(...p);c.beginPath();if(sq)c.rect(sx-r,sy-r,r*2,r*2);else c.arc(sx,sy,r,0,7);c.fillStyle='#fff';c.fill();c.stroke()};
   const poly=(P,close=true,dash)=>{c.save();if(dash)c.setLineDash([4,4]);c.beginPath();P.forEach((p,i)=>{const [sx,sy]=View.toScr(...p);i?c.lineTo(sx,sy):c.moveTo(sx,sy)});if(close)c.closePath();c.stroke();c.restore()};
   if(m==='warp'){for(let j=0;j<=N;j++)poly(st.lat.slice(j*(N+1),j*(N+1)+N+1),false);for(let i=0;i<=N;i++)poly([...Array(N+1)].map((_,j)=>st.lat[j*(N+1)+i]),false)}
   else if(m==='cage'){poly(st.q,true,true);const C=st.cage;if(C&&C.dst.length){if(C.closed&&C.dst.some((p,i)=>p[0]!==C.src[i][0]||p[1]!==C.src[i][1]))poly(C.src,true,true);poly(C.dst,C.closed);C.dst.forEach((p,i)=>dot(p,i===0&&!C.closed?6:4.5))}}
   else{poly(st.q);if(m==='unified'||m==='3d'){c.save();c.globalAlpha=.35;poly([st.q[0],st.q[2]],false);poly([st.q[1],st.q[3]],false);c.restore()}}
   for(const h of pts())dot(h.p,h.k==='lat'?4.5:h.k==='edge'?4:6,h.k==='edge');
   if(m==='unified'){const [sx,sy]=View.toScr(...st.piv);c.beginPath();c.arc(sx,sy,7,0,7);c.moveTo(sx-11,sy);c.lineTo(sx+11,sy);c.moveTo(sx,sy-11);c.lineTo(sx,sy+11);c.strokeStyle='#000';c.lineWidth=3;c.stroke();c.strokeStyle='#fff';c.lineWidth=1.3;c.stroke()}
   if(m==='3d'){const [sx,sy]=View.toScr(...ctr(st.base));c.beginPath();c.arc(sx,sy,4,0,7);c.fillStyle=ac;c.fill()}
   if(m==='handle'){c.font='600 10px system-ui';st.hs.forEach((h,i)=>{const [sx,sy]=View.toScr(...h.d);c.beginPath();c.arc(sx,sy,7,0,7);c.fillStyle='#fff';c.fill();c.strokeStyle='#000';c.stroke();c.beginPath();c.arc(sx,sy,4,0,7);c.fillStyle=ac;c.fill();c.fillStyle='#000';c.fillText(String(i+1),sx+9,sy-7)})}
   c.restore()},
  opts(){ensure();const m=mode(),fixed=!!FIX[Tools.tool];const seg=(key,opts)=>`<div class="seg">${opts.map(([v,n])=>`<button data-tfo="${key}" data-v="${v}" class="${Tools.o.tf[key]===v?'on':''}">${esc(t(n))}</button>`).join('')}</div>`;
   const num=(id,lab,val,unit,step=1)=>`<label class="o"><span>${esc(t(lab))}</span><input type="number" step="${step}" value="${Math.round(val*10)/10}" data-tfn="${id}"><b>${unit}</b></label>`;
   const HINT={unified:'Ecken ziehen = skalieren (Umschalt = Seitenverhältnis, Strg = nur diese Ecke/Perspektive). Kanten ziehen = scheren und strecken. Innen ziehen = verschieben, außen ziehen = drehen (Umschalt = 15°). Den Drehpunkt in der Mitte kannst du verschieben.',
    persp:'Ziehe die Ecken – oder irgendwo ins Bild, dann bewegt sich die nächste Ecke. So kippst du ein Bild in die Perspektive, z. B. auf einen Bildschirm. Strg = gegenüberliegende Ecke spiegelbildlich.',
    shear:'Waagerecht ziehen schert waagerecht, senkrecht ziehen schert senkrecht. Oder eine Kante ziehen.',
    warp:'Ziehe die Gitterpunkte, um das Bild zu verbiegen. Umschalt = nur ein Punkt.',
    '3d':'Ziehen kippt die Ebene um die X- und Y-Achse wie im Raum. Umschalt oder „Z-Achse“ dreht in der Ebene. Strg = nur eine Achse.',
    handle:'Klicke bis zu vier Griffe ins Bild und ziehe sie: 1 Griff verschiebt, 2 drehen und skalieren, 3 scheren, 4 ändern die Perspektive. Umschalt+Ziehen setzt einen Griff um, Strg+Klick löscht ihn.',
    cage:'Klicke Punkte rund um das Motiv und schließe den Käfig am ersten Punkt (oder Enter). Dann die Käfigpunkte ziehen – das Bild verformt sich mit.'};
   let h='';if(!fixed)h+=`<div class="olab">${esc(t('Art'))}</div><div class="seg" style="flex-wrap:wrap">${[['unified','Vereinheitlicht'],['persp','Perspektive'],['shear','Scheren'],['3d','3D'],['handle','Griffe'],['cage','Käfig'],['warp','Verkrümmen']].map(([k,n])=>`<button data-tfm="${k}" class="${m===k?'on':''}">${esc(t(n))}</button>`).join('')}</div>`;
   if(m==='persp')h+=`<label class="o ck"><input type="checkbox" data-tfc${Tools.o.tf.center?' checked':''}><span>${esc(t('Um die Mitte (gegenüberliegende Ecke bewegt sich mit)'))}</span></label>`;
   if(m==='shear'&&st)h+=num('shx','Scherung X',st.sh.x,'px')+num('shy','Scherung Y',st.sh.y,'px');
   if(m==='3d'&&st)h+=`<div class="olab">${esc(t('Ziehen dreht'))}</div>`+seg('axis',[['xy','X/Y-Achse'],['z','Z-Achse']])+num('ax','Winkel X',st.ang.x,'°')+num('ay','Winkel Y',st.ang.y,'°')+num('az','Winkel Z',st.ang.z,'°');
   if(m==='unified'&&st)h+=`<p class="hint2" id="tfinfo"></p><div class="btns"><button class="btn sm" data-tfx="pivot">${esc(t('Drehpunkt mittig'))}</button></div>`;
   if(m==='handle'&&st)h+=`<p class="hint2">${esc(t('Griffe'))}: <b>${st.hs.length}/4</b></p>`;
   if(m==='cage'&&st)h+=`<p class="hint2">${st.cage&&st.cage.closed?esc(t('Käfig geschlossen. Jetzt Punkte ziehen.')):esc(t('Käfig-Punkte'))+': <b>'+((st.cage&&st.cage.src.length)||0)+'</b>'}</p>`;
   return h+`<p class="hint2">${esc(t(HINT[m]))}</p><div class="btns" style="margin-top:10px"><button class="btn" data-tfx="cancel">${esc(t('Zurücksetzen'))}</button><button class="btn primary" data-tfx="apply">${esc(t('Anwenden'))}</button></div><p class="hint2">${esc(t('Enter wendet an, Esc bricht ab.'))}</p>`},
  leave(){if(st&&st.L)delete st.L._tf;st=null;Doc.need=true;View.draw()},
  key(k){if(!st)return false;if(k==='apply'){if(mode()==='cage'&&st.cage&&!st.cage.closed&&st.cage.src.length>=3){st.cage.closed=true;View.draw();Tools.opts();return true}if(!st.changed)return false;W.apply();return true}
   if(!st.changed&&!(st.cage&&st.cage.src.length)&&!st.hs.length)return false;W.cancel();return true},
  cursor:'default'};
 function info(){const e=document.getElementById('tfinfo');if(!e||!st)return;const q=st.q,w=Math.hypot(q[1][0]-q[0][0],q[1][1]-q[0][1]),hh=Math.hypot(q[3][0]-q[0][0],q[3][1]-q[0][1]),a=Math.atan2(q[1][1]-q[0][1],q[1][0]-q[0][0])*180/Math.PI;
  e.textContent=`${Math.round(w)} × ${Math.round(hh)} px · ${a.toFixed(1)}°`}
 const IC={unified:'<rect x="5" y="5" width="14" height="14"/><path d="M12 9v6M9 12h6"/><circle cx="5" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="19" cy="19" r="1.6"/><circle cx="5" cy="19" r="1.6"/>',
  perspective:'<path d="M7 5h10l4 14H3z"/><circle cx="7" cy="5" r="1.5"/><circle cx="17" cy="5" r="1.5"/>',
  shear:'<path d="M8 5h13l-5 14H3z"/><path d="M3 12h4" opacity=".5"/>',
  tf3d:'<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  handle:'<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 2"/><circle cx="9" cy="9" r="2.2"/><circle cx="15" cy="15" r="2.2"/>',
  cage:'<path d="M4 7l7-4 9 5-2 11-10 2z" stroke-dasharray="3 2"/><circle cx="4" cy="7" r="1.5"/><circle cx="11" cy="3" r="1.5"/><circle cx="20" cy="8" r="1.5"/><circle cx="18" cy="19" r="1.5"/><circle cx="8" cy="21" r="1.5"/>'};
 Tools.ext('transform','Transformieren (alle Arten)','','<path d="M5 5 19 3 21 19 3 21z"/><circle cx="5" cy="5" r="1.5"/><circle cx="19" cy="3" r="1.5"/><circle cx="21" cy="19" r="1.5"/><circle cx="3" cy="21" r="1.5"/>',tool,'crop');
 Tools.ext('unified','Vereinheitlichte Transformation','Umschalt+T',IC.unified,tool,'transform');
 Tools.ext('perspective','Perspektive','Umschalt+P',IC.perspective,tool,'unified');
 Tools.ext('shear','Scheren','Umschalt+H',IC.shear,tool,'perspective');
 Tools.ext('tf3d','3D-Transformation','Umschalt+W',IC.tf3d,tool,'shear');
 Tools.ext('handle','Griff-Transformation','Umschalt+L',IC.handle,tool,'tf3d');
 Tools.ext('cage','Käfig-Transformation','Umschalt+G',IC.cage,tool,'handle');
 for(const o of['#opts','#topts'])document.querySelector(o).addEventListener('click',e=>{
  const b=e.target.closest('[data-tfm]');if(b){if(st&&st.changed)W.apply();Tools.o.tf.mode=b.dataset.tfm;W.cancel();return}
  const so=e.target.closest('[data-tfo]');if(so){Tools.o.tf[so.dataset.tfo]=so.dataset.v;Tools.opts();return}
  const x=e.target.closest('[data-tfx]');if(!x)return;if(x.dataset.tfx==='apply')W.apply();else if(x.dataset.tfx==='pivot'){if(st){st.piv=ctr(st.q);View.draw()}}else W.cancel()});
 for(const o of['#opts','#topts'])document.querySelector(o).addEventListener('change',e=>{const c=e.target;
  if(c.matches('[data-tfc]')){Tools.o.tf.center=c.checked;return}
  if(!c.dataset||!c.dataset.tfn||!ensure())return;const v=+c.value||0,id=c.dataset.tfn;
  if(id==='shx'||id==='shy'){const nx=id==='shx'?v:st.sh.x,ny=id==='shy'?v:st.sh.y;st.q=shearBy(st.q,nx-st.sh.x,ny-st.sh.y);st.sh={x:nx,y:ny}}
  else{st.ang[id[1]]=Math.max(id==='az'?-180:-85,Math.min(id==='az'?180:85,v));st.q=q3d()}
  st.changed=true;preview()});
 return W})();
