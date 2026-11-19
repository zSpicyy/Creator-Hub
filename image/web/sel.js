// Auswahl: eine Maske in Bildgröße (Alpha = ausgewählt). Rechteck, Ellipse, Lasso, Zauberstab,
// Alles / Nichts / Umkehren, Löschen, Kopieren, Ausschneiden, auf Auswahl zuschneiden.
const Sel=(()=>{const S={};S.mask=null;let edge=null,edgeKey='';
 const mk=(w,h)=>Doc.mk(w,h);
 S.has=()=>!!S.mask;
 S.changed=()=>{edge=null;View.draw()};
 Doc.clearSel=()=>{S.mask=null;edge=null};
 // Maske kombinieren: replace | add | sub | int
 S.combine=(shape,mode='replace')=>{const d=Doc.d;Doc.begin();let m=null;
  if(mode==='replace'||!S.mask)m=mode==='sub'?S.mask:shape;
  else{m=mk(d.w,d.h);const c=m.getContext('2d');c.drawImage(S.mask,0,0);c.globalCompositeOperation=mode==='add'?'source-over':mode==='sub'?'destination-out':'destination-in';c.drawImage(shape,0,0)}
  S.mask=m&&!empty(m)?m:null;S.changed()};
 const empty=m=>{const p=m.getContext('2d').getImageData(0,0,m.width,m.height).data;for(let i=3;i<p.length;i+=16)if(p[i]>0)return false;return true};
 S.shape=(kind,a)=>{const d=Doc.d,m=mk(d.w,d.h),c=m.getContext('2d');c.fillStyle='#fff';c.beginPath();
  if(kind==='rect'){if(a.round>0&&c.roundRect)c.roundRect(a.x,a.y,a.w,a.h,Math.min(a.round,a.w/2,a.h/2));else c.rect(a.x,a.y,a.w,a.h)}else if(kind==='ellipse')c.ellipse(a.x+a.w/2,a.y+a.h/2,Math.max(.5,a.w/2),Math.max(.5,a.h/2),0,0,Math.PI*2);
  else{a.pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath()}c.fill();return m};
 S.all=()=>{const d=Doc.d,m=mk(d.w,d.h),c=m.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,d.w,d.h);S.combine(m)};
 S.none=()=>{if(!S.mask)return;Doc.begin();S.mask=null;S.changed()};
 S.invert=()=>{const d=Doc.d,m=mk(d.w,d.h),c=m.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,d.w,d.h);if(S.mask){c.globalCompositeOperation='destination-out';c.drawImage(S.mask,0,0)}Doc.begin();S.mask=empty(m)?null:m;S.changed()};
 // Zauberstab: ähnliche zusammenhängende Farben im sichtbaren Bild
 S.wand=(x,y,tol,mode,all)=>{const o=Doc.need?Doc.render():Doc.out;const W=o.width,H=o.height;x=Math.floor(x);y=Math.floor(y);if(x<0||y<0||x>=W||y>=H)return;
  const a=o.getContext('2d').getImageData(0,0,W,H).data;const i0=(y*W+x)*4,r0=a[i0],g0=a[i0+1],b0=a[i0+2],a0=a[i0+3];
  const ok=i=>Math.abs(a[i]-r0)<=tol&&Math.abs(a[i+1]-g0)<=tol&&Math.abs(a[i+2]-b0)<=tol&&Math.abs(a[i+3]-a0)<=tol;
  const m=mk(W,H),mc=m.getContext('2d'),id=mc.createImageData(W,H),q=id.data;
  if(all){for(let k=0;k<W*H;k++)if(ok(k*4)){q[k*4]=q[k*4+1]=q[k*4+2]=q[k*4+3]=255}}
  else{const seen=new Uint8Array(W*H);const st=[x,y];
   while(st.length){const yy=st.pop(),xx=st.pop();let l=xx;while(l>=0&&!seen[yy*W+l]&&ok((yy*W+l)*4))l--;l++;let r=xx;while(r<W&&!seen[yy*W+r]&&ok((yy*W+r)*4))r++;
    for(let i=l;i<r;i++){const k=yy*W+i;seen[k]=1;q[k*4]=q[k*4+1]=q[k*4+2]=q[k*4+3]=255;
     if(yy>0&&!seen[k-W]&&ok((k-W)*4))st.push(i,yy-1);if(yy<H-1&&!seen[k+W]&&ok((k+W)*4))st.push(i,yy+1)}}}
  mc.putImageData(id,0,0);S.combine(m,mode)};
 // Maske im Pixelraum einer Bildebene
 S.local=L=>{const m=mk(L.cv.width,L.cv.height),c=m.getContext('2d');c.setTransform(Doc.pixMatrix(L).inverse());c.drawImage(S.mask,0,0);return m};
 // Ergebnis eines Filters nur innerhalb der Auswahl übernehmen
 S.merge=(L,orig,result)=>{if(!S.mask)return result;const M=S.local(L);const out=Doc.clone(orig),c=out.getContext('2d');
  c.globalCompositeOperation='destination-out';c.drawImage(M,0,0);const t=Doc.clone(result),tc=t.getContext('2d');tc.globalCompositeOperation='destination-in';tc.drawImage(M,0,0);
  c.globalCompositeOperation='source-over';c.drawImage(t,0,0);return out};
 // Auswahl verändern: weiche Kante, vergrößern, verkleinern, Rand
 const spread=(m,r)=>{const o=mk(m.width,m.height),c=o.getContext('2d');c.drawImage(m,0,0);const n=Math.max(8,Math.round(r*1.2));for(const f of[1,.5])for(let i=0;i<n;i++){const a=i/n*Math.PI*2;c.drawImage(m,Math.cos(a)*r*f,Math.sin(a)*r*f)}return o};
 const inv=m=>{const o=mk(m.width,m.height),c=o.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,o.width,o.height);c.globalCompositeOperation='destination-out';c.drawImage(m,0,0);return o};
 const hard=m=>{const c=m.getContext('2d'),id=c.getImageData(0,0,m.width,m.height),p=id.data;for(let i=3;i<p.length;i+=4)p[i]=p[i]>127?255:0;c.putImageData(id,0,0);return m};
 S.feather=r=>{if(!S.mask)return;const o=Doc.blurCv(S.mask,r);Doc._label='Auswahl ausblenden';Doc.begin();S.mask=o;S.changed()};
 S.grow=r=>{if(!S.mask)return;const o=hard(spread(S.mask,r));Doc._label='Auswahl vergrößern';Doc.begin();S.mask=o;S.changed()};
 S.shrink=r=>{if(!S.mask)return;const o=inv(hard(spread(inv(S.mask),r)));Doc._label='Auswahl verkleinern';Doc.begin();S.mask=empty(o)?null:o;S.changed()};
 S.border=r=>{if(!S.mask)return;const g=hard(spread(S.mask,r/2)),s2=inv(hard(spread(inv(S.mask),r/2)));const c=g.getContext('2d');c.globalCompositeOperation='destination-out';c.drawImage(s2,0,0);Doc._label='Auswahl-Rand';Doc.begin();S.mask=g;S.changed()};
 S.fromAlpha=()=>{const L=Doc.layer();if(!L)return;const d=Doc.d,m=mk(d.w,d.h),c=m.getContext('2d');Doc.drawLayer(c,{...L,visible:true,opacity:1,blend:'source-over',shadow:{...L.shadow,on:false}});Doc._label='Alpha zu Auswahl';S.combine(m)};
 S.bbox=()=>{const m=S.mask;if(!m)return null;const W=m.width,H=m.height,p=m.getContext('2d').getImageData(0,0,W,H).data;let x0=W,y0=H,x1=-1,y1=-1;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(p[(y*W+x)*4+3]>0){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}return x1<0?null:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1}};
 const pixLayer=()=>{let L=Doc.layer();if(!L){Kit.toast(Kit.t('Wähle zuerst eine Ebene aus.'));return null}if(L.type!=='pixel'){L=Doc.rasterize(L);UI.layers()}return L};
 S.clear=()=>{if(!S.mask)return;Doc.begin();const L=pixLayer();if(!L)return;const cv=Doc.clone(L.cv),c=cv.getContext('2d');c.globalCompositeOperation='destination-out';c.drawImage(S.local(L),0,0);L.cv=cv;Doc.changed('canvas');UI.thumbs()};
 S.fill=col=>{if(!S.mask)return;Doc.begin();const L=pixLayer();if(!L)return;const t=Doc.mk(L.cv.width,L.cv.height),tc=t.getContext('2d');tc.fillStyle=col;tc.fillRect(0,0,t.width,t.height);tc.globalCompositeOperation='destination-in';tc.drawImage(S.local(L),0,0);
  const cv=Doc.clone(L.cv);cv.getContext('2d').drawImage(t,0,0);L.cv=cv;Doc.changed('canvas');UI.thumbs()};
 // Kopieren: ausgewählter Teil der aktiven Ebene (wie er im Bild liegt)
 S.copy=()=>{const L=Doc.layer();if(!L||!S.mask)return null;const b=S.bbox();if(!b)return null;const d=Doc.d,t=mk(d.w,d.h),c=t.getContext('2d');Doc.drawLayer(c,{...L,opacity:1,blend:'source-over',shadow:{...L.shadow,on:false}});c.globalCompositeOperation='destination-in';c.drawImage(S.mask,0,0);
  const o=mk(b.w,b.h);o.getContext('2d').drawImage(t,-b.x,-b.y);return{cv:o,x:b.x,y:b.y,name:L.name}};
 S.cropTo=()=>{const b=S.bbox();if(!b)return Kit.toast(Kit.t('Es ist nichts ausgewählt.'));Doc.crop(b);View.fit()};
 // Umriss der Auswahl (Ameisenlinie) in Bildschirmgröße berechnet
 S.overlay=(ctx,V)=>{if(!S.mask)return;const s=Math.min(1,V.z),key=s.toFixed(3);
  if(!edge||edgeKey!==key){edgeKey=key;const W=Math.max(1,Math.round(S.mask.width*s)),H=Math.max(1,Math.round(S.mask.height*s));const sm=mk(W,H),sc=sm.getContext('2d');sc.drawImage(S.mask,0,0,W,H);
   const p=sc.getImageData(0,0,W,H).data,e=sc.createImageData(W,H),q=e.data;const inn=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&p[(y*W+x)*4+3]>127;
   for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!inn(x,y))continue;if(inn(x-1,y)&&inn(x+1,y)&&inn(x,y-1)&&inn(x,y+1))continue;const i=(y*W+x)*4,v=((x+y)>>2)&1?255:0;q[i]=q[i+1]=q[i+2]=v;q[i+3]=255}
   edge=mk(W,H);edge.getContext('2d').putImageData(e,0,0)}
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(edge,V.ox,V.oy,S.mask.width*V.z,S.mask.height*V.z);ctx.restore()};
 return S})();
