// Videoschnitt – Farbkorrektur wie in DaVinci Resolve: Farbräder (Lift, Gamma, Gain, Offset) und Scopes
// (Waveform, RGB-Parade, Vektorskop, Histogramm). Die Formel der Räder ist dieselbe wie beim Export (render.go: wheelsFF).
const Grade=(()=>{const G={},t=s=>Kit.t(s),esc=s=>Kit.esc(s),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const KEYS=[['lift','Lift','Schatten'],['gamma','Gamma','Mitteltöne'],['gain','Gain','Lichter'],['offset','Offset','Alles']];
 const empty=()=>({lift:[0,0,0,0],gamma:[0,0,0,0],gain:[0,0,0,0],offset:[0,0,0,0]});
 G.active=w=>!!w&&KEYS.some(([k])=>(w[k]||[]).some(v=>Math.abs(v)>1e-4));
 // Tabelle je Kanal (0..255), zwischengespeichert
 const cache=new Map();
 G.tab=w=>{const key=JSON.stringify(w);let r=cache.get(key);if(r)return r;r=[0,1,2].map(i=>{const L=.25*(w.lift[3]+w.lift[i]),Gn=1+.5*(w.gain[3]+w.gain[i]),Gm=Math.exp(-.7*(w.gamma[3]+w.gamma[i])),O=.25*(w.offset[3]+w.offset[i]);
   const a=new Uint8ClampedArray(256);for(let v=0;v<256;v++){const x=v/255;const y=clamp(x*Gn+L*(1-x),0,1);a[v]=Math.round(clamp(255*(Math.pow(y,Gm)+O),0,255))}return a});
  if(cache.size>40)cache.clear();cache.set(key,r);return r};
 G.apply=(w,p)=>{const[R,Gr,B]=G.tab(w);for(let i=0;i<p.length;i+=4){p[i]=R[p[i]];p[i+1]=Gr[p[i+1]];p[i+2]=B[p[i+2]]}};

 // Farbsaum entfernen (wie despill beim Export): Grün bzw. Blau höchstens so stark wie die anderen Kanäle
 G.despill=(x,w,h,key,amt)=>{const k=parseInt(String(key).slice(1),16),kr=k>>16&255,kg=k>>8&255,kb=k&255;const blue=kb>kg&&kb>kr;const a=Math.min(1,.5+.5*amt);
  const id=x.getImageData(0,0,w,h),p=id.data;for(let i=0;i<p.length;i+=4){if(!p[i+3])continue;if(blue){const m=Math.max(p[i],p[i+1]);if(p[i+2]>m)p[i+2]-=(p[i+2]-m)*a}else{const m=Math.max(p[i],p[i+2]);if(p[i+1]>m)p[i+1]-=(p[i+1]-m)*a}}x.putImageData(id,0,0)};
 // Farbton-Richtung des Puks -> Verschiebung je Kanal (Summe 0, so bleibt die Helligkeit gleich)
 const hueRGB=a=>[Math.cos(a),Math.cos(a-2*Math.PI/3),Math.cos(a+2*Math.PI/3)];
 const fromPuck=(px,py)=>{const r=Math.min(1,Math.hypot(px,py)),a=Math.atan2(-py,px);const c=hueRGB(a);return c.map(v=>v*r*(2/3))};
 const toPuck=v=>{ // Rückweg: aus r,g,b die Lage des Puks
  const m=(v[0]+v[1]+v[2])/3,r=v[0]-m,g=v[1]-m,b=v[2]-m;const x=r-(g+b)/2,y=(g-b)*Math.sqrt(3)/2;return[x,-y]};
 const wheelImg=new Map();
 const drawWheel=(cv,v)=>{const S=cv.width,x=cv.getContext('2d'),R=S/2-4;let img=wheelImg.get(S);
  if(!img){img=x.createImageData(S,S);const d=img.data;for(let j=0;j<S;j++)for(let i=0;i<S;i++){const dx=(i-S/2)/R,dy=(j-S/2)/R,r=Math.hypot(dx,dy),k=(j*S+i)*4;if(r>1){d[k+3]=0;continue}
    const c=hueRGB(Math.atan2(-dy,dx));const s=r*.75;for(let n=0;n<3;n++)d[k+n]=Math.round(255*(.42+(.5*c[n]+.5-.42)*s)*.85);d[k+3]=255}wheelImg.set(S,img)}
  x.putImageData(img,0,0);x.strokeStyle='#0008';x.lineWidth=1;x.beginPath();x.moveTo(S/2-6,S/2);x.lineTo(S/2+6,S/2);x.moveTo(S/2,S/2-6);x.lineTo(S/2,S/2+6);x.stroke();
  const[px,py]=toPuck(v);x.beginPath();x.arc(S/2+px*R,S/2+py*R,7,0,7);x.fillStyle='#fff';x.fill();x.strokeStyle='#000';x.lineWidth=2;x.stroke()};

 G.dialog=()=>{const f=App.sel&&App.sel.clip&&App.find(App.sel.clip);if(!f||f.c.type!=='media'){Kit.toast(t('Wähle zuerst einen Video- oder Bild-Clip aus.'));return}
  const c=f.c,before=JSON.stringify(App.P.tracks),old=c.wheels?JSON.parse(JSON.stringify(c.wheels)):null;const w=c.wheels?JSON.parse(JSON.stringify(c.wheels)):empty();c.wheels=w;
  const S=150;
  Panels.modal(`<div class="mhead"><h3>${t('Farbräder')}</h3><div class="sp"></div><button class="btn sm" id="grScope">${t('Scopes')}</button></div>
   <div class="mbody"><div class="grwheels">${KEYS.map(([k,n,d])=>`<div class="grw"><b>${n}</b><span class="muted">${t(d)}</span><canvas width="${S}" height="${S}" data-w="${k}"></canvas>
    <div class="grnum" data-n="${k}"></div><input type="range" min="-1" max="1" step="0.01" value="${w[k][3]}" data-m="${k}" title="${t('Gesamt (Helligkeit)')}"><button class="btn sm" data-rs="${k}">${t('Zurücksetzen')}</button></div>`).join('')}</div>
   <p class="muted" style="font-size:12px;margin-top:10px">${t('Puk ziehen verschiebt die Farbe, der Regler darunter die Helligkeit. Doppelklick setzt ein Rad zurück.')}</p></div>
   <div class="mfoot"><button class="btn" id="grAll">${t('Alle zurücksetzen')}</button><div class="sp"></div><button class="btn" id="grNo">${t('Abbrechen')}</button><button class="btn primary" id="grOk">${t('Übernehmen')}</button></div>`);
  const box=document.getElementById('mbox');const draw=()=>{for(const[k]of KEYS){drawWheel(box.querySelector(`[data-w="${k}"]`),w[k]);const v=w[k];box.querySelector(`[data-n="${k}"]`).textContent=['R','G','B','Y'].map((n,i)=>`${n} ${(v[i]>=0?'+':'')+v[i].toFixed(2)}`).join('  ')}Player.draw()};
  box.querySelectorAll('canvas[data-w]').forEach(cv=>{const k=cv.dataset.w;const at=e=>{const r=cv.getBoundingClientRect(),R=r.width/2-4;let px=(e.clientX-r.left-r.width/2)/R,py=(e.clientY-r.top-r.height/2)/R;const l=Math.hypot(px,py);if(l>1){px/=l;py/=l}
    const fine=e.shiftKey?.25:1;const d=fromPuck(px*fine,py*fine);w[k][0]=d[0];w[k][1]=d[1];w[k][2]=d[2];draw()};
   cv.onpointerdown=e=>{cv.setPointerCapture(e.pointerId);at(e);cv.onpointermove=at;cv.onpointerup=()=>{cv.onpointermove=null}};cv.ondblclick=()=>{w[k]=[0,0,0,w[k][3]];draw()}});
  box.querySelectorAll('[data-m]').forEach(r=>r.oninput=()=>{w[r.dataset.m][3]=+r.value;draw()});
  box.querySelectorAll('[data-rs]').forEach(b=>b.onclick=()=>{w[b.dataset.rs]=[0,0,0,0];box.querySelector(`[data-m="${b.dataset.rs}"]`).value=0;draw()});
  document.getElementById('grAll').onclick=()=>{for(const[k]of KEYS){w[k]=[0,0,0,0];box.querySelector(`[data-m="${k}"]`).value=0}draw()};
  document.getElementById('grScope').onclick=()=>G.scopes(true);
  document.getElementById('grNo').onclick=()=>{if(old)c.wheels=old;else delete c.wheels;Panels.close();Player.draw()};
  document.getElementById('grOk').onclick=()=>{if(!G.active(w))delete c.wheels;App.undo.push(before);App.redo=[];Panels.close();App.afterChange()};
  draw()};

 // ---------------- Scopes ----------------
 let sc=null,mode='wave',last=0,pend=0;
 G.scopes=(on)=>{if(on===undefined)on=!sc;if(!on){sc&&sc.remove();sc=null;return}if(sc)return;
  sc=document.createElement('div');sc.className='grscope';sc.innerHTML=`<div class="grsh"><b>${t('Scopes')}</b><select>${[['wave','Waveform'],['parade','RGB-Parade'],['vector','Vektorskop'],['hist','Histogramm']].map(([v,n])=>`<option value="${v}" ${v===mode?'selected':''}>${t(n)}</option>`).join('')}</select><button class="ib" title="${t('Schließen')}">✕</button></div><canvas width="360" height="200"></canvas>`;
  document.body.appendChild(sc);sc.querySelector('select').onchange=e=>{mode=e.target.value;G.updateScope(true)};sc.querySelector('button').onclick=()=>G.scopes(false);
  // verschieben am Kopf
  const h=sc.querySelector('.grsh');h.onpointerdown=e=>{if(e.target.closest('select,button'))return;const r=sc.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;h.setPointerCapture(e.pointerId);h.onpointermove=ev=>{sc.style.left=clamp(ev.clientX-dx,0,innerWidth-80)+'px';sc.style.top=clamp(ev.clientY-dy,0,innerHeight-40)+'px';sc.style.right='auto'};h.onpointerup=()=>{h.onpointermove=null}};
  G.updateScope(true)};
 G.updateScope=force=>{if(!sc)return;const now=performance.now();if(!force&&now-last<90){if(!pend)pend=setTimeout(()=>{pend=0;G.updateScope(true)},100);return}last=now;
  const src=document.getElementById('cv');if(!src||!src.width)return;const W=240,H=Math.max(2,Math.round(W*src.height/src.width));
  const tmp=G._tmp||(G._tmp=document.createElement('canvas'));tmp.width=W;tmp.height=H;const tx=tmp.getContext('2d',{willReadFrequently:true});tx.drawImage(src,0,0,W,H);const p=tx.getImageData(0,0,W,H).data;
  const cv=sc.querySelector('canvas'),x=cv.getContext('2d'),CW=cv.width,CH=cv.height;x.fillStyle='#0b0b0f';x.fillRect(0,0,CW,CH);
  const img=x.getImageData(0,0,CW,CH),d=img.data;const add=(i,j,r,g,b)=>{if(i<0||j<0||i>=CW||j>=CH)return;const k=(j*CW+i)*4;d[k]=Math.min(255,d[k]+r);d[k+1]=Math.min(255,d[k+1]+g);d[k+2]=Math.min(255,d[k+2]+b)};
  if(mode==='wave'||mode==='parade'){const cols=mode==='parade'?3:1,cw=CW/cols;
   for(let j=0;j<H;j++)for(let i=0;i<W;i++){const k=(j*W+i)*4,r=p[k],g=p[k+1],b=p[k+2];
    if(cols===1){const y=.2126*r+.7152*g+.0722*b;add(Math.floor(i*CW/W),Math.round((1-y/255)*(CH-1)),18,40,18)}
    else{const xi=i*cw/W;add(Math.floor(xi),Math.round((1-r/255)*(CH-1)),55,8,8);add(Math.floor(cw+xi),Math.round((1-g/255)*(CH-1)),8,55,8);add(Math.floor(2*cw+xi),Math.round((1-b/255)*(CH-1)),10,14,60)}}}
  else if(mode==='vector'){const cx=CW/2,cy=CH/2,R=CH/2-6;for(let k=0;k<p.length;k+=4){const r=p[k]/255,g=p[k+1]/255,b=p[k+2]/255;const cb=-.1146*r-.3854*g+.5*b,cr=.5*r-.4542*g-.0458*b;add(Math.round(cx+cb*2*R),Math.round(cy-cr*2*R),30,40,30)}}
  else{const hr=new Uint32Array(256),hg=new Uint32Array(256),hb=new Uint32Array(256);for(let k=0;k<p.length;k+=4){hr[p[k]]++;hg[p[k+1]]++;hb[p[k+2]]++}let mx=1;for(let v=1;v<255;v++)mx=Math.max(mx,hr[v],hg[v],hb[v]);
   for(let v=0;v<256;v++){const i=Math.floor(v*CW/256);for(const[hh,col]of[[hr,[90,10,10]],[hg,[10,90,10]],[hb,[12,18,100]]]){const top=Math.round(CH-Math.min(1,hh[v]/mx)*(CH-4));for(let j=top;j<CH;j++)add(i,j,...col)}}}
  x.putImageData(img,0,0);
  // Hilfslinien
  x.strokeStyle='#ffffff22';x.fillStyle='#ffffff66';x.font='10px sans-serif';x.lineWidth=1;
  if(mode==='vector'){const cx=CW/2,cy=CH/2,R=CH/2-6;x.beginPath();x.arc(cx,cy,R,0,7);x.moveTo(cx-R,cy);x.lineTo(cx+R,cy);x.moveTo(cx,cy-R);x.lineTo(cx,cy+R);x.stroke();
   for(const[n,r,g,b]of[['R',1,0,0],['G',0,1,0],['B',0,0,1],['Cy',0,1,1],['Mg',1,0,1],['Yl',1,1,0]]){const cb=-.1146*r-.3854*g+.5*b,cr=.5*r-.4542*g-.0458*b;x.fillText(n,cx+cb*2*R*.75-5,cy-cr*2*R*.75+4)}
   // Hautton-Linie
   x.strokeStyle='#ffb07a55';x.beginPath();x.moveTo(cx,cy);x.lineTo(cx+Math.cos(-2.15)*R,cy+Math.sin(-2.15)*R);x.stroke()}
  else if(mode!=='hist')for(const v of[0,25,50,75,100]){const y=Math.round((1-v/100)*(CH-1))+.5;x.beginPath();x.moveTo(0,y);x.lineTo(CW,y);x.stroke();x.fillText(String(v),2,y-2)}};
 // nach jedem Vorschaubild aktualisieren
 const hook=()=>{if(typeof Player==='undefined'||Player.__gr)return;const d=Player.draw;Player.draw=(...a)=>{const r=d.apply(Player,a);if(sc)G.updateScope();return r};Player.__gr=1};hook();
 Pro.ACTS.wheels=()=>G.dialog();Pro.ACTS.wheelsoff=()=>{const f=App.sel&&App.sel.clip&&App.find(App.sel.clip);if(f)App.change(()=>{delete f.c.wheels})};Pro.ACTS.scopes=()=>G.scopes();
 const st=document.createElement('style');st.textContent=`.grwheels{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.grw{display:flex;flex-direction:column;align-items:center;gap:5px}.grw canvas{cursor:crosshair;touch-action:none;border-radius:50%}
 .grw .muted{font-size:11px}.grnum{font:11px ui-monospace,monospace;opacity:.8;white-space:nowrap}.grw input[type=range]{width:140px}
 .grscope{position:fixed;right:16px;top:70px;z-index:900;background:#121218f2;border:1px solid #ffffff22;border-radius:10px;padding:6px;box-shadow:0 10px 30px #0008}
 .grscope canvas{display:block;width:360px;height:200px;border-radius:6px}.grsh{display:flex;align-items:center;gap:8px;padding:2px 4px 6px;cursor:move;color:#ddd;font-size:12px}.grsh select{margin-left:auto;font-size:12px}
 @media (max-width:900px){.grwheels{grid-template-columns:repeat(2,1fr)}}`;document.head.appendChild(st);
 return G})();
