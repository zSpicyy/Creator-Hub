// Weitere Exportformate: PSD (mit Ebenen), GIF (auch Animation), BMP, TIFF, ICO, PDF. Alles ohne Fremdbibliotheken.
const Exp=(()=>{const E={};
 const rgba=cv=>cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
 class Buf{constructor(){this.a=[];this.n=0}u8(v){this.a.push(v&255);this.n++;return this}u16(v){return this.u8(v>>8).u8(v)}u32(v){return this.u16(v>>>16).u16(v&65535)}
  l16(v){return this.u8(v).u8(v>>8)}l32(v){return this.l16(v&65535).l16(v>>>16)}str(s){for(const c of s)this.u8(c.charCodeAt(0));return this}bytes(b){for(let i=0;i<b.length;i++)this.a.push(b[i]);this.n+=b.length;return this}out(){return new Uint8Array(this.a)}}
 // ---- PSD: jede Ebene als eigene Ebene (in Bildgröße gerendert), dazu das Gesamtbild ----
 const BL={'source-over':'norm','multiply':'mul ','screen':'scrn','overlay':'over','darken':'dark','lighten':'lite','color-dodge':'div ','color-burn':'idiv','soft-light':'sLit','hard-light':'hLit','difference':'diff','exclusion':'smud','hue':'hue ','saturation':'sat ','color':'colr','luminosity':'lum '};
 E.psd=(layers,W,H,merged)=>{const b=new Buf();b.str('8BPS').u16(1).bytes(new Uint8Array(6)).u16(4).u32(H).u32(W).u16(8).u16(3).u32(0).u32(0);
  const recs=new Buf(),data=new Buf();
  for(const L of layers){const p=rgba(L.cv),n=W*H;const ch=[0,1,2,3].map(c=>{const o=new Uint8Array(n);for(let i=0;i<n;i++)o[i]=p[i*4+c];return o});
   recs.u32(0).u32(0).u32(H).u32(W).u16(4);for(const id of[-1,0,1,2])recs.u16(id&65535).u32(n+2);
   const nm=unescape(encodeURIComponent(L.name||'Ebene')).slice(0,255);const nl=nm.length+1,pad=(4-nl%4)%4;const extraLen=4+4+nl+pad;
   recs.str('8BIM').str(BL[L.blend]||'norm').u8(Math.round(L.opacity*255)).u8(0).u8(L.visible?0:2).u8(0).u32(extraLen).u32(0).u32(0).u8(nm.length).str(nm);for(let i=0;i<pad;i++)recs.u8(0);
   for(const c of[3,0,1,2]){data.u16(0);data.bytes(ch[c])}}
  const li=new Buf();li.u16(layers.length);const r=recs.out(),d=data.out();let len=2+r.length+d.length;const odd=len%2;
  b.u32(len+odd+4+4).u32(len+odd).u16(layers.length).bytes(r).bytes(d);if(odd)b.u8(0);b.u32(0);
  const mp=rgba(merged),n=W*H;b.u16(0);for(const c of[0,1,2,3]){const o=new Uint8Array(n);for(let i=0;i<n;i++)o[i]=mp[i*4+c];b.bytes(o)}
  return new Blob([b.out()],{type:'image/vnd.adobe.photoshop'})};
 // ---- GIF: Median-Cut-Palette, LZW, optional Animation ----
 const quant=(p,max=255)=>{const cols=[];for(let i=0;i<p.length;i+=4*Math.max(1,Math.floor(p.length/4/60000)))if(p[i+3]>=128)cols.push([p[i],p[i+1],p[i+2]]);
  let boxes=[cols.length?cols:[[0,0,0]]];while(boxes.length<max){let bi=-1,br=-1,bc=0;boxes.forEach((bx,i)=>{if(bx.length<2)return;for(let c=0;c<3;c++){let lo=255,hi=0;for(const v of bx){if(v[c]<lo)lo=v[c];if(v[c]>hi)hi=v[c]}if(hi-lo>br){br=hi-lo;bi=i;bc=c}}});if(bi<0||br<=0)break;
   const bx=boxes[bi].sort((a,b)=>a[bc]-b[bc]);const m=bx.length>>1;boxes.splice(bi,1,bx.slice(0,m),bx.slice(m))}
  return boxes.map(bx=>{const s=[0,0,0];for(const v of bx){s[0]+=v[0];s[1]+=v[1];s[2]+=v[2]}return s.map(x=>Math.round(x/bx.length))})};
 const indexer=pal=>{const cache=new Map();return(r,g,b)=>{const k=(r>>2)<<12|(g>>2)<<6|(b>>2);let v=cache.get(k);if(v!==undefined)return v;let best=0,bd=1e9;for(let i=0;i<pal.length;i++){const q=pal[i],d=(q[0]-r)**2+(q[1]-g)**2+(q[2]-b)**2;if(d<bd){bd=d;best=i}}cache.set(k,best);return best}};
 const lzw=(idx,minBits)=>{const out=new Buf();let cur=0,bits=0;const put=(code,size)=>{cur|=code<<bits;bits+=size;while(bits>=8){out.u8(cur&255);cur>>>=8;bits-=8}};
  const clear=1<<minBits,eoi=clear+1;let size=minBits+1,next=eoi+1,dict=new Map();put(clear,size);let w=idx[0];
  for(let i=1;i<idx.length;i++){const k=idx[i],key=w*4096+k;const v=dict.get(key);if(v!==undefined){w=v;continue}put(w,size);if(next<4096){dict.set(key,next++);if(next>(1<<size)&&size<12)size++}else{put(clear,size);dict=new Map();size=minBits+1;next=eoi+1}w=k}
  put(w,size);put(eoi,size);if(bits)out.u8(cur&255);const d=out.out(),b=new Buf();for(let i=0;i<d.length;i+=255){const c=d.subarray(i,i+255);b.u8(c.length).bytes(c)}b.u8(0);return b.out()};
 E.gif=(frames,W,H,delay=100,loop=true)=>{const all=new Uint8ClampedArray(frames.length*Math.min(W*H,40000)*4);let o=0;for(const f of frames){const p=rgba(f);const st=Math.max(1,Math.floor(W*H/40000));for(let i=0;i<W*H&&o<all.length;i+=st,o+=4){all[o]=p[i*4];all[o+1]=p[i*4+1];all[o+2]=p[i*4+2];all[o+3]=p[i*4+3]}}
  const pal=quant(all.subarray(0,o),255);while(pal.length<256)pal.push([0,0,0]);const T=255,find=indexer(pal.slice(0,255));
  const b=new Buf();b.str('GIF89a').l16(W).l16(H).u8(0xF7).u8(0).u8(0);for(const c of pal)b.u8(c[0]).u8(c[1]).u8(c[2]);
  if(frames.length>1&&loop)b.u8(0x21).u8(0xFF).u8(11).str('NETSCAPE2.0').u8(3).u8(1).l16(0).u8(0);
  for(const f of frames){const p=rgba(f),idx=new Uint8Array(W*H);let tr=false;for(let i=0;i<W*H;i++){if(p[i*4+3]<128){idx[i]=T;tr=true}else idx[i]=find(p[i*4],p[i*4+1],p[i*4+2])}
   b.u8(0x21).u8(0xF9).u8(4).u8((frames.length>1?2<<2:0)|(tr?1:0)).l16(Math.round(delay/10)).u8(T).u8(0);
   b.u8(0x2C).l16(0).l16(0).l16(W).l16(H).u8(0).u8(8).bytes(lzw(idx,8))}
  b.u8(0x3B);return new Blob([b.out()],{type:'image/gif'})};
 // ---- BMP (32 Bit mit Alpha) ----
 E.bmp=cv=>{const W=cv.width,H=cv.height,p=rgba(cv),b=new Buf(),sz=W*H*4;b.str('BM').l32(14+108+sz).l32(0).l32(14+108);
  b.l32(108).l32(W).l32(H).l16(1).l16(32).l32(3).l32(sz).l32(2835).l32(2835).l32(0).l32(0).l32(0x00FF0000).l32(0x0000FF00).l32(0x000000FF).l32(0xFF000000).str('BGRs');for(let i=0;i<48;i++)b.u8(0);
  const row=new Uint8Array(W*4);for(let y=H-1;y>=0;y--){for(let x=0;x<W;x++){const i=(y*W+x)*4;row[x*4]=p[i+2];row[x*4+1]=p[i+1];row[x*4+2]=p[i];row[x*4+3]=p[i+3]}b.bytes(row)}return new Blob([b.out()],{type:'image/bmp'})};
 // ---- TIFF (unkomprimiert, RGBA) ----
 E.tiff=cv=>{const W=cv.width,H=cv.height,p=rgba(cv),b=new Buf();const n=10,ifd=8,bps=ifd+2+n*12+4,data=bps+8;b.str('II').l16(42).l32(ifd);b.l16(n);
  const tag=(t,ty,c,v)=>{b.l16(t).l16(ty).l32(c);if(ty===3&&c===1){b.l16(v).l16(0)}else b.l32(v)};
  tag(256,4,1,W);tag(257,4,1,H);tag(258,3,4,bps);tag(259,3,1,1);tag(262,3,1,2);tag(273,4,1,data);tag(277,3,1,4);tag(278,4,1,H);tag(279,4,1,W*H*4);tag(338,3,1,2);b.l32(0);
  b.l16(8).l16(8).l16(8).l16(8);b.bytes(p);return new Blob([b.out()],{type:'image/tiff'})};
 // ---- ICO (PNG-Einträge in mehreren Größen) ----
 E.ico=async cv=>{const sizes=[16,24,32,48,64,128,256];const pngs=[];for(const s of sizes){const c=Doc.mk(s,s),x=c.getContext('2d');x.imageSmoothingQuality='high';const k=Math.min(s/cv.width,s/cv.height);x.drawImage(cv,(s-cv.width*k)/2,(s-cv.height*k)/2,cv.width*k,cv.height*k);pngs.push(new Uint8Array(await (await Doc.blob(c)).arrayBuffer()))}
  const b=new Buf();b.l16(0).l16(1).l16(sizes.length);let off=6+16*sizes.length;sizes.forEach((s,i)=>{b.u8(s>=256?0:s).u8(s>=256?0:s).u8(0).u8(0).l16(1).l16(32).l32(pngs[i].length).l32(off);off+=pngs[i].length});for(const p of pngs)b.bytes(p);return new Blob([b.out()],{type:'image/x-icon'})};
 // ---- PDF (eine Seite, Bild als JPEG) ----
 E.pdf=async(cv,q=.92)=>{const W=cv.width,H=cv.height;const t=Doc.mk(W,H),x=t.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,W,H);x.drawImage(cv,0,0);const jpg=new Uint8Array(await (await Doc.blob(t,'image/jpeg',q)).arrayBuffer());
  const pw=W*.75,ph=H*.75;const parts=[],offs=[];let pos=0;const add=s=>{const u=typeof s==='string'?new TextEncoder().encode(s):s;parts.push(u);pos+=u.length};
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');const obj=(n,body)=>{offs[n]=pos;add(`${n} 0 obj\n`);if(Array.isArray(body))body.forEach(add);else add(body);add('\nendobj\n')};
  const content=`q ${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm /Im0 Do Q`;
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4,[`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`,jpg,'\nendstream']);
  obj(5,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref=pos;let x2=`xref\n0 6\n0000000000 65535 f \n`;for(let i=1;i<=5;i++)x2+=String(offs[i]).padStart(10,'0')+' 00000 n \n';add(x2+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts,{type:'application/pdf'})};
 // Ebenen für PSD/Animation: jede sichtbare Blatt-Ebene einzeln in Bildgröße
 E.layerCanvases=(onlyVisible)=>{const d=Doc.d;return d.layers.filter(L=>L.type!=='group'&&(!onlyVisible||L.visible)).map(L=>{const cv=Doc.mk(d.w,d.h);Doc.drawLayer(cv.getContext('2d'),{...L,visible:true,opacity:1,blend:'source-over'});return{cv,name:L.name,opacity:L.opacity,visible:L.visible,blend:L.blend}})};
 // Drucken über einen unsichtbaren Rahmen
 E.print=cv=>{const url=cv.toDataURL('image/png');const f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.append(f);
  const w=f.contentWindow;w.document.open();w.document.write(`<!doctype html><html><head><title>${Kit.esc(Doc.d.name)}</title><style>@page{margin:10mm}html,body{margin:0}img{max-width:100%;max-height:100vh;display:block;margin:auto}</style></head><body><img src="${url}"></body></html>`);w.document.close();
  const go=()=>{try{w.focus();w.print()}catch(e){Kit.toast(Kit.t('Drucken ist hier nicht möglich. Exportiere als PDF und drucke die Datei.'))}setTimeout(()=>f.remove(),60000)};const im=w.document.querySelector('img');if(im.complete)setTimeout(go,50);else im.onload=go};
 return E})();
