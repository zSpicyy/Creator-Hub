// Farbauswahl wie in GIMP: Farbfeld mit Farbton-Leiste, Farbkreis, CMYK, Verlauf der benutzten Farben,
// Regler für RGB (0–255 oder 0–100 %) und HSV, Hex-Feld, Pipette, alte/neue Farbe. Schwebendes Fenster, bleibt bedienbar.
const ColorDlg=(()=>{const t=s=>Kit.t(s);const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const hex2rgb=h=>{h=String(h||'').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return isNaN(n)||h.length!==6?null:[n>>16&255,n>>8&255,n&255]};
 const rgb2hex=(r,g,b)=>'#'+[r,g,b].map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
 const rgb2hsv=(r,g,b)=>{r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;if(d){h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360}return[h,mx?d/mx:0,mx]};
 const hsv2rgb=(h,s,v)=>{const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;let r=0,g=0,b=0;if(h<60)[r,g,b]=[c,x,0];else if(h<120)[r,g,b]=[x,c,0];else if(h<180)[r,g,b]=[0,c,x];else if(h<240)[r,g,b]=[0,x,c];else if(h<300)[r,g,b]=[x,0,c];else[r,g,b]=[c,0,x];return[(r+m)*255,(g+m)*255,(b+m)*255]};
 const HK='bb.colorHist',PK='bb.colorPct',TK='bb.colorTab';const ls=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}};const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
 const hist=()=>ls(HK,[]);const pushHist=c=>{const h=hist().filter(x=>x!==c);h.unshift(c);lsSet(HK,h.slice(0,24))};
 let el=null,st=null;
 const close=ok=>{if(!el)return;if(ok){pushHist(st.hex);st.cb(st.hex,true)}else st.cb(st.old,true);el.remove();el=null;st=null;document.removeEventListener('keydown',key,true)};
 const key=e=>{if(!el)return;if(e.target.closest&&e.target.closest('input')&&e.key!=='Escape'&&e.key!=='Enter')return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(false)}else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();close(true)}};
 // aktuelle Farbe setzen (aus HSV, damit der Farbton bei Grau erhalten bleibt)
 const setHSV=(h,s,v,src)=>{st.h=h;st.s=s;st.v=v;const [r,g,b]=hsv2rgb(h,s,v);st.rgb=[r,g,b];st.hex=rgb2hex(r,g,b);upd(src)};
 const setRGB=(r,g,b,src)=>{const [h,s,v]=rgb2hsv(r,g,b);st.rgb=[r,g,b];st.hex=rgb2hex(r,g,b);if(s>0&&v>0)st.h=h;st.s=s;st.v=v;upd(src)};
 const q=s=>el.querySelector(s);
 const drawSV=()=>{const c=q('#cdSV');if(!c)return;const g=c.getContext('2d'),W=c.width,H=c.height;g.fillStyle=rgb2hex(...hsv2rgb(st.h,1,1));g.fillRect(0,0,W,H);let gr=g.createLinearGradient(0,0,W,0);gr.addColorStop(0,'#fff');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,W,H);gr=g.createLinearGradient(0,0,0,H);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'#000');g.fillStyle=gr;g.fillRect(0,0,W,H);
  const x=st.s*W,y=(1-st.v)*H;g.beginPath();g.arc(x,y,6,0,7);g.strokeStyle=st.v>.5?'#000':'#fff';g.lineWidth=2;g.stroke();
  const hc=q('#cdH').getContext('2d'),hh=q('#cdH').height;for(let i=0;i<hh;i++){hc.fillStyle=rgb2hex(...hsv2rgb(360*(1-i/hh)%360,1,1));hc.fillRect(0,i,24,1)}const hy=(1-st.h/360)*hh;hc.fillStyle='#fff';hc.strokeStyle='#000';hc.lineWidth=1;hc.fillRect(0,hy-2,24,4);hc.strokeRect(.5,hy-2.5,23,5)};
 const drawWheel=()=>{const c=q('#cdW');if(!c)return;const g=c.getContext('2d'),W=c.width,R=W/2,r0=R-22;g.clearRect(0,0,W,W);for(let a=0;a<360;a+=1){g.beginPath();g.arc(R,R,R-2,(a-1)*Math.PI/180,(a+1)*Math.PI/180);g.arc(R,R,r0,(a+1)*Math.PI/180,(a-1)*Math.PI/180,true);g.closePath();g.fillStyle=rgb2hex(...hsv2rgb(a,1,1));g.fill()}
  const sq=Math.floor(r0*1.38),o=R-sq/2;g.fillStyle=rgb2hex(...hsv2rgb(st.h,1,1));g.fillRect(o,o,sq,sq);let gr=g.createLinearGradient(o,0,o+sq,0);gr.addColorStop(0,'#fff');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(o,o,sq,sq);gr=g.createLinearGradient(0,o,0,o+sq);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'#000');g.fillStyle=gr;g.fillRect(o,o,sq,sq);
  const a=st.h*Math.PI/180;g.beginPath();g.arc(R+Math.cos(a)*(r0+10),R+Math.sin(a)*(r0+10),7,0,7);g.strokeStyle='#fff';g.lineWidth=2;g.stroke();g.beginPath();g.arc(o+st.s*sq,o+(1-st.v)*sq,6,0,7);g.strokeStyle=st.v>.5?'#000':'#fff';g.stroke();c._sq=[o,sq,r0,R]};
 const cmyk=()=>{const [r,g,b]=st.rgb.map(v=>v/255),k=1-Math.max(r,g,b);if(k>=1)return[0,0,0,100];return[(1-r-k)/(1-k),(1-g-k)/(1-k),(1-b-k)/(1-k),k].map(v=>Math.round(v*100))};
 const upd=src=>{if(!el)return;const pct=ls(PK,false),[r,g,b]=st.rgb;const rv=v=>pct?Math.round(v/2.55*10)/10:Math.round(v);
  const set=(id,v)=>{const a=q(`[data-cs="${id}"]`);if(a&&src!==id){a.value=v;const n=q(`[data-cn="${id}"]`);if(n&&document.activeElement!==n)n.value=v}};
  set('r',rv(r));set('g',rv(g));set('b',rv(b));set('h',Math.round(st.h));set('s',Math.round(st.s*100));set('v',Math.round(st.v*100));
  const [C,M,Y,K]=cmyk();set('c',C);set('m',M);set('y',Y);set('k',K);
  for(const [id,f] of[['r',x=>[x,g,b]],['g',x=>[r,x,b]],['b',x=>[r,g,x]]]){const a=q(`[data-cs="${id}"]`);if(a)a.style.background=`linear-gradient(90deg,${rgb2hex(...f(0))},${rgb2hex(...f(255))})`}
  const sv=q('[data-cs="s"]');if(sv)sv.style.background=`linear-gradient(90deg,${rgb2hex(...hsv2rgb(st.h,0,st.v))},${rgb2hex(...hsv2rgb(st.h,1,st.v))})`;const vv=q('[data-cs="v"]');if(vv)vv.style.background=`linear-gradient(90deg,#000,${rgb2hex(...hsv2rgb(st.h,st.s,1))})`;
  const hx=q('#cdHex');if(hx&&src!=='hex')hx.value=st.hex.slice(1);q('#cdNew').style.background=st.hex;drawSV();drawWheel();st.cb(st.hex,false)};
 const sl=(id,lab,max,step=1)=>`<label class="cdr"><span>${lab}</span><input type="range" data-cs="${id}" min="0" max="${max}" step="${step}"><input type="number" data-cn="${id}" min="0" max="${max}" step="${step}"></label>`;
 const body=()=>{const tab=ls(TK,'sq'),pct=ls(PK,false),mx=pct?100:255,stp=pct?.1:1;
  const tabs=[['sq','Farbfeld'],['wheel','Farbkreis'],['cmyk','CMYK'],['pal','Verlauf']].map(([k,n])=>`<button data-cdtab="${k}" class="${tab===k?'on':''}">${esc(t(n))}</button>`).join('');
  const left=tab==='sq'?`<div class="cdsq"><canvas id="cdSV" width="220" height="220"></canvas><canvas id="cdH" width="24" height="220"></canvas></div>`
   :tab==='wheel'?`<div class="cdsq"><canvas id="cdW" width="248" height="248"></canvas></div>`
   :tab==='cmyk'?`<div class="cdsl">${sl('c','C',100)}${sl('m','M',100)}${sl('y','Y',100)}${sl('k','K',100)}<p class="hint2">${esc(t('Cyan, Magenta, Gelb und Schwarz: So mischt ein Drucker die Farbe.'))}</p></div>`
   :`<div class="cdpal">${hist().map(c=>`<button data-cdh="${c}" style="background:${c}" title="${c}"></button>`).join('')||`<p class="hint2">${esc(t('Hier erscheinen die zuletzt benutzten Farben.'))}</p>`}</div>`;
  return`<div class="cdhead" data-cddrag><b>${esc(st.title)}</b><button class="ib" data-cdx>×</button></div>
  <div class="cdtabs">${tabs}</div><div class="cdmain"><div class="cdleft">${left}</div>
  <div class="cdright"><div class="cdunit"><span>RGB</span><div class="seg"><button data-cdpct="0" class="${pct?'':'on'}">0…255</button><button data-cdpct="1" class="${pct?'on':''}">0…100</button></div></div>
   ${sl('r','R',mx,stp)}${sl('g','G',mx,stp)}${sl('b','B',mx,stp)}<div class="cdgap"></div>${sl('h','H',360)}${sl('s','S',100)}${sl('v','V',100)}
   <div class="cdhex"><label>HTML-Notation <span>#</span><input id="cdHex" maxlength="7" spellcheck="false"></label><button class="btn sm" data-cdpick title="${esc(t('Farbe aus dem Bild aufnehmen'))}">${esc(t('Pipette'))}</button></div>
   <div class="cdcmp"><div><small>${esc(t('Aktuell'))}</small><i id="cdNew"></i></div><div><small>${esc(t('Vorher'))}</small><i id="cdOld" style="background:${st.old}" title="${esc(t('Zur alten Farbe zurück'))}"></i></div></div>
   <div class="cdrec">${hist().slice(0,12).map(c=>`<button data-cdh="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div></div></div>
  <div class="cdfoot"><button class="btn" data-cdreset>${esc(t('Zurücksetzen'))}</button><span style="flex:1"></span><button class="btn" data-cdx>${esc(t('Abbrechen'))}</button><button class="btn primary" data-cdok>OK</button></div>`};
 const render=()=>{const pos=el.style.cssText;el.innerHTML=body();el.style.cssText=pos;upd()};
 // Ziehen im Farbfeld/Farbkreis
 const svDrag=(e,c,fn)=>{const mv=ev=>{const r=c.getBoundingClientRect();fn((ev.clientX-r.left)*c.width/r.width,(ev.clientY-r.top)*c.height/r.height,ev)};mv(e);const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up)};addEventListener('pointermove',mv);addEventListener('pointerup',up)};
 const pick=()=>{if(window.EyeDropper){new EyeDropper().open().then(r=>{const c=hex2rgb(r.sRGBHex);if(c&&el)setRGB(...c)}).catch(()=>{});return}
  Kit.toast(t('Klicke ins Bild, um die Farbe aufzunehmen.'));const v=document.getElementById('view');const h=ev=>{ev.stopPropagation();ev.preventDefault();v.removeEventListener('pointerdown',h,true);if(!el)return;const r=v.getBoundingClientRect();const [x,y]=View.toDoc(ev.clientX-r.left,ev.clientY-r.top);
   const out=Doc.need?Doc.render():Doc.out;if(!out)return;const px=out.getContext('2d').getImageData(clamp(Math.floor(x),0,out.width-1),clamp(Math.floor(y),0,out.height-1),1,1).data;setRGB(px[0],px[1],px[2])};v.addEventListener('pointerdown',h,true)};
 const open=(hex,cb,title)=>{if(el)close(false);const c=hex2rgb(hex)||[0,0,0];const [h,s,v]=rgb2hsv(...c);st={old:rgb2hex(...c),hex:rgb2hex(...c),rgb:c,h,s,v,cb,title:title||t('Farbe ändern')};
  el=document.createElement('div');el.className='cdlg';document.body.appendChild(el);el.innerHTML=body();const r=el.getBoundingClientRect();el.style.left=Math.max(8,(innerWidth-r.width)/2)+'px';el.style.top=Math.max(8,(innerHeight-r.height)/2.4)+'px';upd();
  document.addEventListener('keydown',key,true);
  el.addEventListener('pointerdown',e=>{const c=e.target.closest('canvas');if(c&&c.id==='cdSV'){e.preventDefault();svDrag(e,c,(x,y)=>setHSV(st.h,clamp(x/c.width,0,1),clamp(1-y/c.height,0,1)));return}
   if(c&&c.id==='cdH'){e.preventDefault();svDrag(e,c,(x,y)=>setHSV(clamp((1-y/c.height)*360,0,359.9),st.s,st.v));return}
   if(c&&c.id==='cdW'){e.preventDefault();const [o,sq,r0,R]=c._sq;const r=c.getBoundingClientRect(),x0=(e.clientX-r.left)*c.width/r.width,y0=(e.clientY-r.top)*c.height/r.height;const ring=Math.hypot(x0-R,y0-R)>r0;
    svDrag(e,c,(x,y)=>{if(ring){let a=Math.atan2(y-R,x-R)*180/Math.PI;if(a<0)a+=360;setHSV(a,st.s,st.v)}else setHSV(st.h,clamp((x-o)/sq,0,1),clamp(1-(y-o)/sq,0,1))});return}
   const d=e.target.closest('[data-cddrag]');if(d&&!e.target.closest('button')){const sx=e.clientX-el.offsetLeft,sy=e.clientY-el.offsetTop;const mv=ev=>{el.style.left=clamp(ev.clientX-sx,0,innerWidth-80)+'px';el.style.top=clamp(ev.clientY-sy,0,innerHeight-40)+'px'};const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up)};addEventListener('pointermove',mv);addEventListener('pointerup',up)}});
  el.addEventListener('input',e=>{const a=e.target;const id=a.dataset.cs||a.dataset.cn;if(id){const v=+a.value,pct=ls(PK,false);if(a.dataset.cn){const s=q(`[data-cs="${id}"]`);if(s)s.value=v}else{const n=q(`[data-cn="${id}"]`);if(n)n.value=v}
    if('rgb'.includes(id)){const k=pct?2.55:1;const rgb=[...st.rgb];rgb['rgb'.indexOf(id)]=clamp(v*k,0,255);setRGB(...rgb,id)}
    else if(id==='h')setHSV(clamp(v,0,359.9),st.s,st.v,id);else if(id==='s')setHSV(st.h,clamp(v/100,0,1),st.v,id);else if(id==='v')setHSV(st.h,st.s,clamp(v/100,0,1),id);
    else{const g=k=>(+q(`[data-cs="${k}"]`).value)/100;const K=g('k');setRGB(255*(1-g('c'))*(1-K),255*(1-g('m'))*(1-K),255*(1-g('y'))*(1-K),id)}return}
   if(a.id==='cdHex'){const c=hex2rgb(a.value);if(c)setRGB(...c,'hex')}});
  el.addEventListener('click',e=>{const b=e.target.closest('button,i');if(!b)return;
   if(b.dataset.cdx!=null)return close(false);if(b.dataset.cdok!=null)return close(true);if(b.dataset.cdtab){lsSet(TK,b.dataset.cdtab);return render()}
   if(b.dataset.cdpct!=null){lsSet(PK,b.dataset.cdpct==='1');return render()}if(b.dataset.cdh){const c=hex2rgb(b.dataset.cdh);if(c)setRGB(...c);return}
   if(b.dataset.cdpick!=null)return pick();if(b.dataset.cdreset!=null||b.id==='cdOld'){const c=hex2rgb(st.old);setRGB(...c)}})};
 return{open,close,isOpen:()=>!!el,hist}})();
