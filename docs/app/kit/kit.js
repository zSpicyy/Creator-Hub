// Gemeinsame Helfer: Farben vom Hub übernehmen, Drag & drop mit echten Pfaden, kleine Werkzeuge.
const Kit=(()=>{
 const K={};
 // Sprache sofort beim Laden festlegen, damit nichts erst auf Deutsch aufblitzt.
 K.lang='en';try{const x=new XMLHttpRequest();x.open('GET','/kit/theme',false);x.send();K.lang=JSON.parse(x.responseText).lang==='de'?'de':'en'}catch(e){}
 if(K.lang==='en'&&window.I18N)I18N.start();
 K.t=s=>window.I18N?I18N.t(s):s;
 K.$=s=>document.querySelector(s);
 K.esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const dec=v=>K.lang==='de'?v.replace('.',','):v;
 K.size=b=>b>=1e9?dec((b/1e9).toFixed(2))+' GB':b>=1e6?dec((b/1e6).toFixed(1))+' MB':Math.max(1,Math.round(b/1e3))+' KB';
 K.num=n=>Number(n).toLocaleString(K.lang==='de'?'de-DE':'en-US');
 K.base=p=>String(p).split(/[\\/]/).pop();
 K.api=async(u,b)=>{const r=await fetch(u,b===undefined?{cache:'no-store'}:{method:'POST',body:JSON.stringify(b)});let j={};try{j=await r.json()}catch(e){}if(!r.ok)throw new Error(j.error||'Etwas ist schiefgelaufen.');return j};
 K.pick=async(mode,filter)=>{try{return(await K.api('/kit/pick?mode='+mode+'&filter='+encodeURIComponent(filter||''),{})).paths||[]}catch(e){return K.pickFallback(mode,e.message)}};
 // Ohne Dateiauswahl-Fenster (z. B. Linux ohne zenity/kdialog): Pfad eintippen oder einfügen
 K.pickFallback=(mode,msg)=>new Promise(res=>{const tt=s=>K.t?K.t(s):s;const ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;z-index:100000;background:#0009;display:grid;place-items:center';
  ov.innerHTML=`<div style="background:var(--panel,#1c1c22);color:var(--text,#eee);border:1px solid var(--line,#333);border-radius:12px;padding:18px;width:min(520px,92vw);font:14px system-ui"><b style="font-size:16px">${tt(mode==='folder'?'Ordner wählen':'Datei wählen')}</b><p style="opacity:.75;margin:8px 0 12px">${tt('Das Auswahlfenster ist hier nicht verfügbar. Füge den Pfad ein (mehrere Dateien: eine pro Zeile) oder ziehe die Datei ins Fenster.')}</p><textarea rows="3" style="width:100%;box-sizing:border-box;background:var(--bg,#111);color:inherit;border:1px solid var(--line,#333);border-radius:8px;padding:8px;font:13px ui-monospace,monospace"></textarea><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button data-k="no" class="btn">${tt('Abbrechen')}</button><button data-k="ok" class="btn primary">${tt('OK')}</button></div></div>`;
  document.body.append(ov);const ta=ov.querySelector('textarea');ta.focus();const done=v=>{ov.remove();res(v)};
  ov.onclick=e=>{const k=e.target.dataset&&e.target.dataset.k;if(k==='no')done([]);if(k==='ok')done(ta.value.split(/\r?\n/).map(x=>x.trim().replace(/^["']|["']$/g,'')).filter(Boolean))};ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ov.querySelector('[data-k=ok]').click()}if(e.key==='Escape')done([])}});
 K.openFolder=p=>K.api('/kit/open-folder',{path:p});
 let tt;K.toast=m=>{let t=K.$('#kitToast');if(!t){t=document.createElement('div');t.id='kitToast';document.body.append(t)}t.textContent=m;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),4500)};
 // Farben
 let last='';
 function ink(hex){const n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;return(r*.299+g*.587+b*.114)>150?'#10131a':'#ffffff'}
 K.applyTheme=async()=>{try{const t=await (await fetch('/kit/theme',{cache:'no-store'})).json();const key=JSON.stringify(t);if(key===last)return;last=key;
  let th=t.theme;if(th==='system')th=matchMedia('(prefers-color-scheme:light)').matches?'light':'dark';
  const r=document.documentElement;r.dataset.theme=th;r.dataset.density=t.density;r.style.setProperty('--accent',t.accent);r.style.setProperty('--accent-ink',ink(t.accent));r.style.setProperty('--accent-soft',t.accent+'26');
  document.dispatchEvent(new CustomEvent('kit-theme',{detail:t}))}catch(e){}};
 K.applyTheme();setInterval(()=>{if(!document.hidden)K.applyTheme()},2000);
 // Lebenszeichen an das Programm (unter Linux erkennt es so, dass das Fenster geschlossen wurde)
 if(!K.embedded){const alive=()=>fetch('/kit/alive',{cache:'no-store'}).catch(()=>{});alive();setInterval(alive,3000)}window.addEventListener('focus',K.applyTheme);
 matchMedia('(prefers-color-scheme:light)').addEventListener('change',()=>{last='';K.applyTheme()});
 // Drag & drop
 let handler=null,depth=0;K.onDrop=fn=>handler=fn;
 let fwd=null;
 K.embedded=window.parent!==window;
 // Im Hub eingebettete Werkzeuge reichen Dateien an den Hub weiter, nur er kennt die echten Pfade.
 K._forward=(files,win)=>{const wv=window.chrome&&chrome.webview;if(!wv||!wv.postMessageWithAdditionalObjects)return false;fwd=win;wv.postMessageWithAdditionalObjects('files:fwd',files);return true};
 K._drop=(paths,tag)=>{document.body.classList.remove('kit-dragging');depth=0;if(tag==='fwd'&&fwd){const w=fwd;fwd=null;try{w.Kit._drop(paths,'drop')}catch(e){}return}if(handler&&paths&&paths.length)handler(paths,tag)};
 const hasFiles=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
 window.addEventListener('dragenter',e=>{if(!hasFiles(e))return;e.preventDefault();depth++;if(handler)document.body.classList.add('kit-dragging')});
 window.addEventListener('dragleave',e=>{if(!hasFiles(e))return;depth=Math.max(0,depth-1);if(!depth)document.body.classList.remove('kit-dragging')});
 window.addEventListener('dragover',e=>{if(hasFiles(e)){e.preventDefault();e.dataTransfer.dropEffect=handler?'copy':'none'}});
 window.addEventListener('drop',async e=>{if(!hasFiles(e))return;e.preventDefault();depth=0;document.body.classList.remove('kit-dragging');if(!handler)return;
  const files=e.dataTransfer.files;if(!files.length)return;
  if(K.embedded&&parent.Kit&&parent.Kit._forward&&parent.Kit._forward(files,window))return;
  const wv=window.chrome&&chrome.webview;
  if(wv&&wv.postMessageWithAdditionalObjects){wv.postMessageWithAdditionalObjects('files:drop',files);return}
  // Außerhalb des App-Fensters: Dateien gestreamt übertragen
  K.toast('Dateien werden übernommen …');const paths=[];
  for(const f of files){try{const r=await fetch('/kit/upload?name='+encodeURIComponent(f.name),{method:'POST',body:f});const j=await r.json();if(j.path)paths.push(j.path)}catch(x){}}
  K._drop(paths,'drop')});
 setInterval(async()=>{if(!handler)return;try{const j=await (await fetch('/kit/inbox',{cache:'no-store'})).json();if(j.paths&&j.paths.length)handler(j.paths,'inbox')}catch(e){}},1500);
 document.addEventListener('DOMContentLoaded',()=>{const o=document.createElement('div');o.id='kitOverlay';o.innerHTML='<div>Hier loslassen</div>';document.body.append(o);
  if(K.embedded){const top=document.querySelector('.top');if(top){const b=document.createElement('button');b.className='btn kit-back';b.title='Zurück zum Hub';b.innerHTML='<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>Hub';b.onclick=()=>{try{parent.Hub.closeTool()}catch(e){}};top.prepend(b)}}});
 return K})();
window.Kit=Kit;

// ---- Tastenkürzel für alle Werkzeuge: frei belegbar, gespeichert für alle Apps gemeinsam ----
// Kit.hotkeys('upscale',[['undo','Bearbeiten','Rückgängig',['Ctrl+Z'],()=>…], …]) → {editor(), label(id)}
(()=>{const K=window.Kit;if(!K)return;
 const NAMES={ArrowLeft:'Left',ArrowRight:'Right',ArrowUp:'Up',ArrowDown:'Down',Escape:'Esc',' ':'Space',Delete:'Del',Backspace:'Backspace',Enter:'Enter',Tab:'Tab',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown',Insert:'Insert'};
 const combo=e=>{const k=e.key;if(['Control','Shift','Alt','Meta'].includes(k))return'';let n=NAMES[k]||(k.length===1?k.toUpperCase():k);if(e.code&&/^Digit\d$/.test(e.code))n=e.code.slice(5);else if(!/^[A-Za-zÄÖÜäöü]$/.test(k)&&e.code&&/^Key[A-Z]$/.test(e.code))n=e.code.slice(3);
  return(e.ctrlKey||e.metaKey?'Ctrl+':'')+(e.altKey?'Alt+':'')+(e.shiftKey?'Shift+':'')+n};
 const de=()=>(K.lang||document.documentElement.lang||'de').startsWith('de');
 K.keyLabel=c=>!c?'':de()?c.replace('Ctrl+','Strg+').replace('Shift+','Umschalt+').replace('Del','Entf').replace('Left','←').replace('Right','→').replace('Up','↑').replace('Down','↓').replace('Space','Leertaste'):c.replace('Left','←').replace('Right','→').replace('Up','↑').replace('Down','↓');
 const typing=el=>el&&(el.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)&&!['checkbox','radio','range','button'].includes(el.type));
 K.hotkeys=(app,defs)=>{const H={defs,custom:{}};const tt=s=>K.t?K.t(s):s;
  const keysOf=d=>H.custom[d[0]]||d[3];
  H.label=id=>{const d=defs.find(x=>x[0]===id);return d?K.keyLabel(keysOf(d)[0]||''):''};
  fetch('/kit/keys?app='+encodeURIComponent(app)).then(r=>r.json()).then(m=>{H.custom=m||{};H.onload&&H.onload()}).catch(()=>{});
  const save=()=>fetch('/kit/keys?app='+encodeURIComponent(app),{method:'POST',body:JSON.stringify(H.custom)}).catch(()=>{});
  let rec=null;
  document.addEventListener('keydown',e=>{const c=combo(e);if(!c)return;
   if(rec){e.preventDefault();e.stopPropagation();if(c==='Esc'){rec=null;draw();return}const [id]=rec;rec=null;for(const d of defs){const l=keysOf(d).filter(x=>x!==c);if(l.length!==keysOf(d).length)H.custom[d[0]]=l}H.custom[id]=[c];save();draw();return}
   if(document.getElementById('kitkeys')){if(c==='Esc'&&ov){ov.remove();ov=null}return}
   if(typing(e.target)&&!/^F\d+$|^Esc$/.test(c))return;
   const d=defs.find(d=>keysOf(d).includes(c));if(!d)return;e.preventDefault();d[4](e)},true);
  let ov=null;const draw=()=>{if(!ov)return;const q=(ov.querySelector('#kkq')?.value||'').toLowerCase();const groups=[...new Set(defs.map(d=>d[1]))];
   ov.querySelector('#kklist').innerHTML=groups.map(g=>{const ds=defs.filter(d=>{if(d[1]!==g)return false;if(!q)return true;const hay=[d[2],tt(d[2]),d[1],tt(d[1]),...keysOf(d).map(k=>k+' '+K.keyLabel(k))].join(' ').toLowerCase();return q.split(/\s+/).filter(Boolean).every(w=>hay.includes(w))});if(!ds.length)return'';return`<div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6;margin:14px 0 6px">${tt(g)}</div>`+ds.map(d=>{const ks=keysOf(d),r=rec&&rec[0]===d[0];
    return`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--line,#2a2a30)"><span style="flex:1">${tt(d[2])}</span>${r?`<b style="color:var(--accent,#7c6cff)">${tt('Taste drücken … (Esc = abbrechen)')}</b>`:ks.map(k=>`<kbd style="border:1px solid var(--line,#333);border-radius:6px;padding:2px 7px;font-size:12px">${K.keyLabel(k)}</kbd>`).join('')||`<span style="opacity:.5">${tt('keins')}</span>`}<button class="btn sm" data-kk="set" data-id="${d[0]}">${tt('Ändern')}</button><button class="btn sm" data-kk="clr" data-id="${d[0]}">${tt('Leeren')}</button></div>`}).join('')}).join('');const kl=ov.querySelector('#kklist');if(!kl.innerHTML.trim())kl.innerHTML=`<p style="opacity:.6;text-align:center;padding:30px 0">${tt('Nichts gefunden.')}</p>`};
  H.editor=()=>{if(ov)return;ov=document.createElement('div');ov.id='kitkeys';ov.style.cssText='position:fixed;inset:0;z-index:100000;background:#0009;display:grid;place-items:center';
   ov.innerHTML=`<div style="background:var(--panel,#1c1c22);color:var(--text,#eee);border:1px solid var(--line,#333);border-radius:12px;width:min(640px,94vw);max-height:86vh;display:flex;flex-direction:column;font:14px system-ui"><div style="display:flex;gap:10px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line,#333)"><b style="font-size:16px;flex:1">${tt('Tastenkürzel')}</b><input id="kkq" type="search" autocomplete="off" placeholder="🔍 ${tt('Aktion oder Taste suchen …')}" style="flex:1 1 220px;min-width:0;font-size:14px;padding:7px 10px !important;background:var(--bg,#111);color:inherit;border:1px solid var(--line,#333);border-radius:6px;padding:4px 8px"><button class="btn sm" data-kk="reset">${tt('Alle zurücksetzen')}</button><button class="btn sm" data-kk="close">✕</button></div><div id="kklist" style="overflow:auto;padding:0 16px 14px"></div></div>`;
   document.body.append(ov);draw();const kq=ov.querySelector('#kkq');kq.oninput=draw;setTimeout(()=>kq.focus(),30);
   ov.onclick=e=>{const b=e.target.closest('[data-kk]');if(e.target===ov||b&&b.dataset.kk==='close'){ov.remove();ov=null;rec=null;return}if(!b)return;const k=b.dataset.kk,id=b.dataset.id;
    if(k==='set'){rec=[id];draw()}if(k==='clr'){H.custom[id]=[];save();draw()}if(k==='reset'){H.custom={};save();draw()}}};
  return H};
  // Fenster hat das erste Bild gezeigt → Grafikbeschleunigung funktioniert
  requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(()=>fetch('/kit/ready',{method:'POST'}).catch(()=>{}),300)));

  // ---- Fühlt sich an wie ein Programm, nicht wie eine Webseite ----
  (()=>{const st=document.createElement('style');st.id='kit-feel';st.textContent=`
html{-webkit-tap-highlight-color:transparent}
body{-webkit-user-select:none;user-select:none}
input,textarea,select,[contenteditable],[contenteditable] *,.selectable,.selectable *{-webkit-user-select:text;user-select:text}
img,svg,a{-webkit-user-drag:none}
button,[role=button],.btn,label[for],summary,select,[data-act],[data-tool],[data-open],[data-new],[data-page],[data-tab]{cursor:pointer}
button:disabled,.btn:disabled{cursor:default}
button,.btn{transition:background-color .12s ease,border-color .12s ease,color .12s ease,box-shadow .12s ease,transform .08s ease}
button:active:not(:disabled),.btn:active:not(:disabled){transform:translateY(1px) scale(.985)}
:focus{outline:none}
:focus-visible{outline:2px solid var(--accent,#7c6cff);outline-offset:2px}
input:focus-visible,textarea:focus-visible,select:focus-visible{outline-offset:0}
::selection{background:color-mix(in srgb,var(--accent,#7c6cff) 35%,transparent)}
*{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--muted,#888) 45%,transparent) transparent}
`;document.head.prepend(st)})();
  // Browser-Kontextmenü (Zurück, Neu laden, Drucken …) nur in Eingabefeldern
  document.addEventListener('contextmenu',e=>{if(!e.defaultPrevented&&!typing(e.target))e.preventDefault()});
  // Kein versehentliches Neuladen, Zurückblättern, Drucken oder Zoomen der Oberfläche
  window.addEventListener('keydown',e=>{const k=e.key,c=e.ctrlKey||e.metaKey;
   if(k==='F5'||k==='BrowserBack'||k==='BrowserForward'||(c&&!e.altKey&&/^[rpu]$/i.test(k)&&!e.defaultPrevented)||(e.altKey&&(k==='ArrowLeft'||k==='ArrowRight')&&!typing(e.target))||(c&&(k==='+'||k==='-'||k==='='))&&!e.defaultPrevented)e.preventDefault()});
  window.addEventListener('wheel',e=>{if(e.ctrlKey)e.preventDefault()},{passive:false});
  // Strg+S überall: Werkzeuge mit eigenem Speichern machen das selbst; alle anderen speichern automatisch
  window.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.altKey||(e.key||'').toLowerCase()!=='s')return;if(e.defaultPrevented)return;e.preventDefault();
   if(typeof K.onSave==='function'){Promise.resolve(K.onSave()).then(()=>K.toast(K.t?K.t('Gespeichert'):'Gespeichert')).catch(x=>K.toast(x&&x.message||String(x)))}else K.toast(K.t?K.t('Alles ist gespeichert.'):'Alles ist gespeichert.')});
  window.addEventListener('mouseup',e=>{if(e.button===3||e.button===4)e.preventDefault()});
  window.addEventListener('mousedown',e=>{if(e.button===3||e.button===4)e.preventDefault()});
})();
// Ohne den Hub gestartet: Einrichtung, Updates und Einstellungen selbst übernehmen (kit/solo).
if(!Kit.embedded)fetch('/kit/solo',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{if(!j||!j.on)return;window.__solo=j;const s=document.createElement('script');s.src='/kit/solo.js';document.head.append(s)}).catch(()=>{});
