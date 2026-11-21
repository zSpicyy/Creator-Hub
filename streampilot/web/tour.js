// StreamPilot – kurze Einführung beim ersten Öffnen (jederzeit überspringbar, in den Einstellungen wiederholbar).
(()=>{const T=(de,en)=>lang==='de'?de:en;
 const navBtn=k=>document.querySelector(`#nav [data-page="${k}"]`);
 const grp=(...ks)=>()=>{const els=ks.map(navBtn).filter(Boolean);if(!els.length)return null;const r=els.map(e=>e.getBoundingClientRect());
  return{left:Math.min(...r.map(x=>x.left)),top:Math.min(...r.map(x=>x.top)),right:Math.max(...r.map(x=>x.right)),bottom:Math.max(...r.map(x=>x.bottom))}};
 const el=sel=>()=>{const e=document.querySelector(sel);return e?e.getBoundingClientRect():null};
 const STEPS=()=>[
  {t:T('Willkommen bei StreamPilot','Welcome to StreamPilot'),d:T('StreamPilot ist dein Bot für Twitch: Songwünsche, Vorlesen, Alerts, Chat-Befehle, Chat-Schutz, Gewinnspiele und mehr. Hier sind kurz die wichtigsten Schritte.','StreamPilot is your Twitch bot: song requests, text to speech, alerts, chat commands, chat protection, giveaways and more. Here are the most important steps.')},
  {r:grp('acc'),page:'acc',t:T('1. Konten verbinden','1. Connect accounts'),d:T('Verbinde hier dein Twitch-Konto. Für Songwünsche kommt Spotify dazu. Ohne Verbindung kann der Bot nicht in deinen Chat.','Connect your Twitch account here. Add Spotify for song requests. Without a connection the bot cannot join your chat.')},
  {r:el('#botBtn'),t:T('2. Bot starten','2. Start the bot'),d:T('Mit diesem Knopf geht der Bot in deinen Chat. Unter „Einstellungen“ kannst du ihn beim Öffnen automatisch starten lassen.','This button sends the bot into your chat. Under “Settings” you can let it start automatically.')},
  {r:el('.feat-sw'),page:'sr',t:T('3. Alles ein- und ausschalten','3. Switch anything on or off'),d:T('Jeder Bereich hat oben rechts einen Hauptschalter. Was du nicht brauchst, machst du damit komplett aus.','Every section has a main switch at the top right. Anything you don’t need, you switch off completely.')},
  {t:T('Fertig!','All set!'),d:T('Alles ist schon sinnvoll voreingestellt. Fang am besten bei „Konten“ an. Die Einführung findest du jederzeit wieder unter „Einstellungen“.','Everything comes with sensible defaults. Best start with “Accounts”. You can replay this tour anytime under “Settings”.'),last:1}];
 let i=0,box=null;
 const close=async()=>{box&&box.remove();box=null;window.removeEventListener('resize',draw);try{S=await api('/api/settings',{tourDone:true})}catch(e){}};
 function draw(){if(!box)return;const st=STEPS()[i],n=STEPS().length;
  const r=st.r&&st.r();const hole=box.querySelector('.tr-hole'),card=box.querySelector('.tr-card');
  if(r){const p=6;Object.assign(hole.style,{display:'block',left:r.left-p+'px',top:r.top-p+'px',width:r.right-r.left+2*p+'px',height:r.bottom-r.top+2*p+'px'})}else hole.style.display='none';
  card.innerHTML=`<div class="tr-dots">${STEPS().map((_,k)=>`<i class="${k===i?'on':''}"></i>`).join('')}</div><h3>${st.t}</h3><p>${st.d}</p>
   <div class="tr-btns">${st.last?'':`<button class="btn ghost" data-tr="skip">${T('Überspringen','Skip')}</button>`}<span class="sp"></span>${i?`<button class="btn" data-tr="back">${T('Zurück','Back')}</button>`:''}<button class="btn primary" data-tr="next">${st.last?T('Los geht’s','Let’s go'):i?T('Weiter','Next'):T('Einführung starten','Start tour')}</button></div>`;
  // Karte neben das hervorgehobene Element setzen
  const cw=Math.min(380,innerWidth-32);card.style.width=cw+'px';
  if(r){let x=r.right+20,y=Math.max(16,Math.min(r.top,innerHeight-card.offsetHeight-16));if(x+cw>innerWidth-16){x=Math.max(16,r.left-cw-20);if(x<16){x=16;y=Math.min(innerHeight-card.offsetHeight-16,r.bottom+16)}}card.style.left=x+'px';card.style.top=y+'px';card.style.transform='none'}
  else{card.style.left='50%';card.style.top='50%';card.style.transform='translate(-50%,-50%)'}
  card.querySelector('[data-tr="next"]').focus()}
 const go=k=>{i=k;const st=STEPS()[i];if(st.page&&page!==st.page){const b=navBtn(st.page);b&&b.click();setTimeout(draw,350)}else draw()};
 window.startTour=()=>{if(box)return;i=0;box=document.createElement('div');box.className='tr';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  box.innerHTML='<div class="tr-hole"></div><div class="tr-card"></div>';document.body.appendChild(box);
  box.addEventListener('click',e=>{const b=e.target.closest('[data-tr]');if(!b)return;const a=b.dataset.tr;if(a==='skip')close();else if(a==='back')go(i-1);else if(STEPS()[i].last)close();else go(i+1)});
  box.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='ArrowRight'&&!STEPS()[i].last)go(i+1);if(e.key==='ArrowLeft'&&i)go(i-1)});
  window.addEventListener('resize',draw);draw()};
 // In den Einstellungen: Einführung erneut ansehen
 const r0=render;render=function(){r0.apply(this,arguments);if(page==='set'&&!document.getElementById('tourAgain')){const app=document.getElementById('app');const c=document.createElement('div');c.className='card';c.style.marginTop='16px';
  c.innerHTML=`<div class="line"><div><b>${T('Einführung','Tour')}</b><small class="muted" style="display:block">${T('Die kurze Tour durch StreamPilot noch einmal ansehen.','Watch the short StreamPilot tour again.')}</small></div><button class="btn" id="tourAgain">${T('Erneut ansehen','Watch again')}</button></div>`;
  app.appendChild(c);c.querySelector('button').onclick=()=>startTour()}};
 const st=document.createElement('style');st.textContent=`.tr{position:fixed;inset:0;z-index:9999}
 .tr-hole{position:fixed;border-radius:12px;box-shadow:0 0 0 9999px rgba(5,4,12,.72);outline:2px solid var(--accent,#7c4dff);transition:all .3s ease;pointer-events:none}
 .tr:not(:has(.tr-hole[style*="block"])){background:rgba(5,4,12,.72)}
 .tr-card{position:fixed;background:var(--bg2,#17151f);border:1px solid var(--line,#ffffff1f);border-radius:16px;padding:20px 22px;box-shadow:0 18px 50px #0009;transition:left .3s,top .3s}
 .tr-card h3{margin:6px 0 8px;font-size:19px}.tr-card p{margin:0 0 16px;color:var(--muted);line-height:1.5}
 .tr-btns{display:flex;gap:8px;align-items:center}.tr-btns .sp{flex:1}.tr-dots{display:flex;gap:5px}.tr-dots i{width:7px;height:7px;border-radius:50%;background:#ffffff26}.tr-dots i.on{background:var(--accent,#7c4dff);width:18px;border-radius:4px}
 @media (prefers-reduced-motion:reduce){.tr-hole,.tr-card{transition:none}}`;document.head.appendChild(st);
 // Beim allerersten Öffnen automatisch starten
 const wait=setInterval(()=>{if(typeof S!=='undefined'&&S&&S.settings){clearInterval(wait);if(!S.settings.tourDone)setTimeout(startTour,600)}},300);
})();
