// Grundgerüst: Zustand, Startfenster, Speichern, Rückgängig, Menüs und Tastenkürzel.
const {$,esc,api,size,base}=Kit;
const App={S:null,P:null,sel:null,t:0,undo:[],redo:[],clipboard:null,snap:true,tab:'media',dirty:false};
const RATIOS=[['16:9',1920,1080,'YouTube, Querformat'],['9:16',1080,1920,'Shorts, TikTok, Reels'],['1:1',1080,1080,'Instagram Beitrag'],['4:5',1080,1350,'Instagram Hochformat'],['4:3',1440,1080,'Klassisch'],['21:9',2560,1080,'Kino']];
const $$=s=>[...document.querySelectorAll(s)];
const uid=()=>Math.random().toString(36).slice(2,10);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

App.len=c=>c.type==='media'&&c.out>c.in?(c.out-c.in)/(c.speed||1):(c.dur||0);
App.media=id=>App.P&&App.P.media.find(m=>m.id===id);
App.total=()=>{let d=0;if(App.P)for(const t of App.P.tracks)for(const c of t.clips)d=Math.max(d,c.start+App.len(c));return d};
App.track=id=>App.P.tracks.find(t=>t.id===id);
App.find=id=>{for(const t of App.P.tracks){const c=t.clips.find(c=>c.id===id);if(c)return{t,c}}return null};
App.fmt=(s,frames)=>{s=Math.max(0,s);const fps=App.P?App.P.fps:30;const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=Math.floor(s%60),f=Math.floor((s%1)*fps+1e-6);const p=n=>String(n).padStart(2,'0');return frames===false?`${h?h+':':''}${p(m)}:${p(x)}`:`${p(h)}:${p(m)}:${p(x)}:${p(f)}`};
App.newClip=(o)=>Object.assign({id:uid(),type:'media',start:0,in:0,out:0,dur:0,speed:1,volume:1,mute:false,fadeIn:0,fadeOut:0,opacity:1,x:0,y:0,scale:1,rot:0,flipH:false,flipV:false,bright:0,contrast:0,sat:0,effect:'',name:''},o);

// Rückgängig: vor jeder Änderung den Zustand der Zeitleiste merken
App.change=(fn,keepSel)=>{App.undo.push(JSON.stringify(App.P.tracks));if(App.undo.length>150)App.undo.shift();App.redo=[];fn();App.afterChange(keepSel)};
App.afterChange=()=>{App.save();Timeline.render();Player.sync(true);Panels.props()};
App.doUndo=()=>{if(!App.undo.length)return;App.redo.push(JSON.stringify(App.P.tracks));App.P.tracks=JSON.parse(App.undo.pop());App.validateSel();App.afterChange()};
App.doRedo=()=>{if(!App.redo.length)return;App.undo.push(JSON.stringify(App.P.tracks));App.P.tracks=JSON.parse(App.redo.pop());App.validateSel();App.afterChange()};
App.validateSel=()=>{if(App.sel&&App.sel.clip&&!App.find(App.sel.clip))App.sel=null};

let saveT=null;
App.dirty=false;
App.body=()=>({name:App.P.name,w:App.P.w,h:App.P.h,fps:App.P.fps,tracks:App.P.tracks,markers:App.P.markers||[]});
App.mark=d=>{App.dirty=d;const el=$('#saved');el.classList.toggle('unsaved',d);el.classList.remove('justsaved');el.textContent=d?Kit.t('Nicht gespeichert'):''};
// Änderungen landen sofort im Arbeitsstand (Absturzschutz), wirklich gespeichert wird erst mit „Speichern“
App.save=()=>{clearTimeout(saveT);const first=!App.dirty;App.mark(true);const go=async()=>{saveT=null;try{await api('api/project?id='+App.P.id,App.body())}catch(e){}};if(first)go();else saveT=setTimeout(go,500)};
App.saveNow=async()=>{if(!App.P)return;clearTimeout(saveT);saveT=null;try{await api('api/save?id='+App.P.id,App.body());App.mark(false);const el=$('#saved');el.textContent=Kit.t('Gespeichert');el.classList.add('justsaved');Kit.toast(Kit.t('Projekt gespeichert.'))}catch(e){Kit.toast(e.message);throw e}};
// Fragt vor dem Verlassen nach, wenn es ungespeicherte Änderungen gibt. Ergebnis: true = weitermachen
App.askUnsaved=(leave)=>new Promise(res=>{if(!App.P||!App.dirty)return res(true);
 Panels.modal(`<div class="unsaved-dlg"><div class="ud-ico"><svg viewBox="0 0 24 24"><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18v.5"/></svg></div>
  <h2>${leave?'Projekt verlassen, ohne zu speichern?':'Tool schließen, ohne zu speichern?'}</h2>
  <p>Du hast seit dem letzten Speichern Änderungen an <b>${esc(App.P.name)}</b> gemacht. Ohne Speichern gehen sie verloren.</p>
  <div class="ud-btns"><button class="btn primary" data-ud="save">Speichern</button><button class="btn danger" data-ud="discard">Nicht speichern</button><button class="btn" data-ud="cancel">Abbrechen</button></div></div>`);
 Panels.locked=true;
 $('#mbox').onclick=async e=>{const b=e.target.closest('[data-ud]');if(!b)return;const d=b.dataset.ud;Panels.locked=false;
  if(d==='cancel'){Panels.close();return res(false)}
  if(d==='save'){b.disabled=true;try{await App.saveNow()}catch(x){return}Panels.close();return res(true)}
  clearTimeout(saveT);saveT=null;try{await api('api/revert?id='+App.P.id,{})}catch(x){}App.mark(false);Panels.close();res(true)}});
// Fenster schließen (vom Programm gemeldet, wenn noch etwas ungespeichert ist)
Kit._closeAsk=async()=>{if(!App.P||!App.dirty){try{await api('api/revert?id='+(App.P&&App.P.id||''),{})}catch(e){}return api('kit/quit',{})}
 if(await App.askUnsaved(false)){App.quitting=true;api('kit/quit',{})}};
// Linux (Browserfenster): beim Schließen mit ungespeicherten Änderungen fragt der Browser nach
addEventListener('beforeunload',e=>{if(App.dirty&&!App.quitting){e.preventDefault();e.returnValue=''}});

// Startfenster
async function loadState(){App.S=await api('api/state');FX.effects=App.S.effects}
function viewStart(){$('#editor').hidden=true;$('#start').hidden=false;Player.stop();
 const e=App.S.engine;
 $('#setup').innerHTML=e.ready?'':`<div class="setupcard"><div><b>Einmalig einrichten</b><small>Zum Schneiden braucht die App das kostenlose Programm ffmpeg (etwa 80 MB). Es wird einmal geladen, auf Echtheit geprüft und von allen Werkzeugen gemeinsam genutzt.</small>${e.loading?`<div class="bar2"><i style="width:${Math.round(e.done*100)}%"></i></div>`:''}${e.error?`<small class="err">${esc(e.error)}</small>`:''}</div>${e.loading?`<span class="muted">${Math.round(e.done*100)} %</span>`:'<button class="btn primary" id="install">Einrichten</button>'}</div>`;
 $('#ratios').innerHTML=RATIOS.map(([n,w,h,d])=>{const k=48/Math.max(w,h);return`<button class="ratio" data-new="${w}x${h}"><i style="width:${w*k}px;height:${h*k}px"></i><b>${n}</b><small>${d}</small></button>`}).join('');
 $('#pcount').textContent=App.S.projects.length+' insgesamt';
 const pq=($('#psearch')?.value||'').trim().toLowerCase();$('#plist').innerHTML=App.S.projects.filter(p=>!pq||(p.Name||'').toLowerCase().includes(pq)).map(p=>`<button class="proj" data-open="${p.ID}"><div class="th"><img src="api/thumb?id=${p.ID}&_=${p.Updated}" alt="" style="width:100%;height:100%;object-fit:cover;opacity:1" onerror="this.onerror=null;this.src='logo.svg';this.style.cssText='width:64px;height:64px;opacity:.85'"></div><div class="tx"><div class="tr"><b>${esc(p.Name)}</b><em class="tag">${esc((p.Detail||'').split(' · ')[0])}</em></div><span>${esc((p.Detail||'').split(' · ').slice(1).join(' · ')||Kit.t('Video-Projekt'))}</span><i class="open">${Kit.t('Öffnen')}</i></div><span class="pacts"><span data-ren="${p.ID}" title="${Kit.t('Umbenennen')}">✎</span><span data-dupp="${p.ID}" title="${Kit.t('Duplizieren')}">⧉</span><span class="del" data-del="${p.ID}" title="${Kit.t('Löschen')}"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></span></span></button>`).join('')||'<div class="ch-empty"><svg viewBox="0 0 48 48"><rect x="6" y="9" width="36" height="24" rx="5"/><path d="M21 16l9 5-9 5zM10 40h28M24 37v6"/></svg><b>Noch keine Projekte</b><p>Wähle oben ein Format, um anzufangen. Videos kannst du danach einfach ins Fenster ziehen.</p></div>'}

async function openProject(id){const p=await api('api/project?id='+id);App.P=p;App.sel=null;App.undo=[];App.redo=[];App.t=0;
 for(const t of p.tracks)for(const c of t.clips){c.opacity=c.opacity||(c.opacity===0?0.01:1);c.speed=c.speed||1;c.scale=c.scale||1;if(c.volume==null)c.volume=1}
 $('#start').hidden=true;$('#editor').hidden=false;$('#pname').value=p.name;$('#saved').textContent='';
 Timeline.init();Player.init();Panels.lib();Panels.props();Timeline.fit();pollMedia();App.mark(!!p.dirty);if(p.draft)askDraft()}
// Beim letzten Mal ohne Speichern beendet (oder abgestürzt): Arbeitsstand anbieten
function askDraft(){Panels.modal(`<div class="unsaved-dlg"><div class="ud-ico info"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg></div>
 <h2>Nicht gespeicherte Änderungen gefunden</h2><p>Beim letzten Mal wurde <b>${esc(App.P.name)}</b> geschlossen, ohne die letzten Änderungen zu speichern. Möchtest du sie wiederherstellen?</p>
 <div class="ud-btns"><button class="btn primary" data-dr="restore">Wiederherstellen</button><button class="btn" data-dr="discard">Verwerfen</button></div></div>`);Panels.locked=true;
 $('#mbox').onclick=async e=>{const b=e.target.closest('[data-dr]');if(!b)return;Panels.locked=false;await api('api/draft?id='+App.P.id+'&do='+b.dataset.dr,{});Panels.close();if(b.dataset.dr==='restore'){const id=App.P.id;App.P=null;await openProject(id)}}}

let pollT=null;
async function pollMedia(){clearTimeout(pollT);if(!App.P)return;try{const ms=await api('api/media?id='+App.P.id);let busy=false,changed=false;
 for(const m of ms){const o=App.media(m.id);if(!o)continue;if(o.proxy!==m.proxy||o.thumbs!==m.thumbs||o.wave!==m.wave||Math.abs((o.proxyPct||0)-(m.proxyPct||0))>.05)changed=true;Object.assign(o,m);if(m.proxy==='wait'||m.proxy==='work')busy=true}
 if(changed){Panels.libRefreshMedia();Timeline.render();Player.sync(true)}
 pollT=setTimeout(pollMedia,busy?1000:4000)}catch(e){pollT=setTimeout(pollMedia,4000)}}

// ffmpeg fehlt noch: automatisch einrichten und warten, statt den Import abzulehnen
App.needEngine=async()=>{try{App.S=await api('api/state')}catch(e){}if(App.S.engine.ready)return true;if(!App.S.engine.loading){try{await api('api/engine/install',{})}catch(e){}}
 for(let i=0;i<1800;i++){await new Promise(r=>setTimeout(r,1000));try{App.S=await api('api/state')}catch(e){continue}const e=App.S.engine;if(e.ready)return true;if(!e.loading&&e.error){Kit.toast(Kit.t('ffmpeg konnte nicht eingerichtet werden:')+' '+e.error);return false}if(i%3===0)Kit.toast(Kit.t('ffmpeg wird einmalig eingerichtet …')+' '+Math.round((e.done||0)*100)+' %')}return false};
App.importPaths=async(paths)=>{if(!paths.length)return[];if(!await App.needEngine())return[];try{const ms=await api('api/import',{id:App.P.id,paths});for(const m of ms)if(!App.media(m.id))App.P.media.push(m);App.tab==='media'?Panels.lib():Panels.libRefreshMedia();pollMedia();return ms}catch(e){Kit.toast(e.message);return[]}};

// Menüs
document.addEventListener('click',e=>{const dd=e.target.closest('.dd');$$('.dd').forEach(d=>{if(d!==dd)d.classList.remove('open')});if(e.target.closest('.mbtn'))dd.classList.toggle('open');else if(e.target.closest('.ddm button'))dd&&dd.classList.remove('open')});
document.addEventListener('click',async e=>{const t=e.target;let el;
 try{
 if(el=t.closest('[data-new]')){const[w,h]=el.dataset.new.split('x').map(Number);const base=Kit.t('Mein Video'),names=new Set(App.S.projects.map(x=>x.Name));let nm=base,i=2;while(names.has(nm))nm=base+' '+i++;const p=await api('api/new',{name:nm,w,h,fps:30});await loadState();return openProject(p.id)}
 if(el=t.closest('[data-del]')){e.stopPropagation();if(!confirm(Kit.t('Projekt wirklich löschen? Deine Videodateien bleiben erhalten.')))return;await api('api/delete?id='+el.dataset.del,{});await loadState();return viewStart()}
 if(el=t.closest('[data-dupp]')){e.stopPropagation();await api('api/duplicate?id='+el.dataset.dupp,{});await loadState();Kit.toast(Kit.t('Projekt dupliziert.'));return viewStart()}
 if(el=t.closest('[data-ren]')){e.stopPropagation();const id=el.dataset.ren,pr=App.S.projects.find(x=>x.ID===id);Panels.modal(`<div class="mhead"><h3>${Kit.t('Projekt umbenennen')}</h3></div><div class="mbody"><input id="rnin" style="width:100%" value="${esc(pr?pr.Name:'')}"></div><div class="mfoot"><button class="btn" data-close>${Kit.t('Abbrechen')}</button><button class="btn primary" id="rnok">${Kit.t('Umbenennen')}</button></div>`);
  const inp=document.getElementById('rnin');inp.focus();inp.select();const go=async()=>{const v=inp.value.trim();if(!v)return;Panels.close();await api('api/rename',{ID:id,Name:v});await loadState();viewStart()};document.getElementById('rnok').onclick=go;inp.onkeydown=ev=>{if(ev.key==='Enter')go()};return}
 if(el=t.closest('[data-open]'))return openProject(el.dataset.open);
 if(t.closest('#install')){await api('api/engine/install',{});const iv=setInterval(async()=>{await loadState();viewStart();if(!App.S.engine.loading)clearInterval(iv)},700);return}
 if(el=t.closest('[data-act]'))return App.act(el.dataset.act,el);
 }catch(x){Kit.toast(x.message)}});

App.act=async(a,el)=>{const P=App.P;if(typeof Timeline!=='undefined'&&Timeline.closeMenu)Timeline.closeMenu();
 if(typeof Pro!=='undefined'&&Pro.ACTS[a])return Pro.ACTS[a](el);
 switch(a){
 case'home':await App.flush();if(!await App.askUnsaved(true))return;await loadState();return viewStart();
 case'save':return App.saveNow();
 case'new':await App.flush();if(!await App.askUnsaved(true))return;await loadState();return viewStart();
 case'import':{const p=await Kit.pick('files','Medien|*.mp4;*.mov;*.mkv;*.webm;*.avi;*.mp3;*.wav;*.m4a;*.flac;*.ogg;*.png;*.jpg;*.jpeg;*.gif;*.webp');App.tab='media';Panels.sub.media='project';Panels.lib();return App.importPaths(p)}
 case'projset':return Panels.projectSettings();
 case'export':return Panels.exportDialog();
 case'undo':return App.doUndo();case'redo':return App.doRedo();
 case'split':return Timeline.split();case'delete':return Timeline.del();
 case'copy':return Timeline.copy();case'paste':return Timeline.paste();
 case'selall':return Timeline.selectAll();
 case'speed':return Panels.props('speed');
 case'addtext':return Panels.addTitle(0);
 case'detach':return Timeline.detachAudio();
 case'snap':App.snap=!App.snap;$('#snapbtn').classList.toggle('on',App.snap);return;
 case'addtrack':return Timeline.addTrackMenu(el);
 case'zoomin':return Timeline.zoomBy(1.4);case'zoomout':return Timeline.zoomBy(1/1.4);case'fit':return Timeline.fit();
 case'play':return Player.toggle();case'stop':Player.pause();return Player.seek(0);
 case'tostart':return Player.seek(0);
 case'prev':return Player.seek(App.t-1/P.fps);case'next':return Player.seek(App.t+1/P.fps);
 case'snapshot':return Player.snapshot();
 case'fullscreen':{const s=$('#stage');document.fullscreenElement?document.exitFullscreen():s.requestFullscreen();return}
 case'keys':return Panels.keys();
 case'layout':return Layout.reset();
 case'rotl':return Timeline.rot90(-1);case'rotr':return Timeline.rot90(1);case'freeze':return Timeline.freeze();
 case'cut':return Timeline.cut();case'dup':return Timeline.duplicate();case'ripple':return Timeline.rippleDel();case'gap':return Timeline.closeGap();
 case'trims':return Timeline.trimTo('start');case'trime':return Timeline.trimTo('end');case'marker':return Timeline.addMarker();case'mute':return Timeline.toggleMute();
 case'copyfx':return Timeline.copyFx();case'pastefx':return Timeline.pasteFx();case'reverse':{const f=App.sel&&App.find(App.sel.clip);if(f)App.change(()=>{f.c.reverse=!f.c.reverse},true);return}
 case'pmute':Player.muted=!Player.muted;el=$('#pmute');el.classList.toggle('off',Player.muted);el.innerHTML=Player.muted?'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/></svg>':'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7"/></svg>';return Player.sync(true);
 }};
App.flush=async()=>{if(saveT){clearTimeout(saveT);saveT=null;try{await api('api/project?id='+App.P.id,{name:App.P.name,w:App.P.w,h:App.P.h,fps:App.P.fps,tracks:App.P.tracks,markers:App.P.markers||[]})}catch(e){}}};

$('#pname').addEventListener('change',e=>{App.P.name=e.target.value.trim()||App.P.name;App.save()});

// Tastenkürzel: siehe keys.js (frei belegbar)

// Dateien ins Fenster ziehen: in die Medien des Projekts übernehmen (im Audio-Reiter: als eigene Sounds speichern)
Kit.onDrop(async paths=>{if($('#editor').hidden)return;if(App.tab==='audio'&&Panels.sub.audio==='mine'&&!App.dropAt){await Panels.addSounds(paths);return}if(App.tab==='media'&&Panels.sub.media==='global'&&!App.dropAt){await Panels.addGlobal(paths);return}App.tab='media';Panels.sub.media='project';Panels.lib();const ms=await App.importPaths(paths);if(ms.length&&App.dropAt){Timeline.addMediaAt(ms,App.dropAt);App.dropAt=null}});
window.addEventListener('beforeunload',()=>{if(saveT)App.flush()});

loadState().then(()=>{viewStart();$('#snapbtn').classList.add('on');Keys.load()});

// Bereiche: siehe dock.js (verschieben, andocken, Größen ändern)
const Layout={reset:()=>Dock.reset()};
new ResizeObserver(es=>{for(const x of es)x.target.classList.toggle('narrow',x.contentRect.width<560)}).observe($('#lib'));
Dock.onChange(()=>{if(App.P){Timeline.render();Player.draw()}});Dock.init();

// Keyframes (wie in Filmora): Werte ändern sich über die Zeit. Zeiten sind relativ zum Clipanfang.
App.KF=['x','y','scale','rot','opacity','volume'];
App.ease=u=>u*u*(3-2*u);
App.kv=(c,p,t=App.t)=>{const k=c.kf&&c.kf[p];if(!k||!k.length)return c[p]??({scale:1,opacity:1,volume:1}[p]??0);const r=t-c.start;
 if(r<=k[0][0])return k[0][1];for(let i=1;i<k.length;i++)if(r<k[i][0]){const[a,va]=k[i-1],[b,vb]=k[i];const u=(r-a)/Math.max(1e-6,b-a);return va+(vb-va)*(c.kfLin?u:App.ease(u))}return k[k.length-1][1]};
App.hasKf=(c,p)=>!!(c.kf&&c.kf[p]&&c.kf[p].length);
App.kfAt=(c,p)=>{const r=App.t-c.start,k=c.kf&&c.kf[p];return k?k.findIndex(x=>Math.abs(x[0]-r)<.5/App.P.fps):-1};
// Wert setzen: hat die Eigenschaft Keyframes, wird an der Abspielposition ein Keyframe gesetzt oder geändert
App.setv=(c,p,v)=>{if(!App.hasKf(c,p)){c[p]=v;return}const r=Math.max(0,Math.min(App.len(c),App.t-c.start));const k=c.kf[p];const i=App.kfAt(c,p);if(i>=0)k[i][1]=v;else{k.push([r,v]);k.sort((a,b)=>a[0]-b[0])}};
App.kfToggle=(c,p)=>{c.kf=c.kf||{};const k=c.kf[p]=c.kf[p]||[];const i=App.kfAt(c,p);const r=Math.max(0,Math.min(App.len(c),App.t-c.start));
 if(i>=0){const v=k[i][1];k.splice(i,1);if(!k.length){delete c.kf[p];c[p]=v}}else{k.push([r,App.kv(c,p)]);k.sort((a,b)=>a[0]-b[0])}};
// Keyframes an einer Stelle r (relativ zum Clipanfang) teilen: links bleibt, rechts beginnt bei 0
App.kfCut=(c,r)=>{if(!c.kf)return[undefined,undefined];const L={},R={};for(const p in c.kf){const k=c.kf[p];const v=App.kv(c,p,c.start+r);
  const a=k.filter(x=>x[0]<r-1e-4).map(x=>[x[0],x[1]]);a.push([r,v]);const b=[[0,v],...k.filter(x=>x[0]>r+1e-4).map(x=>[x[0]-r,x[1]])];L[p]=a;R[p]=b}return[L,R]};
// Textanimation zur Zeit t (gleiche Formeln wie beim Export)
App.anim=(c,t=App.t)=>{const an=c.anim;if(!an||(!an.in&&!an.out))return null;const L=App.len(c);const d=Math.min(an.d||.5,L/2);const r=t-c.start;
 const sm=u=>{u=Math.min(1,Math.max(0,u));return u*u*(3-2*u)};const o={dx:0,dy:0,a:1,s:1,chars:-1};
 const add=(k,e,out)=>{const v=out?-.25:.25;if(k==='fade')o.a*=e;else if(k==='slide-l'){o.dx+=-.5*(1-e);o.a*=e}else if(k==='slide-r'){o.dx+=.5*(1-e);o.a*=e}
  else if(k==='slide-u'){o.dy+=v*(1-e);o.a*=e}else if(k==='slide-d'){o.dy+=-v*(1-e);o.a*=e}else if(k==='pop'){o.s*=Math.max(.05,.2+.8*e+.12*Math.sin(Math.PI*e));o.a*=Math.min(1,2*e)}};
 if(an.in==='type'){const td=Math.min(L*.8,Math.max(d,.6));const n=[...(c.text?.content||'')].length;const steps=Math.max(1,Math.min(120,n));const k=Math.min(steps,Math.floor(r/td*steps)+1);o.chars=Math.ceil(n*k/steps)}
 else add(an.in,sm(r/d),false);add(an.out,sm((L-r)/d),true);return o};
App.BLEND={darken:'darken',multiply:'multiply',burn:'color-burn',lighten:'lighten',screen:'screen',dodge:'color-dodge',overlay:'overlay',softlight:'soft-light',hardlight:'hard-light',difference:'difference',exclusion:'exclusion',add:'lighter'};

document.addEventListener('input',e=>{if(e.target.id==='psearch'&&typeof viewStart==='function')viewStart()});
