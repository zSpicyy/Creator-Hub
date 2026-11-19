// Ansicht (Zoom, Verschieben) und Werkzeuge auf der Zeichenfläche.
const View=(()=>{const V={};const {$}=Kit;
 V.z=1;V.ox=0;V.oy=0;let cv,ctx,dpr=1,raf=0,pat=null;
 V.init=()=>{cv=$('#view');ctx=cv.getContext('2d',{desynchronized:true});new ResizeObserver(()=>V.resize()).observe($('#stage'))};
 V.resize=()=>{const st=$('#stage'),r={width:st.clientWidth,height:st.clientHeight};if(!r.width||!r.height)return; // ausgeblendet (Startseite): Ansicht nicht verschieben
 dpr=window.devicePixelRatio||1;if(V.w&&V.fitted){V.ox+=(r.width-V.w)/2;V.oy+=(r.height-V.h)/2}cv.width=Math.max(1,r.width*dpr);cv.height=Math.max(1,r.height*dpr);V.w=r.width;V.h=r.height;if(!V.fitted&&Doc.d){V.fit();V.fitted=true}V.draw()};
 V.fit=()=>{const d=Doc.d;if(!d||!V.w)return;V.z=Math.min((V.w-60)/d.w,(V.h-60)/d.h,8);V.ox=(V.w-d.w*V.z)/2;V.oy=(V.h-d.h*V.z)/2;V.draw()};
 V.zoomAt=(z,sx=V.w/2,sy=V.h/2)=>{z=Math.max(.02,Math.min(32,z));const px=(sx-V.ox)/V.z,py=(sy-V.oy)/V.z;V.z=z;V.ox=sx-px*z;V.oy=sy-py*z;V.draw()};
 // Ansicht als Zoom + Bildmitte merken, damit sie unabhängig von der Fenstergröße wiederhergestellt wird
 V.get=()=>V.w?{z:V.z,cx:(V.w/2-V.ox)/V.z,cy:(V.h/2-V.oy)/V.z}:null;
 V.set=v=>{if(!v||!(v.z>0)||!V.w)return false;V.z=v.z;if(v.cx!=null){V.ox=V.w/2-v.cx*v.z;V.oy=V.h/2-v.cy*v.z}else{V.ox=v.ox;V.oy=v.oy}V.fitted=true;V.draw();return true};
 V.toDoc=(sx,sy)=>[(sx-V.ox)/V.z,(sy-V.oy)/V.z];
 V.toScr=(x,y)=>[x*V.z+V.ox,y*V.z+V.oy];
 V.draw=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;paint()})};
 const checker=()=>{if(pat)return pat;const t=Doc.mk(16,16),c=t.getContext('2d');c.fillStyle='#cfcfcf';c.fillRect(0,0,16,16);c.fillStyle='#ffffff';c.fillRect(0,0,8,8);c.fillRect(8,8,8,8);return pat=ctx.createPattern(t,'repeat')};
 function paint(){const d=Doc.d;if(!d||!ctx)return;if(Doc.need)Doc.render();
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,V.w,V.h);
  const x=V.ox,y=V.oy,w=d.w*V.z,h=d.h*V.z;
  ctx.save();ctx.shadowColor='#0008';ctx.shadowBlur=24;ctx.fillStyle='#fff';ctx.fillRect(x,y,w,h);ctx.restore();
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.translate(x,y);ctx.fillStyle=checker();ctx.fillRect(0,0,w,h);ctx.restore();
  ctx.imageSmoothingEnabled=V.z<2;ctx.imageSmoothingQuality='high';ctx.drawImage(chanView(Doc.out),x,y,w,h);
  Tools.overlay(ctx);if(V.rulers&&UI.mode==='pro')rulers();
  const zv=$('#zoomv');if(zv)zv.textContent=Math.round(V.z*100)+' %';if(typeof Extra!=='undefined'&&$('#navc'))Extra.navLater()}
 // Lineale (oben, links) mit Einteilung in Bildpixeln
 V.chan={r:true,g:true,b:true,a:true};let chK='',chC=null;
 function chanView(o){const C=V.chan;if(C.r&&C.g&&C.b&&C.a)return o;const c=chC&&chC.width===o.width&&chC.height===o.height?chC:Doc.mk(o.width,o.height),x=c.getContext('2d');x.globalCompositeOperation='copy';x.drawImage(o,0,0);
  x.globalCompositeOperation='multiply';x.fillStyle=`rgb(${C.r?255:0},${C.g?255:0},${C.b?255:0})`;x.fillRect(0,0,c.width,c.height);x.globalCompositeOperation='destination-in';x.drawImage(o,0,0);if(!C.a){x.globalCompositeOperation='destination-over';x.fillStyle='#000';x.fillRect(0,0,c.width,c.height)}x.globalCompositeOperation='source-over';chC=c;return c}
 V.rulers=true;V.grid=false;V.gridSize=50;V.snapOn=true;V.guidesOn=true;
 function rulers(){const R=18,z=V.z,c=ctx;const st=getComputedStyle(document.body);c.save();c.fillStyle=st.getPropertyValue('--panel')||'#222';c.fillRect(0,0,V.w,R);c.fillRect(0,0,R,V.h);
  c.strokeStyle=st.getPropertyValue('--line')||'#444';c.beginPath();c.moveTo(0,R+.5);c.lineTo(V.w,R+.5);c.moveTo(R+.5,0);c.lineTo(R+.5,V.h);c.stroke();
  const steps=[1,2,5,10,25,50,100,250,500,1000,2500,5000];let step=steps.find(s=>s*z>=60)||10000;c.fillStyle=c.strokeStyle=st.getPropertyValue('--muted')||'#999';c.font='9px sans-serif';c.lineWidth=1;c.beginPath();
  const x0=Math.floor(-V.ox/z/step)*step;for(let x=x0;x*z+V.ox<V.w;x+=step/5){const sx=Math.round(x*z+V.ox)+.5;if(sx<R)continue;const big=Math.abs(x/step-Math.round(x/step))<1e-6;c.moveTo(sx,big?4:R-5);c.lineTo(sx,R);if(big)c.fillText(Math.round(x),sx+2,10)}
  const y0=Math.floor(-V.oy/z/step)*step;for(let y=y0;y*z+V.oy<V.h;y+=step/5){const sy=Math.round(y*z+V.oy)+.5;if(sy<R)continue;const big=Math.abs(y/step-Math.round(y/step))<1e-6;c.moveTo(big?4:R-5,sy);c.lineTo(R,sy);if(big){c.save();c.translate(10,sy+2);c.rotate(-Math.PI/2);c.fillText(Math.round(y),0,0);c.restore()}}
  c.stroke();
  c.fillStyle=st.getPropertyValue('--panel')||'#222';c.fillRect(0,0,R,R);c.restore()}
 V.guides=()=>{const d=Doc.d;if(!d)return[];d.extra=d.extra||{};return d.extra.guides||(d.extra.guides=[])};
 return V})();

const Tools=(()=>{const T={};const {$,esc}=Kit;
 T.SIMPLE=['crop','rsel','esel','lasso','wand'];T.tool='move';T.color='#ff3b3b';T.color2='#ffffff';
 T.o={brush:{size:30,hard:80,op:100,blend:'source-over'},eraser:{size:40,hard:80,op:100},clone:{size:40,hard:60,op:100,align:'aligned'},heal:{size:40,hard:50,op:100,align:'aligned'},smudge:{size:40,hard:40,op:60},pencil:{size:1,hard:100,op:100,blend:'source-over',shape:'square',grid:true},airbrush:{size:80,hard:0,op:60,blend:'source-over',rate:50},dodge:{size:60,hard:30,op:40,range:'mid'},burn:{size:60,hard:30,op:40,range:'mid'},blurb:{size:50,hard:30,op:70},sharpb:{size:50,hard:30,op:50},sym:{mode:'off',pressure:true},shape:{kind:'rect'},fill:{tol:32,mode:'similar',src:'color',pat:'checker',merged:false,diag:false,trans:true},crop:{ratio:'free',guides:'thirds',fixed:false,layer:false},sel:{mode:'replace',tol:32,all:false,feather:0,round:0,diag:false,ratio:'free'},grad:{kind:'linear',fgt:false,op:100,preset:'fgbg',repeat:'none',rev:false,offset:0},dyn:{spacing:18,scatter:0,jitter:0,rot:false},picker:{avg:1,target:'fg',merged:true},move:{mode:'layer',pick:'pick'},zoom:{}};
 const I={move:'<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
  rsel:'<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2.5"/>',esel:'<ellipse cx="12" cy="12" rx="9" ry="7" stroke-dasharray="3 2.5"/>',
  lasso:'<path d="M7 18c-3-1-4.5-4-3.5-7C5 6 10 4 15 5s7 4 6 7.5-6 4.5-10 3.5" stroke-dasharray="3 2.5"/><path d="M7 18c0 2 1 3 3 3"/>',
  wand:'<path d="m3 21 12-12"/><path d="m14 4 1-2 1 2 2 1-2 1-1 2-1-2-2-1zM19 10l.6-1.2L21 8l-1.4-.8L19 6l-.6 1.2L17 8l1.4.8z"/>',
  crop:'<path d="M6 2v16h16"/><path d="M2 6h16v16"/>',
  brush:'<path d="M9.5 14.5 3 21"/><path d="M18 3l3 3-9 9-3-3z"/><path d="M6 15c-2 0-3 2-3 4"/>',
  eraser:'<path d="m7 21-4-4 10-10 8 8-6 6z"/><path d="M7 21h14"/><path d="m9 11 8 8"/>',
  fill:'<path d="m19 11-8-8-8 8 8 8z"/><path d="M5 11h14"/><path d="M20 15s2 2.5 2 4a2 2 0 0 1-4 0c0-1.5 2-4 2-4z"/>',
  gradient:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M11 3v18M15 3v18" opacity=".5"/>',
  pencil:'<path d="M17 3l4 4L8 20l-5 1 1-5z"/><path d="m15 5 4 4"/>',
  airbrush:'<path d="M3 21l7-7"/><rect x="9" y="5" width="9" height="9" rx="2" transform="rotate(45 13.5 9.5)"/><path d="M18 3h.01M21 6h.01M20 2h.01M22 4h.01"/>',
  heal:'<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M11 11h.01M13 13h.01M11 13h.01M13 11h.01"/>',
  dodge:'<circle cx="9" cy="9" r="5"/><path d="m13 13 8 8"/>',burn:'<path d="M5 15a7 7 0 0 0 14 0c0-2-1-3.5-1.5-4.5L15 13c0-3-1-6-4-8 0 3-2 4.5-4 7-1 1-2 2-2 3z"/>',
  blurb:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',sharpb:'<path d="M12 3 4 21h16z"/><path d="M12 9v6"/>',
  clone:'<path d="M9 14V8a3 3 0 0 1 6 0v6"/><path d="M5 14h14v3H5z"/><path d="M7 20h10"/>',
  smudge:'<path d="M4 19c3 0 4-2 6-5s4-6 8-7"/><path d="M4 15c2 0 3-1 4-3" opacity=".55"/><circle cx="19.5" cy="6" r="2"/>',
  text:'<path d="M5 5h14M12 5v14M9 19h6"/>',shape:'<rect x="3" y="3" width="11" height="11" rx="1"/><circle cx="16" cy="16" r="5"/>',
  picker:'<path d="m2 22 1-4 9-9 3 3-9 9z"/><path d="M14 4l6 6M16 2l6 6-3 3-6-6z"/>',
  hand:'<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4L3.6 17a2 2 0 0 1 2.8-2.8L8 16"/>',
  zoom:'<circle cx="10" cy="10" r="7"/><path d="m21 21-6-6M7 10h6M10 7v6"/>'};
 T.LIST=[['move','Verschieben','V'],['rsel','Rechteckige Auswahl','R'],['esel','Elliptische Auswahl','Umschalt+R'],['lasso','Freie Auswahl (Lasso)','L'],['wand','Zauberstab','W'],
  ['crop','Zuschneiden','C'],['brush','Pinsel','B'],['pencil','Stift','N'],['airbrush','Airbrush','A'],['eraser','Radierer','E'],['fill','Füllen','G'],['gradient','Farbverlauf','Umschalt+G'],
  ['clone','Klonen (Stempel)','S'],['heal','Heilen','J'],['smudge','Verwischen','Umschalt+S'],['dodge','Abwedeln (aufhellen)','O'],['burn','Nachbelichten (abdunkeln)','Umschalt+O'],['blurb','Weichzeichnen-Pinsel','Umschalt+U'],['sharpb','Schärfen-Pinsel','K'],['text','Text','T'],['shape','Formen','U'],['picker','Pipette','I'],['hand','Hand','H'],['zoom','Zoom','Z']].map(x=>[...x,I[x[0]]]);
 const icon=p=>`<svg viewBox="0 0 24 24">${p}</svg>`;T.icon=icon;
 // Werkzeuge aus eigenen Dateien: T.ext(id,name,taste,icon,{down,move,up,overlay,opts,cancel,cursor,leave})
 T.EXT={};T.ext=(id,name,key,ic,o,after)=>{T.EXT[id]=o;const i=T.LIST.findIndex(x=>x[0]===after);T.LIST.splice(i<0?T.LIST.length:i+1,0,[id,name,key,ic]);T.slots=null};
 // Werkzeugleiste wie GIMP 2.10: Werkzeuggruppen, Rechtsklick wählt ein anderes Werkzeug der Gruppe, „+“ fügt weitere hinzu
 T.GROUPS=[['move','align'],['rsel','esel'],['lasso','scissors','fgsel'],['wand','bycolor'],['crop'],['unified','rotate','scale','shear','flip','perspective','tf3d','handle','transform'],['warp','cage'],['fill','gradient'],['brush','pencil','airbrush','ink'],['eraser'],['clone','heal'],['smudge','blurb','sharpb','dodge','burn'],['path'],['text'],['picker','measure'],['zoom']];
 const TBK='bb.toolbar2',tbGet=()=>{try{const v=JSON.parse(localStorage.getItem(TBK));if(Array.isArray(v)&&v.length)return v}catch(e){}return null},
  tbSave=()=>{try{localStorage.setItem(TBK,JSON.stringify(T.slots))}catch(e){}},
  has=id=>T.LIST.some(x=>x[0]===id);
 T.slotsInit=()=>{const def=T.GROUPS.map(g=>({t:g.slice(),c:g[0]}));let v=tbGet()||def;
  // nur bekannte Werkzeuge, jedes höchstens einmal
  const seen=new Set();v=v.map(s=>{const t=(s.t||[]).filter(id=>has(id)&&!seen.has(id)&&seen.add(id));return t.length?{t,c:t.includes(s.c)?s.c:t[0]}:null}).filter(Boolean);
  // neue Werkzeuge (nach einem Update) in die passende Gruppe einsortieren, entfernte bleiben weg
  let known=null;try{known=JSON.parse(localStorage.getItem(TBK+'.known'))}catch(e){}
  if(!Array.isArray(known))known=T.LIST.map(x=>x[0]).filter(id=>!['unified','perspective','shear','tf3d','handle','cage'].includes(id));
  if(tbGet()){const K=new Set(known);for(const g of T.GROUPS)for(const id of g){if(K.has(id)||seen.has(id)||!has(id))continue;const s=v.find(s=>s.t.some(x=>g.includes(x)));if(s){s.t.push(id);seen.add(id)}}}
  try{localStorage.setItem(TBK+'.known',JSON.stringify(T.LIST.map(x=>x[0])))}catch(e){}
  T.slots=v.length?v:def};
 T.slotOf=id=>T.slots?T.slots.find(s=>s.t.includes(id)):null;
 T.tbReset=()=>{try{localStorage.removeItem(TBK)}catch(e){}T.slotsInit();T.bar()};
 const tinfo=id=>{const x=T.LIST.find(x=>x[0]===id)||[id,id,'',''];if(typeof Keys!=='undefined'&&Keys.toolDef&&Keys.toolDef(id))return[x[0],x[1],Keys.toolKey(id),x[3]];return x};T.tinfo=tinfo;
 const ttl=id=>{const [,n,k]=tinfo(id);return esc(Kit.t(n))+(k?` (${esc(Kit.t(k))})`:'')};
 T.bar=()=>{if(!T.slots)T.slotsInit();const sl=T.slotOf(T.tool);if(sl&&sl.c!==T.tool){sl.c=T.tool;tbSave()}
  $('#tgrid').innerHTML=`<div class="tg">${T.slots.map((s,i)=>{const id=s.c,on=s.t.includes(T.tool);return`<button class="ib${on?' on':''}${s.t.length>1?' grp':''}" data-tool="${id}" data-slot="${i}" title="${ttl(id)}${s.t.length>1?' – '+esc(Kit.t('Rechtsklick: weitere Werkzeuge')):''}">${icon(tinfo(id)[3])}</button>`}).join('')}<button class="ib tadd" data-tadd title="${esc(Kit.t('Werkzeug hinzufügen'))}">+</button></div>`+
  `<div class="cols"><div class="sw"><button class="c2" data-col="2" style="background:${T.color2}" title="${esc(Kit.t('Hintergrundfarbe'))}"></button><button class="c1" data-col="1" style="background:${T.color}" title="${esc(Kit.t('Vordergrundfarbe'))}"></button><button class="swp" data-swap title="${esc(Kit.t('Farben tauschen (X)'))}">⇄</button><button class="rst" data-cdef title="${esc(Kit.t('Standardfarben (D)'))}"></button></div></div>`};
 T.set=t=>{if(T.tool!==t&&T.EXT[T.tool]&&T.EXT[T.tool].leave)T.EXT[T.tool].leave();if(T.tool==='crop'&&t!=='crop')crop=null;T.tool=t;if(t==='crop')crop=null;T.bar();T.opts();T.cursor();View.draw()};
 T.setColor=(c,which=1)=>{if(which===1)T.color=c;else T.color2=c;T.bar();T.opts()};
 T.name=id=>(T.LIST.find(x=>x[0]===id)||[])[1]||'';
 // Werkzeugeinstellungen (Profi: links unter den Werkzeugen, Einfach: Leiste über dem Bild)
 const sl=(k,key,lab,min,max,unit='')=>`<label class="o"><span>${esc(Kit.t(lab))}</span><input type="range" min="${min}" max="${max}" value="${T.o[k][key]}" data-o="${k}.${key}" data-u="${unit}"><b data-ov="${k}.${key}">${T.o[k][key]}${unit}</b></label>`;
 const colBtn=()=>`<label class="o"><span>${esc(Kit.t('Farbe'))}</span><input type="color" value="${T.color}" data-tcol></label>`;
 const hint=s=>`<p class="hint2">${esc(Kit.t(s))}</p>`;
 const segO=(k,key,opts)=>`<div class="seg">${opts.map(([v,n])=>`<button data-oset="${k}.${key}" data-v="${v}" class="${T.o[k][key]===v?'on':''}" title="${esc(Kit.t(n))}">${esc(Kit.t(n))}</button>`).join('')}</div>`;
 const chkO=(k,key,lab)=>`<label class="o ck"><input type="checkbox" data-ochk="${k}.${key}"${T.o[k][key]?' checked':''}><span>${esc(Kit.t(lab))}</span></label>`;
 const blendSel=t=>`<label class="o"><span>${esc(Kit.t('Modus'))}</span><select data-blend="${t}">${[['source-over','Normal'],['multiply','Multiplizieren'],['screen','Bildschirm'],['overlay','Überlagern'],['darken','Nur abdunkeln'],['lighten','Nur aufhellen'],['color-dodge','Abwedeln'],['color-burn','Nachbelichten'],['hard-light','Hartes Licht'],['soft-light','Weiches Licht'],['difference','Differenz'],['hue','Farbton'],['saturation','Sättigung'],['color','Farbe'],['luminosity','Helligkeit']].map(([k,n])=>`<option value="${k}"${(T.o[t].blend||'source-over')===k?' selected':''}>${esc(Kit.t(n))}</option>`).join('')}</select></label>`;
 const selModes=()=>`<div class="olab">${esc(Kit.t('Modus'))}</div>${segO('sel','mode',[['replace','Neu'],['add','Hinzu'],['sub','Weg'],['int','Schnitt']])}`;
 T.opts=()=>{const t=T.tool,pro=UI.mode==='pro';const o=pro?$('#topts'):$('#opts');const other=pro?$('#opts'):$('#topts');if(other)other.innerHTML='';if(!o)return;let h='';
  if(!pro&&t!=='crop'){o.innerHTML='';return}
  if(T.EXT[t]&&T.EXT[t].opts){o.innerHTML=(pro?`<h4>${esc(Kit.t(T.name(t)))}</h4>`:'')+T.EXT[t].opts();return}
  if(T.PAINT.includes(t))h=`${sl(t,'size','Größe',1,500,' px')}${t==='pencil'?`<label class="o"><span>${esc(Kit.t('Spitze'))}</span><select data-pshape style="grid-column:2/4"><option value="square"${(T.o.pencil.shape||'square')==='square'?' selected':''}>${esc(Kit.t('Eckig'))}</option><option value="round"${T.o.pencil.shape==='round'?' selected':''}>${esc(Kit.t('Rund'))}</option></select></label><label class="o ck"><input type="checkbox" data-pgrid${T.o.pencil.grid!==false?' checked':''}><span>${esc(Kit.t('Am Pixelraster ausrichten (Pixel-Art)'))}</span></label>`:sl(t,'hard','Härte',0,100,' %')}${sl(t,'op',WORK.includes(t)&&t!=='heal'?'Stärke':'Deckkraft',1,100,' %')}${['brush','pencil','airbrush'].includes(t)?colBtn():''}${['brush','pencil','airbrush'].includes(t)?blendSel(t):''}${t==='airbrush'?sl('airbrush','rate','Rate',5,100,' %'):''}${t==='clone'||t==='heal'?`<div class="olab">${esc(Kit.t('Ausrichtung'))}</div>`+segO(t,'align',[['none','Keine'],['aligned','Ausgerichtet'],['fixed','Fest']]):''}${t==='dodge'||t==='burn'?`<div class="olab">${esc(Kit.t('Bereich'))}</div>`+segO(t,'range',[['shadows','Schatten'],['mid','Mitteltöne'],['highlights','Lichter']]):''}
   ${['brush','pencil','airbrush','eraser'].includes(t)?`<div class="olab">${esc(Kit.t('Dynamik'))}</div>${sl('dyn','spacing','Abstand',2,300,' %')}${sl('dyn','scatter','Streuung',0,300,' %')}${sl('dyn','jitter','Größe zufällig',0,100,' %')}${chkO('dyn','rot','Spitze zufällig drehen')}${T.o[t].tip?`<p class="hint2">${esc(Kit.t('Eigene Pinselspitze aktiv'))} · <a href="#" data-notip>${esc(Kit.t('Rund verwenden'))}</a></p>`:''}`:''}
   <div class="olab">${esc(Kit.t('Symmetrie'))}</div>${segO('sym','mode',[['off','Aus'],['v','|'],['h','—'],['4','+']])}${chkO('sym','pressure','Stiftdruck steuert Größe')}
   ${hint({clone:'Strg+Klick legt die Quelle fest, dann malen.',heal:'Strg+Klick legt die Quelle fest. Heilen übernimmt die Struktur und passt die Farbe an.',smudge:'Ziehen verschmiert die Farben.',dodge:'Hellt beim Malen auf. Strg = Nachbelichten.',burn:'Dunkelt beim Malen ab. Strg = Abwedeln.',blurb:'Zeichnet beim Malen weich. Strg = Schärfen.',sharpb:'Schärft beim Malen. Strg = Weichzeichnen.',airbrush:'Farbe sprüht weiter, solange die Maustaste gedrückt ist. Strg+Klick nimmt eine Farbe auf.',eraser:'Radiert zu Transparenz. Alt gedrückt halten holt Radiertes zurück. Strg+Klick nimmt die Hintergrundfarbe auf. Umschalt+Klick radiert eine gerade Linie.'}[t]||'Strg+Klick nimmt eine Farbe auf. Umschalt+Klick zieht eine gerade Linie, Strg+Umschalt in 15°-Schritten. [ und ] ändern die Größe.')}${t==='eraser'&&Doc.layer()&&Doc.layer().noAlpha?hint('Diese Ebene hat keinen Alphakanal (wie ein geöffnetes JPG oder der Hintergrund). Der Radierer malt deshalb mit der Hintergrundfarbe. Für Transparenz: Rechtsklick auf die Ebene → „Alphakanal hinzufügen“.'):''}`;
  else if(t==='rsel'||t==='esel'||t==='lasso')h=selModes()+sl('sel','feather','Kanten ausblenden',0,100,' px')+(t==='rsel'?sl('sel','round','Abgerundete Ecken',0,300,' px'):'')+(t!=='lasso'?T.selRectOpts():'')+(t!=='lasso'?`<label class="o"><span>${esc(Kit.t('Fest: Seitenverhältnis'))}</span><select data-sratio style="grid-column:2/4">${RATIOS.filter(r=>r[0]!=='orig').map(([k,n])=>`<option value="${k}"${T.o.sel.ratio===k?' selected':''}>${esc(Kit.t(n))}</option>`).join('')}</select></label>`:'')+hint(t==='lasso'?'Klicken setzt Ecken, Ziehen zeichnet frei. Schließen: Startpunkt anklicken, Doppelklick oder Enter. Rücktaste nimmt den letzten Punkt weg, Esc bricht ab. Umschalt = hinzufügen, Strg = abziehen, beides = Schnittmenge.':'Umschalt vor dem Klick = hinzufügen, Strg = abziehen, beides = Schnittmenge. Beim Ziehen: Umschalt = Quadrat/Kreis, Strg = von der Mitte aus. Alt+Ziehen verschiebt den Rahmen, Strg+Alt+Ziehen den Inhalt.');
  else if(t==='wand')h=selModes()+`<label class="o"><span>${esc(Kit.t('Schwelle'))}</span><input type="range" min="0" max="255" value="${T.o.sel.tol}" data-o="sel.tol"><b data-ov="sel.tol" id="wandtol">${T.o.sel.tol}</b></label>`+sl('sel','feather','Kanten ausblenden',0,100,' px')+chkO('sel','all','Alle ähnlichen Farben (nicht nur zusammenhängend)')+hint('Klicken wählt ähnliche, zusammenhängende Farben. Nach dem Klicken ziehen: nach unten/rechts mehr, nach oben/links weniger. Umschalt = hinzufügen, Strg = abziehen.');
  else if(t==='shape')h=`<div class="olab">${esc(Kit.t('Form'))}</div>${segO('shape','kind',[['rect','Rechteck'],['ellipse','Ellipse'],['line','Linie'],['arrow','Pfeil']])}${colBtn()}${hint('Ziehen zum Zeichnen · Umschalt = gleichmäßig')}`;
  else if(t==='fill')h=`<div class="olab">${esc(Kit.t('Bereich'))}</div>${segO('fill','mode',[['similar','Ähnliche Farben'],['sel','Ganze Auswahl']])}${sl('fill','tol','Schwelle',0,255)}${chkO('fill','trans','Transparente Bereiche füllen')}${chkO('fill','merged','Alle Ebenen berücksichtigen')}${chkO('fill','diag','Diagonale Nachbarn')}<div class="olab">${esc(Kit.t('Füllen mit'))}</div>${segO('fill','src',[['color','Vordergrund'],['bg','Hintergrund'],['pat','Muster']])}${hint('Umschalt = zwischen ähnlichen Farben und ganzer Auswahl wechseln, Alt = Vorder-/Hintergrundfarbe tauschen, Strg = Farbe aufnehmen.')}${T.o.fill.src==='pat'?`<div class="pats">${Extra.patterns().map(p=>`<button data-pat="${p.id}" class="${T.o.fill.pat===p.id?'on':''}" title="${esc(p.name)}"><canvas width="40" height="40" data-patc="${p.id}"></canvas></button>`).join('')}</div><button class="btn sm" data-act="patsel">${esc(Kit.t('Muster aus Auswahl'))}</button>`:colBtn()}`;
  else if(t==='gradient')h=`<label class="o"><span>${esc(Kit.t('Vorlage'))}</span><select data-gpre>${Extra.GRADS.map(([k,n])=>`<option value="${k}"${T.o.grad.preset===k?' selected':''}>${esc(Kit.t(n))}</option>`).join('')}</select></label><label class="o"><span>${esc(Kit.t('Form'))}</span><select data-gkind>${[['linear','Linear'],['bilinear','Bi-Linear'],['radial','Radial'],['square','Quadratisch'],['conic-sym','Konisch (symmetrisch)'],['conic-asym','Konisch (asymmetrisch)'],['spiral-cw','Spirale (rechts)'],['spiral-ccw','Spirale (links)']].map(([k,n])=>`<option value="${k}"${(T.o.grad.kind==='reflect'?'bilinear':T.o.grad.kind==='conic'?'conic-asym':T.o.grad.kind)===k?' selected':''}>${esc(Kit.t(n))}</option>`).join('')}</select></label><label class="o"><span>${esc(Kit.t('Wiederholung'))}</span><select data-grep>${[['none','Keine'],['saw','Sägezahn'],['tri','Dreieck']].map(([k,n])=>`<option value="${k}"${T.o.grad.repeat===k?' selected':''}>${esc(Kit.t(n))}</option>`).join('')}</select></label>${chkO('grad','rev','Umkehren')}${sl('grad','offset','Versatz',0,100,' %')}${sl('grad','op','Deckkraft',1,100,' %')}${hint('Ziehe eine Linie von Vordergrund- zu Hintergrundfarbe. Strg = 15°-Schritte.')}`;
  else if(t==='text')h=colBtn()+hint('Ins Bild klicken setzt einen Text, ein Rechteck aufziehen legt ein Textfeld mit fester Breite an. Klick auf einen vorhandenen Text bearbeitet ihn, Ziehen verschiebt ihn.');
  else if(t==='picker')h=colBtn()+sl('picker','avg','Mittelwert über',1,31,' px')+chkO('picker','merged','Alle Ebenen')+`<div class="olab">${esc(Kit.t('Ziel'))}</div>`+segO('picker','target',[['fg','Vordergrund'],['bg','Hintergrund'],['info','Nur anzeigen']])+hint('Klick nimmt die Farbe auf, Strg+Klick setzt sie als Hintergrundfarbe. Mit gedrückter Maustaste über das Bild ziehen tastet die Farben ab. Umschalt+Klick zeigt die Farbwerte (RGB, HSV).');
  else if(t==='zoom')h=hint('Klick vergrößert, Strg+Klick (oder Alt) verkleinert. Rechteck aufziehen zoomt auf den Bereich.');
  else if(t==='crop')h=pro?`<label class="o"><span>${esc(Kit.t('Format'))}</span><select data-ratio>${RATIOS.map(([k,n])=>`<option value="${k}"${T.o.crop.ratio===k?' selected':''}>${esc(Kit.t(n))}</option>`).join('')}</select></label><label class="o ck"><input type="checkbox" data-ochk="crop.layer"${T.o.crop.layer?' checked':''}><span>${esc(Kit.t('Nur aktuelle Ebene'))}</span></label><p class="hint2" id="cropsz"></p><div class="btns"><button class="btn" data-crop="cancel">${esc(Kit.t('Abbrechen'))}</button><button class="btn primary" data-crop="apply">${esc(Kit.t('Anwenden'))}</button></div><label class="o"><span>${esc(Kit.t('Hilfslinien'))}</span><select data-cguide>${[['none','Keine'],['center','Mittellinien'],['thirds','Drittel-Regel'],['fifths','Fünftel-Regel'],['golden','Goldener Schnitt'],['diag','Diagonalen']].map(([k,n])=>`<option value="${k}"${T.o.crop.guides===k?' selected':''}>${esc(Kit.t(n))}</option>`).join('')}</select></label>${hint('Enter oder Klick ins Rechteck wendet an, Esc bricht ab. Umschalt = festes Seitenverhältnis, Strg = von der Mitte aus. Pfeiltasten verschieben (Umschalt = 25 px).')}`
   :`<span class="t">${esc(Kit.t('Zuschneiden'))}</span><span class="sep"></span><select data-ratio>${RATIOS.map(([k,n])=>`<option value="${k}"${T.o.crop.ratio===k?' selected':''}>${esc(Kit.t(n))}</option>`).join('')}</select><span class="t" id="cropsz"></span><span class="grow"></span><button class="btn" data-crop="cancel">${esc(Kit.t('Abbrechen'))}</button><button class="btn primary" data-crop="apply">${esc(Kit.t('Anwenden'))}</button>`;
  else if(t==='hand')h=hint('Ziehen verschiebt die Ansicht. Mausrad zoomt.');
  else if(t==='move')h=`<div class="olab">${esc(Kit.t('Verschieben'))}</div>`+segO('move','mode',[['layer','Ebene'],['sel','Auswahl']])+(T.o.move.mode==='layer'?segO('move','pick',[['pick','Ebene anklicken'],['active','Aktive Ebene verschieben']]):'')+hint(T.o.move.mode==='sel'?'Ziehen verschiebt den Auswahlrahmen. Pfeiltasten: 1 px, mit Umschalt 25 px.':'Klicke eine Ebene an und ziehe sie. Umschalt = aktive Ebene verschieben, egal wo du klickst. In eine Auswahl klicken löst den Teil heraus (Alt = Kopie). Ecken ziehen = Größe (Umschalt = frei), Punkt oben = drehen (Umschalt = 15°).');
  else h=T.EXT[t]&&T.EXT[t].hint?hint(T.EXT[t].hint):'';
  // Werkzeug-Einstellungen zurücksetzen (wie GIMPs Knopf unten in den Werkzeugoptionen)
  if(!T._def)T._def=JSON.parse(JSON.stringify(T.o));const okey=T.PAINT.includes(t)||T.o[t]?t:['rsel','esel','lasso','scissors','wand','bycolor'].includes(t)?'sel':null;
  if(okey&&T._def[okey])h+=`<div class="btns" style="margin-top:10px"><button class="btn sm" data-oreset="${okey}" title="${esc(Kit.t('Alle Einstellungen dieses Werkzeugs auf Standard'))}">↺ ${esc(Kit.t('Werkzeug zurücksetzen'))}</button></div>`;
  o.innerHTML=pro?`<h4>${esc(Kit.t(T.name(t)))}<kbd class="thk" data-thk="${t}" title="${esc(Kit.t('Tastenkürzel ändern'))}">${esc(T.tinfo(t)[2]||Kit.t('Taste …'))}</kbd></h4>`+h:h;cropInfo();o.querySelectorAll('[data-patc]').forEach(c=>{const p=Extra.pat(c.dataset.patc);if(p){const x=c.getContext('2d');x.fillStyle=x.createPattern(p,'repeat');x.fillRect(0,0,40,40)}})};
 const RATIOS=[['free','Frei'],['orig','Original'],['1','1:1'],['1.7778','16:9'],['0.5625','9:16'],['0.8','4:5'],['1.3333','4:3'],['0.75','3:4'],['3','3:1 (Banner)']];T.RATIOS=RATIOS;
 T.wire=()=>{
  const pop=(html,anchor)=>{T.popClose();const p=document.createElement('div');p.className='tpop';p.innerHTML=html;document.body.appendChild(p);const r=anchor.getBoundingClientRect();
   let x=r.right+4,y=r.top;const pr=p.getBoundingClientRect();if(x+pr.width>innerWidth-6)x=Math.max(6,r.left-pr.width-4);if(y+pr.height>innerHeight-6)y=Math.max(6,innerHeight-pr.height-6);p.style.left=x+'px';p.style.top=y+'px';
   p.onclick=e=>{const hk=e.target.closest('[data-thk]');if(hk){e.stopPropagation();const d=Keys.toolDef(hk.dataset.thk);T.popClose();if(d)Keys.editor(d);return}const g=e.target.closest('[data-pick]');if(g){const s=T.slots[+g.dataset.slot];s.c=g.dataset.pick;tbSave();T.popClose();return T.set(g.dataset.pick)}
    const a=e.target.closest('[data-addt]');if(a){const id=a.dataset.addt;for(const s of T.slots){const i=s.t.indexOf(id);if(i>=0){s.t.splice(i,1);if(s.c===id)s.c=s.t[0]}}T.slots=T.slots.filter(s=>s.t.length);T.slots.push({t:[id],c:id});tbSave();T.popClose();return T.set(id)}
    const r=e.target.closest('[data-tdel]');if(r){const i=+r.dataset.tdel;T.slots.splice(i,1);tbSave();T.popClose();if(!T.slotOf(T.tool))T.set(T.slots[0].c);else T.bar();return}
    if(e.target.closest('[data-treset]')){T.popClose();T.tbReset()}};
   T._pop=p};
  T.popClose=()=>{if(T._pop){T._pop.remove();T._pop=null}};
  document.addEventListener('pointerdown',e=>{if(T._pop&&!T._pop.contains(e.target)&&!e.target.closest('[data-tadd],[data-slot]'))T.popClose()},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&T._pop){T.popClose();e.stopPropagation()}},true);
  const item=(id,attrs,extra='')=>{const [,n,k,p]=tinfo(id);return`<button ${attrs}${T.tool===id?' class="on"':''}>${icon(p)}<span>${esc(Kit.t(n))}</span><kbd data-thk="${id}" title="${esc(Kit.t('Tastenkürzel ändern'))}">${esc(k||Kit.t('Taste …'))}</kbd>${extra}</button>`};
  $('#tgrid').oncontextmenu=e=>{const b=e.target.closest('[data-slot]');if(!b)return;e.preventDefault();const i=+b.dataset.slot,s=T.slots[i];
   pop(s.t.map(id=>item(id,`data-pick="${id}" data-slot="${i}"`)).join('')+`<hr><button data-tdel="${i}" class="muted2"><span>${esc(Kit.t('Aus der Leiste entfernen'))}</span></button>`,b)};
  $('#tgrid').onclick=e=>{const ad=e.target.closest('[data-tadd]');if(ad){if(T._pop)return T.popClose();const vis=new Set(T.slots.map(s=>s.c));const rest=T.LIST.map(x=>x[0]).filter(id=>!vis.has(id));
    return pop(`<div class="tph">${esc(Kit.t('Werkzeug zur Leiste hinzufügen'))}</div>`+(rest.length?rest.map(id=>item(id,`data-addt="${id}"`,T.slotOf(id)?`<small>${esc(Kit.t('in Gruppe'))}</small>`:'')).join(''):`<div class="tph">${esc(Kit.t('Alle Werkzeuge sind schon sichtbar.'))}</div>`)+`<hr><button data-treset><span>${esc(Kit.t('Standard-Werkzeuge wiederherstellen'))}</span></button>`,ad)}
   const b=e.target.closest('[data-tool]');if(b)return T.set(b.dataset.tool);
   const c=e.target.closest('[data-col]');if(c){const w=+c.dataset.col;pickColor(w===1?T.color:T.color2,v=>T.setColor(v,w),Kit.t(w===1?'Vordergrundfarbe ändern':'Hintergrundfarbe ändern'))}
   if(e.target.closest('[data-swap]'))T.swap();if(e.target.closest('[data-cdef]')){T.color='#000000';T.color2='#ffffff';T.bar();T.opts()}};
  $('#topts').addEventListener('click',e=>{const k=e.target.closest('[data-thk]');if(k){const d=Keys.toolDef(k.dataset.thk);if(d)Keys.editor(d)}});
  for(const o of[$('#opts'),$('#topts')]){
   // Regler wie in GIMP: Mausrad ändert den Wert, Klick auf die Zahl zum Eintippen
   o.addEventListener('wheel',e=>{const r=e.target.closest('input[type=range]');if(!r)return;e.preventDefault();const mn=+r.min||0,mx=+r.max||100,st=Math.max(+r.step||1,(mx-mn)>200?Math.round((mx-mn)/100):1);r.value=Math.max(mn,Math.min(mx,+r.value+(e.deltaY<0?st:-st)));r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}))},{passive:false});
   o.addEventListener('click',e=>{const rs=e.target.closest('[data-oreset]');if(rs){const k=rs.dataset.oreset;T.o[k]=JSON.parse(JSON.stringify(T._def[k]));T.ringUpdate&&T.ringUpdate();T.opts();View.draw();return}
    const b=e.target.closest('label.o > b');if(!b)return;if(b.querySelector('input')){e.preventDefault();return}const r=b.parentElement.querySelector('input[type=range]');if(!r)return;e.preventDefault();const u=b.textContent.replace(/^[-\d.,\s]+/,'');
    const inp=document.createElement('input');inp.type='number';inp.value=r.value;inp.min=r.min;inp.max=r.max;inp.step=r.step||1;inp.className='onum';b.textContent='';b.appendChild(inp);inp.focus();inp.select();
    const done=ok=>{if(ok&&inp.value!==''){r.value=Math.max(+r.min,Math.min(+r.max,+inp.value));r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}))}b.textContent=r.value+(r.dataset.u!=null?r.dataset.u:u)};
    inp.onkeydown=ev=>{ev.stopPropagation();if(ev.key==='Enter')inp.blur();if(ev.key==='Escape'){inp.onblur=null;done(false)}};inp.onblur=()=>done(true)});
   o.oninput=e=>{const t=e.target;if(t.dataset.o){const [k,key]=t.dataset.o.split('.');T.o[k][key]=+t.value;const s=o.querySelector(`[data-ov="${t.dataset.o}"]`);if(s)s.textContent=t.value+(t.dataset.u||'');View.draw()}
    if(t.dataset.ochk){const [k,key]=t.dataset.ochk.split('.');T.o[k][key]=t.checked}
    if(t.matches('[data-tcol]'))T.color=t.value};
   o.onchange=e=>{if(e.target.matches('[data-sratio]')){T.o.sel.ratio=e.target.value;T.save&&T.save()}if(e.target.matches('[data-pshape]')){T.o.pencil.shape=e.target.value;T.save&&T.save();T.ringUpdate&&T.ringUpdate()}if(e.target.matches('[data-pgrid]')){T.o.pencil.grid=e.target.checked;T.save&&T.save();T.ringUpdate&&T.ringUpdate()}if(e.target.matches('[data-gpre]'))T.o.grad.preset=e.target.value;if(e.target.matches('[data-gkind]'))T.o.grad.kind=e.target.value;if(e.target.matches('[data-grep]'))T.o.grad.repeat=e.target.value;if(e.target.matches('[data-blend]'))T.o[e.target.dataset.blend].blend=e.target.value;if(e.target.matches('[data-cguide]')){T.o.crop.guides=e.target.value;View.draw()}if(e.target.matches('[data-tcol]'))T.setColor(e.target.value);if(e.target.matches('[data-ratio]')){T.o.crop.ratio=e.target.value;cropRatio();View.draw()}};
   o.onclick=e=>{const pb=e.target.closest('[data-pat]');if(pb){T.o.fill.pat=pb.dataset.pat;T.opts();return}if(e.target.closest('[data-notip]')){e.preventDefault();for(const k of T.PAINT)delete T.o[k].tip;T.opts();return}const b=e.target.closest('[data-oset]');if(b){const [k,key]=b.dataset.oset.split('.');T.o[k][key]=b.dataset.v;T.opts()}const c=e.target.closest('[data-crop]');if(c)c.dataset.crop==='apply'?T.cropApply():T.cropCancel()}}};
 T.swap=()=>{[T.color,T.color2]=[T.color2,T.color];T.bar();T.opts()};
 const pickColor=(v,fn,title)=>ColorDlg.open(v,c=>fn(c),title);

 // ---- Überlagerung: Auswahlrahmen, Zuschnitt, Pinselspitze, Hilfslinien ----
 let hover=null,guides=[];
 const corners=L=>{if(L.type==='group'){const b=Doc.aabb(L);return[[b.x,b.y],[b.r,b.y],[b.r,b.b],[b.x,b.b]].map(([x,y])=>View.toScr(x,y))}const m=Doc.matrix(L);return[[0,0],[L.w,0],[L.w,L.h],[0,L.h]].map(([x,y])=>{const p=m.transformPoint(new DOMPoint(x,y));return View.toScr(p.x,p.y)})};
 const HANDLES=[['nw',0,0],['n',.5,0],['ne',1,0],['e',1,.5],['se',1,1],['s',.5,1],['sw',0,1],['w',0,.5]];
 const handlePts=L=>{if(L.type==='group')return[];const m=Doc.matrix(L);const pts=HANDLES.filter(h=>L.type!=='text'||h[0].length===2||(L.box&&(h[0]==='e'||h[0]==='w'))).map(([n,u,v])=>{const p=m.transformPoint(new DOMPoint(u*L.w,v*L.h));return[n,...View.toScr(p.x,p.y)]});
  // Drehpunkt über der Oberkante (in Bildschirmrichtung der Ebene)
  const a=m.transformPoint(new DOMPoint(L.w/2,0)),c=m.transformPoint(new DOMPoint(L.w/2,L.h/2));const [ax,ay]=View.toScr(a.x,a.y),[cx,cy]=View.toScr(c.x,c.y);const len=Math.hypot(ax-cx,ay-cy)||1;
  const sgn=L.fy?-1:1;pts.push(['rot',ax+(ax-cx)/len*26*sgn,ay+(ay-cy)/len*26*sgn,ax,ay]);return pts};
 T.overlay=c=>{const d=Doc.d;const L=Doc.layer();
  if(T.tool==='crop'&&crop){const [x0,y0]=View.toScr(crop.x,crop.y),[x1,y1]=View.toScr(crop.x+crop.w,crop.y+crop.h);
   c.save();c.fillStyle='#000a';c.beginPath();c.rect(0,0,View.w,View.h);c.rect(x0,y0,x1-x0,y1-y0);c.fill('evenodd');
   c.strokeStyle='#fff';c.lineWidth=1.5;c.strokeRect(x0,y0,x1-x0,y1-y0);c.strokeStyle='#fff6';c.lineWidth=1;c.beginPath();const gd=T.o.crop.guides;const fs=gd==='thirds'?[1/3,2/3]:gd==='fifths'?[.2,.4,.6,.8]:gd==='center'?[.5]:gd==='golden'?[.382,.618]:[];for(const f of fs){c.moveTo(x0+(x1-x0)*f,y0);c.lineTo(x0+(x1-x0)*f,y1);c.moveTo(x0,y0+(y1-y0)*f);c.lineTo(x1,y0+(y1-y0)*f)}if(gd==='diag'){const m=Math.min(x1-x0,y1-y0);c.moveTo(x0,y0);c.lineTo(x0+m,y0+m);c.moveTo(x1,y0);c.lineTo(x1-m,y0+m);c.moveTo(x0,y1);c.lineTo(x0+m,y1-m);c.moveTo(x1,y1);c.lineTo(x1-m,y1-m)}c.stroke();
   c.fillStyle='#fff';for(const [,u,v] of HANDLES){c.fillRect(x0+(x1-x0)*u-5,y0+(y1-y0)*v-5,10,10)}c.restore();return}
  if(View.grid){const g=View.gridSize,[ox,oy]=View.toScr(0,0),w=d.w*View.z,h=d.h*View.z;if(g*View.z>=4){c.save();c.strokeStyle='#8886';c.lineWidth=1;c.beginPath();for(let x=g;x<d.w;x+=g){const sx=Math.round(ox+x*View.z)+.5;c.moveTo(sx,oy);c.lineTo(sx,oy+h)}for(let y=g;y<d.h;y+=g){const sy=Math.round(oy+y*View.z)+.5;c.moveTo(ox,sy);c.lineTo(ox+w,sy)}c.stroke();c.restore()}}
  if(View.guidesOn){c.save();c.strokeStyle='#22d3ee';c.lineWidth=1;c.beginPath();for(const g of View.guides()){if(g.o==='v'){const sx=Math.round(View.toScr(g.p,0)[0])+.5;c.moveTo(sx,0);c.lineTo(sx,View.h)}else{const sy=Math.round(View.toScr(0,g.p)[1])+.5;c.moveTo(0,sy);c.lineTo(View.w,sy)}}c.stroke();c.restore()}
  Sel.overlay(c,View);
  for(const k in T.EXT)if(T.EXT[k].overlay)T.EXT[k].overlay(c,T.tool===k);
  T.lassoOverlay(c);
  if(drag&&drag.textbox){const [x0,y0]=View.toScr(Math.min(drag.x0,drag.x),Math.min(drag.y0,drag.y));const w=Math.abs(drag.x-drag.x0)*View.z,h=Math.abs(drag.y-drag.y0)*View.z;if(w>4){c.save();c.strokeStyle='#7c6cff';c.setLineDash([4,3]);c.strokeRect(x0,y0,w,Math.max(h,20));c.restore()}}
  if(drag&&drag.zoom){const [x0,y0]=View.toScr(Math.min(drag.x0,drag.x),Math.min(drag.y0,drag.y));const w=Math.abs(drag.x-drag.x0)*View.z,h=Math.abs(drag.y-drag.y0)*View.z;if(w>4&&h>4){c.save();c.strokeStyle='#fff';c.setLineDash([4,3]);c.strokeRect(x0,y0,w,h);c.restore()}}
  if(drag&&drag.wand&&drag.tol2!=null){const [x0,y0]=View.toScr(drag.x0,drag.y0);c.save();c.font='600 12px system-ui';c.fillStyle='#000a';c.fillRect(x0+10,y0-24,92,20);c.fillStyle='#fff';c.fillText(Kit.t('Schwelle')+': '+drag.tol2,x0+16,y0-10);c.restore()}
  if(drag&&drag.sel){c.save();c.lineWidth=1;c.setLineDash([5,4]);for(const [col,off] of[['#000',0],['#fff',4.5]]){c.strokeStyle=col;c.lineDashOffset=off;c.beginPath();
    if(drag.sel==='lasso')drag.pts.forEach(([x,y],i)=>{const [sx,sy]=View.toScr(x,y);i?c.lineTo(sx,sy):c.moveTo(sx,sy)});
    else{const [x0,y0]=View.toScr(Math.min(drag.x0,drag.x),Math.min(drag.y0,drag.y)),w=Math.abs(drag.x-drag.x0)*View.z,h=Math.abs(drag.y-drag.y0)*View.z;if(drag.sel==='esel')c.ellipse(x0+w/2,y0+h/2,w/2,h/2,0,0,7);else c.rect(x0,y0,w,h)}c.stroke()}c.restore()}
  if(drag&&drag.grad){const [ax,ay]=View.toScr(...drag.a),[bx,by]=View.toScr(...drag.b);c.save();c.lineWidth=2;c.strokeStyle='#000a';c.beginPath();c.moveTo(ax,ay);c.lineTo(bx,by);c.stroke();c.strokeStyle='#fff';c.lineWidth=1;c.stroke();c.fillStyle=T.color;c.beginPath();c.arc(ax,ay,5,0,7);c.fill();c.stroke();c.fillStyle=T.o.grad.fgt?'transparent':T.color2;c.beginPath();c.arc(bx,by,5,0,7);c.fill();c.stroke();c.restore()}
  if((T.tool==='clone'||T.tool==='heal')&&cloneSrc){let [sx,sy]=View.toScr(...cloneSrc);if(drag&&(drag.paint==='clone'||drag.paint==='heal')&&drag.lastDoc){const L=drag.L;const m=Doc.pixMatrix(L);const q=m.transformPoint(new DOMPoint(drag.last[0]-drag.off[0],drag.last[1]-drag.off[1]));[sx,sy]=View.toScr(q.x,q.y)}
   c.save();c.strokeStyle='#fff';c.lineWidth=1.5;c.beginPath();c.moveTo(sx-8,sy);c.lineTo(sx+8,sy);c.moveTo(sx,sy-8);c.lineTo(sx,sy+8);c.stroke();c.strokeStyle='#000';c.lineWidth=.8;c.stroke();c.restore()}
  if(guides.length){c.save();c.strokeStyle='#ff3fb4';c.lineWidth=1;c.setLineDash([4,3]);c.beginPath();for(const g of guides){if(g.x!=null){const [sx]=View.toScr(g.x,0);c.moveTo(sx,0);c.lineTo(sx,View.h)}else{const [,sy]=View.toScr(0,g.y);c.moveTo(0,sy);c.lineTo(View.w,sy)}}c.stroke();c.restore()}
  const showSel=L&&L.visible&&!L.locked&&!T.baseHidden(L)&&(T.tool==='move'||T.tool==='text'||T.tool==='shape')&&!drag?.paint;
  if(hover&&hover!==L&&T.tool==='move'&&!drag){const p=corners(hover);c.save();c.strokeStyle='#7c6cffaa';c.lineWidth=1;c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.stroke();c.restore()}
  if(showSel){const p=corners(L);const ac=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#7c6cff';
   c.save();c.strokeStyle=ac;c.lineWidth=1.5;c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.stroke();
   for(const h of handlePts(L)){if(h[0]==='rot'){c.beginPath();c.moveTo(h[3],h[4]);c.lineTo(h[1],h[2]);c.stroke();c.beginPath();c.arc(h[1],h[2],6,0,7);c.fillStyle=ac;c.fill();c.strokeStyle='#fff';c.lineWidth=2;c.stroke();c.strokeStyle=ac;c.lineWidth=1.5;continue}
    c.beginPath();c.arc(h[1],h[2],h[0].length===2?5.5:4.5,0,7);c.fillStyle='#fff';c.fill();c.stroke()}c.restore()}
  T.ringUpdate&&T.ringUpdate()};

 // ---- Zeiger ----
 let drag=null,mouse=null,space=false;

 const svgCur=(pen)=>{const x=`<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><g stroke-linecap='round'>`+
   [['#000',3],['#fff',1.4]].map(([c,w])=>`<path d='M9 2v4M9 12v4M2 9h4M12 9h4' stroke='${c}' stroke-width='${w}' fill='none'/>`+(pen?`<path d='M27 15 L19 23 L17.6 26.4 L21 25 L29 17 Z' stroke='${c}' stroke-width='${w}' fill='${c==='#fff'?'#fff':'none'}' stroke-linejoin='round'/>`:'')).join('')+`</g></svg>`;
   return `url("data:image/svg+xml,${encodeURIComponent(x)}") 9 9, crosshair`};
 T.CUR_PEN=svgCur(true);T.CUR_X=svgCur(false);T.PEN_TOOLS=['brush','pencil','airbrush','ink'];
 T.cursor=()=>{const s=$('#view');if(!s)return;s.style.cursor=space||T.tool==='hand'?(drag&&drag.pan?'grabbing':'grab'):T.PEN_TOOLS.includes(T.tool)?T.CUR_PEN:T.PAINT.includes(T.tool)?T.CUR_X:T.tool==='text'?'text':T.tool==='zoom'?'zoom-in':T.tool==='move'?'default':T.EXT[T.tool]&&T.EXT[T.tool].cursor||'crosshair'};
 const V_RULERS=()=>View.rulers;const sp=e=>{const r=$('#view').getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]};
 const handleAt=(L,sx,sy)=>{if(!L)return null;for(const h of handlePts(L))if(Math.hypot(h[1]-sx,h[2]-sy)<9)return h[0];return null};
 const CURS={n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize',rot:'grab'};
 T.down=e=>{if(!Doc.d||e.button===2)return;const s=sp(e),[x,y]=View.toDoc(...s);$('#view').setPointerCapture(e.pointerId);UI.closeMenus();
  if(e.button===1||space||T.tool==='hand'){drag={pan:true,s,ox:View.ox,oy:View.oy};T.cursor();return}
  if(UI.mode==='pro'&&View.rulers&&(s[0]<18||s[1]<18)){const g={o:s[1]<18?'h':'v',p:s[1]<18?y:x};View.guides().push(g);drag={guide:g,isNew:true};View.guidesOn=true;return}
  const t=UI.mode==='simple'&&!T.SIMPLE.includes(T.tool)?'move':T.tool;
  if(t==='move'&&UI.mode==='pro'&&View.guidesOn){const g=View.guides().find(g=>g.o==='v'?Math.abs(View.toScr(g.p,0)[0]-s[0])<4:Math.abs(View.toScr(0,g.p)[1]-s[1])<4);const L=Doc.layer();if(g&&!(L&&handleAt(L,...s))){drag={guide:g};return}}
  if(T.EXT[t]){const r=T.EXT[t].down(s,x,y,e);if(r!==false)drag={ext:t};return}
  if(t==='crop')return cropDown(s,x,y,e);
  // Pipette: in GIMP mit Strg in allen Malwerkzeugen (Radierer: Hintergrundfarbe). Alt geht weiter.
  // Pipette wie GIMP: Klick = Vordergrund, Strg+Klick = Hintergrund, Ziehen tastet das Bild ab
  if(t==='picker'){const w=(e.ctrlKey||e.metaKey)?2:undefined;sample(x,y,e,w);drag={pick:true,w,sh:e.shiftKey};return}
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&['brush','pencil','airbrush','eraser','ink','fill','shape','text','gradient'].includes(t))return sample(x,y,e,t==='eraser'?2:1);
  if(e.altKey&&!e.ctrlKey&&['brush','pencil','airbrush','shape','text','gradient'].includes(t))return sample(x,y,e);
  if(T.PAINT.includes(t))return paintDown(t,x,y,e);
  if(t==='zoom'){drag={zoom:true,x0:x,y0:y,x,y,s0:s,out:e.altKey||e.ctrlKey};return}
  // Auswahl: Umschalt = hinzufügen, Strg = abziehen, Umschalt+Strg = Schnittmenge (wie GIMP).
  // Alt+Ziehen verschiebt nur den Auswahlrahmen, Strg+Alt+Ziehen verschiebt den Inhalt.
  const selTool=['rsel','esel','lasso','wand','bycolor','scissors'].includes(t);
  if(selTool&&Sel.has()&&e.altKey&&(e.ctrlKey||e.shiftKey)&&selAt(x,y))return moveDown(s,x,y,e,null,true);
  if(selTool&&Sel.has()&&e.altKey&&!e.ctrlKey&&!e.shiftKey){drag={selmove:true,x0:x,y0:y,m0:Sel.mask};return}
  const smode=e.shiftKey&&(e.ctrlKey||e.metaKey)?'int':e.shiftKey?'add':(e.ctrlKey||e.metaKey)?'sub':T.o.sel.mode;
  if(t==='lasso')return lassoDown(x,y,e,smode);
  if((t==='rsel'||t==='esel')&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey){const h=selRectHit(s,x,y);if(h){Doc._label=T.name(t);Doc.begin();drag={selEdit:true,h,r0:{...T.selRect.r},x0:x,y0:y};return}}
  T.selRect=null;
  if(t==='rsel'||t==='esel'){drag={sel:t,x0:x,y0:y,x,y,pts:[[x,y]],mode:smode,s0:e.shiftKey,c0:e.ctrlKey||e.metaKey};return}
  if(t==='wand'){drag={wand:true,x0:x,y0:y,s0:s,tol:T.o.sel.tol,mode:smode};return}
  if(t==='gradient'){drag={grad:true,a:[x,y],b:[x,y]};return}
  if(t==='fill')return flood(x,y,e);
  if(t==='text'){const L=Doc.pick(x,y);if(L&&L.type==='text'){Doc.sel=L.id;UI.layers();UI.props();moveDown(s,x,y,e,L);return}
   drag={textbox:true,x0:x,y0:y,x,y};return}
  if(t==='shape'){const k=T.o.shape.kind;const line=k==='line'||k==='arrow';Doc._label=T.name('shape');Doc.addShape(k,{x,y,w:1,h:1},line?{strokeC:T.color}:{fill:T.color});drag={shape:Doc.layer(),x0:x,y0:y,line};UI.layers();return}
  if(t==='move'&&T.o.move.mode==='sel'){if(Sel.has()){drag={selmove:true,x0:x,y0:y,m0:Sel.mask}}return}
  moveDown(s,x,y,e)};
 // ---- Freie Auswahl wie GIMP: Klicken setzt Ecken, Ziehen zeichnet frei. Schließen: Startpunkt anklicken, Doppelklick oder Enter.
 // Rücktaste nimmt den letzten Punkt weg, Esc bricht ab. Strg beim Setzen = 15°-Schritte.
 let lasso=null;const feath=m=>T.o.sel.feather>0?Doc.blurCv(m,T.o.sel.feather):m;T.feath=m=>feath(m);
 function lassoDown(x,y,e,mode){if(!lasso){lasso={pts:[[x,y]],mode,last:Date.now()};drag={lassoDrag:true};View.draw();return}
  const p0=lasso.pts[0];const near=Math.hypot((x-p0[0])*View.z,(y-p0[1])*View.z)<9;const dbl=Date.now()-lasso.last<300;lasso.last=Date.now();
  if(near&&lasso.pts.length>2||dbl&&lasso.pts.length>2){lassoFinish();return}
  if(e.ctrlKey&&lasso.pts.length){const l=lasso.pts[lasso.pts.length-1];[x,y]=snap15(l,[x,y])}
  lasso.pts.push([x,y]);drag={lassoDrag:true};View.draw()}
 const snap15=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],an=Math.round(Math.atan2(dy,dx)/(Math.PI/12))*(Math.PI/12),r=Math.hypot(dx,dy);return[a[0]+r*Math.cos(an),a[1]+r*Math.sin(an)]};T.snap15=snap15;
 function lassoFinish(){const L=lasso;lasso=null;if(!L||L.pts.length<3){View.draw();return}Doc._label=T.name('lasso');Sel.combine(feath(Sel.shape('poly',{pts:L.pts})),L.mode);View.draw()}
 T.lassoKey=k=>{if(!lasso)return false;if(k==='Enter'){lassoFinish();return true}if(k==='Escape'){lasso=null;View.draw();return true}if(k==='Backspace'){lasso.pts.pop();if(!lasso.pts.length)lasso=null;View.draw();return true}return false};
 T.lassoOverlay=c=>{if(!lasso)return;c.save();c.lineWidth=1;c.setLineDash([5,4]);const pts=lasso.pts.map(([x,y])=>View.toScr(x,y));if(mouse&&!drag)pts.push(mouse);for(const [col,off] of[['#000',0],['#fff',4.5]]){c.strokeStyle=col;c.lineDashOffset=off;c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke()}c.setLineDash([]);const [sx,sy]=pts[0];c.fillStyle='#fff';c.strokeStyle='#000';c.beginPath();c.arc(sx,sy,5,0,7);c.fill();c.stroke();c.restore()};
 // Ausgewählten Teil eines Bildes anfassen: wird zur eigenen Ebene und lässt sich verschieben (Alt = Kopie, Original bleibt)
 const selAt=(x,y)=>{const m=Sel.mask;if(!m||x<0||y<0||x>=m.width||y>=m.height)return false;return m.getContext('2d').getImageData(Math.floor(x),Math.floor(y),1,1).data[3]>8};
 // Lücke füllen (Push-Pull): Farben vom Rand weich hineinziehen, nur wo vorher Bild war
 function fillHole(cv,before,loc){const W=cv.width,H=cv.height,c=cv.getContext('2d'),id=c.getImageData(0,0,W,H),d=id.data,lm=loc.getContext('2d').getImageData(0,0,W,H).data;
  const lv=[];let w=W,h=H,P=new Float32Array(W*H*4);for(let i=0;i<W*H;i++){const a=d[i*4+3]/255;P[i*4]=d[i*4]*a;P[i*4+1]=d[i*4+1]*a;P[i*4+2]=d[i*4+2]*a;P[i*4+3]=a}lv.push({w,h,P});
  while(w>1||h>1){const nw=Math.max(1,w+1>>1),nh=Math.max(1,h+1>>1),Q=new Float32Array(nw*nh*4),S=lv[lv.length-1].P;
   for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){let r=0,g=0,b=0,a=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const X=Math.min(w-1,x*2+dx),Y=Math.min(h-1,y*2+dy),k=(Y*w+X)*4;r+=S[k];g+=S[k+1];b+=S[k+2];a+=S[k+3]}
    const o=(y*nw+x)*4,s2=a>1?a:1;Q[o]=r/s2*Math.min(1,a);Q[o+1]=g/s2*Math.min(1,a);Q[o+2]=b/s2*Math.min(1,a);Q[o+3]=Math.min(1,a)}w=nw;h=nh;lv.push({w,h,P:Q})}
  for(let l=lv.length-2;l>=0;l--){const F=lv[l],C=lv[l+1];for(let y=0;y<F.h;y++)for(let x=0;x<F.w;x++){const k=(y*F.w+x)*4,a=F.P[k+3];if(a>=.999)continue;const ck=((y>>1)*C.w+(x>>1))*4,ca=C.P[ck+3]||1e-6,t=1-a;
   F.P[k]+=t*C.P[ck]/ca;F.P[k+1]+=t*C.P[ck+1]/ca;F.P[k+2]+=t*C.P[ck+2]/ca;F.P[k+3]=1}}
  const P0=lv[0].P;for(let i=0;i<W*H;i++){if(lm[i*4+3]<=0||before[i*4+3]===0)continue;const k=i*4,a=P0[k+3]||1;const m=lm[i*4+3]/255;
   // Ergebnis: gefüllte Farbe, Deckkraft wie vorher
   d[k]=P0[k]/a;d[k+1]=P0[k+1]/a;d[k+2]=P0[k+2]/a;d[k+3]=Math.round(d[k+3]+(before[k+3]-d[k+3])*Math.min(1,m*1.0))}
  c.putImageData(id,0,0)}
 T.liftSel=(copy,px,py)=>{let L0=Doc.layer();if(!L0||L0.type!=='pixel'){const P=px!=null?Doc.pick(px,py):null;L0=P&&P.type==='pixel'?P:[...Doc.d.layers].reverse().find(l=>l.type==='pixel'&&l.visible!==false&&(px==null||Doc.hit(l,px,py,true)))||[...Doc.d.layers].reverse().find(l=>l.type==='pixel'&&l.visible!==false);if(L0)Doc.sel=L0.id}if(!L0||L0.type!=='pixel'||!Sel.has())return null;const c=Sel.copy();if(!c)return null;
  Doc._label=copy?'Teil kopieren':'Teil herauslösen';Doc.begin();
  if(!copy){const loc=Sel.local(L0);const cv=Doc.clone(L0.cv),cx=cv.getContext('2d');const before=T.o.liftFill!==false?cx.getImageData(0,0,cv.width,cv.height).data:null;cx.globalCompositeOperation='destination-out';cx.drawImage(loc,0,0);cx.globalCompositeOperation='source-over';if(before)fillHole(cv,before,loc);L0.cv=cv;L0.rev=(L0.rev||0)+1}
  const L=Doc.addPixel(c.cv,Kit.t('Teil')+' – '+c.name,{x:c.x,y:c.y,w:c.cv.width,h:c.cv.height},true);Doc.clearSel();Doc.changed('layers');UI.layers();UI.props();return Doc.layer()};
 // Das Grundbild (unterste Ebene über das ganze Bild) wird nicht per Klick ins Bild ausgewählt, sonst hängt sofort der Rahmen am ganzen Bild.
 // Auswählen geht über die Ebenen-Liste, Drehen/Spiegeln über Bild-Menü und Werkzeuge.
 const baseHidden=L=>isBase(L)&&!Doc.baseExplicit;T.baseHidden=L=>baseHidden(L);const isBase=L=>{if(!L||L.type!=='pixel'||Doc.d.layers[0]!==L)return false;const d=Doc.d;return!L.rot&&L.x<=.5&&L.y<=.5&&L.x+L.w>=d.w-.5&&L.y+L.h>=d.h-.5};T.isBase=isBase;
 function moveDown(s,x,y,e,force,floatSel){
  if(!force&&Sel.has()&&selAt(x,y)&&(T.tool==='move'||floatSel)){const N=T.liftSel(e.altKey&&!floatSel||floatSel&&e.shiftKey,x,y);if(N){drag={mv:N,x0:x,y0:y,lx:N.x,ly:N.y,began:true,kids:null};View.draw();return}}
  let L=Doc.layer();const h=L&&!L.locked&&!baseHidden(L)?handleAt(L,...s):null;
  if(h&&L){Doc._label=h==='rot'?'Drehen':'Größe ändern';Doc.begin();const c=[L.x+L.w/2,L.y+L.h/2];drag={tr:h,L,c,w0:L.w,h0:L.h,size0:L.size,rot0:L.rot||0,a0:Math.atan2(y-c[1],x-c[0])};return}
  const inG=L=>{const b=Doc.aabb(L);return x>=b.x&&x<=b.r&&y>=b.y&&y<=b.b};
  const keepActive=(e.shiftKey!==(T.tool==='move'&&T.o.move.pick==='active'))&&L&&!L.locked&&!(isBase(L)&&!Doc.baseExplicit);
  if(!force&&!keepActive&&!(L&&!L.locked&&(L.type==='group'?inG(L):Doc.hit(L,x,y))&&!e.ctrlKey&&!baseHidden(L))){L=Doc.pick(x,y);if(L&&isBase(L)){Doc.baseExplicit=false;View.draw();return}Doc.baseExplicit=false;Doc.sel=L?L.id:null;UI.layers();UI.props()}else if(force)L=force;
  if(!L){View.draw();return}
  drag={mv:L,x0:x,y0:y,lx:L.x,ly:L.y,began:false,kids:L.type==='group'?Doc.desc(L.id).filter(k=>k.type!=='group').map(k=>[k,k.x,k.y]):null};View.draw()}
 T.move=e=>{const s=sp(e),[x,y]=View.toDoc(...s);mouse=s;
  if(!drag&&Sel.has()&&T.tool==='move'&&selAt(x,y)){$('#view').style.cursor='move';return}
  if(!drag){if(T.tool==='move'||UI.mode==='simple'&&!T.SIMPLE.includes(T.tool)){const L=Doc.layer();const h=L&&!L.locked&&!baseHidden(L)?handleAt(L,...s):null;$('#view').style.cursor=h?CURS[h]:space?'grab':'default';let nh=h?null:Doc.pick(x,y);if(nh&&isBase(nh))nh=null;if(nh!==hover){hover=nh;View.draw()}}
   else if(T.EXT[T.tool]&&T.EXT[T.tool].hover){T.EXT[T.tool].hover(s,x,y)}
   else if(T.tool==='crop'&&crop){const h=cropHandle(s);$('#view').style.cursor=h?CURS[h]||'move':'crosshair'}
   return}
  if(drag.ext){T.EXT[drag.ext].move(s,x,y,e);return}
  if(drag.pick){sample(x,y,{quiet:true},drag.w);return}
  if(drag.pan){View.ox=drag.ox+s[0]-drag.s[0];View.oy=drag.oy+s[1]-drag.s[1];View.draw();return}
  if(drag.guide){drag.guide.p=Math.round(drag.guide.o==='v'?x:y);drag.gs=s;View.draw();return}
  if(drag.paint)return paintMove(x,y,e);
  if(drag.lassoDrag){if(lasso){const l=lasso.pts[lasso.pts.length-1];if(Math.hypot((x-l[0])*View.z,(y-l[1])*View.z)>2){lasso.pts.push([x,y]);drag.free=true}}View.draw();return}
  if(drag.selmove){const dx=Math.round(x-drag.x0),dy=Math.round(y-drag.y0);const m=Doc.mk(drag.m0.width,drag.m0.height);m.getContext('2d').drawImage(drag.m0,dx,dy);Sel.mask=m;Sel.changed();return}
  if(drag.wand){const ds=(s[0]-drag.s0[0]+s[1]-drag.s0[1])/2;drag.tol2=Math.max(0,Math.min(255,Math.round(drag.tol+ds)));const hn=$('#wandtol');if(hn)hn.textContent=drag.tol2;View.draw();return}
  if(drag.zoom){drag.x=x;drag.y=y;View.draw();return}
  if(drag.textbox){drag.x=x;drag.y=y;View.draw();return}
  if(drag.sel){if(drag.ox0==null){drag.ox0=drag.x0;drag.oy0=drag.y0}let w=x-drag.ox0,h=y-drag.oy0;
   if(e.shiftKey!==drag.s0){const m=Math.max(Math.abs(w),Math.abs(h));w=Math.sign(w||1)*m;h=Math.sign(h||1)*m}
   else if(T.o.sel.ratio&&T.o.sel.ratio!=='free'){const r=+T.o.sel.ratio;h=Math.sign(h||1)*Math.abs(w)/r}
   if((e.ctrlKey||e.metaKey)!==drag.c0){drag.x0=drag.ox0-w;drag.y0=drag.oy0-h}else{drag.x0=drag.ox0;drag.y0=drag.oy0}
   drag.x=drag.ox0+w;drag.y=drag.oy0+h;View.draw();return}
  if(drag.grad){drag.b=[x,y];if(e.ctrlKey||e.shiftKey)drag.b=snap15(drag.a,[x,y]);View.draw();return}
  if(drag.crop)return cropMove(x,y,e);
  if(drag.selEdit){const R=T.selRect,r0=drag.r0,h=drag.h;let dx=x-drag.x0,dy=y-drag.y0;let {x:rx,y:ry,w:rw,h:rh}=r0;
   if(h==='in'){rx+=dx;ry+=dy}else{if(h.includes('w')){rx=Math.min(r0.x+r0.w-1,r0.x+dx);rw=r0.x+r0.w-rx}if(h.includes('e'))rw=Math.max(1,r0.w+dx);if(h.includes('n')){ry=Math.min(r0.y+r0.h-1,r0.y+dy);rh=r0.y+r0.h-ry}if(h.includes('s'))rh=Math.max(1,r0.h+dy)}
   R.r={x:rx,y:ry,w:rw,h:rh};reSel();return}
  if(drag.shape){const L=drag.shape;let dx=x-drag.x0,dy=y-drag.y0;if(e.shiftKey){if(drag.line){const a=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*(Math.PI/4),r=Math.hypot(dx,dy);dx=r*Math.cos(a);dy=r*Math.sin(a)}else{const m=Math.max(Math.abs(dx),Math.abs(dy));dx=Math.sign(dx||1)*m;dy=Math.sign(dy||1)*m}}
   L.x=Math.min(drag.x0,drag.x0+dx);L.y=Math.min(drag.y0,drag.y0+dy);L.w=Math.max(1,Math.abs(dx));L.h=Math.max(1,Math.abs(dy));if(drag.line){L.fx=dx<0;L.fy=dy<0}Doc.need=true;View.draw();return}
  if(drag.mv){const L=drag.mv;if(!drag.began){if(Math.hypot(x-drag.x0,y-drag.y0)*View.z<3)return;Doc._label='Verschieben';Doc.begin();drag.began=true}
   if(drag.kids){for(const [k,kx,ky] of drag.kids){k.x=kx+x-drag.x0;k.y=ky+y-drag.y0}}else{L.x=drag.lx+x-drag.x0;L.y=drag.ly+y-drag.y0;if(!e.altKey)snap(L)}Doc.need=true;View.draw();UI.propsLive();return}
  if(drag.tr)return transform(x,y,e)};
 T.up=e=>{if(!drag)return;const d=drag;drag=null;guides=[];
  // Textwerkzeug wie GIMP: einfacher Klick auf einen Text öffnet ihn zum Bearbeiten
  if(T.tool==='text'&&d.mv&&!d.began){const L=Doc.layer();if(L&&L.type==='text')setTimeout(()=>UI.focusText(true),0)}
  if(d.ext){T.EXT[d.ext].up&&T.EXT[d.ext].up(e);T.cursor();View.draw();return}
  if(d.guide){if(d.gs?(d.guide.o==='v'?d.gs[0]<18:d.gs[1]<18):d.isNew){const G=View.guides();G.splice(G.indexOf(d.guide),1)}Doc.mark(true)}
  if(d.paint){if(d.pp){cancelAnimationFrame(d.pp);d.pp=0}paintPreview(d);paintUp(d)}
  if(d.grad&&Math.hypot(d.b[0]-d.a[0],d.b[1]-d.a[1])*View.z>3)gradApply(d);
  if(d.lassoDrag){if(lasso&&d.free){const p0=lasso.pts[0],l=lasso.pts[lasso.pts.length-1];if(Math.hypot((l[0]-p0[0])*View.z,(l[1]-p0[1])*View.z)<12&&lasso.pts.length>3)lassoFinish()}}
  if(d.selmove&&Sel.mask!==d.m0){const m=Sel.mask;Sel.mask=d.m0;Doc._label='Auswahl verschieben';Doc.begin();Sel.mask=m;Sel.changed()}
  if(d.wand){Doc._label='Zauberstab';const tl=d.tol2??d.tol;Sel.wand(d.x0,d.y0,tl,d.mode,T.o.sel.all);if(d.tol2!=null){T.o.sel.tol=tl;T.opts()}if(T.o.sel.feather>0)Sel.feather(T.o.sel.feather)}
  // Text wie GIMP: Klick = Text, der mitwächst; Ziehen = fester Textrahmen mit Umbruch
  if(d.textbox){const w=Math.abs(d.x-d.x0);Doc._label='Text';if(w*View.z>12){Doc.addText({text:Kit.t('Dein Text'),cx:(d.x+d.x0)/2,cy:Math.min(d.y,d.y0)+20});const L=Doc.layer();L.box=true;L.boxW=w;L.w=0;Doc.measure(L,false);L.x=Math.min(d.x,d.x0);L.y=Math.min(d.y,d.y0);Doc.changed('layers')}else Doc.addText({text:Kit.t('Dein Text'),cx:d.x0,cy:d.y0});UI.layers();UI.props();setTimeout(()=>UI.focusText(true),30);T.set('move')}
  if(d.zoom){const w=Math.abs(d.x-d.x0)*View.z,h=Math.abs(d.y-d.y0)*View.z;if(w>8&&h>8&&!d.out){const z=Math.min(View.w/(Math.abs(d.x-d.x0)),View.h/(Math.abs(d.y-d.y0)));View.z=Math.min(32,z);const cx=(d.x+d.x0)/2,cy=(d.y+d.y0)/2;View.ox=View.w/2-cx*View.z;View.oy=View.h/2-cy*View.z;View.draw();UI.zoomInfo&&UI.zoomInfo()}else View.zoomAt(View.z*(d.out?1/1.5:1.5),...d.s0)}
  if(d.sel){const r={x:Math.min(d.x0,d.x),y:Math.min(d.y0,d.y),w:Math.abs(d.x-d.x0),h:Math.abs(d.y-d.y0)};
   if(r.w*View.z<3&&r.h*View.z<3){if(d.mode==='replace')Sel.none()}
   else if(d.mode==='sub'&&!Sel.mask)Kit.toast(Kit.t('Von einer leeren Auswahl kann nichts abgezogen werden.'));
   else{Doc._label=T.name(d.sel);const base=Sel.mask;Sel.combine(feath(Sel.shape(d.sel==='rsel'?'rect':'ellipse',{...r,round:d.sel==='rsel'?T.o.sel.round:0})),d.mode);T.selRect=Sel.mask?{kind:d.sel,r,mode:d.mode,base,mask:Sel.mask}:null;T.opts()}}
  if(d.shape){const L=d.shape;if(L.w<4&&L.h<4){const s=Math.min(Doc.d.w,Doc.d.h)/4;L.w=s;L.h=d.line?0.0001+s/3:s;L.x=d.x0-L.w/2;L.y=d.y0-L.h/2;if(d.line){L.h=1;L.y=d.y0}}Doc.changed('layers');UI.props();T.set('move')}
  if(d.mv&&d.began||d.tr){Doc.changed('canvas');UI.props()}
  if(d.crop){if(d.h==='in'&&!d.moved){T.cropApply();return}cropInfo()}
  T.cursor();View.draw()};
 // Einrasten an Bildmitte und Bildrändern
 const snap=L=>{guides=[];const d=Doc.d,b=Doc.aabb(L),tol=7/View.z;if(!View.snapOn)return;
  const tx=[0,d.w/2,d.w],ty=[0,d.h/2,d.h];if(View.guidesOn)for(const g of View.guides())(g.o==='v'?tx:ty).push(g.p);
  if(View.grid){const G=View.gridSize;const nx=Math.round(b.x/G)*G,ny=Math.round(b.y/G)*G,rx=Math.round(b.r/G)*G,by=Math.round(b.b/G)*G;tx.push(nx,rx);ty.push(ny,by)}
  const xs=[],ys=[];for(const t of tx)xs.push([b.x,t],[(b.x+b.r)/2,t],[b.r,t]);for(const t of ty)ys.push([b.y,t],[(b.y+b.b)/2,t],[b.b,t]);
  let bx=null,by=null;for(const [v,t] of xs)if(Math.abs(v-t)<tol&&(!bx||Math.abs(v-t)<Math.abs(bx[0]-bx[1])))bx=[v,t];for(const [v,t] of ys)if(Math.abs(v-t)<tol&&(!by||Math.abs(v-t)<Math.abs(by[0]-by[1])))by=[v,t];
  if(bx){L.x+=bx[1]-bx[0];guides.push({x:bx[1]})}if(by){L.y+=by[1]-by[0];guides.push({y:by[1]})}};
 // Größe ändern und drehen in der Richtung der Ebene
 function transform(x,y,e){const d=drag,L=d.L;
  if(d.tr==='rot'){let a=(d.rot0+(Math.atan2(y-d.c[1],x-d.c[0])-d.a0)*180/Math.PI);a=((a+540)%360)-180;if(e.shiftKey||e.ctrlKey)a=Math.round(a/15)*15;else for(const s of[-180,-90,0,90,180])if(Math.abs(a-s)<3)a=s;L.rot=a;Doc.need=true;View.draw();UI.propsLive();return}
  const th=(d.rot0)*Math.PI/180,co=Math.cos(th),si=Math.sin(th);const px=x-d.c[0],py=y-d.c[1];let ux=px*co+py*si,uy=-px*si+py*co;if(L.fx)ux=-ux;if(L.fy)uy=-uy;
  const H=HANDLES.find(h=>h[0]===d.tr);const sx=Math.round(H[1]*2-1),sy=Math.round(H[2]*2-1);
  const ax=-sx*d.w0/2,ay=-sy*d.h0/2;let nw=sx?Math.max(1,(ux-ax)*sx):d.w0,nh=sy?Math.max(1,(uy-ay)*sy):d.h0;
  const keep=(L.type==='text'&&!(L.box&&!sy))||(sx&&sy&&!e.shiftKey);if(keep&&sx&&sy){const k=Math.max(nw/d.w0,nh/d.h0);nw=d.w0*k;nh=d.h0*k}
  if(L.type==='text'&&L.box&&sx&&!sy){L.boxW=Math.max(20,nw);D2(L);nw=L.w;nh=L.h}
  else if(L.type==='text'){L.size=Math.max(4,d.size0*nw/d.w0);if(L.stroke)L.stroke.w=Math.max(0,L.stroke.w);D2(L);nw=L.w;nh=L.h}
  let cx=sx?ax+sx*nw/2:0,cy=sy?ay+sy*nh/2:0;if(L.fx)cx=-cx;if(L.fy)cy=-cy;
  const gx=d.c[0]+cx*co-cy*si,gy=d.c[1]+cx*si+cy*co;L.w=nw;L.h=nh;L.x=gx-nw/2;L.y=gy-nh/2;Doc.need=true;View.draw();UI.propsLive()}
 const D2=L=>{L.w=0;Doc.measure(L,false)};

 // ---- Malen: Pinsel, Stift, Airbrush, Radierer, Klonen, Heilen, Verwischen, Abwedeln/Nachbelichten, Weichzeichnen/Schärfen ----
 // Ziel ist die Ebene oder (wenn gewählt) ihre Maske
 let stamp=null,cloneSrc=null,cloneOff=null;const lastPt={};
 T.PAINT=['brush','pencil','airbrush','eraser','clone','heal','smudge','dodge','burn','blurb','sharpb'];
 const WORK=['smudge','dodge','burn','blurb','sharpb','heal'];
 const gray=hex=>{const n=parseInt(hex.slice(1),16),v=Math.round(.299*(n>>16&255)+.587*(n>>8&255)+.114*(n&255)).toString(16).padStart(2,'0');return'#'+v+v+v};
 function target(t){let L=Doc.layer();
  if(!L){if(t!=='brush'&&t!=='pencil'&&t!=='airbrush')return null;Doc.addEmpty();UI.layers();return Doc.layer()}
  if(L.type!=='pixel'){if(['brush','pencil','airbrush'].includes(t)){Doc.addEmpty();UI.layers();return Doc.layer()}Doc.begin();const n=Doc.rasterize(L);Kit.toast(Kit.t('Die Ebene wurde in Pixel umgewandelt.'));UI.layers();return n}
  return L}
 const mkStamp=(r,hard,col,pencil,tip)=>{const tc=tip&&Extra.tip(tip);if(tc&&!pencil){const k=r*2/Math.max(tc.width,tc.height);const st=Doc.mk(Math.max(1,tc.width*k)+2,Math.max(1,tc.height*k)+2),c=st.getContext('2d');c.drawImage(tc,1,1,st.width-2,st.height-2);c.globalCompositeOperation='source-in';c.fillStyle=col;c.fillRect(0,0,st.width,st.height);return st}
  if(pencil&&pencil.square){const n=Math.max(1,Math.round(r*2)),st=Doc.mk(n,n),c=st.getContext('2d');c.fillStyle=col;c.fillRect(0,0,n,n);st._px=true;return st}
  if(pencil&&pencil.grid){const n=Math.max(1,Math.round(r*2)),st=Doc.mk(n,n),c=st.getContext('2d'),R=n/2;c.fillStyle=col;for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(Math.hypot(x+.5-R,y+.5-R)<=R+.01)c.fillRect(x,y,1,1);st._px=true;return st}
  const st=Doc.mk(Math.ceil(r*2)+2,Math.ceil(r*2)+2),c=st.getContext('2d'),cx=st.width/2,cy=st.height/2;
  if(pencil){c.fillStyle=col;const R=Math.max(.5,r);for(let y=0;y<st.height;y++)for(let x=0;x<st.width;x++)if(Math.hypot(x+.5-cx,y+.5-cy)<=R)c.fillRect(x,y,1,1);return st}
  const g=c.createRadialGradient(cx,cy,r*Math.min(.99,hard/100),cx,cy,r);g.addColorStop(0,Doc.hexA(col,1));g.addColorStop(1,Doc.hexA(col,0));c.fillStyle=hard>=100?col:g;c.beginPath();c.arc(cx,cy,r,0,7);c.fill();return st};
 const symPts=(x,y)=>{const d=Doc.d,m=T.o.sym.mode,P=[[x,y]];if(m==='v'||m==='4')P.push([d.w-x,y]);if(m==='h'||m==='4')P.push([x,d.h-y]);if(m==='4')P.push([d.w-x,d.h-y]);return P};
 function paintDown(t,x,y,e){if((t==='clone'||t==='heal')&&(e.altKey||e.ctrlKey||e.metaKey)){cloneSrc=[x,y];cloneOff=null;Kit.toast(Kit.t('Quelle festgelegt. Jetzt malen.'));View.draw();return}
  if((t==='clone'||t==='heal')&&!cloneSrc)return Kit.toast(Kit.t('Halte Strg gedrückt und klicke zuerst auf die Stelle, die kopiert werden soll.'));
  // Strg kehrt Weichzeichnen/Schärfen und Abwedeln/Nachbelichten um (wie GIMP)
  if(e.ctrlKey||e.metaKey)t={blurb:'sharpb',sharpb:'blurb',dodge:'burn',burn:'dodge'}[t]||t;
  const L=target(t);if(!L)return Kit.toast(Kit.t('Wähle zuerst eine Ebene aus.'));if(!L.visible)return Kit.toast(Kit.t('Die Ebene ist ausgeblendet.'));
  const onMask=!!(L.mask&&L.editMask);let mode=t;
  Doc._label=T.name(t);Doc.begin();const o=T.o[t];const inv=Doc.pixMatrix(L).inverse();const sc=Math.hypot(inv.a,inv.b);
  const r=Math.max(.5,o.size/2*sc);let col=t==='eraser'?'#000000':T.color;if(onMask){col=gray(t==='eraser'?'#000000':T.color);if(t==='eraser')mode='brush'}
  // Ebene ohne Alphakanal (wie GIMP): der Radierer malt mit der Hintergrundfarbe
  else if(t==='eraser'&&L.noAlpha&&!e.altKey){col=T.color2;mode='brush'}
  const pmode=t==='pencil'?{square:(o.shape||'square')==='square',grid:o.grid!==false}:false;
  stamp=mkStamp(r,t==='pencil'?100:o.hard,WORK.includes(t)||t==='clone'?'#000000':col,pmode,o.tip);
  const orig=onMask?L.mask:L.cv,W=orig.width,H=orig.height;
  // Radierer wie GIMP: Alt = Radiertes zurückholen. Dafür merkt sich die Ebene, was vor dem Radieren da war.
  let ueBase=null;if(t==='eraser'&&!onMask){const b=L._erBase&&L._erBase.width===W&&L._erBase.height===H?L._erBase:null;
   if(e.altKey){if(!b){Doc.undo.pop();return Kit.toast(Kit.t('Hier wurde noch nichts radiert.'))}ueBase=b;mode='unerase'}
   else{const nb=Doc.clone(orig);if(b){const c=nb.getContext('2d');c.globalCompositeOperation='destination-over';c.drawImage(b,0,0)}L._erBase=nb}}
  drag={paint:t,mode,L,onMask,S:Doc.mk(W,H),inv,r,lasts:null,op:o.op/100,prev:Doc.mk(W,H),M:Sel.mask?Sel.local(L):null,orig,tmp:Doc.mk(stamp.width,stamp.height),pr:1,lock:!onMask&&L.alphaLock,ueBase,ue:ueBase?Doc.mk(W,H):null};
  if(t==='clone'||t==='heal'){const a=inv.transformPoint(new DOMPoint(x,y)),b=inv.transformPoint(new DOMPoint(...cloneSrc));const al=o.align||'aligned';
   // Ausrichtung wie GIMP: Keine = jeder Strich beginnt an der Quelle; Ausgerichtet = Abstand vom ersten Strich bleibt; Fest = immer genau die Quelle
   if(al==='aligned'){if(!cloneOff)cloneOff=[a.x-b.x,a.y-b.y];drag.off=cloneOff}else drag.off=[a.x-b.x,a.y-b.y];if(al==='fixed')drag.fixed=[b.x,b.y]}
  if(WORK.includes(t))drag.work=Doc.clone(orig);
  if(t==='airbrush'){drag.air=setInterval(()=>{if(drag&&drag.paint==='airbrush'&&drag.lastDoc){dabAll(drag,...drag.lastDoc);paintPreview(drag)}},40)}
  if(onMask)L._mlive=true;
  const lp=lastPt[t];if(e.shiftKey&&lp){if(e.ctrlKey||e.metaKey)[x,y]=snap15(lp,[x,y]);paintMove(...lp,e)}paintMove(x,y,e)}
 const regionOf=(cv,x0,y0,w,h,t)=>{const c=t.getContext('2d');c.globalCompositeOperation='copy';c.drawImage(cv,x0,y0,w,h,0,0,w,h);c.globalCompositeOperation='source-over';return c};
 // Tonbereich (Schatten / Mitteltöne / Lichter) wie GIMP: Wirkung nach Helligkeit gewichten
 function rangeMix(d,tc,x0,y0,sw,sh,w,h){const rg=(T.o[d.paint]||{}).range||'mid';const o2=Doc.mk(w,h);const oc=o2.getContext('2d');oc.drawImage(d.work,x0,y0,sw,sh,0,0,w,h);const od=oc.getImageData(0,0,w,h).data,id=tc.getImageData(0,0,w,h),p=id.data;
  for(let i=0;i<p.length;i+=4){const L=(od[i]*.299+od[i+1]*.587+od[i+2]*.114)/255;const k=rg==='shadows'?(1-L)*(1-L):rg==='highlights'?L*L:4*L*(1-L);p[i]=od[i]+(p[i]-od[i])*k;p[i+1]=od[i+1]+(p[i+1]-od[i+1])*k;p[i+2]=od[i+2]+(p[i+2]-od[i+2])*k;p[i+3]=od[i+3]}tc.putImageData(id,0,0)}
 function dabAt(d,px,py){if(stamp._px){const c=d.S.getContext('2d'),n=stamp.width;c.imageSmoothingEnabled=false;c.drawImage(stamp,Math.round(px-n/2),Math.round(py-n/2));return}
  const k=d.pr,w=stamp.width,h=stamp.height,sw=w*k,sh=h*k,x0=px-sw/2,y0=py-sh/2;const c=d.S.getContext('2d');
  if(d.paint==='clone'){const tc=d.fixed?regionOf(d.orig,d.fixed[0]-sw/2,d.fixed[1]-sh/2,sw,sh,d.tmp):regionOf(d.orig,x0-d.off[0],y0-d.off[1],sw,sh,d.tmp);tc.globalCompositeOperation='destination-in';tc.drawImage(stamp,0,0,w,h);c.drawImage(d.tmp,0,0,w,h,x0,y0,sw,sh);return}
  if(WORK.includes(d.paint)){const wc=d.work.getContext('2d');const tc=d.tmp.getContext('2d');
   if(d.paint==='smudge'){if(!d.sp){d.sp=[px,py];return}regionOf(d.work,d.sp[0]-sw/2,d.sp[1]-sh/2,sw,sh,d.tmp);d.sp=[d.sp[0]+(px-d.sp[0])*.75,d.sp[1]+(py-d.sp[1])*.75]}
   else{regionOf(d.work,x0,y0,sw,sh,d.tmp);
    if(d.paint==='dodge'||d.paint==='burn'){tc.globalCompositeOperation=d.paint==='dodge'?'color-dodge':'color-burn';const v=Math.round(d.op*90);tc.fillStyle=d.paint==='dodge'?`rgb(${v},${v},${v})`:`rgb(${255-v},${255-v},${255-v})`;tc.fillRect(0,0,w,h);tc.globalCompositeOperation='destination-in';tc.drawImage(d.work,x0,y0,sw,sh,0,0,w,h);tc.globalCompositeOperation='source-over';rangeMix(d,tc,x0,y0,sw,sh,w,h)}
    else if(d.paint==='blurb'){const s2=Doc.mk(Math.max(1,w/4),Math.max(1,h/4));s2.getContext('2d').drawImage(d.tmp,0,0,s2.width,s2.height);tc.globalCompositeOperation='copy';tc.imageSmoothingQuality='high';tc.drawImage(s2,0,0,w,h)}
    else if(d.paint==='sharpb'){const id=tc.getImageData(0,0,w,h);Doc.sharpenData(id.data,w,h,.35);tc.putImageData(id,0,0)}
    else if(d.paint==='heal'){const src=Doc.mk(w,h);regionOf(d.orig,x0-d.off[0],y0-d.off[1],sw,sh,src);const bl=cv=>{const q=Doc.mk(Math.max(1,w/6|0),Math.max(1,h/6|0));q.getContext('2d').drawImage(cv,0,0,q.width,q.height);const o=Doc.mk(w,h),oc=o.getContext('2d');oc.imageSmoothingQuality='high';oc.drawImage(q,0,0,w,h);return oc.getImageData(0,0,w,h).data};
     const sb=bl(src),tb=bl(d.tmp),sd=src.getContext('2d').getImageData(0,0,w,h),q=sd.data;for(let i=0;i<q.length;i+=4){q[i]=q[i]-sb[i]+tb[i];q[i+1]=q[i+1]-sb[i+1]+tb[i+1];q[i+2]=q[i+2]-sb[i+2]+tb[i+2]}tc.putImageData(sd,0,0)}}
   tc.globalCompositeOperation='destination-in';tc.drawImage(stamp,0,0,w,h);tc.globalCompositeOperation='source-over';
   wc.globalAlpha=d.paint==='smudge'?d.op:d.paint==='heal'?1:Math.min(1,d.op*1.2);wc.drawImage(d.tmp,0,0,w,h,x0,y0,sw,sh);wc.globalAlpha=1;return}
  const D=T.o.dyn,dyn=['brush','pencil','airbrush','eraser'].includes(d.paint);let jx=0,jy=0,js=1,ang=0;if(dyn){if(D.scatter){const a=Math.random()*Math.PI*2,rr=Math.random()*D.scatter/100*d.r*2;jx=Math.cos(a)*rr;jy=Math.sin(a)*rr}if(D.jitter)js=1-Math.random()*D.jitter/100;if(D.rot)ang=Math.random()*Math.PI*2}
  if(d.paint==='airbrush')c.globalAlpha=.08*((T.o.airbrush.rate||50)/50);if(ang){c.save();c.translate(px+jx,py+jy);c.rotate(ang);c.drawImage(stamp,-sw*js/2,-sh*js/2,sw*js,sh*js);c.restore()}else c.drawImage(stamp,px+jx-sw*js/2,py+jy-sh*js/2,sw*js,sh*js);c.globalAlpha=1}
 function dabAll(d,x,y){const P=symPts(x,y);for(const [qx,qy] of P){const p=d.inv.transformPoint(new DOMPoint(qx,qy));dabAt(d,p.x,p.y)}}
 function paintMove(x,y,e){const d=drag;if(e&&e.pointerType==='pen'&&T.o.sym.pressure)d.pr=Math.max(.08,e.pressure||.5);
  const P=symPts(x,y).map(([qx,qy])=>{const p=d.inv.transformPoint(new DOMPoint(qx,qy));return[p.x,p.y]});const step=stamp._px?1:Math.max(.5,d.r*2*d.pr*(['brush','pencil','eraser','airbrush'].includes(d.paint)?T.o.dyn.spacing/100*(d.paint==='airbrush'?.8:1):.09));
  if(!d.lasts){P.forEach(p=>dabAt(d,...p))}else{const n=Math.hypot(P[0][0]-d.lasts[0][0],P[0][1]-d.lasts[0][1]);if(n<step)return;
   P.forEach((p,j)=>{const l=d.lasts[j];const dx=p[0]-l[0],dy=p[1]-l[1];for(let i=step;i<=n;i+=step)dabAt(d,l[0]+dx*i/n,l[1]+dy*i/n)})}
  d.lasts=P;d.last=P[0];d.lastDoc=[x,y];if(!d.pp)d.pp=requestAnimationFrame(()=>{d.pp=0;if(drag===d)paintPreview(d)})}
 function paintPreview(d){const pc=d.prev.getContext('2d');pc.globalCompositeOperation='copy';pc.globalAlpha=1;
  if(d.work){pc.drawImage(d.work,0,0)}
  else if(d.mode==='unerase'){pc.drawImage(d.orig,0,0);const tc=d.ue.getContext('2d');tc.globalCompositeOperation='copy';tc.drawImage(d.ueBase,0,0);tc.globalCompositeOperation='destination-in';tc.drawImage(d.S,0,0);tc.globalCompositeOperation='source-over';pc.globalCompositeOperation='destination-over';pc.globalAlpha=d.op;pc.drawImage(d.ue,0,0);pc.globalAlpha=1}
  else{pc.drawImage(d.orig,0,0);pc.globalCompositeOperation=d.mode==='eraser'?'destination-out':d.lock?'source-atop':((T.o[d.paint]||{}).blend||'source-over');pc.globalAlpha=d.op;pc.drawImage(d.S,0,0);pc.globalAlpha=1}
  if(d.M||d.lock&&d.work){const res=d.M?Sel.merge(d.L,d.orig,d.prev):d.prev;if(d.lock&&d.work){const c=res.getContext('2d');c.globalCompositeOperation='destination-in';c.drawImage(d.orig,0,0)}if(res!==d.prev){pc.globalCompositeOperation='copy';pc.drawImage(res,0,0)}}
  if(d.onMask)d.L._mprev=d.prev;else d.L._prev=d.prev;Doc.need=true;View.draw()}
 function paintUp(d){if(d.air)clearInterval(d.air);const L=d.L;if(d.onMask){if(L._mprev)L.mask=Doc.clone(L._mprev);delete L._mprev;delete L._mlive}else{if(L._prev)L.cv=L._prev;delete L._prev}if(d.lastDoc)lastPt[d.paint]=d.lastDoc;Doc.changed('canvas');UI.thumbs()}

 // ---- Farbverlauf ----
 // Farbverlauf wie GIMP: Formen Linear, Bi-Linear, Radial, Quadratisch, Konisch (sym./asym.), Spirale; Wiederholung, Umkehren, Versatz
 function gradApply(d){const L=target('gradient');if(!L)return;Doc._label='Farbverlauf';Doc.begin();const o=T.o.grad;const onMask=!!(L.mask&&L.editMask);const orig=onMask?L.mask:L.cv,W=orig.width,H=orig.height;
  const c1=onMask?gray(T.color):T.color,c2=onMask?gray(T.color2):T.color2;
  let stops=Extra.stops(o.preset,c1,c2);if(onMask)stops=stops.map(([p,col])=>[p,col.startsWith('#')?gray(col.slice(0,7)):col]);
  const lc=Doc.mk(256,1),lx=lc.getContext('2d'),lg=lx.createLinearGradient(0,0,256,0);for(const [p,col] of stops)lg.addColorStop(Math.max(0,Math.min(1,p)),col);lx.fillStyle=lg;lx.fillRect(0,0,256,1);const LUT=lx.getImageData(0,0,256,1).data;
  const [ax,ay]=d.a,[bx,by]=d.b,dx=bx-ax,dy=by-ay,len2=Math.max(1e-6,dx*dx+dy*dy),len=Math.sqrt(len2),off=(o.offset||0)/100,kind=o.kind==='reflect'?'bilinear':o.kind==='conic'?'conic-asym':o.kind;
  const M=Doc.pixMatrix(L);const g=Doc.mk(W,H),gc=g.getContext('2d'),id=gc.createImageData(W,H),q=id.data;const TAU=Math.PI*2;
  for(let py=0;py<H;py++)for(let px=0;px<W;px++){const X=M.a*(px+.5)+M.c*(py+.5)+M.e-ax,Y=M.b*(px+.5)+M.d*(py+.5)+M.f-ay;const dot=X*dx+Y*dy,cr=X*dy-Y*dx;let t;
   switch(kind){case'bilinear':t=Math.abs(dot/len2);break;case'radial':t=Math.hypot(X,Y)/len;break;case'square':t=Math.max(Math.abs(dot),Math.abs(cr))/len2;break;
    case'conic-sym':{const r=Math.hypot(X,Y)||1e-6;t=Math.acos(Math.max(-1,Math.min(1,dot/(r*len))))/Math.PI;break}
    case'conic-asym':t=((Math.atan2(-cr,dot)/TAU)+1)%1;break;
    case'spiral-cw':t=(((Math.atan2(-cr,dot)/TAU)+1)%1+Math.hypot(X,Y)/len);break;case'spiral-ccw':t=(((Math.atan2(cr,dot)/TAU)+1)%1+Math.hypot(X,Y)/len);break;
    default:t=dot/len2}
   if(off>0)t=t<off?0:(t-off)/(1-off||1e-6);
   if(o.repeat==='saw')t=t-Math.floor(t);else if(o.repeat==='tri'){t=Math.abs(t)%2;if(t>1)t=2-t}else if(kind.startsWith('spiral'))t=t-Math.floor(t);else t=Math.max(0,Math.min(1,t));
   if(o.rev)t=1-t;const k=Math.min(255,Math.max(0,Math.round(t*255)))*4,j=(py*W+px)*4;q[j]=LUT[k];q[j+1]=LUT[k+1];q[j+2]=LUT[k+2];q[j+3]=LUT[k+3]}
  gc.putImageData(id,0,0);
  if(Sel.mask){gc.globalCompositeOperation='destination-in';gc.drawImage(Sel.local(L),0,0)}
  const cv=Doc.clone(orig),cc=cv.getContext('2d');cc.globalAlpha=o.op/100;if(!onMask&&L.alphaLock)cc.globalCompositeOperation='source-atop';cc.drawImage(g,0,0);if(onMask)L.mask=cv;else L.cv=cv;Doc.changed('canvas');UI.thumbs()}

 // ---- Pipette und Füllen ----
 // Pipette wie GIMP: Mittelwert über einen Radius, aus allen Ebenen oder nur der aktiven, Ziel Vorder-/Hintergrund, Umschalt = Info
 function sample(x,y,e,which){const P=T.o.picker;let o=Doc.need?Doc.render():Doc.out;let px=x,py=y;
  if(!P.merged){const L=Doc.layer();if(L&&L.type==='pixel'){const q=Doc.pixMatrix(L).inverse().transformPoint(new DOMPoint(x,y));o=L.cv;px=q.x;py=q.y}}
  if(px<0||py<0||px>=o.width||py>=o.height)return;const r=Math.max(0,Math.floor((P.avg||1)/2));const x0=Math.max(0,Math.floor(px)-r),y0=Math.max(0,Math.floor(py)-r),x1=Math.min(o.width,Math.floor(px)+r+1),y1=Math.min(o.height,Math.floor(py)+r+1);
  const d=o.getContext('2d').getImageData(x0,y0,x1-x0,y1-y0).data;let R=0,G=0,B=0,A=0,n=0;for(let i=0;i<d.length;i+=4){R+=d[i];G+=d[i+1];B+=d[i+2];A+=d[i+3];n++}R=Math.round(R/n);G=Math.round(G/n);B=Math.round(B/n);A=Math.round(A/n);
  const hx='#'+[R,G,B].map(v=>v.toString(16).padStart(2,'0')).join('');const tgt=which||(T.tool==='picker'?{fg:1,bg:2,info:0}[P.target]:1);
  if(tgt)T.setColor(hx,tgt);const mx=Math.max(R,G,B),mn=Math.min(R,G,B),V=Math.round(mx/2.55),S=mx?Math.round((mx-mn)/mx*100):0;let H=0;if(mx!==mn){H=mx===R?(G-B)/(mx-mn):mx===G?2+(B-R)/(mx-mn):4+(R-G)/(mx-mn);H=Math.round((H*60+360)%360)}
  const info=`${hx}  ·  RGB ${R}, ${G}, ${B}  ·  HSV ${H}°, ${S} %, ${V} %  ·  Alpha ${Math.round(A/2.55)} %`;
  if(!(e&&e.quiet))Kit.toast((tgt?Kit.t(tgt===2?'Hintergrundfarbe:':'Farbe aufgenommen:')+' ':'')+(e&&e.shiftKey||!tgt?info:hx))}
 function flood(x,y,e){e=e||{};const F=T.o.fill;let mode=F.mode;if(e.shiftKey)mode=mode==='sel'?'similar':'sel';let col=F.src==='bg'?T.color2:T.color;if(e.altKey)col=col===T.color?T.color2:T.color;
  // Ganze Auswahl füllen; ohne Auswahl die ganze Ebene (wie GIMP)
  if(mode==='sel'){const had=Sel.has();if(!had)Sel.mask=(()=>{const m=Doc.mk(Doc.d.w,Doc.d.h),c=m.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,m.width,m.height);return m})();Doc._label='Füllen';if(F.src==='pat'){UI.act('fillpat')}else Sel.fill(col);if(!had){Doc.clearSel();View.draw()}return}
  const fillCol=col;
  Doc._label='Füllen';let L=Doc.layer();if(!L)return Kit.toast(Kit.t('Wähle zuerst eine Ebene aus.'));if(L.type!=='pixel'){Doc.begin();L=Doc.rasterize(L);UI.layers()}else Doc.begin();
  const onMask=!!(L.mask&&L.editMask);const orig=onMask?L.mask:L.cv;
  const p=Doc.pixMatrix(L).inverse().transformPoint(new DOMPoint(x,y));const W=orig.width,H=orig.height,sx=Math.floor(p.x),sy=Math.floor(p.y);if(sx<0||sy<0||sx>=W||sy>=H)return Kit.toast(Kit.t('Klicke innerhalb der Ebene.'));
  const cv=Doc.clone(orig),c=cv.getContext('2d'),id=c.getImageData(0,0,W,H),a=id.data;const i0=(sy*W+sx)*4,r0=a[i0],g0=a[i0+1],b0=a[i0+2],a0=a[i0+3];const tol=T.o.fill.tol;
  const hx=(onMask?gray(fillCol):fillCol).replace('#',''),n=parseInt(hx,16),R=n>>16&255,G=n>>8&255,B=n&255;
  // Vergleich auf dieser Ebene oder (Alle Ebenen) auf dem sichtbaren Bild
  let ref=a;if(F.merged&&!onMask){const o=Doc.need?Doc.render():Doc.out;const t2=Doc.mk(W,H),tc2=t2.getContext('2d');tc2.setTransform(Doc.pixMatrix(L).inverse());tc2.drawImage(o,0,0);ref=tc2.getImageData(0,0,W,H).data}
  const r0b=ref[i0],g0b=ref[i0+1],b0b=ref[i0+2],a0b=ref[i0+3];
  const ok=i=>{if(!F.trans&&ref[i+3]===0&&a0b!==0)return false;return Math.abs(ref[i]-r0b)<=tol&&Math.abs(ref[i+1]-g0b)<=tol&&Math.abs(ref[i+2]-b0b)<=tol&&Math.abs(ref[i+3]-a0b)<=tol};
  const seen=new Uint8Array(W*H);const st=[sx,sy];const lock=!onMask&&L.alphaLock;
  while(st.length){const yy=st.pop(),xx=st.pop();let l=xx;while(l>=0&&!seen[yy*W+l]&&ok((yy*W+l)*4))l--;l++;let r=xx;while(r<W&&!seen[yy*W+r]&&ok((yy*W+r)*4))r++;
   for(let i=l;i<r;i++){const k=yy*W+i;seen[k]=1;a[k*4]=R;a[k*4+1]=G;a[k*4+2]=B;if(!lock)a[k*4+3]=255;
    if(yy>0&&!seen[k-W]&&ok((k-W)*4))st.push(i,yy-1);if(yy<H-1&&!seen[k+W]&&ok((k+W)*4))st.push(i,yy+1)}
   if(F.diag){for(const xx2 of[l-1,r])if(xx2>=0&&xx2<W)for(const yy2 of[yy-1,yy+1])if(yy2>=0&&yy2<H&&!seen[yy2*W+xx2]&&ok((yy2*W+xx2)*4))st.push(xx2,yy2)}}
  c.putImageData(id,0,0);let fillRes=cv;
  if(T.o.fill.src==='pat'&&!onMask){const pc=Extra.pat(T.o.fill.pat||'checker');if(pc){const m=Doc.mk(W,H),mc=m.getContext('2d'),md=mc.createImageData(W,H);for(let k=0;k<W*H;k++)if(seen[k])md.data[k*4+3]=255;mc.putImageData(md,0,0);
   const pt=Doc.mk(W,H),ptc=pt.getContext('2d');ptc.setTransform(Doc.pixMatrix(L).inverse());ptc.fillStyle=ptc.createPattern(pc,'repeat');ptc.fillRect(-1e5,-1e5,2e5,2e5);ptc.setTransform(1,0,0,1,0,0);ptc.globalCompositeOperation='destination-in';ptc.drawImage(m,0,0);fillRes=Doc.clone(orig);fillRes.getContext('2d').drawImage(pt,0,0)}}
  const res=Sel.merge(L,orig,fillRes);if(onMask)L.mask=res;else L.cv=res;Doc.changed('canvas');UI.thumbs()}

 // ---- Zuschneiden ----
 let crop=null;
 function cropStart(){const d=Doc.d;if(!d)return;crop={x:0,y:0,w:d.w,h:d.h};cropRatio()}
 const ratioVal=()=>{const r=T.o.crop.ratio;return r==='free'?0:r==='orig'?Doc.d.w/Doc.d.h:+r};
 function cropRatio(){const k=ratioVal();if(!crop||!k)return cropInfo();const d=Doc.d;let w=crop.w,h=w/k;if(h>d.h){h=d.h;w=h*k}if(w>d.w){w=d.w;h=w/k}const cx=crop.x+crop.w/2,cy=crop.y+crop.h/2;crop={x:cx-w/2,y:cy-h/2,w,h};clampCrop();cropInfo()}
 T.cropRatio=r=>{T.o.crop.ratio=r;if(T.tool!=='crop')T.set('crop');else{cropRatio();View.draw()}T.opts()};
 function clampCrop(){const d=Doc.d;crop.w=Math.min(crop.w,d.w*4);crop.h=Math.min(crop.h,d.h*4)}
 function cropInfo(){const e=$('#cropsz');if(e&&crop)e.textContent=Math.round(crop.w)+' × '+Math.round(crop.h)+' px';UI.cropInfo&&UI.cropInfo(crop)}
 function cropHandle(s){const [x0,y0]=View.toScr(crop.x,crop.y),[x1,y1]=View.toScr(crop.x+crop.w,crop.y+crop.h);for(const [n,u,v] of HANDLES)if(Math.hypot(x0+(x1-x0)*u-s[0],y0+(y1-y0)*v-s[1])<10)return n;if(s[0]>x0&&s[0]<x1&&s[1]>y0&&s[1]<y1)return 'in';return null}
 function cropDown(s,x,y,e){const h=crop?cropHandle(s):null;const now=Date.now();if(h==='in'&&now-(T._cropClick||0)<350){T._cropClick=0;return T.cropApply()}T._cropClick=now;drag={crop:true,h:h||'new',x0:x,y0:y,c0:{...crop},moved:false};if(!h)crop={x,y,w:0,h:0}}
 function cropMove(x,y,e){const d=drag,c0=d.c0;if(Math.hypot(x-d.x0,y-d.y0)*View.z>2)d.moved=true;else if(!d.moved)return;let k=ratioVal();if(e.shiftKey&&!k)k=d.h==='new'?1:(c0.w/Math.max(1,c0.h));if(e.shiftKey&&ratioVal())k=0;
  if(d.h==='in'){crop.x=c0.x+x-d.x0;crop.y=c0.y+y-d.y0;View.draw();return cropInfo()}
  if(d.h==='new'){let w=x-d.x0,h=y-d.y0;if(k){h=Math.sign(h||1)*Math.abs(w)/k}if(e.ctrlKey||e.metaKey)crop={x:d.x0-Math.abs(w),y:d.y0-Math.abs(h),w:Math.abs(w)*2,h:Math.abs(h)*2};else crop={x:Math.min(d.x0,d.x0+w),y:Math.min(d.y0,d.y0+h),w:Math.abs(w),h:Math.abs(h)};View.draw();return cropInfo()}
  const H=HANDLES.find(h=>h[0]===d.h);let l=c0.x,t=c0.y,r=c0.x+c0.w,b=c0.y+c0.h;if(H[1]===0)l=Math.min(x,r-2);if(H[1]===1)r=Math.max(x,l+2);if(H[2]===0)t=Math.min(y,b-2);if(H[2]===1)b=Math.max(y,t+2);
  if(k){let w=r-l,h=b-t;if(H[1]===.5)w=h*k;else h=w/k;if(H[2]===0)t=b-h;else if(H[2]===1)b=t+h;else{const cy=(c0.y+c0.h/2);t=cy-h/2;b=cy+h/2}if(H[1]===0)l=r-w;else if(H[1]===1)r=l+w;else{const cx=c0.x+c0.w/2;l=cx-w/2;r=cx+w/2}}
  crop={x:l,y:t,w:r-l,h:b-t};View.draw();cropInfo()}
 // Rechteck-/Ellipsenauswahl bleibt nach dem Aufziehen änderbar (wie GIMP): Griffe an Kanten/Ecken, innen ziehen verschiebt
 const selRectOk=()=>{const R=T.selRect;return!!(R&&Sel.mask&&R.mask===Sel.mask&&(T.tool===R.kind))};
 function selRectHit(s,x,y){if(!selRectOk())return null;const r=T.selRect.r;const [ax,ay]=View.toScr(r.x,r.y),[bx,by]=View.toScr(r.x+r.w,r.y+r.h);const m=8,inX=s[0]>ax-m&&s[0]<bx+m,inY=s[1]>ay-m&&s[1]<by+m;if(!inX||!inY)return null;
  let h='';if(Math.abs(s[1]-ay)<m)h+='n';else if(Math.abs(s[1]-by)<m)h+='s';if(Math.abs(s[0]-ax)<m)h+='w';else if(Math.abs(s[0]-bx)<m)h+='e';if(h)return h;return s[0]>ax&&s[0]<bx&&s[1]>ay&&s[1]<by?'in':null}
 function reSel(){const R=T.selRect;const sh=feath(Sel.shape(R.kind==='rsel'?'rect':'ellipse',{...R.r,round:R.kind==='rsel'?T.o.sel.round:0}));let m;const b=R.base;
  if(R.mode==='replace'||!b)m=R.mode==='sub'?b:sh;else{m=Doc.mk(b.width,b.height);const c=m.getContext('2d');c.drawImage(b,0,0);c.globalCompositeOperation=R.mode==='add'?'source-over':R.mode==='sub'?'destination-out':'destination-in';c.drawImage(sh,0,0)}
  Sel.mask=m;R.mask=m;Sel.changed();const f=k=>{const el=document.querySelector(`[data-srn="${k}"]`);if(el&&document.activeElement!==el)el.value=Math.round(R.r[k])};['x','y','w','h'].forEach(f)}
 T.selRectOpts=()=>{if(!selRectOk())return'';const r=T.selRect.r;const f=(k,l)=>`<label class="o"><span>${esc(Kit.t(l))}</span><input type="number" data-srn="${k}" value="${Math.round(r[k])}"><b>px</b></label>`;
  return`<div class="olab">${esc(Kit.t('Auswahl anpassen'))}</div>`+f('x','Position X')+f('y','Position Y')+f('w','Breite')+f('h','Höhe')};
 document.addEventListener('change',e=>{const el=e.target;if(!el.dataset||!el.dataset.srn||!selRectOk())return;const v=+el.value;if(!isFinite(v))return;const R=T.selRect;Doc._label=T.name(R.kind);Doc.begin();R.r={...R.r,[el.dataset.srn]:(el.dataset.srn==='w'||el.dataset.srn==='h')?Math.max(1,v):v};reSel()});
 {const ov=T.overlay;T.overlay=c=>{ov(c);if(!selRectOk())return;const r=T.selRect.r;const [ax,ay]=View.toScr(r.x,r.y),[bx,by]=View.toScr(r.x+r.w,r.y+r.h);c.save();c.strokeStyle='rgba(34,211,238,.9)';c.lineWidth=1;c.setLineDash([4,3]);c.strokeRect(ax+.5,ay+.5,bx-ax,by-ay);c.setLineDash([]);c.fillStyle='#fff';
  for(const [px,py] of[[ax,ay],[bx,ay],[bx,by],[ax,by],[(ax+bx)/2,ay],[(ax+bx)/2,by],[ax,(ay+by)/2],[bx,(ay+by)/2]]){c.fillRect(px-3.5,py-3.5,7,7);c.strokeRect(px-3.5,py-3.5,7,7)}c.restore()}}
 T.cropApply=()=>{if(!crop||crop.w<2||crop.h<2)return T.cropCancel();
  // „Nur aktuelle Ebene“ (wie GIMP): nur die aktive Ebene wird beschnitten, das Bild bleibt gleich groß
  if(T.o.crop.layer){let L=Doc.layer();if(!L||L.type==='group')return Kit.toast(Kit.t('Wähle zuerst eine Ebene aus.'));Doc._label=Kit.t('Ebene zuschneiden');Doc.begin();if(L.type!=='pixel')L=Doc.rasterize(L);
   const rx=Math.round(crop.x),ry=Math.round(crop.y),rw=Math.round(crop.w),rh=Math.round(crop.h),m=Doc.matrix(L);const cut=src=>{const cv=Doc.mk(rw,rh),c=cv.getContext('2d');c.translate(-rx,-ry);c.transform(m.a,m.b,m.c,m.d,m.e,m.f);c.drawImage(src,0,0,L.w,L.h);return cv};
   if(L.mask){const mk=cut(L.mask);const f=Doc.mk(rw,rh),fc=f.getContext('2d');fc.fillStyle='#000';fc.fillRect(0,0,rw,rh);fc.drawImage(mk,0,0);L.mask=f}
   Object.assign(L,{cv:cut(L.cv),x:rx,y:ry,w:rw,h:rh,rot:0,fx:false,fy:false});L.rev=(L.rev||0)+1;crop=null;Doc.changed('layers');T.set('move');return}
  Doc._label='Zuschneiden';Doc.crop({x:Math.round(crop.x),y:Math.round(crop.y),w:Math.round(crop.w),h:Math.round(crop.h)});crop=null;T.set('move');View.fit();UI.refresh()};
 T.cropCancel=()=>{crop=null;T.set('move')};

 // ---- Pfeiltasten, Leertaste, Mausrad ----
 T.nudge=(dx,dy)=>{const L=Doc.layer();if(!L||L.locked)return;Doc.begin('nudge');for(const k of L.type==='group'?Doc.desc(L.id).filter(k=>k.type!=='group'):[L]){k.x+=dx;k.y+=dy}Doc.changed('canvas');UI.propsLive()};
 T.init=()=>{const v=$('#view');v.addEventListener('pointerdown',T.down);v.addEventListener('pointermove',T.move);v.addEventListener('pointerup',T.up);v.addEventListener('pointercancel',T.up);
  // Mauszeiger-Pfeile in den Linealen (wie GIMP): eigene kleine Elemente, folgen ohne Neuzeichnen sofort
  const st=$('#stage'),mkA=c=>{const a=document.createElement('i');a.className='rmark '+c;st.appendChild(a);return a},ax=mkA('rx'),ay=mkA('ry');
  v.addEventListener('pointermove',e=>{if(!View.rulers){ax.style.display=ay.style.display='none';return}const r=v.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;ax.style.display=x>18?'block':'none';ay.style.display=y>18?'block':'none';ax.style.transform=`translateX(${x}px)`;ay.style.transform=`translateY(${y}px)`},{passive:true});
  v.addEventListener('pointerleave',()=>{ax.style.display=ay.style.display='none'});
  // Pinselkreis: eigenes Element über der Leinwand, wird nur verschoben (kein Neuzeichnen, keine Verzögerung)
  const ring=document.createElement('i');ring.className='bring';st.appendChild(ring);let rx=-1,ry=-1;
  T.ringUpdate=()=>{const on=T.PAINT.includes(T.tool)&&!space&&rx>=0&&!$('#editor').hidden;ring.style.display=on?'block':'none';if(!on)return;const o=T.o[T.tool]||{};
   const px=T.tool==='pencil'&&((o.shape||'square')==='square'||o.grid!==false);ring.classList.toggle('sq',T.tool==='pencil'&&(o.shape||'square')==='square');
   if(px){const n=Math.max(1,Math.round(o.size||1)),[dx,dy]=View.toDoc(rx,ry),x0=Math.round(dx-n/2),y0=Math.round(dy-n/2),[sx,sy]=View.toScr(x0,y0),d=n*View.z;ring.style.width=ring.style.height=Math.max(2,d)+'px';ring.style.transform=`translate(${sx}px,${sy}px)`;return}
   const d=Math.max(3,(o.size||10)*View.z);ring.style.width=ring.style.height=d+'px';ring.style.transform=`translate(${rx-d/2}px,${ry-d/2}px)`};
  v.addEventListener('pointermove',e=>{const r=v.getBoundingClientRect();rx=e.clientX-r.left;ry=e.clientY-r.top;T.ringUpdate()},{passive:true});
  v.addEventListener('pointerleave',()=>{rx=-1;T.ringUpdate()});
  v.addEventListener('pointerleave',()=>{mouse=null;if(hover){hover=null}View.draw()});
  v.addEventListener('dblclick',e=>{const [x,y]=View.toDoc(...sp(e));const L=Doc.pick(x,y);if(L&&L.type==='text'){Doc.sel=L.id;UI.layers();UI.props();UI.focusText(true)}});
  v.addEventListener('wheel',e=>{e.preventDefault();const s=sp(e);const zoom=e.ctrlKey||e.metaKey||e.deltaMode===1||(!e.shiftKey&&!e.deltaX&&Math.abs(e.deltaY)>=40);
   if(zoom)View.zoomAt(View.z*Math.pow(1.0018,-Math.max(-200,Math.min(200,e.deltaY*(e.deltaMode===1?40:1)*(e.ctrlKey&&Math.abs(e.deltaY)<40?4:1)))),...s);else{View.ox-=e.shiftKey?e.deltaY:e.deltaX;View.oy-=e.shiftKey?0:e.deltaY;View.draw()}},{passive:false});
  v.addEventListener('contextmenu',e=>e.preventDefault());
  addEventListener('keydown',e=>{if(e.code==='Space'&&!e.target.matches('input,textarea,select,button')&&!$('#editor').hidden){if(!space){space=true;T.cursor()}e.preventDefault()}});
  addEventListener('keyup',e=>{if(e.code==='Space'){space=false;T.cursor()}});
  addEventListener('keydown',e=>{if(e.target.matches&&e.target.matches('input,textarea,select'))return;if(T.lassoKey(e.key)){e.preventDefault();e.stopImmediatePropagation();return}if(T.tool==='crop'&&crop&&e.key.startsWith('Arrow')){const st=e.shiftKey?25:1;crop.x+=e.key==='ArrowLeft'?-st:e.key==='ArrowRight'?st:0;crop.y+=e.key==='ArrowUp'?-st:e.key==='ArrowDown'?st:0;cropInfo();View.draw();e.preventDefault();e.stopImmediatePropagation()}if(T.tool==='move'&&T.o.move.mode==='sel'&&Sel.has()&&e.key.startsWith('Arrow')){const st=e.shiftKey?25:1;const dx=e.key==='ArrowLeft'?-st:e.key==='ArrowRight'?st:0,dy=e.key==='ArrowUp'?-st:e.key==='ArrowDown'?st:0;const m=Doc.mk(Sel.mask.width,Sel.mask.height);m.getContext('2d').drawImage(Sel.mask,dx,dy);Doc._label='Auswahl verschieben';Doc.begin('selnudge');Sel.mask=m;Sel.changed();e.preventDefault();e.stopImmediatePropagation()}},true);
  T.wire();T.bar();T.opts()};
 T.cropping=()=>T.tool==='crop'&&!!crop;
 T.selModesHTML=()=>selModes();T.mouse=()=>mouse;T.sample=(x,y,e,w)=>sample(x,y,e,w);
 T.HANDLES=HANDLES;T.sp=sp;T.isDragging=()=>!!drag;
 return T})();
