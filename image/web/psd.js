// PSD (Photoshop) und XCF (GIMP) öffnen: Ebenen mit Namen, Position, Deckkraft, Sichtbarkeit und Mischmodus.
const Import=(()=>{const I={};const t=s=>Kit.t(s);
 const PSDBLEND={'norm':'source-over','mul ':'multiply','scrn':'screen','over':'overlay','dark':'darken','lite':'lighten','div ':'color-dodge','idiv':'color-burn','sLit':'soft-light','hLit':'hard-light','diff':'difference','smud':'exclusion','hue ':'hue','sat ':'saturation','colr':'color','lum ':'luminosity','lddg':'color-dodge','lbrn':'color-burn'};
 const toCv=(w,h,ch)=>{const c=Doc.mk(w,h),x=c.getContext('2d'),id=x.createImageData(w,h),d=id.data,n=w*h;for(let i=0;i<n;i++){d[i*4]=ch.r?ch.r[i]:0;d[i*4+1]=ch.g?ch.g[i]:(ch.r?ch.r[i]:0);d[i*4+2]=ch.b?ch.b[i]:(ch.r?ch.r[i]:0);d[i*4+3]=ch.a?ch.a[i]:255}x.putImageData(id,0,0);return c};
 // ---- PSD ----
 const packbits=(b,o,end,out,oi,len)=>{let p=o;const stop=oi+len;while(p<end&&oi<stop){let n=b[p++];if(n>127)n-=256;if(n>=0){for(let k=0;k<=n&&oi<stop;k++)out[oi++]=b[p++]}else if(n!==-128){const v=b[p++];for(let k=0;k<1-n&&oi<stop;k++)out[oi++]=v}}return p};
 I.psd=buf=>{const b=new Uint8Array(buf),v=new DataView(buf);let p=0;const u8=()=>b[p++],u16=()=>{const x=v.getUint16(p);p+=2;return x},i16=()=>{const x=v.getInt16(p);p+=2;return x},u32=()=>{const x=v.getUint32(p);p+=4;return x},i32=()=>{const x=v.getInt32(p);p+=4;return x},str=n=>{let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(b[p++]);return s};
  if(str(4)!=='8BPS')throw new Error(t('Das ist keine gültige PSD-Datei.'));const ver=u16();if(ver!==1)throw new Error(t('Große PSB-Dateien werden noch nicht unterstützt.'));p+=6;
  const nch=u16(),H=u32(),W=u32(),depth=u16(),mode=u16();if(depth!==8&&depth!==16)throw new Error(t('Nur PSD-Dateien mit 8 oder 16 Bit pro Kanal werden unterstützt.'));if(![1,3,4].includes(mode))throw new Error(t('Nur RGB-, CMYK- und Graustufen-PSD-Dateien werden unterstützt.'));const bpc=depth/8;
  const to8=a=>{if(bpc===1)return a;const o=new Uint8Array(a.length/2);for(let i=0;i<o.length;i++)o[i]=a[i*2];return o};
  const cmyk=ch=>{if(mode!==4)return ch;const C=ch.c,M=ch.m,Y=ch.y,K=ch.k,n=C.length,r2=new Uint8Array(n),g2=new Uint8Array(n),b2=new Uint8Array(n);for(let i=0;i<n;i++){const k=K?K[i]/255:1;r2[i]=C[i]*k;g2[i]=M[i]*k;b2[i]=Y[i]*k}return{r:r2,g:g2,b:b2,a:ch.a}};
  {const n=u32();p+=n}{const n=u32();p+=n}const lmLen=u32(),lmEnd=p+lmLen;const layers=[];
  if(lmLen>0){const liLen=u32(),liEnd=p+liLen;if(liLen>0){let cnt=Math.abs(i16());const recs=[];
    for(let k=0;k<cnt;k++){const top=i32(),left=i32(),bottom=i32(),right=i32();const nc=u16();const chans=[];for(let c=0;c<nc;c++)chans.push({id:i16(),len:u32()});str(4);const bk=str(4),op=u8();u8();const flags=u8();u8();
     const exLen=u32(),exEnd=p+exLen;const mLen=u32();p+=mLen;const bLen=u32();p+=bLen;const nl=u8();let name=str(nl);p+=(4-((nl+1)%4))%4;
     while(p+12<=exEnd){const sig=str(4),key=str(4),len=u32(),st=p;if(key==='luni'){const n=u32();let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(u16());name=s}if(key==='lsct'||key==='lsdk'){recs.section=true;chans.divider=true}p=st+len+(len%2);if(sig!=='8BIM'&&sig!=='8B64')break}
     p=exEnd;recs.push({top,left,w:right-left,h:bottom-top,chans,blend:PSDBLEND[bk]||'source-over',op,visible:!(flags&2),name,divider:!!chans.divider})}
    for(const r of recs){const n=Math.max(0,r.w)*Math.max(0,r.h);const ch={};
     for(const c of r.chans){const st=p;const comp=u16();if(c.id<-1||n===0){p=st+c.len;continue}let out=new Uint8Array(n*bpc);const rw=r.w*bpc;
      if(comp===0){out.set(b.subarray(p,p+n*bpc));}else if(comp===1){const counts=[];for(let y=0;y<r.h;y++)counts.push(u16());let q=p;for(let y=0;y<r.h;y++){packbits(b,q,q+counts[y],out,y*rw,rw);q+=counts[y]}}else{p=st+c.len;continue}
      out=to8(out);p=st+c.len;const key=(mode===4?{0:'c',1:'m',2:'y',3:'k','-1':'a'}:{0:'r',1:'g',2:'b','-1':'a'})[c.id];if(key)ch[key]=out}
     if(r.divider||n===0)continue;if(mode===1){ch.g=ch.b=ch.r}const cc=cmyk(ch);layers.push({name:r.name,cv:toCv(r.w,r.h,cc),x:r.left,y:r.top,opacity:r.op/255,visible:r.visible,blend:r.blend})}}
   p=lmEnd}
  if(!layers.length){p=lmEnd;const comp=u16(),n=W*H,ch={},keys=mode===4?['c','m','y','k','a']:['r','g','b','a'];let plane=[];for(let c=0;c<nch;c++)plane.push(new Uint8Array(n*bpc));
   if(comp===0){for(let c=0;c<nch;c++){plane[c].set(b.subarray(p,p+n*bpc));p+=n*bpc}}else{const counts=[];for(let k=0;k<nch*H;k++)counts.push(u16());let k=0;for(let c=0;c<nch;c++)for(let y=0;y<H;y++){packbits(b,p,p+counts[k],plane[c],y*W*bpc,W*bpc);p+=counts[k++]}}plane=plane.map(to8);
   if(mode===1){ch.r=ch.g=ch.b=plane[0];if(nch>1)ch.a=plane[1]}else{for(let c=0;c<Math.min(keys.length,nch);c++)ch[keys[c]]=plane[c]}layers.push({name:t('Hintergrund'),cv:toCv(W,H,cmyk(ch)),x:0,y:0,opacity:1,visible:true,blend:'source-over'})}
  return{w:W,h:H,layers}};
 // ---- XCF ----
 const inflate=async u=>{const ds=new DecompressionStream('deflate');const w=ds.writable.getWriter();w.write(u);w.close();return new Uint8Array(await new Response(ds.readable).arrayBuffer())};
 const XCFMODE={0:'source-over',3:'multiply',4:'screen',5:'overlay',6:'difference',9:'darken',10:'lighten',11:'hue',12:'saturation',13:'color',14:'luminosity',16:'color-dodge',17:'color-burn',18:'hard-light',19:'soft-light',23:'overlay',28:'source-over',30:'multiply',31:'screen',32:'difference',35:'darken',36:'lighten',37:'hue',38:'saturation',39:'color',40:'luminosity',42:'color-dodge',43:'color-burn',44:'hard-light',45:'soft-light',57:'exclusion'};
 I.xcf=async buf=>{const b=new Uint8Array(buf),v=new DataView(buf);let p=0;const u32=()=>{const x=v.getUint32(p);p+=4;return x},i32=()=>{const x=v.getInt32(p);p+=4;return x};
  const head=String.fromCharCode(...b.subarray(0,14));if(!head.startsWith('gimp xcf '))throw new Error(t('Das ist keine gültige XCF-Datei.'));const vs=head.slice(9,13);const ver=vs==='file'?0:parseInt(vs.slice(1))||0;p=14;
  const W=u32(),H=u32(),base=u32();let prec=150;if(ver>=4)prec=u32();const PREC={100:[1,'i',1],150:[1,'i',0],200:[2,'i',1],250:[2,'i',0],300:[4,'i',1],350:[4,'i',0],500:[2,'h',1],550:[2,'h',0],600:[4,'f',1],650:[4,'f',0]};const PR=ver>=4?PREC[prec]:[1,'i',0];if(!PR)throw new Error(t('Diese XCF-Farbtiefe wird noch nicht unterstützt.'));const [bpc,kind,linear]=PR;
  const half=(h)=>{const s=h&0x8000?-1:1,e=(h>>10)&31,f=h&1023;return e===0?s*Math.pow(2,-14)*(f/1024):e===31?(f?NaN:s*Infinity):s*Math.pow(2,e-15)*(1+f/1024)};const srgb=v=>v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055;
  const dv=new DataView(new ArrayBuffer(4));const val=(bytes,o,isAlpha)=>{let v;if(kind==='i'){if(bpc===1)return bytes[o];v=bpc===2?(bytes[o]*256+bytes[o+1])/65535:(bytes[o]*16777216+bytes[o+1]*65536+bytes[o+2]*256+bytes[o+3])/4294967295}else if(kind==='h')v=half(bytes[o]*256+bytes[o+1]);else{for(let i=0;i<4;i++)dv.setUint8(i,bytes[o+i]);v=dv.getFloat32(0)}v=Math.max(0,Math.min(1,v||0));if(linear&&!isAlpha)v=srgb(v);return Math.round(v*255)};if(base===2)throw new Error(t('XCF-Dateien mit indizierten Farben werden noch nicht unterstützt.'));
  const ptr=()=>{if(ver>=11){const hi=u32(),lo=u32();return hi*4294967296+lo}return u32()};
  let comp=1;for(;;){const type=u32(),len=u32();if(type===0)break;if(type===17)comp=b[p];p+=len}
  const lps=[];for(;;){const q=ptr();if(!q)break;lps.push(q)}
  const layers=[];
  for(const lp of lps){p=lp;const w=u32(),h=u32(),type=u32();const nl=u32();let name='';if(nl){name=new TextDecoder().decode(b.subarray(p,p+nl-1));p+=nl}
   let op=1,vis=true,ox=0,oy=0,mode=0,isGroup=false;
   for(;;){const ty=u32(),len=u32();const st=p;if(ty===0)break;if(ty===6)op=u32()/255;else if(ty===8)vis=!!u32();else if(ty===15){ox=i32();oy=i32()}else if(ty===7)mode=u32();else if(ty===33)op=v.getFloat32(p);else if(ty===29)isGroup=true;p=st+len}
   const hp=ptr();ptr();if(isGroup||!w||!h)continue;
   p=hp;const hw=u32(),hh=u32(),bpp=u32();const lv=ptr();p=lv;const lw=u32(),lh=u32();const tiles=[];for(;;){const q=ptr();if(!q)break;tiles.push(q)}
   const nC=bpp,px=new Uint8Array(lw*lh*nC);const tw=Math.ceil(lw/64);
   for(let ti=0;ti<tiles.length;ti++){const tx=(ti%tw)*64,ty=Math.floor(ti/tw)*64,cw=Math.min(64,lw-tx),chh=Math.min(64,lh-ty),n=cw*chh;let q=tiles[ti];const end=ti+1<tiles.length?tiles[ti+1]:b.length;
    let data;if(comp===0){data=b.subarray(q,q+n*nC);data=(()=>{const o=new Uint8Array(n*nC);for(let i=0;i<n;i++)for(let c=0;c<nC;c++)o[c*n+i]=data[i*nC+c];return o})()}
    else if(comp===2){const raw=await inflate(b.subarray(q,end));data=new Uint8Array(n*nC);for(let i=0;i<n;i++)for(let c=0;c<nC;c++)data[c*n+i]=raw[i*nC+c]}
    else{data=new Uint8Array(n*nC);for(let c=0;c<nC;c++){let oi=c*n;const stop=oi+n;while(oi<stop){let k=b[q++];if(k>=128){let len;if(k===128){len=b[q]*256+b[q+1];q+=2}else len=256-k;for(let j=0;j<len&&oi<stop;j++)data[oi++]=b[q++]}else{let len;if(k===127){len=b[q]*256+b[q+1];q+=2}else len=k+1;const val=b[q++];for(let j=0;j<len&&oi<stop;j++)data[oi++]=val}}}}
    for(let y=0;y<chh;y++)for(let x=0;x<cw;x++){const i=y*cw+x,o=((ty+y)*lw+tx+x)*nC;for(let c=0;c<nC;c++)px[o+c]=data[c*n+i]}}
   const ch={};const nCh=nC/bpc;const hasA=type===1||type===3;const plane=c=>{const o=new Uint8Array(lw*lh);const isA=hasA&&c===nCh-1;for(let i=0;i<lw*lh;i++)o[i]=bpc===1&&!linear?px[i*nC+c]:val(px,i*nC+c*bpc,isA);return o};
   if(type===0||type===1){ch.r=plane(0);ch.g=plane(1);ch.b=plane(2);if(type===1)ch.a=plane(3)}else if(type===2||type===3){ch.r=ch.g=ch.b=plane(0);if(type===3)ch.a=plane(1)}else continue;
   layers.push({name,cv:toCv(lw,lh,ch),x:ox,y:oy,opacity:op,visible:vis,blend:XCFMODE[mode]||'source-over'})}
  layers.reverse();return{w:W,h:H,layers}};
 I.isDoc=p=>/\.(psd|xcf)$/i.test(p);
 I.load=async path=>{const r=await fetch('api/file?path='+encodeURIComponent(path));if(!r.ok){let j={};try{j=await r.json()}catch(e){}throw new Error(j.error||t('Die Datei ließ sich nicht öffnen.'))}const buf=await r.arrayBuffer();return /\.psd$/i.test(path)?I.psd(buf):await I.xcf(buf)};
 return I})();
