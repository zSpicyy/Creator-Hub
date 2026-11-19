// Bildmodell: Ebenen, Zeichnen, Anpassungen, Verlauf (Rückgängig) und Speichern.
const Doc=(()=>{const D={};const {api}=Kit;
 D.d=null;D.sel=null;D.undo=[];D.redo=[];D.dirty=false;D.on=()=>{};
 const mk=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c};
 D.mk=mk;
 D.clone=cv=>{const c=mk(cv.width,cv.height);c.getContext('2d').drawImage(cv,0,0);return c};
 const uid=()=>Math.random().toString(36).slice(2,10);D.uid=uid;
 D.ADJ0={exposure:0,brightness:0,contrast:0,saturation:0,warmth:0,tint:0,fade:0,vignette:0,blur:0,sharpen:0,preset:''};
 D.BLENDS=[['source-over','Normal'],['multiply','Multiplizieren'],['screen','Negativ multiplizieren'],['overlay','Ineinanderkopieren'],['darken','Abdunkeln'],['lighten','Aufhellen'],['color-dodge','Farbig abwedeln'],['color-burn','Farbig nachbelichten'],['soft-light','Weiches Licht'],['hard-light','Hartes Licht'],['difference','Differenz'],['exclusion','Ausschluss'],['hue','Farbton'],['saturation','Sättigung'],['color','Farbe'],['luminosity','Luminanz']];
 D.FONTS=['Arial','Arial Black','Impact','Segoe UI','Verdana','Tahoma','Trebuchet MS','Georgia','Times New Roman','Courier New','Comic Sans MS','Helvetica','DejaVu Sans','Noto Sans','Ubuntu','Cantarell'];
 const base=()=>({id:uid(),name:'Ebene',visible:true,opacity:1,blend:'source-over',x:0,y:0,w:100,h:100,rot:0,fx:false,fy:false,shadow:{on:false,color:'#000000',alpha:.6,blur:14,dx:5,dy:5}});
 D.defaults=t=>t==='text'?{...base(),type:'text',name:'Text',text:'Text',font:'Arial Black',size:96,color:'#ffffff',bold:false,italic:false,align:'center',lh:1.1,ls:0,stroke:{on:true,color:'#000000',w:6}}
  :t==='shape'?{...base(),type:'shape',name:'Form',kind:'rect',fill:'#7c6cff',fillOn:true,strokeC:'#ffffff',strokeW:0,radius:0}
  :t==='group'?{...base(),type:'group',name:'Gruppe',open:true}:{...base(),type:'pixel'};

 // ---- Darstellung einer Ebene ----
 const hexA=(h,a)=>{h=String(h||'#000').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16)||0;return`rgba(${n>>16&255},${n>>8&255},${n&255},${a})`};D.hexA=hexA;
 D.fontOf=L=>`${L.italic?'italic ':''}${L.bold?'bold ':''}${Math.max(1,L.size)}px "${L.font}", sans-serif`;
 const mctx=mk(1,1).getContext('2d');
 // Textgröße messen; die Box wächst je nach Ausrichtung nach rechts, beidseitig oder nach links
 // Text-Layout: optional Formatierung (**fett**, *kursiv*, [#f00]Farbe[/]), Textrahmen mit Umbruch, Blocksatz
 const fontRun=(L,b,i)=>`${i?'italic ':''}${b?'bold ':''}${Math.max(1,L.size)}px "${L.font}", sans-serif`;
 const parseRich=L=>{const txt=String(L.text||'');const out=[];let b=!!L.bold,it=!!L.italic,col=null,buf='';const flush=()=>{if(buf){out.push({t:buf,b,i:it,col});buf=''}};
  for(let k=0;k<txt.length;k++){const ch=txt[k];
   if(L.rich){if(txt.startsWith('**',k)){flush();b=!b;k++;continue}if(ch==='*'){flush();it=!it;continue}
    if(ch==='['){const m=/^\[(#[0-9a-fA-F]{3,8})\]/.exec(txt.slice(k));if(m){flush();col=m[1];k+=m[0].length-1;continue}if(txt.startsWith('[/]',k)){flush();col=null;k+=2;continue}}}
   if(ch==='\n'){flush();out.push({nl:true});continue}buf+=ch}flush();return out};
 D.layout=L=>{const key=JSON.stringify([L.text,L.font,L.size,L.bold,L.italic,L.rich,L.box,L.boxW,L.ls,L.lh,L.stroke&&L.stroke.on&&L.stroke.w,L.align]);if(L._lay&&L._lay.key===key)return L._lay;
  if('letterSpacing' in mctx)mctx.letterSpacing=(L.ls||0)+'px';const pad=(L.stroke&&L.stroke.on?L.stroke.w:0)+Math.ceil(L.size*.06);const maxW=L.box?Math.max(10,(L.boxW||300)-pad*2):1e9;
  const lines=[];let cur={runs:[],w:0,hard:false};const push=hard=>{cur.hard=hard;while(cur.runs.length&&/^\s+$/.test(cur.runs.at(-1).t)){cur.w-=cur.runs.pop().w}lines.push(cur);cur={runs:[],w:0,hard:false}};
  for(const tk of parseRich(L)){if(tk.nl){push(true);continue}mctx.font=fontRun(L,tk.b,tk.i);for(const piece of tk.t.split(/(\s+)/)){if(!piece)continue;const w=mctx.measureText(piece).width;
    if(cur.w+w>maxW&&cur.w>0&&!/^\s+$/.test(piece))push(false);if(!cur.runs.length&&/^\s+$/.test(piece)&&lines.length&&!lines.at(-1).hard)continue;cur.runs.push({t:piece,b:tk.b,i:tk.i,col:tk.col,w,sp:/^\s+$/.test(piece)});cur.w+=w}}
  push(true);const w=L.box?(L.boxW||300):Math.max(8,...lines.map(l=>l.w))+pad*2;return L._lay={key,lines,pad,w,h:Math.max(1,lines.length)*L.size*L.lh+pad*2}};
 D.measure=(L,keep=true)=>{const lay=D.layout(L);const w=lay.w,h=lay.h;
  if(keep&&L.w){const dw=w-L.w,dh=h-L.h;L.x-=L.box?dw/2:L.align==='center'?dw/2:L.align==='right'?dw:0;L.y-=dh/2}L.w=w;L.h=h;L._pad=lay.pad};
 const drawText=(c,L)=>{const lay=D.layout(L);if('letterSpacing' in c)c.letterSpacing=(L.ls||0)+'px';c.textBaseline='middle';c.textAlign='left';c.lineJoin='round';c.miterLimit=2;
  const lh=L.size*L.lh,pad=lay.pad,inner=L.w-pad*2,y0=-L.h/2+pad+lh/2;const st=L.stroke&&L.stroke.on&&L.stroke.w>0;
  const place=(ln)=>{let x=-L.w/2+pad,gap=0;if(L.align==='center')x=-ln.w/2;else if(L.align==='right')x=L.w/2-pad-ln.w;else if(L.align==='justify'&&!ln.hard){const n=ln.runs.filter(r=>r.sp).length;if(n)gap=(inner-ln.w)/n}return{x,gap}};
  for(const pass of st?['s','f']:['f']){lay.lines.forEach((ln,i)=>{let {x,gap}=place(ln);const y=y0+i*lh;for(const r of ln.runs){if(!r.sp){c.font=fontRun(L,r.b,r.i);if(pass==='s'){c.strokeStyle=L.stroke.color;c.lineWidth=L.stroke.w*2;c.strokeText(r.t,x,y)}else{c.fillStyle=r.col||L.color;c.fillText(r.t,x,y)}}x+=r.w+(r.sp?gap:0)}});if(pass==='s')c.shadowColor='transparent'}};
 const drawShape=(c,L)=>{const w=L.w,h=L.h;c.beginPath();
  if(L.kind==='line'||L.kind==='arrow'){const sw=Math.max(1,L.strokeW||8);c.lineCap='round';c.lineJoin='round';c.strokeStyle=L.strokeC;c.lineWidth=sw;
   const x0=-w/2,y0=-h/2,x1=w/2,y1=h/2;c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke();
   if(L.kind==='arrow'){const a=Math.atan2(y1-y0,x1-x0),s=sw*3.2;c.beginPath();c.moveTo(x1,y1);c.lineTo(x1-s*Math.cos(a-.45),y1-s*Math.sin(a-.45));c.lineTo(x1-s*Math.cos(a+.45),y1-s*Math.sin(a+.45));c.closePath();c.fillStyle=L.strokeC;c.fill()}return}
  if(L.kind==='ellipse')c.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
  else if(L.radius>0&&c.roundRect)c.roundRect(-w/2,-h/2,w,h,Math.min(L.radius,w/2,h/2));else c.rect(-w/2,-h/2,w,h);
  if(L.fillOn){c.fillStyle=L.fill;c.fill();c.shadowColor='transparent'}
  if(L.strokeW>0){c.strokeStyle=L.strokeC;c.lineWidth=L.strokeW;c.lineJoin='round';c.stroke()}};
 // Matrix von der Ebenen-Box (0..w, 0..h) ins Bild
 D.matrix=L=>{let m=new DOMMatrix().translate(L.x+L.w/2,L.y+L.h/2);if(L.rot)m=m.rotate(L.rot);m=m.scale(L.fx?-1:1,L.fy?-1:1);return m.translate(-L.w/2,-L.h/2)};
 // Matrix von den Pixeln einer Bildebene ins Bild
 D.pixMatrix=L=>D.matrix(L).scale(L.w/L.cv.width,L.h/L.cv.height);
 // Ebenenmaske: Graustufen (weiß = sichtbar) -> Alpha, zwischengespeichert pro Maskenbild
 const maskA=new WeakMap();
 D.maskAlpha=(m,fresh)=>{let a=fresh?null:maskA.get(m);if(a)return a;a=mk(m.width,m.height);const x=m.getContext('2d').getImageData(0,0,m.width,m.height),p=x.data;for(let i=0;i<p.length;i+=4){p[i+3]=p[i]*p[i+3]/255;p[i]=p[i+1]=p[i+2]=0}a.getContext('2d').putImageData(x,0,0);if(!fresh)maskA.set(m,a);return a};
 const masked=(L,cv,m)=>{let t=L._mt;if(!t||t.width!==cv.width||t.height!==cv.height)t=L._mt=mk(cv.width,cv.height);const c=t.getContext('2d');c.globalCompositeOperation='copy';c.drawImage(cv,0,0);c.globalCompositeOperation='destination-in';c.drawImage(D.maskAlpha(m,m===L._mprev&&L._mlive),0,0,cv.width,cv.height);c.globalCompositeOperation='source-over';return t};
 // ---- Smart-Filter (später änderbar) und Ebeneneffekte (Kontur, Leuchten, Farbüberlagerung) ----
 const sfxCache=new WeakMap();
 const sfxApply=(L,cv)=>{const on=L.sfx.filter(f=>f.on!==false);if(!on.length||typeof FX==='undefined')return cv;const key=JSON.stringify(on);const c=sfxCache.get(cv);if(c&&c.key===key)return c.out;
  let out=cv;for(const f of on){const def=FX.get(f.id);if(def)try{out=def[4](out,f.o)}catch(e){}}sfxCache.set(cv,{key,out});return out};
 const hasFx=L=>L.fxs&&(L.fxs.stroke&&L.fxs.stroke.on||L.fxs.glow&&L.fxs.glow.on||L.fxs.over&&L.fxs.over.on);
 const tint=(src,col,a=1)=>{const t=mk(src.width,src.height),c=t.getContext('2d');c.drawImage(src,0,0);c.globalCompositeOperation='source-in';c.fillStyle=hexA(col,a);c.fillRect(0,0,t.width,t.height);return t};
 function drawFx(c,L,k){const cv=c.canvas,m=c.getTransform(),s=Math.hypot(m.a,m.b)||1;const body=mk(cv.width,cv.height),bc=body.getContext('2d');bc.setTransform(m);
  D.drawLayer(bc,{...L,fxs:null,opacity:1,blend:'source-over',shadow:{...L.shadow,on:false}},k);
  const out=mk(cv.width,cv.height),oc=out.getContext('2d');const F=L.fxs;
  if(F.glow&&F.glow.on){const g=tint(body,F.glow.color,1),b=D.blurCv(g,Math.max(1,F.glow.size*s/2));oc.globalAlpha=F.glow.alpha;oc.drawImage(b,0,0);oc.drawImage(b,0,0);oc.globalAlpha=1}
  if(F.stroke&&F.stroke.on&&F.stroke.w>0){const g=tint(body,F.stroke.color,1),w=F.stroke.w*s,n=Math.max(12,Math.round(w*1.4));for(const f of[1,.5])for(let i=0;i<n;i++){const a=i/n*Math.PI*2;oc.drawImage(g,Math.cos(a)*w*f,Math.sin(a)*w*f)}}
  oc.drawImage(body,0,0);
  if(F.over&&F.over.on){const o=tint(body,F.over.color,F.over.alpha);oc.drawImage(o,0,0)}
  c.save();c.setTransform(1,0,0,1,0,0);c.globalAlpha=L.opacity;c.globalCompositeOperation=L.blend||'source-over';const sh=L.shadow;if(sh&&sh.on){c.shadowColor=hexA(sh.color,sh.alpha);c.shadowBlur=sh.blur*k*s;c.shadowOffsetX=sh.dx*k*s;c.shadowOffsetY=sh.dy*k*s}c.drawImage(out,0,0);c.restore()}
 D.drawLayer=(c,L,k=1,plain)=>{if(!plain&&L.visible&&hasFx(L)&&L.type!=='group')return drawFx(c,L,k);if(L.type==='group'){if(plain)for(const K of D.kids(L.id))D.drawLayer(c,K,k,true);return}if(!L.visible&&!plain)return;c.save();
  if(!plain){c.globalAlpha=L.opacity;c.globalCompositeOperation=L.blend||'source-over';
   const s=L.shadow;if(s&&s.on){c.shadowColor=hexA(s.color,s.alpha);c.shadowBlur=s.blur*k;c.shadowOffsetX=s.dx*k;c.shadowOffsetY=s.dy*k}}
  if(L._tf){c.drawImage(L._tf.cv,L._tf.x,L._tf.y);c.restore();return}
  c.translate(L.x+L.w/2,L.y+L.h/2);if(L.rot)c.rotate(L.rot*Math.PI/180);c.scale(L.fx?-1:1,L.fy?-1:1);
  if(L.type==='pixel'){let cv=L._prev||L.cv;if(L.sfx&&L.sfx.length)cv=sfxApply(L,cv);const m=L._mprev||L.mask;if(m&&!L.maskOff)cv=masked(L,cv,m);c.imageSmoothingQuality='high';c.drawImage(cv,-L.w/2,-L.h/2,L.w,L.h)}
  else if(L.type==='text')drawText(c,L);else drawShape(c,L);
  c.restore()};

 // ---- Zusammensetzen und Anpassungen ----
 D.comp=null;D.out=null;D.need=true;let adjKey='';
 D.isNeutral=a=>Object.keys(D.ADJ0).every(k=>k==='preset'||!a[k]);
 function drawKids(c,pid,k){for(const L of D.d.layers){if((L.parent||null)!==pid)continue;if(L.type==='group'){if(!L.visible)continue;const cv=c.canvas,t=mk(cv.width,cv.height),tc=t.getContext('2d');tc.setTransform(c.getTransform());
  drawKids(tc,L.id,k);c.save();c.setTransform(1,0,0,1,0,0);c.globalAlpha=L.opacity;c.globalCompositeOperation=L.blend||'source-over';c.drawImage(t,0,0);c.restore()}else D.drawLayer(c,L,k)}}
 D.composite=(c,k=1)=>drawKids(c,null,k);
 D.render=()=>{const d=D.d;if(!D.comp||D.comp.width!==d.w||D.comp.height!==d.h){D.comp=mk(d.w,d.h);D.adjCv=mk(d.w,d.h)}
  const c=D.comp.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,d.w,d.h);D.composite(c);
  if(D.isNeutral(d.adjust))D.out=D.comp;else{D.applyAdjust(D.comp,D.adjCv,d.adjust);D.out=D.adjCv}D.need=false;return D.out};
 // Weichzeichnen über Verkleinern und Vergrößern (schnell, auch ohne ctx.filter)
 const blurCv=(src,r)=>{const w=src.width,h=src.height,f=Math.max(1,r/1.6);const sw=Math.max(1,Math.round(w/f)),sh=Math.max(1,Math.round(h/f));
  const a=mk(sw,sh),ac=a.getContext('2d');ac.imageSmoothingQuality='high';ac.drawImage(src,0,0,sw,sh);
  const b=mk(sw,sh),bc=b.getContext('2d');bc.filter&&0;bc.drawImage(a,-.5,-.5,sw+1,sh+1);bc.globalAlpha=.5;bc.drawImage(a,.5,.5,sw-1,sh-1);
  const o=mk(w,h),oc=o.getContext('2d');oc.imageSmoothingQuality='high';oc.drawImage(b,0,0,w,h);return o};
 D.blurCv=(src,r)=>blurCv(src,r);D.sharpenData=(p,w,h,s)=>sharpen(p,w,h,s);
 D.applyAdjust=(src,dst,a)=>{const w=src.width,h=src.height;const dc=dst.getContext('2d');dc.setTransform(1,0,0,1,0,0);dc.clearRect(0,0,w,h);
  const r=a.blur>0?a.blur/100*Math.max(w,h)*.03:0;dc.drawImage(r>.4?blurCv(src,r):src,0,0);
  const id=dc.getImageData(0,0,w,h),p=id.data;
  // Farb-Tabellen für Belichtung, Helligkeit, Kontrast, Wärme, Tönung, Verblassen
  const ex=Math.pow(2,a.exposure/50),br=a.brightness*1.2,ct=a.contrast*2.55,cf=(259*(ct+255))/(255*(259-ct)),fd=a.fade*.9;
  const lr=new Uint8ClampedArray(256),lg=new Uint8ClampedArray(256),lb=new Uint8ClampedArray(256);
  for(let i=0;i<256;i++){let v=i*ex+br;v=cf*(v-128)+128;v=fd?v*(1-fd/255)+fd:v;lr[i]=v+a.warmth*.7+a.tint*.25;lg[i]=v-a.tint*.6;lb[i]=v-a.warmth*.7+a.tint*.25}
  const sat=1+a.saturation/100,vg=a.vignette/100,cx=w/2,cy=h/2,inv=1/Math.hypot(cx,cy);
  if(a.sharpen>0)sharpen(p,w,h,a.sharpen/100*1.6);
  for(let y=0,i=0;y<h;y++){const dy=(y-cy)*(y-cy);for(let x=0;x<w;x++,i+=4){let R=lr[p[i]],G=lg[p[i+1]],B=lb[p[i+2]];
   if(sat!==1){const g=.299*R+.587*G+.114*B;R=g+(R-g)*sat;G=g+(G-g)*sat;B=g+(B-g)*sat}
   if(vg){const dd=Math.sqrt((x-cx)*(x-cx)+dy)*inv;if(dd>.35){const t=Math.min(1,(dd-.35)/.65);const f=1-vg*t*t*(3-2*t)*.85;R*=f;G*=f;B*=f}}
   p[i]=R;p[i+1]=G;p[i+2]=B}}
  dc.putImageData(id,0,0)};
 const sharpen=(p,w,h,s)=>{const src=new Uint8ClampedArray(p);const W=w*4;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*W+x*4;for(let c=0;c<3;c++){const j=i+c;const v=src[j]*(1+4*s)-s*(src[j-4]+src[j+4]+src[j-W]+src[j+W]);p[j]=v}}};

 // ---- Verlauf ----
 const copyL=l=>{const o={...l,shadow:{...l.shadow}};delete o._lay;if(l.fxs)o.fxs=JSON.parse(JSON.stringify(l.fxs));if(l.sfx)o.sfx=JSON.parse(JSON.stringify(l.sfx));if(l.stroke)o.stroke={...l.stroke};delete o._prev;delete o._mprev;delete o._erBase;delete o._mt;return o};
 const snap=()=>({w:D.d.w,h:D.d.h,adjust:{...D.d.adjust},sel:D.sel,layers:D.d.layers.map(copyL),mask:typeof Sel!=='undefined'?Sel.mask:null});
 D.clearSel=()=>{};
 let lastKey='',lastT=0;
 D._label='';D.begin=key=>{const now=Date.now();if(key&&key===lastKey&&now-lastT<900){lastT=now;D._label='';return}lastKey=key||'';lastT=now;const sn=snap();sn.label=D._label||(key&&key.startsWith('adj')?'Anpassen':key&&key.startsWith('p:')?'Eigenschaft geändert':key==='nudge'?'Verschieben':'Bearbeitung');D._label='';D.undo.push(sn);if(D.undo.length>60)D.undo.shift();D.redo=[];trimUndo();D.mark(true)};
 // Arbeitsspeicher begrenzen: alte Schritte fallen weg, wenn der Verlauf mehr als ~350 MB Bilddaten hält
 const trimUndo=()=>{const cur=new Set();for(const l of D.d.layers){if(l.cv)cur.add(l.cv);if(l.mask)cur.add(l.mask)}const seen=new Set();const sizes=D.undo.map(s=>{let b=0;for(const l of s.layers)for(const c of[l.cv,l.mask])if(c&&!cur.has(c)&&!seen.has(c)){seen.add(c);b+=c.width*c.height*4}return b});let tot=sizes.reduce((a,b)=>a+b,0);while(tot>350e6&&D.undo.length>3){D.undo.shift();tot-=sizes.shift()}};
 const restore=s=>{const d=D.d;d.w=s.w;d.h=s.h;d.adjust={...s.adjust};d.layers=s.layers.map(copyL);D.sel=d.layers.some(l=>l.id===s.sel)?s.sel:(d.layers.at(-1)||{}).id||null;if(typeof Sel!=='undefined'){Sel.mask=s.mask;Sel.changed()}D.need=true;lastKey='';D.mark(true);D.on('all')};
 D.doUndo=()=>{if(!D.undo.length)return;const u=D.undo.pop();const sn=snap();sn.label=u.label;D.redo.push(sn);restore(u)};
 D.doRedo=()=>{if(!D.redo.length)return;const r=D.redo.pop();const sn=snap();sn.label=r.label;D.undo.push(sn);restore(r)};
 D.jump=k=>{while(D.undo.length>k)D.doUndo();while(D.undo.length<k&&D.redo.length)D.doRedo()};
 D.changed=(what='canvas')=>{D.need=true;D.mark(true);D.on(what)};

 // ---- Ungespeichert ----
 let dirtySent=null;
 D.mark=v=>{D.dirty=v;if(D.d&&dirtySent!==v){dirtySent=v;fetch('api/dirty?id='+D.d.id+(v?'&v=1':''),{method:'POST'}).catch(()=>{})}const s=Kit.$('#saved');if(s&&v){s.className='saved unsaved';s.textContent=Kit.t('Nicht gespeichert')}};

 // ---- Ebenen ----
 D.layer=id=>D.d&&D.d.layers.find(l=>l.id===(id||D.sel));
 D.idx=id=>D.d.layers.findIndex(l=>l.id===id);
 const insert=L=>{const S=D.layer();const i=S?D.idx(S.id):-1;if(i<0)D.d.layers.push(L);else if(S.type==='group'){L.parent=S.id;D.d.layers.splice(i,0,L)}else{if(S.parent)L.parent=S.parent;D.d.layers.splice(i+1,0,L)}D.norm();D.sel=L.id;D.changed('layers');return L};
 function nameN(t){let n=1;const ex=new Set(D.d.layers.map(l=>l.name));while(ex.has(t+' '+n))n++;return t+' '+n};
 D.addPixel=(cv,name,box,noUndo)=>{if(!noUndo)D.begin();const L={...D.defaults('pixel'),cv,name:name||nameN(Kit.t('Ebene'))};
  const b=box||{x:0,y:0,w:cv.width,h:cv.height};Object.assign(L,b);L.rev=1;return insert(L)};
 D.addEmpty=()=>D.addPixel(mk(D.d.w,D.d.h),null,{x:0,y:0,w:D.d.w,h:D.d.h});
 // Bild einfügen: zu große Bilder passend verkleinert, mittig
 D.addImage=(cv,name)=>{const d=D.d,k=Math.min(1,d.w/cv.width,d.h/cv.height);const w=cv.width*k,h=cv.height*k;return D.addPixel(cv,name,{x:(d.w-w)/2,y:(d.h-h)/2,w,h})};
 D.addText=(o={})=>{D.begin();const L={...D.defaults('text'),...o};L.name=String(L.text).slice(0,32)||'Text';L.size=o.size||Math.round(Math.max(24,Math.min(D.d.w,D.d.h)/8));L.stroke={...L.stroke,w:Math.max(2,Math.round(L.size/14))};L.w=0;D.measure(L,false);
  if(o.cx!=null){L.x=o.cx-L.w/2;L.y=o.cy-L.h/2}else{L.x=(D.d.w-L.w)/2;L.y=(D.d.h-L.h)/2}delete L.cx;delete L.cy;return insert(L)};
 D.addShape=(kind,box,o={})=>{D.begin();const L={...D.defaults('shape'),kind,...o,...box};
  L.name=nameN({rect:Kit.t('Rechteck'),ellipse:Kit.t('Ellipse'),line:Kit.t('Linie'),arrow:Kit.t('Pfeil')}[kind]);if(kind==='line'||kind==='arrow')L.strokeW=L.strokeW||Math.max(4,Math.round(Math.min(D.d.w,D.d.h)/90));return insert(L)};
 // ---- Ebenengruppen (eine Ebene tief): Kinder haben parent = Gruppen-ID und liegen direkt unter der Gruppe ----
 D.kids=id=>D.d.layers.filter(x=>x.parent===id);
 D.ancestors=L=>{const a=D.d.layers,out=[];let p=L.parent,guard=0;while(p&&guard++<50){const g=a.find(x=>x.id===p);if(!g)break;out.push(g);p=g.parent}return out};
 D.desc=id=>{const out=[];for(const k of D.kids(id)){out.push(k);if(k.type==='group')out.push(...D.desc(k.id))}return out};
 D.depth=L=>D.ancestors(L).length;
 D.norm=()=>{const a=D.d.layers;const ids=new Set(a.filter(x=>x.type==='group').map(x=>x.id));for(const L of a){if(L.parent&&(!ids.has(L.parent)||L.parent===L.id))delete L.parent}
  // Kreise vermeiden
  for(const L of a){const seen=new Set([L.id]);let p=L.parent;while(p){if(seen.has(p)){delete L.parent;break}seen.add(p);p=(a.find(x=>x.id===p)||{}).parent}}
  const out=[];const emit=L=>{if(L.type==='group')for(const k of a)if(k.parent===L.id)emit(k);out.push(L)};for(const L of a)if(!L.parent)emit(L);D.d.layers=out};
 // Ebene neben (above/below) oder in (into) eine andere legen
 D.place=(id,tid,where)=>{const a=D.d.layers,L=a.find(x=>x.id===id),T=a.find(x=>x.id===tid);if(!L||!T||L===T||T.parent===L.id)return;
  a.splice(a.indexOf(L),1);let i=a.indexOf(T);
  if(where==='into'&&T.type==='group'&&!(L.type==='group'&&D.ancestors(T).includes(L))){L.parent=T.id;a.splice(i,0,L)}
  else{let ref=T;if(ref.parent)L.parent=ref.parent;else delete L.parent;
   if(where==='above'){const kidsBelow=0;a.splice(i+1+kidsBelow,0,L)}else{const dd=ref.type==='group'?D.desc(ref.id):[];const lo=dd.length?Math.min(...dd.map(x=>a.indexOf(x))):i;a.splice(lo,0,L)}}
  D.norm()};
 D.addGroup=()=>{D.begin();const L=D.layer();const g={...base(),type:'group',name:nameN(Kit.t('Gruppe')),open:true,x:0,y:0,w:D.d.w,h:D.d.h};
  if(L){const i=D.idx(L.id);if(L.parent)g.parent=L.parent;D.d.layers.splice(i+1,0,g);L.parent=g.id}else D.d.layers.push(g)
  D.norm();D.sel=g.id;D.changed('layers')};
 D.ungroup=()=>{const g=D.layer();if(!g||g.type!=='group')return;D.begin();for(const k of D.kids(g.id)){if(g.parent)k.parent=g.parent;else delete k.parent}D.d.layers.splice(D.idx(g.id),1);D.norm();D.sel=null;D.changed('layers')};
 D.mergeGroup=()=>{const g=D.layer();if(!g||g.type!=='group')return;D.begin();const d=D.d,cv=mk(d.w,d.h),c=cv.getContext('2d');drawKids(c,g.id,1);
  const n={...D.defaults('pixel'),id:g.id,name:g.name,cv,x:0,y:0,w:d.w,h:d.h,opacity:g.opacity,blend:g.blend,visible:g.visible};if(g.parent)n.parent=g.parent;const ks=new Set(D.desc(g.id));D.d.layers=D.d.layers.filter(x=>!ks.has(x));D.d.layers[D.idx(g.id)]=n;D.changed('layers')};
 D.dup=()=>{const L=D.layer();if(!L)return;D.begin();const c=copyL(L);c.id=uid();c.name=L.name+' '+Kit.t('Kopie');
  if(L.type==='group'){const map={[L.id]:c.id};const ks=D.desc(L.id).map(k=>{const n=copyL(k);n.id=uid();map[k.id]=n.id;if(n.type!=='group'){n.x+=20;n.y+=20}return n});for(const n of ks)n.parent=map[n.parent];const i=D.idx(L.id);D.d.layers.splice(i+1,0,...ks,c)}
  else{c.x+=20;c.y+=20;D.d.layers.splice(D.idx(L.id)+1,0,c)}D.norm();D.sel=c.id;D.changed('layers')};
 D.del=()=>{const L=D.layer();if(!L)return;D.begin();const i=D.idx(L.id);D.d.layers.splice(i,1);if(L.type==='group'){const ks=new Set(D.desc(L.id));D.d.layers=D.d.layers.filter(x=>!ks.has(x))}D.norm();D.sel=(D.d.layers[Math.max(0,Math.min(D.d.layers.length-1,i-1))]||{}).id||null;D.changed('layers')};
 // Nach oben/unten unter Geschwistern (gleiche Gruppe bzw. oberste Ebene)
 D.move=dir=>{const L=D.layer();if(!L)return;const sib=D.d.layers.filter(x=>(x.parent||null)===(L.parent||null));const i=sib.indexOf(L),j=i+dir;if(j<0||j>=sib.length)return;D.begin();D.place(L.id,sib[j].id,dir>0?'above':'below');D.changed('layers')};
 D.reorder=(from,to)=>{if(from===to)return;D.begin();const a=D.d.layers;const [L]=a.splice(from,1);a.splice(to,0,L);D.norm();D.changed('layers')};
 // Text oder Form in Pixel umwandeln (für Pinsel, Radierer, Füllen)
 D.rasterize=L=>{const k=L.type==='text'?1:1;const cv=mk(L.w*k,L.h*k),c=cv.getContext('2d');c.scale(k,k);c.translate(L.w/2,L.h/2);if(L.type==='text')drawText(c,L);else drawShape(c,L);
  const keep=['id','name','visible','opacity','blend','x','y','w','h','rot','fx','fy','shadow'];const n={...D.defaults('pixel')};for(const key of keep)n[key]=L[key];n.cv=cv;n.rev=1;
  const i=D.idx(L.id);D.d.layers[i]=n;return n};
 const flatTo=(layers)=>{const d=D.d,cv=mk(d.w,d.h),c=cv.getContext('2d');for(const L of layers)D.drawLayer(c,L);return cv};
 D.merge=()=>{const L=D.layer();if(L&&L.type==='group')return D.mergeGroup();const i=D.idx(L&&L.id);if(i<1)return Kit.toast(Kit.t('Darunter gibt es keine Ebene.'));const lo=D.d.layers[i-1];if(lo.type==='group'||(lo.parent||null)!==(L.parent||null))return Kit.toast(Kit.t('Darunter gibt es keine passende Ebene.'));D.begin();
  const cv=flatTo([{...lo,visible:true},{...L,visible:true}]);const n={...D.defaults('pixel'),id:lo.id,name:lo.name,cv,x:0,y:0,w:D.d.w,h:D.d.h,rev:1};if(L.parent)n.parent=L.parent;D.d.layers.splice(i-1,2,n);D.sel=n.id;D.changed('layers')};
 D.flatten=()=>{if(D.d.layers.length<2)return;D.begin();const cv=mk(D.d.w,D.d.h);D.composite(cv.getContext('2d'));const n={...D.defaults('pixel'),name:Kit.t('Hintergrund'),cv,x:0,y:0,w:D.d.w,h:D.d.h,rev:1};D.d.layers=[n];D.sel=n.id;D.changed('layers')};

 // ---- Ebenenmasken ----
 D.addMask=kind=>{let L=D.layer();if(!L)return;D.begin();if(L.type!=='pixel')L=D.rasterize(L);const W=L.cv.width,H=L.cv.height,m=mk(W,H),c=m.getContext('2d');
  if(kind==='alpha'){c.fillStyle='#000';c.fillRect(0,0,W,H);const a=D.clone(L.cv),ac=a.getContext('2d');ac.globalCompositeOperation='source-in';ac.fillStyle='#fff';ac.fillRect(0,0,W,H);c.drawImage(a,0,0)}
  else if(kind==='sel'&&typeof Sel!=='undefined'&&Sel.mask){c.fillStyle='#000';c.fillRect(0,0,W,H);const a=Sel.local(L),ac=a.getContext('2d');ac.globalCompositeOperation='source-in';ac.fillStyle='#fff';ac.fillRect(0,0,W,H);c.drawImage(a,0,0)}
  else{c.fillStyle=kind==='black'?'#000':'#fff';c.fillRect(0,0,W,H)}
  L.mask=m;L.editMask=true;L.maskOff=false;D.changed('layers')};
 D.applyMask=()=>{const L=D.layer();if(!L||!L.mask)return;D.begin();const cv=D.clone(L.cv),c=cv.getContext('2d');c.globalCompositeOperation='destination-in';c.drawImage(D.maskAlpha(L.mask),0,0);L.cv=cv;delete L.mask;L.editMask=false;D.changed('layers')};
 D.delMask=()=>{const L=D.layer();if(!L||!L.mask)return;D.begin();delete L.mask;L.editMask=false;D.changed('layers')};
 // Ebene auf Bildgröße bringen (Inhalt wird in Pixel des Bildes umgerechnet)
 D.layerToImage=()=>{let L=D.layer();if(!L)return;D.begin();if(L.type!=='pixel')L=D.rasterize(L);const d=D.d,cv=mk(d.w,d.h),c=cv.getContext('2d');D.drawLayer(c,{...L,mask:null,visible:true,opacity:1,blend:'source-over',shadow:{...L.shadow,on:false}});
  let m=null;if(L.mask){m=mk(d.w,d.h);const mc=m.getContext('2d');mc.fillStyle='#000';mc.fillRect(0,0,d.w,d.h);mc.setTransform(D.pixMatrix(L));mc.drawImage(L.mask,0,0)}
  Object.assign(L,{cv,x:0,y:0,w:d.w,h:d.h,rot:0,fx:false,fy:false});if(m)L.mask=m;else delete L.mask;D.changed('canvas')};
 const alphaBox=cv=>{const W=cv.width,H=cv.height,p=cv.getContext('2d').getImageData(0,0,W,H).data;let x0=W,y0=H,x1=-1,y1=-1;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(p[(y*W+x)*4+3]>0){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}return x1<0?null:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1}};
 D.autocropLayer=()=>{let L=D.layer();if(!L||L.type!=='pixel')return;const b=alphaBox(L.cv);if(!b)return Kit.toast(Kit.t('Die Ebene ist leer.'));D.begin();
  const kx=L.w/L.cv.width,ky=L.h/L.cv.height;const m=D.matrix(L);const c0=m.transformPoint(new DOMPoint((b.x+b.w/2)*kx,(b.y+b.h/2)*ky));
  const cv=mk(b.w,b.h);cv.getContext('2d').drawImage(L.cv,-b.x,-b.y);if(L.mask){const mm=mk(b.w,b.h);mm.getContext('2d').drawImage(L.mask,-b.x,-b.y);L.mask=mm}
  L.cv=cv;L.w=b.w*kx;L.h=b.h*ky;L.x=c0.x-L.w/2;L.y=c0.y-L.h/2;D.changed('canvas')};
 D.autocropImage=()=>{if(D.need)D.render();const b=alphaBox(D.comp);if(!b)return;D.crop(b)};
 D.visibleToLayer=()=>{const d=D.d,cv=mk(d.w,d.h);cv.getContext('2d').drawImage(D.need?D.render():D.out,0,0);D.addPixel(cv,Kit.t('Sichtbar'),{x:0,y:0,w:d.w,h:d.h})};

 // ---- Ganzes Bild ----
 const ctr=L=>[L.x+L.w/2,L.y+L.h/2],setC=(L,cx,cy)=>{L.x=cx-L.w/2;L.y=cy-L.h/2};
 D.rotate90=dir=>{D.begin();D.clearSel();const d=D.d,W=d.w,H=d.h;for(const L of d.layers){const [cx,cy]=ctr(L);if(dir>0)setC(L,H-cy,cx);else setC(L,cy,W-cx);L.rot=((L.rot||0)+90*dir+540)%360-180}d.w=H;d.h=W;D.changed('size')};
 D.flip=ax=>{D.begin();D.clearSel();const d=D.d;for(const L of d.layers){const [cx,cy]=ctr(L);if(ax==='h'){setC(L,d.w-cx,cy);L.fx=!L.fx}else{setC(L,cx,d.h-cy);L.fy=!L.fy}L.rot=-(L.rot||0)}D.changed('canvas')};
 D.crop=r=>{D.begin();D.clearSel();const d=D.d;for(const L of d.layers){L.x-=r.x;L.y-=r.y}d.w=Math.max(1,Math.round(r.w));d.h=Math.max(1,Math.round(r.h));D.changed('size')};
 D.resize=(w,h,interp)=>{D.begin();D.clearSel();const d=D.d,kx=w/d.w,ky=h/d.h,k=Math.sqrt(kx*ky);
  for(const L of d.layers){const [cx,cy]=ctr(L);if(L.type==='text'){L.size*=k;if(L.stroke)L.stroke.w*=k;L.w=0;D.measure(L,false)}else{L.w*=kx;L.h*=ky;
   // Interpolation wie GIMP: „Keine“ hält Pixel hart (Pixel-Art), sonst wird neu berechnet
   if(L.type==='pixel'&&(interp==='none'||interp==='linear')){const nw=Math.max(1,Math.round(L.w)),nh=Math.max(1,Math.round(L.h));const rs=src=>{const o=mk(nw,nh),c=o.getContext('2d');c.imageSmoothingEnabled=interp!=='none';c.imageSmoothingQuality='low';c.drawImage(src,0,0,nw,nh);return o};L.cv=rs(L.cv);if(L.mask)L.mask=rs(L.mask);L.w=nw;L.h=nh;L.rev=(L.rev||0)+1}if(L.type==='shape'){L.strokeW*=k;L.radius*=k}}if(L.shadow){L.shadow.blur*=k;L.shadow.dx*=k;L.shadow.dy*=k}setC(L,cx*kx,cy*ky)}
  d.w=w;d.h=h;D.changed('size')};
 D.canvasSize=(w,h,ax,ay)=>{D.begin();D.clearSel();const d=D.d,dx=(w-d.w)*ax,dy=(h-d.h)*ay;for(const L of d.layers){L.x+=dx;L.y+=dy}d.w=w;d.h=h;D.changed('size')};

 // ---- Treffer ----
 D.local=(L,px,py)=>{const p=D.matrix(L).inverse().transformPoint(new DOMPoint(px,py));return [p.x,p.y]};
 D.hit=(L,px,py,exact)=>{if(!L.visible)return false;const [lx,ly]=D.local(L,px,py);const m=L.type==='shape'&&(L.kind==='line'||L.kind==='arrow')?L.strokeW:0;
  if(lx<-m||ly<-m||lx>L.w+m||ly>L.h+m)return false;
  if(L.type==='pixel'&&exact){const cx=Math.floor(lx*L.cv.width/L.w),cy=Math.floor(ly*L.cv.height/L.h);try{return L.cv.getContext('2d').getImageData(cx,cy,1,1).data[3]>10}catch(e){return true}}
  if(L.type==='shape'&&(L.kind==='line'||L.kind==='arrow')){const t=Math.max(0,Math.min(1,(lx*L.w+ly*L.h)/(L.w*L.w+L.h*L.h)));return Math.hypot(lx-t*L.w,ly-t*L.h)<=Math.max(10,L.strokeW)}
  return true};
 D.pick=(px,py)=>{const a=D.d.layers;const vis=L=>L.type!=='group'&&D.ancestors(L).every(g=>g.visible!==false);for(let i=a.length-1;i>=0;i--)if(!a[i].locked&&vis(a[i])&&D.hit(a[i],px,py,true))return a[i];return null};
 // Begrenzung (achsparallel) einer Ebene
 D.aabb=L=>{if(L.type==='group'){const bs=D.kids(L.id).map(D.aabb);if(!bs.length)return{x:0,y:0,r:0,b:0};return{x:Math.min(...bs.map(b=>b.x)),y:Math.min(...bs.map(b=>b.y)),r:Math.max(...bs.map(b=>b.r)),b:Math.max(...bs.map(b=>b.b))}}const m=D.matrix(L);const ps=[[0,0],[L.w,0],[L.w,L.h],[0,L.h]].map(([x,y])=>m.transformPoint(new DOMPoint(x,y)));const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),r:Math.max(...xs),b:Math.max(...ys)}};

 // ---- Laden und Speichern ----
 const cvFile=new Map();const pid=()=>D.d&&D.d.id;
 // Welche Leinwand liegt in welchem Projekt schon als Datei? (Projekt-ID, Dateiname)
 const fget=cv=>{const v=cvFile.get(cv);return v&&v[0]===pid()?v[1]:null};const fset=(cv,f,id)=>cvFile.set(cv,[id||pid(),f]);
 const loadCv=src=>new Promise(res=>{const im=new Image();im.onload=()=>{const c=mk(im.naturalWidth,im.naturalHeight);c.getContext('2d').drawImage(im,0,0);res(c)};im.onerror=()=>res(null);im.src=src});
 D.loadCv=loadCv;
 D.loadPath=p=>loadCv('api/file?path='+encodeURIComponent(p));
 D.open=async id=>{const p=await api('api/project?id='+id);
  const d={id:p.id,name:p.name,w:p.w,h:p.h,layers:[],adjust:{...D.ADJ0,...(p.adjust||{})},extra:p.extra||{}};
  for(const s of (p.layers||[])){const L={...D.defaults(s.type),...s};
   if(L.type==='pixel'){let cv=s.file?await loadCv('api/layer?id='+p.id+'&f='+encodeURIComponent(s.file)):null;if(!cv){cv=mk(Math.max(1,L.w),Math.max(1,L.h))}else fset(cv,s.file,p.id);L.cv=cv;
    if(s.maskFile){const m=await loadCv('api/layer?id='+p.id+'&f='+encodeURIComponent(s.maskFile));if(m){fset(m,s.maskFile,p.id);L.mask=m}}delete L.maskFile}
   if(L.type==='text')D.measure(L,false);d.layers.push(L)}
  d.chans=[];for(const C of ((d.extra&&d.extra.chans)||[])){const cv=await loadCv('api/layer?id='+p.id+'&f='+encodeURIComponent(C.file));if(cv){fset(cv,C.file,p.id);d.chans.push({id:C.id,name:C.name,cv})}}
  D.d=d;D.clearSel();D.sel=(d.layers.at(-1)||{}).id||null;D.undo=[];D.redo=[];lastKey='';D.need=true;D.comp=null;dirtySent=null;D.dirty=false;return d};
 // Mehrere Bilder (Tabs): Zustand sichern und wiederherstellen
 D.getState=()=>({d:D.d,undo:D.undo,redo:D.redo,sel:D.sel,dirty:D.dirty,dirtySent,mask:typeof Sel!=='undefined'?Sel.mask:null});
 D.setState=s=>{D.d=s.d;D.undo=s.undo;D.redo=s.redo;D.sel=s.sel;D.dirty=s.dirty;dirtySent=s.dirtySent;lastKey='';D.need=true;D.comp=null;if(typeof Sel!=='undefined'){Sel.mask=s.mask;Sel.changed()}};
 const ser=L=>{const o={};for(const k in L)if(k!=='cv'&&k!=='mask'&&k!=='editMask'&&k[0]!=='_')o[k]=L[k];return o};
 const blob=(cv,type='image/png',q)=>new Promise(r=>cv.toBlob(r,type,q));
 D.blob=blob;
 D.save=async()=>{const d=D.d;d.chans=d.chans||[];
  for(const L of d.layers)if(L.type==='pixel'){let f=fget(L.cv);if(!f){f=L.id.replace(/[^a-z0-9]/gi,'')+'-'+uid()+'.png';const b=await blob(L.cv);const r=await fetch('api/layer?id='+d.id+'&f='+f,{method:'POST',body:b});if(!r.ok)throw new Error(Kit.t('Speichern fehlgeschlagen.'));fset(L.cv,f)}L.file=f;
   if(L.mask){let g=fget(L.mask);if(!g){g=L.id.replace(/[^a-z0-9]/gi,'')+'-m'+uid()+'.png';const r=await fetch('api/layer?id='+d.id+'&f='+g,{method:'POST',body:await blob(L.mask)});if(!r.ok)throw new Error(Kit.t('Speichern fehlgeschlagen.'));fset(L.mask,g)}L.maskFile=g}else delete L.maskFile}
  const chans=[];for(const C of (d.chans||[])){let g=fget(C.cv);if(!g){g='kanal'+C.id.replace(/[^a-z0-9]/gi,'')+'-'+uid()+'.png';const r=await fetch('api/layer?id='+d.id+'&f='+g,{method:'POST',body:await blob(C.cv)});if(!r.ok)throw new Error(Kit.t('Speichern fehlgeschlagen.'));fset(C.cv,g)}chans.push({id:C.id,name:C.name,file:g})}
  d.extra={...(d.extra||{}),chans};
  const j=await api('api/save',{id:d.id,name:d.name,w:d.w,h:d.h,layers:d.layers.map(ser),adjust:d.adjust,extra:d.extra||{}});
  const used=new Set([...d.layers.flatMap(l=>[l.file,l.maskFile]),...chans.map(c=>c.file)].filter(Boolean));for(const [cv,v] of [...cvFile])if(v[0]===d.id&&!used.has(v[1]))cvFile.delete(cv);
  try{const out=D.need?D.render():D.out;const k=Math.min(1,480/Math.max(d.w,d.h));const t=mk(d.w*k,d.h*k),tc=t.getContext('2d');tc.imageSmoothingQuality='high';tc.drawImage(out,0,0,t.width,t.height);await fetch('api/thumb?id='+d.id,{method:'POST',body:await blob(t)})}catch(e){}
  dirtySent=false;D.dirty=false;return j};
 // fertiges Bild in beliebiger Größe (für Export und Vorschau)
 D.renderAt=(w,h,bg)=>{const d=D.d,cv=mk(w,h),c=cv.getContext('2d');if(bg){c.fillStyle=bg;c.fillRect(0,0,w,h)}
  const tmp=mk(w,h),tc=tmp.getContext('2d');tc.scale(w/d.w,h/d.h);D.composite(tc,Math.sqrt(w*h/(d.w*d.h)));
  let res=tmp;if(!D.isNeutral(d.adjust)){res=mk(w,h);D.applyAdjust(tmp,res,d.adjust)}c.drawImage(res,0,0);return cv};
 return D})();
