// StreamPilot – Gewinnspiele, Mitspieler-Warteschlange, Sounds und Ziel-Balken.
(()=>{const T=(de,en)=>lang==='de'?de:en;
 ICON.gift='<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18"/><path d="M12 8c-2-4-6-4-6-1.5S9 8 12 8c3 0 6-.5 6-1.5S14 4 12 8z"/>';
 ICON.queue='<circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><path d="M2 20c0-3 2-5 5-5s5 2 5 5M12 20c0-3 2-5 5-5s5 2 5 5"/>';
 ICON.sound='<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M16 8l2-2M17 12h3M16 16l2 2"/>';
 ICON.goal='<path d="M4 21V4"/><path d="M4 4h13l-2 4 2 4H4"/>';
 // Neue Gruppe „Community“ vor „Einrichtung“
 const gi=NAV.findIndex(n=>n[0]==='grp'&&n[1]==='grp_setup');NAV.splice(gi<0?NAV.length:gi,0,['grp','grp_com'],['give','gift'],['queue','queue'],['sounds','sound'],['goals','goal']);
 Object.assign(L.de,{grp_com:'Community',nav_give:'Gewinnspiele',nav_queue:'Mitspieler',nav_sounds:'Sounds',nav_goals:'Ziel-Balken'});
 Object.assign(L.en,{grp_com:'Community',nav_give:'Giveaways',nav_queue:'Player queue',nav_sounds:'Sounds',nav_goals:'Goal bars'});
 let C=null,OV='';const load=async()=>{const r=await api('/api/com');C=r.com;OV=r.overlay;render()};
 const save=async()=>{const r=await api('/api/com',C);C=r.com;OV=r.overlay;toast(T('Gespeichert','Saved'))};
 const act=async(d,x={})=>{const r=await api('/api/com/do',{do:d,...x});C=r.com.com;render();return r};
 const head=(k,p)=>`<div class="head"><div><h1>${t('nav_'+k)}</h1><p>${p}</p></div></div>`;
 const pre=()=>((S.settings||{}).cmdPrefix||'!')[0];const first=s=>pre()+String(s||'').split(',')[0].trim();
 const obs=(w,extra='')=>OV?`<div class="obsbox"><b>${T('Für OBS','For OBS')}</b><span class="muted">${T('Als Browserquelle einfügen','Add as browser source')}</span><code>${esc(OV+'?w='+w+extra)}</code><button class="btn sm" data-cact="copy" data-v="${esc(OV+'?w='+w+extra)}">${T('Kopieren','Copy')}</button></div>`:'';
 const inp=(path,v,attrs='')=>`<input data-com="${path}" value="${esc(v??'')}" ${attrs}>`;
 const num=(path,v,w=80)=>`<input type="number" min="0" data-com="${path}" value="${v}" style="width:${w}px">`;
 const tog=(path,v)=>`<button class="switch ${v?'on':''}" data-cact="tog" data-path="${path}" aria-pressed="${!!v}"></button>`;
 const getP=(p)=>p.split('.').reduce((o,k)=>o[k],C);const setP=(p,v)=>{const ks=p.split('.');const l=ks.pop();ks.reduce((o,k)=>o[k],C)[l]=v};
 const wait=k=>{if(!C){load();return head(k,'')}return null};

 PAGES.give=()=>wait('give')||(()=>{const g=C.give,s=C.giveState,n=s.entries.length,tk=s.entries.reduce((a,e)=>a+e.tickets,0);
  return head('give',T('Zuschauer machen mit einem Stichwort im Chat mit, StreamPilot zieht einen Gewinner.','Viewers enter with a keyword in chat and StreamPilot draws a winner.'))+`
  <div class="card" style="margin-bottom:16px"><div class="line"><div><b>${s.open?T('Läuft gerade','Running'):T('Neues Gewinnspiel','New giveaway')}</b>${s.open?`<small class="muted" style="display:block">${esc(s.title||'')}</small>`:''}</div><span class="sp"></span>
   ${s.open?`<button class="btn" data-cact="giveStop">${T('Teilnahme beenden','Close entries')}</button>`:`<input id="giveTitle" placeholder="${T('Preis, z. B. Minecraft-Code','Prize, e.g. game key')}" style="width:260px"><button class="btn primary" data-cact="giveStart">${T('Starten','Start')}</button>`}
   <button class="btn primary" data-cact="giveDraw" ${n?'':'disabled'}>${T('Gewinner ziehen','Draw winner')}</button></div>
   <p class="muted" style="margin:8px 0">${n} ${T('Teilnehmer','entries')} · ${tk} ${T('Lose','tickets')}</p>
   ${n?`<div class="chips">${s.entries.map(e=>`<span class="chip">${esc(e.display)}${e.tickets>1?` <b>×${e.tickets}</b>`:''}</span>`).join('')}</div><button class="btn ghost sm" data-cact="giveClear" style="margin-top:8px">${T('Teilnehmer leeren','Clear entries')}</button>`:''}</div>
  <div class="card" style="margin-bottom:16px"><h3 style="margin:0 0 8px">${T('Einstellungen','Settings')}</h3>
   <div class="line"><div>${T('Stichwort zum Mitmachen','Keyword to enter')}</div>${inp('give.keyword',g.keyword,'style="width:160px"')}</div>
   <div class="line"><div>${T('Lose für Subs','Tickets for subs')}<small class="muted" style="display:block">${T('1 = gleiche Chance für alle','1 = equal chance for everyone')}</small></div>${num('give.subLuck',g.subLuck)}</div>
   <div class="line"><div>${T('Nur Follower dürfen mitmachen','Followers only')}</div>${tog('give.followOnly',g.followOnly)}</div>
   <div class="line"><div>${T('Automatisch ziehen nach','Draw automatically after')}<small class="muted" style="display:block">${T('0 = du ziehst selbst','0 = you draw yourself')}</small></div><span>${num('give.autoMin',g.autoMin)} min</span></div>
   <label class="lbl">${T('Nachricht beim Start','Start message')} <code>{title} {keyword}</code></label>${inp('give.openMsg',g.openMsg,'style="width:100%"')}
   <label class="lbl">${T('Nachricht für den Gewinner','Winner message')} <code>{user} {title}</code></label>${inp('give.winMsg',g.winMsg,'style="width:100%"')}
   <p class="muted" style="font-size:12.5px;margin:10px 0 0">${T('Mods im Chat','Mods in chat')}: <code>${pre()}gewinnspiel start Preis</code> <code>${pre()}gewinnspiel ziehen</code> <code>${pre()}gewinnspiel stop</code></p></div>
  <div class="card" style="margin-bottom:16px">${obs('give')}<p class="muted" style="font-size:12.5px;margin:6px 0 0">${T('Zeigt beim Ziehen eine Auslosung mit allen Namen und dann den Gewinner groß im Bild.','Shows a draw animation with all names and then the winner large on screen.')}</p></div>
  <div class="card"><h3 style="margin:0 0 8px">${T('Letzte Gewinner','Recent winners')}</h3>${s.winners.length?s.winners.map(w=>`<div class="muted">${esc(w)}</div>`).join(''):`<p class="muted">${T('Noch keine.','None yet.')}</p>`}</div>`})();

 PAGES.queue=()=>wait('queue')||(()=>{const q=C.queue,s=C.queueState;
  return head('queue',T('Zuschauer stellen sich im Chat an, um mitzuspielen. Du holst sie der Reihe nach dran.','Viewers line up in chat to play with you. You call them up in order.'))+`
  <div class="card" style="margin-bottom:16px"><div class="line"><div><b>${s.open?T('Warteschlange offen','Queue open'):T('Warteschlange geschlossen','Queue closed')}</b><small class="muted" style="display:block">${s.list.length} ${T('warten','waiting')}${q.max?` · max. ${q.max}`:''}</small></div><span class="sp"></span>
   <button class="btn ${s.open?'':'primary'}" data-cact="queueOpen" data-open="${!s.open}">${s.open?T('Schließen','Close'):T('Öffnen','Open')}</button>
   <button class="btn primary" data-cact="queueNext" ${s.list.length?'':'disabled'}>${T('Nächsten holen','Call next')}</button></div>
   ${s.playing.length?`<div class="now">${T('Gerade dran','Playing now')}: ${s.playing.map(e=>`<b>${esc(e.display)}</b>${e.note?` <span class="muted">(${esc(e.note)})</span>`:''}`).join(', ')}</div>`:''}
   ${s.list.length?`<div class="rows">${s.list.map((e,i)=>`<div class="r qrow"><b>${i+1}.</b><span>${esc(e.display)}${e.sub?' <span class="tag">Sub</span>':''}</span><span class="muted">${esc(e.note||'')}</span><button class="btn ghost icon" data-cact="queueUp" data-login="${esc(e.login)}" title="${T('Nach oben','Move up')}" ${i?'':'disabled'}>↑</button><button class="btn ghost icon" data-cact="queueDel" data-login="${esc(e.login)}" title="${T('Entfernen','Remove')}">✕</button></div>`).join('')}</div>
   <button class="btn ghost sm" data-cact="queueClear" style="margin-top:8px">${T('Alles leeren','Clear all')}</button>`:`<p class="muted">${s.open?T('Noch niemand angestellt.','Nobody in line yet.'):T('Öffne die Warteschlange, dann können sich Zuschauer mit dem Befehl unten anstellen.','Open the queue so viewers can join with the command below.')}</p>`}</div>
  <div class="card" style="margin-bottom:16px"><h3 style="margin:0 0 8px">${T('Einstellungen','Settings')}</h3>
   <div class="line"><div>${T('Höchstens','Maximum')}<small class="muted" style="display:block">${T('0 = unbegrenzt','0 = unlimited')}</small></div>${num('queue.max',q.max)}</div>
   <div class="line"><div>${T('Subs kommen zuerst dran','Subs go first')}</div>${tog('queue.subFirst',q.subFirst)}</div>
   <div class="line"><div>${T('Spielername beim Anstellen verlangen','Require in-game name')}</div>${tog('queue.needName',q.needName)}</div>
   <div class="line"><div>${T('Jeder nur einmal dran','Only one turn each')}<small class="muted" style="display:block">${T('Bis du die Liste leerst','Until you clear the list')}</small></div>${tog('queue.oncePer',q.oncePer)}</div>
   <div class="cmdgrid">${[['joinCmd',T('Anstellen','Join')],['leaveCmd',T('Verlassen','Leave')],['posCmd',T('Eigener Platz','Own position')],['listCmd',T('Liste zeigen','Show list')]].map(([k,n])=>`<label>${n}${inp('queue.'+k,q[k])}</label>`).join('')}</div>
   <label class="lbl">${T('Nachricht, wenn jemand dran ist','Message when it is someone’s turn')} <code>{user} {note}</code></label>${inp('queue.nextMsg',q.nextMsg,'style="width:100%"')}
   <p class="muted" style="font-size:12.5px;margin:10px 0 0">${T('Mods im Chat','Mods in chat')}: <code>${pre()}next</code> <code>${pre()}next 3</code> <code>${pre()}queueauf</code> <code>${pre()}queuezu</code></p></div>
  <div class="card">${obs('queue')}</div>`})();

 PAGES.sounds=()=>wait('sounds')||(()=>{const sc=C.soundCfg;
  return head('sounds',T('Zuschauer spielen kurze Sounds mit einem Chat-Befehl oder mit Kanalpunkten ab.','Viewers play short sounds with a chat command or channel points.'))+`
  <div class="card" style="margin-bottom:16px"><div class="line"><h3 style="margin:0">Sounds</h3><span class="sp"></span><label class="btn primary">+ ${T('Sound hochladen','Upload sound')}<input type="file" accept=".mp3,.wav,.ogg,.m4a,audio/*" id="sndUp" hidden></label></div>
   <div class="rows"><div class="r sndr h"><span>${t('c_on')}</span><span>Name</span><span>${T('Befehl','Command')}</span><span>${T('Kanalpunkte','Channel points')}</span><span>${T('Wer','Who')}</span><span>${T('Pause (s)','Cooldown (s)')}</span><span>${T('Lautst.','Volume')}</span><span></span></div>
   ${C.sounds.map((s,i)=>`<div class="r sndr ${s.on?'':'off'}">${tog('sounds.'+i+'.on',s.on)}${inp('sounds.'+i+'.name',s.name)}<span class="pfx"><i>${pre()}</i>${inp('sounds.'+i+'.cmd',s.cmd)}</span>${inp('sounds.'+i+'.reward',s.reward,`placeholder="${T('Name der Belohnung','Reward name')}"`)}
    <select data-com="sounds.${i}.level" data-num="1">${lvOpts(s.level)}</select>${num('sounds.'+i+'.cooldown',s.cooldown,70)}<input type="range" min="0" max="100" data-com="sounds.${i}.volume" data-num="1" value="${s.volume}">
    <span class="nowrap"><button class="btn ghost icon" data-cact="soundPlay" data-id="${s.id}" title="${T('Abspielen','Play')}">▶</button><button class="btn ghost icon" data-cact="soundDel" data-i="${i}" title="${T('Löschen','Delete')}">✕</button></span></div>`).join('')}</div></div>
  <div class="card" style="margin-bottom:16px"><h3 style="margin:0 0 8px">${T('Einstellungen','Settings')}</h3>
   <div class="line"><div>${T('Abspielen in','Play in')}<small class="muted" style="display:block">${T('„StreamPilot“ geht sofort, solange OBS den Desktop-Ton aufnimmt. „OBS-Overlay“ braucht die Browserquelle unten.','“StreamPilot” works right away as long as OBS captures desktop audio. “OBS overlay” needs the browser source below.')}</small></div>
    <select data-com="soundCfg.playIn"><option value="app" ${sc.playIn==='app'?'selected':''}>StreamPilot</option><option value="obs" ${sc.playIn==='obs'?'selected':''}>${T('OBS-Overlay','OBS overlay')}</option></select></div>
   <div class="line"><div>${T('Gesamtlautstärke','Master volume')}</div><input type="range" min="0" max="100" data-com="soundCfg.volume" data-num="1" value="${sc.volume}"></div>
   <div class="line"><div>${T('Pause zwischen zwei Sounds','Pause between any two sounds')}</div><span>${num('soundCfg.global',sc.global)} s</span></div>
   <div class="line"><div><code>${pre()}sounds</code> ${T('listet alle Sound-Befehle','lists all sound commands')}</div>${tog('soundCfg.listCmd',sc.listCmd)}</div></div>
  <div class="card">${obs('sound')}</div>`})();

 PAGES.goals=()=>wait('goals')||(()=>{const K={follow:T('Follower','Followers'),sub:T('Subs (inkl. Geschenke)','Subs (incl. gifts)'),bits:'Bits'};
  return head('goals',T('Fortschrittsbalken für Follower, Subs oder Bits, die sich im Stream von selbst füllen.','Progress bars for followers, subs or bits that fill up by themselves during the stream.'))+`
  ${C.goals.map((g,i)=>{const p=g.target>0?Math.min(100,g.current/g.target*100):0;return `<div class="card goalc ${g.on?'':'off'}" style="margin-bottom:16px"><div class="line">${tog('goals.'+i+'.on',g.on)}${inp('goals.'+i+'.title',g.title,'style="flex:1;font-weight:700"')}
   <select data-com="goals.${i}.kind">${Object.entries(K).map(([k,n])=>`<option value="${k}" ${g.kind===k?'selected':''}>${n}</option>`).join('')}</select><input type="color" data-com="goals.${i}.color" value="${esc(g.color||'#7c4dff')}"><button class="btn ghost icon" data-cact="goalDel" data-i="${i}">✕</button></div>
   <div class="gbar"><div style="width:${p}%;background:${esc(g.color||'#7c4dff')}"></div></div>
   <div class="line"><div>${T('Stand','Current')}</div><span><input type="number" min="0" id="gc_${g.id}" value="${g.current}" style="width:90px"> / ${num('goals.'+i+'.target',g.target,90)} <button class="btn sm" data-cact="goalSet" data-id="${g.id}">${T('Stand setzen','Set')}</button> <button class="btn ghost sm" data-cact="goalReset" data-id="${g.id}">${T('Auf 0','Reset')}</button></span></div>
   ${obs('goal','&id='+g.id)}</div>`}).join('')}
  <div class="card" style="margin-bottom:16px"><div class="line"><button class="btn" data-cact="goalAdd">+ ${T('Ziel','Goal')}</button><span class="sp"></span></div>
   <div class="line"><div>${T('Nachricht im Chat, wenn ein Ziel erreicht ist','Chat message when a goal is reached')}</div>${tog('goalMsg',C.goalMsg)}</div>
   <p class="muted" style="font-size:12.5px;margin:6px 0 0"><code>${pre()}ziel</code> ${T('zeigt allen den aktuellen Stand.','shows everyone the current progress.')}</p></div>`})();

 // Eingaben
 document.addEventListener('change',async e=>{const el=e.target;
  if(el.id==='sndUp'&&el.files[0]){const f=el.files[0];if(f.size>15e6)return toast(T('Datei zu groß (max. 15 MB)','File too large (max 15 MB)'));
   const data=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(f)});
   try{const r=await api('/api/com/upload',{name:f.name,data});const nm=f.name.replace(/\.[^.]+$/,'').slice(0,30);
    C.sounds.push({id:Math.random().toString(36).slice(2,9),name:nm,cmd:nm.toLowerCase().replace(/[^a-z0-9äöüß]/g,'').slice(0,20),reward:'',file:r.file,volume:70,cooldown:60,level:0,on:true,uses:0});await save();render()}catch(x){toast(x.message)}return}
  const p=el.dataset.com;if(!p||!C)return;let v=el.value;if(el.type==='number'||el.dataset.num)v=+v;setP(p,v);await save();if(/kind|color|target/.test(p))render()});
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-cact]');if(!b)return;e.stopImmediatePropagation();const a=b.dataset.cact;
  try{switch(a){
   case 'copy':await navigator.clipboard.writeText(b.dataset.v).catch(()=>{});toast(T('Kopiert. In OBS: Quelle hinzufügen → Browser → URL einfügen.','Copied. In OBS: add source → Browser → paste the URL.'));break;
   case 'tog':setP(b.dataset.path,!getP(b.dataset.path));await save();render();break;
   case 'giveStart':await act('giveStart',{title:(document.getElementById('giveTitle')||{}).value||''});break;
   case 'giveStop':await act('giveStop');break;
   case 'giveDraw':{const r=await act('giveDraw');toast(T('Gewonnen hat ','Winner: ')+r.winner);break}
   case 'giveClear':if(confirm(T('Alle Teilnehmer entfernen?','Remove all entries?')))await act('giveClear');break;
   case 'queueOpen':await act('queueOpen',{open:b.dataset.open==='true'});break;
   case 'queueNext':await act('queueNext',{n:1});break;
   case 'queueUp':await act('queueUp',{login:b.dataset.login});break;
   case 'queueDel':await act('queueDel',{login:b.dataset.login});break;
   case 'queueClear':if(confirm(T('Warteschlange komplett leeren?','Clear the whole queue?')))await act('queueClear');break;
   case 'soundPlay':await act('soundPlay',{id:b.dataset.id});break;
   case 'soundDel':if(confirm(T('Sound löschen?','Delete sound?'))){C.sounds.splice(+b.dataset.i,1);await save();render()}break;
   case 'goalSet':await act('goalSet',{id:b.dataset.id,current:+document.getElementById('gc_'+b.dataset.id).value});break;
   case 'goalReset':await act('goalSet',{id:b.dataset.id,current:0});break;
   case 'goalAdd':C.goals.push({id:Math.random().toString(36).slice(2,9),kind:'follow',title:T('Neues Ziel','New goal'),current:0,target:25,on:true,color:'#7c4dff'});await save();render();break;
   case 'goalDel':if(confirm(T('Ziel löschen?','Delete goal?'))){C.goals.splice(+b.dataset.i,1);await save();render()}break}}catch(x){toast(x.message)}},true);
 document.addEventListener('click',e=>{const p=e.target.closest('[data-page]');if(p&&['give','queue','sounds','goals'].includes(p.dataset.page))setTimeout(load,0)},true);
 // Live: Sounds im Fenster abspielen, Listen aktuell halten
 const connect=()=>{const es=new EventSource('/api/live');es.onmessage=ev=>{const m=JSON.parse(ev.data);
  if(m.kind==='sound'&&m.data.where==='app'){const a=new Audio('/api/com/snd/'+encodeURIComponent(m.data.file));a.volume=Math.max(0,Math.min(1,m.data.vol));a.play().catch(()=>{})}
  if(m.kind==='state'&&C&&['give','queue','goals'].includes(page)&&!document.querySelector('#app input:focus'))load()};es.onerror=()=>{es.close();setTimeout(connect,4000)}};connect();
 const st=document.createElement('style');st.textContent=`.obsbox{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px}.obsbox code{flex:1;min-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:6px 8px;border-radius:8px;background:#0003}
 .chips{display:flex;flex-wrap:wrap;gap:6px}.chip{padding:4px 10px;border-radius:999px;background:#ffffff12;font-size:13px}.lbl{display:block;font-size:12.5px;color:var(--muted);margin:10px 0 4px}
 .qrow{grid-template-columns:40px 1.2fr 1fr 40px 40px}.now{margin:8px 0;padding:8px 12px;border-radius:10px;background:#3ddc841a;border:1px solid #3ddc8455}
 .cmdgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:8px 0}.cmdgrid label{font-size:12.5px;color:var(--muted);display:flex;flex-direction:column;gap:4px}
 .sndr{grid-template-columns:52px 1fr 1fr 1.2fr 120px 80px 110px 80px}.pfx{display:flex;align-items:center;gap:2px}.pfx i{font-style:normal;color:var(--muted)}.pfx input{flex:1;min-width:0}.nowrap{white-space:nowrap}
 .gbar{height:14px;border-radius:7px;background:#ffffff14;overflow:hidden;margin:8px 0}.gbar div{height:100%;border-radius:7px;transition:width .6s}.goalc.off{opacity:.6}.goalc input[type=color]{width:40px;height:34px;padding:2px;border-radius:8px}`;document.head.appendChild(st);
 if(typeof S!=='undefined'&&S&&S.bot!==undefined)render();
})();
