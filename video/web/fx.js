// Übergänge und Effekte für die Vorschau. Sie bilden nach, was ffmpeg beim Export rechnet.
const FX=(()=>{
 const F={};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 // Maske eines eigenen Übergangs: Wert 0..1 je Bildpunkt (gleiche Formel wie beim Export)
 F.maskValue=(c,u,v,aspect)=>{const a=(c.angle||0)*Math.PI/180,co=Math.cos(a),si=Math.sin(a),n=Math.max(1,Math.round(c.count||1));
  const lin=((u-.5)*co+(v-.5)*si)/(Math.abs(co)+Math.abs(si))+.5;let m;
  switch(c.shape){case'circle':m=Math.hypot(u-.5,(v-.5)*aspect)/Math.hypot(.5,.5*aspect);break;case'diamond':m=Math.abs(u-.5)+Math.abs(v-.5);break;
   case'blinds':m=lin*n-Math.floor(lin*n);break;case'checker':m=((Math.floor(u*n)+Math.floor(v*n))%2)*.5+lin*.5;break;
   case'clock':{const r=(Math.atan2(v-.5,u-.5)+Math.PI+a)/(2*Math.PI);m=r-Math.floor(r);break}default:m=lin}
  return c.invert?1-m:m};
 const maskCache=new Map();
 function maskCanvas(c,p,W,H){const mw=96,mh=Math.max(2,Math.round(mw*H/W));const key=JSON.stringify([c.shape,c.angle,c.count,c.invert,mw,mh]);
  let base=maskCache.get(key);if(!base){base=new Float32Array(mw*mh);for(let y=0;y<mh;y++)for(let x=0;x<mw;x++)base[y*mw+x]=F.maskValue(c,(x+.5)/mw,(y+.5)/mh,H/W);maskCache.set(key,base);if(maskCache.size>40)maskCache.delete(maskCache.keys().next().value)}
  const s=Math.max(.01,Math.min(1,c.soft??.2));const cv=document.createElement('canvas');cv.width=mw;cv.height=mh;const x=cv.getContext('2d');const id=x.createImageData(mw,mh);
  for(let i=0;i<base.length;i++){id.data[i*4+3]=clamp((p*(1+s)-base[i])/s,0,1)*255}x.putImageData(id,0,0);return cv}
 let tmp=null;function scratch(W,H){if(!tmp)tmp=document.createElement('canvas');if(tmp.width!==W||tmp.height!==H){tmp.width=W;tmp.height=H}const x=tmp.getContext('2d');x.clearRect(0,0,W,H);x.globalCompositeOperation='source-over';x.globalAlpha=1;x.filter='none';return[tmp,x]}
 function clipDraw(ctx,img,path){ctx.save();ctx.beginPath();path(ctx);ctx.clip();ctx.drawImage(img,0,0);ctx.restore()}
 function pix(ctx,img,W,H,b){const[c,x]=scratch(Math.max(1,Math.round(W/b)),Math.max(1,Math.round(H/b)));x.imageSmoothingEnabled=true;x.drawImage(img,0,0,c.width,c.height);ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(c,0,0,W,H);ctx.restore()}
 // ctx: Ziel; A/B: Leinwände mit altem und neuem Bild; p: 0..1
 F.trans=(ctx,type,p,A,B,W,H,custom)=>{
  p=clamp(p,0,1);const R=Math.hypot(W,H)/2,cx=W/2,cy=H/2;
  const fill=(col,al)=>{ctx.save();ctx.globalAlpha=al;ctx.fillStyle=col;ctx.fillRect(0,0,W,H);ctx.restore()};
  const dz=(img,al,ang,sc,dx=0,dy=0)=>{ctx.save();ctx.globalAlpha=al;ctx.translate(cx+dx,cy+dy);ctx.rotate(ang);ctx.scale(sc,sc);ctx.drawImage(img,-cx,-cy);ctx.restore()};
  const da=(img,al=1,dx=0,dy=0,sx=1,sy=1)=>{ctx.save();ctx.globalAlpha=al;ctx.translate(cx+dx,cy+dy);ctx.scale(sx,sy);ctx.drawImage(img,-cx,-cy);ctx.restore()};
  if(type&&type.startsWith('custom')&&custom){da(A);const[c,x]=scratch(W,H);x.drawImage(B,0,0);x.globalCompositeOperation='destination-in';x.imageSmoothingEnabled=true;x.drawImage(maskCanvas(custom,p,W,H),0,0,W,H);ctx.drawImage(c,0,0);return}
  switch(type){
  case'fadeblack':case'fadewhite':case'fadegrays':{const col=type==='fadeblack'?'#000':type==='fadewhite'?'#fff':'#777';if(p<.5){da(A);fill(col,p*2)}else{da(B);fill(col,(1-p)*2)}return}
  case'hblur':{ctx.save();ctx.filter=`blur(${Math.sin(p*Math.PI)*W/60}px)`;da(A,1-p);da(B,p);ctx.restore();return}
  case'wipeleft':case'smoothleft':da(A);clipDraw(ctx,B,c=>c.rect(W*(1-p),0,W*p,H));return
  case'wiperight':case'smoothright':da(A);clipDraw(ctx,B,c=>c.rect(0,0,W*p,H));return
  case'wipeup':case'smoothup':da(A);clipDraw(ctx,B,c=>c.rect(0,H*(1-p),W,H*p));return
  case'wipedown':case'smoothdown':da(A);clipDraw(ctx,B,c=>c.rect(0,0,W,H*p));return
  case'diagtl':da(A);clipDraw(ctx,B,c=>{c.moveTo(0,0);c.lineTo(W*2*p,0);c.lineTo(0,H*2*p)});return
  case'diagtr':da(A);clipDraw(ctx,B,c=>{c.moveTo(W,0);c.lineTo(W-W*2*p,0);c.lineTo(W,H*2*p)});return
  case'diagbl':da(A);clipDraw(ctx,B,c=>{c.moveTo(0,H);c.lineTo(W*2*p,H);c.lineTo(0,H-H*2*p)});return
  case'diagbr':da(A);clipDraw(ctx,B,c=>{c.moveTo(W,H);c.lineTo(W-W*2*p,H);c.lineTo(W,H-H*2*p)});return
  case'slideleft':da(A,1,-W*p);da(B,1,W*(1-p));return
  case'slideright':da(A,1,W*p);da(B,1,-W*(1-p));return
  case'slideup':da(A,1,0,-H*p);da(B,1,0,H*(1-p));return
  case'slidedown':da(A,1,0,H*p);da(B,1,0,-H*(1-p));return
  case'squeezeh':if(p<.5)da(A,1,0,0,1-p*2,1);else da(B,1,0,0,p*2-1,1);return
  case'squeezev':if(p<.5)da(A,1,0,0,1,1-p*2);else da(B,1,0,0,1,p*2-1);return
  case'zoomin':da(B,p);da(A,1-p,0,0,1+p,1+p);return
  case'circleopen':da(A);clipDraw(ctx,B,c=>c.arc(cx,cy,R*p,0,7));return
  case'circleclose':da(B);clipDraw(ctx,A,c=>c.arc(cx,cy,R*(1-p),0,7));return
  case'circlecrop':fill('#000',1);if(p<.5)clipDraw(ctx,A,c=>c.arc(cx,cy,R*(1-p*2),0,7));else clipDraw(ctx,B,c=>c.arc(cx,cy,R*(p*2-1),0,7));return
  case'rectcrop':{fill('#000',1);const k=p<.5?1-p*2:p*2-1;clipDraw(ctx,p<.5?A:B,c=>c.rect(cx-cx*k,cy-cy*k,W*k,H*k));return}
  case'radial':da(A);clipDraw(ctx,B,c=>{c.moveTo(cx,cy);c.arc(cx,cy,R*1.5,-Math.PI/2,-Math.PI/2+p*Math.PI*2);c.closePath()});return
  case'vertopen':da(A);clipDraw(ctx,B,c=>c.rect(cx-W*p/2,0,W*p,H));return
  case'vertclose':da(B);clipDraw(ctx,A,c=>c.rect(cx-W*(1-p)/2,0,W*(1-p),H));return
  case'horzopen':da(A);clipDraw(ctx,B,c=>c.rect(0,cy-H*p/2,W,H*p));return
  case'horzclose':da(B);clipDraw(ctx,A,c=>c.rect(0,cy-H*(1-p)/2,W,H*(1-p)));return
  case'hlslice':case'hrslice':case'vuslice':case'vdslice':{da(A);const n=10;clipDraw(ctx,B,c=>{for(let i=0;i<n;i++){const k=clamp(p*2-(type==='hrslice'||type==='vdslice'?i:n-1-i)/n,0,1);
    if(type[0]==='h')c.rect(i*W/n,0,W/n*k,H);else c.rect(0,i*H/n,W,H/n*k)}});return}
  case'pixelize':{const b=1+Math.sin(p*Math.PI)*Math.min(W,H)/16;pix(ctx,p<.5?A:B,W,H,b);return}
  case'm-zoomin':{dz(A,1-p,0,1+1.2*p*p);dz(B,p,0,1+.6*(1-p)**2);return}
  case'm-zoomout':{dz(A,1-p,0,1+.3*p);dz(B,p,0,1+1.2*(1-p)**2);return}
  case'm-spin':case'm-spinl':{const s=type==='m-spin'?1:-1;fill('#000',1);dz(A,1-p,s*Math.PI*p*p,1);dz(B,p,-s*Math.PI*(1-p)**2,1);return}
  case'm-spinzoom':{fill('#000',1);dz(A,1-p,Math.PI*.5*p*p,1+p*p);dz(B,p,-Math.PI*.5*(1-p)**2,1+(1-p)**2);return}
  case'm-shake':case'm-glitch':{const g=type==='m-glitch',amp=g?.06:.1,fr=g?140:47,t=p*.8;const ja=Math.sin(Math.PI*p),jb=Math.sin(Math.PI*p);
    const sx=(1/(1-amp));const off=(k,s)=>[W*amp/2*Math.sin(t*fr)*k*s,H*amp/2*Math.cos(t*fr*.77)*k*s];
    ctx.save();if(g)ctx.filter=`hue-rotate(${Math.round(180*Math.sin(t*90)*ja)}deg)`;
    const[ax,ay]=off(ja,1);if(g&&p>.5){const[c,x]=scratch(Math.max(1,Math.round(W/12)),Math.max(1,Math.round(H/12)));x.drawImage(B,0,0,c.width,c.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(c,0,0,W,H)}else{dz(A,1,0,sx,ax,ay);dz(B,p,0,sx,-ax,-ay)}ctx.restore();return}
  case'm-crosszoom':{ctx.save();ctx.filter=`blur(${(p>.15&&p<.85?14*H/1080:0).toFixed(1)}px)`;dz(A,1-p,0,1+1.5*p*p);dz(B,p,0,1+1.5*(1-p)**2);ctx.restore();return}
  case'm-speedblur':{ctx.save();ctx.filter=`blur(${(p>.15&&p<.85?22*H/1080:0).toFixed(1)}px)`;da(A,1-p);da(B,p);ctx.restore();return}
  case'm-whipl':case'm-whipr':{const s=type==='m-whipl'?-1:1;ctx.save();ctx.filter=`blur(${(p>.15&&p<.85?26*H/1080:0).toFixed(1)}px)`;da(A,1,s*W*p);da(B,1,-s*W*(1-p));ctx.restore();return}
  case'm-light':case'm-burn':{const warm=type==='m-light'?'sepia(.6) saturate(2) hue-rotate(-15deg)':'sepia(1) saturate(3) hue-rotate(-30deg)';ctx.save();
    if(p<.5){ctx.filter=p>.1?warm+(type==='m-light'&&p>.2?' brightness(1.6)':''):'none';da(A);ctx.restore();fill(type==='m-light'?'#fff':'#000',p*2)}else{ctx.filter=p<.85?warm:'none';da(B);ctx.restore();fill(type==='m-light'?'#fff':'#000',(1-p)*2)}return}
  case'm-flare':{ctx.save();if(p<.5){ctx.filter=p>.17?'brightness(3)':'none';da(A);ctx.restore();fill('#fff',p*2)}else{ctx.restore();dz(B,1,0,1+.2*(1-p)**2);fill('#fff',(1-p)*2)}return}
  case'm-flash':{if(p<.5){dz(A,1,0,1+.5*p*p);fill('#fff',p*2)}else{dz(B,1,0,1+.5*(1-p)**2);fill('#fff',(1-p)*2)}return}
  case'fadefast':{const k=clamp(p*1.6,0,1);da(A,1-k);da(B,k);return}
  case'fadeslow':{const k=p*p;da(A,1-k);da(B,k);return}
  case'wipetl':da(A);clipDraw(ctx,B,c=>c.rect(0,0,W*p,H*p));return
  case'wipetr':da(A);clipDraw(ctx,B,c=>c.rect(W*(1-p),0,W*p,H*p));return
  case'wipebl':da(A);clipDraw(ctx,B,c=>c.rect(0,H*(1-p),W*p,H*p));return
  case'wipebr':da(A);clipDraw(ctx,B,c=>c.rect(W*(1-p),H*(1-p),W*p,H*p));return
  case'coverleft':da(A);da(B,1,W*(1-p));return
  case'coverright':da(A);da(B,1,-W*(1-p));return
  case'coverup':da(A);da(B,1,0,H*(1-p));return
  case'coverdown':da(A);da(B,1,0,-H*(1-p));return
  case'revealleft':da(B);da(A,1,-W*p);return
  case'revealright':da(B);da(A,1,W*p);return
  case'revealup':da(B);da(A,1,0,-H*p);return
  case'revealdown':da(B);da(A,1,0,H*p);return
  case'hlwind':case'hrwind':case'vuwind':case'vdwind':{da(A);const n=48,hz=type[0]==='h';clipDraw(ctx,B,c=>{for(let i=0;i<n;i++){const r=(Math.sin(i*12.9898)*43758.5453)%1,j=Math.abs(r)*.35;const k=clamp(p*(1+.35)-j,0,1);
    if(hz){const y=i*H/n,h=H/n+1;type==='hlwind'?c.rect(W*(1-k),y,W*k,h):c.rect(0,y,W*k,h)}else{const x=i*W/n,w=W/n+1;type==='vuwind'?c.rect(x,H*(1-k),w,H*k):c.rect(x,0,w,H*k)}}});return}
  default:da(A,1-p);da(B,p)}};

 // Effekte: CSS-Filter (Vorschau) und Sonderfälle
 F.effects=[];
 F.cssFor=(clip)=>{const e=F.effects.find(x=>x.id===clip.effect);let f=!e||['vignette','pixel','grain'].includes(e.css)?'':e.css.startsWith('@')?(e.css.split('|')[1]||'')+' ':e.css+' ';
  if(clip.expo)f+=`brightness(${Math.pow(2,clip.expo*1.2).toFixed(3)}) `;if(clip.enhance)f+='contrast(1.08) saturate(1.18) ';if(clip.temp||clip.tint)f+=`url(#${tempFilter(clip.temp||0,clip.tint||0)}) `;
  if(clip.bright)f+=`brightness(${1+clip.bright*.6}) `;if(clip.contrast)f+=`contrast(${1+clip.contrast}) `;if(clip.sat)f+=`saturate(${1+clip.sat}) `;return f.trim()||'none'};
 // Farbtemperatur und Farbton als SVG-Farbmatrix (Canvas-Filter verweisen darauf)
 function tempFilter(t,g){t=Math.round(t*20)/20;g=Math.round(g*20)/20;const id=`ct_${Math.round(t*100)}_${Math.round(g*100)}`.replace(/-/g,'m');if(document.getElementById(id))return id;
  let svg=document.getElementById('fxsvg');if(!svg){svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='fxsvg';svg.setAttribute('width','0');svg.setAttribute('height','0');svg.style.position='absolute';document.body.append(svg)}
  const r=1+.25*t,b=1-.25*t,gg=1-.18*g,rb=1+.06*g;const fl=document.createElementNS('http://www.w3.org/2000/svg','filter');fl.id=id;fl.setAttribute('color-interpolation-filters','sRGB');
  fl.innerHTML=`<feColorMatrix type="matrix" values="${r*rb} 0 0 0 0  0 ${gg} 0 0 0  0 0 ${b*rb} 0 0  0 0 0 1 0"/>`;svg.append(fl);return id}
 // Farbe freistellen: Pixel nahe der Schlüsselfarbe durchsichtig machen (wie colorkey beim Export)
 F.chroma=(x,w,h,hex,sim,edge)=>{const d=x.getImageData(0,0,w,h),a=d.data;const kr=parseInt(hex.slice(1,3),16),kg=parseInt(hex.slice(3,5),16),kb=parseInt(hex.slice(5,7),16);const S=sim*441,E=Math.max(1,edge*441);
  for(let i=0;i<a.length;i+=4){const dist=Math.hypot(a[i]-kr,a[i+1]-kg,a[i+2]-kb);if(dist<S)a[i+3]=0;else if(dist<S+E)a[i+3]=a[i+3]*(dist-S)/E}x.putImageData(d,0,0)};
 F.post=(ctx,clip,W,H,draw)=>{ // Effekte, die nicht als CSS-Filter gehen
  if(clip.effect==='pixel'){const[c,x]=scratch(Math.round(W/16),Math.round(H/16));x.drawImage(draw,0,0,c.width,c.height);ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(c,0,0,W,H);ctx.restore();return true}
  return false};
 F.vignette=(ctx,W,H,amt=.8)=>{const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*(.5-amt*.25),W/2,H/2,Math.hypot(W,H)/2);g.addColorStop(0,'#0000');g.addColorStop(1,`rgba(0,0,0,${Math.min(1,amt*1.0)})`);ctx.fillStyle=g;ctx.fillRect(0,0,W,H)};

 // Filmkorn: wechselndes Rauschen über dem Bild
 const noise=[];F.grain=(ctx,W,H)=>{if(!noise.length)for(let k=0;k<4;k++){const c=document.createElement('canvas');c.width=c.height=160;const x=c.getContext('2d'),d=x.createImageData(160,160);for(let i=0;i<d.data.length;i+=4){const v=Math.random()*255;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}x.putImageData(d,0,0);noise.push(c)}
  ctx.save();ctx.globalAlpha=.16;ctx.globalCompositeOperation='overlay';ctx.fillStyle=ctx.createPattern(noise[Math.floor(performance.now()/60)%4],'repeat');ctx.fillRect(0,0,W,H);ctx.restore()};
 // Sondereffekte für die Vorschau (bilden die ffmpeg-Filter des Exports nach)
 const work=[document.createElement('canvas'),document.createElement('canvas')];
 const wk=(i,w,h)=>{const c=work[i];if(c.width!==w||c.height!==h){c.width=w;c.height=h}const x=c.getContext('2d',{willReadFrequently:true});x.setTransform(1,0,0,1,0,0);x.globalCompositeOperation='source-over';x.globalAlpha=1;x.filter='none';x.clearRect(0,0,w,h);return[c,x]};
 const TURBO=[[48,18,59],[70,107,227],[40,187,236],[50,241,152],[164,252,60],[237,208,58],[251,128,34],[210,49,5],[122,4,3]];
 function lut(v){const p=v/255*(TURBO.length-1),i=Math.min(TURBO.length-2,Math.floor(p)),k=p-i;return TURBO[i].map((c,j)=>c+(TURBO[i+1][j]-c)*k)}
 F.motion=(n,t)=>n==='shake'?{dx:.03*.8*Math.sin(t*13),dy:.03*.8*Math.cos(t*11),s:1/.94}:n==='pulse'?{dx:0,dy:0,s:1+.07*Math.abs(Math.sin(t*Math.PI*2))**4}:null;
 F.special=(n,img,w,h,t)=>{const k=Math.min(1,960/Math.max(2,w));w=Math.max(2,Math.round(w*k));h=Math.max(2,Math.round(h*k));
  if(n==='shake'||n==='pulse')return img;
  const[c,x]=wk(0,w,h);
  if(n==='mirror'||n==='kaleido'||n==='mirrorv'){x.drawImage(img,0,0,w,h);const[c2,x2]=wk(1,w,h);x2.drawImage(c,0,0);x.clearRect(0,0,w,h);
   const hw=n==='mirrorv'?w:w/2,hh=n==='mirror'?h:h/2;x.drawImage(c2,0,0,hw,hh,0,0,hw,hh);
   if(n!=='mirrorv'){x.save();x.translate(w,0);x.scale(-1,1);x.drawImage(c2,0,0,hw,hh,0,0,hw,hh);x.restore()}
   if(n!=='mirror'){const[c3,x3]=wk(1,w,h);x3.drawImage(c,0,0,w,hh,0,0,w,hh);x.save();x.translate(0,h);x.scale(1,-1);x.drawImage(c3,0,0,w,hh,0,0,w,hh);x.restore()}return c}
  if(n==='rgbshift'||n==='vhs'){const s=Math.max(1,w*(n==='vhs'?5:7)/1920*1.6);x.drawImage(img,0,0,w,h);const[c2,x2]=wk(1,w,h);
   x2.drawImage(c,0,0);x2.globalCompositeOperation='multiply';x2.fillStyle='#ff0000';x2.fillRect(0,0,w,h);x2.globalCompositeOperation='destination-in';x2.drawImage(c,0,0);
   x.globalCompositeOperation='multiply';x.fillStyle='#00ffff';x.fillRect(0,0,w,h);x.globalCompositeOperation='destination-in';x.drawImage(img,0,0,w,h);
   const d=x.getImageData(0,0,w,h);x.clearRect(0,0,w,h);x.globalCompositeOperation='source-over';x.putImageData(d,s,0);x.globalCompositeOperation='lighter';x.drawImage(c2,-s,0);x.globalCompositeOperation='source-over';
   if(n==='vhs'){F.grain(x,w,h);x.fillStyle='rgba(0,0,0,.22)';const k=Math.max(2,h/270);for(let y=0;y<h;y+=k*2)x.fillRect(0,y,w,k*.5)}return c}
  if(n==='oldfilm'||n==='nightvision'){x.drawImage(img,0,0,w,h);if(n==='oldfilm'){x.fillStyle=`rgba(${Math.sin(t*23)>0?'255,255,255':'0,0,0'},${Math.abs(.06*Math.sin(t*23))})`;x.fillRect(0,0,w,h)}F.grain(x,w,h);F.vignette(x,w,h,n==='oldfilm'?.7:.9);return c}
  if(n==='thermal'||n==='poster'||n==='sketch'){x.drawImage(img,0,0,w,h);const d=x.getImageData(0,0,w,h),a=d.data;
   if(n==='thermal')for(let i=0;i<a.length;i+=4){const[r,g,b]=lut(.299*a[i]+.587*a[i+1]+.114*a[i+2]);a[i]=r;a[i+1]=g;a[i+2]=b}
   else if(n==='poster')for(let i=0;i<a.length;i+=4){a[i]=(a[i]>>6)*64+32;a[i+1]=(a[i+1]>>6)*64+32;a[i+2]=(a[i+2]>>6)*64+32}
   else{const L=new Float32Array(w*h);for(let i=0,j=0;i<a.length;i+=4,j++)L[j]=.299*a[i]+.587*a[i+1]+.114*a[i+2];
    for(let y=0;y<h;y++)for(let X=0;X<w;X++){const j=y*w+X;let g=0;if(X>0&&y>0&&X<w-1&&y<h-1){const gx=-L[j-w-1]-2*L[j-1]-L[j+w-1]+L[j-w+1]+2*L[j+1]+L[j+w+1],gy=-L[j-w-1]-2*L[j-w]-L[j-w+1]+L[j+w-1]+2*L[j+w]+L[j+w+1];g=Math.hypot(gx,gy)}
     const v=255-Math.min(255,g*1.2);a[j*4]=a[j*4+1]=a[j*4+2]=v}}
   x.putImageData(d,0,0);return c}
  return img};
 // Beispielbilder für die Kacheln in der Bibliothek
 F.sample=(W,H,which)=>{const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,W,H);if(which){g.addColorStop(0,'#ff8a3d');g.addColorStop(1,'#e5409a')}else{g.addColorStop(0,'#3d7dff');g.addColorStop(1,'#25c2b8')}
  x.fillStyle=g;x.fillRect(0,0,W,H);x.fillStyle='#fff';x.globalAlpha=.9;x.font=`bold ${H*.45}px Segoe UI, sans-serif`;x.textAlign='center';x.textBaseline='middle';x.fillText(which?'B':'A',W/2,H/2);return c};
 return F})();
