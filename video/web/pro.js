// Videoschnitt – Profi-Funktionen: Maske, Bereich unkenntlich, Kurven, LUT (Vorschau), Stille entfernen, Beats,
// Untertitel (SRT), Export-Vorlagen. Die Berechnung beim Export macht ffmpeg (render.go).
const Pro=(()=>{const R={};const t=s=>Kit.t(s);
 // ---- Vorschau-Bearbeitung je Clip ----
 R.needs=c=>!!(c.mask||c.region||c.curves||(c.lut&&luts[c.lut])||(typeof Grade!=='undefined'&&Grade.active(c.wheels)))&&!(window.GradeBypass&&!c.mask&&!c.region);
 const luts={},lutLoading={};
 const loadLut=async p=>{if(luts[p]||lutLoading[p])return;lutLoading[p]=true;try{const r=await fetch('api/textfile?path='+encodeURIComponent(p));if(!r.ok)throw 0;luts[p]=parseCube(await r.text());Player.draw()}catch(e){Kit.toast(t('Die LUT-Datei ließ sich nicht lesen.'))}};
 const parseCube=txt=>{let N=0;const d=[];let dmin=[0,0,0],dmax=[1,1,1];for(const line of txt.split(/\r?\n/)){const l=line.trim();if(!l||l[0]==='#')continue;
   if(/^LUT_3D_SIZE/i.test(l)){N=+l.split(/\s+/)[1];continue}if(/^DOMAIN_MIN/i.test(l)){dmin=l.split(/\s+/).slice(1).map(Number);continue}if(/^DOMAIN_MAX/i.test(l)){dmax=l.split(/\s+/).slice(1).map(Number);continue}
   if(/^[A-Za-z]/.test(l))continue;const v=l.split(/\s+/).map(Number);if(v.length>=3)d.push(v[0],v[1],v[2])}
  if(!N||d.length<N*N*N*3)throw new Error('cube');return{N,d:new Float32Array(d),dmin,dmax}};
 // monotone Kurve (Punkte 0..1) -> Tabelle 0..255
 R.curveLUT=pts=>{const P=[...(pts||[[0,0],[1,1]])].map(([x,y])=>[x*255,y*255]).sort((a,b)=>a[0]-b[0]);const n=P.length,l=new Uint8ClampedArray(256);if(n<2){for(let i=0;i<256;i++)l[i]=i;return l}
  const dx=[],dy=[],m=[];for(let i=0;i<n-1;i++){dx[i]=Math.max(1e-6,P[i+1][0]-P[i][0]);dy[i]=(P[i+1][1]-P[i][1])/dx[i]}m[0]=dy[0];m[n-1]=dy[n-2];for(let i=1;i<n-1;i++)m[i]=dy[i-1]*dy[i]<=0?0:(dy[i-1]+dy[i])/2;
  for(let x=0;x<256;x++){if(x<=P[0][0]){l[x]=P[0][1];continue}if(x>=P[n-1][0]){l[x]=P[n-1][1];continue}let k=0;while(x>P[k+1][0])k++;const h=dx[k],tt=(x-P[k][0])/h,t2=tt*tt,t3=t2*tt;l[x]=(2*t3-3*t2+1)*P[k][1]+(t3-2*t2+tt)*h*m[k]+(-2*t3+3*t2)*P[k+1][1]+(t3-t2)*h*m[k+1]}return l};
 const curveCache=new WeakMap();
 const curveTabs=cv=>{let c=curveCache.get(cv);if(c)return c;const V=R.curveLUT(cv.v),Rr=R.curveLUT(cv.r),G=R.curveLUT(cv.g),B=R.curveLUT(cv.b);const lr=new Uint8ClampedArray(256),lg=new Uint8ClampedArray(256),lb=new Uint8ClampedArray(256);for(let i=0;i<256;i++){lr[i]=V[Rr[i]];lg[i]=V[G[i]];lb[i]=V[B[i]]}c={lr,lg,lb};curveCache.set(cv,c);return c};
 const maskCache=new Map();
 const maskCv=(M,w,h)=>{const key=JSON.stringify(M)+w+'x'+h;let m=maskCache.get(key);if(m)return m;if(maskCache.size>40)maskCache.clear();m=document.createElement('canvas');m.width=w;m.height=h;const x=m.getContext('2d');
  const cx=M.x*w,cy=M.y*h,rx=Math.max(1,M.w*w/2),ry=Math.max(1,M.h*h/2),f=Math.max(0,M.feather||0)*Math.min(rx,ry)*2;
  const shape=(c,grow)=>{c.beginPath();if(M.shape==='ellipse')c.ellipse(cx,cy,Math.max(.5,rx+grow),Math.max(.5,ry+grow),0,0,Math.PI*2);else c.rect(cx-rx-grow,cy-ry-grow,(rx+grow)*2,(ry+grow)*2)};
  if(f<1){x.fillStyle='#fff';shape(x,0);x.fill()}else{const steps=12;for(let i=0;i<steps;i++){const g=f/2-f*i/(steps-1);x.globalAlpha=1/steps*1.0;x.fillStyle='#fff';shape(x,g);x.fill()}x.globalAlpha=1}
  if(M.invert){const t2=document.createElement('canvas');t2.width=w;t2.height=h;const y=t2.getContext('2d');y.fillStyle='#fff';y.fillRect(0,0,w,h);y.globalCompositeOperation='destination-out';y.drawImage(m,0,0);m=t2}
  maskCache.set(key,m);return m};
 R.process=(c,cv,x,w,h)=>{
  if(c.region){const g=c.region,rw=Math.max(2,g.w*w),rh=Math.max(2,g.h*h),rx=Math.max(0,Math.min(w-rw,(g.x-g.w/2)*w)),ry=Math.max(0,Math.min(h-rh,(g.y-g.h/2)*h));
   const n=g.mode==='pixel'?Math.max(2,(g.amt||.5)*40):Math.max(2,(g.amt||.5)*Math.min(rw,rh)/3);const s=document.createElement('canvas');s.width=Math.max(1,Math.round(rw/n));s.height=Math.max(1,Math.round(rh/n));
   const sx=s.getContext('2d');sx.imageSmoothingQuality='high';sx.drawImage(cv,rx,ry,rw,rh,0,0,s.width,s.height);x.save();x.imageSmoothingEnabled=g.mode!=='pixel';x.imageSmoothingQuality='high';x.drawImage(s,rx,ry,rw,rh);x.restore()}
  const L=c.lut&&luts[c.lut];if(c.lut&&!luts[c.lut])loadLut(c.lut);
  const BY=!!window.GradeBypass,WH=!BY&&typeof Grade!=='undefined'&&Grade.active(c.wheels);if(!BY&&(c.curves||L||WH)){const id=x.getImageData(0,0,w,h),p=id.data;if(WH)Grade.apply(c.wheels,p);const C=c.curves?curveTabs(c.curves):null;
   if(C)for(let i=0;i<p.length;i+=4){p[i]=C.lr[p[i]];p[i+1]=C.lg[p[i+1]];p[i+2]=C.lb[p[i+2]]}
   if(L){const N=L.N,d=L.d,s=(N-1)/255;for(let i=0;i<p.length;i+=4){const ri=Math.round(p[i]*s),gi=Math.round(p[i+1]*s),bi=Math.round(p[i+2]*s);const k=(bi*N*N+gi*N+ri)*3;p[i]=d[k]*255;p[i+1]=d[k+1]*255;p[i+2]=d[k+2]*255}}
   x.putImageData(id,0,0)}
  if(c.mask){x.save();x.globalCompositeOperation='destination-in';x.drawImage(maskCv(c.mask,w,h),0,0);x.restore()}};
 // ---- Hilfen ----
 const selClip=()=>{const f=App.sel&&App.sel.clip&&App.find(App.sel.clip);if(!f){Kit.toast(t('Wähle zuerst einen Clip aus.'));return null}return f};
 const mediaClip=()=>{const f=selClip();if(!f)return null;if(f.c.type!=='media'){Kit.toast(t('Das geht nur mit Video- oder Ton-Clips.'));return null}return f};
 const busy=async(txt,fn)=>{Panels.modal(`<div class="mbody" style="text-align:center;padding:30px"><div class="spin" style="margin:0 auto 14px"></div><b>${Kit.esc(t(txt))}</b></div>`);Panels.locked=true;try{return await fn()}finally{Panels.locked=false;Panels.close()}};
 // ---- Kurven-Editor ----
 const curvesDlg=()=>{const f=selClip();if(!f)return;const c=f.c;const cur=JSON.parse(JSON.stringify(c.curves||{v:[[0,0],[1,1]],r:[[0,0],[1,1]],g:[[0,0],[1,1]],b:[[0,0],[1,1]]}));let ch='v',dragI=-1;const snap=JSON.stringify(App.P.tracks);
  Panels.modal(`<div class="mhead"><h3>${t('Kurven')}</h3></div><div class="mbody"><div class="seg" id="cch" style="margin-bottom:8px">${[['v','Helligkeit'],['r','Rot'],['g','Grün'],['b','Blau']].map(([k,n],i)=>`<button class="btn ${i?'':'on'}" data-ch="${k}">${t(n)}</button>`).join('')}</div>
   <canvas id="ccv" width="460" height="460" style="display:block;margin:0 auto;width:min(100%,52vh);aspect-ratio:1;border-radius:8px;background:#111;cursor:crosshair;touch-action:none"></canvas><p class="muted" style="font-size:12px">${t('Klicken = Punkt setzen, ziehen = verschieben, Doppelklick = Punkt löschen.')}</p></div>
   <div class="mfoot"><button class="btn" data-cc="reset">${t('Zurücksetzen')}</button><div class="sp"></div><button class="btn" data-cc="no">${t('Abbrechen')}</button><button class="btn primary" data-cc="ok">${t('OK')}</button></div>`);Panels.locked=true;
  const cv=document.getElementById('ccv'),x=cv.getContext('2d'),W=cv.width;
  const draw=()=>{x.clearRect(0,0,W,W);x.strokeStyle='#ffffff22';for(let i=1;i<4;i++){x.beginPath();x.moveTo(i*W/4,0);x.lineTo(i*W/4,W);x.moveTo(0,i*W/4);x.lineTo(W,i*W/4);x.stroke()}
   const l=R.curveLUT(cur[ch]);x.strokeStyle={v:'#fff',r:'#f55',g:'#5f5',b:'#58f'}[ch];x.lineWidth=2;x.beginPath();for(let i=0;i<256;i++){const px=i*W/255,py=W-l[i]*W/255;i?x.lineTo(px,py):x.moveTo(px,py)}x.stroke();
   for(const [a,b] of cur[ch]){x.beginPath();x.arc(a*W,W-b*W,6,0,7);x.fillStyle='#fff';x.fill()}};
  const live=()=>{c.curves=JSON.parse(JSON.stringify(cur));Player.draw()};
  const pos=e=>{const r=cv.getBoundingClientRect();return[Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,1-(e.clientY-r.top)/r.height))]};
  cv.onpointerdown=e=>{const [a,b]=pos(e);const P=cur[ch];let i=P.findIndex(([px,py])=>Math.hypot(px-a,py-b)<.03);if(i<0){P.push([a,b]);P.sort((p,q)=>p[0]-q[0]);i=P.findIndex(p=>p[0]===a)}dragI=i;cv.setPointerCapture(e.pointerId);draw();live()};
  cv.onpointermove=e=>{if(dragI<0)return;const [a,b]=pos(e);const P=cur[ch];P[dragI]=[a,b];P.sort((p,q)=>p[0]-q[0]);dragI=P.findIndex(p=>p[0]===a&&p[1]===b);draw();live()};
  cv.onpointerup=()=>{dragI=-1};
  cv.ondblclick=e=>{const [a,b]=pos(e);const P=cur[ch];const i=P.findIndex(([px,py])=>Math.hypot(px-a,py-b)<.03);if(i>=0&&P.length>2){P.splice(i,1);draw();live()}};
  document.getElementById('mbox').onclick=e=>{const b=e.target.closest('[data-ch]');if(b){ch=b.dataset.ch;document.querySelectorAll('#cch .btn').forEach(x2=>x2.classList.toggle('on',x2===b));draw();return}
   const a=e.target.closest('[data-cc]');if(!a)return;const k=a.dataset.cc;if(k==='reset'){cur[ch]=[[0,0],[1,1]];draw();live();return}
   Panels.locked=false;Panels.close();if(k==='no'){App.P.tracks=JSON.parse(snap);App.sel={clip:c.id};Player.sync(true);return}
   const f2=App.find(c.id);if(f2){App.P.tracks=JSON.parse(snap);App.change(()=>{const g=App.find(c.id);g.c.curves=JSON.parse(JSON.stringify(cur))},true);Panels.props()}};
  draw()};
 // ---- Stille herausschneiden ----
 const silence=async()=>{const f=mediaClip();if(!f)return;const c=f.c,m=App.media(c.mediaId);if(!m||!(m.kind==='audio'||m.hasAudio))return Kit.toast(t('Dieser Clip hat keinen Ton.'));
  let db=-35,minD=.5,pad=.1;
  Panels.modal(`<div class="mhead"><h3>${t('Stille herausschneiden')}</h3></div><div class="mbody"><p class="muted">${t('Leise Stellen werden aus dem Clip entfernt, die Teile rücken zusammen.')}</p>
   <div class="fld"><label><span>${t('Als leise gilt unter')}</span><b id="sdbv">${db} dB</b></label><input type="range" id="sdb" min="-60" max="-15" step="1" value="${db}"></div>
   <div class="fld"><label><span>${t('Mindestens so lange still')}</span><b id="sdv">${minD} s</b></label><input type="range" id="sd" min="0.2" max="3" step="0.1" value="${minD}"></div>
   <div class="fld"><label><span>${t('Rand stehen lassen')}</span><b id="spv">${pad} s</b></label><input type="range" id="sp" min="0" max="0.5" step="0.02" value="${pad}"></div></div>
   <div class="mfoot"><button class="btn" data-close>${t('Abbrechen')}</button><button class="btn primary" id="sgo">${t('Herausschneiden')}</button></div>`);
  const mb=document.getElementById('mbox');mb.oninput=e=>{if(e.target.id==='sdb'){db=+e.target.value;document.getElementById('sdbv').textContent=db+' dB'}if(e.target.id==='sd'){minD=+e.target.value;document.getElementById('sdv').textContent=minD+' s'}if(e.target.id==='sp'){pad=+e.target.value;document.getElementById('spv').textContent=pad+' s'}};
  mb.onclick=async e=>{if(!e.target.closest('#sgo'))return;Panels.close();
   let sil;try{sil=(await busy('Ton wird analysiert …',()=>api(`api/silence?id=${App.P.id}&m=${m.id}&db=${db}&d=${minD}`))).silence||[]}catch(x){return Kit.toast(x.message)}
   const a=c.in,b=c.out;const keep=[];let p=a;for(const [s0,s1] of sil){const s=Math.max(a,s0+pad),e2=Math.min(b,s1-pad);if(e2<=s||e2<=a||s>=b)continue;if(s-p>.15)keep.push([p,s]);p=Math.max(p,e2)}if(b-p>.15)keep.push([p,b]);
   if(keep.length===1&&keep[0][0]===a&&keep[0][1]===b)return Kit.toast(t('Keine Stille gefunden.'));if(!keep.length)return Kit.toast(t('Der ganze Clip ist still.'));
   const sp=c.speed||1,oldL=App.len(c),end0=c.start+oldL;
   App.change(()=>{const tr=f.t;const i=tr.clips.indexOf(c);tr.clips.splice(i,1);let cur=c.start;const nc=keep.map(([s,e2])=>{const n=JSON.parse(JSON.stringify(c));n.id=uid();n.in=s;n.out=e2;n.start=cur;n.fadeIn=0;n.fadeOut=0;delete n.transIn;delete n.kf;cur+=(e2-s)/sp;return n});
    const removed=end0-cur;for(const o of tr.clips)if(o.start>=end0-1e-3)o.start=Math.max(0,o.start-removed);tr.clips.push(...nc);App.sel={clip:nc[0].id}});
   Kit.toast(t('Stille entfernt:')+' '+(keep.length-1+(keep[0][0]>a?1:0))+' '+t('Stellen'))}};
 // ---- Beats als Marker ----
 const beats=async()=>{const f=mediaClip();if(!f)return;const c=f.c,m=App.media(c.mediaId);if(!m||!(m.kind==='audio'||m.hasAudio))return Kit.toast(t('Dieser Clip hat keinen Ton.'));
  let bs;try{bs=(await busy('Beats werden gesucht …',()=>api(`api/beats?id=${App.P.id}&m=${m.id}`))).beats||[]}catch(x){return Kit.toast(x.message)}
  const sp=c.speed||1;const ms=App.P.markers||(App.P.markers=[]);let n=0;
  for(const b of bs){if(b<c.in||b>c.out)continue;const tt=c.start+(c.reverse?(c.out-b):(b-c.in))/sp;if(ms.some(x=>Math.abs(x.t-tt)<.05))continue;ms.push({id:uid(),t:tt,color:'#ffd23f',name:'Beat'});n++}
  App.save();Timeline.render();Kit.toast(n+' '+t('Beat-Marker gesetzt. Clips rasten beim Ziehen daran ein.'))};
 // ---- Untertitel (SRT) ----
 const parseTime=s=>{const m=/(\d+):(\d+):(\d+)[,.](\d+)/.exec(s);return m?(+m[1])*3600+(+m[2])*60+(+m[3])+(+m[4])/1000:0};
 const fmtT=v=>{const ms=Math.round(v*1000),h=Math.floor(ms/3600000),mi=Math.floor(ms/60000)%60,se=Math.floor(ms/1000)%60,r=ms%1000;return`${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}:${String(se).padStart(2,'0')},${String(r).padStart(3,'0')}`};
 R.parseSRT=txt=>{const out=[];for(const block of txt.replace(/\r/g,'').split(/\n\s*\n/)){const ls=block.trim().split('\n');const ti=ls.findIndex(l=>l.includes('-->'));if(ti<0)continue;const [a,b]=ls[ti].split('-->');const text=ls.slice(ti+1).join('\n').replace(/<[^>]+>/g,'').trim();if(text)out.push({s:parseTime(a),e:parseTime(b),text})}return out};
 R.subTrack=()=>App.P.tracks.find(tr=>tr.kind==='video'&&tr.subs);
 R.addSubs=(list)=>{App.change(()=>{let tr=R.subTrack();if(!tr){tr={id:uid(),kind:'video',name:t('Untertitel'),subs:true,clips:[]};App.P.tracks.unshift(tr)}
   for(const u of list){tr.clips=tr.clips.filter(o=>o.start+App.len(o)<=u.s+1e-3||o.start>=u.e-1e-3);tr.clips.push(App.newClip({type:'text',start:u.s,dur:Math.max(.2,u.e-u.s),y:.36,name:u.text.slice(0,30),fadeIn:0,fadeOut:0,
    text:{content:u.text,font:'Arial',size:.055,color:'#ffffff',box:'',outline:.9,ocolor:'#000000',shadow:true,bold:true,align:'center'}}))}})};
 const srtLoad=async()=>{const p=await Kit.pick('file','Untertitel|*.srt;*.vtt');if(!p[0])return;try{const r=await fetch('api/textfile?path='+encodeURIComponent(p[0]));if(!r.ok)throw new Error(t('Die Datei ließ sich nicht lesen.'));const list=R.parseSRT(await r.text());if(!list.length)return Kit.toast(t('In der Datei wurden keine Untertitel gefunden.'));R.addSubs(list);Kit.toast(list.length+' '+t('Untertitel eingefügt.'))}catch(x){Kit.toast(x.message)}};
 const srtSave=async()=>{const tr=R.subTrack();let cl=tr?tr.clips:[];if(!cl.length)cl=App.P.tracks.flatMap(x=>x.clips.filter(c=>c.type==='text'));if(!cl.length)return Kit.toast(t('Es gibt keine Texte, die als Untertitel gespeichert werden können.'));
  cl=[...cl].sort((a,b)=>a.start-b.start);const txt=cl.map((c,i)=>`${i+1}\n${fmtT(c.start)} --> ${fmtT(c.start+App.len(c))}\n${c.text.content}\n`).join('\n');
  const d=await Kit.pick('folder');if(!d[0])return;try{const r=await api('api/srt/save',{Dir:d[0],Name:App.P.name,Content:txt});Kit.toast(t('Gespeichert:')+' '+r.path)}catch(x){Kit.toast(x.message)}};
 // ---- Aktionen ----
 R.ACTS={curves:curvesDlg,curvesoff:()=>Panels.edit(c=>{delete c.curves},true),
  lut:async()=>{const f=mediaClip();if(!f)return;const p=await Kit.pick('file','LUT|*.cube');if(!p[0])return;delete luts[p[0]];delete lutLoading[p[0]];await loadLut(p[0]);if(!luts[p[0]])return;Panels.edit(c=>{c.lut=p[0]},true)},
  lutoff:()=>Panels.edit(c=>{delete c.lut},true),silence,beats,srtload:srtLoad,srtsave:srtSave};
 R.luts=luts;
 return R})();
