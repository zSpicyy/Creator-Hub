// Für Werkzeuge, die ohne den Creator Hub laufen (einzeln von der Webseite geladen):
// 1. Download-Fenster: richtet KI-Modell oder ffmpeg beim ersten Start ein, im Look des Werkzeugs.
// 2. Update-Hinweis unten rechts, wie im Hub. Updates kommen signiert von GitHub.
// 3. Einstellungen (Zahnrad): Updates, Sprache und Design – dieselben wie im Hub.
(()=>{const K=window.Kit;if(!K||!window.__solo)return;
let S=window.__solo,setupOpen=false,setupHidden=false,doneShown=false,popClosed=false,setOpen=false,want=false,cfg=null,busy=false;
const de=()=>K.lang==='de',T=(a,b)=>de()?a:b,esc=K.esc,title=()=>de()?S.title:(S.titleEN||S.title),C=S.color||'#7c6cff',LOGO='/kit/logos/'+S.logo+'.svg';
const ACC={indigo:'#7c6cff',blau:'#4c8dff',türkis:'#25b8c9',grün:'#3fbf7f',gelb:'#e0b43a',orange:'#f08a3c',rot:'#e5584f',pink:'#e5629f',violett:'#9a78f0'};
const CTP={latte:{mauve:'#8839ef',pink:'#ea76cb',red:'#d20f39',peach:'#fe640b',yellow:'#df8e1d',green:'#40a02b',teal:'#179299',sky:'#04a5e5',blue:'#1e66f5',lavender:'#7287fd'},frappe:{mauve:'#ca9ee6',pink:'#f4b8e4',red:'#e78284',peach:'#ef9f76',yellow:'#e5c890',green:'#a6d189',teal:'#81c8be',sky:'#99d1db',blue:'#8caaee',lavender:'#babbf1'},macchiato:{mauve:'#c6a0f6',pink:'#f5bde6',red:'#ed8796',peach:'#f5a97f',yellow:'#eed49f',green:'#a6da95',teal:'#8bd5ca',sky:'#91d7e3',blue:'#8aadf4',lavender:'#b7bdf8'},mocha:{mauve:'#cba6f7',pink:'#f5c2e7',red:'#f38ba8',peach:'#fab387',yellow:'#f9e2af',green:'#a6e3a1',teal:'#94e2d5',sky:'#89dceb',blue:'#89b4fa',lavender:'#b4befe'}};
const THEMES=[['black','Schwarz','Black','#000'],['dark','Dunkel','Dark','#14161a'],['light','Hell','Light','#f3f4f6'],['system','Wie das System','Like the system','linear-gradient(90deg,#14161a 50%,#f3f4f6 50%)']];
const CTPF=[['latte','Latte','#eff1f5','#4c4f69'],['frappe','Frappé','#303446','#c6d0f5'],['macchiato','Macchiato','#24273a','#cad3f5'],['mocha','Mocha','#1e1e2e','#cdd6f4']];
const st=document.createElement('style');st.textContent=`
.so-ov{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;background:color-mix(in srgb,#000 55%,transparent);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font:14px/1.5 var(--font,system-ui,sans-serif);color:var(--text)}
.so-box{width:min(520px,100%);max-height:calc(100vh - 40px);overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:0 30px 90px -20px #000c;animation:soin .28s cubic-bezier(.2,.9,.3,1.2)}
@keyframes soin{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}
.so-hero{position:relative;padding:28px 26px 22px;display:flex;gap:18px;align-items:center;background:radial-gradient(420px 200px at 0% 0%,color-mix(in srgb,var(--so) 45%,transparent),transparent 70%),linear-gradient(180deg,color-mix(in srgb,var(--so) 16%,var(--panel)),var(--panel));border-bottom:1px solid var(--line);border-radius:18px 18px 0 0}
.so-hero img{width:68px;height:68px;flex:none;filter:drop-shadow(0 10px 24px color-mix(in srgb,var(--so) 75%,#000))}
.so-hero h2{margin:0;font-size:21px;letter-spacing:-.01em}.so-hero p{margin:5px 0 0;color:var(--muted);font-size:13.5px}
.so-body{padding:18px 22px 6px;display:grid;gap:12px}
.so-need{border:1px solid var(--line);background:var(--panel2);border-radius:12px;padding:14px 15px}
.so-need .t{display:flex;align-items:baseline;gap:10px}.so-need b{font-size:14.5px}.so-need .mb{margin-left:auto;color:var(--muted);font-size:12.5px;white-space:nowrap}
.so-need p{margin:4px 0 10px;color:var(--muted);font-size:13px}
.so-bar{height:8px;border-radius:99px;background:color-mix(in srgb,var(--so) 14%,var(--panel));overflow:hidden}.so-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--so),color-mix(in srgb,var(--so) 55%,#fff));transition:width .4s ease;box-shadow:0 0 14px var(--so)}
.so-bar.wait i{width:30%!important;animation:sowait 1.3s ease-in-out infinite}@keyframes sowait{0%{transform:translateX(-100%)}100%{transform:translateX(340%)}}
.so-st{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12.5px;color:var(--muted)}.so-st.ok{color:var(--ok,#4cc38a)}.so-st.err{color:var(--danger,#ff6b6b)}
.so-st button{margin-left:auto}
.so-foot{padding:14px 22px 20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.so-foot small{color:var(--muted);font-size:12px;flex:1;min-width:180px}
.so-btn{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:9px;padding:8px 14px;font:600 13.5px var(--font,system-ui);cursor:pointer}
.so-btn:hover{border-color:color-mix(in srgb,var(--so,var(--accent)) 60%,var(--line))}
.so-btn.pri{background:var(--so,var(--accent));border-color:var(--so,var(--accent));color:#fff;box-shadow:0 8px 22px -10px var(--so,var(--accent))}
.so-btn.acc{background:var(--accent);border-color:var(--accent);color:var(--accent-ink,#fff)}
.so-chip{position:fixed;left:14px;bottom:14px;z-index:2147482990;display:flex;align-items:center;gap:9px;background:var(--panel);border:1px solid var(--line);border-radius:99px;padding:6px 12px 6px 7px;font:600 12.5px var(--font,system-ui);color:var(--text);cursor:pointer;box-shadow:0 10px 30px -12px #000a}
.so-chip img{width:22px;height:22px}.so-chip .so-bar{width:80px;height:6px}
.so-gear{position:fixed;right:12px;bottom:12px;z-index:2147482980;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:color-mix(in srgb,var(--panel) 88%,transparent);color:var(--muted);display:grid;place-items:center;cursor:pointer;opacity:.75;transition:opacity .15s,color .15s,transform .2s}
.so-gear:hover{opacity:1;color:var(--text);transform:rotate(30deg)}.so-gear svg{width:18px;height:18px}
.so-gear i{position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:var(--accent);border:2px solid var(--panel)}
.so-pop{position:fixed;right:20px;bottom:56px;width:350px;max-width:calc(100vw - 40px);background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 16px 14px;z-index:2147482995;box-shadow:0 18px 50px -12px #000b;overflow:hidden;animation:soin .3s ease;font:14px/1.5 var(--font,system-ui);color:var(--text)}
.so-pop::before{content:"";position:absolute;inset:0 0 auto 0;height:3px;background:linear-gradient(90deg,var(--accent),color-mix(in srgb,var(--accent) 30%,#fff))}
.so-pop .hd{display:flex;gap:12px;align-items:center;margin-bottom:10px}.so-pop .hd img{width:40px;height:40px}.so-pop .hd b{display:block;font-size:15px}.so-pop .hd span{color:var(--muted);font-size:12.5px}
.so-ver{display:inline-block;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);border-radius:99px;padding:1px 9px;font-weight:700;font-size:12.5px}
.so-x{position:absolute;top:10px;right:10px;background:none;border:0;color:var(--muted);font-size:18px;line-height:1;padding:4px 7px;border-radius:6px;cursor:pointer}.so-x:hover{background:var(--panel2);color:var(--text)}
.so-new{background:var(--panel2);border-radius:9px;padding:8px 10px;margin:0 0 10px;max-height:110px;overflow:auto}.so-new b{font-size:12px;color:var(--accent)}.so-new p{margin:3px 0 0;font-size:12.5px;color:var(--muted)}
.so-note{color:var(--muted);font-size:12px;margin:0 0 12px}.so-row{display:flex;gap:8px}.so-row .so-btn{flex:1}
.so-pop .so-bar{--so:var(--accent);margin:0 0 10px}
.so-set{width:min(640px,100%)}.so-set .so-hero{padding:20px 22px}.so-set .so-hero img{width:44px;height:44px}
.so-sec{padding:16px 22px;border-bottom:1px solid var(--line)}.so-sec:last-child{border:0}.so-sec h3{margin:0 0 10px;font-size:14px}
.so-line{display:flex;align-items:center;gap:14px;padding:6px 0}.so-line>div{flex:1}.so-line small{display:block;color:var(--muted);font-size:12.5px}
.so-seg{display:flex}.so-seg .so-btn{border-radius:0}.so-seg .so-btn:first-child{border-radius:8px 0 0 8px}.so-seg .so-btn:last-child{border-radius:0 8px 8px 0;border-left:0}.so-seg .on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink,#fff)}
.so-tg{width:40px;height:22px;border-radius:99px;background:var(--panel2);border:1px solid var(--line);position:relative;cursor:pointer;flex:none}.so-tg::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--muted);transition:left .15s,background .15s}.so-tg.on{background:var(--accent);border-color:var(--accent)}.so-tg.on::after{left:20px;background:#fff}
.so-ths{display:flex;gap:9px;flex-wrap:wrap}.so-th{width:104px;border:2px solid var(--line);border-radius:10px;background:none;padding:5px;text-align:center;color:var(--text);font:12.5px var(--font,system-ui);cursor:pointer}.so-th.on{border-color:var(--accent)}
.so-th i{display:block;height:42px;border-radius:6px;margin-bottom:4px;border:1px solid #8884}.so-th.ctp i{display:flex;flex-direction:column;justify-content:space-between;padding:5px 6px;text-align:left;font-style:normal}.so-th.ctp b{font-size:13px;line-height:1}.so-th.ctp span{display:flex;gap:3px}.so-th.ctp em{width:7px;height:7px;border-radius:50%}
.so-sw{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 8px}.so-sw button{width:26px;height:26px;border-radius:50%;border:0;outline:2px solid transparent;outline-offset:2px;cursor:pointer}.so-sw button.on{outline-color:var(--text)}
.so-lab{color:var(--muted);font-size:12.5px;margin:12px 0 2px}
@media (prefers-reduced-motion:reduce){.so-box,.so-pop{animation:none}.so-bar.wait i{animation:none}}`;
document.head.append(st);
const api=async(u,b)=>{const r=await fetch(u,b===undefined?{cache:'no-store'}:{method:'POST',body:JSON.stringify(b)});let j={};try{j=await r.json()}catch(e){}if(!r.ok)throw new Error(j.error||T('Etwas ist schiefgelaufen.','Something went wrong.'));return j};
const el=(h)=>{const d=document.createElement('div');d.innerHTML=h.trim();return d.firstChild};
const pct=d=>Math.round((d||0)*100);
const missing=()=>(S.needs||[]).filter(n=>!n.Ready);

// ---------- 1. Download-Fenster ----------
let ov=null,chip=null;
function needHTML(n){const name=de()?n.Name:n.NameEN,why=de()?n.Why:n.WhyEN;
 let bar,stx;
 if(n.Ready){bar=`<div class="so-bar"><i style="width:100%"></i></div>`;stx=`<div class="so-st ok">✓ ${T('Eingerichtet','Ready')}</div>`}
 else if(n.Error){bar=`<div class="so-bar"><i style="width:${pct(n.Done)}%"></i></div>`;stx=`<div class="so-st err"><span>${esc(n.Error)}</span><button class="so-btn" data-retry="${esc(n.ID)}">${T('Erneut versuchen','Try again')}</button></div>`}
 else if(n.Loading&&n.Done>0){bar=`<div class="so-bar"><i style="width:${pct(n.Done)}%"></i></div>`;stx=`<div class="so-st">${T('Wird geladen …','Downloading …')} ${pct(n.Done)} %${n.MB?` · ${T('von','of')} ${n.MB} MB`:''}</div>`}
 else{bar=`<div class="so-bar wait"><i></i></div>`;stx=`<div class="so-st">${T('Verbindung wird aufgebaut …','Connecting …')}</div>`}
 return`<div class="so-need"><div class="t"><b>${esc(name)}</b>${n.MB?`<span class="mb">${T('rund','about')} ${n.MB} MB</span>`:''}</div><p>${esc(why)}</p>${bar}${stx}</div>`}
function renderSetup(){const miss=missing(),all=(S.needs||[]);
 if(!all.length)return;
 if(!miss.length){ // fertig
  if(ov&&!doneShown){doneShown=true;ov.querySelector('.so-body').innerHTML=all.map(needHTML).join('');ov.querySelector('.so-foot').innerHTML=`<small>${T('Alles bereit. Ab jetzt startet','All set. From now on')} ${esc(title())} ${T('sofort.','starts right away.')}</small><button class="so-btn pri" data-close>${T('Los geht’s','Let’s go')}</button>`;setTimeout(closeSetup,2200)}
  if(chip){chip.remove();chip=null}return}
 if(setupHidden){ // kleiner Fortschritt unten links
  const n=miss[0];if(!chip){chip=el(`<button class="so-chip" translate="no" title="${T('Einrichtung anzeigen','Show setup')}" style="--so:${C}"><img src="${LOGO}" alt=""><span></span><div class="so-bar"><i></i></div></button>`);chip.onclick=()=>{setupHidden=false;chip.remove();chip=null;renderSetup()};document.body.append(chip)}
  chip.querySelector('span').textContent=n.Error?T('Einrichtung fehlgeschlagen','Setup failed'):T('Wird eingerichtet','Setting up')+' '+pct(n.Done)+' %';chip.querySelector('i').style.width=pct(n.Done)+'%';return}
 if(!ov){ov=el(`<div class="so-ov" translate="no" style="--so:${C}" role="dialog" aria-modal="true" aria-labelledby="soT"><div class="so-box">
  <div class="so-hero"><img src="${LOGO}" alt=""><div><h2 id="soT">${esc(title())} ${T('wird eingerichtet','is being set up')}</h2><p>${T('Einmalig beim ersten Start. Danach startet','Only once, on first start. After that')} ${esc(title())} ${T('sofort und arbeitet ohne Internet.','starts right away and works offline.')}</p></div></div>
  <div class="so-body"></div><div class="so-foot"></div></div></div>`);
  ov.addEventListener('click',e=>{const r=e.target.closest('[data-retry]');if(r){api('/kit/solo/need?id='+encodeURIComponent(r.dataset.retry),{}).then(poll);return}if(e.target.closest('[data-close]'))closeSetup();if(e.target.closest('[data-later]')){setupHidden=true;closeSetup(true);renderSetup()}});
  document.body.append(ov);setupOpen=true}
 ov.querySelector('.so-body').innerHTML=all.map(needHTML).join('');
 const err=miss.some(n=>n.Error);
 ov.querySelector('.so-foot').innerHTML=`<small>${err?T('Prüfe deine Internetverbindung und versuche es noch einmal.','Check your internet connection and try again.'):T('Die Dateien kommen direkt vom Hersteller und werden auf Echtheit geprüft.','The files come straight from the source and are checked for authenticity.')}</small><button class="so-btn" data-later>${T('Im Hintergrund weiterladen','Keep loading in background')}</button>`}
function closeSetup(keep){if(ov){ov.remove();ov=null}setupOpen=false;if(!keep)setupHidden=false}

// ---------- 2. Update-Hinweis ----------
let pop=null;
function renderPop(){const U=S.update||{};const show=!popClosed&&(U.available||U.loading)&&!setupOpen;
 if(!show){if(pop){pop.remove();pop=null}gearDot();return}
 if(!pop){pop=el(`<div class="so-pop" translate="no" role="status"></div>`);pop.addEventListener('click',onPop);document.body.append(pop)}
 const loading=U.loading||(want&&!U.ready);
 pop.innerHTML=`<button class="so-x" data-p="close" title="${T('Schließen','Close')}">×</button>
 <div class="hd"><img src="${LOGO}" alt=""><div><b>${T('Neues Update verfügbar','New update available')}</b><span>${T('Version','Version')} <span class="so-ver">${esc(U.latest)}</span> · ${T('installiert ist','installed is')} ${esc(U.current)}</span></div></div>
 ${U.notes?`<div class="so-new"><b>${T('Was ist neu','What’s new')}</b><p>${esc(U.notes)}</p></div>`:''}
 ${loading?`<div class="so-bar"><i style="width:${pct(U.done)}%"></i></div><p class="so-note">${T('Update wird geladen …','Downloading update …')} ${pct(U.done)} %</p>`:`<p class="so-note">${esc(title())} ${T('startet dafür kurz neu. Speichere vorher deine Arbeit.','restarts briefly. Save your work first.')}</p>`}
 ${U.error?`<p class="so-note" style="color:var(--danger,#ff6b6b)">${esc(U.error)}</p>`:''}
 <div class="so-row"><button class="so-btn acc" data-p="install" ${loading||busy?'disabled':''}>${T('Jetzt installieren','Install now')}</button><button class="so-btn" data-p="close">${T('Später','Later')}</button></div>`;gearDot()}
async function install(){const U=S.update||{};if(U.ready){busy=true;renderPop();try{await api('/kit/solo/update?do=apply',{});K.toast&&K.toast(T('Wird neu gestartet …','Restarting …'))}catch(e){busy=false;K.toast&&K.toast(e.message);renderPop()}return}
 want=true;try{S.update=await api('/kit/solo/update?do=download',{})}catch(e){K.toast&&K.toast(e.message)}renderPop();fast()}
function onPop(e){const b=e.target.closest('[data-p]');if(!b)return;if(b.dataset.p==='close'){popClosed=true;renderPop()}else if(b.dataset.p==='install')install()}

// ---------- 3. Einstellungen ----------
const GEAR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const gear=el(`<button class="so-gear" title="${T('Einstellungen','Settings')}" aria-label="${T('Einstellungen','Settings')}">${GEAR}</button>`);gear.onclick=openSet;document.body.append(gear);
function gearDot(){const U=S.update||{};const has=U.available&&popClosed;let d=gear.querySelector('i');if(has&&!d)gear.append(document.createElement('i'));if(!has&&d)d.remove()}
let so=null;
function updLine(){const U=S.update||{};let txt,btn='';
 if(!S.server)txt=T('Keine Update-Quelle eingestellt.','No update source set.');
 else if(U.loading)txt=T('Update wird geladen …','Downloading update …')+' '+pct(U.done)+' %';
 else if(U.error)txt=U.error;
 else if(U.ready){txt=T('Version','Version')+' '+U.latest+' '+T('ist bereit.','is ready.');btn=`<button class="so-btn acc" data-s="apply">${T('Jetzt aktualisieren','Update now')}</button>`}
 else if(U.available){txt=T('Update auf Version','Update to version')+' '+U.latest+' '+T('verfügbar','available');btn=`<button class="so-btn acc" data-s="download">${T('Herunterladen','Download')}</button>`}
 else if(U.checking)txt=T('Sucht …','Checking …');
 else txt=U.checked?T('Du hast die neueste Version.','You have the latest version.'):T('Noch nicht gesucht.','Not checked yet.');
 if(!btn&&S.server&&!U.loading)btn=`<button class="so-btn" data-s="check">${T('Jetzt suchen','Check now')}</button>`;
 return`<div class="so-line"><div>${T('Version','Version')} ${esc(S.version)}<small>${esc(txt)}</small></div>${btn}</div>`}
function renderSet(){if(!so)return;const s=cfg||{},th=s.theme||'black',ac=s.accent||'indigo',fl=CTP[document.documentElement.dataset.theme]?document.documentElement.dataset.theme:(document.documentElement.dataset.theme==='light'?'latte':'mocha');
 so.querySelector('.so-set-body').innerHTML=`
 <div class="so-sec"><h3>Updates</h3>${updLine()}
  <div class="so-line"><div>${T('Automatisch nach Updates suchen','Check for updates automatically')}<small>${T('Beim Start und alle 6 Stunden. Installiert wird erst, wenn du es sagst.','On start and every 6 hours. Nothing is installed until you say so.')}</small></div><button class="so-tg ${S.opts&&S.opts.auto?'on':''}" data-s="auto" role="switch" aria-checked="${!!(S.opts&&S.opts.auto)}"></button></div>
  <div class="so-line"><div>${T('Update-Quelle','Update source')}<small>GitHub · ${T('jedes Update ist signiert','every update is signed')}</small></div></div></div>
 <div class="so-sec"><h3>${T('Sprache','Language')}</h3><div class="so-line"><div>${T('Sprache der App','App language')}<small>${T('Wird nach dem Neuladen übernommen.','Applies after reloading.')}</small></div><div class="so-seg"><button class="so-btn ${s.lang!=='de'?'on':''}" data-lang="en">English</button><button class="so-btn ${s.lang==='de'?'on':''}" data-lang="de">Deutsch</button></div></div></div>
 <div class="so-sec"><h3>Design</h3>
  <div class="so-ths">${THEMES.map(([k,a,b,c])=>`<button class="so-th ${th===k?'on':''}" data-th="${k}"><i style="background:${c}"></i>${T(a,b)}</button>`).join('')}</div>
  <div class="so-lab">Catppuccin</div>
  <div class="so-ths">${CTPF.map(([k,n,bg,tx])=>`<button class="so-th ctp ${th===k?'on':''}" data-th="${k}"><i style="background:${bg};color:${tx}"><b>Aa</b><span>${['mauve','pink','peach','yellow','green','sky','blue','lavender'].map(x=>`<em style="background:${CTP[k][x]}"></em>`).join('')}</span></i>${n}</button>`).join('')}</div>
  <div class="so-lab">${T('Akzentfarbe','Accent colour')}</div>
  <div class="so-sw">${Object.entries(ACC).map(([k,c])=>`<button class="${ac===k?'on':''}" data-ac="${k}" title="${k}" style="background:${c}"></button>`).join('')}</div>
  <div class="so-lab">${T('Catppuccin-Farben','Catppuccin colours')}</div>
  <div class="so-sw">${Object.entries(CTP[fl]).map(([k,c])=>`<button class="${ac==='ctp-'+k?'on':''}" data-ac="ctp-${k}" title="${k}" style="background:${c}"></button>`).join('')}</div>
  <div class="so-line"><div>${T('Kompakte Darstellung','Compact layout')}<small>${T('Weniger Abstand, mehr auf einmal sichtbar.','Less spacing, more on screen.')}</small></div><button class="so-tg ${s.density==='compact'?'on':''}" data-s="compact" role="switch"></button></div></div>`}
async function openSet(){if(so)return;try{cfg=await api('/kit/solo/settings')}catch(e){cfg={}}
 so=el(`<div class="so-ov" translate="no" role="dialog" aria-modal="true" aria-label="${T('Einstellungen','Settings')}"><div class="so-box so-set" style="--so:var(--accent)"><div class="so-hero"><img src="${LOGO}" alt=""><div><h2>${T('Einstellungen','Settings')}</h2><p>${esc(title())} · ${T('Version','version')} ${esc(S.version)}</p></div><button class="so-x" data-s="close" title="${T('Schließen','Close')}">×</button></div><div class="so-set-body"></div></div></div>`);
 so.addEventListener('click',onSet);so.addEventListener('mousedown',e=>{if(e.target===so)closeSet()});document.body.append(so);setOpen=true;renderSet();
 document.addEventListener('keydown',escSet)}
function escSet(e){if(e.key==='Escape'&&so){e.stopPropagation();closeSet()}}
function closeSet(){if(so){so.remove();so=null}setOpen=false;document.removeEventListener('keydown',escSet)}
async function save(p){try{cfg=await api('/kit/solo/settings',p);await K.applyTheme();renderSet()}catch(e){K.toast&&K.toast(e.message)}}
async function onSet(e){const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if(d.s==='close')return closeSet();
 if(d.s==='check'){S.update=await api('/kit/solo/update?do=check',{}).catch(x=>({error:x.message}));popClosed=false;renderSet();renderPop();return}
 if(d.s==='download'){want=true;S.update=await api('/kit/solo/update?do=download',{}).catch(x=>({error:x.message}));renderSet();fast();return}
 if(d.s==='apply'){try{await api('/kit/solo/update?do=apply',{});K.toast&&K.toast(T('Wird neu gestartet …','Restarting …'))}catch(x){K.toast&&K.toast(x.message)}return}
 if(d.s==='auto'){S.opts=S.opts||{};S.opts.auto=!S.opts.auto;api('/kit/solo/opts',{auto:S.opts.auto});renderSet();return}
 if(d.s==='compact')return save({density:(cfg&&cfg.density==='compact')?'normal':'compact'});
 if(d.lang){if(d.lang===(cfg.lang||'en'))return;await save({lang:d.lang});if(confirmReload())location.reload();return}
 if(d.th)return save({theme:d.th});
 if(d.ac)return save({accent:d.ac})}
function confirmReload(){return true}

// ---------- Abfrage ----------
let tmr=null;
async function poll(){try{S=await api('/kit/solo')}catch(e){}renderSetup();renderPop();if(so)renderSet();
 const U=S.update||{},quick=missing().length>0||U.loading||U.checking||(want&&!U.ready);
 if(want&&U.ready){want=false;install()}
 clearTimeout(tmr);tmr=setTimeout(poll,quick?700:30000)}
function fast(){clearTimeout(tmr);tmr=setTimeout(poll,400)}
document.addEventListener('kit-theme',()=>{if(so)renderSet()});
poll()})();
