// Videoschnitt – Schnitt-Werkzeuge wie in DaVinci Resolve:
// Auswahl (A), Trimmen (T), Klinge (B), Shuttle J/K/L, Magnet (N).
// Trimm-Werkzeug: Rand ziehen = Ripple (Rest rückt nach), Alt + Rand = Roll (Schnittpunkt zwischen zwei Clips verschieben),
// Clip ziehen = Slip (anderer Ausschnitt, gleiche Stelle), Alt + Clip ziehen = Slide (Clip zwischen den Nachbarn verschieben).
(()=>{const t=s=>Kit.t(s),A=Pro.ACTS,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),EPS=0.02;
 let tool='select';
 const fps=()=>(App.P&&App.P.fps)||30;
 const isMedia=c=>c.type==='media'&&App.media(c.mediaId)&&App.media(c.mediaId).kind!=='image';
 const setTool=v=>{tool=v;document.body.classList.toggle('trimtool',v==='trim');const b=document.getElementById('trimbtn');if(b)b.classList.toggle('on',v==='trim');
  if(v==='trim')Kit.toast(t('Trimmen: Rand ziehen = Ripple, Alt + Rand = Roll, Clip ziehen = Slip, Alt + Clip = Slide. A beendet.'))};
 A.trimtool=()=>setTool(tool==='trim'?'select':'trim');

 // Uhrzeit-Anzeige beim Ziehen
 const tip=document.createElement('div');tip.className='trimtip';
 const showTip=(e,txt)=>{if(!tip.isConnected)document.body.appendChild(tip);tip.textContent=txt;tip.style.cssText=`display:block;left:${e.clientX+14}px;top:${e.clientY+16}px`};
 const hideTip=()=>{tip.style.display='none'};
 const tc=d=>{const s=d<0?'−':'+';d=Math.abs(d);const f=Math.round(d*fps());const fr=f%Math.round(fps()),sec=Math.floor(f/Math.round(fps()));return`${s}${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}:${String(fr).padStart(2,'0')}`};
 const q=v=>Math.round(v*fps())/fps(); // auf ganze Bilder runden

 const neighbor=(tr,c,side)=>{const s=c.start,e=c.start+App.len(c);let best=null;for(const o of tr.clips){if(o===c)continue;
  if(side==='r'&&Math.abs(o.start-e)<EPS)best=o;if(side==='l'&&Math.abs(o.start+App.len(o)-s)<EPS)best=o}return best};
 const snap=c=>({start:c.start,in:c.in,out:c.out,dur:c.dur});
 const restore=(c,o)=>{c.start=o.start;c.in=o.in;c.out=o.out;c.dur=o.dur};
 // Länge eines Clips am Ende ändern (Medien: Out-Punkt, sonst Dauer). Liefert die tatsächliche Änderung in Sekunden.
 const growEnd=(c,o,d)=>{if(isMedia(c)){const sp=c.speed||1,m=App.media(c.mediaId);const no=clamp(o.out+d*sp,o.in+0.05,m.dur);c.out=no;return(no-o.out)/sp}
  const nd=Math.max(0.05,o.dur+d);c.dur=nd;return nd-o.dur};
 // Länge am Anfang ändern, Clipstart bleibt (d > 0 = länger)
 const growStart=(c,o,d)=>{if(isMedia(c)){const sp=c.speed||1;const ni=clamp(o.in-d*sp,0,o.out-0.05);c.in=ni;return(o.in-ni)/sp}
  const nd=Math.max(0.05,o.dur+d);c.dur=nd;return nd-o.dur};

 document.addEventListener('pointerdown',e=>{if(tool!=='trim'||e.button!==0)return;const el=e.target.closest('.clip[data-clip]');if(!el||!e.target.closest('#rows'))return;
  if(e.target.closest('[data-trans]'))return;const f=App.find(el.dataset.clip);if(!f||f.t.locked)return;
  e.preventDefault();e.stopImmediatePropagation();
  const c=f.c,tr=f.t,orig=JSON.stringify(App.P.tracks),x0=e.clientX,alt=e.altKey;
  const edge=e.target.classList.contains('hl')?'l':e.target.classList.contains('hr')?'r':'m';
  App.sel={clip:c.id};Timeline.render();Panels.props();
  const oc=snap(c),L0=App.len(c),end0=oc.start+L0;
  let mode,a,b,oa,ob,shift=[];
  if(edge!=='m'&&alt){ // Roll: Schnittpunkt zwischen zwei Clips
   const nb=neighbor(tr,c,edge);if(!nb){Kit.toast(t('Für Roll muss direkt daneben ein Clip liegen.'));return}
   [a,b]=edge==='r'?[c,nb]:[nb,c];oa=snap(a);ob=snap(b);mode='roll'}
  else if(edge!=='m'){mode='ripple';
   // alles, was hinter dem Clip beginnt (alle nicht gesperrten Spuren), rückt mit
   for(const t2 of App.P.tracks){if(t2.locked)continue;for(const k of t2.clips)if(k!==c&&k.start>=end0-1e-3)shift.push([k,k.start])}}
  else if(alt){mode='slide';a=neighbor(tr,c,'l');b=neighbor(tr,c,'r');oa=a&&snap(a);ob=b&&snap(b)}
  else{if(!isMedia(c)){Kit.toast(t('Slip geht nur bei Video- und Tonclips.'));return}mode='slip'}
  let moved=false;
  const mv=ev=>{let d=q((ev.clientX-x0)/Timeline.pps);if(!moved&&Math.abs(ev.clientX-x0)<3)return;moved=true;restore(c,oc);if(a)restore(a,oa);if(b)restore(b,ob);for(const[k,s]of shift)k.start=s;
   if(mode==='ripple'){const got=edge==='r'?growEnd(c,oc,d):growStart(c,oc,-d);for(const[k,s]of shift)k.start=Math.max(0,s+got);showTip(ev,`Ripple ${tc(got)}`)}
   else if(mode==='roll'){ // a wird länger/kürzer am Ende, b gegengleich am Anfang
    let got=growEnd(a,oa,d);const back=-growStart(b,ob,-got);if(Math.abs(back-got)>1e-6){restore(a,oa);got=growEnd(a,oa,back)}b.start=ob.start+got;showTip(ev,`Roll ${tc(got)}`)}
   else if(mode==='slip'){const sp=c.speed||1,m=App.media(c.mediaId);let di=-d*sp;di=clamp(di,-oc.in,m.dur-oc.out);c.in=oc.in+di;c.out=oc.out+di;showTip(ev,`Slip ${tc(di/sp)}`);Player.seek(c.start)}
   else{ // slide: Nachbarn geben nach
    let lo=-Infinity,hi=Infinity;
    if(a)lo=Math.max(lo,-(App.len(a)-0.05));else lo=Math.max(lo,-oc.start);
    if(b)hi=Math.min(hi,App.len(b)-0.05);
    if(a&&isMedia(a)){const m=App.media(a.mediaId);hi=Math.min(hi,(m.dur-oa.out)/(a.speed||1))}
    if(b&&isMedia(b))lo=Math.max(lo,-ob.in/(b.speed||1));
    d=clamp(d,lo,hi);c.start=oc.start+d;if(a)growEnd(a,oa,d);if(b){growStart(b,ob,-d);b.start=ob.start+d}showTip(ev,`Slide ${tc(d)}`)}
   Timeline.render();Player.sync()};
  const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);hideTip();
   if(moved){App.undo.push(orig);if(App.undo.length>150)App.undo.shift();App.redo=[];App.afterChange()}};
  addEventListener('pointermove',mv);addEventListener('pointerup',up)},true);

 // Tastenkürzel wie in Resolve
 let lRate=0;
 addEventListener('keydown',e=>{const tg=e.target;if(tg&&(tg.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)))return;
  if(e.ctrlKey||e.metaKey||e.altKey||!App.P||document.querySelector('#modal.show'))return;const k=e.key.toLowerCase();
  if(k==='t'){e.preventDefault();setTool(tool==='trim'?'select':'trim')}
  else if(k==='a'&&!e.shiftKey){e.preventDefault();if(document.body.classList.contains('razor'))A.razor();setTool('select')}
  else if(k==='b'){e.preventDefault();if(tool==='trim')setTool('select');A.razor()}
  else if(k==='n'){e.preventDefault();App.snap=!App.snap;const s=document.getElementById('snapbtn');if(s)s.classList.toggle('on',App.snap);Kit.toast(t(App.snap?'Magnet an':'Magnet aus'))}
  else if(k==='l'){e.preventDefault();lRate=lRate>0?Math.min(16,lRate*2):1;Player.shuttle(lRate);if(lRate>1)Kit.toast(lRate+'×')}
  else if(k==='j'){e.preventDefault();lRate=lRate<0?Math.max(-16,lRate*2):-1;Player.shuttle(lRate);Kit.toast(lRate+'×')}
  else if(k==='k'){e.preventDefault();lRate=0;Player.shuttle(0);Player.pause()}
  else if(k==='escape'&&tool==='trim'){setTool('select')}});
 addEventListener('keydown',e=>{if(e.key===' ')lRate=0},true);

 // Knopf in der Werkzeugleiste
 const mount=()=>{const rz=document.getElementById('razorbtn');if(!rz||document.getElementById('trimbtn'))return;const b=document.createElement('button');b.className='ib tog';b.id='trimbtn';b.dataset.act='trimtool';
  b.title=t('Trimmen (T) – Ripple, Roll, Slip und Slide');b.innerHTML='<svg viewBox="0 0 24 24"><path d="M9 4v16M15 4v16"/><path d="M5 9l-3 3 3 3M19 9l3 3-3 3"/></svg>';rz.after(b);
  const r=document.getElementById('razorbtn');if(r)r.title=t('Klinge (B) – Klick auf einen Clip teilt ihn');};
 new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});mount();
 const st=document.createElement('style');st.textContent=`.trimtool #rows .clip{cursor:ew-resize}.trimtool #rows .clip .hl,.trimtool #rows .clip .hr{background:var(--accent,#7c6cff);opacity:.85}
 .trimtip{position:fixed;z-index:9999;pointer-events:none;background:#000c;color:#fff;font:12px/1.3 ui-monospace,monospace;padding:4px 7px;border-radius:5px;display:none}`;document.head.appendChild(st);
})();
