// Motion Design – Steuerung: Startfenster, Projekte, Speichern, Rückgängig, Aktionen, Tastenkürzel, Abspielen.
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const t=s=>Kit.t(s),esc=s=>Kit.esc(String(s??''));
const E={S:null,doc:null,proj:null,compId:null,sel:new Set(),selKeys:new Set(),time:0,playing:false,tool:'select',shapeTool:'rect',toolMode:'shape',
 undo:[],redo:[],dirty:false,view:{grid:false,safe:false,checker:false,paths:true},shy:false,graph:false,newFill:'#ff4d6d',newStroke:'#ffffff',newStrokeW:0,newStrokeOn:false};
const fmtT=(s,fps=30)=>{s=Math.max(0,s||0);const f=Math.round(s*fps);const fr=f%Math.round(fps),sec=Math.floor(f/Math.round(fps));return`${String(Math.floor(sec/3600)).padStart(1,'0')}:${String(Math.floor(sec/60)%60).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}:${String(fr).padStart(2,'0')}`};
const parseT=(str,fps)=>{str=String(str).trim();if(/^\d+$/.test(str))return(+str)/fps;const p=str.split(/[:;.]/).map(Number);if(p.some(isNaN))return null;while(p.length<4)p.unshift(0);return p[0]*3600+p[1]*60+p[2]+p[3]/fps};
const App={};
App.comp=()=>E.proj&&E.proj.comps.find(c=>c.id===E.compId);
App.layer=id=>{const c=App.comp();return c&&c.layers.find(l=>l.id===id)};
App.selLayers=()=>{const c=App.comp();return c?c.layers.filter(l=>E.sel.has(l.id)):[]};
App.sel1=()=>App.selLayers()[0]||null;
App.snapT=s=>{const c=App.comp();const f=c?c.fps:30;return Math.round(s*f)/f};
// ---------- Neu zeichnen ----------
let needView=false,needTL=false,needPanel=false,rafId=0;
App.redraw=(what='all')=>{if(what==='all'||what==='view')needView=true;if(what==='all'||what==='tl')needTL=true;if(what==='all'||what==='panel')needPanel=true;if(!rafId)rafId=requestAnimationFrame(frame)};
function frame(){rafId=0;if(E.playing)tick();if(needView){needView=false;Viewer.draw()}if(needTL){needTL=false;Timeline.render()}else Timeline.update();if(needPanel){needPanel=false;Panels.render()}else Panels.update();if(E.playing&&!rafId)rafId=requestAnimationFrame(frame)}
M.onSeeked=()=>{if(!E.playing)App.redraw('view')};
// ---------- Zeit und Abspielen ----------
App.setTime=(s,keep)=>{const c=App.comp();if(!c)return;E.time=M.clamp(App.snapT(s),0,c.dur-1/c.fps);if(E.playing&&!keep)App.syncAudio(true);App.redraw('view');Timeline.update();Panels.update()};
let playT0=0,playS0=0;
App.work=()=>{const c=App.comp();if(!c)return[0,0];const w=c.work||[0,c.dur];return[M.clamp(w[0],0,c.dur),M.clamp(w[1],0,c.dur)]};
App.play=()=>{const c=App.comp();if(!c)return;if(E.playing)return App.pause();const [a,b]=App.work();if(E.time<a||E.time>=b-1/c.fps)E.time=a;E.playing=true;M.playing=true;playT0=performance.now();playS0=E.time;App.syncAudio(true);$('#bplay').classList.add('on');App.redraw('view')};
App.pause=()=>{E.playing=false;M.playing=false;App.stopMedia();$('#bplay')?.classList.remove('on');App.redraw('all')};
function tick(){const c=App.comp();if(!c)return App.pause();const [a,b]=App.work();let s=playS0+(performance.now()-playT0)/1000;if(s>=b){playS0=a;playT0=performance.now();s=a;App.syncAudio(true)}E.time=s;needView=true}
// Ton: Ton- und Videoebenen spielen beim Abspielen mit
App.stopMedia=()=>{for(const m of Object.values(M.media))if(m.clones)for(const e of Object.values(m.clones)){if(!e.paused)e.pause();e.muted=true}};
App.syncAudio=(restart)=>{const comp=App.comp();if(!comp)return;const act=new Set();const walk=(cp,t0,mute,depth)=>{for(const l of cp.layers){if(t0<l.in||t0>=l.out)continue;if(l.type==='comp'&&depth<6){const s=M.compById(l.comp);if(s)walk(s,t0-(l.st||0),mute||l.hidden,depth+1);continue}
   if(l.type!=='audio'&&l.type!=='video')continue;const e=M.elFor(l);if(!e)continue;act.add(e);const silent=mute||l.audioOff||(l.type==='audio'&&l.hidden);e.muted=silent;const vol=M.val(l.vol,{comp:cp,layer:l,t:M.ltime(l,t0),ct:t0})/100;e.volume=M.clamp(vol,0,1);e.playbackRate=l.speed||1;
   const st=M.srcTime(l,t0);if(restart||Math.abs(e.currentTime-st)>.3)e.currentTime=st;if(e.paused)e.play().catch(()=>{})}};walk(comp,E.time,false,0);
  for(const m of Object.values(M.media))if(m.clones)for(const e of Object.values(m.clones))if(!act.has(e)&&!e.paused&&e.tagName==='AUDIO')e.pause()};
setInterval(()=>{if(E.playing)App.syncAudio(false)},400);
// ---------- Rückgängig ----------
const snap=()=>JSON.stringify({comps:E.proj.comps,compId:E.compId});
let pending=null;
App.begin=()=>{if(!pending)pending=snap()};
App.commit=(what='all')=>{if(pending){if(pending!==snap()){E.undo.push(pending);if(E.undo.length>120)E.undo.shift();E.redo=[];App.markDirty()}pending=null}App.redraw(what)};
App.change=(fn,what='all')=>{App.begin();fn();App.commit(what)};
App.cancel=()=>{if(pending){const s=JSON.parse(pending);E.proj.comps=s.comps;pending=null;App.redraw()}};
App.doUndo=()=>{if(!E.undo.length)return Kit.toast(t('Nichts zum Rückgängigmachen.'));E.redo.push(snap());const s=JSON.parse(E.undo.pop());E.proj.comps=s.comps;if(App.compOk(s.compId))E.compId=s.compId;App.validate();App.markDirty();App.redraw()};
App.doRedo=()=>{if(!E.redo.length)return;E.undo.push(snap());const s=JSON.parse(E.redo.pop());E.proj.comps=s.comps;if(App.compOk(s.compId))E.compId=s.compId;App.validate();App.markDirty();App.redraw()};
App.compOk=id=>E.proj.comps.some(c=>c.id===id);
App.validate=()=>{const c=App.comp();if(!c){E.compId=E.proj.comps[0]?.id;}const cc=App.comp();if(!cc)return;for(const id of[...E.sel])if(!cc.layers.some(l=>l.id===id))E.sel.delete(id);E.selKeys.clear();M.project=E.proj};
// ---------- Speichern ----------
let saveTimer=0;
App.markDirty=()=>{E.dirty=true;$('#saved').textContent=t('Nicht gespeichert');$('#saved').classList.add('unsaved');fetch(`api/dirty?id=${E.doc.id}&v=1`).catch(()=>{});clearTimeout(saveTimer);saveTimer=setTimeout(()=>App.save(true),4000)};
App.save=async(auto)=>{if(!E.doc)return;clearTimeout(saveTimer);const c=E.proj.comps[0];const main=App.comp()||c;
 const data={v:1,comps:E.proj.comps,compId:E.compId,open:E.proj.open,view:E.view};
 const durs=E.proj.comps.find(x=>x.id===(E.proj.mainComp||main.id))||main;
 try{await Kit.api('api/save',{ID:E.doc.id,Name:E.doc.name,W:main.w,H:main.h,Detail:`${main.w} × ${main.h} · ${fmtDur(durs.dur)}`,Keep:E.proj.assets.map(a=>a.id),Data:data});E.dirty=false;$('#saved').textContent=t('Gespeichert');$('#saved').classList.remove('unsaved');
  App.thumb()}catch(e){if(!auto)Kit.toast(e.message)}};
const fmtDur=s=>s>=60?`${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')} min`:`${Math.round(s*10)/10} s`;
App.thumb=()=>{const c=App.comp();if(!c)return;const S=Math.min(1,480/Math.max(c.w,c.h));const tt=Math.min(c.dur-1/c.fps,Math.max(E.time,c.dur*.4));try{const cv=M.render(c,tt,S,{noMB:true,noSync:true});cv.toBlob(b=>{if(b)fetch(`api/thumb?id=${E.doc.id}`,{method:'POST',body:b})},'image/png');M.putCv(cv)}catch(e){}};
Kit.onSave=()=>App.save();
window.addEventListener('beforeunload',()=>{if(E.dirty&&E.doc)navigator.sendBeacon&&App.save(true)});
// ---------- Projekte ----------
App.loadState=async()=>{E.S=await Kit.api('api/state');Start.render()};
App.open=async(id)=>{const d=await Kit.api('api/project?id='+id);E.doc={id:d.id,name:d.name};M.pid=d.id;const data=d.data&&d.data.comps?d.data:null;
 E.proj={comps:data?data.comps:[M.newComp({name:t('Komp 1'),w:d.w,h:d.h})],assets:d.assets||[],open:data?.open||[]};if(data&&data.view)Object.assign(E.view,data.view);
 E.compId=(data&&App.compOk(data.compId))?data.compId:E.proj.comps[0].id;M.project=E.proj;E.undo=[];E.redo=[];E.sel.clear();E.selKeys.clear();E.time=0;E.dirty=false;
 for(const k in M.media)delete M.media[k];await Promise.all(E.proj.assets.map(a=>M.loadAsset(a)));
 $('#start').hidden=true;$('#editor').hidden=false;$('#pname').value=d.name;$('#saved').textContent='';$('#saved').classList.remove('unsaved');
 Viewer.fitNext=true;App.redraw();if(!data)App.save(true)};
App.home=async()=>{if(E.playing)App.pause();if(E.dirty)await App.save(true);$('#editor').hidden=true;$('#start').hidden=false;$('#backEd').hidden=!E.doc;App.loadState()};
App.create=async(name,w,h,fps,dur,tpl)=>{const comp=M.newComp({name:t('Komp 1'),w,h,fps,dur});if(tpl){tpl.build(comp);for(const l of comp.layers){l.name=t(l.name);if(l.text){l.text.str=t(l.text.str);for(const a of l.text.anims||[])a.name=t(a.name)}}}const d=await Kit.api('api/new',{Name:name||(tpl?t(tpl.name):t('Meine Animation')),W:w,H:h,Data:{v:1,comps:[comp],compId:comp.id}});await App.open(d.id);App.save(true)};
// ---------- Startfenster ----------
const Start={};
const PRESETS=[['YouTube','1920×1080 · 16:9',1920,1080],['Shorts / TikTok','1080×1920 · 9:16',1080,1920],['Instagram','1080×1080 · 1:1',1080,1080],['Instagram Hochkant','1080×1350 · 4:5',1080,1350],['4K','3840×2160',3840,2160],['Logo / Sticker','1000×1000',1000,1000]];
Start.render=()=>{const S=E.S;$('#presets').innerHTML=PRESETS.map(([n,d,w,h],i)=>{const k=60/Math.max(w,h);return`<button class="preset" data-pre="${i}"><div class="pv"><i style="width:${w*k}px;height:${h*k}px"></i></div><b>${esc(t(n))}</b><small>${d}</small></button>`}).join('');
 $('#tpls').innerHTML=TEMPLATES.map((x,i)=>`<button class="tpl" data-tpl="${i}"><div class="tpv" style="background:${x.bg}">${x.icon}</div><b>${esc(t(x.name))}</b><small>${esc(t(x.desc))}</small></button>`).join('');
 const q=($('#psearch').value||'').toLowerCase();const ps=(S.projects||[]).filter(p=>!q||p.name.toLowerCase().includes(q));
 $('#projects').innerHTML=ps.map(p=>`<button class="proj" data-open="${p.id}"><div class="th">${p.thumb?`<img src="api/thumb?id=${p.id}&_=${p.updated}" alt="" onerror="this.className='ph';this.src='logo.svg'">`:'<img class="ph" src="logo.svg" alt="">'}</div><div class="tx"><div class="tr"><b translate="no">${esc(p.name)}</b><em class="tag">${esc(p.detail||p.w+' × '+p.h)}</em></div><span>${esc(new Date(p.updated*1000).toLocaleDateString(Kit.lang==='de'?'de-DE':'en-US'))}</span><i class="open">${esc(t('Öffnen'))}</i></div><span class="pacts"><span data-ren="${p.id}" data-name="${esc(p.name)}" title="${esc(t('Umbenennen'))}">✎</span><span data-dupp="${p.id}" title="${esc(t('Duplizieren'))}">⧉</span><span class="del" data-del="${p.id}" data-name="${esc(p.name)}" title="${esc(t('Löschen'))}">✕</span></span></button>`).join('')||`<div class="ch-empty"><svg viewBox="0 0 48 48"><circle cx="34" cy="14" r="7"/><path d="M8 40c6-2 10-6 13-11M6 22h12M4 30h9M12 14h10"/></svg><b>${esc(t('Noch keine Projekte'))}</b><p>${esc(t('Wähle oben ein Format oder starte mit einer Vorlage.'))}</p></div>`};
document.addEventListener('click',async e=>{const el=e.target.closest('[data-pre],[data-tpl],[data-open],[data-ren],[data-dupp],[data-del],#newCustom,#backEd');if(!el||!$('#editor').hidden)return;
 const fps=+$('#nfps').value||30,dur=Math.max(1,+$('#ndur').value||10);
 try{if(el.dataset.ren){e.stopPropagation();const n=prompt(t('Neuer Name:'),el.dataset.name);if(n&&n.trim()){await Kit.api('api/rename',{ID:el.dataset.ren,Name:n.trim()});App.loadState()}return}
  if(el.dataset.dupp){e.stopPropagation();await Kit.api('api/duplicate?id='+el.dataset.dupp,{});return App.loadState()}
  if(el.dataset.del){e.stopPropagation();if(confirm(t('Projekt löschen?')+'\n'+el.dataset.name)){await Kit.api('api/delete?id='+el.dataset.del,{});App.loadState()}return}
  if(el.dataset.pre){const p=PRESETS[+el.dataset.pre];return App.create('',p[2],p[3],fps,dur)}
  if(el.dataset.tpl){const x=TEMPLATES[+el.dataset.tpl];return App.create('',x.w||1920,x.h||1080,30,x.dur||5,x)}
  if(el.dataset.open)return App.open(el.dataset.open);
  if(el.id==='newCustom'){const w=+$('#nw').value,h=+$('#nh').value;if(!(w>=16&&h>=16))return Kit.toast(t('Ungültige Größe.'));return App.create('',Math.round(w),Math.round(h),fps,dur)}
  if(el.id==='backEd'){$('#start').hidden=true;$('#editor').hidden=false;App.redraw()}}catch(x){Kit.toast(x.message)}});
$('#psearch').addEventListener('input',()=>Start.render());
// ---------- Vorlagen ----------
const K=(p,t,v,e=true)=>{M.setKey(p,t,v);if(e){const k=p.k.find(x=>Math.abs(x.t-t)<1e-4);k.eo=M.EASE_O;k.ei=M.EASE_I}};
const TEMPLATES=[
 {name:'Titel-Intro',desc:'Großer Titel mit Buchstaben-Animation',bg:'linear-gradient(135deg,#1b1f3b,#4f5bd5)',icon:'<b style="font-size:26px">Aa</b>',dur:5,build:c=>{c.bg='#101225';
   const bg=M.newLayer('solid',c,{name:'Hintergrund',color:'#14183a'});const g=M.newFx('ramp');g.params.p1.v=[c.w/2,0];g.params.p2.v=[c.w/2,c.h];g.params.c1.v='#2b2f77';g.params.c2.v='#0c0d1f';bg.fx.push(g);
   const tx=M.newLayer('text',c,{str:'DEIN TITEL',size:Math.round(c.h*.14)});tx.tr.pos.v=[c.w/2,c.h/2+c.h*.05];const a={id:M.uid(),name:'Aufsteigen',on:true,unit:'ch',shape:'up',s:M.P(0),e:M.P(100),o:M.P(0),props:{op:M.P(0),pos:M.P([0,c.h*.08]),blur:M.P(12)}};K(a.o,0,-100);K(a.o,1.4,100);tx.text.anims.push(a);
   const sub=M.newLayer('text',c,{str:'Untertitel',size:Math.round(c.h*.04)});sub.text.bold=false;sub.text.track.v=300;sub.tr.pos.v=[c.w/2,c.h/2+c.h*.15];K(sub.tr.op,.9,0);K(sub.tr.op,1.6,100);
   const ln=M.newLayer('shape',c,{name:'Linie',items:[M.newItem('rect',{size:[c.w*.3,6]})],fill:'#ff4d6d'});ln.tr.pos.v=[c.w/2,c.h/2+c.h*.1];K(ln.tr.scale,.6,[0,100]);K(ln.tr.scale,1.3,[100,100]);
   c.layers=[sub,ln,tx,bg]}},
 {name:'Bauchbinde',desc:'Name und Titel unten eingeblendet (Lower Third)',bg:'linear-gradient(135deg,#222,#444)',icon:'<i style="display:block;width:46px;height:8px;background:#ff4d6d;border-radius:2px;margin-top:22px"></i>',dur:6,build:c=>{c.bg='#2a2d36';
   const bar=M.newLayer('shape',c,{name:'Balken',items:[M.newItem('rect',{size:[c.w*.34,c.h*.11]})],fill:'#ffffff'});bar.tr.anchor.v=[-c.w*.17,0];bar.tr.pos.v=[c.w*.08,c.h*.8];K(bar.tr.scale,0,[0,100]);K(bar.tr.scale,.5,[100,100]);K(bar.tr.scale,5,[100,100]);K(bar.tr.scale,5.5,[0,100]);
   const acc=M.newLayer('shape',c,{name:'Akzent',items:[M.newItem('rect',{size:[c.w*.006,c.h*.11]})],fill:'#ff4d6d'});acc.tr.pos.v=[c.w*.08,c.h*.8];K(acc.tr.op,0,0,false);K(acc.tr.op,.1,100,false);
   const nm=M.newLayer('text',c,{str:'Max Mustermann',size:Math.round(c.h*.045),color:'#111111',align:'left'});nm.tr.pos.v=[c.w*.1,c.h*.795];const a={id:M.uid(),name:'Einblenden',on:true,unit:'ch',shape:'up',s:M.P(0),e:M.P(100),o:M.P(0),props:{op:M.P(0),pos:M.P([30,0])}};K(a.o,.3,-100);K(a.o,1.2,100);nm.text.anims.push(a);
   const ti=M.newLayer('text',c,{str:'Creator & Streamer',size:Math.round(c.h*.026),color:'#555555',align:'left'});ti.text.bold=false;ti.tr.pos.v=[c.w*.1,c.h*.835];K(ti.tr.op,.6,0);K(ti.tr.op,1.1,100);K(ti.tr.op,5,100);K(ti.tr.op,5.3,0);
   c.layers=[ti,nm,acc,bar]}},
 {name:'Logo-Reveal',desc:'Kreis zeichnet sich, Logo ploppt auf',bg:'radial-gradient(#3b2a6b,#120c24)',icon:'<i style="display:block;width:30px;height:30px;border:4px solid #fff;border-radius:50%"></i>',dur:4,w:1920,h:1080,build:c=>{c.bg='#0f0a1f';
   const ring=M.newLayer('shape',c,{name:'Ring',items:[M.newItem('ellipse',{size:[c.h*.42,c.h*.42]})],stroke:true,strokeColor:'#9d7bff',strokeW:14});ring.shape.fill.on=false;ring.shape.trim.on=true;K(ring.shape.trim.e,0,0);K(ring.shape.trim.e,1.1,100);K(ring.tr.rot,0,-90);K(ring.tr.rot,1.1,0);
   const dot=M.newLayer('shape',c,{name:'Logo-Kreis',items:[M.newItem('ellipse',{size:[c.h*.3,c.h*.3]})],fill:'#9d7bff'});K(dot.tr.scale,.8,[0,0]);K(dot.tr.scale,1.15,[115,115]);K(dot.tr.scale,1.35,[100,100]);
   const tx=M.newLayer('text',c,{str:'LOGO',size:Math.round(c.h*.07)});tx.tr.pos.v=[c.w/2,c.h/2+c.h*.025];K(tx.tr.op,1.1,0);K(tx.tr.op,1.4,100);K(tx.tr.scale,1.1,[80,80]);K(tx.tr.scale,1.4,[100,100]);
   const glow=M.newFx('glow');glow.params.rad.v=40;glow.params.thr.v=30;dot.fx.push(glow);
   c.layers=[tx,dot,ring]}},
 {name:'Abonnieren-Button',desc:'Roter Button mit Klick-Animation',bg:'linear-gradient(135deg,#200,#600)',icon:'<i style="display:block;padding:6px 10px;background:#f00;color:#fff;border-radius:6px;font-style:normal;font-weight:700;font-size:11px">ABO</i>',dur:4,build:c=>{c.bg='#00ff00';
   const btn=M.newLayer('shape',c,{name:'Button',items:[M.newItem('rect',{size:[c.w*.24,c.h*.12],round:c.h*.03})],fill:'#e62117'});btn.tr.pos.v=[c.w/2,c.h*.78];K(btn.tr.scale,0,[0,0]);K(btn.tr.scale,.35,[110,110]);K(btn.tr.scale,.5,[100,100]);K(btn.tr.scale,1.6,[100,100]);K(btn.tr.scale,1.7,[92,92]);K(btn.tr.scale,1.85,[100,100]);
   const tx=M.newLayer('text',c,{str:'ABONNIEREN',size:Math.round(c.h*.045)});tx.parent=btn.id;tx.tr.pos.v=[0,c.h*.016];
   const col=M.newFx('fill');col.params.col.v='#666666';col.params.op.v=0;K(col.params.op,1.7,0,false);K(col.params.op,1.75,100,false);btn.fx.push(col);
   c.layers=[tx,btn]}},
];
// ---------- Ebenen anlegen ----------
App.addLayer=(l,at)=>{const c=App.comp();App.change(()=>{if(at!==undefined){const d=at-l.in;l.st+=d;l.in+=d;l.out=Math.min(c.dur,l.out+d)}c.layers.unshift(l);E.sel=new Set([l.id])});return l};
App.newText=(pos,str)=>{const c=App.comp();if(!c)return;const l=M.newLayer('text',c,{str:str||t('Text'),pos:pos||[c.w/2,c.h/2],size:Math.round(c.h*.09),color:'#ffffff'});l.in=0;App.addLayer(l);return l};
App.assetLayer=(a,at)=>{const c=App.comp();if(!c)return;const m=M.media[a.id];const k=a.kind.replace(':missing','');
 if(k==='image'){const l=M.newLayer('image',c,{asset:a.id,name:a.name,w:m?.w||c.w,h:m?.h||c.h});App.addLayer(l,at)}
 else if(k==='video'){const l=M.newLayer('video',c,{asset:a.id,name:a.name,w:m?.w||c.w,h:m?.h||c.h,dur:m?.dur||c.dur});l.out=Math.min(c.dur,(m?.dur||c.dur));App.addLayer(l,at)}
 else if(k==='audio'){const l=M.newLayer('audio',c,{asset:a.id,name:a.name,dur:m?.dur||c.dur});App.addLayer(l,at)}};
App.compLayer=(sub,at)=>{const c=App.comp();if(!c||sub.id===c.id)return;if(App.contains(sub,c.id))return Kit.toast(t('Eine Komposition kann sich nicht selbst enthalten.'));const l=M.newLayer('comp',c,{comp:sub.id,name:sub.name,w:sub.w,h:sub.h,dur:sub.dur});l.out=Math.min(c.dur,sub.dur);App.addLayer(l,at)};
App.contains=(comp,id,depth=0)=>depth<20&&comp.layers.some(l=>l.type==='comp'&&(l.comp===id||(M.compById(l.comp)&&App.contains(M.compById(l.comp),id,depth+1))));
App.import=async()=>{const p=await Kit.pick('files','Medien|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.svg;*.mp4;*.mov;*.webm;*.mkv;*.m4v;*.mp3;*.wav;*.m4a;*.ogg;*.flac;*.aac');if(p&&p.length)App.importPaths(p)};
App.importPaths=async(paths,addToComp)=>{try{const added=await Kit.api('api/import',{ID:E.doc.id,Paths:paths});for(const a of added){E.proj.assets.push(a);await M.loadAsset(a)}App.save(true);if(addToComp)for(const a of added)App.assetLayer(a,E.time);App.redraw();Kit.toast(added.length===1?t('Datei eingebunden.'):added.length+' '+t('Dateien eingebunden.'))}catch(e){Kit.toast(e.message)}};
Kit.onDrop(paths=>{if(!$('#editor').hidden&&E.doc)App.importPaths(paths,true)});
// ---------- Bearbeiten ----------
let clip=null;
App.copy=()=>{const ls=App.selLayers();if(E.selKeys.size){const keys=[...E.selKeys].map(k=>Timeline.keyRef(k)).filter(Boolean);if(keys.length){const t0=Math.min(...keys.map(k=>k.k.t));clip={keys:keys.map(k=>({pk:k.pk,t:k.k.t-t0,k:M.clone(k.k)}))};return Kit.toast(t('Keyframes kopiert.'))}}if(!ls.length)return;clip={layers:M.clone(ls)};Kit.toast(ls.length===1?t('Ebene kopiert.'):ls.length+' '+t('Ebenen kopiert.'))};
App.paste=()=>{const c=App.comp();if(!clip||!c)return;if(clip.keys){const l=App.sel1();if(!l)return Kit.toast(t('Wähle eine Ebene, um Keyframes einzufügen.'));App.change(()=>{const ps=M.props(l);const lt=M.ltime(l,E.time);for(const x of clip.keys){const pr=ps.find(p=>p.key===x.pk);if(!pr)continue;M.setKey(pr.p,lt+x.t,x.k.v);const k=pr.p.k.find(q=>Math.abs(q.t-(lt+x.t))<1e-4);if(x.k.eo)k.eo=x.k.eo;if(x.k.ei)k.ei=x.k.ei;if(x.k.h)k.h=true}});return}
 App.change(()=>{const ids=new Map();const nl=clip.layers.map(l=>{const n=M.clone(l);const old=n.id;n.id=M.uid();ids.set(old,n.id);return n});for(const n of nl){if(n.parent&&ids.has(n.parent))n.parent=ids.get(n.parent);else if(n.parent&&!c.layers.some(x=>x.id===n.parent))n.parent=null;if(n.matte&&ids.has(n.matte.src))n.matte.src=ids.get(n.matte.src);else if(n.matte&&!c.layers.some(x=>x.id===n.matte.src))n.matte=null}c.layers.unshift(...nl);E.sel=new Set(nl.map(l=>l.id))})};
App.dup=()=>{const c=App.comp();const ls=App.selLayers();if(!ls.length)return;App.change(()=>{const out=[];for(const l of ls){const n=M.clone(l);n.id=M.uid();n.name=l.name+' 2';const i=c.layers.indexOf(l);c.layers.splice(i,0,n);out.push(n.id)}E.sel=new Set(out)})};
App.del=()=>{const c=App.comp();if(!c)return;if(E.selKeys.size){App.change(()=>{for(const k of E.selKeys){const r=Timeline.keyRef(k);if(r){r.p.k.splice(r.p.k.indexOf(r.k),1);if(!r.p.k.length){r.p.v=r.k.v;delete r.p.k}}}E.selKeys.clear()});return}
 if(Panels.selMask){const l=App.sel1();if(l){App.change(()=>{l.masks=l.masks.filter(m=>m.id!==Panels.selMask);Panels.selMask=null});return}}
 const ids=[...E.sel];if(!ids.length)return;App.change(()=>{c.layers=c.layers.filter(l=>!E.sel.has(l.id));for(const l of c.layers){if(E.sel.has(l.parent))l.parent=null;if(l.matte&&E.sel.has(l.matte.src))l.matte=null}E.sel.clear()})};
App.split=()=>{const c=App.comp();const ls=App.selLayers().filter(l=>E.time>l.in&&E.time<l.out);if(!ls.length)return Kit.toast(t('Der Abspielkopf muss innerhalb der Ebene stehen.'));App.change(()=>{for(const l of ls){const n=M.clone(l);n.id=M.uid();n.in=E.time;l.out=E.time;const i=c.layers.indexOf(l);c.layers.splice(i,0,n);E.sel.add(n.id)}})};
App.order=(how)=>{const c=App.comp();const ls=App.selLayers();if(!ls.length)return;App.change(()=>{let arr=c.layers.filter(l=>!E.sel.has(l.id));if(how==='front')c.layers=[...ls,...arr];else if(how==='back')c.layers=[...arr,...ls];else{for(const l of(how==='fwd'?ls:[...ls].reverse())){const i=c.layers.indexOf(l),j=how==='fwd'?i-1:i+1;if(j<0||j>=c.layers.length||E.sel.has(c.layers[j].id))continue;[c.layers[i],c.layers[j]]=[c.layers[j],c.layers[i]]}}})};
App.precomp=()=>{const c=App.comp();const ls=App.selLayers();if(!ls.length)return Kit.toast(t('Wähle zuerst Ebenen aus.'));const name=prompt(t('Name der neuen Komposition:'),ls.length===1?ls[0].name+' Komp':t('Vorkomp')+' '+(E.proj.comps.length+1));if(!name)return;
 App.change(()=>{const sub=M.newComp({name,w:c.w,h:c.h,fps:c.fps,dur:c.dur,bg:c.bg});const keep=c.layers.filter(l=>E.sel.has(l.id));sub.layers=keep;const idx=Math.min(...keep.map(l=>c.layers.indexOf(l)));c.layers=c.layers.filter(l=>!E.sel.has(l.id));
  for(const l of c.layers){if(E.sel.has(l.parent))l.parent=null;if(l.matte&&E.sel.has(l.matte.src))l.matte=null}for(const l of sub.layers){if(l.parent&&!sub.layers.some(x=>x.id===l.parent))l.parent=null}
  E.proj.comps.push(sub);const nl=M.newLayer('comp',c,{comp:sub.id,name,w:sub.w,h:sub.h,dur:sub.dur});c.layers.splice(idx,0,nl);E.sel=new Set([nl.id])})};
// Keyframe-Interpolation
App.interp=(how)=>{const keys=[...E.selKeys].map(Timeline.keyRef).filter(Boolean);if(!keys.length)return Kit.toast(t('Wähle zuerst Keyframes in der Zeitleiste aus.'));App.change(()=>{for(const r of keys){const k=r.k;delete k.h;
  if(how==='ease'){k.eo=M.EASE_O;k.ei=M.EASE_I}else if(how==='easein'){k.ei=M.EASE_I}else if(how==='easeout'){k.eo=M.EASE_O}else if(how==='linear'){k.eo=M.LIN_O;k.ei=M.LIN_I}else if(how==='hold'){k.h=true}}})};
App.addKey=()=>{const l=App.sel1();if(!l)return;const pr=Panels.selProp&&M.props(l).find(p=>p.key===Panels.selProp);const list=pr?[pr]:M.props(l).filter(p=>p.grp==='tr');App.change(()=>{const lt=M.ltime(l,E.time);for(const p of list){const v=M.val(p.p,{comp:App.comp(),layer:l,t:lt,ct:E.time,key:p.key});M.setKey(p.p,lt,v)}})};
App.seq=()=>{const ls=App.selLayers();if(ls.length<2)return Kit.toast(t('Wähle mindestens zwei Ebenen aus.'));const ov=+prompt(t('Überlappung in Sekunden (0 = direkt nacheinander):'),'0');if(isNaN(ov))return;const c=App.comp();
 App.change(()=>{const order=c.layers.filter(l=>E.sel.has(l.id));let at=order[0].in;for(const l of order){const d=at-l.in;l.st+=d;l.in+=d;l.out+=d;at=l.out-ov}})};
// ---------- Aktionen ----------
const A={};App.A=A;
Object.assign(A,{home:()=>App.home(),save:()=>App.save(),import:()=>App.import(),undo:()=>App.doUndo(),redo:()=>App.doRedo(),copy:()=>App.copy(),paste:()=>App.paste(),dup:()=>App.dup(),splitl:()=>App.split(),del:()=>App.del(),
 selall:()=>{const c=App.comp();if(c){E.sel=new Set(c.layers.map(l=>l.id));App.redraw()}},desel:()=>{E.sel.clear();E.selKeys.clear();App.redraw()},
 newcomp:()=>Panels.compDlg(null),compset:()=>Panels.compDlg(App.comp()),newtext:()=>App.newText(),
 newsolid:()=>Panels.solidDlg(),newshape:()=>{const c=App.comp();if(!c)return;const l=M.newLayer('shape',c,{items:[M.newItem('rect',{size:[c.w*.3,c.h*.3]})],fill:E.newFill});App.addLayer(l)},
 newnull:()=>{const c=App.comp();if(c)App.addLayer(M.newLayer('null',c))},newadjust:()=>{const c=App.comp();if(c)App.addLayer(M.newLayer('adjust',c))},
 precomp:()=>App.precomp(),front:()=>App.order('front'),back:()=>App.order('back'),fwd:()=>App.order('fwd'),bwd:()=>App.order('bwd'),seq:()=>App.seq(),
 mbtoggle:()=>{const ls=App.selLayers();if(!ls.length)return;App.change(()=>{const on=!ls[0].mb;for(const l of ls)l.mb=on})},
 ease:()=>App.interp('ease'),easein:()=>App.interp('easein'),easeout:()=>App.interp('easeout'),linear:()=>App.interp('linear'),hold:()=>App.interp('hold'),addkf:()=>App.addKey(),
 expr:()=>Panels.exprFor(),showanim:()=>Timeline.showAnimated(),graph:()=>{E.graph=!E.graph;$('#bgraph').classList.toggle('on',E.graph);App.redraw('tl')},presets:()=>Panels.tab('fx'),
 play:()=>App.play(),zin:()=>Viewer.zoomBy(1.25),zout:()=>Viewer.zoomBy(.8),fit:()=>Viewer.fit(),z100:()=>Viewer.setZoom(1),
 grid:()=>{E.view.grid=!E.view.grid;App.redraw('view')},safe:()=>{E.view.safe=!E.view.safe;App.redraw('view')},checker:()=>{E.view.checker=!E.view.checker;App.redraw('view')},paths:()=>{E.view.paths=!E.view.paths;App.redraw('view')},
 shytoggle:()=>{E.shy=!E.shy;$('#bshy').classList.toggle('on',E.shy);App.redraw('tl')},mbmaster:()=>{const c=App.comp();if(!c)return;App.change(()=>{c.mb=!c.mb})},
 trimwork:()=>{const c=App.comp();const [a,b]=App.work();if(b-a<1/c.fps)return;App.change(()=>{for(const l of c.layers){l.st-=a;l.in=Math.max(0,l.in-a);l.out=Math.min(b-a,l.out-a)}c.dur=b-a;c.work=null;E.time=0})},
 workall:()=>{const c=App.comp();App.change(()=>{c.work=null})},
 fitcomp:()=>{const c=App.comp();App.change(()=>{for(const l of App.selLayers()){const b=M.bounds(c,l,E.time);if(!b[2]||!b[3])continue;const k=Math.min(c.w/b[2],c.h/b[3])*100;M.setVal(l.tr.scale,M.ltime(l,E.time),[k,k]);M.setVal(l.tr.pos,M.ltime(l,E.time),[c.w/2,c.h/2]);M.setVal(l.tr.anchor,M.ltime(l,E.time),[b[0]+b[2]/2,b[1]+b[3]/2])}})},
 center:()=>Panels.align('hc','comp',true),resettr:()=>{const c=App.comp();App.change(()=>{for(const l of App.selLayers()){const b=M.bounds(c,l,E.time);l.tr.scale={v:[100,100]};l.tr.rot={v:0};l.tr.op={v:100};if(l.type!=='shape'&&l.type!=='text'){l.tr.anchor={v:[b[0]+b[2]/2,b[1]+b[3]/2]};l.tr.pos={v:[c.w/2,c.h/2]}}}})},
 export:()=>Export.dlg(),still:()=>Export.still(),keys:()=>App.keys&&App.keys.editor(),help:()=>Panels.help()});
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b||$('#editor').hidden)return;const a=b.dataset.act;$$('.dd.open').forEach(d=>d.classList.remove('open'));if(A[a]){e.preventDefault();A[a](b)}});
// Menüs öffnen
document.addEventListener('click',e=>{const d=e.target.closest('.dd>button');if(d){const dd=d.parentElement;const was=dd.classList.contains('open');$$('.dd.open').forEach(x=>x.classList.remove('open'));if(!was)dd.classList.add('open');return}if(!e.target.closest('.ddm'))$$('.dd.open').forEach(x=>x.classList.remove('open'))});
document.addEventListener('mouseover',e=>{const d=e.target.closest('.dd');if(d&&$('.dd.open')&&!d.classList.contains('open')){$$('.dd.open').forEach(x=>x.classList.remove('open'));d.classList.add('open')}});
$('#pname').addEventListener('change',()=>{const n=$('#pname').value.trim();if(n&&E.doc){E.doc.name=n;App.markDirty()}});
// ---------- Tastenkürzel ----------
const P=(key)=>()=>Timeline.solo(key);
const tool=(id)=>()=>Viewer.setTool(id);
App.keys=Kit.hotkeys('motion',[
['import','Datei','Importieren',['Ctrl+I'],()=>App.import()],['export','Datei','Exportieren (Renderliste)',['Ctrl+M'],()=>Export.dlg()],['still','Datei','Einzelbild speichern',['Ctrl+Alt+S'],()=>Export.still()],
 ['undo','Bearbeiten','Rückgängig',['Ctrl+Z'],()=>App.doUndo()],['redo','Bearbeiten','Wiederholen',['Ctrl+Shift+Z'],()=>App.doRedo()],['copy','Bearbeiten','Kopieren',['Ctrl+C'],()=>App.copy()],['paste','Bearbeiten','Einfügen',['Ctrl+V'],()=>App.paste()],
 ['dup','Bearbeiten','Duplizieren',['Ctrl+D'],()=>App.dup()],['split','Bearbeiten','Ebene teilen',['Ctrl+Shift+D'],()=>App.split()],['del','Bearbeiten','Löschen',['Del','Backspace'],()=>App.del()],['selall','Bearbeiten','Alle Ebenen auswählen',['Ctrl+A'],()=>A.selall()],['desel','Bearbeiten','Auswahl aufheben',['Ctrl+Shift+A'],()=>A.desel()],
 ['newcomp','Komposition','Neue Komposition',['Ctrl+N'],()=>A.newcomp()],['compset','Komposition','Kompositionseinstellungen',['Ctrl+K'],()=>A.compset()],['precomp','Ebene','Vorkomponieren',['Ctrl+Shift+C'],()=>App.precomp()],
 ['newsolid','Ebene','Neue Farbfläche',['Ctrl+Y'],()=>A.newsolid()],['newtext','Ebene','Neuer Text',['Ctrl+Alt+Shift+T'],()=>A.newtext()],['newnull','Ebene','Neues Null-Objekt',['Ctrl+Alt+Shift+Y'],()=>A.newnull()],['newadjust','Ebene','Neue Einstellungsebene',['Ctrl+Alt+Y'],()=>A.newadjust()],
 ['front','Ebene','In den Vordergrund',['Ctrl+Shift+]'],()=>App.order('front')],['back','Ebene','In den Hintergrund',['Ctrl+Shift+['],()=>App.order('back')],['fwd','Ebene','Eine Ebene nach vorne',['Ctrl+]'],()=>App.order('fwd')],['bwd','Ebene','Eine Ebene nach hinten',['Ctrl+['],()=>App.order('bwd')],
 ['play','Vorschau','Abspielen / Anhalten',['Space','0'],()=>App.play()],['home','Vorschau','Zum Anfang',['Home'],()=>App.setTime(0)],['end','Vorschau','Zum Ende',['End'],()=>{const c=App.comp();c&&App.setTime(c.dur)}],
 ['prevf','Vorschau','Ein Bild zurück',['PageUp','Ctrl+Left'],()=>{const c=App.comp();c&&App.setTime(E.time-1/c.fps)}],['nextf','Vorschau','Ein Bild vor',['PageDown','Ctrl+Right'],()=>{const c=App.comp();c&&App.setTime(E.time+1/c.fps)}],
 ['prevf10','Vorschau','10 Bilder zurück',['Shift+PageUp'],()=>{const c=App.comp();c&&App.setTime(E.time-10/c.fps)}],['nextf10','Vorschau','10 Bilder vor',['Shift+PageDown'],()=>{const c=App.comp();c&&App.setTime(E.time+10/c.fps)}],
 ['prevk','Vorschau','Vorheriger Keyframe',['J'],()=>Timeline.jumpKey(-1)],['nextk','Vorschau','Nächster Keyframe',['K'],()=>Timeline.jumpKey(1)],['lin','Vorschau','Zum Anfang der Ebene',['I'],()=>{const l=App.sel1();l&&App.setTime(l.in)}],['lout','Vorschau','Zum Ende der Ebene',['O'],()=>{const l=App.sel1();l&&App.setTime(l.out-1/(App.comp().fps))}],
 ['workb','Zeitleiste','Arbeitsbereich-Anfang setzen',['B'],()=>Timeline.setWork(0)],['workn','Zeitleiste','Arbeitsbereich-Ende setzen',['N'],()=>Timeline.setWork(1)],
 ['inbr','Zeitleiste','Ebene an Abspielkopf beginnen',['['],()=>Timeline.moveTo('in')],['outbr','Zeitleiste','Ebene an Abspielkopf enden',[']'],()=>Timeline.moveTo('out')],['trimin','Zeitleiste','Anfang bis Abspielkopf kürzen',['Alt+['],()=>Timeline.trimTo('in')],['trimout','Zeitleiste','Ende ab Abspielkopf kürzen',['Alt+]'],()=>Timeline.trimTo('out')],
 ['tlzin','Zeitleiste','Zeitleiste vergrößern',['='],()=>Timeline.zoomBy(1.3)],['tlzout','Zeitleiste','Zeitleiste verkleinern',['-'],()=>Timeline.zoomBy(1/1.3)],
 ['showA','Eigenschaften','Ankerpunkt zeigen',['A'],P('anchor')],['showP','Eigenschaften','Position zeigen',['P'],P('pos')],['showS','Eigenschaften','Skalierung zeigen',['S'],P('scale')],['showR','Eigenschaften','Drehung zeigen',['R'],P('rot')],['showT','Eigenschaften','Deckkraft zeigen',['T'],P('op')],
 ['showM','Eigenschaften','Masken zeigen',['M'],P('mask')],['showE','Eigenschaften','Effekte zeigen',['E'],P('fx')],['showU','Eigenschaften','Animierte Eigenschaften zeigen',['U'],()=>Timeline.showAnimated()],['addkf','Animation','Keyframe setzen',['Alt+Shift+K'],()=>App.addKey()],
 ['ease','Animation','Easy Ease',['F9'],()=>App.interp('ease')],['easein','Animation','Easy Ease In',['Shift+F9'],()=>App.interp('easein')],['easeout','Animation','Easy Ease Out',['Ctrl+Shift+F9'],()=>App.interp('easeout')],['hold','Animation','Halten',['Ctrl+Alt+H'],()=>App.interp('hold')],
 ['graph','Animation','Diagrammeditor',['Shift+F3'],()=>A.graph()],
 ['tsel','Werkzeuge','Auswahl',['V'],tool('select')],['thand','Werkzeuge','Hand',['H'],tool('hand')],['trot','Werkzeuge','Drehen',['W'],tool('rotate')],['tanchor','Werkzeuge','Ankerpunkt',['Y'],tool('anchor')],
 ['tshape','Werkzeuge','Form (Rechteck, Ellipse, Stern …)',['Q'],()=>Viewer.cycleShape()],['tpen','Werkzeuge','Zeichenstift',['G'],tool('pen')],['ttext','Werkzeuge','Text',['Ctrl+T'],tool('text')],['tzoom','Werkzeuge','Zoom',['Z'],tool('zoom')],
 ['zin','Ansicht','Vergrößern',['.'],()=>Viewer.zoomBy(1.25)],['zout','Ansicht','Verkleinern',[','],()=>Viewer.zoomBy(.8)],['fit','Ansicht','Einpassen',['Shift+/'],()=>Viewer.fit()],['keys','Hilfe','Tastenkürzel',['Ctrl+Alt+\''],()=>App.keys.editor()],
]);
// Startfenster laden
App.loadState().catch(e=>Kit.toast(e.message));
