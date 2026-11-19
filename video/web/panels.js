// Bibliothek (links), Eigenschaften (rechts) und die Fenster für Export, Projekt, Übergangs-Designer und Tastenkürzel.
const Panels=(()=>{
 const N={ptab:null};const lb=()=>$('#libbody');
 const fmtDur=s=>{s=Math.round(s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
 const ICON={play:'<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',stop:'<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
  edit:'<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',x:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>'};

 // ---------- Fenster ----------
 N.modal=html=>{if(Timeline.closeMenu)Timeline.closeMenu();$('#mbox').innerHTML=html;$('#modal').classList.add('show')};
 N.close=()=>{const m=$('#mbox');$('#modal').classList.remove('show');m.innerHTML='';m.onclick=m.oninput=m.onchange=null;stopAnims()};
 $('#modal').addEventListener('pointerdown',e=>{if(e.target.id==='modal'&&!N.locked)N.close()});
 document.addEventListener('click',e=>{if(e.target.closest('[data-close]'))N.close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#modal').classList.contains('show')&&!N.locked){N.close();e.stopPropagation()}},true);

 // ---------- Bibliothek (Reiter oben, Seitenleiste links, Inhalt rechts – wie in Filmora) ----------
 N.sub={};let q='';
 const SIDES={media:[['project','Projektmedien'],['global','Meine Medien']],
  titles:[['all','Alle'],['titel','Überschriften'],['unter','Untertitel'],['bauch','Bauchbinden'],['social','Social Media'],['gaming','Gaming'],['abspann','Abspann'],['flaeche','Farbflächen']],
  fx:[['all','Alle'],['unschaerfe','Unschärfe & Schärfe'],['stil','Stil'],['retro','Retro'],['verzerren','Verzerren'],['bewegung','Bewegung']],filter:[['all','Alle'],['farbe','Farblooks'],['kino','Kino'],['klassisch','Klassisch'],['jahreszeiten','Jahreszeiten']],
  stickers:[['emoji','Emojis'],['formen','Pfeile & Formen'],['social','Social Media'],['blasen','Sprechblasen'],['gaming','Gaming'],['feiern','Feiern'],['liebe','Liebe'],['effekte','Effekte']],tpl:[['all','Alle'],['intro','Intros'],['outro','Outros'],['social','Social Media']]};
 const SORDER=['Whoosh','Übergänge','Filmisch','Aufprall','Riser','Reaktionen','Cartoon','Benachrichtigung','Pop','Klick','Ding','Glitch','Sci-Fi','Horror','Countdown','Natur','Tippen','Tick','Weitere'];
 const sideFor=tab=>[['fav','Favoriten'],...sideFor0(tab)];
 const sideFor0=tab=>tab==='audio'?[['all','Alle Soundeffekte'],...[...new Set(App.S.library.sounds.filter(x=>x.cat).map(x=>x.cat))].sort((a,b)=>SORDER.indexOf(a)-SORDER.indexOf(b)).map(c=>[c,c]),['mine','Meine Sounds']]:tab==='trans'?[['all','Alle'],['mine','Eigene'],...[...new Set(App.S.transitions.map(t=>t.group))].map(g=>[g,g])]:SIDES[tab];
 document.addEventListener('click',e=>{const b=e.target.closest('#tabs [data-tab]');if(b){App.tab=b.dataset.tab;q='';return N.lib()}
  const s=e.target.closest('#side [data-sub]');if(s){N.sub[App.tab]=s.dataset.sub;stopPreview();return N.lib()}});
 const TABS={};
 N.lib=()=>{stopAnims();$$('#tabs [data-tab]').forEach(b=>b.classList.toggle('on',b.dataset.tab===App.tab));const sd=sideFor(App.tab);
  if(!sd.some(x=>x[0]===N.sub[App.tab]))N.sub[App.tab]=sd[1][0];
  $('#side').innerHTML=sd.map(([k,n])=>`<button data-sub="${esc(k)}" class="${N.sub[App.tab]===k?'on':''}">${k==='fav'?'<span class="favi">★</span>':''}${esc(Kit.t(n))}${k==='fav'&&favList(App.tab).length?`<span class="n">${favList(App.tab).length}</span>`:''}</button>`).join('');
  const T=TABS[App.tab];$('#libtop').innerHTML=T.top();body()};
 // Favoriten: in jedem Bereich ganz oben, Stern an jedem Element, für alle Projekte gespeichert
 const favList=tab=>(App.S.library.favs&&App.S.library.favs[tab])||[];
 const favKey=el=>{let d;try{d=JSON.parse(el.dataset.drag)}catch(e){return''}return d.kind==='title'?'t:'+(TITLES[d.id]?.name||d.id):d.kind==='color'?'c:'+d.color:String(d.id)};
 const FAVALL={media:()=>['project','global'],audio:()=>['all','mine'],titles:()=>['all'],trans:()=>['all'],fx:()=>['all'],filter:()=>['all'],stickers:()=>SIDES.stickers.map(x=>x[0]),tpl:()=>['all']};
 const STAR='<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/></svg>';
 function addStars(root,tab){const fs=new Set(favList(tab));for(const el of root.querySelectorAll('[data-drag]')){const k=favKey(el);if(!k||el.querySelector(':scope>.fav'))continue;const b=document.createElement('button');
  b.className='fav'+(fs.has(k)?' on':'');b.dataset.fav=k;b.title=Kit.t(fs.has(k)?'Aus den Favoriten entfernen':'Zu den Favoriten');b.innerHTML=STAR;
  if(el.classList.contains('snd')){const last=el.querySelector('[data-usesnd]');el.insertBefore(b,last)}else el.append(b)}}
 function body(){stopAnims();const T=TABS[App.tab],tab=App.tab;const L=lb();
  if(N.sub[tab]==='fav'){const keep=N.sub[tab];const tmp=document.createElement('div');for(const sb of FAVALL[tab]()){N.sub[tab]=sb;tmp.insertAdjacentHTML('beforeend',T.body())}N.sub[tab]=keep;
   const fs=new Set(favList(tab)),seen=new Set(),tiles=[],rows=[];for(const el of tmp.querySelectorAll('[data-drag]')){const k=favKey(el);if(!fs.has(k)||seen.has(k))continue;seen.add(k);(el.classList.contains('snd')?rows:tiles).push(el)}
   L.innerHTML='';if(!tiles.length&&!rows.length)L.innerHTML=`<div class="pempty" style="text-align:center;padding:40px 16px"><div style="font-size:30px;color:var(--accent)">☆</div>${Kit.t('Noch keine Favoriten. Klicke bei einem Element auf den Stern, dann erscheint es hier in allen Projekten.')}</div>`;
   for(const r of rows)L.append(r);if(tiles.length){const g=document.createElement('div');g.className='tiles';for(const t of tiles)g.append(t);L.append(g)}}
  else L.innerHTML=T.body();
  addStars(L,tab);T.after&&T.after();L.scrollTop=0}
 document.addEventListener('click',async e=>{const b=e.target.closest('#libbody [data-fav]');if(!b)return;e.stopPropagation();e.preventDefault();const tab=App.tab,k=b.dataset.fav,on=!b.classList.contains('on');
  try{App.S.library.favs=await api('api/favs',{tab,id:k,on})}catch(x){return Kit.toast(x.message)}
  if(N.sub[tab]==='fav'){const st=lb().scrollTop;N.lib();lb().scrollTop=st}else{b.classList.toggle('on',on);b.title=Kit.t(on?'Aus den Favoriten entfernen':'Zu den Favoriten');const f=$('#side [data-sub="fav"]');if(f){const n=favList(tab).length;f.innerHTML=`<span class="favi">★</span>${esc(Kit.t('Favoriten'))}${n?`<span class="n">${n}</span>`:''}`}}},true);
 const search=ph=>`<input type="search" id="libq" placeholder="${esc(Kit.t(ph))}" value="${esc(q)}" spellcheck="false">`;
 document.addEventListener('input',e=>{if(e.target.id!=='libq')return;q=e.target.value;body()});
 const match=s=>!q||Kit.t(s).toLowerCase().includes(q.toLowerCase())||s.toLowerCase().includes(q.toLowerCase());
 const emptyMsg=s=>`<div class="pempty">${Kit.t(s)}</div>`;

 // Medien
 function mediaTile(m){const th=m.kind==='audio'?`<svg viewBox="0 0 24 24" style="width:30px;height:30px;stroke:#fff"><path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>`:'';
  const bg=m.kind!=='audio'&&m.thumbs>0?`style="background-image:url('api/file?id=${App.P.id}&m=${m.id}&k=thumb&n=${Math.min(m.thumbs,Math.max(1,Math.round(m.thumbs/3)))}')"`:'';
  const busy=m.proxy==='wait'||m.proxy==='work';
  return`<div class="tile" draggable="true" data-drag='${JSON.stringify({kind:'media',id:m.id})}' data-mid="${m.id}" title="${esc(m.name)}">
   <div class="im" ${bg}>${th}${m.kind!=='image'?`<span class="badge">${fmtDur(m.dur)}</span>`:`<span class="badge">${Kit.t('Bild')}</span>`}${busy?`<div class="prog"><i style="width:${Math.round((m.proxyPct||0)*100)}%"></i></div>`:''}</div>
   <div class="nm">${m.missing?'⚠ ':''}${esc(m.name)}</div><button class="add" data-addm="${m.id}" title="${Kit.t('Zur Zeitleiste hinzufügen')}">+</button><button class="x" data-rmm="${m.id}" title="${Kit.t('Aus dem Projekt entfernen')}">${ICON.x}</button></div>`}
 const PLUS='<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
 TABS.media={top:()=>N.sub.media==='global'?`<button class="btn" data-addglobal>${PLUS}${Kit.t('Zu „Meine Medien“ hinzufügen')}</button>${search('Medien suchen')}`:`<button class="btn primary" data-act="import">${PLUS}${Kit.t('Importieren')}</button>${search('Medien suchen')}`,
  body:()=>{if(N.sub.media==='global'){const L=(App.S.library.media||[]).filter(m=>match(m.name));
    if(!(App.S.library.media||[]).length)return`<div class="dropzone"><b>${Kit.t('Meine Medien')}</b><br><small>${Kit.t('Logos, Intros, Musik: Was du hier ablegst, steht in allen Projekten bereit.')}</small><br><br><button class="btn" data-addglobal>${Kit.t('Dateien auswählen')}</button></div>`;
    return`<div class="tiles">${L.map(m=>`<div class="tile" draggable="true" data-drag='${JSON.stringify({kind:'sound',id:m.id})}' title="${esc(m.name)}"><div class="im" ${m.kind==='image'?`style="background-image:url('api/library/file?s=${encodeURIComponent(m.id)}');background-size:contain;background-repeat:no-repeat"`:''}>${m.kind==='image'?'':`<svg viewBox="0 0 24 24" style="width:28px;height:28px;stroke:#fff">${m.kind==='audio'?'<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>':'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>'}</svg>`}</div><div class="nm">${esc(m.name)}</div><button class="add" data-usesnd="${esc(m.id)}" title="${Kit.t('An der Abspielposition einfügen')}">+</button><button class="x" data-rmsnd="${esc(m.id)}" title="${Kit.t('Aus „Meine Medien“ löschen')}">${ICON.x}</button></div>`).join('')}</div>`}
   const ms=App.P.media.filter(m=>match(m.name));
   return App.P.media.length?`<div class="tiles">${ms.map(mediaTile).join('')}</div>`:`<div class="dropzone" style="margin:30px auto;max-width:340px;padding:34px 20px"><svg viewBox="0 0 24 24" style="font-size:40px;color:var(--accent)"><path d="M12 15V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg><br><br><button class="btn primary" data-act="import">${Kit.t('Importieren')}</button><br><br><small>${Kit.t('Videos, Musik und Bilder. Jede Größe geht.')}</small></div>`}};
 N.libRefreshMedia=()=>{if(App.tab!=='media'||N.sub.media!=='project'||!App.P)return;for(const m of App.P.media){const el=lb().querySelector(`[data-mid="${m.id}"]`);if(!el){if(match(m.name))return body();continue}const n=document.createElement('div');n.innerHTML=mediaTile(m);el.replaceWith(n.firstElementChild)}};
 N.addGlobal=async paths=>{if(!paths.length)return;try{await api('api/library/addmedia',{paths});App.S=await api('api/state');App.tab='media';N.sub.media='global';N.lib();Kit.toast(Kit.t('Gespeichert. Die Dateien stehen in allen Projekten bereit.'))}catch(e){Kit.toast(e.message)}};
 document.addEventListener('click',async e=>{let el;
  if(e.target.closest('[data-addglobal]')){const p=await Kit.pick('files','Medien|*.mp4;*.mov;*.mkv;*.webm;*.avi;*.mp3;*.wav;*.m4a;*.flac;*.ogg;*.png;*.jpg;*.jpeg;*.gif;*.webp');return N.addGlobal(p)}
  if(el=e.target.closest('[data-addm]')){e.stopPropagation();const m=App.media(el.dataset.addm);if(m)Timeline.addMediaEnd(m);return}
  if(el=e.target.closest('[data-rmm]')){e.stopPropagation();const id=el.dataset.rmm;if(App.P.tracks.some(t=>t.clips.some(c=>c.mediaId===id)))return Kit.toast(Kit.t('Die Datei wird noch in der Zeitleiste benutzt.'));
   await App.flush();try{await api(`api/media/remove?id=${App.P.id}&m=${id}`,{});App.P.media=App.P.media.filter(m=>m.id!==id);body()}catch(x){Kit.toast(x.message)}}});
 document.addEventListener('dblclick',e=>{const t=e.target.closest('[data-mid]');if(t){const m=App.media(t.dataset.mid);if(m)Timeline.addMediaEnd(m)}});

 // Audio: eingebaute und eigene Sounds, für alle Projekte gespeichert
 let preview=null,previewId='';
 function stopPreview(){if(preview){preview.pause();preview=null}previewId='';$$('[data-prev]').forEach(b=>b.innerHTML=ICON.play)}
 TABS.audio={top:()=>(N.sub.audio==='mine'?`<button class="btn" data-addsnd>${PLUS}${Kit.t('Eigene Sounds hinzufügen')}</button>`:'')+search('Sounds suchen'),
  body:()=>{const all=App.S.library.sounds;const sub=N.sub.audio,mine=sub==='mine';const list=all.filter(s=>(s.kind==='user')===mine&&(mine||sub==='all'||s.cat===sub)&&match(s.name+' '+(s.cat||'')));
   return list.map(s=>`<div class="snd" draggable="true" data-drag='${JSON.stringify({kind:'sound',id:s.id})}' title="${esc(s.name)}"><button class="ib" data-prev="${esc(s.id)}" title="${Kit.t('Anhören')}">${previewId===s.id?ICON.stop:ICON.play}</button><span class="nm">${esc(Kit.t(s.name))}</span>${s.dur?`<span class="muted" style="font-size:11px">${s.dur<10?s.dur.toFixed(1)+' s':fmtDur(s.dur)}</span>`:''}
    ${s.kind==='user'?`<button class="ib" data-rmsnd="${esc(s.id)}" title="${Kit.t('Aus meinen Sounds löschen')}">${ICON.x}</button>`:''}<button class="ib" data-usesnd="${esc(s.id)}" title="${Kit.t('An der Abspielposition einfügen')}">+</button></div>`).join('')
   +(mine&&!all.some(s=>s.kind==='user')?`<div class="dropzone">${Kit.t('Ziehe Musik oder Soundeffekte hierher.')}<br><small>${Kit.t('Sie stehen danach in allen Projekten bereit.')}</small></div>`:'')}};
 N.addSounds=async paths=>{if(!paths.length)return;try{await api('api/library/add',{paths});App.S=await api('api/state');N.sub.audio='mine';App.tab='audio';N.lib();Kit.toast(Kit.t('Sounds gespeichert. Sie stehen in allen Projekten bereit.'))}catch(e){Kit.toast(e.message)}};
 N.useSound=async id=>{try{const ms=await api(`api/library/use?id=${App.P.id}&s=${encodeURIComponent(id)}`,{});for(const m of ms)if(!App.media(m.id))App.P.media.push(m);pollMedia();return ms.map(m=>App.media(m.id)||m)}catch(e){Kit.toast(e.message);return[]}};
 document.addEventListener('click',async e=>{let el;
  if(e.target.closest('[data-addsnd]')){const p=await Kit.pick('files','Audio|*.mp3;*.wav;*.m4a;*.flac;*.ogg;*.aac');return N.addSounds(p)}
  if(el=e.target.closest('[data-prev]')){const id=el.dataset.prev;const was=previewId===id;stopPreview();if(was)return;preview=new Audio('api/library/file?s='+encodeURIComponent(id));preview.play().catch(()=>{});previewId=id;el.innerHTML=ICON.stop;preview.onended=stopPreview;return}
  if(el=e.target.closest('[data-rmsnd]')){e.stopPropagation();if(!confirm(Kit.t('Diese Datei aus deiner Bibliothek löschen? Projekte, die sie benutzen, behalten ihre Kopie.')))return;await api('api/library/remove?id='+encodeURIComponent(el.dataset.rmsnd),{});App.S=await api('api/state');return N.lib()}
  if(el=e.target.closest('[data-usesnd]')){e.stopPropagation();const ms=await N.useSound(el.dataset.usesnd);if(ms.length)Timeline.addMediaAt(ms,{t:App.t});return}});

 // Text: Vorlagen für Titel, Untertitel, Bauchbinden und Abspann
 const TITLES=[
  {name:'Einfacher Titel',cat:'titel',text:{content:'Dein Titel',font:'Arial',size:.1,color:'#ffffff',bold:true,shadow:true}},
  {name:'Große Kontur',cat:'titel',anim:{in:'pop',out:'fade',d:.5},text:{content:'WOW!',font:'Impact',size:.2,color:'#ffe14d',outline:1,ocolor:'#000000'}},
  {name:'Neon',cat:'titel',text:{content:'NEON',font:'Arial Black',size:.16,color:'#5cf6ff',outline:.6,ocolor:'#0a3b8c',shadow:true}},
  {name:'Comic',cat:'titel',anim:{in:'pop',out:'pop',d:.5},text:{content:'BOOM!',font:'Comic Sans MS',size:.17,color:'#ff4d4d',outline:.9,ocolor:'#ffffff',bold:true}},
  {name:'Kapitel',cat:'titel',text:{content:'Kapitel 1',font:'Trebuchet MS',size:.08,color:'#ffffff',box:'#e5409a',bold:true}},
  {name:'Zitat',cat:'titel',text:{content:'„Ein kurzes Zitat.“',font:'Georgia',size:.07,color:'#ffffff',shadow:true}},
  {name:'Schreibmaschine',cat:'titel',anim:{in:'type',out:'fade',d:1.5},text:{content:'Es war einmal …',font:'Consolas',size:.06,color:'#e8e8e8'}},
  {name:'Untertitel',cat:'unter',y:.36,text:{content:'Hier steht dein Untertitel',font:'Segoe UI',size:.05,color:'#ffffff',box:'#000000'}},
  {name:'Untertitel gelb',cat:'unter',y:.36,text:{content:'Hier steht dein Untertitel',font:'Arial',size:.055,color:'#ffe14d',outline:.5,ocolor:'#000000',bold:true}},
  {name:'Untertitel schlicht',cat:'unter',y:.38,text:{content:'Hier steht dein Untertitel',font:'Verdana',size:.045,color:'#ffffff',shadow:true}},
  {name:'Bauchbinde',cat:'bauch',anim:{in:'slide-l',out:'slide-l',d:.6},x:-.22,y:.33,text:{content:'Max Mustermann\nCreator',font:'Bahnschrift',size:.05,color:'#ffffff',box:'#7c6cff',bold:true}},
  {name:'Bauchbinde dunkel',cat:'bauch',x:-.24,y:.34,text:{content:'Max Mustermann\nCreator',font:'Segoe UI',size:.045,color:'#ffffff',box:'#111111'}},
  {name:'Bauchbinde hell',cat:'bauch',x:-.24,y:.34,text:{content:'Max Mustermann\nCreator',font:'Segoe UI',size:.045,color:'#111111',box:'#ffffff',bold:true}},
  {name:'Abspann',cat:'abspann',text:{content:'Danke fürs Zuschauen!\nAbonnieren nicht vergessen',font:'Verdana',size:.06,color:'#ffffff',shadow:true}},
  {name:'Folge mir',cat:'social',anim:{in:'slide-r',out:'slide-r',d:.5},x:-.25,y:.34,text:{content:'@deinkanal',font:'Segoe UI',size:.05,color:'#ffffff',box:'#e5409a',bold:true}},
  {name:'Neues Video',cat:'social',text:{content:'NEUES VIDEO',font:'Impact',size:.14,color:'#ffffff',outline:.7,ocolor:'#e5409a'}},
  {name:'Kommentar-Frage',cat:'social',y:-.3,text:{content:'Schreib es in die Kommentare!',font:'Segoe UI',size:.055,color:'#111111',box:'#ffffff',bold:true}},
  {name:'Eilmeldung',cat:'social',x:-.15,y:.36,text:{content:'EILMELDUNG',font:'Arial Black',size:.06,color:'#ffffff',box:'#d1002a'}},
  {name:'Gaming-Titel',cat:'gaming',text:{content:'LET\'S PLAY',font:'Arial Black',size:.15,color:'#5cf6ff',outline:.8,ocolor:'#7c1fff',shadow:true}},
  {name:'Sieg',cat:'gaming',text:{content:'VICTORY!',font:'Impact',size:.18,color:'#ffd23f',outline:.9,ocolor:'#7a3b00',shadow:true}},
  {name:'Pixel-Text',cat:'gaming',text:{content:'PRESS START',font:'Consolas',size:.08,color:'#34d27b',bold:true}},
  {name:'Kino-Titel',cat:'titel',text:{content:'D E R   F I L M',font:'Georgia',size:.08,color:'#f2e6c9',shadow:true}},
  {name:'Mitwirkende',cat:'abspann',text:{content:'Idee: Dein Name\nSchnitt: Dein Name\nMusik: Dein Name',font:'Georgia',size:.05,color:'#ffffff'}}];
 function titleClip(i,s){const T=TITLES[i];const tx=Object.assign({content:'',font:'Arial',size:.08,color:'#ffffff',box:'',outline:0,ocolor:'#000000',shadow:false,bold:false,align:'center'},JSON.parse(JSON.stringify(T.text)));tx.content=Kit.t(tx.content);
  return App.newClip({type:'text',start:s,dur:4,x:T.x||0,y:T.y||0,text:tx,name:Kit.t(T.name),fadeIn:T.anim?0:.3,fadeOut:T.anim?0:.3,...(T.anim?{anim:{...T.anim}}:{})})}
 // Freie Videospur über einer bestimmten Spur finden, sonst oben eine neue anlegen
 const freeOn=(t,s,e)=>t&&t.kind==='video'&&!t.locked&&t.clips.every(o=>o.start>=e-1e-3||o.start+App.len(o)<=s+1e-3);
 function trackAbove(idx,s,e){for(let i=Math.min(idx,App.P.tracks.length)-1;i>=0;i--)if(freeOn(App.P.tracks[i],s,e))return App.P.tracks[i];
  const tr={id:uid(),kind:'video',name:'Video '+(App.P.tracks.filter(t=>t.kind==='video').length+1),clips:[]};App.P.tracks.unshift(tr);return tr}
 N.overlay=(c,trId)=>{let tr=trId&&App.track(trId);if(!freeOn(tr,c.start,c.start+App.len(c)))tr=App.P.tracks.find(t=>freeOn(t,c.start,c.start+App.len(c)))||trackAbove(0,0,0);tr.clips.push(c);App.sel={clip:c.id}};
 N.addTitle=(i,at)=>{at=at||{t:App.t};App.change(()=>N.overlay(titleClip(i||0,at.t),at.tr));N.props('text')};
 function drawTextOn(x,W,H,c){const tx=c.text;const fs=Math.max(9,tx.size*H*1.15);x.save();x.font=`${tx.bold?'bold ':''}${fs}px "${tx.font}", sans-serif`;x.textBaseline='top';const lines=tx.content.split('\n');const lh=fs*1.3;
  const w=Math.max(...lines.map(l=>x.measureText(l).width));const h=lines.length*lh-fs*.15;const X=(W-w)/2+c.x*W,Y=(H-h)/2+c.y*H;
  if(tx.box){const b=fs*.35;x.globalAlpha=.85;x.fillStyle=tx.box;x.fillRect(X-b,Y-b,w+2*b,h+2*b);x.globalAlpha=1}
  lines.forEach((l,k)=>{const y=Y+k*lh;if(tx.shadow){x.fillStyle='rgba(0,0,0,.6)';x.fillText(l,X+1.5,y+1.5)}if(tx.outline){x.lineWidth=Math.max(1,tx.outline*fs*.08)*2;x.strokeStyle=tx.ocolor;x.lineJoin='round';x.strokeText(l,X,y)}x.fillStyle=tx.color;x.fillText(l,X,y)});x.restore()}
 const bgGrad=(x,W,H)=>{const g=x.createLinearGradient(0,0,W,H);g.addColorStop(0,'#2a2f3a');g.addColorStop(1,'#14171d');x.fillStyle=g;x.fillRect(0,0,W,H)};
 const COLORS=['#000000','#ffffff','#7c6cff','#e5409a','#25c2b8','#ffb020','#2b6cff','#1f9d55'];
 TABS.titles={top:()=>search('Texte suchen'),
  body:()=>{const s=N.sub.titles;const ts=TITLES.map((t,i)=>[t,i]).filter(([t])=>(s==='all'||s===t.cat)&&match(t.name));let h='';
   if(s!=='flaeche')h+=`<div class="tiles">${ts.map(([t,i])=>`<div class="tile" draggable="true" data-drag='${JSON.stringify({kind:'title',id:i})}' data-title="${i}" title="${esc(Kit.t(t.name))}"><div class="im"><canvas width="${TW}" height="${THh}" data-tprev="${i}"></canvas></div><div class="nm">${esc(Kit.t(t.name))}</div><button class="add" data-addtitle="${i}" title="${Kit.t('An der Abspielposition einfügen')}">+</button></div>`).join('')}</div>`;
   if(s==='flaeche'||s==='all')h+=`<div class="grp" style="margin-top:14px"><h4>${Kit.t('Farbflächen')}</h4><div class="tiles">${COLORS.map(c=>`<div class="tile" draggable="true" data-drag='${JSON.stringify({kind:'color',color:c})}' title="${c}"><div class="im" style="background:${c}"></div><div class="nm">${c==='#000000'?Kit.t('Schwarz'):c==='#ffffff'?Kit.t('Weiß'):c}</div><button class="add" data-addcolor="${c}" title="${Kit.t('An der Abspielposition einfügen')}">+</button></div>`).join('')}</div></div>`;
   return h},
  after:()=>$$('[data-tprev]').forEach(cv=>{const x=cv.getContext('2d');bgGrad(x,cv.width,cv.height);drawTextOn(x,cv.width,cv.height,titleClip(+cv.dataset.tprev,0))})};
 document.addEventListener('click',e=>{let el;if(el=e.target.closest('[data-addtitle]'))return N.addTitle(+el.dataset.addtitle);if(el=e.target.closest('[data-addcolor]'))return Timeline.addColorAt(el.dataset.addcolor,{t:App.t})});

 // Übergänge: Kacheln zeigen eine bewegte Vorschau beim Darüberfahren
 let anims=[];function stopAnims(){for(const a of anims)cancelAnimationFrame(a.raf);anims=[]}
 let SA=null,SB=null;const TW=224,THh=128;
 function transFrame(cv,type,p,custom){if(!SA){SA=FX.sample(TW,THh,0);SB=FX.sample(TW,THh,1)}const x=cv.getContext('2d');x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;x.clearRect(0,0,cv.width,cv.height);FX.trans(x,type,p,SA,SB,cv.width,cv.height,custom)}
 function animate(cv,type,custom){const a={raf:0};const t0=performance.now();const step=now=>{const k=((now-t0)/1600)%1.4;transFrame(cv,type,Math.min(1,k),custom);a.raf=requestAnimationFrame(step)};a.raf=requestAnimationFrame(step);anims.push(a);return a}
 const customOf=id=>App.S.library.custom.find(c=>c.id===id);
 TABS.trans={top:()=>search('Übergänge suchen'),
  body:()=>{const s=N.sub.trans;const tile=(id,name,extra='')=>`<div class="tile" draggable="true" data-drag='${JSON.stringify({kind:'trans',id})}' data-trtile="${esc(id)}" title="${esc(name)}"><div class="im"><canvas width="${TW}" height="${THh}" data-trprev="${esc(id)}"></canvas></div><div class="nm">${esc(name)}</div><button class="add" data-applytr="${esc(id)}" title="${Kit.t('Auf den ausgewählten Clip anwenden')}">+</button>${extra}</div>`;
   let h=`<p class="muted" style="margin:0 0 10px;font-size:12px">${Kit.t('Ziehe einen Übergang auf den zweiten von zwei Clips, die hintereinander liegen.')}</p><div class="tiles">`;
   if(s==='all'||s==='mine'){h+=`<button class="tile" data-newtrans style="cursor:pointer"><div class="im" style="background:var(--panel)"><svg viewBox="0 0 24 24" style="width:28px;height:28px;stroke:var(--accent)"><path d="M12 5v14M5 12h14"/></svg></div><div class="nm">${Kit.t('Neuer Übergang')}</div></button>`;
    h+=App.S.library.custom.filter(c=>match(c.name)).map(c=>tile('custom:'+c.id,c.name,`<button class="x" data-edittr="${c.id}" title="${Kit.t('Bearbeiten')}">${ICON.edit}</button>`)).join('')}
   if(s!=='mine')h+=App.S.transitions.filter(t=>(s==='all'||t.group===s)&&match(t.name)).map(t=>tile(t.id,Kit.t(t.name))).join('');
   return h+'</div>'},
  after:()=>$$('[data-trprev]').forEach(cv=>{const id=cv.dataset.trprev;const cu=id.startsWith('custom:')?customOf(id.slice(7)):null;transFrame(cv,id,.35,cu);
   const tl=cv.closest('.tile');let a=null;tl.addEventListener('mouseenter',()=>{a=animate(cv,id,cu)});tl.addEventListener('mouseleave',()=>{if(a){cancelAnimationFrame(a.raf);anims=anims.filter(x=>x!==a);a=null}transFrame(cv,id,.35,cu)})})};
 const selClip=()=>App.sel&&(App.sel.clip||App.sel.trans);
 document.addEventListener('click',e=>{let el;
  if(el=e.target.closest('[data-applytr]')){e.stopPropagation();const id=selClip();if(!id)return Kit.toast(Kit.t('Wähle zuerst in der Zeitleiste den Clip aus, der hereinkommen soll.'));Timeline.applyTrans(id,el.dataset.applytr);return}
  if(e.target.closest('[data-newtrans]'))return N.designer();
  if(el=e.target.closest('[data-edittr]')){e.stopPropagation();return N.designer(customOf(el.dataset.edittr))}
  if(el=e.target.closest('[data-applyfx]')){e.stopPropagation();const id=App.sel&&App.sel.clip;if(!id)return Kit.toast(Kit.t('Wähle zuerst in der Zeitleiste einen Clip aus.'));if(el.dataset.applyfx==='')return App.change(()=>{App.find(id).c.effect=''});Timeline.applyFx(id,el.dataset.applyfx)}});

 // Effekte und Filter (Filter = Farblooks)
 const FXCAT={blur:['fx','unschaerfe'],sharpen:['fx','unschaerfe'],glow:['fx','unschaerfe'],vignette:['fx','stil'],pixel:['fx','stil'],grain:['fx','stil'],rgbshift:['fx','stil'],sketch:['fx','stil'],poster:['fx','stil'],thermal:['fx','stil'],nightvision:['fx','stil'],
  vhs:['fx','retro'],oldfilm:['fx','retro'],mirror:['fx','verzerren'],mirrorv:['fx','verzerren'],kaleido:['fx','verzerren'],shake:['fx','bewegung'],pulse:['fx','bewegung'],
  bw:['filter','klassisch'],sepia:['filter','klassisch'],vintage:['filter','klassisch'],seventies:['filter','klassisch'],polaroid:['filter','klassisch'],noir:['filter','kino'],teal:['filter','kino'],moody:['filter','kino'],bleach:['filter','kino'],cinema:['filter','kino'],drama:['filter','kino'],
  summer:['filter','jahreszeiten'],winter:['filter','jahreszeiten'],autumn:['filter','jahreszeiten'],gold:['filter','jahreszeiten']};
 const cat=id=>FXCAT[id]||['filter','farbe'];
 function fxTab(kind){return{top:()=>search(kind==='fx'?'Effekte suchen':'Filter suchen'),
  body:()=>{const s=N.sub[kind];const cur=App.sel&&App.sel.clip&&App.find(App.sel.clip)?.c.effect;
   return`<p class="muted" style="margin:0 0 10px;font-size:12px">${Kit.t('Ziehe einen Effekt auf einen Clip oder wähle einen Clip aus und klicke auf +.')}</p><div class="tiles">
   <div class="tile ${cur===''?'sel':''}" data-applyfx="" style="cursor:pointer"><div class="im"><canvas width="${TW}" height="${THh}" data-fxprev=""></canvas></div><div class="nm">${Kit.t('Ohne Effekt')}</div></div>
   ${App.S.effects.filter(f=>cat(f.id)[0]===kind&&(s==='all'||cat(f.id)[1]===s)&&match(f.name)).map(f=>`<div class="tile ${cur===f.id?'sel':''}" draggable="true" data-drag='${JSON.stringify({kind:'fx',id:f.id})}' title="${esc(Kit.t(f.name))}"><div class="im"><canvas width="${TW}" height="${THh}" data-fxprev="${f.id}"></canvas></div><div class="nm">${esc(Kit.t(f.name))}</div><button class="add" data-applyfx="${f.id}" title="${Kit.t('Auf den ausgewählten Clip anwenden')}">+</button></div>`).join('')}</div>`},
  after:()=>{const im=FX.sample(TW,THh,0);$$('[data-fxprev]').forEach(cv=>{const x=cv.getContext('2d');const c={effect:cv.dataset.fxprev};x.filter=FX.cssFor(c);
   if(c.effect==='pixel'){const s=document.createElement('canvas');s.width=TW/16;s.height=THh/16;s.getContext('2d').drawImage(im,0,0,s.width,s.height);x.imageSmoothingEnabled=false;x.drawImage(s,0,0,TW,THh)}else x.drawImage(im,0,0);
   x.filter='none';if(c.effect==='vignette')FX.vignette(x,TW,THh);if(c.effect==='grain')FX.grain(x,TW,THh);
   const d=App.S.effects.find(z=>z.id===c.effect);if(d&&d.css.startsWith('@')){const sp=d.css.slice(1).split('|')[0];const r=FX.special(sp,im,TW,THh,0.3);x.filter=FX.cssFor(c);x.clearRect(0,0,TW,THh);const mo=FX.motion(sp,.12);if(mo){x.translate(TW/2,THh/2);x.scale(mo.s*1.05,mo.s*1.05);x.translate(-TW/2+mo.dx*TW,-THh/2)}x.drawImage(r,0,0,TW,THh);x.setTransform(1,0,0,1,0,0)}})}}}
 TABS.fx=fxTab('fx');TABS.filter=fxTab('filter');

 // Sticker: als SVG gestaltet, im Fenster zu einem PNG gerechnet und wie ein Bild ins Projekt übernommen
 const S=512;
 const SH='<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".35"/></filter>';
 const svg=(body,defs='')=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>${SH}${defs}</defs>${body}</svg>`;
 const grad=(id,a,b,x2=1,y2=1)=>`<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
 const FONT='font-family="Segoe UI Variable Display,Segoe UI,Arial,sans-serif"';
 const pill=(w,col,icon,label,fs=56)=>()=>svg(`<g filter="url(#sh)"><rect x="${256-w/2}" y="186" width="${w}" height="140" rx="70" fill="url(#g)"/><g transform="translate(${256-w/2+50},214)" fill="#fff">${icon}</g><text x="${256-w/2+150}" y="276" ${FONT} font-weight="800" font-size="${fs}" fill="#fff">${esc(Kit.t(label))}</text></g>`,grad('g',col[0],col[1],0,1));
 const BELL='<path d="M42 8c-15 0-26 11-26 27v18L6 66v6h72v-6L68 53V35C68 19 57 8 42 8zm-10 70a10 10 0 0 0 20 0z" transform="scale(1)"/>';
 const THUMB='<path d="M10 36h14v44H10zM30 80h34c6 0 10-3 12-8l8-26c2-6-2-12-9-12H54l4-16c1-7-4-12-10-10L30 36z"/>';
 const badge=(label,col,dot)=>()=>svg(`<g filter="url(#sh)" transform="rotate(-8 256 256)"><rect x="96" y="176" width="320" height="160" rx="34" fill="url(#g)"/>${dot?'<circle cx="160" cy="256" r="22" fill="#fff"/>':''}<text x="${dot?300:256}" y="292" text-anchor="middle" ${FONT} font-weight="900" font-size="100" fill="#fff" letter-spacing="4">${esc(Kit.t(label))}</text></g>`,grad('g',col[0],col[1],0,1));
 const burst=(label,col,n=16)=>()=>{let d='';for(let i=0;i<n*2;i++){const r=i%2?150:230,a=i*Math.PI/n;d+=(i?'L':'M')+(256+r*Math.cos(a)).toFixed(1)+' '+(256+r*Math.sin(a)).toFixed(1)}
  return svg(`<g filter="url(#sh)"><path d="${d}Z" fill="url(#g)" stroke="#111" stroke-width="10" stroke-linejoin="round"/><text x="256" y="292" text-anchor="middle" ${FONT} font-weight="900" font-size="104" fill="#fff" stroke="#111" stroke-width="10" paint-order="stroke" transform="rotate(-8 256 256)">${esc(Kit.t(label))}</text></g>`,grad('g',col[0],col[1]))};
 const arrowSvg=rot=>()=>svg(`<g filter="url(#sh)" transform="rotate(${rot} 256 256)"><path d="M70 300c40-120 150-180 280-170l-8-56 110 92-122 70 4-56c-100-6-180 40-230 140z" fill="url(#g)" stroke="#fff" stroke-width="12" stroke-linejoin="round"/></g>`,grad('g','#ff5a5f','#ff2d55'));
 const straight=rot=>()=>svg(`<g filter="url(#sh)" transform="rotate(${rot} 256 256)"><path d="M60 220h250v-80l150 116-150 116v-80H60z" fill="url(#g)" stroke="#fff" stroke-width="12" stroke-linejoin="round"/></g>`,grad('g','#ffd23f','#ff9f1c'));
 const EMO=['😀','😂','😍','😎','🥳','😱','🤯','😭','👍','👏','🙏','🔥','💯','❤️','⭐','🎉','✅','❌','⚡','💥','👀','🎵','📌','🏆','💡','🚀','🤔','😴'];
 const STICKERS=[...EMO.map(e=>({id:'emoji-'+[...e].map(c=>c.codePointAt(0).toString(16)).join('-'),name:'Emoji',cat:'emoji',draw:x=>{x.font='400px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(e,S/2,S/2+20)}})),
  {id:'pfeil-schwung',name:'Pfeil geschwungen',cat:'formen',svg:arrowSvg(0)},{id:'pfeil-schwung-2',name:'Pfeil geschwungen links',cat:'formen',svg:()=>arrowSvg(0)().replace('<g filter="url(#sh)" transform="rotate(0 256 256)">','<g filter="url(#sh)" transform="translate(512 0) scale(-1 1)">')},
  {id:'pfeil-rechts',name:'Pfeil rechts',cat:'formen',svg:straight(0)},{id:'pfeil-unten',name:'Pfeil unten',cat:'formen',svg:straight(90)},{id:'pfeil-links',name:'Pfeil links',cat:'formen',svg:straight(180)},{id:'pfeil-oben',name:'Pfeil oben',cat:'formen',svg:straight(270)},
  {id:'kreis-marker',name:'Kreis markieren',cat:'formen',svg:()=>svg(`<path d="M120 150c80-70 270-60 310 30s-40 200-190 200S60 300 90 210c20-60 110-100 230-90" fill="none" stroke="#ff3b30" stroke-width="22" stroke-linecap="round" filter="url(#sh)"/>`)},
  {id:'unterstreichen',name:'Unterstreichen',cat:'formen',svg:()=>svg(`<path d="M50 300c120-30 290-34 410-10" fill="none" stroke="#ffd23f" stroke-width="40" stroke-linecap="round" opacity=".9"/><path d="M90 340c110-18 230-20 330-4" fill="none" stroke="#ffd23f" stroke-width="18" stroke-linecap="round" opacity=".7"/>`)},
  {id:'rahmen-ecken',name:'Fokus-Rahmen',cat:'formen',svg:()=>svg(`<g fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round" filter="url(#sh)"><path d="M70 160V90h70M372 90h70v70M442 352v70h-70M140 422H70v-70"/></g>`)},
  {id:'haken-rund',name:'Richtig',cat:'formen',svg:()=>svg(`<g filter="url(#sh)"><circle cx="256" cy="256" r="190" fill="url(#g)"/><path d="M160 262l66 64 130-140" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></g>`,grad('g','#34d27b','#13a85a'))},
  {id:'kreuz-rund',name:'Falsch',cat:'formen',svg:()=>svg(`<g filter="url(#sh)"><circle cx="256" cy="256" r="190" fill="url(#g)"/><path d="M180 180l152 152M332 180L180 332" stroke="#fff" stroke-width="44" stroke-linecap="round"/></g>`,grad('g','#ff6b6b','#e5383b'))},
  {id:'herz',name:'Herz',cat:'formen',svg:()=>svg(`<path filter="url(#sh)" d="M256 430C120 340 60 260 60 180c0-60 46-104 104-104 40 0 72 22 92 56 20-34 52-56 92-56 58 0 104 44 104 104 0 80-60 160-196 250z" fill="url(#g)"/>`,grad('g','#ff6f91','#e5409a'))},
  {id:'stern-glanz',name:'Stern',cat:'formen',svg:()=>{let d='';for(let i=0;i<10;i++){const r=i%2?90:200,a=i*Math.PI/5-Math.PI/2;d+=(i?'L':'M')+(256+r*Math.cos(a)).toFixed(1)+' '+(266+r*Math.sin(a)).toFixed(1)}return svg(`<path filter="url(#sh)" d="${d}Z" fill="url(#g)" stroke="#fff" stroke-width="10" stroke-linejoin="round"/>`,grad('g','#ffe066','#ffb020'))}},
  {id:'ort',name:'Ort',cat:'formen',svg:()=>svg(`<g filter="url(#sh)"><path d="M256 460c-90-110-150-190-150-270a150 150 0 0 1 300 0c0 80-60 160-150 270z" fill="url(#g)"/><circle cx="256" cy="190" r="56" fill="#fff"/></g>`,grad('g','#ff6b6b','#d62839'))},
  {id:'klick',name:'Mausklick',cat:'formen',svg:()=>svg(`<g filter="url(#sh)"><path d="M190 140v250l62-58 46 100 46-20-46-98 86-6z" fill="#fff" stroke="#111" stroke-width="12" stroke-linejoin="round"/><g stroke="#ffd23f" stroke-width="16" stroke-linecap="round"><path d="M150 100l-30-30M200 80V40M110 150H70"/></g></g>`)},
  {id:'abo',name:'Abonnieren',cat:'social',svg:pill(400,['#ff3355','#e0002a'],BELL,'ABONNIEREN',50)},
  {id:'like',name:'Gefällt mir',cat:'social',svg:pill(400,['#3d8bff','#1f5fe0'],THUMB,'LIKE',64)},
  {id:'glocke',name:'Glocke',cat:'social',svg:()=>svg(`<g filter="url(#sh)"><circle cx="256" cy="256" r="180" fill="url(#g)"/><g transform="translate(160 150) scale(2.3)" fill="#fff">${BELL}</g><circle cx="370" cy="150" r="40" fill="#ff3355" stroke="#fff" stroke-width="10"/></g>`,grad('g','#ffd23f','#ff9f1c'))},
  {id:'kommentar',name:'Kommentar',cat:'social',svg:()=>svg(`<g filter="url(#sh)"><path d="M110 110h292a40 40 0 0 1 40 40v170a40 40 0 0 1-40 40H230l-90 70v-70h-30a40 40 0 0 1-40-40V150a40 40 0 0 1 40-40z" fill="url(#g)"/><g fill="#fff"><circle cx="180" cy="235" r="24"/><circle cx="256" cy="235" r="24"/><circle cx="332" cy="235" r="24"/></g></g>`,grad('g','#8b7bff','#5b4ae0'))},
  {id:'teilen',name:'Teilen-Symbol',cat:'social',svg:()=>svg(`<g filter="url(#sh)"><circle cx="256" cy="256" r="180" fill="url(#g)"/><g fill="#fff" stroke="#fff" stroke-width="20"><circle cx="330" cy="170" r="34"/><circle cx="182" cy="256" r="34"/><circle cx="330" cy="342" r="34"/><path d="M300 186l-90 54M210 272l90 54" fill="none"/></g></g>`,grad('g','#25c2b8','#118a8a'))},
  {id:'neu',name:'Neu',cat:'social',svg:badge('NEU',['#7c6cff','#5b4ae0'])},
  {id:'live',name:'Live',cat:'social',svg:badge('LIVE',['#ff3355','#d1002a'],true)},
  {id:'sale',name:'Angebot',cat:'social',svg:badge('-50%',['#ffb020','#ff7a00'])},
  {id:'blase-weiss',name:'Sprechblase',cat:'blasen',svg:()=>svg(`<path filter="url(#sh)" d="M120 90h272a60 60 0 0 1 60 60v150a60 60 0 0 1-60 60H250l-110 80 20-80h-40a60 60 0 0 1-60-60V150a60 60 0 0 1 60-60z" fill="#fff"/>`)},
  {id:'blase-rechts',name:'Sprechblase rechts',cat:'blasen',svg:()=>svg(`<path filter="url(#sh)" d="M120 90h272a60 60 0 0 1 60 60v150a60 60 0 0 1-60 60h-40l20 80-110-80H120a60 60 0 0 1-60-60V150a60 60 0 0 1 60-60z" fill="url(#g)"/>`,grad('g','#8b7bff','#5b4ae0'))},
  {id:'gedanke',name:'Gedankenblase',cat:'blasen',svg:()=>svg(`<g fill="#fff" filter="url(#sh)"><circle cx="190" cy="190" r="100"/><circle cx="310" cy="170" r="110"/><circle cx="360" cy="270" r="80"/><circle cx="250" cy="290" r="90"/><circle cx="150" cy="280" r="70"/><circle cx="130" cy="400" r="30"/><circle cx="90" cy="450" r="16"/></g>`)},
  {id:'wow',name:'WOW',cat:'blasen',svg:burst('WOW!',['#ffe066','#ffb020'])},
  {id:'omg',name:'OMG',cat:'blasen',svg:burst('OMG',['#ff6f91','#e5409a'],12)},
  {id:'controller',name:'Controller',cat:'gaming',svg:()=>svg(`<g filter="url(#sh)"><path d="M140 170h232c50 0 80 40 90 110l14 90c6 40-40 60-66 30l-50-60H152l-50 60c-26 30-72 10-66-30l14-90c10-70 40-110 90-110z" fill="url(#g)"/><g fill="#fff"><rect x="128" y="236" width="70" height="22" rx="6"/><rect x="152" y="212" width="22" height="70" rx="6"/><circle cx="350" cy="230" r="17"/><circle cx="388" cy="268" r="17"/></g></g>`,grad('g','#5b5f6b','#2b2e35'))},
  {id:'gameover',name:'Game Over',cat:'gaming',svg:()=>svg(`<g filter="url(#sh)"><rect x="40" y="170" width="432" height="172" rx="14" fill="#111"/><text x="256" y="286" text-anchor="middle" font-family="Consolas,monospace" font-weight="900" font-size="78" fill="#ff3355" stroke="#fff" stroke-width="3" paint-order="stroke">GAME OVER</text></g>`)},
  {id:'ko',name:'K.O.',cat:'gaming',svg:burst('K.O.',['#ff6b6b','#d62839'],18)},
  {id:'pixelherz',name:'Pixel-Herz',cat:'gaming',svg:()=>{const P=['01100110','11111111','11111111','11111111','01111110','00111100','00011000'];let r='';P.forEach((row,y)=>[...row].forEach((v,x)=>{if(v==='1')r+=`<rect x="${64+x*48}" y="${96+y*48}" width="48" height="48"/>`}));return svg(`<g fill="#ff3355" filter="url(#sh)">${r}</g>`)}},
  {id:'levelup',name:'Level Up',cat:'gaming',svg:badge('LEVEL UP',['#34d27b','#13a85a'])},
  {id:'krone',name:'Krone',cat:'feiern',svg:()=>svg(`<path filter="url(#sh)" d="M80 380l-30-220 120 90 86-150 86 150 120-90-30 220z" fill="url(#g)" stroke="#fff" stroke-width="10" stroke-linejoin="round"/><g fill="#ff3355"><circle cx="256" cy="320" r="22"/><circle cx="160" cy="330" r="16"/><circle cx="352" cy="330" r="16"/></g>`,grad('g','#ffe066','#ff9f1c'))},
  {id:'konfetti',name:'Konfetti',cat:'feiern',svg:()=>{let r='';const C=['#ff3355','#ffd23f','#34d27b','#3d8bff','#9a78f0','#ff9f1c'];for(let i=0;i<46;i++){const x=40+((i*97)%432),y=40+((i*61)%432),a=(i*37)%180;r+=`<rect x="${x}" y="${y}" width="${14+(i%3)*6}" height="${8+(i%2)*6}" rx="3" fill="${C[i%6]}" transform="rotate(${a} ${x} ${y})"/>`}return svg(r)}},
  {id:'geschenk',name:'Geschenk',cat:'feiern',svg:()=>svg(`<g filter="url(#sh)"><rect x="96" y="210" width="320" height="220" rx="14" fill="url(#g)"/><rect x="80" y="160" width="352" height="70" rx="12" fill="#ff6b8a"/><rect x="232" y="160" width="48" height="270" fill="#ffd23f"/><path d="M256 160c-40-70-120-60-100-10 10 20 60 14 100 10zm0 0c40-70 120-60 100-10-10 20-60 14-100 10z" fill="#ffd23f"/></g>`,grad('g','#ff3355','#d1002a'))},
  {id:'ballons',name:'Ballons',cat:'feiern',svg:()=>svg(`<g filter="url(#sh)">${[['#ff3355',180,190],['#3d8bff',300,160],['#ffd23f',250,250]].map(([c,x,y])=>`<path d="M${x} ${y+110}C${x-10} ${y+200} ${x+40} ${y+220} ${256} 480" fill="none" stroke="#ddd" stroke-width="4"/><ellipse cx="${x}" cy="${y}" rx="72" ry="90" fill="${c}"/><ellipse cx="${x-24}" cy="${y-34}" rx="14" ry="22" fill="#fff" opacity=".45"/>`).join('')}</g>`)},
  {id:'herzen',name:'Herzen',cat:'liebe',svg:()=>svg([[256,250,1],[130,150,.45],[390,140,.5],[400,370,.35]].map(([x,y,k])=>`<path filter="url(#sh)" transform="translate(${x} ${y}) scale(${k}) translate(-256 -250)" d="M256 430C120 340 60 260 60 180c0-60 46-104 104-104 40 0 72 22 92 56 20-34 52-56 92-56 58 0 104 44 104 104 0 80-60 160-196 250z" fill="url(#g)"/>`).join(''),grad('g','#ff6f91','#e5409a'))},
  {id:'herz-pfeil',name:'Herz mit Pfeil',cat:'liebe',svg:()=>svg(`<path filter="url(#sh)" d="M256 430C120 340 60 260 60 180c0-60 46-104 104-104 40 0 72 22 92 56 20-34 52-56 92-56 58 0 104 44 104 104 0 80-60 160-196 250z" fill="url(#g)"/><path d="M40 380L470 120" stroke="#ffd23f" stroke-width="14" stroke-linecap="round"/><path d="M470 120l-50 6 26 36z" fill="#ffd23f"/>`,grad('g','#ff3b5c','#c9184a'))},
  {id:'funkeln',name:'Funkeln',cat:'effekte',svg:()=>svg([[256,256,1],[130,140,.4],[380,380,.35],[400,130,.3]].map(([x,y,k])=>`<path transform="translate(${x} ${y}) scale(${k})" d="M0-200C20-40 40-20 200 0 40 20 20 40 0 200-20 40-40 20-200 0-40-20-20-40 0-200z" fill="#fff8c4" stroke="#ffd23f" stroke-width="10"/>`).join(''))},
  {id:'boom',name:'BOOM',cat:'effekte',svg:burst('BOOM!',['#ff9f1c','#ff3355'],20)},
  {id:'speed',name:'Speedlines',cat:'effekte',svg:()=>{let r='';for(let i=0;i<36;i++){const a=i/36*Math.PI*2,r1=150+(i%3)*20;r+=`<path d="M${256+r1*Math.cos(a)} ${256+r1*Math.sin(a)}L${256+260*Math.cos(a-.03)} ${256+260*Math.sin(a-.03)}L${256+260*Math.cos(a+.03)} ${256+260*Math.sin(a+.03)}z" fill="#fff"/>`}return svg(r)}},
  {id:'explosion',name:'Explosion',cat:'effekte',svg:()=>{let d='';for(let i=0;i<22;i++){const r=i%2?120:220+(i%4)*12,a=i*Math.PI/11;d+=(i?'L':'M')+(256+r*Math.cos(a)).toFixed(1)+' '+(256+r*Math.sin(a)).toFixed(1)}return svg(`<g filter="url(#sh)"><path d="${d}Z" fill="url(#g)"/><circle cx="256" cy="256" r="90" fill="#fff3b0"/></g>`,grad('g','#ffd23f','#ff3b30'))}},
  {id:'lupe',name:'Lupe',cat:'formen',svg:()=>svg(`<g filter="url(#sh)"><circle cx="220" cy="220" r="130" fill="#ffffff22" stroke="#fff" stroke-width="28"/><path d="M315 315l110 110" stroke="#fff" stroke-width="44" stroke-linecap="round"/></g>`)},
  ...[1,2,3].map(n=>({id:'zahl-'+n,name:'Nummer '+n,cat:'formen',svg:()=>svg(`<g filter="url(#sh)"><circle cx="256" cy="256" r="170" fill="url(#g)" stroke="#fff" stroke-width="14"/><text x="256" y="335" text-anchor="middle" ${FONT} font-weight="900" font-size="230" fill="#fff">${n}</text></g>`,grad('g','#8b7bff','#5b4ae0'))})),
  {id:'frage',name:'Fragezeichen',cat:'blasen',svg:()=>svg(`<g filter="url(#sh)"><circle cx="256" cy="256" r="180" fill="url(#g)"/><text x="256" y="345" text-anchor="middle" ${FONT} font-weight="900" font-size="260" fill="#fff">?</text></g>`,grad('g','#3d8bff','#1f5fe0'))}];
 // Ein Sticker als 512×512-Bild (SVG wird über ein Bild-Element gezeichnet)
 const stickerCanvas=st=>new Promise(res=>{const c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d');
  if(st.draw){st.draw(x);return res(c)}const im=new Image();im.onload=()=>{x.drawImage(im,0,0,S,S);res(c)};im.onerror=()=>res(c);im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(st.svg())});
 TABS.stickers={top:()=>search('Sticker suchen'),
  body:()=>{const L=STICKERS.filter(s=>s.cat===N.sub.stickers&&match(s.name));return`<div class="tiles">${L.map(s=>`<div class="tile" draggable="true" data-drag='${JSON.stringify({kind:'sticker',id:s.id})}' title="${esc(Kit.t(s.name))}"><div class="im chk"><canvas width="${THh}" height="${THh}" data-stk="${s.id}" style="width:64px;height:64px;left:50%;top:0;translate:-50% 0"></canvas></div><div class="nm">${esc(Kit.t(s.name))}</div><button class="add" data-addstk="${s.id}" title="${Kit.t('An der Abspielposition einfügen')}">+</button></div>`).join('')}</div>`},
  after:()=>$$('[data-stk]').forEach(async cv=>{const st=STICKERS.find(s=>s.id===cv.dataset.stk);const c=await stickerCanvas(st);cv.getContext('2d').drawImage(c,0,0,cv.width,cv.height)})};
 N.addSticker=async(id,at)=>{at=at||{t:App.t};const st=STICKERS.find(s=>s.id===id);if(!st)return;const data=(await stickerCanvas(st)).toDataURL('image/png').split(',')[1];
  try{const ms=await api('api/sticker',{id:App.P.id,name:st.id+(Kit.lang!=='de'&&st.svg?'-'+Kit.lang:''),data});for(const m of ms)if(!App.media(m.id))App.P.media.push(m);const m=App.media(ms[0].id);
   App.change(()=>{const c=Timeline.clipFromMedia(m,at.t);c.dur=4;c.scale=.35;c.name=Kit.t(st.name);N.overlay(c,at.tr)});N.props('bild')}catch(e){Kit.toast(e.message)}};
 document.addEventListener('click',e=>{const el=e.target.closest('[data-addstk]');if(el)N.addSticker(el.dataset.addstk)});

 // Vorlagen: fertige Abfolgen aus Farbflächen und Texten, die als Ganzes eingefügt werden
 const tx=(content,o)=>Object.assign({content,font:'Arial',size:.08,color:'#ffffff',box:'',outline:0,ocolor:'#000000',shadow:false,bold:false,align:'center'},o);
 const TPLS=[
  {id:'intro-klar',name:'Intro schlicht',cat:'intro',clips:[[0,{type:'color',color:'#111111',start:0,dur:4,fadeOut:.5}],[1,{type:'text',start:.3,dur:3.5,fadeIn:.6,fadeOut:.5,text:tx('Dein Kanal',{size:.12,bold:true,font:'Segoe UI'})}],[2,{type:'text',start:1,dur:2.8,y:.13,fadeIn:.6,fadeOut:.5,text:tx('präsentiert',{size:.05,color:'#bbbbbb'})}]]},
  {id:'intro-farbe',name:'Intro farbig',cat:'intro',clips:[[0,{type:'color',color:'#7c6cff',start:0,dur:3.5,fadeOut:.4}],[1,{type:'text',start:.2,dur:3.2,fadeIn:.3,fadeOut:.4,text:tx('TITEL',{size:.2,font:'Impact',outline:.6,ocolor:'#2a1f7a'})}]]},
  {id:'countdown',name:'Countdown',cat:'intro',clips:[[0,{type:'color',color:'#000000',start:0,dur:3}],[1,{type:'text',start:0,dur:1,fadeOut:.2,text:tx('3',{size:.35,bold:true})}],[1,{type:'text',start:1,dur:1,fadeOut:.2,text:tx('2',{size:.35,bold:true})}],[1,{type:'text',start:2,dur:1,fadeOut:.2,text:tx('1',{size:.35,bold:true})}]]},
  {id:'outro-danke',name:'Outro Danke',cat:'outro',clips:[[0,{type:'color',color:'#e5409a',start:0,dur:5,fadeIn:.5}],[1,{type:'text',start:.4,dur:4.6,y:-.08,fadeIn:.5,text:tx('Danke fürs Zuschauen!',{size:.09,bold:true,shadow:true})}],[2,{type:'text',start:1.2,dur:3.8,y:.1,fadeIn:.5,text:tx('Abonnieren nicht vergessen',{size:.05,box:'#000000'})}]]},
  {id:'outro-ende',name:'Ende',cat:'outro',clips:[[0,{type:'color',color:'#000000',start:0,dur:3,fadeIn:.8}],[1,{type:'text',start:.6,dur:2.4,fadeIn:.6,text:tx('ENDE',{size:.12,font:'Georgia'})}]]},
  {id:'intro-gaming',name:'Gaming-Intro',cat:'intro',clips:[[0,{type:'color',color:'#12002e',start:0,dur:3.5,fadeOut:.4}],[1,{type:'text',start:.2,dur:3.2,fadeIn:.2,fadeOut:.4,text:tx('LET\'S PLAY',{size:.16,font:'Arial Black',color:'#5cf6ff',outline:.8,ocolor:'#7c1fff'})}],[2,{type:'text',start:1,dur:2.4,y:.17,fadeIn:.3,fadeOut:.4,text:tx('Folge 1',{size:.05,color:'#ffffff'})}]]},
  {id:'intro-vlog',name:'Vlog-Intro',cat:'intro',clips:[[0,{type:'color',color:'#ffb020',start:0,dur:3,fadeOut:.5}],[1,{type:'text',start:.3,dur:2.7,fadeIn:.4,fadeOut:.5,text:tx('MEIN TAG',{size:.13,font:'Bahnschrift',bold:true,color:'#111111'})}]]},
  {id:'kapitel',name:'Kapitel-Trenner',cat:'intro',clips:[[0,{type:'color',color:'#111111',start:0,dur:2.5,fadeIn:.3,fadeOut:.3}],[1,{type:'text',start:.2,dur:2.2,fadeIn:.3,fadeOut:.3,text:tx('Kapitel 1',{size:.09,font:'Georgia',color:'#ffffff'})}]]},
  {id:'outro-abo',name:'Outro Abonnieren',cat:'outro',clips:[[0,{type:'color',color:'#111111',start:0,dur:6,fadeIn:.4}],[1,{type:'text',start:.3,dur:5.7,y:-.15,fadeIn:.4,text:tx('Danke fürs Zuschauen!',{size:.08,bold:true})}],[2,{type:'text',start:1,dur:5,y:.12,fadeIn:.4,text:tx('ABONNIEREN',{size:.06,box:'#ff0033',bold:true})}]]},
  {id:'ende-blende',name:'Schwarzblende',cat:'outro',clips:[[0,{type:'color',color:'#000000',start:0,dur:2,fadeIn:1.5}]]},
  {id:'folgen',name:'Folge mir',cat:'social',clips:[[1,{type:'text',start:0,dur:4,x:-.25,y:.34,fadeIn:.3,fadeOut:.3,text:tx('@deinkanal',{size:.05,box:'#e5409a',bold:true})}]]},
  {id:'frage',name:'Frage an euch',cat:'social',clips:[[1,{type:'text',start:0,dur:4,y:-.3,fadeIn:.3,fadeOut:.3,text:tx('Was meint ihr?\nSchreibt es in die Kommentare!',{size:.055,box:'#7c6cff',bold:true})}]]},
  {id:'hinweis',name:'Hinweis',cat:'social',clips:[[1,{type:'text',start:0,dur:3,y:.3,fadeIn:.2,fadeOut:.2,text:tx('Link in der Beschreibung',{size:.05,box:'#ffe14d',color:'#111111',bold:true})}]]}];
 function tplPreview(cv,T){const x=cv.getContext('2d'),W=cv.width,H=cv.height;bgGrad(x,W,H);const t=1.3;
  for(const[,o]of T.clips.slice().sort((a,b)=>a[0]-b[0])){const c=Object.assign(App.newClip({}),o);if(c.text)c.text=Object.assign({},c.text,{content:Kit.t(c.text.content)});if(t<c.start||t>=c.start+c.dur)continue;if(c.type==='color'){x.fillStyle=c.color;x.fillRect(0,0,W,H)}else drawTextOn(x,W,H,c)}}
 TABS.tpl={top:()=>search('Vorlagen suchen'),
  body:()=>{const L=TPLS.filter(t=>(N.sub.tpl==='all'||t.cat===N.sub.tpl)&&match(t.name));return`<div class="tiles">${L.map(t=>`<div class="tile" draggable="true" data-drag='${JSON.stringify({kind:'tpl',id:t.id})}' title="${esc(Kit.t(t.name))}"><div class="im"><canvas width="${TW}" height="${THh}" data-tpl="${t.id}"></canvas></div><div class="nm">${esc(Kit.t(t.name))}</div><button class="add" data-addtpl="${t.id}" title="${Kit.t('An der Abspielposition einfügen')}">+</button></div>`).join('')}</div>`},
  after:()=>$$('[data-tpl]').forEach(cv=>tplPreview(cv,TPLS.find(t=>t.id===cv.dataset.tpl)))};
 N.addTemplate=(id,at)=>{at=at||{t:App.t};const T=TPLS.find(t=>t.id===id);if(!T)return;
  App.change(()=>{const layers={};let below=App.P.tracks.length,last=null;
   for(const L of[...new Set(T.clips.map(c=>c[0]))].sort()){const cl=T.clips.filter(c=>c[0]===L).map(([,o])=>{const c=App.newClip(o);c.start=at.t+o.start;if(c.text)c.text=Object.assign({},c.text,{content:Kit.t(c.text.content)});c.name=Kit.t(T.name);return c});
    const s=Math.min(...cl.map(c=>c.start)),e=Math.max(...cl.map(c=>c.start+c.dur));
    let tr=L===0?(App.P.tracks.slice().reverse().find(t=>freeOn(t,s,e))||trackAbove(0,0,0)):trackAbove(below,s,e);below=App.P.tracks.indexOf(tr);for(const c of cl){tr.clips.push(c);last=c}}
   App.sel=last?{clip:last.id}:null})};
 document.addEventListener('click',e=>{const el=e.target.closest('[data-addtpl]');if(el)N.addTemplate(el.dataset.addtpl)});

 // ---------- Eigenschaften ----------
 const get=(o,k)=>k.split('.').reduce((a,p)=>a==null?a:a[p],o);
 const set=(o,k,v)=>{const p=k.split('.');let a=o;for(let i=0;i<p.length-1;i++)a=a[p[i]]=a[p[i]]||{};a[p[p.length-1]]=v};
 const BLENDS=[["", "Normal"], ["darken", "Abdunkeln"], ["multiply", "Multiplizieren"], ["burn", "Farbig nachbelichten"], ["lighten", "Aufhellen"], ["screen", "Negativ multiplizieren"], ["dodge", "Farbig abwedeln"], ["overlay", "Ineinanderkopieren"], ["softlight", "Weiches Licht"], ["hardlight", "Hartes Licht"], ["difference", "Differenz"], ["exclusion", "Ausschluss"], ["add", "Addieren"]];
 const ANIMS_IN=[['','Keine'],['fade','Einblenden'],['slide-l','Von links'],['slide-r','Von rechts'],['slide-u','Von unten'],['slide-d','Von oben'],['pop','Aufploppen'],['type','Schreibmaschine']];
 const ANIMS_OUT=[['','Keine'],['fade','Ausblenden'],['slide-l','Nach links'],['slide-r','Nach rechts'],['slide-u','Nach oben'],['slide-d','Nach unten'],['pop','Wegploppen']];
 const pc=v=>Math.round(v*100)+' %',pm=v=>(v>0?'+':'')+Math.round(v*100);
 const db=v=>(v>0?'+':'')+(+v).toFixed(1)+' dB';
 const SL={spill:[0,1,.01,pc],'audio.hpf':[0,400,5,v=>+v<20?Kit.t('Aus'):Math.round(v)+' Hz'],'audio.lpf':[1000,20000,100,v=>+v>=20000?Kit.t('Aus'):(v/1000).toFixed(1)+' kHz'],'audio.gate':[-80,0,1,v=>+v>-1?Kit.t('Aus'):Math.round(v)+' dB'],'audio.comp':[0,1,.01,pc],'audio.deess':[0,1,.01,pc],'audio.gain':[-24,24,.5,db],'mask.x':[0,1,.005,pc],'mask.y':[0,1,.005,pc],'mask.w':[.02,1.5,.005,pc],'mask.h':[.02,1.5,.005,pc],'mask.feather':[0,.5,.005,pc],'region.x':[0,1,.005,pc],'region.y':[0,1,.005,pc],'region.w':[.02,1,.005,pc],'region.h':[.02,1,.005,pc],'region.amt':[.05,1,.01,pc],hue:[-180,180,1,v=>Math.round(v)+'°'],eqLow:[-12,12,.5,db],eqMid:[-12,12,.5,db],eqHigh:[-12,12,.5,db],'anim.d':[.2,3,.1,v=>(+v).toFixed(1)+' s'],cropL:[0,.45,.005,pc],cropT:[0,.45,.005,pc],cropR:[0,.45,.005,pc],cropB:[0,.45,.005,pc],temp:[-1,1,.01,pm],tint:[-1,1,.01,pm],expo:[-1,1,.01,pm],vig:[0,1,.01,pc],keySim:[.02,.8,.01,pc],keyEdge:[0,.5,.01,pc],pitch:[-12,12,1,v=>(v>0?'+':'')+v+' '+Kit.t('Halbtöne')],volume:[0,2,.01,v=>Math.round(v*100)+' %'],fadeIn:[0,10,.1,v=>v.toFixed(1)+' s'],fadeOut:[0,10,.1,v=>v.toFixed(1)+' s'],opacity:[0,1,.01,v=>Math.round(v*100)+' %'],
  x:[-1,1,.005,v=>Math.round(v*100)+' %'],y:[-1,1,.005,v=>Math.round(v*100)+' %'],scale:[.1,4,.01,v=>Math.round(v*100)+' %'],rot:[-180,180,1,v=>Math.round(v)+'°'],
  bright:[-1,1,.01,v=>(v>0?'+':'')+Math.round(v*100)],contrast:[-1,1,.01,v=>(v>0?'+':'')+Math.round(v*100)],sat:[-1,1,.01,v=>(v>0?'+':'')+Math.round(v*100)],
  speed:[.1,8,.05,v=>v.toFixed(2).replace(/\.?0+$/,'')+'×'],'text.size':[.02,.4,.005,v=>Math.round(v*1000)/10+' %'],'text.outline':[0,2,.05,v=>v?Math.round(v*100)+' %':Kit.t('aus')]};
 const DEF={spill:0,'audio.hpf':0,'audio.lpf':20000,'audio.gate':0,'audio.comp':0,'audio.deess':0,'audio.gain':0,hue:0,eqLow:0,eqMid:0,eqHigh:0,'mask.feather':.1,'region.amt':.5,'anim.d':.5,cropL:0,cropT:0,cropR:0,cropB:0,temp:0,tint:0,expo:0,vig:0,pitch:0,keySim:.3,keyEdge:.1,volume:1,fadeIn:0,fadeOut:0,opacity:1,x:0,y:0,scale:1,rot:0,bright:0,contrast:0,sat:0,speed:1};
 const LBL={spill:'Farbsaum entfernen (Spill)','audio.hpf':'Hochpass (Rumpeln weg)','audio.lpf':'Tiefpass (Zischen weg)','audio.gate':'Noise Gate (leise Stellen stumm)','audio.comp':'Kompressor','audio.deess':'De-Esser (scharfe S-Laute)','audio.gain':'Verstärkung','mask.x':'Mitte waagerecht','mask.y':'Mitte senkrecht','mask.w':'Breite','mask.h':'Höhe','mask.feather':'Weiche Kante','region.x':'Mitte waagerecht','region.y':'Mitte senkrecht','region.w':'Breite','region.h':'Höhe','region.amt':'Stärke',hue:'Farbwinkel',eqLow:'Bass (tief)',eqMid:'Mitten',eqHigh:'Höhen',voice:'Stimme','anim.d':'Dauer der Animation',cropL:'Links',cropT:'Oben',cropR:'Rechts',cropB:'Unten',temp:'Temperatur',tint:'Farbton',expo:'Belichtung',vig:'Vignette',keySim:'Toleranz',keyEdge:'Weiche Kante',pitch:'Tonhöhe',volume:'Lautstärke',fadeIn:'Einblenden',fadeOut:'Ausblenden',opacity:'Deckkraft',x:'Waagerecht',y:'Senkrecht',scale:'Größe',rot:'Drehung',bright:'Helligkeit',contrast:'Kontrast',sat:'Sättigung',speed:'Tempo','text.size':'Schriftgröße','text.outline':'Kontur'};
 function slider(c,k,lab){const[mn,mx,st,f]=SL[k];const anim=App.KF.includes(k)&&c.id;const v=anim?App.kv(c,k):(get(c,k)??DEF[k]??0);const d=DEF[k];
  const has=anim&&App.hasKf(c,k),on=has&&App.kfAt(c,k)>=0;
  const kf=anim?`${has?`<button class="kfn" data-kfnav="${k}:-1" title="${Kit.t('Vorheriger Keyframe')}">‹</button>`:''}<button class="kfb ${on?'on':''} ${has?'has':''}" data-kf="${k}" title="${Kit.t(on?'Keyframe entfernen':'Keyframe hinzufügen')}">◆</button>${has?`<button class="kfn" data-kfnav="${k}:1" title="${Kit.t('Nächster Keyframe')}">›</button>`:''}`:'';
  return`<div class="fld"><label><span>${Kit.t(lab||LBL[k])}</span><span class="frow"><b data-v="${k}">${f(v)}</b>${kf}${d!=null&&!has?`<button class="reset" data-reset="${k}" title="${Kit.t('Zurücksetzen')}">↺</button>`:''}</span></label><input type="range" data-k="${k}" min="${mn}" max="${mx}" step="${st}" value="${v}"></div>`}
 N.syncKf=()=>{const f=App.sel&&App.sel.clip&&App.find(App.sel.clip);if(!f)return;for(const i of $$('#props input[type=range][data-k]')){const k=i.dataset.k;if(!App.KF.includes(k)||!App.hasKf(f.c,k)||document.activeElement===i)continue;const v=App.kv(f.c,k);i.value=v;const b=$(`#props [data-v="${k}"]`);if(b)b.textContent=SL[k][3](v);const kb=$(`#props [data-kf="${k}"]`);if(kb)kb.classList.toggle('on',App.kfAt(f.c,k)>=0)}};
 document.addEventListener('click',e=>{let el;if(el=e.target.closest('#props [data-kf]')){const k=el.dataset.kf;editClip(c=>App.kfToggle(c,k),true);return}
  if(el=e.target.closest('#props [data-kfnav]')){const[k,d]=el.dataset.kfnav.split(':');const f=App.find(App.sel.clip);if(!f)return;const r=App.t-f.c.start,ks=f.c.kf[k].map(x=>x[0]);const n=+d>0?ks.find(x=>x>r+1e-3):ks.reverse().find(x=>x<r-1e-3);if(n!=null)Player.seek(f.c.start+n)}});
 const chk=(c,k,lab)=>`<label class="chk"><input type="checkbox" data-k="${k}" ${get(c,k)?'checked':''}>${Kit.t(lab)}</label>`;
 const color=(c,k,lab,allowNone)=>`<div class="fld"><label><span>${Kit.t(lab)}</span>${allowNone?`<label class="chk" style="margin:0"><input type="checkbox" data-none="${k}" ${get(c,k)?'checked':''}>${Kit.t('an')}</label>`:''}</label><input type="color" data-k="${k}" value="${get(c,k)||'#000000'}" ${allowNone&&!get(c,k)?'disabled':''}></div>`;
 const durFld=c=>`<div class="fld"><label><span>${Kit.t('Dauer')}</span><b>${Kit.t('Sekunden')}</b></label><input type="number" data-k="dur" min="0.1" step="0.1" value="${(+c.dur).toFixed(2)}"></div>`;
 const H4=s=>`<h4>${Kit.t(s)}</h4>`;
 function tabsFor(c,m){if(c.type==='text')return[['text','Text'],['bild','Bild']];if(c.type==='color')return[['farbe','Farbe'],['bild','Bild']];
  if(m&&m.kind==='audio')return[['ton','Ton'],['speed','Tempo']];const t=[['bild','Bild'],['farbe','Farbe']];if(m&&m.kind==='video'){if(m.hasAudio)t.push(['ton','Ton']);t.push(['speed','Tempo'])}return t}
 N.props=(want)=>{const el=$('#props');if(!el||!App.P)return;if(want)N.ptab=want;const s=App.sel;
  if(s&&s.trans){const f=App.find(s.trans);if(f&&f.c.transIn)return transProps(el,f);App.sel=null}
  if(s&&s.clips){el.innerHTML=`<div class="pbody">${H4('Auswahl')}<p><b>${s.clips.length}</b> ${Kit.t('Clips ausgewählt')}</p><div class="frow"><button class="btn" data-act="copy">Kopieren</button><button class="btn danger" data-act="delete">Löschen</button></div></div>`;return}
  const f=s&&s.clip&&App.find(s.clip);if(!f)return projProps(el);const c=f.c,m=c.type==='media'?App.media(c.mediaId):null;
  const tabs=tabsFor(c,m);if(!tabs.some(t=>t[0]===N.ptab))N.ptab=want==='speed'&&!tabs.some(t=>t[0]==='speed')?tabs[0][0]:tabs[0][0];if(want==='speed'&&!tabs.some(t=>t[0]==='speed'))Kit.toast(Kit.t('Das Tempo lässt sich bei Videos und Ton ändern.'));
  let b='';const T=N.ptab;
  if(T==='bild'){b+=H4('Lage')+slider(c,'x')+slider(c,'y')+(c.type==='color'?'':c.type==='text'?slider(c,'rot'):slider(c,'scale')+slider(c,'rot'));if(c.type==='media')b+=`<div class="frow" style="margin:4px 0 8px;flex-wrap:wrap">${chk(c,'flipH','Spiegeln waagerecht')}${chk(c,'flipV','Spiegeln senkrecht')}</div><div class="frow" style="gap:6px;margin-bottom:8px"><button class="btn" data-act="rotl">↺ 90°</button><button class="btn" data-act="rotr">↻ 90°</button></div>`+H4('Zuschneiden')+slider(c,'cropL')+slider(c,'cropR')+slider(c,'cropT')+slider(c,'cropB')+(m?.kind==='video'?chk(c,'stab','Verwackeln ausgleichen (beim Export, in zwei Durchgängen)'):'');
   if(c.type==='media'){b+=(m&&(m.kind==='video'||m.kind==='image')?H4('KI')+`<div class="frow" style="flex-wrap:wrap;gap:6px;margin-bottom:8px">${c.matte?`<button class="btn" data-act="matteoff">${Kit.t('KI-Hintergrund wieder anzeigen')}</button>`:`<button class="btn" data-act="matte">${Kit.t('Hintergrund entfernen (KI)')}</button>`}</div>`:'')+H4('Maske')+`<div class="fld"><select data-mshape><option value="">${Kit.t('Keine Maske')}</option><option value="rect" ${c.mask?.shape==='rect'?'selected':''}>${Kit.t('Rechteck')}</option><option value="ellipse" ${c.mask?.shape==='ellipse'?'selected':''}>${Kit.t('Kreis / Ellipse')}</option></select></div>`+(c.mask?slider(c,'mask.x')+slider(c,'mask.y')+slider(c,'mask.w')+slider(c,'mask.h')+slider(c,'mask.feather')+chk(c,'mask.invert','Maske umkehren'):'');
    b+=H4('Bereich unkenntlich machen')+`<div class="fld"><select data-rmode><option value="">${Kit.t('Aus')}</option><option value="blur" ${c.region?.mode==='blur'?'selected':''}>${Kit.t('Unscharf')}</option><option value="pixel" ${c.region?.mode==='pixel'?'selected':''}>${Kit.t('Verpixeln')}</option></select></div>`+(c.region?slider(c,'region.x')+slider(c,'region.y')+slider(c,'region.w')+slider(c,'region.h')+slider(c,'region.amt')+(m?.kind==='video'?`<button class="btn" data-act="track" style="margin-bottom:8px">${Kit.t('Bereich verfolgen (Bewegung)')}</button>${c.region.path?`<button class="btn" data-act="trackattach" style="margin:0 0 8px 6px">${Kit.t('Element folgen lassen …')}</button><button class="btn" data-act="trackoff" style="margin:0 0 8px 6px">${Kit.t('Verfolgung entfernen')}</button>`:''}`:''):'')}
   b+=H4('Mischen')+slider(c,'opacity')+`<div class="fld"><label><span>${Kit.t('Mischmodus')}</span></label><select data-k="blend">${BLENDS.map(([v,n])=>`<option value="${v}" ${(c.blend||'')===v?'selected':''}>${Kit.t(n)}</option>`).join('')}</select></div>`;if(c.type!=='media'||m?.kind==='image')b+=H4('Zeit')+durFld(c);if(c.type==='text'||m?.kind==='image'||c.type==='color')b+=slider(c,'fadeIn')+slider(c,'fadeOut')}
  if(T==='farbe'){if(c.type==='color')b+=H4('Farbe')+color(c,'color','Farbe der Fläche');else{b+=H4('Farbkorrektur')+chk(c,'enhance','Automatisch verbessern')+slider(c,'expo')+slider(c,'bright')+slider(c,'contrast')+slider(c,'sat')+slider(c,'temp')+slider(c,'tint')+slider(c,'vig')+slider(c,'hue');
   if(c.type==='media')b+=H4('Farbräder')+`<div class="frow" style="gap:6px;flex-wrap:wrap;margin-bottom:8px"><button class="btn" data-act="wheels">${Kit.t('Lift, Gamma, Gain …')}</button>${c.wheels?`<button class="btn" data-act="wheelsoff">${Kit.t('Farbräder zurücksetzen')}</button>`:''}<button class="btn" data-act="scopes">${Kit.t('Scopes')}</button></div>`;
   if(c.type==='media')b+=H4('Kurven und LUT')+`<div class="frow" style="gap:6px;flex-wrap:wrap;margin-bottom:8px"><button class="btn" data-act="curves">${Kit.t('Kurven …')}</button>${c.curves?`<button class="btn" data-act="curvesoff">${Kit.t('Kurven zurücksetzen')}</button>`:''}<button class="btn" data-act="lut">${Kit.t('LUT laden (.cube) …')}</button>${c.lut?`<button class="btn" data-act="lutoff">${Kit.t('LUT entfernen')}</button>`:''}</div>${c.lut?`<p class="muted" style="font-size:12px;word-break:break-all">LUT: ${esc(c.lut.split(/[\\/]/).pop())}</p>`:''}`;
   b+=H4('Effekt')+`<div class="fld"><select data-k="effect"><option value="">${Kit.t('Ohne Effekt')}</option>${App.S.effects.map(x=>`<option value="${x.id}" ${c.effect===x.id?'selected':''}>${esc(Kit.t(x.name))}</option>`).join('')}</select></div>`}
   if(c.type==='media')b+=H4('Chroma Key')+`<label class="chk"><input type="checkbox" data-none="key" ${c.key?'checked':''}>${Kit.t('Hintergrundfarbe entfernen (Greenscreen)')}</label><div class="frow" style="margin-bottom:8px"><input type="color" data-k="key" value="${c.key||'#00ff00'}" ${c.key?'':'disabled'}><span class="muted" style="font-size:12px">${Kit.t('Farbe, die durchsichtig wird')}</span></div>`+(c.key?slider(c,'keySim')+slider(c,'keyEdge')+slider(c,'spill'):'');
   if(c.type==='color')b+=H4('Zeit')+durFld(c)+slider(c,'fadeIn')+slider(c,'fadeOut')}
  if(T==='ton'){b+=H4('Ton')+slider(c,'volume')+chk(c,'mute','Stumm')+slider(c,'fadeIn')+slider(c,'fadeOut')+slider(c,'pitch')+chk(c,'denoise','Rauschen entfernen (beim Export)')
   +H4('Equalizer')+slider(c,'eqLow')+slider(c,'eqMid')+slider(c,'eqHigh')
   +H4('Kanalzug (Fairlight)')+slider(c,'audio.hpf')+slider(c,'audio.lpf')+slider(c,'audio.gate')+slider(c,'audio.deess')+slider(c,'audio.comp')+slider(c,'audio.gain')+chk(c,'audio.limit','Limiter (Spitzen höchstens −1 dB)')+`<p class="muted" style="font-size:12px;margin:2px 0 8px">${Kit.t('Hoch-/Tiefpass, Kompressor, Verstärkung und Limiter hörst du schon in der Vorschau, Gate und De-Esser beim Export.')}</p>`
   +H4('Stimme und Mischung')+`<div class="fld"><label><span>${Kit.t('Stimme verändern')}</span></label><select data-k="voice">${[['','Normal'],['chipmunk','Hoch (Mickymaus)'],['deep','Tief'],['robot','Roboter'],['echo','Echo'],['hall','Halle'],['phone','Telefon'],['radio','Radio'],['whisper','Flüstern']].map(([v,n])=>`<option value="${v}" ${(c.voice||'')===v?'selected':''}>${Kit.t(n)}</option>`).join('')}</select></div>`+chk(c,'duck','Musik: automatisch leiser, wenn gesprochen wird')
   +H4('Automatisch')+`<div class="frow" style="gap:6px;flex-wrap:wrap"><button class="btn" data-act="silence">${Kit.t('Stille herausschneiden …')}</button><button class="btn" data-act="autosubs">${Kit.t('Untertitel aus Sprache (KI) …')}</button><button class="btn" data-act="beats">${Kit.t('Beats als Marker')}</button></div>`+H4('Lautstärke angleichen')+`<div class="frow" style="gap:6px;flex-wrap:wrap"><button class="btn" data-act="normalize" title="${Kit.t('Lauteste Stelle auf −1 dB bringen')}">${Kit.t('Normalisieren')}</button><button class="btn" data-act="duck" title="${Kit.t('Senkt diesen Clip (z. B. Musik) automatisch ab, solange auf anderen Spuren gesprochen wird')}">${Kit.t('Unter Sprache absenken (Ducking)')}</button>${c.kf&&c.kf.volume?`<button class="btn" data-act="unduck">${Kit.t('Lautstärke-Verlauf entfernen')}</button>`:''}</div>`;if(m&&m.kind==='video')b+=`<button class="btn" data-act="detach" style="margin-top:8px">Ton abtrennen</button>`}
  if(T==='speed'){b+=H4('Tempo')+slider(c,'speed')+`<div class="frow" style="flex-wrap:wrap;gap:6px">${[.25,.5,1,1.5,2,4].map(v=>`<button class="btn" data-speed="${v}">${v}×</button>`).join('')}</div><p class="muted" style="font-size:12px">${Kit.t('Schneller macht den Clip kürzer, langsamer macht ihn länger. Der Ton wird ohne Mickymaus-Effekt angepasst.')}</p>`+(m?.kind==='video'?chk(c,'reverse','Rückwärts abspielen')+chk(c,'smooth','Flüssige Zeitlupe (Zwischenbilder berechnen)')+`<p class="muted" style="font-size:12px">${Kit.t('Berechnet beim Export fehlende Bilder, wenn der Clip langsamer läuft. Dauert länger.')}</p>`+H4('Tempo-Rampe')+`<div class="frow" style="flex-wrap:wrap;gap:6px"><button class="btn" data-act="ramp">${Kit.t('Tempo-Rampe …')}</button><button class="btn" data-act="freeze">${Kit.t('Standbild einfügen')}</button></div>`:chk(c,'reverse','Rückwärts abspielen'))}
  if(T==='text'){const tx=c.text;b+=H4('Text')+`<div class="fld"><textarea data-k="text.content" rows="3" spellcheck="false">${esc(tx.content)}</textarea></div>
   <div class="fld"><label><span>${Kit.t('Schrift')}</span></label><select data-k="text.font">${App.S.fonts.map(fn=>`<option ${fn===tx.font?'selected':''} style="font-family:'${fn}'">${esc(fn)}</option>`).join('')}</select></div>
   ${slider(c,'text.size')}<div class="frow">${chk(c,'text.bold','Fett')}${chk(c,'text.shadow','Schatten')}</div>${color(c,'text.color','Textfarbe')}
   ${H4('Animation')}<div class="fld"><label><span>${Kit.t('Eingang')}</span></label><select data-k="anim.in">${ANIMS_IN.map(([v,n])=>`<option value="${v}" ${(c.anim?.in||'')===v?'selected':''}>${Kit.t(n)}</option>`).join('')}</select></div><div class="fld"><label><span>${Kit.t('Ausgang')}</span></label><select data-k="anim.out">${ANIMS_OUT.map(([v,n])=>`<option value="${v}" ${(c.anim?.out||'')===v?'selected':''}>${Kit.t(n)}</option>`).join('')}</select></div>${c.anim&&(c.anim.in||c.anim.out)?slider(c,'anim.d'):''}
   ${H4('Rahmen')}${slider(c,'text.outline')}${color(c,'text.ocolor','Konturfarbe')}${color(c,'text.box','Hintergrund',true)}${H4('Zeit')}${durFld(c)}${slider(c,'fadeIn')}${slider(c,'fadeOut')}`}
  el.innerHTML=`<div class="ptabs">${tabs.map(([k,n])=>`<button data-ptab="${k}" class="${k===T?'on':''}">${Kit.t(n)}</button>`).join('')}</div><div class="pbody"><div class="muted" style="font-size:12px;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.type==='text'?Kit.t('Text'):c.type==='color'?Kit.t('Farbfläche'):(m?m.name:''))} · ${App.fmt(App.len(c),false)}${f.t.locked?' · '+Kit.t('Spur gesperrt'):''}</div>${b}</div>`;
  if(f.t.locked)el.querySelectorAll('input,select,textarea,.pbody button').forEach(x=>x.disabled=true)};
 function projProps(el){const P=App.P;const r=RATIOS.find(x=>Math.abs(x[1]/x[2]-P.w/P.h)<.01);
  el.innerHTML=`<div class="phead"><b>${Kit.t('Projektinfo')}</b></div><div class="pinfo"><span>${Kit.t('Projektname')}</span><b>${esc(P.name)}</b><span>${Kit.t('Auflösung')}</span><b>${P.w} × ${P.h}${r?' ('+r[0]+')':''}</b>
   <span>${Kit.t('Bildrate')}</span><b>${P.fps} fps</b><span>${Kit.t('Dauer')}</span><b>${App.fmt(App.total())}</b><span>${Kit.t('Medien')}</span><b>${P.media.length}</b><span>${Kit.t('Spuren')}</span><b>${P.tracks.length}</b></div>
   <div style="padding:0 16px 16px"><button class="btn" data-act="projset" style="width:100%">${Kit.t('Projekteinstellungen')}</button><p class="muted" style="font-size:12px;margin-top:14px">${Kit.t('Klicke einen Clip in der Zeitleiste an, um ihn hier anzupassen.')}</p></div>`}
 function transProps(el,f){const c=f.c,tr=c.transIn;const ov=Timeline.overlap(f.t,c);const all=App.S.transitions;
  el.innerHTML=`<div class="pbody">${H4('Übergang')}<div class="fld"><select data-trtype>${App.S.library.custom.map(x=>`<option value="custom:${x.id}" ${tr.type==='custom:'+x.id?'selected':''}>${esc(x.name)}</option>`).join('')}${all.map(x=>`<option value="${x.id}" ${tr.type===x.id?'selected':''}>${esc(Kit.t(x.name))}</option>`).join('')}</select></div>
   <div class="fld"><label><span>${Kit.t('Dauer')}</span><b data-v="trdur">${ov.toFixed(1)} s</b></label><input type="range" data-trdur min="0.1" max="${Math.max(.2,(ov+3)).toFixed(1)}" step="0.1" value="${ov}"></div>
   <canvas id="trprev" width="${TW*1.2}" height="${THh*1.2}" style="width:100%;border-radius:8px;margin:6px 0 12px;display:block"></canvas>
   <button class="btn danger" data-act="delete" style="width:100%">Übergang entfernen</button></div>`;
  const cv=$('#trprev');stopAnims();animate(cv,tr.type,tr.custom)}
 document.addEventListener('click',e=>{let el;if(el=e.target.closest('[data-ptab]')){N.ptab=el.dataset.ptab;N.props()}
  if(el=e.target.closest('[data-speed]'))editClip(c=>setSpeed(c,+el.dataset.speed),true);
  if(el=e.target.closest('[data-reset]')){const k=el.dataset.reset;editClip(c=>{if(k==='speed')setSpeed(c,1);else if(App.KF.includes(k))App.setv(c,k,DEF[k]);else set(c,k,DEF[k])},true)}});
 // Ein Schnappschuss zum Rückgängigmachen je Bearbeitung (nicht je Mausbewegung)
 let snap0=null;
 N.edit=(fn,commit)=>editClip(fn,commit);
 function editClip(fn,commit){const f=App.sel&&App.find(App.sel.clip);if(!f||f.t.locked)return;if(!snap0)snap0=JSON.stringify(App.P.tracks);fn(f.c);Timeline.render();Player.sync(true);if(commit)finish(true)}
 function finish(rerender){if(snap0&&snap0!==JSON.stringify(App.P.tracks)){App.undo.push(snap0);App.redo=[]}snap0=null;App.save();if(rerender)N.props()}
 function setSpeed(c,v){const m=App.media(c.mediaId);if(!m||m.kind==='image')return;c.speed=clamp(v,.1,8)}
 function readVal(i){if(i.type==='checkbox')return i.checked;if(i.type==='range'||i.type==='number')return+i.value;return i.value}
 document.addEventListener('input',e=>{const i=e.target;if(!i.closest('#props'))return;
  if(i.dataset.trdur!=null){const id=App.sel.trans;if(!snap0)snap0=JSON.stringify(App.P.tracks);Timeline.setTransDur(id,+i.value);$('[data-v="trdur"]').textContent=(+i.value).toFixed(1)+' s';Timeline.render();Player.sync(true);return}
  const k=i.dataset.k;if(!k)return;const v=readVal(i);
  editClip(c=>{if(k==='speed')setSpeed(c,v);else if(k==='dur')c.dur=Math.max(.1,v||.1);else if(App.KF.includes(k))App.setv(c,k,v);else set(c,k,v)});const b=$(`#props [data-v="${k}"]`);if(b&&SL[k])b.textContent=SL[k][3](v)});
 document.addEventListener('change',e=>{const i=e.target;if(!i.closest('#props'))return;
  if(i.matches('[data-mshape]')){const v=i.value;editClip(c=>{if(!v)delete c.mask;else c.mask=Object.assign({x:.5,y:.5,w:.6,h:.6,feather:.1,invert:false},c.mask||{},{shape:v})},true);return}
  if(i.matches('[data-rmode]')){const v=i.value;editClip(c=>{if(!v)delete c.region;else c.region=Object.assign({x:.5,y:.5,w:.3,h:.3,amt:.5},c.region||{},{mode:v})},true);return}
  if(i.dataset.none){const k=i.dataset.none;const ci=$(`#props input[data-k="${k}"]`);editClip(c=>set(c,k,i.checked?(ci.value||'#000000'):''),true);return}
  if(i.dataset.trtype!=null){const id=App.sel.trans;const f=App.find(id);App.change(()=>{const t=i.value;f.c.transIn.type=t;if(t.startsWith('custom:'))f.c.transIn.custom=Object.assign({},customOf(t.slice(7)));else delete f.c.transIn.custom});return}
  if(i.dataset.trdur!=null){finish(false);return}
  if(i.dataset.k){if(i.type==='checkbox'||i.tagName==='SELECT'){const v=readVal(i);editClip(c=>set(c,i.dataset.k,v),true)}else finish(false)}});

 // ---------- Projekteinstellungen ----------
 N.projectSettings=()=>{const P=App.P;let w=P.w,h=P.h,fps=P.fps;
  const draw=()=>{N.modal(`<div class="mhead"><h3>Projekteinstellungen</h3><button class="ib" data-close>${ICON.x}</button></div><div class="mbody">
   <div class="fld"><label><span>${Kit.t('Name')}</span></label><input id="psname" value="${esc(P.name)}"></div>
   <h4 style="margin:14px 0 8px">${Kit.t('Seitenverhältnis')}</h4><div class="ratios">${RATIOS.map(([n,W,H,d])=>{const k=40/Math.max(W,H);return`<button class="ratio ${W===w&&H===h?'on':''}" data-psr="${W}x${H}"><i style="width:${W*k}px;height:${H*k}px"></i><b>${n}</b><small>${Kit.t(d)}</small></button>`}).join('')}</div>
   <div class="frow" style="margin-top:14px"><div class="fld" style="flex:1"><label><span>${Kit.t('Auflösung')}</span></label><select id="psres">${[[1,'Full HD'],[2/3,'HD 720p'],[2,'4K'],[4/9,'480p']].map(([k,n])=>{const W=Math.round(baseW()*k/2)*2,H=Math.round(baseH()*k/2)*2;return`<option value="${W}x${H}" ${W===w&&H===h?'selected':''}>${n} · ${W} × ${H}</option>`}).join('')}</select></div>
    <div class="fld" style="flex:1"><label><span>${Kit.t('Bilder pro Sekunde')}</span></label><select id="psfps">${[24,25,30,50,60].map(v=>`<option ${v===fps?'selected':''}>${v}</option>`).join('')}</select></div></div></div>
   <div class="mfoot"><button class="btn" data-close>Abbrechen</button><button class="btn primary" id="pssave">Übernehmen</button></div>`)};
  const ratio=()=>RATIOS.find(r=>Math.abs(r[1]/r[2]-w/h)<.01)||RATIOS[0];const baseW=()=>ratio()[1],baseH=()=>ratio()[2];
  draw();
  $('#mbox').onclick=e=>{const r=e.target.closest('[data-psr]');if(r){P.name=$('#psname').value||P.name;[w,h]=r.dataset.psr.split('x').map(Number);draw();return}
   if(e.target.closest('#pssave')){P.name=$('#psname').value.trim()||P.name;[w,h]=$('#psres').value.split('x').map(Number);fps=+$('#psfps').value;const chg=w!==P.w||h!==P.h;P.w=w;P.h=h;P.fps=fps;$('#pname').value=P.name;N.close();App.save();if(chg)Player.init();else Player.draw();N.props();Timeline.render()}};
  $('#mbox').onchange=e=>{if(e.target.id==='psres'){[w,h]=e.target.value.split('x').map(Number)}if(e.target.id==='psfps')fps=+e.target.value}};

 // ---------- Exportieren ----------
 const FMTS=[['mp4','MP4','Für alles'],['mov','MOV','Apple'],['mkv','MKV','Archiv'],['webm','WEBM','Web'],['avi','AVI','Älter'],['gif','GIF','Animation'],['png','PNG','Einzelbilder'],['jpg','JPG','Einzelbilder, klein'],['mp3','MP3','Nur Ton'],['wav','WAV','Ton, verlustfrei']];
 const EXPRE=[['yt','YouTube',{format:'mp4',res:1080,fps:0,quality:'rec',loud:true}],['yt4k','YouTube 4K',{format:'mp4',res:2160,fps:0,quality:'high',loud:true}],['tt','TikTok / Reels / Shorts',{format:'mp4',res:1080,fps:30,quality:'rec',loud:true}],['ig','Instagram',{format:'mp4',res:1080,fps:30,quality:'rec',loud:true}],['web','Web, klein',{format:'webm',res:720,fps:30,quality:'low'}],['arch','Archiv, beste Qualität',{format:'mkv',res:0,fps:0,quality:'high'}],['gifp','GIF',{format:'gif',res:480,fps:15,quality:'rec'}]];
 let exPoll=null;
 N.exportDialog=async()=>{try{App.S=await api('api/state')}catch(e){}if(!App.S.engine.ready){App.S=await api('api/state');if(!App.S.engine.ready)return Kit.toast(Kit.t('Zum Exportieren fehlt noch ffmpeg. Richte es im Startfenster einmalig ein.'))}
  if(!App.total())return Kit.toast(Kit.t('Die Zeitleiste ist noch leer.'));
  const P=App.P;const ex=Object.assign({name:P.name,dir:App.S.videosDir,format:'mp4',res:0,fps:0,quality:'rec'},P.export||{});if(!ex.name)ex.name=P.name;delete ex.start;delete ex.end;let range='all';const tot=App.total();
  const selC=App.sel&&App.sel.clip&&App.find(App.sel.clip);const pT=s=>{s=String(s).trim().replace(',','.');const q=s.split(':').map(Number);if(q.some(isNaN))return NaN;return q.reduce((a,b)=>a*60+b,0)};const fT=v=>{const m=Math.floor(v/60),x=v-m*60;return m+':'+(x<10?'0':'')+x.toFixed(2)};let cs=0,ce=tot;
  let job=await api('api/export/job?id='+P.id);if(job.running)return progress();
  let thumb='';try{thumb=$('#cv').toDataURL('image/jpeg',.8)}catch(e){}
  const draw=()=>{const audio=ex.format==='mp3'||ex.format==='wav';const gif=ex.format==='gif';
   const resOpts=[[0,Kit.t('Wie im Projekt')+` (${P.h}p)`],[2160,'4K · 2160p'],[1440,'1440p'],[1080,'1080p'],[720,'720p'],[480,'480p']];
   N.modal(`<div class="mhead"><h3>Exportieren</h3><button class="ib" data-close>${ICON.x}</button></div><div class="mbody"><div class="excols">
    <div><div class="exprev" style="background-image:url('${thumb}');aspect-ratio:${P.w}/${P.h};max-height:300px;margin:0 auto"></div><p class="muted" style="font-size:12px;text-align:center">${App.fmt(App.total(),false)} · ${P.w} × ${P.h}</p></div>
    <div><div class="fld"><label><span>${Kit.t('Format')}</span></label><div class="fmts">${FMTS.map(([id,n,d])=>`<button class="btn ${ex.format===id?'on':''}" data-fmt="${id}"><b>${n}</b><small>${Kit.t(d)}</small></button>`).join('')}</div></div>
     <div class="fld"><label><span>${Kit.t('Vorlage')}</span></label><select id="expre"><option value="">${Kit.t('Eigene Einstellungen')}</option>${EXPRE.map(([k,n])=>`<option value="${k}">${Kit.t(n)}</option>`).join('')}</select></div>
     <div class="fld"><label><span>${Kit.t('Bereich')}</span></label><div class="frow"><select id="exrange" style="flex:1"><option value="all" ${range==='all'?'selected':''}>${Kit.t('Ganzes Video')}</option>${selC?`<option value="clip" ${range==='clip'?'selected':''}>${Kit.t('Nur ausgewählter Clip')}</option>`:''}<option value="head" ${range==='head'?'selected':''}>${Kit.t('Ab Abspielkopf')}</option><option value="custom" ${range==='custom'?'selected':''}>${Kit.t('Eigener Bereich')}</option></select>${range==='custom'?`<input id="exs" value="${fT(cs)}" style="width:80px" title="${Kit.t('Von (Minuten:Sekunden)')}"><input id="exe" value="${fT(ce)}" style="width:80px" title="${Kit.t('Bis (Minuten:Sekunden)')}">`:''}</div></div>
     <div class="fld"><label><span>${Kit.t('Name')}</span></label><input id="exname" value="${esc(ex.name)}" spellcheck="false"></div>
     <div class="fld"><label><span>${Kit.t('Speichern in')}</span></label><div class="frow"><input id="exdir" value="${esc(ex.dir)}" spellcheck="false" style="flex:1"><button class="btn" id="expick">Ändern</button></div></div>
     ${audio?'':`<div class="frow"><div class="fld" style="flex:1"><label><span>${Kit.t('Auflösung')}</span></label><select id="exres">${resOpts.filter(([v])=>!gif||v===0||v<=720).map(([v,n])=>`<option value="${v}" ${ex.res===v?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="fld" style="flex:1"><label><span>${Kit.t('Bilder pro Sekunde')}</span></label><select id="exfps"><option value="0">${Kit.t('Wie im Projekt')} (${P.fps})</option>${[24,25,30,50,60].filter(v=>!gif||v<=30).map(v=>`<option ${ex.fps===v?'selected':''}>${v}</option>`).join('')}</select></div></div>`}
     <div class="fld"><label><span>${Kit.t('Qualität')}</span><b id="exsize"></b></label><div class="seg">${[['high','Beste'],['rec','Empfohlen'],['low','Kleine Datei']].map(([v,n])=>`<button class="btn ${ex.quality===v?'on':''}" data-q="${v}">${Kit.t(n)}</button>`).join('')}</div></div>
     ${gif||ex.format==='png'||ex.format==='jpg'?'':`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label>${Kit.t('Lautheit')}</label><select id="exloud">${[[0,'Nicht angleichen'],[-14,'−14 LUFS (YouTube, TikTok, Spotify)'],[-16,'−16 LUFS (Podcast, Apple)'],[-23,'−23 LUFS (Fernsehen, EBU R128)'],[-24,'−24 LUFS (Fernsehen USA)']].map(([v,n])=>`<option value="${v}" ${(ex.loud?(ex.lufs||-14):0)===v?'selected':''}>${Kit.t(n)}</option>`).join('')}</select><button class="btn sm" id="exmeasure" type="button">${Kit.t('Lautheit messen')}</button><span class="muted" id="exlufs" style="font-size:12px"></span></div>`}
     ${audio?'':`<div class="exspeed"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="exgpu" ${ex.gpu!==false?'checked':''}> ${Kit.t('Grafikkarte nutzen (viel schneller, PC bleibt kühler)')}</label>
      <small class="muted">${['mp4','mov','mkv'].includes(ex.format)?(App.S.gpu?Kit.t('Gefunden:')+' '+esc(Kit.t(App.S.gpu)):App.S.gpuChecked?Kit.t('Keine passende Grafikkarte gefunden. Es wird mit dem Prozessor gerendert (schnelle Einstellungen).'):Kit.t('Grafikkarte wird geprüft …')):Kit.t('Für dieses Format rendert der Prozessor; die Grafikkarte hilft beim Lesen der Videos.')}</small>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="exgentle" ${ex.gentle?'checked':''}> ${Kit.t('PC schonen (nur die Hälfte der Prozessorkerne, dauert länger)')}</label></div>`}
    </div></div></div><div class="mfoot"><button class="btn" data-close>Abbrechen</button><button class="btn primary" id="exgo"><svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 19h16"/></svg>Exportieren</button></div>`);
   $('#exsize').textContent=estimate()};
  const rng=()=>{if(range==='clip'&&selC)return[selC.c.start,selC.c.start+App.len(selC.c)];if(range==='head')return[Math.min(App.t,tot-.04),tot];if(range==='custom'){const a=Math.max(0,cs),b=Math.min(tot,ce);return b>a+.04?[a,b]:[0,tot]}return[0,tot]};
  const estimate=()=>{const [r0,r1]=rng();const d=r1-r0;const audio=ex.format==='mp3'||ex.format==='wav';let mb;
   if(ex.format==='wav')mb=d*48000*4/1e6;else if(audio)mb=d*({high:320,rec:192,low:128}[ex.quality])/8/1000;
   else{const hh=ex.res||P.h;const px=(hh*hh*P.w/P.h)/(1920*1080);const fr=(ex.fps||P.fps)/30;const base={high:16,rec:8,low:3.5}[ex.quality];mb=d*base*px*Math.sqrt(fr)/8+(d*192/8/1000);if(ex.format==='gif')mb*=4;if(ex.format==='png'||ex.format==='jpg')mb=d*(ex.fps||P.fps)*(ex.format==='png'?2.5:.4)*px}
   return'≈ '+(mb<1?'< 1':mb<1000?Math.round(mb):(mb/1000).toFixed(1)+' G')+(mb<1000?' MB':'B')};
  const read=()=>{if($('#exrange'))range=$('#exrange').value;if($('#exgpu'))ex.gpu=$('#exgpu').checked;if($('#exgentle'))ex.gentle=$('#exgentle').checked;if($('#exloud')){const v=+$('#exloud').value;ex.loud=v<0;ex.lufs=v<0?v:undefined}if($('#exs')){const a=pT($('#exs').value),b=pT($('#exe').value);if(!isNaN(a))cs=a;if(!isNaN(b))ce=b}ex.name=$('#exname')?.value??ex.name;ex.dir=$('#exdir')?.value??ex.dir;if($('#exres'))ex.res=+$('#exres').value;if($('#exfps'))ex.fps=+$('#exfps').value};
  draw();
  $('#mbox').onclick=async e=>{let el;
   if(el=e.target.closest('[data-fmt]')){read();ex.format=el.dataset.fmt;if(ex.format==='gif'){if(!ex.res||ex.res>720)ex.res=Math.min(P.h,480);if(ex.fps>30)ex.fps=15}draw();return}
   if(el=e.target.closest('[data-q]')){read();ex.quality=el.dataset.q;draw();return}
   if(e.target.closest('#expick')){read();const p=await Kit.pick('folder');if(p[0]){ex.dir=p[0];draw()}return}
   if(e.target.closest('#exgo')){read();const [r0,r1]=rng();const send=Object.assign({},ex);if(r0>0.001||r1<tot-0.001){send.start=r0;send.end=r1}await App.flush();try{await api('api/export',{id:P.id,export:send});P.export=Object.assign({},ex);progress()}catch(x){Kit.toast(x.message)}}};
  $('#mbox').onchange=e=>{if(e.target.id==='expre'){const v=EXPRE.find(x=>x[0]===e.target.value);if(v){read();Object.assign(ex,v[2]);if(ex.res>P.h&&v[0]!=='yt4k')ex.res=0;if(v[0]==='tt'&&P.w>P.h)Kit.toast(Kit.t('Tipp: Für TikTok, Reels und Shorts das Projekt auf 9:16 stellen (Projekteinstellungen).'));draw()}return}if(e.target.id==='exrange'){read();if(range==='custom'&&ce<=cs){cs=0;ce=tot}draw();return}read();$('#exsize').textContent=estimate()}};
 function progress(){N.locked=true;const P=App.P;
  N.modal(`<div class="mhead"><h3>Wird exportiert …</h3></div><div class="mbody"><div class="bar2"><i id="exbar" style="width:0%"></i></div><div class="frow"><b id="expct">0 %</b><div class="sp"></div><span class="muted" id="exeta"></span></div>
   <p class="muted" id="exeng" style="font-size:12px"></p><p class="muted" style="font-size:12px">${Kit.t('Du kannst das Fenster schließen. Der Export läuft dann im Hintergrund weiter.')}</p></div><div class="mfoot"><button class="btn" id="exhide">Im Hintergrund</button><button class="btn danger" id="excancel">Abbrechen</button></div>`);
  $('#mbox').onclick=async e=>{if(e.target.closest('#excancel')){await api('api/export/cancel?id='+P.id,{})}if(e.target.closest('#exhide')){N.locked=false;N.close();clearTimeout(exPoll);bgPoll(P.id)}};
  const tick=async()=>{let j;try{j=await api('api/export/job?id='+P.id)}catch(e){exPoll=setTimeout(tick,800);return}
   if(!$('#exbar'))return;if(j.running){if($('#exeng'))$('#exeng').textContent=(j.engine?Kit.t('Rendert mit:')+' '+Kit.t(j.engine):'')+(j.note?' – '+Kit.t(j.note):'');const p=Math.round(j.done*100);$('#exbar').style.width=p+'%';$('#expct').textContent=p+' %';$('#exeta').textContent=j.eta>0?Kit.t('noch etwa')+' '+fmtDur(j.eta)+' '+Kit.t('min'):'';exPoll=setTimeout(tick,500);return}
   N.locked=false;done(j)};tick()}
 function bgPoll(id){const t=async()=>{try{const j=await api('api/export/job?id='+id);if(j.running){exPoll=setTimeout(t,1500);return}if(j.finish)Kit.toast(Kit.t('Export fertig:')+' '+j.out.split(/[\\/]/).pop());else if(j.error)Kit.toast(j.error)}catch(e){}};t()}
 function done(j){if(j.finish){const dir=j.out.replace(/[\\/][^\\/]*$/,'');
   N.modal(`<div class="mhead"><h3>Fertig</h3><button class="ib" data-close>${ICON.x}</button></div><div class="mbody"><p><b>${esc(j.out.split(/[\\/]/).pop())}</b></p><p class="muted">${esc(dir)} · ${size(j.size)}</p></div>
    <div class="mfoot"><button class="btn" data-close>Schließen</button><button class="btn primary" id="exopen">Ordner öffnen</button></div>`);$('#mbox').onclick=e=>{if(e.target.closest('#exopen')){Kit.openFolder(dir);N.close()}}}
  else N.modal(`<div class="mhead"><h3>${j.error==='Abgebrochen'?Kit.t('Abgebrochen'):Kit.t('Export fehlgeschlagen')}</h3><button class="ib" data-close>${ICON.x}</button></div><div class="mbody"><p class="muted" style="white-space:pre-wrap;max-height:200px;overflow:auto">${esc(j.error==='Abgebrochen'?Kit.t('Der Export wurde abgebrochen. Es wurde keine Datei gespeichert.'):j.error||'')}</p></div><div class="mfoot"><button class="btn" data-close>Schließen</button></div>`)}

 // ---------- Übergangs-Designer ----------
 const SHAPES=[['line','Linie'],['circle','Kreis'],['diamond','Raute'],['blinds','Jalousie'],['checker','Schachbrett'],['clock','Uhr']];
 N.designer=(edit)=>{const c=Object.assign({id:'',name:Kit.t('Mein Übergang'),shape:'line',angle:0,soft:.2,count:6,invert:false,dur:1},edit?JSON.parse(JSON.stringify(edit)):{});
  const draw=()=>{const ang=['line','blinds','checker','clock'].includes(c.shape),cnt=['blinds','checker'].includes(c.shape);
   N.modal(`<div class="mhead"><h3>${edit?Kit.t('Übergang bearbeiten'):Kit.t('Neuer Übergang')}</h3><button class="ib" data-close>${ICON.x}</button></div><div class="mbody"><div class="designer">
    <div><canvas id="dsv" width="480" height="270"></canvas><input type="range" id="dsp" min="0" max="1" step="0.01" value="0.5" style="width:100%;margin-top:8px" aria-label="Vorschau"><p class="muted" style="font-size:12px">${Kit.t('Die Vorschau läuft von selbst. Ziehe den Regler, um eine Stelle genau anzusehen.')}</p></div>
    <div><div class="fld"><label><span>${Kit.t('Name')}</span></label><input id="dsname" value="${esc(c.name)}"></div>
     <div class="fld"><label><span>${Kit.t('Form')}</span></label><div class="fmts" style="grid-template-columns:repeat(3,1fr)">${SHAPES.map(([id,n])=>`<button class="btn ${c.shape===id?'on':''}" data-shape="${id}">${Kit.t(n)}</button>`).join('')}</div></div>
     ${ang?`<div class="fld"><label><span>${Kit.t('Richtung')}</span><b data-dv="angle">${Math.round(c.angle)}°</b></label><input type="range" data-dk="angle" min="0" max="360" step="5" value="${c.angle}"></div>`:''}
     ${cnt?`<div class="fld"><label><span>${Kit.t('Anzahl')}</span><b data-dv="count">${c.count}</b></label><input type="range" data-dk="count" min="2" max="24" step="1" value="${c.count}"></div>`:''}
     <div class="fld"><label><span>${Kit.t('Weiche Kante')}</span><b data-dv="soft">${Math.round(c.soft*100)} %</b></label><input type="range" data-dk="soft" min="0.01" max="1" step="0.01" value="${c.soft}"></div>
     <div class="fld"><label><span>${Kit.t('Dauer')}</span><b data-dv="dur">${(+c.dur).toFixed(1)} s</b></label><input type="range" data-dk="dur" min="0.2" max="4" step="0.1" value="${c.dur}"></div>
     <label class="chk"><input type="checkbox" id="dsinv" ${c.invert?'checked':''}>${Kit.t('Umkehren')}</label></div></div></div>
    <div class="mfoot">${edit?`<button class="btn danger" id="dsdel" style="margin-right:auto">Löschen</button>`:''}<button class="btn" data-close>Abbrechen</button><button class="btn primary" id="dssave">Speichern</button></div>`);
   loop()};
  let raf=0,manual=null;const t0=performance.now();
  const loop=()=>{cancelAnimationFrame(raf);const cv=$('#dsv');if(!cv)return;const A=FX.sample(cv.width,cv.height,0),B=FX.sample(cv.width,cv.height,1);
   const st=now=>{if(!$('#dsv'))return;const p=manual!=null?manual:Math.min(1,((now-t0)/1000/Math.max(.2,c.dur))%1.5);const x=cv.getContext('2d');x.clearRect(0,0,cv.width,cv.height);FX.trans(x,'custom',p,A,B,cv.width,cv.height,c);if(manual==null)$('#dsp').value=p;raf=requestAnimationFrame(st)};raf=requestAnimationFrame(st);anims.push({get raf(){return raf}})};
  draw();
  $('#mbox').oninput=e=>{const k=e.target.dataset.dk;if(k){c[k]=+e.target.value;const b=$(`[data-dv="${k}"]`);if(b)b.textContent=k==='angle'?Math.round(c[k])+'°':k==='soft'?Math.round(c[k]*100)+' %':k==='dur'?c[k].toFixed(1)+' s':c[k]}
   if(e.target.id==='dsp')manual=+e.target.value;if(e.target.id==='dsname')c.name=e.target.value};
  $('#mbox').onchange=e=>{if(e.target.id==='dsinv')c.invert=e.target.checked;if(e.target.id==='dsp')setTimeout(()=>manual=null,1200)};
  $('#mbox').onclick=async e=>{let el;
   if(el=e.target.closest('[data-shape]')){c.name=$('#dsname').value;c.shape=el.dataset.shape;draw();return}
   if(e.target.closest('#dsdel')){if(!confirm(Kit.t('Diesen Übergang löschen? Clips, die ihn benutzen, behalten ihn.')))return;await api('api/transitions/remove?id='+c.id,{});App.S=await api('api/state');N.close();App.tab='trans';N.lib();return}
   if(e.target.closest('#dssave')){c.name=($('#dsname').value||'').trim()||Kit.t('Mein Übergang');try{const saved=await api('api/transitions/save',c);App.S=await api('api/state');N.close();App.tab='trans';N.lib();
     const id=App.sel&&(App.sel.clip||App.sel.trans);if(id&&!edit){Timeline.applyTrans(id,'custom:'+saved.id,saved)}else Kit.toast(Kit.t('Übergang gespeichert. Er steht in allen Projekten bereit.'))}catch(x){Kit.toast(x.message)}}}};

 // ---------- Tastenkürzel ----------
 N.keys=()=>Keys.editor();
 return N})();
