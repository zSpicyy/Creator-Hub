// StreamPilot – Abfrage beim ersten Start: Soll die KI (Ollama) für den Sortierer installiert werden?
(()=>{const T=(de,en)=>lang==='de'?de:en;let box=null,poll=null;
 const st=document.createElement('style');st.textContent=`.aiq{position:fixed;inset:0;z-index:90;background:#000a;display:grid;place-items:center;padding:16px}
 .aiq>div{background:var(--panel,#17161d);border:1px solid var(--line,#ffffff1a);border-radius:16px;padding:22px 22px 18px;width:min(500px,100%);box-shadow:0 20px 60px #0008}
 .aiq>div{overflow:hidden}.aiq-logo{margin:-22px -22px 16px;height:110px;display:grid;place-items:center;background:radial-gradient(circle at 50% 45%,#3a3a44,#121216 72%)}.aiq-logo img{height:70px;filter:drop-shadow(0 0 18px #ffffff55)}
 .aiq h2{margin:0 0 6px;font-size:20px}.aiq p{margin:0 0 10px;color:var(--muted);line-height:1.5}.aiq ul{margin:0 0 16px;padding-left:18px;line-height:1.6}
 .aiq .row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.aiq .bar{margin:6px 0 14px}`;document.head.appendChild(st);
 const steps=()=>({download:T('Lade KI-Programm …','Downloading AI program …'),unpack:T('Entpacke …','Unpacking …'),start:T('Starte KI …','Starting AI …'),model:T('Lade KI-Modell …','Downloading AI model …')});
 const gb=n=>(n/1e9).toFixed(2).replace('.',lang==='de'?',':'.')+' GB';
 const close=()=>{box&&box.remove();box=null;clearInterval(poll)};
 const show=r=>{if(!box){box=document.createElement('div');box.className='aiq';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');document.body.appendChild(box)}
  const a=r.ai||{};let body;
  if(r.aiReady||a.step==='ready')body=`<h2>${T('KI ist bereit','AI is ready')}</h2><p>${T('Der Sortierer kann jetzt deine Playlists sortieren.','The sorter can now sort your playlists.')}</p><div class="row"><button class="btn primary" data-q="ok">${T('Fertig','Done')}</button></div>`;
  else if(a.running)body=`<h2>${T('KI wird installiert','Installing the AI')}</h2><p>${steps()[a.step]||'…'}${a.total?' · '+gb(a.done)+' / '+gb(a.total):''}</p><div class="bar"><i style="width:${Math.round((a.pct||0)*100)}%"></i></div><div class="row"><button class="btn" data-q="bg">${T('Im Hintergrund weiter','Continue in background')}</button></div>`;
  else body=`<h2>${r.need==='update'?T('Ollama aktualisieren?','Update Ollama?'):r.need==='model'?T('KI-Modell für Ollama laden?','Download the AI model for Ollama?'):T('KI für StreamPilot installieren?','Install the AI for StreamPilot?')}</h2>
   <p>${r.need==='update'?T(`Auf deinem PC ist schon Ollama ${esc(r.version)} installiert. StreamPilot braucht mindestens ${esc(r.min)}. Die neue Version wird dazugeladen, dein vorhandenes Ollama bleibt unverändert.`,`Ollama ${esc(r.version)} is already installed on your PC. StreamPilot needs at least ${esc(r.min)}. The new version is downloaded alongside, your existing Ollama stays unchanged.`):r.need==='model'?T(`Ollama ${esc(r.version||'')} ist schon auf deinem PC und wird benutzt. Es fehlt nur das KI-Modell.`,`Ollama ${esc(r.version||'')} is already on your PC and will be used. Only the AI model is missing.`):T('StreamPilot benutzt für eine Funktion eine kleine KI (Ollama), die nur auf deinem PC läuft.','StreamPilot uses a small AI (Ollama) for one feature. It runs only on your PC.')}</p>
   <ul><li><b>${T('Wofür:','What for:')}</b> ${esc(r.purpose||'')}</li>
   <li>${T('Einmaliger Download, ','One-time download, ')}${esc(r.size||'')}.</li>
   <li>${T('Startet automatisch, wenn du StreamPilot öffnest, und schließt sich automatisch, wenn du StreamPilot schließt.','Starts automatically when you open StreamPilot and closes automatically when you close StreamPilot.')}</li>
   <li>${T('Es wird nichts verschickt. Ohne KI funktioniert nur der Sortierer nicht, alles andere schon.','Nothing is sent anywhere. Without it only the sorter does not work, everything else does.')}</li></ul>
   ${a.error?`<p class="bad">${esc(a.error)}</p>`:''}
   <div class="row"><button class="btn" data-q="no">${T('Nicht jetzt','Not now')}</button><button class="btn primary" data-q="yes">${a.error?T('Nochmal versuchen','Try again'):r.need==='update'?T('Aktualisieren','Update'):r.need==='model'?T('Modell laden','Download model'):T('Installieren','Install')}</button></div>`;
  box.innerHTML='<div><div class="aiq-logo"><img src="ollama.svg" alt="Ollama"></div>'+body+'</div>';
  box.querySelector('[data-q]').closest('.row').onclick=async e=>{const q=e.target.dataset.q;if(!q)return;
   if(q==='ok'||q==='bg')return close();
   if(q==='no'){await api('/api/ai/decline',{}).catch(()=>{});return close()}
   const x=await api('/api/ai/setup',{}).catch(err=>{toast(err.message)});if(x)show(x);
   clearInterval(poll);poll=setInterval(async()=>{const y=await api('/api/ai/state').catch(()=>null);if(!y)return;if(box)show(y);if(!y.ai.running){clearInterval(poll);if(typeof SO!=='undefined'&&SO){SO.ai=y.ai;SO.aiReady=y.aiReady;if(page==='sort')render()}}},1500)}};
 window.aiAsk=async()=>{const r=await api('/api/ai/state').catch(()=>null);if(r)show(r)};
 // beim ersten Start fragen (nach der Einführung)
 const wait=setInterval(async()=>{if(typeof S==='undefined'||!S||!S.settings||!S.settings.tourDone||document.querySelector('.tr'))return;clearInterval(wait);
  const r=await api('/api/ai/state').catch(()=>null);if(r&&!r.installed&&!r.asked&&!(r.ai||{}).running)setTimeout(()=>show(r),400)},700);
})();
