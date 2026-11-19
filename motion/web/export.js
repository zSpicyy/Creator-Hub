// Export (Renderliste): Bild für Bild im Browser rendern, ffmpeg setzt Video und Ton zusammen.
const Export=(()=>{const X={};const S={fmt:'mp4',range:'work',scale:1,q:2,alpha:false,audio:true,dir:''};
 const FMT=[['mp4','MP4 (H.264) – für YouTube, Social Media'],['mov','MOV (ProRes 4444) – mit Transparenz, für Schnittprogramme'],['webm','WebM (VP9) – mit Transparenz, fürs Web'],['gif','GIF – animiertes Bild'],['png','PNG-Sequenz – Einzelbilder mit Transparenz']];
 const ALPHA={mov:1,webm:1,gif:1,png:1};
 const r2=v=>Math.round(v*100)/100;
 // Tonspuren sammeln (auch aus Vorkompositionen)
 const audioList=(comp,a,b)=>{const out=[];const walk=(c,off,t0,t1,depth,mute)=>{for(const l of c.layers){if(depth>8)return;const m=mute||l.hidden;
   if(l.type==='comp'){const s=M.compById(l.comp);if(s)walk(s,off+(l.st||0),Math.max(t0,off+l.in),Math.min(t1,off+l.out),depth+1,m);continue}
   if((l.type!=='audio'&&l.type!=='video')||m)continue;const md=M.media[l.asset];if(l.type==='video'&&md&&md.el&&md.el.mozHasAudio===false)continue;
   const s=Math.max(t0,off+l.in),e=Math.min(t1,off+l.out);if(e-s<1/120)continue;const vol=(typeof l.vol?.v==='number'?l.vol.v:100)/100;if(vol<=0)continue;
   out.push({asset:l.asset,at:s-a,in:Math.max(0,(s-off-(l.st||0))*(l.speed||1)),dur:e-s,vol})}};walk(comp,0,a,b,0,false);return out};
 X.dlg=async()=>{const c=App.comp();if(!c)return;if(E.playing)App.pause();try{E.S=await Kit.api('api/state')}catch(e){}if(!S.dir)S.dir=E.S?.exportDir||'';const name=(E.doc?.name||'Animation')+(E.proj.comps.length>1?' - '+c.name:'');
  const draw=()=>{const [wa,wb]=App.work();const a=S.range==='work'?wa:0,b=S.range==='work'?wb:c.dur;const fr=Math.max(1,Math.round((b-a)*c.fps));const W=Math.round(c.w*S.scale/2)*2,H=Math.round(c.h*S.scale/2)*2;const au=audioList(c,a,b);const eng=E.S?.engine||{};
   Panels.open(`<h3>${esc(t('Exportieren'))}</h3><div class="form">
    <label>${esc(t('Dateiname'))}<input id="exn" value="${esc(X.lastName||name)}"></label>
    <label>${esc(t('Format'))}<select id="exf">${FMT.map(([v,n])=>`<option value="${v}" ${S.fmt===v?'selected':''}>${esc(t(n))}</option>`).join('')}</select></label>
    <div class="row2"><label>${esc(t('Bereich'))}<select id="exr"><option value="work" ${S.range==='work'?'selected':''}>${esc(t('Arbeitsbereich'))} (${fmtT(wa,c.fps)} – ${fmtT(wb,c.fps)})</option><option value="all" ${S.range==='all'?'selected':''}>${esc(t('Ganze Komposition'))}</option></select></label>
     <label>${esc(t('Größe'))}<select id="exs">${[[1,'100 %'],[.75,'75 %'],[.5,'50 %'],[.25,'25 %'],[2,'200 %']].map(([v,n])=>`<option value="${v}" ${S.scale==v?'selected':''}>${n}</option>`).join('')}</select></label></div>
    ${S.fmt==='mp4'?`<label>${esc(t('Qualität'))}<select id="exq">${[[3,'Sehr hoch (große Datei)'],[2,'Hoch'],[1,'Mittel (kleine Datei)']].map(([v,n])=>`<option value="${v}" ${S.q==v?'selected':''}>${esc(t(n))}</option>`).join('')}</select></label>`:''}
    ${ALPHA[S.fmt]?`<label class="ck"><input type="checkbox" id="exa" ${S.alpha?'checked':''}> ${esc(t('Transparenter Hintergrund (ohne Kompositionsfarbe)'))}</label>`:''}
    ${S.fmt!=='gif'&&S.fmt!=='png'?`<label class="ck"><input type="checkbox" id="exau" ${S.audio?'checked':''} ${au.length?'':'disabled'}> ${esc(au.length?t('Ton mit exportieren')+` (${au.length} ${t(au.length===1?'Spur':'Spuren')})`:t('Kein Ton in dieser Komposition'))}</label>`:''}
    <label>${esc(t('Speicherort'))}<span class="pathrow"><input id="exd" value="${esc(S.dir)}" spellcheck="false"><button class="btn" id="exdir">${esc(t('Ändern …'))}</button></span></label>
    <p class="hint">${W} × ${H} · ${c.fps} fps · ${fr} ${esc(t('Bilder'))} · ${r2(fr/c.fps)} s${S.fmt==='gif'&&W*H>1280*720?' · '+esc(t('Tipp: Für GIFs 50 % oder kleiner wählen.')):''}</p>
    ${eng.ready?'':`<div class="warn">${esc(eng.error?t('ffmpeg konnte nicht geladen werden:')+' '+eng.error:t('ffmpeg (für den Export) wird gerade geladen …'))} ${eng.error?`<button class="btn sm" id="exeng">${esc(t('Erneut versuchen'))}</button>`:''}</div>`}
   </div>${`<div class="mfoot"><button class="btn" data-mclose>${esc(t('Abbrechen'))}</button><button class="btn primary" id="exgo" ${eng.ready?'':'disabled'}>${esc(t('Rendern'))}</button></div>`}`);
   const rd=()=>{S.fmt=$('#exf').value;S.range=$('#exr').value;S.scale=+$('#exs').value;if($('#exq'))S.q=+$('#exq').value;if($('#exa'))S.alpha=$('#exa').checked;if($('#exau'))S.audio=$('#exau').checked;S.dir=$('#exd').value.trim();X.lastName=$('#exn').value};
   $('#mbox').onchange=e=>{rd();if(['exf','exr','exs'].includes(e.target.id))draw()};$('#mbox').onkeydown=e=>e.stopPropagation();
   $('#mbox').querySelector('[data-mclose]').onclick=Panels.close;
   $('#exdir').onclick=async()=>{const p=await Kit.pick('folder');if(p&&p[0]){S.dir=p[0];$('#exd').value=p[0]}};
   const en=$('#exeng');if(en)en.onclick=async()=>{try{await Kit.api('api/engine/install',{})}catch(e){}poll()};
   $('#exgo').onclick=()=>{rd();run(c,a,b,fr,W,H,S.audio&&S.fmt!=='gif'&&S.fmt!=='png'?au:[])};
   if(!eng.ready)poll()};
  let pt=0;const poll=()=>{clearTimeout(pt);pt=setTimeout(async()=>{if(!$('#exgo'))return;try{E.S=await Kit.api('api/state')}catch(e){}if(E.S?.engine?.ready||E.S?.engine?.error){if($('#exgo'))draw()}else poll()},1500)};
  draw()};
 const run=async(c,a,b,frames,W,H,audio)=>{let job;try{job=await Kit.api('api/render/start',{ID:E.doc.id,Name:$('#exn').value.trim(),Dir:S.dir,Format:S.fmt,FPS:c.fps,Frames:frames,Audio:audio,Quality:S.q})}catch(e){return Kit.toast(e.message)}
  let cancel=false;Panels.busy=true;const t0=performance.now();
  Panels.open(`<h3>${esc(t('Wird exportiert …'))}</h3><div class="prog"><div class="pbar"><i id="exbar"></i></div><div class="pinfo"><span id="exn2">0 / ${frames}</span><span id="exeta"></span></div><canvas id="exprev"></canvas></div><div class="mfoot"><button class="btn" id="excancel">${esc(t('Abbrechen'))}</button></div>`);
  $('#excancel').onclick=()=>{cancel=true;$('#excancel').disabled=true};
  const pv=$('#exprev');const pk=Math.min(1,320/W);pv.width=Math.round(W*pk);pv.height=Math.round(H*pk);const px=pv.getContext('2d');
  const scale=Math.min(W/c.w,H/c.h);const out=document.createElement('canvas');out.width=W;out.height=H;const ox=out.getContext('2d');
  const toBlob=cv=>new Promise(r=>cv.toBlob(r,'image/png'));let ok=false,err=null;const wasT=E.time;
  try{let pending=null;for(let i=0;i<frames;i++){if(cancel)break;const ct=a+i/c.fps;await M.waitVideos(c,ct);const cv=M.render(c,ct,scale,{noSync:true,transparent:S.alpha&&ALPHA[S.fmt],export:true});ox.clearRect(0,0,W,H);ox.drawImage(cv,0,0);M.putCv(cv);
    const blob=await toBlob(out);if(pending)await pending;pending=fetch(`api/render/frame?job=${job.job}`,{method:'POST',body:blob}).then(async r=>{if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||j.message||r.statusText)}});
    if(i%3===0||i===frames-1){px.clearRect(0,0,pv.width,pv.height);px.drawImage(out,0,0,pv.width,pv.height);const p=(i+1)/frames;$('#exbar').style.width=(p*100).toFixed(1)+'%';$('#exn2').textContent=`${i+1} / ${frames}`;const el=(performance.now()-t0)/1000;if(i>5)$('#exeta').textContent=t('noch etwa')+' '+Math.max(1,Math.round(el/p-el))+' s'}}
   if(pending)await pending;ok=!cancel}catch(e){err=e}
  try{if(ok){$('#exn2').textContent=t('Video wird fertiggestellt …');const r=await Kit.api(`api/render/finish?job=${job.job}`,{});Panels.busy=false;done(r.path)}else{await Kit.api(`api/render/finish?job=${job.job}&cancel=1`,{}).catch(()=>{});Panels.busy=false;Panels.close();Kit.toast(err?err.message:t('Export abgebrochen.'))}}
  catch(e){Panels.busy=false;Panels.close();Kit.toast(e.message)}App.setTime(wasT)};
 const done=path=>{Panels.open(`<h3>${esc(t('Export fertig'))}</h3><p>${esc(t('Gespeichert unter:'))}</p><p class="path">${esc(path)}</p><div class="mfoot"><button class="btn" id="excopy">${esc(t('Pfad kopieren'))}</button><button class="btn primary" data-mok>OK</button></div>`);
  $('#mbox').querySelector('[data-mok]').onclick=Panels.close;$('#excopy').onclick=()=>{navigator.clipboard?.writeText(path).then(()=>Kit.toast(t('Kopiert.'))).catch(()=>{})}};
 X.still=async()=>{const c=App.comp();if(!c)return;await M.waitVideos(c,E.time);const cv=M.render(c,E.time,1,{noSync:true});const W=Math.ceil(c.w),H=Math.ceil(c.h);const out=document.createElement('canvas');out.width=W;out.height=H;out.getContext('2d').drawImage(cv,0,0);M.putCv(cv);
  const blob=await new Promise(r=>out.toBlob(r,'image/png'));const name=`${(E.doc?.name||'Bild').replace(/[\\/:*?"<>|]/g,'-')} ${fmtT(E.time,c.fps).replace(/:/g,'-')}.png`;
  try{const r=await fetch(`api/still?name=${encodeURIComponent(name)}`,{method:'POST',body:blob});const j=await r.json();if(!r.ok)throw new Error(j.error||j.message||'Fehler');Kit.toast(t('Einzelbild gespeichert:')+' '+j.path)}catch(e){Kit.toast(e.message)}};
 return X})();
