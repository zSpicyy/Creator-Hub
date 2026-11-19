// Tastenkürzel: zentrale Liste, eigene Belegung (gespeichert in tastenkuerzel.json), Einstellungsfenster.
const Keys=(()=>{const K={};const {$,esc,api}=Kit;
 const T=()=>Timeline;
 const fs=()=>{const st=$('#stage');document.fullscreenElement?document.exitFullscreen():st.requestFullscreen()};
 const clipNav=d=>{const all=App.P.tracks.flatMap(t=>t.clips).sort((x,y)=>x.start-y.start);const cur=App.sel&&all.findIndex(x=>x.id===App.sel.clip);const i=cur==null||cur<0?0:cur+d;if(all[i]){App.sel={clip:all[i].id};T().render();Panels.props()}};
 // [id, Gruppe, Bezeichnung, Standard-Tasten, Aktion]
 const A=[
  ['play','Wiedergabe','Abspielen / Anhalten',['Space'],()=>Player.toggle()],
  ['stop','Wiedergabe','Stopp',['Ctrl+/'],()=>{Player.pause();Player.seek(0)}],
  ['prev','Wiedergabe','Ein Bild zurück',['ArrowLeft'],()=>Player.seek(App.t-1/App.P.fps)],
  ['next','Wiedergabe','Ein Bild vor',['ArrowRight'],()=>Player.seek(App.t+1/App.P.fps)],
  ['back1','Wiedergabe','Eine Sekunde zurück',['Shift+ArrowLeft'],()=>Player.seek(App.t-1)],
  ['fwd1','Wiedergabe','Eine Sekunde vor',['Shift+ArrowRight'],()=>Player.seek(App.t+1)],
  ['prevedit','Wiedergabe','Vorheriger Schnittpunkt',['ArrowUp'],()=>T().editPoint(-1)],
  ['nextedit','Wiedergabe','Nächster Schnittpunkt',['ArrowDown'],()=>T().editPoint(1)],
  ['prevmark','Wiedergabe','Vorheriger Marker',['Shift+ArrowUp'],()=>T().markerNav(-1)],
  ['nextmark','Wiedergabe','Nächster Marker',['Shift+ArrowDown'],()=>T().markerNav(1)],
  ['home','Wiedergabe','Zum Anfang',['Home'],()=>Player.seek(0)],
  ['end','Wiedergabe','Zum Ende',['End'],()=>Player.seek(App.total())],
  ['clipstart','Wiedergabe','Anfang des Clips',['Shift+Home'],()=>T().clipEdge(0)],
  ['clipend','Wiedergabe','Ende des Clips',['Shift+End'],()=>T().clipEdge(1)],
  ['fullscreen','Wiedergabe','Vorschau im Vollbild',['Alt+Enter'],fs],
  ['snapshot','Wiedergabe','Standbild speichern',['Ctrl+Alt+S'],()=>Player.snapshot()],
  ['undo','Bearbeiten','Rückgängig',['Ctrl+Z'],()=>App.doUndo()],
  ['redo','Bearbeiten','Wiederholen',['Ctrl+Y','Ctrl+Shift+Z'],()=>App.doRedo()],
  ['cut','Bearbeiten','Ausschneiden',['Ctrl+X'],()=>T().cut()],
  ['copy','Bearbeiten','Kopieren',['Ctrl+C'],()=>T().copy()],
  ['paste','Bearbeiten','Einfügen',['Ctrl+V'],()=>T().paste()],
  ['dup','Bearbeiten','Duplizieren',['Ctrl+D'],()=>T().duplicate()],
  ['delete','Bearbeiten','Löschen',['Delete','Backspace'],()=>T().del()],
  ['ripple','Bearbeiten','Lückenlos löschen',['Shift+Delete'],()=>T().rippleDel()],
  ['gap','Bearbeiten','Lücken schließen',['Alt+Delete'],()=>T().closeGap()],
  ['selall','Bearbeiten','Alles auswählen',['Ctrl+A'],()=>T().selectAll()],
  ['deselect','Bearbeiten','Auswahl aufheben',['Escape'],()=>{App.sel=null;T().render();Panels.props()}],
  ['prevclip','Bearbeiten','Vorherigen Clip auswählen',['Ctrl+ArrowLeft'],()=>clipNav(-1)],
  ['nextclip','Bearbeiten','Nächsten Clip auswählen',['Ctrl+ArrowRight'],()=>clipNav(1)],
  ['copyfx','Bearbeiten','Effekte kopieren',['Ctrl+Alt+C'],()=>T().copyFx()],
  ['pastefx','Bearbeiten','Effekte einfügen',['Ctrl+Alt+V'],()=>T().pasteFx()],
  ['split','Werkzeuge','Teilen',['Ctrl+B'],()=>T().split()],
  ['trims','Werkzeuge','Anfang bis Abspielkopf kürzen',['Alt+['],()=>T().trimTo('start')],
  ['trime','Werkzeuge','Ende ab Abspielkopf kürzen',['Alt+]'],()=>T().trimTo('end')],
  ['freeze','Werkzeuge','Standbild einfügen',['Alt+F'],()=>T().freeze()],
  ['detach','Werkzeuge','Ton abtrennen',['Ctrl+Alt+D'],()=>T().detachAudio()],
  ['mute','Werkzeuge','Stumm schalten',['Ctrl+Shift+M'],()=>T().toggleMute()],
  ['rotr','Werkzeuge','90° nach rechts drehen',['Ctrl+Alt+ArrowRight'],()=>T().rot90(1)],
  ['rotl','Werkzeuge','90° nach links drehen',['Ctrl+Alt+ArrowLeft'],()=>T().rot90(-1)],
  ['nudgel','Werkzeuge','Clip ein Bild nach links',['Alt+ArrowLeft'],()=>T().nudge(-1)],
  ['nudger','Werkzeuge','Clip ein Bild nach rechts',['Alt+ArrowRight'],()=>T().nudge(1)],
  ['selcolor','Werkzeuge','Clips gleicher Farbe auswählen',['Alt+Shift+^'],()=>T().selColor()],
  ['props','Werkzeuge','Eigenschaften zeigen',['Alt+E'],()=>Panels.props()],
  ['marker','Werkzeuge','Marker hinzufügen',['M'],()=>T().addMarker()],
  ['editmarker','Werkzeuge','Marker bearbeiten',['Shift+M'],()=>T().editMarker()],
  ['zoomin','Ansicht','Vergrößern',['Ctrl++','+','Ctrl+=','='],()=>T().zoomBy(1.4)],
  ['zoomout','Ansicht','Verkleinern',['Ctrl+-','-'],()=>T().zoomBy(1/1.4)],
  ['fit','Ansicht','Ganze Zeitleiste zeigen',['Shift+Z'],()=>T().fit()],
  ['import','Datei','Medien importieren',['Ctrl+I'],()=>App.act('import')],
  ['export','Datei','Exportieren',['Ctrl+E'],()=>App.act('export')],
  ['new','Datei','Neues Projekt',['Ctrl+N'],()=>App.act('new')],
  ['save','Datei','Speichern',['Ctrl+S'],()=>App.saveNow()],
  ['keys','Datei','Tastenkürzel',['F1'],()=>K.editor()]];
 const COLORS=['#ff4d4d','#ff9f1c','#ffd23f','#3fbf7f','#25c2b8','#4c8dff','#9a78f0','#9aa0a6'];
 let custom={};const byId={};for(const a of A)byId[a[0]]=a;
 const combos=id=>custom[id]||byId[id][3];
 // Taste aus einem Tastendruck: "Ctrl+Alt+Shift+Key"
 const CODE={BracketLeft:'[',BracketRight:']',Backquote:'^',Minus:'-',Equal:'=',Slash:'/',NumpadAdd:'+',NumpadSubtract:'-'};
 const keyName=e=>{let k=e.key;if(k===' ')k='Space';else if(k.length===1)k=k.toUpperCase();if(k==='Dead')k=CODE[e.code]||k;if(k==='Esc')k='Escape';return k};
 const mods=e=>(e.ctrlKey||e.metaKey?'Ctrl+':'')+(e.altKey?'Alt+':'')+(e.shiftKey?'Shift+':'');
 K.fromEvent=e=>{const k=keyName(e);if(['Control','Alt','Shift','Meta','AltGraph'].includes(k))return null;return mods(e)+k};
 const altFromEvent=e=>{const c=CODE[e.code]||(/^Digit\d$/.test(e.code)?e.code.slice(5):/^Key[A-Z]$/.test(e.code)?e.code.slice(3):null);return c?mods(e)+c:null};
 // Anzeige auf Deutsch (die Übersetzung macht daraus Ctrl, Shift …)
 const SHOW={Ctrl:'Strg',Shift:'Umschalt',Alt:'Alt',Space:'Leertaste',Delete:'Entf',Backspace:'Rücktaste',Home:'Pos1',End:'Ende',Escape:'Esc',Enter:'Enter',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',PageUp:'Bild↑',PageDown:'Bild↓'};
 K.show=c=>c.split(/\+(?=.)/).map(p=>SHOW[p]||p).join('+');
 const find=c=>{for(const a of A)if(combos(a[0]).includes(c))return a[0];return null};
 K.handle=e=>{if($('#editor').hidden||$('#modal').classList.contains('show'))return;const tg=e.target;const c=K.fromEvent(e);if(!c)return;let id=find(c);
  if(tg.matches('input,textarea,select')&&!(tg.type==='range'||tg.type==='checkbox')&&id!=='save'){return}if(!id){const c2=altFromEvent(e);if(c2&&c2!==c)id=find(c2)}
  if(!id&&e.altKey&&!e.ctrlKey&&/^Digit[1-8]$/.test(e.code)){T().label(COLORS[+e.code.slice(5)-1]);e.preventDefault();return}
  if(!id)return;e.preventDefault();byId[id][4]()};
 document.addEventListener('keydown',K.handle);
 // Menüs zeigen die aktuelle Belegung
 K.menus=()=>{document.querySelectorAll('.ddm [data-act]').forEach(b=>{const id=b.dataset.act;if(!byId[id])return;let kb=b.querySelector('kbd');const cs=combos(id);if(!cs.length){if(kb)kb.remove();return}if(!kb){kb=document.createElement('kbd');b.append(kb)}kb.textContent=K.show(cs[0])})};
 K.load=async()=>{try{const j=await api('api/keys');custom=j&&typeof j==='object'?j:{}}catch(e){custom={}}K.menus()};
 const store=()=>{api('api/keys',custom).catch(()=>{});K.menus()};
 // Einstellungsfenster: klicken, neue Taste drücken
 let rec=null;
 K.editor=()=>{const groups=[...new Set(A.map(a=>a[1]))];
  const row=a=>{const cs=combos(a[0]),own=!!custom[a[0]];return`<div class="krow${rec===a[0]?' rec':''}" data-k="${a[0]}"><span>${esc(a[2])}</span><div class="kcur">${rec===a[0]?'<i>Drücke die neue Taste … (Esc bricht ab)</i>':cs.length?cs.map(c=>`<kbd>${esc(K.show(c))}</kbd>`).join(''):'<i class="muted">keine</i>'}</div><div class="kact"><button class="btn sm" data-krec="${a[0]}">Ändern</button><button class="btn sm" data-kclr="${a[0]}" title="Belegung entfernen">Leeren</button>${own?`<button class="btn sm" data-kdef="${a[0]}" title="Standard wiederherstellen">Standard</button>`:''}</div></div>`};
  const hit=(a,q)=>{if(!q)return true;const hay=[a[2],Kit.t(a[2]),a[1],Kit.t(a[1]),...combos(a[0]).map(c=>c+' '+K.show(c))].join(' ').toLowerCase();return q.split(/\s+/).filter(Boolean).every(w=>hay.includes(w))};
  const draw=()=>{Panels.locked=!!rec;const q=($('#kq')&&$('#kq').value||'').toLowerCase();const html=groups.map(g=>{const rs=A.filter(a=>a[1]===g&&hit(a,q));return rs.length?`<h4>${esc(Kit.t(g))}</h4>`+rs.map(row).join(''):''}).join('');$('#klist').innerHTML=(html||`<p class="kempty">${esc(Kit.t('Nichts gefunden.'))}</p>`)+`<p class="muted" style="font-size:12px;margin-top:12px">Farbmarkierung: Alt+1 … 8 · Mehrere Clips auswählen: Strg+Klick</p>`};
  Panels.modal(`<div class="mhead"><h3>Tastenkürzel</h3><label class="ksbox"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="kq" class="ksearch" type="search" placeholder="${esc(Kit.t('Aktion oder Taste suchen …'))}" spellcheck="false" autocomplete="off"></label><button class="btn" data-kall>Alle zurücksetzen</button><button class="ib" data-close>${Kit.icon?Kit.icon('x'):'×'}</button></div><div class="mbody"><div id="klist" class="klist"></div></div>`);
  draw();const mb=$('#mbox');setTimeout(()=>$('#kq')&&$('#kq').focus(),30);
  mb.oninput=e=>{if(e.target.id==='kq')draw()};
  mb.onclick=e=>{let b;
   if(e.target.closest('[data-close]')){rec=null;Panels.locked=false;return Panels.close()}
   if(b=e.target.closest('[data-krec]')){rec=b.dataset.krec;return draw()}
   if(b=e.target.closest('[data-kclr]')){custom[b.dataset.kclr]=[];store();return draw()}
   if(b=e.target.closest('[data-kdef]')){delete custom[b.dataset.kdef];store();return draw()}
   if(e.target.closest('[data-kall]')){if(!confirm(Kit.t('Alle Tastenkürzel auf den Standard zurücksetzen?')))return;custom={};store();return draw()}};
  const cap=e=>{if(!rec||!$('#klist'))return;e.preventDefault();e.stopPropagation();
   if(e.key==='Escape'){rec=null;return draw()}const c=K.fromEvent(e);if(!c)return;
   const other=find(c);if(other&&other!==rec){custom[other]=combos(other).filter(x=>x!==c);Kit.toast(Kit.t('Vorher belegt mit:')+' '+Kit.t(byId[other][2]))}
   custom[rec]=[c];rec=null;store();draw()};
  document.addEventListener('keydown',cap,true);
  const stop=new MutationObserver(()=>{if(!$('#modal').classList.contains('show')){document.removeEventListener('keydown',cap,true);rec=null;stop.disconnect()}});stop.observe($('#modal'),{attributes:true,attributeFilter:['class']})};
 return K})();
