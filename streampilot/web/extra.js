// StreamPilot – Seiten „Eigene Befehle“ (mit Zählern, Zitaten, Timern) und „Chat-Schutz“.
(()=>{const T=(de,en)=>lang==='de'?de:en;
 ICON.own='<path d="M4 6h16M4 12h10M4 18h7"/><path d="M17 15l4 3-4 3"/>';ICON.shield='<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>';
 const i=NAV.findIndex(n=>n[0]==='cmd');NAV.splice(i+1,0,['own','own'],['mod','shield']);
 L.de.nav_own='Eigene Befehle';L.en.nav_own='Custom commands';L.de.nav_mod='Chat-Schutz';L.en.nav_mod='Chat protection';
 let O=null,M=null,dirty=0;const load=async()=>{O=await api('/api/own');M=await api('/api/mod');render()};
 const saveO=async()=>{O=await api('/api/own',O);toast(T('Gespeichert','Saved'))};const saveM=async()=>{M=await api('/api/mod',M.cfg);toast(T('Gespeichert','Saved'))};
 const lv=(v,k,id)=>`<select data-own="${k}" data-id="${id}" data-f="level">${lvOpts(v)}</select>`;
 const uid=()=>Math.random().toString(36).slice(2,9);

 PAGES.own=()=>{if(!O){load();return `<div class="head"><h1>${t('nav_own')}</h1></div>`}
  const vars='{user} {touser} {args} {count} {counter:name} {random:1-100} {channel} {uptime} {game} {title}';
  return `<div class="head"><div><h1>${t('nav_own')}</h1><p>${T('Eigene Chat-Befehle mit Antworten, Zähler, Zitate, Shoutouts und Nachrichten, die regelmäßig von selbst kommen.','Your own chat commands with replies, counters, quotes, shoutouts and messages that post on their own.')}</p></div></div>
  <div class="card" style="margin-bottom:16px"><div class="line"><h3 style="margin:0">${T('Befehle','Commands')}</h3><span class="sp"></span><button class="btn primary" data-act="ownAdd">+ ${T('Befehl','Command')}</button></div>
   <div class="rows own-rows"><div class="r ownr h"><span>${t('c_on')}</span><span>${T('Name(n)','Name(s)')}</span><span>${T('Antwort','Reply')}</span><span>${T('Wer','Who')}</span><span>${T('Pause (s)','Cooldown (s)')}</span><span></span></div>
   ${O.cmds.map(c=>`<div class="r ownr ${c.on?'':'off'}">${sw(c.on,'ownTog',`data-id="${c.id}"`)}<input data-own="cmd" data-id="${c.id}" data-f="names" value="${esc(c.names)}" placeholder="discord, dc">
    <textarea data-own="cmd" data-id="${c.id}" data-f="response" rows="1" placeholder="${T('Antwort im Chat','Reply in chat')}">${esc(c.response)}</textarea>${lv(c.level,'cmd',c.id)}<input type="number" min="0" data-own="cmd" data-id="${c.id}" data-f="cooldown" value="${c.cooldown}" style="width:80px">
    <button class="btn ghost icon" data-act="ownDel" data-id="${c.id}" title="${T('Löschen','Delete')}">✕</button></div>${c.response.includes('{count}')?`<div class="ownhint">${T('Zähler','Counter')}: <b>${O.counters[c.id]||0}</b> · ${T('Mods ändern ihn im Chat mit','Mods change it in chat with')} <code>${prefixes0()}${c.names.split(',')[0].trim()} +</code> <code>-</code> <code>=5</code> · ${T('benutzt','used')} ${c.uses}×</div>`:''}`).join('')}</div>
   <p class="muted" style="margin:12px 0 0;font-size:12.5px">${T('Variablen','Variables')}: <code>${vars}</code>. ${T('Mehrere Zeilen = mehrere Nachrichten.','Several lines = several messages.')}</p></div>
  <div class="card" style="margin-bottom:16px"><div class="line"><h3 style="margin:0">${T('Timer-Nachrichten','Timed messages')}</h3><span class="sp"></span><button class="btn primary" data-act="ownTimerAdd">+ Timer</button></div>
   <p class="muted" style="font-size:12.5px;margin:4px 0 10px">${T('Kommt frühestens alle X Minuten – und nur, wenn seitdem genug im Chat los war. Mehrere Timer wechseln sich ab.','Posts at most every X minutes – and only if the chat has been active since. Several timers take turns.')}</p>
   <div class="rows"><div class="r timr h"><span>${t('c_on')}</span><span>${T('Nachricht','Message')}</span><span>${T('alle Min.','every min')}</span><span>${T('ab Nachr.','after msgs')}</span><span></span></div>
   ${O.timers.map(x=>`<div class="r timr ${x.on?'':'off'}">${sw(x.on,'ownTimerTog',`data-id="${x.id}"`)}<textarea data-own="timer" data-id="${x.id}" data-f="msg" rows="1">${esc(x.msg)}</textarea><input type="number" min="1" data-own="timer" data-id="${x.id}" data-f="minutes" value="${x.minutes}" style="width:80px"><input type="number" min="0" data-own="timer" data-id="${x.id}" data-f="lines" value="${x.lines}" style="width:80px"><button class="btn ghost icon" data-act="ownTimerDel" data-id="${x.id}">✕</button></div>`).join('')||`<p class="muted">${T('Noch keine Timer.','No timers yet.')}</p>`}</div></div>
  <div class="card" style="margin-bottom:16px"><h3 style="margin:0 0 10px">${T('Eingebaute Extras','Built-in extras')}</h3>
   ${[['quote','!quote [Nr]',T('Zufälliges oder bestimmtes Zitat','Random or specific quote')],['addquote','!addquote Text',T('Zitat speichern (Mods)','Save a quote (mods)')],['delquote','!delquote Nr',T('Zitat löschen (Mods)','Delete a quote (mods)')],['so','!so @name',T('Shoutout mit Link und zuletzt gestreamtem Spiel (Mods)','Shoutout with link and last game (mods)')],['permit','!permit @name',T('Erlaubt einen Link trotz Chat-Schutz (Mods)','Allows one link despite chat protection (mods)')]].map(([k,c,d])=>`<div class="line" style="padding:6px 0"><div><code>${c}</code> <span class="muted" style="font-size:13px">${d}</span></div>${sw(O.builtin[k],'ownBuiltin',`data-k="${k}"`)}</div>`).join('')}
   <div style="margin-top:8px"><label class="muted" style="font-size:12.5px">${T('Shoutout-Text','Shoutout text')} ({name} {login} {game})</label><input data-own="so" value="${esc(O.soMsg||'')}" placeholder="${T('Standard: Schaut unbedingt bei {name} vorbei …','Default: Go check out {name} …')}" style="width:100%"></div></div>
  <div class="card"><div class="line"><h3 style="margin:0">${T('Zitate','Quotes')} (${O.quotes.length})</h3></div>
   ${O.quotes.length?`<div class="rows">${O.quotes.slice().reverse().map(q=>`<div class="r qr"><b>#${q.n}</b><span>„${esc(q.text)}“</span><span class="muted">${esc(q.date)}</span><button class="btn ghost icon" data-act="ownQDel" data-n="${q.n}">✕</button></div>`).join('')}</div>`:`<p class="muted">${T('Mods speichern Zitate im Chat mit !addquote.','Mods save quotes in chat with !addquote.')}</p>`}</div>`};
 const prefixes0=()=>((S.settings||{}).cmdPrefix||'!')[0];

const RULES0=()=>[['links',T('Links','Links'),T('Nur erlaubte Seiten; !permit erlaubt einen Link.','Only allowed sites; !permit allows one link.')],['caps',T('Großbuchstaben','Caps'),''],['spam',T('Spam','Spam'),T('Gleiche Zeichen hintereinander und doppelte Nachrichten innerhalb von 30 s.','Repeated characters and duplicate messages within 30 s.')],['emotes',T('Zu viele Emotes','Too many emotes'),''],['words',T('Verbotene Wörter','Banned words'),''],['length',T('Zu lange Nachrichten','Too long messages'),'']];
const ACT0=()=>[['escalate',T('Löschen, bei Wiederholung Timeout','Delete, timeout if repeated')],['delete',T('Nur löschen','Delete only')],['timeout','Timeout'],['ban',T('Bann','Ban')]];
 PAGES.mod=()=>{if(!M){load();return `<div class="head"><h1>${t('nav_mod')}</h1></div>`}const c=M.cfg,RULES=RULES0(),ACT=ACT0();
  const num=(k,v,w=80)=>`<input type="number" min="1" data-mod="${k}" value="${v}" style="width:${w}px">`;
  const extra={links:`<div class="modx"><label>${T('Erlaubte Seiten','Allowed sites')}</label><input data-mod="allow" value="${esc((c.allow||[]).join(', '))}" style="flex:1"><label>${T('!permit gilt','!permit lasts')}</label>${num('permitSec',c.permitSec)} s</div>`,
   caps:`<div class="modx"><label>${T('ab','from')}</label>${num('capsMin',c.capsMin)}<label>${T('Buchstaben, wenn mehr als','letters, if more than')}</label>${num('capsPct',c.capsPct)}<label>% ${T('groß','upper case')}</label></div>`,
   spam:`<div class="modx"><label>${T('gleiche Zeichen hintereinander ab','repeated characters from')}</label>${num('repeatMax',c.repeatMax)}</div>`,
   emotes:`<div class="modx"><label>${T('mehr als','more than')}</label>${num('emoteMax',c.emoteMax)}<label>Emotes</label></div>`,
   words:`<div class="modx"><label>${T('Wörter (Komma getrennt)','Words (comma separated)')}</label><input data-mod="wordList" value="${esc((c.wordList||[]).join(', '))}" style="flex:1"></div>`,
   length:`<div class="modx"><label>${T('mehr als','more than')}</label>${num('lengthMax',c.lengthMax)}<label>${T('Zeichen','characters')}</label></div>`};
  const fmtT=s=>new Date(s*1000).toLocaleTimeString();
  return `<div class="head"><div><h1>${t('nav_mod')}</h1><p>${T('Löscht störende Nachrichten automatisch und schickt bei Wiederholung einen Timeout. Mods und der Streamer sind immer ausgenommen.','Automatically deletes disruptive messages and times out repeat offenders. Mods and the streamer are always exempt.')}</p></div></div>
  ${M.streamer&&M.scopes?'':`<div class="card warn" style="margin-bottom:16px"><b>${T('Moderationsrechte fehlen','Moderation rights missing')}</b><p class="muted" style="margin:4px 0 0">${T('Damit StreamPilot Nachrichten löschen und Timeouts geben darf, verbinde das Streamer-Konto unter „Konten“ einmal neu und bestätige die neuen Rechte.','So StreamPilot can delete messages and give timeouts, reconnect the streamer account under “Accounts” and confirm the new permissions.')}</p><button class="btn" data-page="acc" style="margin-top:8px">${T('Zu den Konten','Go to accounts')}</button></div>`}
  <div class="card" style="margin-bottom:16px"><div class="line"><div><b>${T('Chat-Schutz aktiv','Chat protection on')}</b></div>${sw(c.on,'modOn')}</div>
   <div class="line"><div>${T('VIPs ausnehmen','Exempt VIPs')}</div>${sw(c.vipsOk,'modB',`data-k="vipsOk"`)}</div><div class="line"><div>${T('Subs ausnehmen','Exempt subs')}</div>${sw(c.subsOk,'modB',`data-k="subsOk"`)}</div>
   <div class="line"><div>${T('Hinweis im Chat, wenn etwas gelöscht wird','Notice in chat when something is removed')}</div>${sw(c.warn,'modB',`data-k="warn"`)}</div>
   <div class="line"><div>${T('Timeout-Dauer','Timeout length')}</div><select data-mod="timeout">${[[60,'1 min'],[300,'5 min'],[600,'10 min'],[1800,'30 min'],[3600,'1 h'],[86400,'24 h']].map(([v,n])=>`<option value="${v}" ${+c.timeout===v?'selected':''}>${n}</option>`).join('')}</select></div></div>
  <div class="card" style="margin-bottom:16px"><h3 style="margin:0 0 6px">${T('Regeln','Rules')}</h3>
   ${RULES.map(([k,n,d])=>`<div class="modrule ${c[k].on?'':'off'}"><div class="line">${sw(c[k].on,'modRule',`data-k="${k}"`)}<div style="flex:1"><b>${n}</b>${d?`<small class="muted" style="display:block">${d}</small>`:''}</div><select data-modact="${k}">${ACT.map(([v,l])=>`<option value="${v}" ${(c[k].action||'escalate')===v?'selected':''}>${l}</option>`).join('')}</select></div>${extra[k]}</div>`).join('')}</div>
  <div class="card" style="margin-bottom:16px"><div class="line"><div><b>${T('Erst-Chatter begrüßen','Greet first-time chatters')}</b><small class="muted" style="display:block">${T('Wenn jemand zum allerersten Mal in deinem Chat schreibt.','When someone writes in your chat for the very first time.')}</small></div>${sw(c.first,'modB',`data-k="first"`)}</div>
   <input data-mod="firstMsg" value="${esc(c.firstMsg||'')}" placeholder="${T('Willkommen im Chat, @{user}! Schön, dass du da bist.','Welcome to the chat, @{user}! Great to have you here.')}" style="width:100%"></div>
  <div class="card"><h3 style="margin:0 0 8px">${T('Protokoll','Log')}</h3>${M.log.length?`<div class="rows">${M.log.slice().reverse().slice(0,50).map(e=>`<div class="r logr"><span class="muted">${fmtT(e.t)}</span><b>${esc(e.user)}</b><span>${(RULES.find(r=>r[0]===e.rule)||[,e.rule])[1]}</span><span class="tag">${(ACT.find(a=>a[0]===e.action)||[,e.action])[1]}</span><span class="muted ell">${esc(e.text)}</span></div>`).join('')}</div>`:`<p class="muted">${T('Noch nichts passiert.','Nothing has happened yet.')}</p>`}</div>`};

 // Eingaben
 const findC=(k,id)=>k==='cmd'?O.cmds.find(c=>c.id===id):O.timers.find(x=>x.id===id);
 document.addEventListener('change',e=>{const el=e.target;
  if(el.dataset.own){if(el.dataset.own==='so'){O.soMsg=el.value;return saveO()}const c=findC(el.dataset.own,el.dataset.id);if(!c)return;const f=el.dataset.f;c[f]=el.type==='number'||f==='level'?+el.value:el.value;saveO();if(f==='response')render()}
  else if(el.dataset.mod){const k=el.dataset.mod,c=M.cfg;c[k]=k==='allow'||k==='wordList'?el.value.split(',').map(s=>s.trim()).filter(Boolean):el.type==='number'||k==='timeout'?+el.value:el.value;saveM()}
  else if(el.dataset.modact){M.cfg[el.dataset.modact].action=el.value;saveM()}});
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act,id=b.dataset.id;
  const H={ownAdd:()=>{O.cmds.push({id:uid(),names:'neu',response:'',level:0,cooldown:10,on:true,uses:0});saveO().then(render)},
   ownDel:()=>{if(confirm(T('Befehl löschen?','Delete command?'))){O.cmds=O.cmds.filter(c=>c.id!==id);saveO().then(render)}},
   ownTog:()=>{const c=findC('cmd',id);c.on=!c.on;saveO().then(render)},
   ownTimerAdd:()=>{O.timers.push({id:uid(),msg:'',minutes:15,lines:10,on:true});saveO().then(render)},
   ownTimerDel:()=>{O.timers=O.timers.filter(x=>x.id!==id);saveO().then(render)},ownTimerTog:()=>{const x=findC('timer',id);x.on=!x.on;saveO().then(render)},
   ownBuiltin:()=>{O.builtin[b.dataset.k]=!O.builtin[b.dataset.k];saveO().then(render)},ownQDel:()=>{O.quotes=O.quotes.filter(q=>q.n!==+b.dataset.n);saveO().then(render)},
   modOn:()=>{M.cfg.on=!M.cfg.on;saveM().then(render)},modB:()=>{M.cfg[b.dataset.k]=!M.cfg[b.dataset.k];saveM().then(render)},modRule:()=>{const r=M.cfg[b.dataset.k];r.on=!r.on;saveM().then(render)}};
  if(H[a]){e.stopImmediatePropagation();try{await H[a]()}catch(x){toast(x.message)}}},true);
 // Seite neu laden, wenn man hinwechselt (Zähler, Zitate und Protokoll ändern sich im Chat)
 document.addEventListener('click',e=>{const p=e.target.closest('[data-page]');if(p&&(p.dataset.page==='own'||p.dataset.page==='mod'))setTimeout(load,0)},true);
 setInterval(()=>{if(page==='mod'&&M&&!document.querySelector('#app :focus'))api('/api/mod').then(x=>{if(JSON.stringify(x.log)!==JSON.stringify(M.log)){M=x;render()}})},5000);
 const st=document.createElement('style');st.textContent=`.ownr{grid-template-columns:52px 1.1fr 2.6fr 1fr 90px 40px}.timr{grid-template-columns:52px 3fr 90px 90px 40px}.ownr textarea,.timr textarea{resize:vertical;min-height:34px;width:100%}
 .ownhint{font-size:12px;color:var(--muted);padding:2px 0 10px 60px}.qr{grid-template-columns:50px 1fr 100px 40px}.logr{grid-template-columns:80px 120px 130px 170px 1fr}.ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .modrule{border-top:1px solid var(--line,#ffffff14);padding:6px 0}.modrule.off .modx{opacity:.45}.modx{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:2px 0 6px 60px;font-size:13px}.modx label{color:var(--muted)}
 .card.warn{border-color:#f0a33a88}.tag{font-size:12px}`;document.head.appendChild(st);
 if(typeof S!=='undefined'&&S&&S.bot!==undefined)render();
})();
