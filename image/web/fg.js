// Vordergrundauswahl: grob umranden, optional Motiv (und Hintergrund mit Alt) anmalen -> Auswahl des Motivs.
// Farbmodell aus Histogrammen (16×16×16), zwei Verfeinerungsrunden, Glätten und kleine Inseln entfernen.
const FgSel=(()=>{const F={};const {esc}=Kit;const t=s=>Kit.t(s);
 let poly=null,mfg=null,mbg=null,drag=null;
 const reset=()=>{poly=null;mfg=null;mbg=null;View.draw()};
 const compute=()=>{const d=Doc.d;if(!poly||poly.length<3)return;const out=Doc.need?Doc.render():Doc.out;
  const k=Math.min(1,700/Math.max(d.w,d.h)),W=Math.max(1,Math.round(d.w*k)),H=Math.max(1,Math.round(d.h*k));
  const img=Doc.mk(W,H),ic=img.getContext('2d');ic.drawImage(out,0,0,W,H);const px=ic.getImageData(0,0,W,H).data;
  const reg=Doc.mk(W,H),rc=reg.getContext('2d');rc.fillStyle='#fff';rc.beginPath();poly.forEach(([x,y],i)=>i?rc.lineTo(x*k,y*k):rc.moveTo(x*k,y*k));rc.closePath();rc.fill();const R=rc.getImageData(0,0,W,H).data;
  const mk2=m=>{if(!m)return null;const c=Doc.mk(W,H);c.getContext('2d').drawImage(m,0,0,W,H);return c.getContext('2d').getImageData(0,0,W,H).data};const MF=mk2(mfg),MB=mk2(mbg);
  let bx0=W,by0=H,bx1=0,by1=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(R[(y*W+x)*4+3]>127){bx0=Math.min(bx0,x);bx1=Math.max(bx1,x);by0=Math.min(by0,y);by1=Math.max(by1,y)}
  const sz=Math.max(4,Math.round(Math.max(bx1-bx0,by1-by0)*.08));
  // Abstand zum Rand der Region (grob, über Distanztransformation in zwei Durchgängen)
  const N=W*H,inside=new Uint8Array(N),dist=new Float32Array(N);for(let i=0;i<N;i++){inside[i]=R[i*4+3]>127;dist[i]=inside[i]?1e9:0}
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!inside[i])continue;let v=dist[i];if(x>0)v=Math.min(v,dist[i-1]+1);if(y>0)v=Math.min(v,dist[i-W]+1);if(x===0||y===0)v=Math.min(v,1);dist[i]=v}
  for(let y=H-1;y>=0;y--)for(let x=W-1;x>=0;x--){const i=y*W+x;if(!inside[i])continue;let v=dist[i];if(x<W-1)v=Math.min(v,dist[i+1]+1);if(y<H-1)v=Math.min(v,dist[i+W]+1);dist[i]=v}
  const bin=i=>(px[i*4]>>4)<<8|(px[i*4+1]>>4)<<4|(px[i*4+2]>>4);
  const hf=new Float32Array(4096),hb=new Float32Array(4096);
  const add=(h,i,w=1)=>{h[bin(i)]+=w};
  const fill=(fgOf)=>{hf.fill(0);hb.fill(0);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(px[i*4+3]<10)continue;
    if(MF&&MF[i*4+3]>100){add(hf,i,4);continue}if(MB&&MB[i*4+3]>100){add(hb,i,4);continue}
    const nearBox=x>=bx0-sz*2&&x<=bx1+sz*2&&y>=by0-sz*2&&y<=by1+sz*2;if(!inside[i]){if(nearBox)add(hb,i);continue}
    const f=fgOf(i);if(f===1)add(hf,i);else if(f===0)add(hb,i,.7)}};
  const blurH=h=>{const o=new Float32Array(4096);for(let r=0;r<16;r++)for(let g=0;g<16;g++)for(let b=0;b<16;b++){let s=0,n=0;for(let dr=-1;dr<=1;dr++)for(let dg=-1;dg<=1;dg++)for(let db=-1;db<=1;db++){const R2=r+dr,G2=g+dg,B2=b+db;if(R2<0||G2<0||B2<0||R2>15||G2>15||B2>15)continue;const w=dr||dg||db?.35:1;s+=h[R2<<8|G2<<4|B2]*w;n+=w}o[r<<8|g<<4|b]=s/n}return o};
  const prob=new Float32Array(N);
  const classify=()=>{const F2=blurH(hf),B2=blurH(hb);let sf=0,sb=0;for(let i=0;i<4096;i++){sf+=F2[i];sb+=B2[i]}sf=sf||1;sb=sb||1;
   for(let i=0;i<N;i++){if(!inside[i]){prob[i]=0;continue}const q=bin(i),a=F2[q]/sf+1e-7,b=B2[q]/sb+1e-7;let p=a/(a+b);const dd=Math.min(1,dist[i]/sz);p=p*.75+.25*dd*.9;
    if(MF&&MF[i*4+3]>100)p=1;if(MB&&MB[i*4+3]>100)p=0;prob[i]=p}};
  fill(i=>dist[i]>sz?1:dist[i]<2?0:-1);classify();
  for(let it=0;it<2;it++){fill(i=>prob[i]>.5?1:0);classify()}
  // glätten (3×3 Mittel, zweimal)
  for(let it=0;it<2;it++){const o=new Float32Array(prob);for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;o[i]=(prob[i]*4+prob[i-1]+prob[i+1]+prob[i-W]+prob[i+W])/8}prob.set(o)}
  // Inseln: nur große Teile behalten (oder solche mit Motiv-Markierung)
  const lab=new Int32Array(N).fill(-1),sizes=[],marked=[];let nl=0;for(let i=0;i<N;i++){if(prob[i]<=.5||lab[i]>=0)continue;let cnt=0,mk=false;const st=[i];lab[i]=nl;while(st.length){const j=st.pop();cnt++;if(MF&&MF[j*4+3]>100)mk=true;const x=j%W,y=(j/W)|0;for(const q of[x>0?j-1:-1,x<W-1?j+1:-1,y>0?j-W:-1,y<H-1?j+W:-1])if(q>=0&&lab[q]<0&&prob[q]>.5){lab[q]=nl;st.push(q)}}sizes.push(cnt);marked.push(mk);nl++}
  const big=Math.max(0,...sizes);
  const m=Doc.mk(W,H),mc=m.getContext('2d'),md=mc.createImageData(W,H),q=md.data;for(let i=0;i<N;i++){const l=lab[i];if(l<0)continue;if(sizes[l]<big*.08&&!marked[l])continue;q[i*4]=q[i*4+1]=q[i*4+2]=255;q[i*4+3]=Math.min(255,(prob[i]-.5)*2*255*2+128)}
  mc.putImageData(md,0,0);const full=Doc.mk(d.w,d.h),fc=full.getContext('2d');fc.imageSmoothingQuality='high';fc.drawImage(m,0,0,d.w,d.h);
  Doc._label=t('Vordergrundauswahl');Sel.combine(full,'replace');Kit.toast(t('Motiv ausgewählt. Mit Pinselstrichen nachbessern: Motiv anmalen, Alt = Hintergrund.'))};
 F.compute=compute;
 const markDraw=(m,x,y,lx,ly)=>{const c=m.getContext('2d');c.strokeStyle='#fff';c.lineCap='round';c.lineWidth=Math.max(4,14/View.z);c.beginPath();c.moveTo(lx,ly);c.lineTo(x,y);c.stroke()};
 Tools.ext('fgsel','Vordergrundauswahl (Motiv freistellen)','F','<path d="M12 3c-3 0-5 2.5-5 5.5 0 2 1 3.5 2 4.5-3 1-5 3.5-5 8h16c0-4.5-2-7-5-8 1-1 2-2.5 2-4.5C17 5.5 15 3 12 3z" stroke-dasharray="3 2"/>',{
  down(s,x,y,e){const d=Doc.d;if(!poly){drag={lasso:[[x,y]]};return}
   const key=e.altKey?'bg':'fg';if(key==='fg'&&!mfg)mfg=Doc.mk(d.w,d.h);if(key==='bg'&&!mbg)mbg=Doc.mk(d.w,d.h);drag={mark:key==='fg'?mfg:mbg,lx:x,ly:y};markDraw(drag.mark,x,y,x,y);View.draw()},
  move(s,x,y){if(!drag)return;if(drag.lasso){drag.lasso.push([x,y]);View.draw();return}markDraw(drag.mark,x,y,drag.lx,drag.ly);drag.lx=x;drag.ly=y;View.draw()},
  up(){const d=drag;drag=null;if(!d)return;if(d.lasso){if(d.lasso.length<3)return;poly=d.lasso;Kit.$('#busy').hidden=false;setTimeout(()=>{try{compute()}finally{Kit.$('#busy').hidden=true;Tools.opts()}},20);return}
   Kit.$('#busy').hidden=false;setTimeout(()=>{try{compute()}finally{Kit.$('#busy').hidden=true}},20)},
  overlay(c,active){if(!active)return;c.save();const pl=drag&&drag.lasso||poly;if(pl){c.setLineDash([6,4]);c.lineWidth=1.5;c.strokeStyle='#22d3ee';c.beginPath();pl.forEach(([x,y],i)=>{const [sx,sy]=View.toScr(x,y);i?c.lineTo(sx,sy):c.moveTo(sx,sy)});if(!drag)c.closePath();c.stroke()}
   for(const [m,col] of[[mfg,'#22c55e'],[mbg,'#ef4444']]){if(!m)continue;const tcv=Doc.mk(m.width,m.height),tc=tcv.getContext('2d');tc.drawImage(m,0,0);tc.globalCompositeOperation='source-in';tc.fillStyle=col;tc.fillRect(0,0,m.width,m.height);c.globalAlpha=.45;c.drawImage(tcv,View.ox,View.oy,m.width*View.z,m.height*View.z);c.globalAlpha=1}c.restore()},
  opts(){return`<p class="hint2" style="margin-top:0">${esc(t(poly?'2. Male über das Motiv (grün). Mit Alt malst du Hintergrund (rot). Die Auswahl wird jedes Mal neu berechnet.':'1. Umrande das Motiv grob mit gedrückter Maustaste.'))}</p><div class="btns" style="margin-top:10px"><button class="btn sm" data-fga="new">${esc(t('Neu beginnen'))}</button><button class="btn sm" data-fga="layer">${esc(t('Als neue Ebene'))}</button><button class="btn sm" data-fga="mask">${esc(t('Als Ebenenmaske'))}</button></div>`},
  leave(){reset()},cursor:'crosshair'},'wand');
 for(const o of['#opts','#topts'])document.querySelector(o).addEventListener('click',e=>{const b=e.target.closest('[data-fga]');if(!b)return;const a=b.dataset.fga;
  if(a==='new'){reset();Sel.none();Tools.opts();return}if(!Sel.has())return Kit.toast(t('Es ist nichts ausgewählt.'));if(a==='layer')UI.act('seltolayer');else UI.act('mask_sel')});
 return F})();
