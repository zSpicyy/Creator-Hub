// Navigator, eigene Pinselspitzen, Muster und Verlaufs-Vorlagen.
const Extra=(()=>{const X={};const {$,esc}=Kit;const t=s=>Kit.t(s);
 const ls={get:(k,d)=>{try{const v=localStorage.getItem('bb.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem('bb.'+k,JSON.stringify(v))}catch(e){Kit.toast(t('Der Speicher ist voll.'))}}};
 const fromURL=u=>new Promise(res=>{const im=new Image();im.onload=()=>{const c=Doc.mk(im.naturalWidth,im.naturalHeight);c.getContext('2d').drawImage(im,0,0);res(c)};im.onerror=()=>res(null);im.src=u});
 // ---- Navigator ----
 let navT=0;X.navLater=()=>{clearTimeout(navT);navT=setTimeout(X.nav,120)};
 X.nav=()=>{const c=$('#navc');if(!c||!Doc.d)return;const d=Doc.d,x=c.getContext('2d');const W=c.width,H=c.height,k=Math.min(W/d.w,H/d.h),ox=(W-d.w*k)/2,oy=(H-d.h*k)/2;x.clearRect(0,0,W,H);
  x.fillStyle='#8883';x.fillRect(ox,oy,d.w*k,d.h*k);x.drawImage(Doc.out||Doc.render(),ox,oy,d.w*k,d.h*k);
  const [a,b]=View.toDoc(0,0),[e,f]=View.toDoc(View.w,View.h);x.strokeStyle='#ff3fb4';x.lineWidth=2;x.strokeRect(ox+a*k,oy+b*k,(e-a)*k,(f-b)*k);c._m={k,ox,oy};const z=$('#navz');if(z&&document.activeElement!==z)z.value=Math.round(Math.log2(View.z)*100);const zv=$('#navzv');if(zv)zv.textContent=Math.round(View.z*100)+' %'};
 X.navHTML=()=>`<div class="sb" style="padding-top:12px"><canvas id="navc" width="560" height="380" style="width:100%;border-radius:8px;background:var(--bg);cursor:move;touch-action:none"></canvas><div class="row" style="margin-top:8px"><span>Zoom</span><input type="range" id="navz" min="-500" max="500" value="0"><span class="v" id="navzv"></span></div><div class="btns"><button class="btn sm" data-act="fit">${esc(t('Ganzes Bild'))}</button><button class="btn sm" data-act="z100">100 %</button></div></div>`;
 document.addEventListener('pointerdown',e=>{const c=e.target.closest&&e.target.closest('#navc');if(!c||!c._m)return;c.setPointerCapture(e.pointerId);const go=ev=>{const r=c.getBoundingClientRect(),m=c._m;const px=(ev.clientX-r.left)/r.width*c.width,py=(ev.clientY-r.top)/r.height*c.height;const dx=(px-m.ox)/m.k,dy=(py-m.oy)/m.k;View.ox=View.w/2-dx*View.z;View.oy=View.h/2-dy*View.z;View.draw()};go(e);c.onpointermove=ev=>{if(ev.buttons)go(ev)}});
 document.addEventListener('input',e=>{if(e.target.id==='navz')View.zoomAt(Math.pow(2,+e.target.value/100))});
 // ---- Pinselspitzen ----
 X.tips=[];const tipCv={};
 X.loadTips=async()=>{X.tips=ls.get('tips',[]);for(const tp of X.tips)if(!tipCv[tp.id])tipCv[tp.id]=await fromURL(tp.data)};
 X.tip=id=>tipCv[id]||null;
 X.tipFromSel=async()=>{const d=Doc.d;if(!Sel.has())return Kit.toast(t('Wähle zuerst einen Bereich aus, der zur Pinselspitze werden soll.'));const b=Sel.bbox();const out=Doc.need?Doc.render():Doc.out;
  const k=Math.min(1,256/Math.max(b.w,b.h)),w=Math.max(1,Math.round(b.w*k)),h=Math.max(1,Math.round(b.h*k));const c=Doc.mk(w,h),x=c.getContext('2d');x.drawImage(out,b.x,b.y,b.w,b.h,0,0,w,h);x.globalCompositeOperation='destination-in';x.drawImage(Sel.mask,b.x,b.y,b.w,b.h,0,0,w,h);
  const id=x.getImageData(0,0,w,h),p=id.data;for(let i=0;i<p.length;i+=4){const l=.299*p[i]+.587*p[i+1]+.114*p[i+2];p[i+3]=(255-l)*p[i+3]/255;p[i]=p[i+1]=p[i+2]=0}x.putImageData(id,0,0);
  const tp={id:'t'+Date.now().toString(36),data:c.toDataURL('image/png')};X.tips.push(tp);tipCv[tp.id]=c;ls.set('tips',X.tips);Kit.toast(t('Neue Pinselspitze gespeichert (Reiter Pinsel).'));UI.side()};
 X.delTip=id=>{X.tips=X.tips.filter(x=>x.id!==id);delete tipCv[id];ls.set('tips',X.tips);for(const k of Tools.PAINT)if(Tools.o[k].tip===id)delete Tools.o[k].tip;UI.side()};
 // ---- Muster ----
 const gen=(w,h,fn)=>{const c=Doc.mk(w,h),x=c.getContext('2d');fn(x,w,h);return c};
 const BUILT=[['checker','Schachbrett',()=>gen(32,32,(x)=>{x.fillStyle='#fff';x.fillRect(0,0,32,32);x.fillStyle='#000';x.fillRect(0,0,16,16);x.fillRect(16,16,16,16)})],
  ['stripes','Streifen',()=>gen(24,24,(x)=>{x.fillStyle='#fff';x.fillRect(0,0,24,24);x.strokeStyle='#000';x.lineWidth=6;for(let i=-24;i<48;i+=12){x.beginPath();x.moveTo(i,24);x.lineTo(i+24,0);x.stroke()}})],
  ['dots','Punkte',()=>gen(20,20,(x)=>{x.fillStyle='#fff';x.fillRect(0,0,20,20);x.fillStyle='#000';x.beginPath();x.arc(10,10,4,0,7);x.fill()})],
  ['grid','Raster',()=>gen(24,24,(x)=>{x.fillStyle='#fff';x.fillRect(0,0,24,24);x.fillStyle='#000';x.fillRect(0,0,24,2);x.fillRect(0,0,2,24)})],
  ['bricks','Ziegel',()=>gen(48,24,(x)=>{x.fillStyle='#b5523b';x.fillRect(0,0,48,24);x.fillStyle='#e8dccb';x.fillRect(0,11,48,2);x.fillRect(0,23,48,2);x.fillRect(23,0,2,12);x.fillRect(11,12,2,12);x.fillRect(35,12,2,12)})],
  ['noise','Rauschen',()=>gen(64,64,(x)=>{const id=x.createImageData(64,64);for(let i=0;i<id.data.length;i+=4){const v=Math.random()*255;id.data[i]=id.data[i+1]=id.data[i+2]=v;id.data[i+3]=255}x.putImageData(id,0,0)})],
  ['hex','Waben',()=>gen(30,52,(x)=>{x.fillStyle='#fff';x.fillRect(0,0,30,52);x.strokeStyle='#000';x.lineWidth=2;const hx=(cx,cy)=>{x.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i+Math.PI/6;x.lineTo(cx+15*Math.cos(a)*1,cy+15*Math.sin(a))}x.closePath();x.stroke()};hx(15,0);hx(0,26);hx(30,26);hx(15,52)})]];
 const patCv={};X.patterns=()=>{const own=ls.get('pats',[]);return[...BUILT.map(([id,n])=>({id,name:t(n)})),...own.map(p=>({id:p.id,name:t('Eigenes Muster'),own:true}))]};
 X.pat=id=>{if(patCv[id])return patCv[id];const b=BUILT.find(x=>x[0]===id);if(b)return patCv[id]=b[2]();return null};
 X.loadPats=async()=>{for(const p of ls.get('pats',[]))if(!patCv[p.id])patCv[p.id]=await fromURL(p.data)};
 X.patFromSel=()=>{if(!Sel.has())return Kit.toast(t('Wähle zuerst einen Bereich aus, der zum Muster werden soll.'));const b=Sel.bbox(),out=Doc.need?Doc.render():Doc.out;const k=Math.min(1,256/Math.max(b.w,b.h));const c=Doc.mk(b.w*k,b.h*k);c.getContext('2d').drawImage(out,b.x,b.y,b.w,b.h,0,0,c.width,c.height);
  const own=ls.get('pats',[]);const p={id:'p'+Date.now().toString(36),data:c.toDataURL('image/png')};own.push(p);ls.set('pats',own);patCv[p.id]=c;Tools.o.fill.pat=p.id;Kit.toast(t('Neues Muster gespeichert (Werkzeug Füllen).'));Tools.opts()};
 // ---- Verlaufs-Vorlagen ----
 X.GRADS=[['fgbg','Vordergrund → Hintergrund'],['fgt','Vordergrund → Transparent'],['rainbow','Regenbogen'],['sunset','Sonnenuntergang'],['neon','Neon'],['fire','Feuer'],['ocean','Ozean'],['metal','Metall'],['gold','Gold']];
 X.stops=(id,fg,bg)=>({fgbg:[[0,fg],[1,bg]],fgt:[[0,fg],[1,Doc.hexA(fg,0)]],rainbow:[[0,'#ff0000'],[.17,'#ff9900'],[.33,'#ffee00'],[.5,'#33dd33'],[.67,'#2299ff'],[.83,'#6633ff'],[1,'#ff00cc']],
  sunset:[[0,'#2b1055'],[.45,'#d53369'],[.75,'#f8a145'],[1,'#ffe29a']],neon:[[0,'#00f0ff'],[.5,'#b400ff'],[1,'#ff2e88']],fire:[[0,'#200000'],[.35,'#b31000'],[.7,'#ff7a00'],[1,'#fff4a0']],
  ocean:[[0,'#001f3f'],[.5,'#0074d9'],[1,'#7fdbff']],metal:[[0,'#3a3a3a'],[.25,'#d9d9d9'],[.5,'#7a7a7a'],[.75,'#f4f4f4'],[1,'#4b4b4b']],gold:[[0,'#7a5a12'],[.3,'#f7d774'],[.55,'#b8862b'],[.8,'#fff2b0'],[1,'#8a6416']]}[id]||[[0,fg],[1,bg]]);
 // ---- Aktionen aufzeichnen und abspielen ----
 X.rec=null;const NOREC=new Set(['save','export','home','new','keys','journal','mode','fit','z100','zin','zout','rulers','grid','guides','snap','print','undo','redo','macrorec','macrostop','dupimg','addimg','gridsize']);
 X.recAct=a=>{if(X.rec&&!NOREC.has(a))X.rec.steps.push({act:a})};
 X.recFx=(id,o)=>{if(X.rec)X.rec.steps.push({fx:id,o:JSON.parse(JSON.stringify(o))})};
 X.macros=()=>ls.get('macros',[]);
 X.start=()=>{X.rec={name:t('Aktion')+' '+(X.macros().length+1),steps:[]};Kit.toast(t('Aufnahme läuft: Menübefehle und Filter werden aufgezeichnet.'));UI.side()};
 X.stop=()=>{const r=X.rec;X.rec=null;if(!r||!r.steps.length){Kit.toast(t('Es wurde nichts aufgezeichnet.'));UI.side();return}const m=X.macros();m.push(r);ls.set('macros',m);Kit.toast(t('Aktion gespeichert:')+' '+r.name);UI.side()};
 X.play=async i=>{const m=X.macros()[i];if(!m||!Doc.d)return;for(const st of m.steps){if(st.act)await UI.act(st.act);else if(st.fx)FX.applyDirect(st.fx,st.o)}Kit.toast(t('Aktion ausgeführt:')+' '+m.name)};
 X.del=i=>{const m=X.macros();m.splice(i,1);ls.set('macros',m);UI.side()};
 X.macroHTML=()=>{const m=X.macros();return`<div class="sb"><div class="sub">${esc(t('Aktionen (Makros)'))}</div>${m.map((x,i)=>`<div class="chrow"><span class="grow">${esc(x.name)} <small class="muted">· ${x.steps.length}</small></span><button class="btn sm" data-mplay="${i}">${esc(t('Abspielen'))}</button><button class="ib" data-mdel="${i}">×</button></div>`).join('')||`<p class="hint2">${esc(t('Noch keine Aktion. Starte die Aufnahme, nutze Menübefehle und Filter, dann stoppe sie.'))}</p>`}
  <div class="btns" style="margin-top:6px">${X.rec?`<button class="btn sm danger" data-act="macrostop">● ${esc(t('Aufnahme stoppen'))} (${X.rec.steps.length})</button>`:`<button class="btn sm" data-act="macrorec">● ${esc(t('Aufnahme starten'))}</button>`}</div></div>`};
 // ---- Zuletzt geöffnete Dateien ----
 X.recent=()=>ls.get('recent',[]);
 X.addRecent=p=>{const r=X.recent().filter(x=>x!==p);r.unshift(p);ls.set('recent',r.slice(0,12))};
 X.init=async()=>{await X.loadTips();await X.loadPats()};
 return X})();
