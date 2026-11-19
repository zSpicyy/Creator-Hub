// StreamPilot – Hauptschalter oben auf jeder Seite: schaltet den ganzen Bereich ein oder aus.
(()=>{const T=(de,en)=>lang==='de'?de:en;
 const G=k=>((S.settings||{})[k])!==false;
 const setG=async(k,v)=>{S=await api('/api/settings',{[k]:v});render()};
 // proxy: vorhandenen Schalter auf der Seite benutzen und dessen Zeile ausblenden
 const proxy=(sel,hideUp)=>({get:()=>{const el=document.querySelector(sel);return el?el.classList.contains('on'):null},
  set:()=>{const el=document.querySelector(sel);el&&el.click()},hide:()=>{const el=document.querySelector(sel);const box=el&&el.closest(hideUp);if(box)box.style.display='none'}});
 const curTab=()=>{const b=document.querySelector('.sp-tab.on');return b?b.dataset.sptab:'builtin'};
 const FEAT={
  sr:()=>({name:T('Songwünsche','Song requests'),get:()=>G('srFeat'),set:v=>setG('srFeat',v)}),
  tts:()=>({name:T('Vorlesen (TTS)','Text to speech'),...proxy('[data-act="tts"][data-k="enabled"]','.card')}),
  alerts:()=>({name:'Alerts',...proxy('[data-act="alOn"]','.line')}),
  mod:()=>({name:T('Chat-Schutz','Chat protection'),...proxy('[data-act="modOn"]','.line')}),
  cmd:()=>{const k={builtin:['cmdOn',T('Eingebaute Befehle','Built-in commands')],own:['ownOn',T('Eigene Befehle','Custom commands')],timer:['timerOn',T('Timer-Nachrichten','Timed messages')],extra:['extraOn',T('Zitate und Extras','Quotes and extras')]}[curTab()];
   return{name:k[1],get:()=>G(k[0]),set:v=>setG(k[0],v)}}};
 const navMark=()=>{const off={sr:!G('srFeat'),tts:S.tts&&!S.tts.enabled,alerts:!S.alertsOn,cmd:!G('cmdOn')&&!G('ownOn')&&!G('timerOn')&&!G('extraOn')};
  document.querySelectorAll('nav [data-page], .nav [data-page], #nav [data-page]').forEach(a=>{a.querySelector('.feat-off-tag')?.remove();if(off[a.dataset.page]){const t=document.createElement('span');t.className='feat-off-tag';t.textContent=T('aus','off');a.appendChild(t)}})};
 const inject=()=>{navMark();const f=FEAT[page];const app=document.getElementById('app');if(!app)return;app.classList.remove('feat-off');
  const head=app.querySelector('.head');if(!f||!head)return;const F=f();const on=F.get();if(on===null)return;F.hide&&F.hide();
  const box=document.createElement('div');box.className='feat-sw'+(on?' on':'');
  box.innerHTML=`<span>${on?T('An','On'):T('Aus','Off')}</span><button class="switch ${on?'on':''}" aria-pressed="${on}" aria-label="${F.name} ${T('ein- oder ausschalten','on or off')}"></button>`;
  box.querySelector('button').onclick=async e=>{e.stopPropagation();try{await F.set(!on)}catch(x){toast(x.message)}};
  head.appendChild(box);
  if(!on){app.classList.add('feat-off');const n=document.createElement('div');n.className='feat-note';
   n.textContent=T(`„${F.name}“ ist komplett ausgeschaltet. Im Stream passiert dazu nichts, bis du den Schalter oben wieder anmachst.`,`“${F.name}” is switched off completely. Nothing happens in your stream until you turn the switch above back on.`);
   const tabs=app.querySelector('.sp-tabs');(tabs||head).after(n)}};
 const r0=render;render=function(){r0.apply(this,arguments);try{inject()}catch(e){console.error(e)}};
 const st=document.createElement('style');st.textContent=`.feat-sw{margin-left:auto;display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:12px;background:var(--card,#ffffff0d);border:1px solid var(--line,#ffffff1a);font-weight:700}
 .feat-sw span{min-width:28px;text-align:right;color:var(--muted)}.feat-sw.on span{color:#3ddc84}.head .sp+.feat-sw{margin-left:0}
 .feat-note{margin:0 0 16px;padding:12px 14px;border-radius:12px;background:#f0a33a1f;border:1px solid #f0a33a66;font-size:14px}
 .feat-off-tag{margin-left:auto;font-size:11px;padding:1px 6px;border-radius:6px;background:#ffffff14;color:var(--muted)}
 #app.feat-off>:not(.head):not(.sp-tabs):not(.feat-note){opacity:.4;pointer-events:none;filter:grayscale(.6)}`;document.head.appendChild(st);
 if(typeof S!=='undefined'&&S&&S.bot!==undefined)render();
})();
