// Wie in Filmora: Quellansicht mit In-/Out-Punkt (I/O) und Anfügen/Einfügen/Überschreiben, Pegelanzeige im Player,
// Lautstärke normalisieren, Musik unter Sprache automatisch absenken (Ducking), Schnell-Teilen-Werkzeug (C/V), Audio-Mixer.
(()=>{const t=s=>Kit.t(s),esc=s=>Kit.esc(s),A=Pro.ACTS,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const fmt=s=>{s=Math.max(0,s||0);const fps=(App.P&&App.P.fps)||30,f=Math.floor((s%1)*fps),x=Math.floor(s);return`${String(Math.floor(x/60)).padStart(2,'0')}:${String(x%60).padStart(2,'0')}:${String(f).padStart(2,'0')}`};
 const url=m=>`api/file?id=${App.P.id}&m=${m.id}&k=play&p=${m.proxy}`;
 const ready=m=>m&&(m.kind==='image'||m.proxy==='ok'||m.proxy==='direct');
 const hasAudio=m=>m&&(m.kind==='audio'||m.hasAudio);

 // ---------- Clips schneiden und einfügen ----------
 const cloneClip=(c,o)=>{const x=JSON.parse(JSON.stringify(c));delete x.id;return App.newClip(Object.assign(x,o||{}))};
 const isSrc=c=>c.type==='media'&&c.out>c.in;
 // teilt einen Clip an Zeitpunkt x der Zeitleiste in zwei Teile
 const cutAt=(c,x)=>{const d=x-c.start,sp=c.speed||1;const L=App.len(c);if(d<=1e-3||d>=L-1e-3)return null;const r=cloneClip(c,{start:x});
  if(isSrc(c)){if(c.reverse){const m=c.out-d*sp;r.out=m;c.in=m}else{const m=c.in+d*sp;c.out=m;r.in=m}}else{c.dur=d;r.dur=L-d}
  if(c.kf)for(const p in c.kf){r.kf[p]=c.kf[p].map(([a,v])=>[a-d,v]).filter(k=>k[0]>=0);c.kf[p]=c.kf[p].filter(k=>k[0]<=d)}
  c.fadeOut=0;r.fadeIn=0;delete c.trans;return r};
 const mainTrack=kind=>{const tr=App.P.tracks.filter(x=>x.kind===kind&&!x.subs&&!x.locked);return kind==='video'?tr[tr.length-1]:tr[0]};
 const clipFor=(m,s)=>{const c=Timeline.clipFromMedia(m,s);if(isSrc(c)){if(m._in!=null)c.in=clamp(m._in,0,m.dur);if(m._out!=null)c.out=clamp(m._out,c.in+0.05,m.dur)}return c};
 const place=(m,how)=>{const kind=m.kind==='audio'?'audio':'video';
  App.change(()=>{let tr=mainTrack(kind);const at=how==='end'?(tr&&tr.clips.length?Math.max(...tr.clips.map(c=>c.start+App.len(c))):0):App.t;const c=clipFor(m,at),L=App.len(c);
   if(!tr)tr=Timeline.place(kind,at,L);
   if(how==='insert'){const add=[];for(const x of tr.clips){if(x.start<at&&x.start+App.len(x)>at){const r=cutAt(x,at);if(r)add.push(r)}}tr.clips.push(...add);for(const x of tr.clips)if(x.start>=at-1e-6)x.start+=L}
   else if(how==='over'){const e=at+L,keep=[];for(const x of tr.clips){const xs=x.start,xe=xs+App.len(x);if(xe<=at+1e-6||xs>=e-1e-6){keep.push(x);continue}
     if(xs<at&&xe>e){const r=cutAt(x,e);const mid=cutAt(x,at);keep.push(x);if(r)keep.push(r);continue}
     if(xs<at){cutAt(x,at);keep.push(x);continue}
     if(xe>e){const r=cutAt(x,e);if(r)keep.push(r);continue}}tr.clips=keep}
   tr.clips.push(c);tr.clips.sort((a,b)=>a.start-b.start);App.sel={clip:c.id}})};

 // ---------- Quellansicht ----------
 let sv=null,cur=null,raf=0;
 const build=()=>{const pl=$('#player');if(!pl||sv)return;sv=document.createElement('div');sv.className='srcv';sv.hidden=true;
  sv.innerHTML=`<div class="srchead"><span class="srcname"></span><button class="btn sm" data-sv="close" title="${esc(t('Zurück zur Zeitleiste (Esc)'))}">${esc(t('Zur Zeitleiste'))}</button></div>
  <div class="srcstage"></div><div class="srcscrub"><i class="rng"></i><b class="ph"></b></div>
  <div class="srcrow"><span class="srctc">00:00:00</span><span class="muted">/</span><span class="srcdur muted">00:00:00</span><div class="sp"></div>
   <button class="ib" data-sv="in" title="${esc(t('In-Punkt setzen (I)'))}"><svg viewBox="0 0 24 24"><path d="M7 4v16M7 4h5M7 20h5"/></svg></button>
   <button class="ib" data-sv="prev" title="${esc(t('Ein Bild zurück (←)'))}"><svg viewBox="0 0 24 24"><path d="M6 5v14M18 6l-9 6 9 6z"/></svg></button>
   <button class="ib play" data-sv="play" title="${esc(t('Abspielen (Leertaste)'))}"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></button>
   <button class="ib" data-sv="next" title="${esc(t('Ein Bild vor (→)'))}"><svg viewBox="0 0 24 24"><path d="M18 5v14M6 6l9 6-9 6z"/></svg></button>
   <button class="ib" data-sv="out" title="${esc(t('Out-Punkt setzen (O)'))}"><svg viewBox="0 0 24 24"><path d="M17 4v16M17 4h-5M17 20h-5"/></svg></button><div class="sp"></div></div>
  <div class="srcrow add"><button class="btn primary" data-sv="end" title="${esc(t('Hinten an die Hauptspur anhängen (Enter)'))}">${esc(t('Anfügen'))}</button><button class="btn" data-sv="insert" title="${esc(t('Am Abspielkopf einfügen, Folgendes rückt nach hinten'))}">${esc(t('Am Abspielkopf einfügen'))}</button><button class="btn" data-sv="over" title="${esc(t('Am Abspielkopf einfügen und Vorhandenes überschreiben'))}">${esc(t('Überschreiben'))}</button><button class="btn sm" data-sv="clear" title="${esc(t('In- und Out-Punkt entfernen'))}">${esc(t('Bereich löschen'))}</button></div>`;
  pl.appendChild(sv);
  sv.addEventListener('click',e=>{const b=e.target.closest('[data-sv]');if(!b)return;const k=b.dataset.sv;act(k)});
  const sc=sv.querySelector('.srcscrub');sc.addEventListener('pointerdown',e=>{if(!cur||!cur.el||cur.m.kind==='image')return;const mv=ev=>{const r=sc.getBoundingClientRect();cur.el.currentTime=clamp((ev.clientX-r.left)/r.width,0,1)*cur.m.dur;ui()};mv(e);const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up)};addEventListener('pointermove',mv);addEventListener('pointerup',up)})};
 const ui=()=>{if(!cur)return;const m=cur.m,D=m.dur||0,tt=cur.el&&cur.el.currentTime||0;sv.querySelector('.srctc').textContent=fmt(tt);sv.querySelector('.srcdur').textContent=fmt(m._out!=null||m._in!=null?(m._out??D)-(m._in||0):D);
  const ph=sv.querySelector('.ph'),rng=sv.querySelector('.rng');ph.style.left=(D?tt/D*100:0)+'%';const a=m._in||0,b=m._out??D;rng.style.left=(D?a/D*100:0)+'%';rng.style.width=(D?(b-a)/D*100:100)+'%';rng.classList.toggle('on',m._in!=null||m._out!=null);
  sv.querySelector('[data-sv="play"]').innerHTML=cur.el&&!cur.el.paused?'<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>':'<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>'};
 const loop=()=>{ui();if(cur&&cur.el&&!cur.el.paused){if(cur.m._out!=null&&cur.el.currentTime>=cur.m._out){cur.el.pause();cur.el.currentTime=cur.m._out}raf=requestAnimationFrame(loop)}else raf=0};
 const open=m=>{if(!App.P)return;if(!ready(m))return Kit.toast(t('Die Datei wird noch vorbereitet.'));build();if(typeof Player!=='undefined'&&Player.playing)Player.pause();close(true);
  const st=sv.querySelector('.srcstage');st.innerHTML='';let el=null;
  if(m.kind==='image'){const im=new Image();im.src=url(m);st.appendChild(im)}else{el=document.createElement(m.kind==='video'?'video':'audio');el.src=url(m);el.preload='auto';el.playsInline=true;if(m.kind==='audio'){const n=document.createElement('div');n.className='srcaudio';n.textContent='♪ '+m.name;st.appendChild(n)}st.appendChild(el);
   el.addEventListener('loadedmetadata',()=>{if(!m.dur&&el.duration)m.dur=el.duration;el.currentTime=m._in||0;ui()});el.addEventListener('timeupdate',ui);el.addEventListener('play',()=>{if(!raf)raf=requestAnimationFrame(loop);ui()});el.addEventListener('pause',ui)}
  cur={m,el};sv.querySelector('.srcname').textContent=m.name;sv.querySelectorAll('[data-sv="in"],[data-sv="out"],[data-sv="play"],[data-sv="prev"],[data-sv="next"],[data-sv="clear"]').forEach(b=>b.disabled=m.kind==='image');sv.hidden=false;ui()};
 const close=quiet=>{if(!sv||sv.hidden)return;if(cur&&cur.el){cur.el.pause();cur.el.removeAttribute('src');cur.el.load()}cur=null;sv.hidden=true;sv.querySelector('.srcstage').innerHTML=''};
 const act=k=>{if(k==='close')return close();if(!cur)return;const m=cur.m,el=cur.el,fps=App.P.fps||30;
  if(k==='play'){if(!el)return;if(el.paused){if(m._out!=null&&el.currentTime>=m._out-1/fps)el.currentTime=m._in||0;el.play().catch(()=>{})}else el.pause();return}
  if(k==='prev'||k==='next'){if(!el)return;el.pause();el.currentTime=clamp(el.currentTime+(k==='next'?1:-1)/fps,0,m.dur);ui();return}
  if(k==='in'){if(!el)return;m._in=el.currentTime;if(m._out!=null&&m._out<=m._in+0.05)m._out=null;ui();return}
  if(k==='out'){if(!el)return;m._out=el.currentTime;if(m._in!=null&&m._in>=m._out-0.05)m._in=null;ui();return}
  if(k==='clear'){m._in=m._out=null;ui();return}
  if(k==='end'||k==='insert'||k==='over'){place(m,k);Kit.toast(t(k==='end'?'Hinten angefügt.':k==='insert'?'Am Abspielkopf eingefügt.':'Am Abspielkopf überschrieben.'))}};
 // Doppelklick auf eine Datei öffnet sie in der Quellansicht (wie Filmora); das Plus fügt sie weiter direkt an
 document.addEventListener('dblclick',e=>{const tl=e.target.closest('[data-mid]');if(!tl||!App.P)return;e.stopImmediatePropagation();e.preventDefault();const m=App.media(tl.dataset.mid);if(m)open(m)},true);
 addEventListener('keydown',e=>{if(!sv||sv.hidden)return;const tg=e.target;if(tg&&(tg.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)))return;if(e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key;const map={i:'in',I:'in',o:'out',O:'out',' ':'play',ArrowLeft:'prev',ArrowRight:'next',Escape:'close',Enter:'end'};if(!map[k])return;e.preventDefault();e.stopImmediatePropagation();act(map[k])},true);
 A.srcview=()=>{const f=App.sel&&App.find(App.sel.clip);const m=f&&App.media(f.c.mediaId);if(m)open(m);else Kit.toast(t('Doppelklicke eine Datei in den Medien, um sie hier anzusehen.'))};

 // ---------- Pegelanzeige (VU) ----------
 const vu=document.createElement('canvas');vu.className='vu';vu.width=26;vu.height=200;let actx=null;const an=new Map();let hold=[-60,-60],holdT=[0,0],vraf=0;
 const attach=e=>{if(an.has(e)||!e.captureStream)return;try{const s=e.captureStream();if(!s.getAudioTracks().length)return;actx=actx||new (window.AudioContext||window.webkitAudioContext)();const src=actx.createMediaStreamSource(s),sp=actx.createChannelSplitter(2),L=actx.createAnalyser(),R=actx.createAnalyser();L.fftSize=R.fftSize=1024;src.connect(sp);sp.connect(L,0);sp.connect(R,1);an.set(e,{L,R,buf:new Float32Array(1024)})}catch(x){}};
 document.addEventListener('playing',e=>{const el=e.target;if(!(el instanceof HTMLMediaElement)||!el.closest('#hidden'))return;attach(el);if(actx&&actx.state!=='running')actx.resume().catch(()=>{});if(!vraf)vraf=requestAnimationFrame(drawVu)},true);
 const peak=(a,buf)=>{a.getFloatTimeDomainData(buf);let m=0;for(let i=0;i<buf.length;i++){const v=Math.abs(buf[i]);if(v>m)m=v}return m};
 function drawVu(){const g=vu.getContext('2d'),W=vu.width,H=vu.height;const lv=[0,0];let any=false;for(const [e,a] of an){if(!e.isConnected){an.delete(e);continue}if(e.paused||e.muted)continue;any=true;const v=e.volume;const l=peak(a.L,a.buf)*v,r=peak(a.R,a.buf)*v;lv[0]=Math.sqrt(lv[0]**2+l*l);lv[1]=Math.sqrt(lv[1]**2+r*r)}
  const db=lv.map(x=>x>1e-5?20*Math.log10(x):-60),now=performance.now();g.clearRect(0,0,W,H);
  for(let ch=0;ch<2;ch++){const x=3+ch*11,w=8,d=clamp(db[ch],-60,6);if(d>hold[ch]||now-holdT[ch]>1200){hold[ch]=d;holdT[ch]=now}
   g.fillStyle='rgba(255,255,255,.08)';g.fillRect(x,4,w,H-8);const y=v=>4+(H-8)*(1-(clamp(v,-60,6)+60)/66);const gr=g.createLinearGradient(0,y(6),0,y(-60));gr.addColorStop(0,'#ff4d4d');gr.addColorStop(.12,'#ff4d4d');gr.addColorStop(.2,'#ffd23f');gr.addColorStop(.32,'#3ddc84');gr.addColorStop(1,'#1f8f55');g.fillStyle=gr;g.fillRect(x,y(d),w,H-4-y(d));
   g.fillStyle=hold[ch]>-1?'#ff4d4d':'#fff';g.fillRect(x,y(hold[ch])-1,w,2)}
  vu.title=`L ${db[0].toFixed(1)} dB · R ${db[1].toFixed(1)} dB`;const pl=typeof Player!=='undefined'&&Player.playing;vu.classList.toggle('on',!!(pl&&any));if(pl||any)vraf=requestAnimationFrame(drawVu);else{vraf=0;g.clearRect(0,0,W,H)}}
 const mountVu=()=>{const st=$('#stage');if(st&&!vu.isConnected)st.appendChild(vu)};

 // ---------- Lautstärke: Normalisieren und Ducking ----------
 const waves=new Map();const wave=async id=>{if(waves.has(id))return waves.get(id);try{const r=await fetch(`api/file?id=${App.P.id}&m=${id}&k=wave`);if(!r.ok)return null;const w=new Uint8Array(await r.arrayBuffer());waves.set(id,w);return w}catch(e){return null}};
 const amp=(w,s)=>{const v=(w[Math.floor(s*50)]||0)/255;return v*v};
 const srcAt=(c,T)=>c.reverse?c.out-(T-c.start)*(c.speed||1):c.in+(T-c.start)*(c.speed||1);
 const selMedia=()=>{const f=App.sel&&App.find(App.sel.clip);if(!f||f.c.type!=='media'){Kit.toast(t('Wähle zuerst einen Video- oder Ton-Clip aus.'));return null}const m=App.media(f.c.mediaId);if(!hasAudio(m)){Kit.toast(t('Dieser Clip hat keinen Ton.'));return null}return{...f,m}};
 A.normalize=async()=>{const f=selMedia();if(!f)return;const w=await wave(f.m.id);if(!w)return Kit.toast(t('Die Wellenform ist noch nicht fertig. Versuch es gleich noch einmal.'));const c=f.c;let pk=0;for(let k=Math.floor(c.in*50);k<=Math.ceil(c.out*50);k++){const v=(w[k]||0)/255;if(v*v>pk)pk=v*v}
  if(pk<1e-4)return Kit.toast(t('In diesem Clip ist kein Ton zu hören.'));const target=0.89;// −1 dB
  Panels.edit(x=>{if(x.kf&&x.kf.volume&&x.kf.volume.length){const mx=Math.max(...x.kf.volume.map(k=>k[1]))||1,s=target/(pk*mx);x.kf.volume=x.kf.volume.map(([a,v])=>[a,+clamp(v*s,0,2).toFixed(3)])}else x.volume=+clamp(target/pk,0,2).toFixed(2)},true);
  const v=Math.round(clamp(target/pk,0,2)*100);Kit.toast(v>=200?t('Lautstärke auf 200 % gesetzt (lauter geht nicht).'):t('Normalisiert: Lautstärke')+' '+v+' %')};
 A.duck=async()=>{const f=selMedia();if(!f)return;const c=f.c,L=App.len(c),T0=c.start,T1=T0+L;
  const srcs=[];for(const tr of App.P.tracks){if(tr.mute)continue;for(const x of tr.clips){if(x===c||x.type!=='media'||x.mute||(x.volume??1)<0.01)continue;const m=App.media(x.mediaId);if(!hasAudio(m))continue;const xs=x.start,xe=xs+App.len(x);if(xe<=T0||xs>=T1)continue;const w=await wave(m.id);if(w)srcs.push({x,w,xs,xe})}}
  if(!srcs.length)return Kit.toast(t('Unter diesem Clip liegt kein anderer Ton (z. B. Sprache), unter den er abgesenkt werden kann.'));
  const step=0.05,thr=0.012,act=[];for(let T=T0;T<T1;T+=step){let a=0;for(const s of srcs)if(T>=s.xs&&T<s.xe)a=Math.max(a,amp(s.w,srcAt(s.x,T)));act.push(a>thr)}
  // kurze Pausen überbrücken, Sprache etwas früher/später absenken
  const hold=Math.round(0.6/step);let segs=[];let i=0;while(i<act.length){if(!act[i]){i++;continue}let j=i;let gap=0;while(j<act.length&&gap<=hold){if(act[j])gap=0;else gap++;j++}segs.push([i*step,(j-gap)*step]);i=j}
  segs=segs.filter(s=>s[1]-s[0]>=0.25);if(!segs.length)return Kit.toast(t('Im Bereich dieses Clips wurde keine Sprache gefunden.'));
  const base=c.volume??1,lv=base*Pro.duckLevel,ra=0.25,rb=0.45,k=[];const push=(a,v)=>{a=clamp(+a.toFixed(3),0,L);if(k.length&&a<=k[k.length-1][0]+1e-3){k[k.length-1][1]=Math.min(k[k.length-1][1],v);return}k.push([a,+v.toFixed(3)])};
  push(0,segs[0][0]-ra<=0?lv:base);for(const [a,b] of segs){push(a-ra,base);push(a,lv);push(b,lv);push(b+rb,base)}if(k[k.length-1][0]<L)push(L,k[k.length-1][1]);
  Panels.edit(x=>{x.kf=x.kf||{};x.kf.volume=k},true);Kit.toast(t('Musik wird unter der Sprache abgesenkt')+` (${segs.length}×). `+t('Rückgängig mit Strg+Z.'))};
 Pro.duckLevel=0.25;
 A.unduck=()=>Panels.edit(x=>{if(x.kf)delete x.kf.volume},true);

 // ---------- Schnell-Teilen (C) und Auswahl (V) ----------
 let razor=false;const setRazor=v=>{razor=v;document.body.classList.toggle('razor',v);const b=$('#razorbtn');if(b)b.classList.toggle('on',v);if(v)Kit.toast(t('Schnell-Teilen: Klick auf einen Clip teilt ihn. V oder Esc beendet.'))};
 A.razor=()=>setRazor(!razor);
 document.addEventListener('pointerdown',e=>{if(!razor||e.button!==0)return;const el=e.target.closest('.clip[data-clip]');if(!el)return;e.preventDefault();e.stopImmediatePropagation();const f=App.find(el.dataset.clip);if(!f||f.t.locked)return;
  const r=el.getBoundingClientRect(),T=f.c.start+clamp((e.clientX-r.left)/r.width,0,1)*App.len(f.c);App.t=Math.round(T*(App.P.fps||30))/(App.P.fps||30);App.sel={clip:f.c.id};Timeline.split();if(Player.seek)Player.seek(App.t)},true);
 addEventListener('keydown',e=>{const tg=e.target;if(tg&&(tg.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)))return;if(e.ctrlKey||e.metaKey||e.altKey||(sv&&!sv.hidden)||!App.P||$('#modal.show'))return;
  if(e.key==='c'||e.key==='C'){e.preventDefault();setRazor(!razor)}else if((e.key==='v'||e.key==='V'||e.key==='Escape')&&razor){e.preventDefault();setRazor(false)}});
 // Linie, wo geschnitten wird
 const rl=document.createElement('div');rl.className='razorline';document.addEventListener('pointermove',e=>{if(!razor){rl.style.display='none';return}const el=e.target.closest&&e.target.closest('.clip[data-clip]');if(!el){rl.style.display='none';return}const r=el.getBoundingClientRect();if(!rl.isConnected)document.body.appendChild(rl);rl.style.cssText=`display:block;left:${e.clientX}px;top:${r.top}px;height:${r.height}px`});

 // ---------- Audio-Mixer ----------
 A.mixer=()=>{if(!App.P)return;const trs=App.P.tracks.filter(x=>!x.subs);const row=x=>{const v=Math.round((x.vol||1)*100);const nm=x.name||t(x.kind==='audio'?'Tonspur':'Videospur');
   return`<div class="mxrow"><span class="mxn">${esc(nm)}</span><button class="btn sm ${x.mute?'on':''}" data-mxm="${x.id}">${esc(t(x.mute?'Stumm':'Ton an'))}</button><input type="range" min="1" max="200" value="${v}" data-mxv="${x.id}"><b data-mxl="${x.id}">${v} %</b></div>`};
  Panels.modal(`<div class="mhead"><h3>${esc(t('Audio-Mixer'))}</h3><button class="ib" data-close>×</button></div><div class="mbody"><p class="muted" style="font-size:12px;margin-top:0">${esc(t('Lautstärke jeder Spur insgesamt – zusätzlich zur Lautstärke der einzelnen Clips. Gilt auch beim Export.'))}</p><div class="mxlist">${trs.map(row).join('')}</div></div><div class="mfoot"><button class="btn primary" data-close>${esc(t('Fertig'))}</button></div>`);
  const box=$('#mbox');let old=null;
  box.oninput=e=>{const s=e.target.closest('[data-mxv]');if(!s)return;const tr=App.track(s.dataset.mxv);if(!tr)return;if(old==null)old=tr.vol||1;tr.vol=+s.value/100;box.querySelector(`[data-mxl="${tr.id}"]`).textContent=s.value+' %';Player.sync&&Player.sync(true)};
  box.onchange=e=>{const s=e.target.closest('[data-mxv]');if(!s)return;const tr=App.track(s.dataset.mxv);if(!tr)return;const v=+s.value/100;tr.vol=old??tr.vol;old=null;App.change(()=>{const x=App.track(tr.id);x.vol=v===1?undefined:v},true)};
  box.onclick=e=>{const b=e.target.closest('[data-mxm]');if(!b)return;App.change(()=>{const x=App.track(b.dataset.mxm);x.mute=!x.mute},true);A.mixer()}};

 // ---------- Einbau in die Oberfläche ----------
 const mount=()=>{mountVu();build();const sp=$('#tl .tlbar [data-act="split"]');if(sp&&!$('#razorbtn')){const b=document.createElement('button');b.className='ib tog';b.id='razorbtn';b.dataset.act='razor';b.title=t('Schnell-Teilen (C) – Klick auf einen Clip teilt ihn');b.innerHTML='<svg viewBox="0 0 24 24"><path d="M12 3v18" stroke-dasharray="2 2"/><path d="M5 8l4 4-4 4M19 8l-4 4 4 4"/></svg>';sp.after(b)}
  const sn=$('#snapbtn');if(sn&&!$('#mixbtn')){const b=document.createElement('button');b.className='ib';b.id='mixbtn';b.dataset.act='mixer';b.title=t('Audio-Mixer');b.innerHTML='<svg viewBox="0 0 24 24"><path d="M6 4v16M12 4v16M18 4v16"/><rect x="4" y="13" width="4" height="3" rx="1"/><rect x="10" y="7" width="4" height="3" rx="1"/><rect x="16" y="11" width="4" height="3" rx="1"/></svg>';sn.before(b)}};
 new MutationObserver(()=>{if(!vu.isConnected||!$('#razorbtn')||(sv&&!sv.isConnected))mount()}).observe(document.body,{childList:true,subtree:true});mount();
 Pro.srcOpen=open;Pro.srcClose=close;Pro.place=place;
})();
