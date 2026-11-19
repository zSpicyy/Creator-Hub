// Bildbearbeitung – Thumbnail-Paket: Vorschau wie im YouTube-Feed, Randlicht/Kontur (KI), Hintergrund unscharf (KI),
// Text-Stile, Objekt entfernen (inhaltsbasiert füllen), Einstellungsebenen mit Farbrädern, Scopes, Vorlagen, Export in mehreren Größen.
const Thumb=(()=>{const X={},{$,esc}=Kit,t=s=>Kit.t(s),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const mk=(w,h)=>Doc.mk(w,h);
 const busy=(on,txt)=>{const b=$('#busy');if(b)b.hidden=!on;if(txt&&$('#busyt'))$('#busyt').textContent=t(txt)};
 const pixLayer=()=>{const L=Doc.layer();if(!L||L.type!=='pixel'||!L.cv){Kit.toast(t('Wähle eine Bild-Ebene aus.'));return null}return L};
 const modal=(h,onClick,wide)=>{UI.modal(h);const box=$('#mbox');box.style.maxWidth=wide?'min(1120px,96vw)':'';box.style.width=wide?'min(1120px,96vw)':'';if(onClick)box.onclick=onClick;return box};
 const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
 // Motiv-Maske der Ebene: vorhandene Maske nutzen, sonst die KI freistellen lassen
 const subjectMask=async L=>{if(!L.mask){await AI.ACTS.ai_matte();L=Doc.layer()}if(!L||!L.mask)return null;
  const W=L.cv.width,H=L.cv.height,m=mk(W,H),c=m.getContext('2d');c.drawImage(L.cv,0,0);c.globalCompositeOperation='destination-in';
  // Maske (Graustufen) in Alpha umwandeln
  const a=mk(W,H),ac=a.getContext('2d');ac.drawImage(L.mask,0,0,W,H);const id=ac.getImageData(0,0,W,H),p=id.data;for(let i=0;i<p.length;i+=4){p[i+3]=Math.round(p[i]*p[i+3]/255);p[i]=p[i+1]=p[i+2]=0}ac.putImageData(id,0,0);
  c.drawImage(a,0,0);return{L,sil:m}};
 const colorize=(src,col)=>{const c2=mk(src.width,src.height),x=c2.getContext('2d');x.drawImage(src,0,0);x.globalCompositeOperation='source-in';x.fillStyle=col;x.fillRect(0,0,c2.width,c2.height);return c2};
 const place=(cv,L,pad,name,blend,below)=>{const s=L.w/L.cv.width,sy=L.h/L.cv.height;const before=Doc.sel;Doc.sel=L.id;
  const N=Doc.addPixel(cv,name,{x:L.x-pad*s,y:L.y-pad*sy,w:cv.width*s,h:cv.height*sy},true);const NL=Doc.layer();if(NL){NL.blend=blend||'source-over';NL.rot=L.rot||0;NL.fromFx=L.id+':'+name;
   if(below){const d=Doc.d.layers,i=d.indexOf(NL);d.splice(i,1);d.splice(d.indexOf(L),0,NL)}}Doc.sel=before;return NL};

 // ---------------- Randlicht / Kontur ----------------
 const RIM={glow:true,glowC:'#00c8ff',glowW:40,glowA:90,line:false,lineC:'#ffffff',lineW:10,inner:true,innerC:'#ffffff',innerW:14,innerA:80,dir:'tl'};
 X.rim=async()=>{const L0=pixLayer();if(!L0)return;const o=RIM;
  const box=modal(`<div class="mhead"><h3>${t('Randlicht und Kontur')}</h3></div><div class="mbody th-form">
   <p class="hint">${t('Die KI erkennt das Motiv der Ebene. Dann kommt außen ein farbiges Leuchten, eine harte Kontur und innen ein Randlicht dazu – jeweils als eigene Ebene, die du später ändern kannst.')}</p>
   <label class="chk"><input type="checkbox" data-r="glow" ${o.glow?'checked':''}> ${t('Leuchten außen')}</label><div class="row"><input type="color" data-r="glowC" value="${o.glowC}"><span>${t('Breite')}</span><input type="range" min="5" max="150" data-r="glowW" value="${o.glowW}"><span>${t('Stärke')}</span><input type="range" min="10" max="100" data-r="glowA" value="${o.glowA}"></div>
   <label class="chk"><input type="checkbox" data-r="line" ${o.line?'checked':''}> ${t('Kontur (Sticker-Rand)')}</label><div class="row"><input type="color" data-r="lineC" value="${o.lineC}"><span>${t('Breite')}</span><input type="range" min="2" max="60" data-r="lineW" value="${o.lineW}"></div>
   <label class="chk"><input type="checkbox" data-r="inner" ${o.inner?'checked':''}> ${t('Randlicht innen')}</label><div class="row"><input type="color" data-r="innerC" value="${o.innerC}"><span>${t('Breite')}</span><input type="range" min="3" max="60" data-r="innerW" value="${o.innerW}"><span>${t('Stärke')}</span><input type="range" min="10" max="100" data-r="innerA" value="${o.innerA}"></div>
   <div class="row"><span>${t('Licht kommt von')}</span><select data-r="dir">${[['tl','oben links'],['tr','oben rechts'],['l','links'],['r','rechts'],['t','oben'],['all','allen Seiten']].map(([v,n])=>`<option value="${v}" ${o.dir===v?'selected':''}>${t(n)}</option>`).join('')}</select></div></div>
   <div class="mfoot"><button class="btn" data-no>${t('Abbrechen')}</button><button class="btn primary" data-yes>${t('Anwenden')}</button></div>`);
  const ok=await new Promise(res=>{box.onclick=e=>{if(e.target.closest('[data-no]')){UI.close();res(false)}if(e.target.closest('[data-yes]')){box.querySelectorAll('[data-r]').forEach(i=>{o[i.dataset.r]=i.type==='checkbox'?i.checked:i.type==='range'?+i.value:i.value});UI.close();res(true)}}});
  if(!ok)return;busy(true,'Randlicht wird berechnet …');await nextFrame();
  try{const r=await subjectMask(Doc.layer());if(!r){busy(false);return}const{L,sil}=r;const W=sil.width,H=sil.height,sc=L.cv.width/Math.max(1,L.w); // Pixel je Bildpunkt
   Doc._label=t('Randlicht');Doc.begin();
   // alte Randlicht-Ebenen dieses Motivs ersetzen
   Doc.d.layers=Doc.d.layers.filter(x=>!(x.fromFx&&x.fromFx.startsWith(L.id+':')));
   if(o.line){const w=Math.max(1,o.lineW*sc),pad=Math.ceil(w+2),c2=mk(W+2*pad,H+2*pad),x=c2.getContext('2d');const col=colorize(sil,o.lineC);
    const steps=Math.max(16,Math.ceil(w*2));for(let rr=w;rr>0;rr-=Math.max(1,w/3))for(let i=0;i<steps;i++){const a=i/steps*Math.PI*2;x.drawImage(col,pad+Math.cos(a)*rr,pad+Math.sin(a)*rr)}
    // nur fast deckende Teile: harte Kante
    const id=x.getImageData(0,0,c2.width,c2.height),p=id.data;for(let i=3;i<p.length;i+=4)p[i]=p[i]>40?255:0;x.putImageData(id,0,0);place(c2,L,pad,t('Kontur'),'source-over',true)}
   if(o.glow){const w=o.glowW*sc,pad=Math.ceil(w*2.2),c2=mk(W+2*pad,H+2*pad),x=c2.getContext('2d');const col=colorize(sil,o.glowC);
    const dil=w*0.22;for(let i=0;i<20;i++){const a=i/20*Math.PI*2;x.drawImage(col,pad+Math.cos(a)*dil,pad+Math.sin(a)*dil)}x.drawImage(col,pad,pad);let g=Doc.blurCv?Doc.blurCv(c2,w*0.75):c2;const out=mk(c2.width,c2.height),ox=out.getContext('2d');const n=1+Math.round(o.glowA/45);for(let i=0;i<n;i++)ox.drawImage(g,0,0);
    ox.globalAlpha=Math.min(1,o.glowA/100);const g2=Doc.blurCv?Doc.blurCv(c2,w*0.2):c2;ox.drawImage(g2,0,0);place(out,L,pad,t('Leuchten'),'source-over',true)}
   if(o.inner){const w=Math.max(1,o.innerW*sc),D2={tl:[-1,-1],tr:[1,-1],l:[-1,0],r:[1,0],t:[0,-1],all:[0,0]}[o.dir]||[-1,-1];const c2=mk(W,H),x=c2.getContext('2d');
    if(o.dir==='all'){const er=mk(W,H),ex=er.getContext('2d');ex.drawImage(Doc.blurCv?Doc.blurCv(sil,w):sil,0,0);x.drawImage(sil,0,0);x.globalCompositeOperation='destination-out';x.drawImage(er,0,0);x.drawImage(er,0,0)}
    else{x.drawImage(sil,0,0);x.globalCompositeOperation='destination-out';x.drawImage(sil,-D2[0]*w,-D2[1]*w)}
    x.globalCompositeOperation='source-in';x.fillStyle=o.innerC;x.fillRect(0,0,W,H);let soft=Doc.blurCv?Doc.blurCv(c2,w*0.35):c2;
    const out=mk(W,H),ox=out.getContext('2d');ox.globalAlpha=Math.min(1,o.innerA/100);ox.drawImage(soft,0,0);ox.drawImage(soft,0,0);ox.globalAlpha=1;ox.globalCompositeOperation='destination-in';ox.drawImage(sil,0,0);
    const NL=place(out,L,0,t('Randlicht'),'screen',false);if(NL){const d=Doc.d.layers;d.splice(d.indexOf(NL),1);d.splice(d.indexOf(L)+1,0,NL)}}
   Doc.norm&&Doc.norm();Doc.changed('layers');UI.layers&&UI.layers();Kit.toast(t('Randlicht hinzugefügt. Die neuen Ebenen findest du über und unter dem Motiv.'))}
  catch(e){Kit.toast(e.message||String(e))}busy(false)};

 // ---------------- Hintergrund unscharf ----------------
 X.bgblur=async()=>{const L0=pixLayer();if(!L0)return;const amt=await new Promise(res=>{const box=modal(`<div class="mhead"><h3>${t('Hintergrund unscharf (KI)')}</h3></div><div class="mbody"><p class="hint">${t('Das Motiv bleibt scharf, alles dahinter wird weich – wie bei einem Porträtfoto.')}</p><div class="row"><span>${t('Stärke')}</span><input type="range" min="2" max="60" value="18" id="bgb"><b id="bgbv">18</b></div></div><div class="mfoot"><button class="btn" data-no>${t('Abbrechen')}</button><button class="btn primary" data-yes>${t('Anwenden')}</button></div>`,e=>{if(e.target.closest('[data-no]')){UI.close();res(0)}if(e.target.closest('[data-yes]')){const v=+$('#bgb').value;UI.close();res(v)}});box.oninput=()=>{$('#bgbv').textContent=$('#bgb').value}});
  if(!amt)return;busy(true,'Hintergrund wird weichgezeichnet …');await nextFrame();
  try{const r=await subjectMask(Doc.layer());if(!r){busy(false);return}const{L,sil}=r;const W=L.cv.width,H=L.cv.height,rad=amt/100*Math.max(W,H)*0.06;
   // Motiv aus dem Hintergrund nehmen und die Lücke mit der Umgebung füllen, damit kein Rand entsteht
   const bg=mk(W,H),bx=bg.getContext('2d');bx.drawImage(L.cv,0,0);bx.globalCompositeOperation='destination-out';const grow=Doc.blurCv?Doc.blurCv(sil,Math.max(2,rad*0.15)):sil;bx.drawImage(grow,0,0);bx.drawImage(grow,0,0);
   let cur=bg;for(let i=0;i<6;i++){const b=Doc.blurCv(cur,Math.max(4,W/60*(i+1)));const n=mk(W,H),nx=n.getContext('2d');nx.drawImage(b,0,0);const id=nx.getImageData(0,0,W,H),p=id.data;for(let k=3;k<p.length;k+=4)if(p[k]>0)p[k]=255;nx.putImageData(id,0,0);
    const m=mk(W,H),mx=m.getContext('2d');mx.drawImage(n,0,0);mx.drawImage(bg,0,0);cur=m}
   const blurred=Doc.blurCv(cur,rad);const out=mk(W,H),ox=out.getContext('2d');ox.drawImage(blurred,0,0);
   Doc._label=t('Hintergrund unscharf');Doc.begin();const NL=place(out,L,0,t('Hintergrund (unscharf)'),'source-over',true);
   Doc.changed('layers');UI.layers&&UI.layers();Kit.toast(t('Fertig: Die unscharfe Kopie liegt als eigene Ebene unter dem Motiv.'))}
  catch(e){Kit.toast(e.message||String(e))}busy(false)};

 // ---------------- Text-Stile ----------------
 const STYLES=[['yt','YouTube Gelb',s=>({font:'Arial Black',color:'#ffde00',bold:true,stroke:{on:true,color:'#000000',w:Math.round(s/9)},shadow:{on:true,color:'#000000',alpha:1,blur:0,dx:Math.round(s*.07),dy:Math.round(s*.07)}})],
  ['wr','Weiß mit roter Kontur',s=>({font:'Arial Black',color:'#ffffff',bold:true,stroke:{on:true,color:'#e1001a',w:Math.round(s/10)},shadow:{on:true,color:'#000000',alpha:.75,blur:Math.round(s*.18),dx:0,dy:Math.round(s*.05)}})],
  ['neon','Neon',s=>({font:'Arial Black',color:'#ffffff',bold:true,stroke:{on:true,color:'#00e5ff',w:Math.round(s/16)},shadow:{on:true,color:'#00e5ff',alpha:1,blur:Math.round(s*.5),dx:0,dy:0}})],
  ['3d','3D-Kante',s=>({font:'Arial Black',color:'#ffffff',bold:true,stroke:{on:true,color:'#000000',w:Math.round(s/14)},shadow:{on:true,color:'#5a2ca0',alpha:1,blur:0,dx:Math.round(s*.09),dy:Math.round(s*.09)}})],
  ['fire','Feuer',s=>({font:'Impact',color:'#ffb300',bold:false,stroke:{on:true,color:'#7a0000',w:Math.round(s/12)},shadow:{on:true,color:'#ff3d00',alpha:1,blur:Math.round(s*.4),dx:0,dy:0}})],
  ['mc','Grün (Minecraft)',s=>({font:'Impact',color:'#7cfc00',bold:false,stroke:{on:true,color:'#123d00',w:Math.round(s/10)},shadow:{on:true,color:'#000000',alpha:.9,blur:0,dx:Math.round(s*.06),dy:Math.round(s*.06)}})],
  ['clean','Schlicht mit Schatten',s=>({font:'Segoe UI',color:'#ffffff',bold:true,stroke:{on:false,color:'#000000',w:0},shadow:{on:true,color:'#000000',alpha:.6,blur:Math.round(s*.25),dx:0,dy:Math.round(s*.06)}})]];
 X.textstyle=()=>{const L=Doc.layer();const isText=L&&L.type==='text';
  modal(`<div class="mhead"><h3>${t('Text-Stile für Thumbnails')}</h3></div><div class="mbody"><p class="hint">${isText?t('Klick auf einen Stil, um ihn auf den gewählten Text anzuwenden.'):t('Klick auf einen Stil, um einen neuen Text in diesem Stil einzufügen.')}</p>
   <div class="th-styles">${STYLES.map(([k,n])=>`<button class="th-st" data-st="${k}"><canvas width="260" height="70" data-pv="${k}"></canvas><span>${esc(t(n))}</span></button>`).join('')}</div></div><div class="mfoot"><div class="grow"></div><button class="btn" data-no>${t('Schließen')}</button></div>`,
   e=>{if(e.target.closest('[data-no]'))return UI.close();const b=e.target.closest('[data-st]');if(!b)return;const S=STYLES.find(x=>x[0]===b.dataset.st);
    const cur=Doc.layer();if(cur&&cur.type==='text'){Doc._label=t('Text-Stil');Doc.begin();Object.assign(cur,S[2](cur.size));Doc.measure&&Doc.measure(cur,true);Doc.changed('layers')}
    else{Doc.addText({text:t('DEIN TEXT')});const n=Doc.layer();Object.assign(n,S[2](n.size));Doc.measure&&Doc.measure(n,true);Doc.changed('layers')}UI.close();UI.layers&&UI.layers()});
  // Vorschau der Stile
  for(const[k,,f]of STYLES){const cv=$(`[data-pv="${k}"]`),x=cv.getContext('2d'),s=44,o=f(s);x.fillStyle='#2a2f45';x.fillRect(0,0,260,70);x.font=`${o.bold?'bold ':''}${s}px "${o.font}",sans-serif`;x.textAlign='center';x.textBaseline='middle';x.lineJoin='round';
   const sh=o.shadow;if(sh.on){x.save();x.shadowColor=Doc.hexA(sh.color,sh.alpha);x.shadowBlur=sh.blur;x.shadowOffsetX=sh.dx;x.shadowOffsetY=sh.dy;if(o.stroke.on){x.lineWidth=o.stroke.w*2;x.strokeStyle=o.stroke.color;x.strokeText('TEXT',130,36)}x.fillStyle=o.color;x.fillText('TEXT',130,36);x.restore()}
   if(o.stroke.on){x.lineWidth=o.stroke.w*2;x.strokeStyle=o.stroke.color;x.strokeText('TEXT',130,36)}x.fillStyle=o.color;x.fillText('TEXT',130,36)}};

 // ---------------- Objekt entfernen (inhaltsbasiert füllen, PatchMatch) ----------------
 function inpaint(D,W,H,hole){const R=3;
  // Bildpyramide
  const lev=[{W,H,img:Float32Array.from({length:W*H*3},(_,i)=>D[(i/3|0)*4+i%3]),hole:Uint8Array.from(hole)}];
  while(Math.min(lev[lev.length-1].W,lev[lev.length-1].H)>40&&lev.length<7){const a=lev[lev.length-1],w=a.W>>1,h=a.H>>1,img=new Float32Array(w*h*3),ho=new Uint8Array(w*h);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){let n=0,s=[0,0,0],anyH=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const k=(2*y+dy)*a.W+2*x+dx;if(a.hole[k]){anyH=1;continue}n++;for(let c=0;c<3;c++)s[c]+=a.img[k*3+c]}const j=y*w+x;ho[j]=anyH;if(n)for(let c=0;c<3;c++)img[j*3+c]=s[c]/n}
   lev.push({W:w,H:h,img,hole:ho})}
  // gröbste Stufe: von außen nach innen auffüllen
  {const a=lev[lev.length-1],k2=new Uint8Array(a.hole);let left=1;while(left){left=0;const nk=new Uint8Array(k2);for(let y=0;y<a.H;y++)for(let x=0;x<a.W;x++){const j=y*a.W+x;if(!k2[j])continue;let n=0,s=[0,0,0];
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=a.W||Y>=a.H)continue;const q=Y*a.W+X;if(k2[q])continue;n++;for(let c=0;c<3;c++)s[c]+=a.img[q*3+c]}
    if(n){for(let c=0;c<3;c++)a.img[j*3+c]=s[c]/n;nk[j]=0}else left=1}k2.set(nk);if(left&&nk.every((v,i)=>v===k2[i])&&!nk.some(v=>v===0))break}}
  let pnx=null,pny=null,pW=0;
  for(let li=lev.length-1;li>=0;li--){const a=lev[li],{W:w,H:h,img,hole:ho}=a;
   if(li<lev.length-1){const b=lev[li+1];for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=y*w+x;if(!ho[j])continue;const q=Math.min(b.H-1,y>>1)*b.W+Math.min(b.W-1,x>>1);for(let c=0;c<3;c++)img[j*3+c]=b.img[q*3+c]}}
   // gültige Quellen: Fenster ganz im Bild und nicht im (vergrößerten) Loch
   const I=new Int32Array((w+1)*(h+1));for(let y=0;y<h;y++)for(let x=0;x<w;x++)I[(y+1)*(w+1)+x+1]=ho[y*w+x]+I[y*(w+1)+x+1]+I[(y+1)*(w+1)+x]-I[y*(w+1)+x];
   const ok=new Uint8Array(w*h),list=[];for(let y=R;y<h-R;y++)for(let x=R;x<w-R;x++){const s=I[(y+R+1)*(w+1)+x+R+1]-I[(y-R)*(w+1)+x+R+1]-I[(y+R+1)*(w+1)+x-R]+I[(y-R)*(w+1)+x-R];if(!s){ok[y*w+x]=1;list.push(y*w+x)}}
   const holes=[];for(let j=0;j<w*h;j++)if(ho[j])holes.push(j);if(!holes.length||!list.length){pnx=null;continue}
   const nx=new Int32Array(w*h),ny=new Int32Array(w*h);
   for(const j of holes){const x=j%w,y=j/w|0;let qx=-1,qy=-1;if(pnx){const pj=Math.min(lev[li+1].H-1,y>>1)*pW+Math.min(pW-1,x>>1);qx=pnx[pj]*2+(x&1);qy=pny[pj]*2+(y&1)}
    if(qx<0||qy<0||qx>=w||qy>=h||!ok[qy*w+qx]){const r=list[(Math.random()*list.length)|0];qx=r%w;qy=r/w|0}nx[j]=qx;ny[j]=qy}
   const dist=(px,py,qx,qy,best)=>{let s=0;for(let dy=-R;dy<=R;dy++){const Y=py+dy;if(Y<0||Y>=h)continue;for(let dx=-R;dx<=R;dx++){const X=px+dx;if(X<0||X>=w)continue;const a1=(Y*w+X)*3,b1=((qy+dy)*w+qx+dx)*3;const d0=img[a1]-img[b1],d1=img[a1+1]-img[b1+1],d2=img[a1+2]-img[b1+2];s+=d0*d0+d1*d1+d2*d2}if(s>=best)return s}return s};
   const em=li===0?2:3;for(let e=0;e<em;e++){
    for(let it=0;it<4;it++){const fw=it%2===0,ord=fw?holes:holes.slice().reverse(),st=fw?-1:1;
     for(const j of ord){const x=j%w,y=j/w|0;let bx=nx[j],by=ny[j],best=dist(x,y,bx,by,Infinity);
      for(const[ox,oy]of[[st,0],[0,st]]){const X=x+ox,Y=y+oy;if(X<0||Y<0||X>=w||Y>=h)continue;const q=Y*w+X;if(!ho[q])continue;const cx=nx[q]-ox,cy=ny[q]-oy;if(cx<0||cy<0||cx>=w||cy>=h||!ok[cy*w+cx])continue;const d=dist(x,y,cx,cy,best);if(d<best){best=d;bx=cx;by=cy}}
      for(let r=Math.max(w,h);r>=1;r>>=1){const cx=bx+((Math.random()*2-1)*r|0),cy=by+((Math.random()*2-1)*r|0);if(cx<0||cy<0||cx>=w||cy>=h||!ok[cy*w+cx])continue;const d=dist(x,y,cx,cy,best);if(d<best){best=d;bx=cx;by=cy}}
      nx[j]=bx;ny[j]=by}}
    // Abstimmen: jeder Lochpunkt bekommt den Mittelwert aus allen Fenstern, die ihn überdecken
    const nw=new Float32Array(holes.length*3);holes.forEach((j,hi)=>{const x=j%w,y=j/w|0;let n=0,s0=0,s1=0,s2=0;for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=w||Y>=h)continue;const q=Y*w+X;if(!ho[q])continue;const sx=nx[q]-dx,sy=ny[q]-dy;if(sx<0||sy<0||sx>=w||sy>=h)continue;const b1=(sy*w+sx)*3;s0+=img[b1];s1+=img[b1+1];s2+=img[b1+2];n++}
     if(n){nw[hi*3]=s0/n;nw[hi*3+1]=s1/n;nw[hi*3+2]=s2/n}else{nw[hi*3]=img[j*3];nw[hi*3+1]=img[j*3+1];nw[hi*3+2]=img[j*3+2]}});
    holes.forEach((j,hi)=>{img[j*3]=nw[hi*3];img[j*3+1]=nw[hi*3+1];img[j*3+2]=nw[hi*3+2]})}
   pnx=nx;pny=ny;pW=w}
  const a=lev[0];for(let j=0;j<W*H;j++)if(hole[j]){D[j*4]=a.img[j*3];D[j*4+1]=a.img[j*3+1];D[j*4+2]=a.img[j*3+2]}}
 X.inpaint=inpaint;
 X.remove=async()=>{const L=pixLayer();if(!L)return;if(!Sel.has())return Kit.toast(t('Markiere zuerst, was weg soll (z. B. mit dem Lasso), dann „Objekt entfernen“.'));
  busy(true,'Objekt wird entfernt …');await nextFrame();
  try{const M=Sel.local(L),W=L.cv.width,H=L.cv.height,mp=M.getContext('2d').getImageData(0,0,W,H).data;let x0=W,y0=H,x1=-1,y1=-1;for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(mp[(y*W+x)*4+3]>20){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
   if(x1<0){busy(false);return Kit.toast(t('Die Auswahl liegt nicht auf dieser Ebene.'))}
   // Arbeitsbereich: Loch plus Umgebung, bei großen Bildern verkleinert rechnen
   const bw=x1-x0+1,bh=y1-y0+1,mg=Math.max(24,Math.round(Math.max(bw,bh)*1.2));const rx=Math.max(0,x0-mg),ry=Math.max(0,y0-mg),rw=Math.min(W,x1+mg+1)-rx,rh=Math.min(H,y1+mg+1)-ry;
   const k=Math.min(1,Math.sqrt(350000/(rw*rh)));const sw=Math.max(8,Math.round(rw*k)),sh=Math.max(8,Math.round(rh*k));
   const work=mk(sw,sh),wx=work.getContext('2d',{willReadFrequently:true});wx.imageSmoothingQuality='high';wx.drawImage(L.cv,rx,ry,rw,rh,0,0,sw,sh);
   const mm=mk(sw,sh),mx=mm.getContext('2d');mx.drawImage(M,rx,ry,rw,rh,0,0,sw,sh);const mdat=mx.getImageData(0,0,sw,sh).data;
   // Loch etwas größer als die Auswahl (Ränder des Objekts mit erfassen)
   let hole=new Uint8Array(sw*sh);for(let i=0;i<sw*sh;i++)hole[i]=mdat[i*4+3]>10?1:0;for(let g=0;g<2;g++){const h2=new Uint8Array(hole);for(let y=1;y<sh-1;y++)for(let x=1;x<sw-1;x++){const i=y*sw+x;if(hole[i-1]||hole[i+1]||hole[i-sw]||hole[i+sw])h2[i]=1}hole=h2}
   const id=wx.getImageData(0,0,sw,sh);inpaint(id.data,sw,sh,hole);wx.putImageData(id,0,0);
   // zurück in die Ebene, weich in die Auswahl geblendet
   const fill=mk(rw,rh),fx=fill.getContext('2d');fx.imageSmoothingQuality='high';fx.drawImage(work,0,0,rw,rh);
   const soft=mk(rw,rh),sx=soft.getContext('2d');const hm=mk(sw,sh),hx=hm.getContext('2d'),hd=hx.createImageData(sw,sh);for(let i=0;i<sw*sh;i++)hd.data[i*4+3]=hole[i]?255:0;hx.putImageData(hd,0,0);
   sx.drawImage(Doc.blurCv?Doc.blurCv(hm,1.5):hm,0,0,rw,rh);fx.globalCompositeOperation='destination-in';fx.drawImage(soft,0,0);
   Doc._label=t('Objekt entfernen');Doc.begin();const out=Doc.clone(L.cv);out.getContext('2d').drawImage(fill,rx,ry);L.cv=out;L.rev=(L.rev||0)+1;Sel.mask=null;Sel.changed&&Sel.changed();Doc.changed('canvas');UI.layers&&UI.layers();Kit.toast(t('Objekt entfernt. Rückgängig mit Strg+Z.'))}
  catch(e){Kit.toast(e.message||String(e))}busy(false)};

 // ---------------- Einstellungsebenen (wirken auf alles darunter, jederzeit änderbar) ----------------
 const W0={lift:[0,0,0,0],gamma:[0,0,0,0],gain:[0,0,0,0],offset:[0,0,0,0]};
 const wheelTab=w=>[0,1,2].map(i=>{const L=.25*(w.lift[3]+w.lift[i]),G=1+.5*(w.gain[3]+w.gain[i]),Gm=Math.exp(-.7*(w.gamma[3]+w.gamma[i])),O=.25*(w.offset[3]+w.offset[i]);const a=new Uint8ClampedArray(256);for(let v=0;v<256;v++){const x=v/255,y=clamp(x*G+L*(1-x),0,1);a[v]=Math.round(clamp(255*(Math.pow(y,Gm)+O),0,255))}return a});
 const wheelsOn=w=>!!w&&['lift','gamma','gain','offset'].some(k=>w[k].some(v=>Math.abs(v)>1e-4));
 const dl0=Doc.drawLayer;Doc.drawLayer=(c,L,k=1,plain)=>{if(L.type!=='adjust')return dl0(c,L,k,plain);if(plain||!L.visible)return;
  const cv=c.canvas,w=cv.width,h=cv.height;if(!w||!h)return;const src=mk(w,h);src.getContext('2d').drawImage(cv,0,0);const dst=mk(w,h);
  Doc.applyAdjust(src,dst,Object.assign({},Doc.ADJ0,L.adj||{}));if(wheelsOn(L.wheels)){const x=dst.getContext('2d'),id=x.getImageData(0,0,w,h),p=id.data,[R,G,B]=wheelTab(L.wheels);for(let i=0;i<p.length;i+=4){p[i]=R[p[i]];p[i+1]=G[p[i+1]];p[i+2]=B[p[i+2]]}x.putImageData(id,0,0)}
  c.save();c.setTransform(1,0,0,1,0,0);c.globalAlpha=L.opacity??1;c.globalCompositeOperation='source-atop';c.drawImage(dst,0,0);c.restore()};
 X.addAdjust=()=>{if(!Doc.d)return;Doc._label=t('Einstellungsebene');Doc.begin();const L={...Doc.defaults('pixel'),type:'adjust',name:t('Einstellungsebene'),x:0,y:0,w:Doc.d.w,h:Doc.d.h,adj:{},wheels:JSON.parse(JSON.stringify(W0))};delete L.cv;
  const d=Doc.d.layers,S=Doc.layer();const i=S?d.indexOf(S):d.length-1;d.splice(i+1,0,L);if(S&&S.parent)L.parent=S.parent;Doc.sel=L.id;Doc.changed('layers');UI.layers&&UI.layers();UI.props()};
 const ADJ=[['exposure','Belichtung',-100,100],['brightness','Helligkeit',-100,100],['contrast','Kontrast',-100,100],['saturation','Sättigung',-100,100],['warmth','Wärme',-100,100],['tint','Farbton',-100,100],['fade','Verblassen',0,100],['vignette','Vignette',0,100],['sharpen','Schärfen',0,100]];
 const wheelCv=(cv,v)=>{const S=cv.width,x=cv.getContext('2d'),R=S/2-3;const img=x.createImageData(S,S),d=img.data;for(let j=0;j<S;j++)for(let i=0;i<S;i++){const dx=(i-S/2)/R,dy=(j-S/2)/R,r=Math.hypot(dx,dy),k=(j*S+i)*4;if(r>1)continue;const a=Math.atan2(-dy,dx);const c=[Math.cos(a),Math.cos(a-2.094),Math.cos(a+2.094)];for(let n=0;n<3;n++)d[k+n]=Math.round(255*(.42+(.5*c[n]+.5-.42)*r*.75)*.85);d[k+3]=255}x.putImageData(img,0,0);
  const m=(v[0]+v[1]+v[2])/3,px=(v[0]-m)-((v[1]-m)+(v[2]-m))/2,py=-((v[1]-m)-(v[2]-m))*Math.sqrt(3)/2;x.beginPath();x.arc(S/2+px*R,S/2+py*R,6,0,7);x.fillStyle='#fff';x.fill();x.strokeStyle='#000';x.lineWidth=2;x.stroke()};
 let fl=null;const floatBox=()=>{if(!fl){fl=document.createElement('div');fl.className='th-adjpanel';document.body.appendChild(fl)}fl.hidden=false;return fl};
 const up0=UI.props;UI.props=(...a)=>{const L=Doc.d&&Doc.layer();if(!L||L.type!=='adjust'){if(fl)fl.hidden=true;return up0.apply(UI,a)}const pb=$('#propsBox');const box=pb&&pb.offsetParent?pb:floatBox();if(box!==fl&&fl)fl.hidden=true;const A=L.adj||(L.adj={});L.wheels=L.wheels||JSON.parse(JSON.stringify(W0));
  box.innerHTML=`<div class="sec"><h3>${t('Einstellungsebene')}</h3><div class="th-adj"><div class="row"><span>${t('Name')}</span><input data-adjn value="${esc(L.name)}"></div><div class="row"><span>${t('Deckkraft')}</span><input type="range" min="0" max="100" value="${Math.round((L.opacity??1)*100)}" data-adjo></div>
   ${ADJ.map(([k,n,a,b])=>`<div class="row"><span>${esc(t(n))}</span><input type="range" min="${a}" max="${b}" value="${A[k]||0}" data-adj="${k}"><b>${A[k]||0}</b></div>`).join('')}
   <h4>${t('Farbräder')}</h4><div class="th-wheels">${[['lift','Lift'],['gamma','Gamma'],['gain','Gain']].map(([k,n])=>`<div><b>${n}</b><canvas width="96" height="96" data-wh="${k}"></canvas><input type="range" min="-1" max="1" step="0.01" value="${L.wheels[k][3]}" data-whm="${k}"></div>`).join('')}</div>
   <p class="hint">${t('Wirkt auf alle Ebenen darunter. Doppelklick auf ein Rad setzt es zurück.')}</p><button class="btn" data-adjreset>${t('Alles zurücksetzen')}</button></div></div>`;
  box.querySelectorAll('canvas[data-wh]').forEach(cv=>{const k=cv.dataset.wh;wheelCv(cv,L.wheels[k]);const at=e=>{const r=cv.getBoundingClientRect(),R=r.width/2-3;let px=(e.clientX-r.left-r.width/2)/R,py=(e.clientY-r.top-r.height/2)/R;const l=Math.hypot(px,py);if(l>1){px/=l;py/=l}const rr=Math.min(1,Math.hypot(px,py)),an=Math.atan2(-py,px);
    L.wheels[k][0]=Math.cos(an)*rr*2/3;L.wheels[k][1]=Math.cos(an-2.094)*rr*2/3;L.wheels[k][2]=Math.cos(an+2.094)*rr*2/3;wheelCv(cv,L.wheels[k]);Doc.changed('canvas')};
   cv.onpointerdown=e=>{Doc.begin('adjw'+L.id);cv.setPointerCapture(e.pointerId);at(e);cv.onpointermove=at;cv.onpointerup=()=>{cv.onpointermove=null}};cv.ondblclick=()=>{Doc.begin();L.wheels[k]=[0,0,0,L.wheels[k][3]];wheelCv(cv,L.wheels[k]);Doc.changed('canvas')}});
  box.oninput=e=>{const i=e.target;if(i.dataset.adj){Doc.begin('adj'+L.id+i.dataset.adj);A[i.dataset.adj]=+i.value;i.nextElementSibling.textContent=i.value;Doc.changed('canvas')}else if(i.dataset.whm){Doc.begin('adjm'+L.id);L.wheels[i.dataset.whm][3]=+i.value;Doc.changed('canvas')}else if(i.dataset.adjo!==undefined){Doc.begin('adjo'+L.id);L.opacity=+i.value/100;Doc.changed('canvas')}else if(i.dataset.adjn!==undefined){L.name=i.value;UI.layers&&UI.layers()}};
  box.onclick=e=>{if(e.target.closest('[data-adjreset]')){Doc.begin();L.adj={};L.wheels=JSON.parse(JSON.stringify(W0));Doc.changed('canvas');UI.props()}}};

 // ---------------- Scopes ----------------
 let sc=null,mode='wave',tm=0;
 X.scopes=()=>{if(sc){sc.remove();sc=null;clearInterval(tm);return}sc=document.createElement('div');sc.className='th-scope';
  sc.innerHTML=`<div class="th-sh"><b>${t('Scopes')}</b><select>${[['wave','Waveform'],['parade','RGB-Parade'],['vector','Vektorskop'],['hist','Histogramm']].map(([v,n])=>`<option value="${v}">${t(n)}</option>`).join('')}</select><button class="ib">✕</button></div><canvas width="340" height="190"></canvas>`;
  document.body.appendChild(sc);sc.querySelector('select').onchange=e=>{mode=e.target.value;draw()};sc.querySelector('button').onclick=X.scopes;
  const hh=sc.querySelector('.th-sh');hh.onpointerdown=e=>{if(e.target.closest('select,button'))return;const r=sc.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;hh.setPointerCapture(e.pointerId);hh.onpointermove=ev=>{sc.style.left=(ev.clientX-dx)+'px';sc.style.top=(ev.clientY-dy)+'px';sc.style.right='auto'};hh.onpointerup=()=>{hh.onpointermove=null}};
  let last='';const draw=()=>{if(!sc||!Doc.d)return;const src=Doc.need||!Doc.out?Doc.render():Doc.out;const Wd=220,Hd=Math.max(2,Math.round(Wd*src.height/src.width));const tmp=mk(Wd,Hd),tx=tmp.getContext('2d');tx.drawImage(src,0,0,Wd,Hd);const p=tx.getImageData(0,0,Wd,Hd).data;
   const cv=sc.querySelector('canvas'),x=cv.getContext('2d'),CW=cv.width,CH=cv.height;x.fillStyle='#0b0b0f';x.fillRect(0,0,CW,CH);const img=x.getImageData(0,0,CW,CH),d=img.data;const add=(i,j,r,g,b)=>{if(i<0||j<0||i>=CW||j>=CH)return;const k=(j*CW+i)*4;d[k]=Math.min(255,d[k]+r);d[k+1]=Math.min(255,d[k+1]+g);d[k+2]=Math.min(255,d[k+2]+b)};
   if(mode==='wave'||mode==='parade'){const n=mode==='parade'?3:1,cw=CW/n;for(let j=0;j<Hd;j++)for(let i=0;i<Wd;i++){const k=(j*Wd+i)*4,r=p[k],g=p[k+1],b=p[k+2];if(n===1)add(Math.floor(i*CW/Wd),Math.round((1-(.2126*r+.7152*g+.0722*b)/255)*(CH-1)),18,40,18);else{const xi=i*cw/Wd;add(Math.floor(xi),Math.round((1-r/255)*(CH-1)),55,8,8);add(Math.floor(cw+xi),Math.round((1-g/255)*(CH-1)),8,55,8);add(Math.floor(2*cw+xi),Math.round((1-b/255)*(CH-1)),10,14,60)}}}
   else if(mode==='vector'){const cx=CW/2,cy=CH/2,R=CH/2-6;for(let k=0;k<p.length;k+=4){const r=p[k]/255,g=p[k+1]/255,b=p[k+2]/255;add(Math.round(cx+(-.1146*r-.3854*g+.5*b)*2*R),Math.round(cy-(.5*r-.4542*g-.0458*b)*2*R),30,40,30)}}
   else{const hr=new Uint32Array(256),hg=new Uint32Array(256),hb=new Uint32Array(256);for(let k=0;k<p.length;k+=4){hr[p[k]]++;hg[p[k+1]]++;hb[p[k+2]]++}let mx=1;for(let v=1;v<255;v++)mx=Math.max(mx,hr[v],hg[v],hb[v]);for(let v=0;v<256;v++){const i=Math.floor(v*CW/256);for(const[hh2,col]of[[hr,[90,10,10]],[hg,[10,90,10]],[hb,[12,18,100]]]){const top=Math.round(CH-Math.min(1,hh2[v]/mx)*(CH-4));for(let j=top;j<CH;j++)add(i,j,...col)}}}
   x.putImageData(img,0,0);x.strokeStyle='#ffffff22';x.fillStyle='#ffffff66';x.font='10px sans-serif';if(mode==='vector'){x.beginPath();x.arc(CW/2,CH/2,CH/2-6,0,7);x.stroke()}else if(mode!=='hist')for(const v of[0,50,100]){const y=Math.round((1-v/100)*(CH-1))+.5;x.beginPath();x.moveTo(0,y);x.lineTo(CW,y);x.stroke();x.fillText(String(v),2,y-2)}};
  tm=setInterval(()=>{if(!sc)return;const key=JSON.stringify([Doc.undo.length,Doc.redo.length,Doc.need]);if(key!==last){last=key;draw()}},500);draw()};

 // ---------------- Thumbnail-Vorschau wie im YouTube-Feed ----------------
 X.preview=()=>{if(!Doc.d)return;const img=Doc.renderAt(640,Math.round(640*Doc.d.h/Doc.d.w)).toDataURL('image/jpeg',.9);const title=esc(Doc.d.name||t('Mein Video'));
  const card=(w,small)=>`<div class="yt-card ${small?'yt-side':''}" style="--w:${w}px"><div class="yt-thumb"><img src="${img}" alt=""><span class="yt-dur">12:34</span></div><div class="yt-meta">${small?'':'<i class="yt-av"></i>'}<div><b>${title}</b><span>${t('Dein Kanal')}</span><span>${t('12.345 Aufrufe · vor 2 Stunden')}</span></div></div></div>`;
  modal(`<div class="mhead"><h3>${t('So sieht dein Thumbnail auf YouTube aus')}</h3><div class="grow"></div><div class="seg"><button class="btn sm on" data-yt="dark">${t('Dunkel')}</button><button class="btn sm" data-yt="light">${t('Hell')}</button></div></div>
   <div class="mbody"><div class="yt-wrap yt-dark" id="ytw"><div class="yt-col"><p class="yt-lab">${t('Startseite am PC')}</p>${card(330)}</div><div class="yt-col"><p class="yt-lab">${t('Handy')}</p>${card(300)}</div><div class="yt-col"><p class="yt-lab">${t('Seitenleiste (Vorschläge)')}</p>${card(168,true)}${card(168,true)}<p class="yt-lab">${t('Winzig (Suche am Handy)')}</p><div class="yt-thumb" style="width:120px"><img src="${img}" alt=""></div></div></div>
   <p class="hint">${t('Tipp: Ist der Text auch in der kleinsten Ansicht noch lesbar und die Figur zu erkennen, funktioniert das Thumbnail.')}</p></div><div class="mfoot"><div class="grow"></div><button class="btn" data-no>${t('Schließen')}</button></div>`,
   e=>{if(e.target.closest('[data-no]'))return UI.close();const b=e.target.closest('[data-yt]');if(b){$('#ytw').className='yt-wrap yt-'+b.dataset.yt;$('#mbox').querySelectorAll('[data-yt]').forEach(x=>x.classList.toggle('on',x===b))}},true)};
 const uc0=UI.close;UI.close=(...a)=>{const b=$('#mbox');if(b){b.style.maxWidth='';b.style.width=''}return uc0.apply(UI,a)};

 // ---------------- Vorlagen ----------------
 const TPL=[['side','Figur links, Text rechts'],['vs','Vorher / Nachher'],['react','Reaktion (großes Gesicht)'],['list','Top-Liste (Nummer)']];
 X.templates=()=>{modal(`<div class="mhead"><h3>${t('Thumbnail-Vorlagen')}</h3></div><div class="mbody"><p class="hint">${t('Die Vorlage kommt als Ebenen in dein Bild. Ersetze die grauen Platzhalter durch deine Bilder und ändere die Texte.')}</p><div class="th-tpls">${TPL.map(([k,n])=>`<button class="btn big" data-tp="${k}">${esc(t(n))}</button>`).join('')}</div></div><div class="mfoot"><div class="grow"></div><button class="btn" data-no>${t('Abbrechen')}</button></div>`,
  e=>{if(e.target.closest('[data-no]'))return UI.close();const b=e.target.closest('[data-tp]');if(!b)return;UI.close();const d=Doc.d,W=d.w,H=d.h,ph=(x,y,w,h,n)=>{Doc.addShape('rect',{x,y,w,h},{fill:'#8a8fa8',name:n,radius:Math.round(Math.min(w,h)*.04)})};
   const txt=(s,cx,cy,sz,st)=>{Doc.addText({text:s,cx,cy,size:sz});const L=Doc.layer();Object.assign(L,STYLES.find(x=>x[0]===st)[2](L.size));Doc.measure&&Doc.measure(L,true)};
   Doc.addShape('rect',{x:0,y:0,w:W,h:H},{fill:'#1b1f3b',name:t('Hintergrund')});
   if(b.dataset.tp==='side'){ph(W*.03,H*.08,W*.45,H*.92,t('Platzhalter: Figur'));txt(t('DEIN TEXT'),W*.73,H*.38,Math.round(H*.17),'yt');txt(t('HIER'),W*.73,H*.62,Math.round(H*.17),'wr')}
   else if(b.dataset.tp==='vs'){ph(0,0,W*.5,H,t('Platzhalter: Vorher'));ph(W*.5,0,W*.5,H,t('Platzhalter: Nachher'));Doc.addShape('rect',{x:W*.495,y:0,w:W*.01,h:H},{fill:'#ffffff',name:t('Trennlinie')});txt(t('VORHER'),W*.25,H*.85,Math.round(H*.12),'wr');txt(t('NACHHER'),W*.75,H*.85,Math.round(H*.12),'yt')}
   else if(b.dataset.tp==='react'){ph(W*.04,H*.1,W*.55,H*.8,t('Platzhalter: Szene'));ph(W*.58,H*.12,W*.4,H*.88,t('Platzhalter: Gesicht'));txt('?!',W*.5,H*.2,Math.round(H*.25),'fire')}
   else{ph(W*.38,H*.06,W*.58,H*.88,t('Platzhalter: Bild'));txt('#1',W*.19,H*.4,Math.round(H*.38),'yt');txt(t('BESTE'),W*.19,H*.78,Math.round(H*.12),'wr')}
   Doc.changed('layers');UI.layers&&UI.layers();Kit.toast(t('Vorlage eingefügt.'))})};

 // ---------------- Export in mehreren Größen ----------------
 const SIZES=[['yt','YouTube-Thumbnail',1280,720,1],['shorts','Shorts / TikTok / Reels',1080,1920,1],['ig','Instagram (quadratisch)',1080,1080,0],['x','X / Twitter',1600,900,0],['twp','Twitch-Panel',320,160,0],['dc','Discord-Banner',960,540,0]];
 X.multi=()=>{if(!Doc.d)return;modal(`<div class="mhead"><h3>${t('In mehreren Größen exportieren')}</h3></div><div class="mbody">${SIZES.map(([k,n,w,h,on])=>`<label class="chk"><input type="checkbox" data-sz="${k}" ${on?'checked':''}> ${esc(t(n))} <span class="muted">${w} × ${h}</span></label>`).join('')}
   <div class="row" style="margin-top:8px"><span>${t('Format')}</span><select id="mxf"><option value="png">PNG</option><option value="jpg">JPG</option></select></div><p class="hint">${t('Passt das Seitenverhältnis nicht, wird mittig zugeschnitten. Hochformat bekommt einen unscharfen Hintergrund, damit nichts abgeschnitten wird.')}</p></div>
   <div class="mfoot"><button class="btn" data-no>${t('Abbrechen')}</button><button class="btn primary" data-yes>${t('Exportieren')}</button></div>`,async e=>{if(e.target.closest('[data-no]'))return UI.close();if(!e.target.closest('[data-yes]'))return;
   const pick=SIZES.filter(s=>$(`[data-sz="${s[0]}"]`).checked),fmt=$('#mxf').value;UI.close();if(!pick.length)return;busy(true,'Wird exportiert …');
   try{const d=Doc.d,base=Doc.renderAt(d.w,d.h),R=d.w/d.h,out=[];
    for(const[k,n,w,h]of pick){const cv=mk(w,h),x=cv.getContext('2d');x.imageSmoothingQuality='high';const r=w/h;
     if(r<R*0.75){// Hochformat: unscharfer Hintergrund + ganzes Bild
      const s=Math.max(w/d.w,h/d.h);x.filter='blur(30px) brightness(.7)';x.drawImage(base,(w-d.w*s)/2,(h-d.h*s)/2,d.w*s,d.h*s);x.filter='none';const s2=w/d.w;x.drawImage(base,0,(h-d.h*s2)/2,w,d.h*s2)}
     else{const s=Math.max(w/d.w,h/d.h);x.drawImage(base,(w-d.w*s)/2,(h-d.h*s)/2,d.w*s,d.h*s)}
     if(fmt==='jpg'){const c2=mk(w,h),y=c2.getContext('2d');y.fillStyle='#fff';y.fillRect(0,0,w,h);y.drawImage(cv,0,0);x.drawImage(c2,0,0)}
     const blob=await new Promise(z=>cv.toBlob(z,fmt==='jpg'?'image/jpeg':'image/png',.92));const name=`${(d.name||'Bild').replace(/[\\/:*?"<>|]/g,'_')} - ${n.replace(/[\\/:*?"<>|]/g,'-')}.${fmt}`;
     const r2=await fetch('api/export?name='+encodeURIComponent(name),{method:'POST',body:blob});const j=await r2.json();if(!r2.ok)throw new Error(j.error||r2.status);out.push(j.path)}
    busy(false);Kit.toast(t('Exportiert')+': '+out.length+' '+t('Dateien')+' – '+out[0].replace(/[\\/][^\\/]*$/,''))}
   catch(err){busy(false);Kit.toast(t('Export fehlgeschlagen.')+' '+(err.message||''))}})};

 Object.assign(AI.ACTS,{th_preview:X.preview,th_rim:X.rim,th_bgblur:X.bgblur,th_text:X.textstyle,th_remove:X.remove,th_adjust:X.addAdjust,th_scopes:X.scopes,th_tpl:X.templates,th_multi:X.multi});
 const st=document.createElement('style');st.textContent=`.th-form .row{display:flex;gap:8px;align-items:center;margin:4px 0 10px 24px}.th-form .row input[type=range]{flex:1}
 .th-styles{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.th-st{display:flex;flex-direction:column;gap:4px;align-items:center;background:none;border:1px solid #ffffff22;border-radius:8px;padding:6px;cursor:pointer;color:inherit}.th-st:hover{border-color:var(--accent,#7c6cff)}.th-st canvas{width:100%;border-radius:5px}
 .th-adj .row{display:flex;gap:6px;align-items:center;margin:3px 0}.th-adj .row span{flex:0 0 90px;font-size:12px}.th-adj .row input[type=range]{flex:1}.th-adj .row b{width:30px;text-align:right;font-size:11px}
 .th-wheels{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;text-align:center}.th-wheels canvas{width:84px;height:84px;cursor:crosshair;touch-action:none;border-radius:50%;display:block;margin:2px auto}.th-wheels input{width:84px}
 .th-scope{position:fixed;right:16px;top:70px;z-index:900;background:#121218f2;border:1px solid #ffffff22;border-radius:10px;padding:6px;box-shadow:0 10px 30px #0008}.th-scope canvas{display:block;border-radius:6px}.th-sh{display:flex;gap:8px;align-items:center;padding:2px 4px 6px;cursor:move;color:#ddd;font-size:12px}.th-sh select{margin-left:auto}
 .th-adjpanel{position:fixed;right:16px;bottom:16px;z-index:880;width:300px;max-height:70vh;overflow:auto;background:#16161ef5;border:1px solid #ffffff22;border-radius:10px;padding:10px;box-shadow:0 10px 30px #0008;color:#ddd}.th-adjpanel[hidden]{display:none}
 .th-tpls{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
 .yt-wrap{display:flex;gap:22px;padding:16px;border-radius:10px;flex-wrap:wrap}.yt-dark{background:#0f0f0f;color:#f1f1f1}.yt-light{background:#fff;color:#0f0f0f}.yt-col{display:flex;flex-direction:column;gap:10px}.yt-lab{font-size:11px;opacity:.6;margin:0}
 .yt-card{width:var(--w);font-family:Roboto,Arial,sans-serif}.yt-side{display:flex;gap:8px;width:auto}.yt-side .yt-thumb{width:var(--w);flex:none}.yt-thumb{position:relative;border-radius:10px;overflow:hidden;line-height:0}.yt-thumb img{width:100%;aspect-ratio:16/9;object-fit:cover}
 .yt-dur{position:absolute;right:6px;bottom:6px;background:#000c;color:#fff;font-size:12px;line-height:1;padding:3px 4px;border-radius:4px;font-weight:500}.yt-meta{display:flex;gap:10px;margin-top:10px}.yt-side .yt-meta{margin-top:0;max-width:170px}.yt-meta b{display:block;font-size:14px;line-height:1.35;margin-bottom:3px}.yt-side .yt-meta b{font-size:13px}.yt-meta span{display:block;font-size:12px;opacity:.65}.yt-av{flex:none;width:36px;height:36px;border-radius:50%;background:#888}`;document.head.appendChild(st);
 return X})();
