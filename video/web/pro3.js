// Videoschnitt – KI-Funktionen (offline): Hintergrund entfernen, automatische Untertitel, automatisch ins Hochformat.
(()=>{const t=s=>Kit.t(s),A=Pro.ACTS;
 const one=()=>{const f=App.sel&&App.sel.clip&&App.find(App.sel.clip);if(!f)Kit.toast(t('Wähle zuerst einen Clip aus.'));return f};
 const sleep=ms=>new Promise(z=>setTimeout(z,ms));
 const prog=(title,onCancel)=>{Panels.modal(`<div class="mhead"><h3>${Kit.esc(t(title))}</h3></div><div class="mbody"><div class="bar2"><i id="p3bar" style="width:0%"></i></div><p class="muted" id="p3txt" style="font-size:12px;margin-top:8px"></p></div><div class="mfoot"><div class="sp"></div><button class="btn" id="p3cancel">${t('Abbrechen')}</button></div>`);Panels.locked=true;
  document.getElementById('p3cancel').onclick=()=>onCancel&&onCancel();return(p,txt)=>{const b=document.getElementById('p3bar');if(b)b.style.width=Math.round(p*100)+'%';const x=document.getElementById('p3txt');if(x&&txt!=null)x.textContent=txt}};
 const endProg=()=>{Panels.locked=false;Panels.close()};
 // KI-Modell einmalig laden (fragt vorher)
 const MODELS={matte:['Hintergrund entfernen','MODNet',26],whisper:['Spracherkennung','Whisper',80]};
 const ensure=async m=>{let st=await api('api/ai/state?m='+m);if(st.ready)return true;const [n,mn,mb]=MODELS[m];
  const ok=await new Promise(res=>{Panels.modal(`<div class="mhead"><h3>${t('KI einmalig einrichten')}</h3></div><div class="mbody"><p>${t('Für')} <b>${t(n)}</b> ${t('lädt die App einmalig ein KI-Modell')} (${mn}, ${t('etwa')} ${mb} MB${st.ready===false?' '+t('plus KI-Laufzeit, falls noch nicht vorhanden'):''}).</p><p class="muted">${t('Danach läuft alles offline auf deinem Rechner. Deine Videos verlassen den Rechner nicht.')}</p></div>
   <div class="mfoot"><button class="btn" id="aino">${t('Abbrechen')}</button><button class="btn primary" id="aiyes">${t('Laden')}</button></div>`);Panels.locked=true;
   document.getElementById('aino').onclick=()=>{endProg();res(false)};document.getElementById('aiyes').onclick=()=>{endProg();res(true)}});
  if(!ok)return false;let stop=false;const up=prog('KI wird eingerichtet …',()=>{stop=true});
  try{st=await api('api/ai/install?m='+m,{});while(!stop){await sleep(600);st=await api('api/ai/state?m='+m);up(st.done||0,t(st.step||''));if(st.ready){endProg();return true}if(!st.loading&&st.error){endProg();Kit.toast(st.error);return false}}}catch(e){Kit.toast(e.message)}
  endProg();return false};
 // Auf einen KI-Auftrag warten
 const waitJob=async(key,title)=>{let stop=false;const up=prog(title,()=>{stop=true;api('api/ai/cancel?key='+key,{}).catch(()=>{})});let j;
  for(;;){await sleep(500);try{j=await api('api/ai/job?key='+encodeURIComponent(key))}catch(e){continue}if(!j.running)break;up(j.done||0,(j.step?t(j.step)+' · ':'')+Math.round((j.done||0)*100)+' %')}
  endProg();if(j.error){if(j.error!=='stop'&&j.error!=='Abgebrochen')Kit.toast(t(j.error));return null}return j};

 // ---------- Hintergrund entfernen ----------
 const baseNeeds=Pro.needs;Pro.needs=c=>baseNeeds(c)||!!c.matte;
 const mats=new Map();
 const matteEl=c=>{const k=c.mediaId+'|'+c.matte;let v=mats.get(k);if(!v){v=document.createElement('video');v.muted=true;v.preload='auto';v.playsInline=true;v.src=`api/ai/file?id=${App.P.id}&m=${c.mediaId}&v=${encodeURIComponent(c.matte.slice(-12))}`;v.addEventListener('seeked',()=>Player.draw());v.addEventListener('loadeddata',()=>Player.draw());mats.set(k,v)}return v};
 const tmpM=document.createElement('canvas');const tmx=tmpM.getContext('2d',{willReadFrequently:true});
 const base2=Pro.process;
 Pro.process=(c,cv,x,w,h,e,m)=>{base2(c,cv,x,w,h,e,m);if(!c.matte)return;const v=matteEl(c);
  if(e&&e.tagName==='VIDEO'){const target=e.currentTime;if(!e.paused){v._want=undefined;if(v.paused)v.play().catch(()=>{});if(Math.abs(v.currentTime-target)>.25)v.currentTime=target}else{if(!v.paused)v.pause();if(v._want===undefined||Math.abs(v._want-target)>.001){v._want=target;v.currentTime=target}}}
  else if(v.readyState>=1&&v._want!==0){v._want=0;v.currentTime=0}
  if(v.readyState<2)return;const vw=v.videoWidth,vh=v.videoHeight;if(tmpM.width!==w||tmpM.height!==h){tmpM.width=w;tmpM.height=h}
  const kw=Math.max(.05,1-(c.cropL||0)-(c.cropR||0)),kh=Math.max(.05,1-(c.cropT||0)-(c.cropB||0));tmx.drawImage(v,vw*(c.cropL||0),vh*(c.cropT||0),vw*kw,vh*kh,0,0,w,h);
  const md=tmx.getImageData(0,0,w,h).data,id=x.getImageData(0,0,w,h),d=id.data;for(let i=3;i<d.length;i+=4)d[i]=d[i]*md[i-3]/255;x.putImageData(id,0,0)};
 A.matte=async()=>{const f=one();if(!f)return;const c=f.c,m=App.media(c.mediaId);if(c.type!=='media'||!m||!(m.kind==='video'||m.kind==='image'))return Kit.toast(t('Das geht nur mit Videos und Bildern.'));
  if(!App.S.engine.ready)return Kit.toast(t('Dafür fehlt noch ffmpeg. Richte es im Startfenster einmalig ein.'));
  if(!await ensure('matte'))return;let r;try{r=await api('api/ai/matte',{id:App.P.id,m:m.id})}catch(e){return Kit.toast(e.message)}
  let out=r.out;if(!r.ready){const j=await waitJob(r.key,'Hintergrund wird entfernt …');if(!j)return;out=j.out}
  App.change(()=>{const g=App.find(c.id);if(g)g.c.matte=out},true);Panels.props();Kit.toast(t('Hintergrund entfernt. Lege einen neuen Hintergrund auf eine Spur darunter.'))};
 A.matteoff=()=>Panels.edit(c=>{delete c.matte},true);

 // ---------- Automatische Untertitel ----------
 const LANGS=[['','Automatisch erkennen'],['de','Deutsch'],['en','Englisch'],['es','Spanisch'],['fr','Französisch'],['it','Italienisch'],['tr','Türkisch'],['pl','Polnisch'],['nl','Niederländisch'],['pt','Portugiesisch'],['ru','Russisch'],['uk','Ukrainisch'],['ar','Arabisch'],['ja','Japanisch'],['ko','Koreanisch'],['zh','Chinesisch']];
 A.autosubs=async()=>{let f=App.sel&&App.sel.clip&&App.find(App.sel.clip);let c=f&&f.c;
  if(!c||c.type!=='media'){// sonst: erster Clip mit Ton am Abspielkopf
   const ts=App.t;for(const tr of App.P.tracks)for(const o of tr.clips){const m=o.type==='media'&&App.media(o.mediaId);if(m&&(m.kind==='audio'||m.hasAudio)&&o.start<=ts&&o.start+App.len(o)>ts){c=o;break}}}
  const m=c&&App.media(c.mediaId);if(!c||!m||!(m.kind==='audio'||m.hasAudio))return Kit.toast(t('Wähle einen Clip mit Sprache aus.'));
  if(!App.S.engine.ready)return Kit.toast(t('Dafür fehlt noch ffmpeg. Richte es im Startfenster einmalig ein.'));
  const lang=await new Promise(res=>{let last='';try{last=localStorage.getItem('vs.sublang')||''}catch(e){}
   Panels.modal(`<div class="mhead"><h3>${t('Automatische Untertitel')}</h3></div><div class="mbody"><p class="muted">${t('Die KI hört sich den Clip an und schreibt mit. Das läuft offline auf deinem Rechner.')}</p><div class="fld"><label><span>${t('Sprache im Video')}</span></label><select id="sublang">${LANGS.map(([v,n])=>`<option value="${v}" ${v===last?'selected':''}>${t(n)}</option>`).join('')}</select></div></div>
    <div class="mfoot"><button class="btn" id="subno">${t('Abbrechen')}</button><button class="btn primary" id="subgo">${t('Untertitel erstellen')}</button></div>`);
   document.getElementById('subno').onclick=()=>{Panels.close();res(null)};document.getElementById('subgo').onclick=()=>{const v=document.getElementById('sublang').value;try{localStorage.setItem('vs.sublang',v)}catch(e){}Panels.close();res(v)}});
  if(lang===null)return;if(!await ensure('whisper'))return;
  let r;try{r=await api('api/ai/subs',{id:App.P.id,m:m.id,in:c.in,out:c.out,lang})}catch(e){return Kit.toast(e.message)}
  const j=await waitJob(r.key,'Untertitel werden erstellt …');if(!j||!j.subs)return;
  const sp=c.speed||1;const list=j.subs.map(u=>{let s=c.reverse?(c.out-u.e):(u.s-c.in),e=c.reverse?(c.out-u.s):(u.e-c.in);return{s:c.start+s/sp,e:c.start+e/sp,text:u.text}}).filter(u=>u.e>c.start&&u.s<c.start+App.len(c));
  Pro.addSubs(list);Kit.toast(list.length+' '+t('Untertitel erstellt. Text und Zeiten lassen sich wie normale Texte bearbeiten.'))};

 // ---------- Automatisch ins Hochformat (9:16) ----------
 const fileURL=m=>`api/file?id=${App.P.id}&m=${m.id}&k=play&p=${m.proxy}`;
 const loadV=m=>new Promise((ok,no)=>{const v=document.createElement('video');v.muted=true;v.preload='auto';v.playsInline=true;v.onloadeddata=()=>ok(v);v.onerror=()=>no(new Error(t('Das Video ließ sich nicht laden.')));v.src=fileURL(m)});
 const seekV=(v,s)=>new Promise(ok=>{const f=()=>{v.removeEventListener('seeked',f);ok()};v.addEventListener('seeked',f);v.currentTime=Math.max(0,Math.min(v.duration-.01,s))});
 // Wo passiert im Bild etwas? Bewegung + Kanten je Spalte, Fenster mit dem meisten Inhalt
 const analyse=async(c,m,winFrac,stopF,onP)=>{const v=await loadV(m);const AW=160,AH=Math.max(8,Math.round(AW*(m.h||9)/(m.w||16)));const cv=document.createElement('canvas');cv.width=AW;cv.height=AH;const x=cv.getContext('2d',{willReadFrequently:true});
  const sp=c.speed||1,L=App.len(c),step=.25;let prev=null;const pts=[];const ww=Math.max(1,Math.round(winFrac*AW));
  for(let lt=0;lt<=L;lt+=step){if(stopF())throw new Error('stop');await seekV(v,c.reverse?c.out-lt*sp:c.in+lt*sp);x.drawImage(v,0,0,AW,AH);const d=x.getImageData(0,0,AW,AH).data;const g=new Float32Array(AW*AH);for(let i=0,j=0;j<g.length;i+=4,j++)g[j]=d[i]*.3+d[i+1]*.59+d[i+2]*.11;
   const col=new Float32Array(AW);for(let y=1;y<AH-1;y++)for(let xx=1;xx<AW-1;xx++){const i=y*AW+xx;const ed=Math.abs(g[i+1]-g[i-1])+Math.abs(g[i+AW]-g[i-AW]);const mo=prev?Math.abs(g[i]-prev[i]):0;
    // Mitte leicht bevorzugen (Gesichter und Personen sind oft dort), oben mehr als unten
    col[xx]+=ed*.35+mo*1.6+(y<AH*.6?ed*.15:0)}
   prev=g;let s=0;for(let i=0;i<ww;i++)s+=col[i];let best=s,bi=0;for(let i=ww;i<AW;i++){s+=col[i]-col[i-ww];if(s>best){best=s;bi=i-ww+1}}
   const ctr=(bi+ww/2)/AW;pts.push([lt,ctr*0.95+.5*.05]);onP(lt/L)}
  // glätten: gleitender Mittelwert über ~1,5 s, dann ruhige Kamera (kleine Bewegungen ignorieren)
  const sm=pts.map((p,i)=>{let s=0,n=0;for(let k=Math.max(0,i-3);k<=Math.min(pts.length-1,i+3);k++){s+=pts[k][1];n++}return[p[0],s/n]});
  const out=[];let cur=sm[0]?sm[0][1]:.5;for(const [tt,v] of sm){if(Math.abs(v-cur)>winFrac*.1)cur+=(v-cur)*.7;out.push([tt,cur])}
  return out};
 A.reframe=async()=>{const P=App.P;const vids=P.tracks.filter(tr=>tr.kind==='video'&&!tr.subs).flatMap(tr=>tr.clips).filter(c=>c.type==='media'&&App.media(c.mediaId)&&['video','image'].includes(App.media(c.mediaId).kind));
  if(!vids.length)return Kit.toast(t('Es gibt keine Videos in der Zeitleiste.'));
  const ok=await new Promise(res=>{Panels.modal(`<div class="mhead"><h3>${t('Automatisch ins Hochformat')}</h3></div><div class="mbody"><p>${t('Das Projekt wird auf 9:16 (1080 × 1920) umgestellt. Die App sucht in jedem Clip, wo etwas passiert, und führt den Bildausschnitt mit.')}</p><p class="muted">${t('Tipp: Für eine Querformat-Fassung vorher „Projekt duplizieren“ im Startfenster nutzen. Die Ausschnitte lassen sich danach mit den Schlüsselbildern (Position) anpassen.')}</p></div>
   <div class="mfoot"><button class="btn" id="rfno">${t('Abbrechen')}</button><button class="btn primary" id="rfgo">${t('Umstellen')}</button></div>`);
   document.getElementById('rfno').onclick=()=>{Panels.close();res(false)};document.getElementById('rfgo').onclick=()=>{Panels.close();res(true)}});
  if(!ok)return;let stop=false;const up=prog('Bildausschnitte werden gesucht …',()=>{stop=true});const W=1080,H=1920;const res={};
  try{for(let i=0;i<vids.length;i++){const c=vids[i],m=App.media(c.mediaId);const kw=Math.max(.05,1-(c.cropL||0)-(c.cropR||0)),kh=Math.max(.05,1-(c.cropT||0)-(c.cropB||0));const mw=(m.w||1920)*kw,mh=(m.h||1080)*kh;
    const fitW=Math.min(W,H*mw/mh),fitH=fitW*mh/mw,scale=Math.max(1,H/fitH);const clipW=fitW*scale;const winFrac=Math.min(1,W/clipW);
    if(m.kind==='image'||winFrac>.98){res[c.id]={scale,path:[[0,.5]]};continue}
    const path=await analyse(c,m,winFrac,()=>stop,p=>up((i+p)/vids.length,(i+1)+' / '+vids.length));res[c.id]={scale,clipW,path}}}
  catch(e){endProg();if(e.message!=='stop')Kit.toast(e.message);return}
  endProg();P.w=W;P.h=H;
  App.change(()=>{for(const c0 of vids){const g=App.find(c0.id);if(!g)continue;const c=g.c,r=res[c.id];c.scale=+r.scale.toFixed(4);c.y=0;c.rot=0;c.kf=c.kf||{};delete c.kf.scale;delete c.kf.y;
    const lim=(r.scale-1)/2;const xs=r.path.map(([tt,cx])=>[+tt.toFixed(3),+Math.max(-lim,Math.min(lim,-(cx-.5)*r.scale)).toFixed(4)]);
    // Schlüsselbilder ausdünnen: nur wo sich etwas ändert
    const kx=[];for(const p of xs){if(kx.length>1&&Math.abs(kx[kx.length-1][1]-p[1])<1e-3&&Math.abs(kx[kx.length-2][1]-p[1])<1e-3)kx[kx.length-1]=p;else kx.push(p)}
    if(kx.length>1){c.kf.x=kx;c.kfLin=false;c.x=kx[0][1]}else{delete c.kf.x;c.x=kx[0]?kx[0][1]:0}
    if(!Object.keys(c.kf).length)delete c.kf}});
  Player.init();Panels.props();Timeline.render();Kit.toast(t('Fertig: Das Projekt ist jetzt im Hochformat 9:16.'))};
})();
