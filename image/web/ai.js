// KI (offline): Motiv freistellen als Ebenenmaske, Bild mit KI vergrößern
const AI=(()=>{const X={};const {$,api,esc}=Kit;const t=s=>Kit.t(s);
 const mk=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
 const busy=(on,txt)=>{$('#busy').hidden=!on;if(txt)$('#busyt').textContent=t(txt)};
 const sleep=ms=>new Promise(z=>setTimeout(z,ms));
 const NAMES={matte:['Freistellen','MODNet',26],upscale:['KI-Vergrößern','Real-ESRGAN',5]};
 const ensure=async m=>{let st=await api('api/ai/state?m='+m);if(st.ready)return true;const [n,mn,mb]=NAMES[m];
  const ok=await new Promise(res=>{UI.modal(`<div class="mhead"><h3>${esc(t('KI einmalig einrichten'))}</h3></div><div class="mbody"><p>${esc(t('Für'))} <b>${esc(t(n))}</b> ${esc(t('lädt die App einmalig ein KI-Modell'))} (${mn}, ${esc(t('etwa'))} ${mb} MB).</p><p class="hint">${esc(t('Danach läuft alles offline auf deinem Rechner. Deine Bilder verlassen den Rechner nicht.'))}</p></div>
   <div class="mfoot"><button class="btn" data-no>${esc(t('Abbrechen'))}</button><button class="btn primary" data-yes>${esc(t('Laden'))}</button></div>`);UI.locked=true;
   $('#mbox').onclick=e=>{if(e.target.closest('[data-no]')){UI.close();res(false)}if(e.target.closest('[data-yes]')){UI.close();res(true)}}});
  if(!ok)return false;busy(true,'KI wird eingerichtet …');
  try{await api('api/ai/install?m='+m,{});for(;;){await sleep(600);st=await api('api/ai/state?m='+m);$('#busyt').textContent=t(st.step||'KI wird eingerichtet …')+' '+Math.round((st.done||0)*100)+' %';if(st.ready){busy(false);return true}if(!st.loading&&st.error){busy(false);Kit.toast(st.error);return false}}}
  catch(e){busy(false);Kit.toast(e.message);return false}};
 const post=async(url,cv)=>{const blob=await new Promise(r=>cv.toBlob(r,'image/png'));const res=await fetch(url,{method:'POST',body:blob});if(!res.ok){let m=t('Die KI konnte das Bild nicht bearbeiten.');try{m=(await res.json()).error||m}catch(e){}throw new Error(m)}
  const bm=await createImageBitmap(await res.blob());const c=mk(bm.width,bm.height);c.getContext('2d').drawImage(bm,0,0);return c};
 // Motiv freistellen: Maske aus der KI, die Ebene selbst bleibt unverändert
 X.matte=async()=>{let L=Doc.layer();if(!L)return Kit.toast(t('Wähle zuerst eine Ebene aus.'));if(!await ensure('matte'))return;
  busy(true,'Motiv wird freigestellt …');try{if(L.type!=='pixel'){Doc._label='In Pixel umwandeln';L=Doc.rasterize(L)}const m=await post('api/ai/matte',L.cv);
   // Graustufen-Maske in der Größe der Ebene
   const mm=mk(L.cv.width,L.cv.height);const c=mm.getContext('2d');c.drawImage(m,0,0,mm.width,mm.height);
   Doc._label='KI: Motiv freistellen';Doc.begin();L.mask=mm;L.editMask=false;L.maskOff=false;Doc.changed('layers');Kit.toast(t('Motiv freigestellt. Die Maske lässt sich mit dem Pinsel nacharbeiten (Maske bearbeiten).'))}
  catch(e){Kit.toast(e.message)}busy(false)};
 // Bild mit KI vergrößern: Pixel-Ebenen über die KI, Texte und Formen bleiben scharf, weil sie neu gezeichnet werden
 X.upscale=async()=>{const d=Doc.d;const f=await new Promise(res=>{UI.modal(`<div class="mhead"><h3>${esc(t('Bild mit KI vergrößern'))}</h3></div><div class="mbody"><p class="hint">${esc(t('Die KI rechnet fehlende Details dazu. Texte und Formen bleiben gestochen scharf.'))}</p><div class="seg" style="margin-top:10px"><button class="btn" data-f="2">2× · ${d.w*2} × ${d.h*2}</button><button class="btn" data-f="4">4× · ${d.w*4} × ${d.h*4}</button></div></div><div class="mfoot"><button class="btn" data-no>${esc(t('Abbrechen'))}</button></div>`);
   $('#mbox').onclick=e=>{const b=e.target.closest('[data-f]');if(b){UI.close();res(+b.dataset.f)}if(e.target.closest('[data-no]')){UI.close();res(0)}}});
  if(!f)return;if(d.w*f>16000||d.h*f>16000||d.w*d.h*f*f>120e6)return Kit.toast(t('Das Ergebnis wäre zu groß.'));if(!await ensure('upscale'))return;
  const pix=d.layers.filter(L=>L.type==='pixel'&&L.cv);const done=new Map();
  try{for(let i=0;i<pix.length;i++){const L=pix[i];busy(true,t('KI vergrößert Ebene')+' '+(i+1)+' / '+pix.length+' …');const big=await post('api/ai/upscale',L.cv);const W=L.cv.width*f,H=L.cv.height*f;let cv=big;
    if(f!==4){cv=mk(W,H);const c=cv.getContext('2d');c.imageSmoothingQuality='high';c.drawImage(big,0,0,W,H)}let m=null;if(L.mask){m=mk(W,H);const c=m.getContext('2d');c.imageSmoothingQuality='high';c.drawImage(L.mask,0,0,W,H)}done.set(L.id,{cv,m})}}
  catch(e){busy(false);return Kit.toast(e.message)}
  Doc._label='KI: Bild vergrößern';Doc.resize(d.w*f,d.h*f);for(const L of Doc.d.layers){const r=done.get(L.id);if(!r)continue;L.cv=r.cv;if(r.m)L.mask=r.m;L.rev=(L.rev||0)+1}Doc.changed('canvas');busy(false);View.fit();Kit.toast(t('Bild mit KI vergrößert.'))};
 X.guide=()=>{const st=[['Anfangen','Wähle oben ein Format (z. B. YouTube-Thumbnail) oder ziehe ein Bild ins Fenster. PSD- und XCF-Dateien lassen sich auch öffnen.'],
  ['Werkzeuge wie in GIMP','Links sind alle Werkzeuge, darunter ihre Einstellungen. Die Tasten sind wie in GIMP: Umschalt fügt zur Auswahl hinzu, Strg zieht ab, Strg beim Malen nimmt eine Farbe auf, Umschalt+Klick zieht eine gerade Linie.'],['Teile verschieben','Einen Bereich auswählen, dann mit dem Verschieben-Werkzeug hineinklicken und ziehen. Mit Alt ziehst du eine Kopie.'],
  ['Ebenen','Jeder Text, jede Form und jedes Bild ist eine eigene Ebene. Mit Masken versteckst du Teile, ohne etwas zu löschen.'],
  ['Freistellen mit KI','Ebene → KI: Motiv freistellen. Die KI legt eine Maske an, die du mit dem Pinsel nacharbeiten kannst.'],
  ['Thumbnails','Text mit Kontur und Leuchten, Randlicht über Filter, Hintergrund weichzeichnen: alles in den Eigenschaften und unter Filter.'],
  ['Fertig machen','Exportieren als PNG, JPG, WebP, PDF, PSD und mehr. Mit Strg+Z kannst du alles rückgängig machen.']];
  UI.modal(`<div class="mhead"><h3>${esc(t('Erste Schritte'))}</h3></div><div class="mbody">${st.map(([h,x],i)=>`<div style="display:flex;gap:12px;margin-bottom:12px"><b style="flex:none;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center">${i+1}</b><div><b>${esc(t(h))}</b><div class="hint" style="font-size:13px">${esc(t(x))}</div></div></div>`).join('')}</div><div class="mfoot"><span class="grow"></span><button class="btn primary" data-gok>${esc(t('Los geht’s'))}</button></div>`);$('#mbox').onclick=e=>{if(e.target.closest('[data-gok]'))UI.close()}};
 // Motiv mit KI herauslösen: wird eigene Ebene, die man verschieben kann
 X.lift=async()=>{let L=Doc.layer();if(!L||L.type!=='pixel'){L=Doc.d.layers.find(l=>l.type==='pixel'&&l.visible!==false);if(L){Doc.sel=L.id;UI.layers()}}if(!L)return Kit.toast(t('Wähle zuerst eine Bild-Ebene aus.'));
  const how=await new Promise(res=>{UI.modal(`<div class="mhead"><h3>${esc(t('Motiv herauslösen (KI)'))}</h3></div><div class="mbody"><p class="hint">${esc(t('Die KI erkennt das Hauptmotiv (z. B. eine Person) und legt es auf eine eigene Ebene. Danach kannst du es frei verschieben, drehen und vergrößern.'))}</p></div><div class="mfoot"><button class="btn" data-h="no">${esc(t('Abbrechen'))}</button><button class="btn" data-h="copy">${esc(t('Kopieren (Original bleibt)'))}</button><button class="btn primary" data-h="cut">${esc(t('Herauslösen'))}</button></div>`);
   $('#mbox').onclick=e=>{const b=e.target.closest('[data-h]');if(b){UI.close();res(b.dataset.h)}}});
  if(how==='no')return;if(!await ensure('matte'))return;busy(true,'Motiv wird erkannt …');
  try{const m=await post('api/ai/matte',L.cv);const W=L.cv.width,H=L.cv.height;const a=mk(W,H),ac=a.getContext('2d');ac.drawImage(m,0,0,W,H);const id=ac.getImageData(0,0,W,H),p=id.data;for(let i=0;i<p.length;i+=4){p[i+3]=p[i]>40?p[i]:0;p[i]=p[i+1]=p[i+2]=255}ac.putImageData(id,0,0);
   const sm=mk(Doc.d.w,Doc.d.h),sc=sm.getContext('2d');sc.setTransform(Doc.pixMatrix(L));sc.drawImage(a,0,0);Sel.mask=sm;Sel.changed();
   const N=Tools.liftSel(how==='copy');busy(false);if(!N)return Kit.toast(t('Es wurde kein Motiv gefunden.'));
   Kit.toast(t(how==='copy'?'Motiv kopiert. Ziehe es jetzt an die gewünschte Stelle.':Tools.o.liftFill!==false?'Motiv herausgelöst. Ziehe es jetzt an die gewünschte Stelle.':'Motiv herausgelöst. Ziehe es jetzt an die gewünschte Stelle. Die Lücke kannst du mit dem Reparaturpinsel füllen.'))}
  catch(e){busy(false);Kit.toast(e.message)}};
 document.addEventListener('change',e=>{if(e.target.matches('[data-liftfill]'))Tools.o.liftFill=e.target.checked});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-stool]');if(!b)return;Tools.set(b.dataset.stool);UI.side()});
 X.ACTS={sellift:()=>{if(!Sel.has())return Kit.toast(t('Markiere zuerst einen Teil des Bildes.'));if(!Tools.liftSel(false))Kit.toast(t('Wähle eine Bild-Ebene aus.'));else Tools.set('move')},ai_lift:X.lift,ai_matte:X.matte,ai_upscale:X.upscale,guide:X.guide};
 return X})();
