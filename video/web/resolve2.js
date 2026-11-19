// Videoschnitt – weitere Resolve-Abläufe aus den Tutorials: Fade-Griffe an den Clips, Renderliste (Deliver),
// Dynamic Zoom, Weißabgleich-Pipette, Vorher/Nachher (Umschalt+D), Grade-Vorlagen (wie „Grab Still“) und Grade auf alle Clips.
(()=>{const t=s=>Kit.t(s),A=Pro.ACTS,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const selClip=()=>{const f=App.sel&&App.sel.clip&&App.find(App.sel.clip);if(!f)Kit.toast(t('Wähle zuerst einen Clip aus.'));return f};

 // ---------- Fade-Griffe oben an den Clip-Ecken ----------
 const decorate=()=>{if(!App.P)return;for(const el of document.querySelectorAll('#rows .clip[data-clip]')){const f=App.find(el.dataset.clip);if(!f)continue;const c=f.c,L=App.len(c),pps=Timeline.pps;
   let a=el.querySelector('.fdh-l');if(!a){a=document.createElement('i');a.className='fdh fdh-l';el.appendChild(a);const b=document.createElement('i');b.className='fdh fdh-r';el.appendChild(b);
    const s=document.createElement('i');s.className='fdz fdz-l';el.appendChild(s);const s2=document.createElement('i');s2.className='fdz fdz-r';el.appendChild(s2)}
   const fi=Math.min(c.fadeIn||0,L),fo=Math.min(c.fadeOut||0,L);el.querySelector('.fdh-l').style.left=(fi*pps)+'px';el.querySelector('.fdh-r').style.right=(fo*pps)+'px';
   el.querySelector('.fdz-l').style.width=(fi*pps)+'px';el.querySelector('.fdz-r').style.width=(fo*pps)+'px'}};
 new MutationObserver(()=>{if(!decorate.p){decorate.p=1;requestAnimationFrame(()=>{decorate.p=0;decorate()})}}).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('pointerdown',e=>{const h=e.target.closest('.fdh');if(!h||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();
  const f=App.find(h.closest('.clip').dataset.clip);if(!f||f.t.locked)return;const c=f.c,L=App.len(c),left=h.classList.contains('fdh-l'),orig=JSON.stringify(App.P.tracks),x0=e.clientX,v0=left?(c.fadeIn||0):(c.fadeOut||0);let moved=false;
  const mv=ev=>{moved=true;const d=(ev.clientX-x0)/Timeline.pps;const v=clamp(left?v0+d:v0-d,0,L);if(left)c.fadeIn=Math.round(v*100)/100;else c.fadeOut=Math.round(v*100)/100;decorate();Player.draw&&Player.draw()};
  const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);if(moved){App.undo.push(orig);App.redo=[];App.afterChange()}};addEventListener('pointermove',mv);addEventListener('pointerup',up)},true);

 // Bild-Fade auch in der Vorschau: Deckkraft am Clipanfang/-ende absenken (wie beim Export)
 const kv0=App.kv;App.kv=(c,p,t=App.t)=>{const v=kv0(c,p,t);if(p!=='opacity'||!(c.fadeIn>0||c.fadeOut>0))return v;const L=App.len(c),into=t-c.start,left=c.start+L-t;let k=1;if(c.fadeIn>0&&into<c.fadeIn)k*=clamp(into/c.fadeIn,0,1);if(c.fadeOut>0&&left<c.fadeOut)k*=clamp(left/c.fadeOut,0,1);return v*k};

 // ---------- Renderliste (wie die Render Queue in der Deliver-Seite) ----------
 const queue=[];let capture=false,running=false;const of=window.fetch;
 window.fetch=function(u,o){if(capture&&String(u).includes('api/export')&&!String(u).includes('job')&&o&&o.method==='POST'){capture=false;try{const b=JSON.parse(o.body);queue.push({ID:b.id||b.ID,Export:b.export||b.Export||{}});showQ();Kit.toast(t('Zur Renderliste hinzugefügt.'))}catch(x){}
   setTimeout(()=>{Panels.locked=false;Panels.close()},50);return Promise.resolve(new Response('{"ok":true,"queued":true}',{headers:{'Content-Type':'application/json'}}))}return of.apply(this,arguments)};
 const mountQ=()=>{const go=document.getElementById('exgo');if(!go||document.getElementById('exqueue'))return;const b=document.createElement('button');b.className='btn';b.id='exqueue';b.type='button';b.textContent=t('Zur Renderliste');go.before(b);
  b.onclick=()=>{capture=true;go.click();setTimeout(()=>{capture=false},1500)}};
 new MutationObserver(mountQ).observe(document.body,{childList:true,subtree:true});
 let qp=null;const showQ=()=>{if(!queue.length&&!running){qp&&qp.remove();qp=null;return}if(!qp){qp=document.createElement('div');qp.className='rqueue';document.body.appendChild(qp)}
  qp.innerHTML=`<div class="rqh"><b>${t('Renderliste')}</b><span class="muted">${queue.length}</span></div>${queue.map((q,i)=>`<div class="rqi"><span>${Kit.esc(q.Export.name||'Video')} · ${Kit.esc((q.Export.format||'mp4').toUpperCase())}${q.Export.res?' · '+q.Export.res+'p':''}</span>${running?'':`<button class="ib" data-rqdel="${i}" title="${t('Entfernen')}">✕</button>`}</div>`).join('')}
  <div class="rqbar"><i id="rqbar"></i></div><div class="frow" style="gap:6px;justify-content:flex-end"><span class="muted" id="rqtxt" style="font-size:12px;flex:1"></span>${running?'':`<button class="btn sm" data-rqclear>${t('Leeren')}</button><button class="btn sm primary" data-rqall>${t('Alle rendern')}</button>`}</div>`};
 document.addEventListener('click',async e=>{const d=e.target.closest('[data-rqdel]');if(d){queue.splice(+d.dataset.rqdel,1);showQ();return}
  if(e.target.closest('[data-rqclear]')){queue.length=0;showQ();return}
  if(!e.target.closest('[data-rqall]')||running)return;running=true;showQ();let n=0,fail=0;const total=queue.length;
  while(queue.length){const job=queue[0];n++;const txt=document.getElementById('rqtxt');if(txt)txt.textContent=`${n} / ${total}: ${job.Export.name||'Video'}`;
   try{const r=await of('api/export',{method:'POST',body:JSON.stringify(job)});if(!r.ok)throw new Error((await r.json()).error||r.status);
    for(;;){await new Promise(z=>setTimeout(z,700));const j=await (await of('api/export/job?id='+encodeURIComponent(job.ID))).json();const bar=document.getElementById('rqbar');if(bar)bar.style.width=Math.round((j.done||0)*100)+'%';if(!j.running){if(j.error)throw new Error(j.error);break}}}
   catch(x){fail++;Kit.toast(t('Export fehlgeschlagen')+': '+(x.message||x))}queue.shift();showQ()}
  running=false;showQ();Kit.toast(fail?t('Renderliste fertig, mit Fehlern.'):t('Renderliste fertig.'))});

 // ---------- Dynamic Zoom (langsamer Zoom über den ganzen Clip) ----------
 A.dynzoom=()=>{const f=selClip();if(!f)return;const c=f.c,L=App.len(c);App.change(()=>{c.kf=c.kf||{};if(c.kf.scale&&c.kf.scale.__dz!==undefined||c.dynzoom){delete c.kf.scale;delete c.dynzoom}else{const s=c.scale||1;c.kf.scale=[[0,s],[Math.max(0.1,L),s*1.15]];c.dynzoom=true}},true);
  Kit.toast(c.dynzoom?t('Dynamic Zoom an: der Clip zoomt langsam um 15 % heran. Die Schlüsselbilder kannst du anpassen.'):t('Dynamic Zoom aus.'))};
 const mountDZ=()=>{const p=document.getElementById('props');if(!p||p.querySelector('[data-act=dynzoom]'))return;const rl=p.querySelector('[data-act=rotl]');if(!rl)return;
  const b=document.createElement('button');b.className='btn';b.dataset.act='dynzoom';const f=App.sel&&App.sel.clip&&App.find(App.sel.clip);b.textContent=f&&f.c.dynzoom?t('Dynamic Zoom aus'):t('Dynamic Zoom');rl.parentElement.appendChild(b)};
 new MutationObserver(mountDZ).observe(document.body,{childList:true,subtree:true});

 // ---------- Vorher/Nachher (Umschalt+D wie in Resolve) ----------
 addEventListener('keydown',e=>{const tg=e.target;if(tg&&(tg.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)))return;
  if(e.shiftKey&&!e.ctrlKey&&!e.altKey&&e.key.toLowerCase()==='d'){e.preventDefault();window.GradeBypass=!window.GradeBypass;Kit.toast(window.GradeBypass?t('Vorher: Farbkorrektur ausgeblendet (Umschalt+D)'):t('Nachher: Farbkorrektur sichtbar'));Player.draw&&Player.draw()}});

 // ---------- Grade-Vorlagen und Grade auf alle Clips ----------
 const GK=['wheels','curves','lut','temp','tint','expo','bright','contrast','sat','hue','vig','enhance'];
 const grab=c=>{const g={};for(const k of GK)if(c[k]!==undefined&&c[k]!==0&&c[k]!==false&&c[k]!=='')g[k]=JSON.parse(JSON.stringify(c[k]));return g};
 const put=(c,g)=>{for(const k of GK)delete c[k];Object.assign(c,JSON.parse(JSON.stringify(g)))};
 const load=()=>{try{return JSON.parse(localStorage.getItem('vs-grades')||'[]')}catch(e){return[]}};const store=l=>{try{localStorage.setItem('vs-grades',JSON.stringify(l))}catch(e){Kit.toast(t('Die Vorlage ließ sich nicht speichern.'))}};
 A.gradesave=()=>{const f=selClip();if(!f)return;const g=grab(f.c);if(!Object.keys(g).length)return Kit.toast(t('Dieser Clip hat noch keine Farbkorrektur.'));
  const n=prompt(t('Name der Vorlage'),t('Mein Look')+' '+(load().length+1));if(!n)return;const l=load();l.push({n,g});store(l);Kit.toast(t('Vorlage gespeichert.'));Panels.props()};
 A.gradeapply=el=>{const f=selClip();if(!f)return;const l=load(),i=+(el&&el.dataset.gi);if(!l[i])return;App.change(()=>put(f.c,l[i].g),true);Kit.toast(t('Vorlage angewendet.'))};
 A.gradedel=el=>{const l=load(),i=+(el&&el.dataset.gi);if(!l[i]||!confirm(t('Vorlage löschen?')))return;l.splice(i,1);store(l);Panels.props()};
 A.gradeall=()=>{const f=selClip();if(!f)return;const g=grab(f.c);let n=0;App.change(()=>{for(const tr of App.P.tracks)for(const c of tr.clips)if(c!==f.c&&c.type==='media'){const m=App.media(c.mediaId);if(m&&m.kind!=='audio'){put(c,g);n++}}},true);Kit.toast(t('Farbkorrektur auf weitere Clips übertragen')+': '+n)};
 const mountG=()=>{const p=document.getElementById('props');if(!p||p.querySelector('.gradebox'))return;const w=p.querySelector('[data-act=wheels]');if(!w)return;const l=load();
  const d=document.createElement('div');d.className='gradebox';d.innerHTML=`<div class="frow" style="gap:6px;flex-wrap:wrap;margin:0 0 8px"><button class="btn" data-act="gradesave">${t('Als Vorlage speichern')}</button><button class="btn" data-act="gradeall">${t('Auf alle Clips übertragen')}</button><button class="btn" data-act="wbpick">${t('Weißabgleich-Pipette')}</button></div>`+
   (l.length?`<div class="frow" style="gap:6px;flex-wrap:wrap;margin:0 0 8px">${l.map((x,i)=>`<span class="gchip"><button class="btn sm" data-act="gradeapply" data-gi="${i}">${Kit.esc(x.n)}</button><button class="ib" data-act="gradedel" data-gi="${i}" title="${t('Löschen')}">✕</button></span>`).join('')}</div>`:'');
  w.parentElement.after(d)};
 new MutationObserver(mountG).observe(document.body,{childList:true,subtree:true});

 // ---------- Weißabgleich-Pipette: Klick auf eine Stelle, die weiß oder grau sein soll ----------
 A.wbpick=()=>{const f=selClip();if(!f||f.c.type!=='media')return;const cv=document.getElementById('cv');if(!cv)return;Kit.toast(t('Klicke im Vorschaubild auf eine Stelle, die weiß oder grau sein soll.'));document.body.classList.add('wbpicking');
  const once=e=>{const r=cv.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){document.removeEventListener('pointerdown',once,true);document.body.classList.remove('wbpicking');return}document.removeEventListener('pointerdown',once,true);document.body.classList.remove('wbpicking');e.preventDefault();e.stopImmediatePropagation();const x=Math.round((e.clientX-r.left)*cv.width/r.width),y=Math.round((e.clientY-r.top)*cv.height/r.height);
   const d=cv.getContext('2d').getImageData(Math.max(0,x-3),Math.max(0,y-3),7,7).data;let s=[0,0,0],n=0;for(let i=0;i<d.length;i+=4){s[0]+=d[i];s[1]+=d[i+1];s[2]+=d[i+2];n++}s=s.map(v=>Math.max(1,v/n));const m=(s[0]+s[1]+s[2])/3;
   const c=f.c;App.change(()=>{const w=c.wheels||{lift:[0,0,0,0],gamma:[0,0,0,0],gain:[0,0,0,0],offset:[0,0,0,0]};for(let i=0;i<3;i++){const G=1+.5*(w.gain[3]+w.gain[i]),Gn=clamp(G*m/s[i],.3,2.5);w.gain[i]=clamp(2*(Gn-1)-w.gain[3],-1.5,1.5)}c.wheels=w},true);
   Kit.toast(t('Weißabgleich gesetzt (über Gain in den Farbrädern).'))};
  setTimeout(()=>document.addEventListener('pointerdown',once,true),0)};

 const st=document.createElement('style');st.textContent=`#rows .clip .fdh{position:absolute;top:0;width:9px;height:9px;margin-left:-4px;background:#fff;border:1px solid #0009;border-radius:2px;cursor:ew-resize;z-index:4;opacity:0;transition:opacity .1s}
 #rows .clip .fdh-r{margin-left:0;margin-right:-4px}#rows .clip:hover .fdh,#rows .clip.sel .fdh{opacity:1}
 #rows .clip .fdz{position:absolute;top:0;bottom:0;pointer-events:none;z-index:2}#rows .clip .fdz-l{left:0;background:linear-gradient(to bottom right,#0008 50%,transparent 50%)}#rows .clip .fdz-r{right:0;background:linear-gradient(to bottom left,#0008 50%,transparent 50%)}
 .rqueue{position:fixed;left:16px;bottom:16px;z-index:900;width:320px;background:#121218f2;border:1px solid #ffffff22;border-radius:10px;padding:10px;box-shadow:0 10px 30px #0008;color:#ddd;font-size:13px}
 .rqh{display:flex;justify-content:space-between;margin-bottom:6px}.rqi{display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #ffffff11}
 .rqbar{height:4px;background:#ffffff18;border-radius:3px;margin:8px 0;overflow:hidden}.rqbar i{display:block;height:100%;width:0;background:var(--accent,#7c6cff)}.gchip{display:inline-flex;align-items:center;gap:2px}.wbpicking #stage,.wbpicking #stage *{cursor:crosshair!important}`;document.head.appendChild(st);
})();
