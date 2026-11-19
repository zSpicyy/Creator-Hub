// Oberfläche: Startfenster, Menüs, Seitenleiste , Ebenen, Eigenschaften, Export, Tastenkürzel.
const UI=(()=>{const U={};const {$,esc,api}=Kit;const t=s=>Kit.t(s);
 let S={projects:[],exportDir:''};
 document.addEventListener('input',e=>{if(e.target.id==='psearch')U.start(true)});const ls={get:(k,d)=>{try{const v=localStorage.getItem('bb.'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem('bb.'+k,JSON.stringify(v))}catch(e){}}};
 U.mode='pro';
 const closed=new Set(ls.get('closed',['p-adjust','p-filter']));

 // ---- Fenster (Dialoge) ----
 U.locked=false;
 U.modal=h=>{$('#mbox').innerHTML=h;$('#modal').classList.add('show');$('#mbox').onclick=null;$('#mbox').oninput=null;$('#mbox').onchange=null;$('#mbox').onkeydown=null};
 U.close=()=>{$('#modal').classList.remove('show');$('#mbox').innerHTML='';U.locked=false};
 $('#modal').addEventListener('pointerdown',e=>{if(e.target.id==='modal'&&!U.locked)U.close()});
 const busy=(on,txt)=>{$('#busy').hidden=!on;if(txt)$('#busyt').textContent=t(txt)};
 const ask=(title,text,ok,danger)=>new Promise(res=>{U.modal(`<div class="unsaved-dlg"><div class="ud-ico"><svg viewBox="0 0 24 24"><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18v.5"/></svg></div><h2>${esc(t(title))}</h2><p>${text}</p><div class="ud-btns"><button class="btn ${danger?'danger':'primary'}" data-a="ok">${esc(t(ok))}</button><button class="btn" data-a="no">${esc(t('Abbrechen'))}</button></div></div>`);U.locked=true;
  $('#mbox').onclick=e=>{const b=e.target.closest('[data-a]');if(!b)return;U.close();res(b.dataset.a==='ok')}});

 // ---- Startfenster ----
 const SIZES=[['YouTube-Thumbnail',1280,720],['Full HD',1920,1080],['Shorts / TikTok',1080,1920],['Instagram-Beitrag',1080,1080],['Instagram hoch',1080,1350],['Twitch-Banner',1200,480],['YouTube-Banner',2560,1440],['Profilbild',800,800],['Twitch-Panel',320,160]];
 const loadState=async()=>{try{S=await api('api/state')}catch(e){}};
 U.start=async(q)=>{if(q!==true)await loadState();if(Doc.d)stash();$('#editor').hidden=true;$('#start').hidden=false;U.renderTabs();
  $('#presets').innerHTML=SIZES.map(([n,w,h])=>{const k=48/Math.max(w,h);return`<button class="preset" data-new="${w}x${h}" data-n="${esc(t(n))}"><div class="pv"><i style="width:${Math.round(w*k)}px;height:${Math.round(h*k)}px"></i></div><b>${esc(t(n))}</b><small>${w} × ${h}</small></button>`}).join('');
  const rec=Extra.recent();$('#recent').innerHTML=rec.length?`<h2>${esc(t('Zuletzt geöffnete Dateien'))}</h2><div class="recent">${rec.map(p=>`<button data-recent="${esc(p)}" title="${esc(p)}">${esc(Kit.base(p))}<small>${esc(p)}</small></button>`).join('')}</div>`:'';
  const pq=($('#psearch')?.value||'').trim().toLowerCase();$('#projects').innerHTML=(S.projects||[]).filter(p=>!pq||(p.name||'').toLowerCase().includes(pq)).map(p=>`<button class="proj" data-open="${p.id}"><div class="th">${p.thumb?`<img src="api/thumb?id=${p.id}&_=${p.updated}" alt="" onerror="this.className='ph';this.src='logo.svg'">`:'<img class="ph" src="logo.svg" alt="">'}</div><div class="tx"><div class="tr"><b>${esc(p.name)}</b><em class="tag">${p.w} × ${p.h}</em></div><span>${esc(new Date(p.updated*1000).toLocaleDateString(Kit.lang==='de'?'de-DE':'en-US'))}</span><i class="open">${esc(t('Öffnen'))}</i></div><span class="pacts"><span data-ren="${p.id}" data-name="${esc(p.name)}" title="${esc(t('Umbenennen'))}">✎</span><span data-dupp="${p.id}" title="${esc(t('Duplizieren'))}">⧉</span><span class="del" data-del="${p.id}" data-name="${esc(p.name)}" title="${esc(t('Löschen'))}"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></span></span></button>`).join('')||`<div class="ch-empty"><svg viewBox="0 0 48 48"><rect x="6" y="10" width="36" height="28" rx="5"/><path d="M6 30l10-9 8 7 6-5 12 10"/><circle cx="31" cy="19" r="3"/></svg><b>${esc(t('Noch keine Projekte'))}</b><p>${esc(t('Wähle oben ein Format, öffne ein Bild oder zieh eins einfach ins Fenster.'))}</p></div>`};
 $('#start').onclick=async e=>{let b;
  if(b=e.target.closest('[data-dupp]')){e.stopPropagation();busy(true,'Wird kopiert …');try{await api('api/duplicate?id='+b.dataset.dupp,{});Kit.toast(t('Projekt dupliziert.'))}catch(x){Kit.toast(x.message)}busy(false);return U.start()}
  if(b=e.target.closest('[data-ren]')){e.stopPropagation();const id=b.dataset.ren;U.modal(`<div class="mhead"><h3>${esc(t('Projekt umbenennen'))}</h3></div><div class="mbody"><input id="rnin" style="width:100%" value="${b.dataset.name}"></div><div class="mfoot"><button class="btn" id="rnno">${esc(t('Abbrechen'))}</button><button class="btn primary" id="rnok">${esc(t('Umbenennen'))}</button></div>`);
   const inp=$('#rnin');inp.focus();inp.select();const go=async()=>{const v=inp.value.trim();if(!v)return;U.close();await api('api/rename',{ID:id,Name:v});U.start()};$('#rnok').onclick=go;$('#rnno').onclick=()=>U.close();inp.onkeydown=ev=>{if(ev.key==='Enter')go()};return}
  if(b=e.target.closest('[data-del]')){e.stopPropagation();if(!await ask('Projekt löschen?',esc(t('Das Projekt'))+` <b>${esc(b.dataset.name)}</b> `+esc(t('wird endgültig gelöscht.')),'Löschen',true))return;await api('api/delete?id='+b.dataset.del,{});return U.start()}
  if(b=e.target.closest('[data-open]'))return U.open(b.dataset.open);
  if(b=e.target.closest('[data-new]')){const [w,h]=b.dataset.new.split('x').map(Number);return U.create(w,h,'#ffffff',b.dataset.n)}
  if(e.target.closest('#newCustom')){const f=U.unitF($('#nunit').value,+$('#nppi').value||300),w=Math.round(+$('#nw').value*f),h=Math.round(+$('#nh').value*f);U.newPPI=+$('#nppi').value||300;if(!(w>0&&h>0&&w<=30000&&h<=30000))return Kit.toast(t('Bitte eine Größe zwischen 1 und 30000 Pixel eingeben.'));return U.create(w,h,$('#nbg').value)}
  if(b=e.target.closest('[data-recent]'))return openPath(b.dataset.recent);
  if(e.target.closest('#openImg'))return U.openImage()};
 const IMGF='Bilder|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.bmp;*.psd;*.xcf';
 const isImg=p=>/\.(png|jpe?g|webp|gif|bmp|psd|xcf)$/i.test(p);
 const stem=p=>Kit.base(p).replace(/\.[^.]+$/,'');
 U.create=async(w,h,bg,name)=>{busy(true,'Wird angelegt …');try{const p=await api('api/new',{name:name||t('Mein Bild'),w,h});newTab();await Doc.open(p.id);if(U.newPPI){Doc.d.ppi=U.newPPI;U.newPPI=0}
   const cv=Doc.mk(w,h);if(bg){const c=cv.getContext('2d');c.fillStyle=bg;c.fillRect(0,0,w,h)}Doc.d.layers.push({...Doc.defaults('pixel'),name:t(bg?'Hintergrund':'Ebene 1'),cv,x:0,y:0,w,h,locked:!!bg,noAlpha:!!bg});Doc.sel=bg?null:Doc.d.layers[0].id;
   await Doc.save();enter()}catch(e){Kit.toast(e.message)}busy(false)};
 U.openImage=async()=>{const ps=await Kit.pick('file',IMGF);if(ps[0])openPath(ps[0])};
 // Bild duplizieren: neues Projekt mit Kopien aller Ebenen
 const dupImage=async()=>{const src=Doc.getState();busy(true,'Wird angelegt …');try{const pr=await api('api/new',{name:Doc.d.name+' '+t('Kopie'),w:Doc.d.w,h:Doc.d.h});const ls2=Doc.d.layers.map(L=>({...L,shadow:{...L.shadow}}));const ad={...Doc.d.adjust};const ex=JSON.parse(JSON.stringify({...Doc.d.extra,chans:[]}));
  newTab();await Doc.open(pr.id);Doc.d.layers=ls2;Doc.d.adjust=ad;Doc.d.extra=ex;Doc.sel=src.sel;await Doc.save();enter()}catch(e){Kit.toast(e.message)}busy(false)};
 const toLayers=r=>r.layers.map(l=>({...Doc.defaults('pixel'),name:l.name||t('Ebene'),cv:l.cv,x:l.x,y:l.y,w:l.cv.width,h:l.cv.height,opacity:l.opacity,visible:l.visible,blend:l.blend}));
 const openPath=async p=>{try{Extra.addRecent(p)}catch(e){}if(Import.isDoc(p)){busy(true,'Datei wird geöffnet …');try{const r=await Import.load(p);const pr=await api('api/new',{name:stem(p),w:r.w,h:r.h});newTab();await Doc.open(pr.id);Doc.d.layers.push(...toLayers(r));Doc.sel=(Doc.d.layers.at(-1)||{}).id||null;await Doc.save();enter();Kit.toast(t('Geöffnet mit')+' '+r.layers.length+' '+t('Ebenen'))}catch(e){Kit.toast(e.message)}busy(false);return}
  busy(true,'Bild wird geöffnet …');try{const cv=await Doc.loadPath(p);if(!cv)throw new Error(t('Das Bild ließ sich nicht öffnen.'));
   const pr=await api('api/new',{name:stem(p),w:cv.width,h:cv.height});newTab();await Doc.open(pr.id);Doc.d.layers.push({...Doc.defaults('pixel'),name:stem(p),cv,x:0,y:0,w:cv.width,h:cv.height,noAlpha:/\.(jpe?g|bmp)$/i.test(p)});Doc.sel=Doc.d.layers[0].id;await Doc.save();enter()}catch(e){Kit.toast(e.message)}busy(false)};
 // ---- Mehrere Bilder in Tabs ----
 U.tabs=[];U.cur=-1;
 const views=(()=>{try{return JSON.parse(localStorage.getItem('bb.views')||'{}')}catch(e){return{}}})();
 const keepView=()=>{const v=View.get();if(!v||!Doc.d)return null;views[Doc.d.id]=v;const ks=Object.keys(views);if(ks.length>60)delete views[ks[0]];try{localStorage.setItem('bb.views',JSON.stringify(views))}catch(e){}return v};
 const stash=()=>{const T=U.tabs[U.cur];if(T&&Doc.d){T.st=Doc.getState();T.view=keepView()||T.view;T.path=Paths.cur}};
 U.renderTabs=()=>{const el=$('#tabs');if(!el)return;el.innerHTML=U.tabs.map((T,i)=>{const dirty=i===U.cur?Doc.dirty:T.st&&T.st.dirty;return`<div class="tab${i===U.cur?' on':''}" data-tab="${i}" title="${esc(T.st?T.st.d.name:'')}"><span>${esc((i===U.cur?Doc.d.name:T.st.d.name)||'')}</span>${dirty?'<i class="dot"></i>':''}<button data-tabx="${i}" title="${esc(t('Schließen'))}">×</button></div>`}).join('')+`<button class="tabadd" data-tabadd title="${esc(t('Weiteres Bild öffnen'))}">+</button>`;$('#backImg').hidden=!U.tabs.length};
 U.tabTo=i=>switchTo(i);
 const switchTo=i=>{if(i===U.cur||!U.tabs[i])return;stash();U.cur=i;const T=U.tabs[i];Doc.setState(T.st);Paths.cur=T.path??-1;enter(T.view)};
 const newTab=()=>{stash();U.tabs.push({st:null});U.cur=U.tabs.length-1};
 const closeTab=async i=>{if(i!==U.cur)switchTo(i);if(!await U.askUnsaved(true))return;U.tabs.splice(i,1);U.cur=-1;if(U.tabs.length){const j=Math.min(i,U.tabs.length-1);U.cur=j;Doc.setState(U.tabs[j].st);Paths.cur=U.tabs[j].path??-1;enter(U.tabs[j].view)}else{Doc.d=null;U.start()}};
 $('#tabs').addEventListener('click',e=>{let b;if(b=e.target.closest('[data-tabx]')){e.stopPropagation();return closeTab(+b.dataset.tabx)}if(b=e.target.closest('[data-tab]'))return switchTo(+b.dataset.tab);if(e.target.closest('[data-tabadd]')){stash();U.start(true)}});
 $('#backImg').onclick=()=>{const T=U.tabs[U.cur];if(!T)return;Doc.setState(T.st);enter(T.view)};
 U.open=async id=>{const k=U.tabs.findIndex(T=>(T.st&&T.st.d.id)===id);if(k>=0){if(k===U.cur){const T=U.tabs[k];Doc.setState(T.st||Doc.getState());enter(T.view);return}return switchTo(k)}
  busy(true,'Projekt wird geladen …');try{newTab();await Doc.open(id);enter(views[id])}catch(e){U.tabs.splice(U.cur,1);U.cur=U.tabs.length-1;Kit.toast(e.message)}busy(false)};
 function enter(view){if(U.cur>=0&&U.tabs[U.cur])U.tabs[U.cur].st=Doc.getState();$('#start').hidden=true;$('#editor').hidden=false;$('#pname').value=Doc.d.name;const s=$('#saved');s.className=Doc.dirty?'saved unsaved':'saved';s.textContent=Doc.dirty?t('Nicht gespeichert'):'';
  View.fitted=false;if(!Tools.EXT[Tools.tool])Tools.set(Tools.tool==='crop'?'move':Tools.tool);else Tools.set('move');U.setMode(U.mode,view);U.renderTabs()}

 // ---- Kopfleiste und Menüs ----
 U.closeMenus=()=>document.querySelectorAll('.dd.open').forEach(d=>d.classList.remove('open'));
 $('#menus').addEventListener('click',e=>{const b=e.target.closest('.dd>button');if(!b)return;const dd=b.parentElement,was=dd.classList.contains('open');U.closeMenus();if(!was){dd.classList.add('open');menuState()}e.stopPropagation()});
 $('#menus').addEventListener('mouseover',e=>{const b=e.target.closest('.dd>button');if(!b||!document.querySelector('.dd.open'))return;U.closeMenus();b.parentElement.classList.add('open');menuState()});
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.dd'))U.closeMenus()});
 const menuState=()=>{const L=Doc.layer(),n=Doc.d?Doc.d.layers.length:0;const hs=Sel.has(),hm=!!(L&&L.mask);menuChecks();const dis={mask_apply:!hm,mask_del:!hm,mask_edit:!hm,mask_off:!hm,feather:!hs,grow:!hs,shrink:!hs,border:!hs,lautocrop:!L||L.type!=='pixel',undo:!Doc.undo.length,redo:!Doc.redo.length,dup:!L,del:!L,up:!L,down:!L,top:!L,bottom:!L,merge:!L||Doc.idx(L.id)<1,flatten:n<2,clearsel:!hs,selnone:!hs,seltolayer:!hs,croptosel:!hs,raster:!L||L.type==='pixel',lfliph:!L,lflipv:!L,paste:!clip};
  document.querySelectorAll('.ddm [data-act]').forEach(b=>b.disabled=!!dis[b.dataset.act])};
 $('#editor').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b||b.disabled)return;U.closeMenus();if(b.closest('.ddm'))Doc._label=(b.childNodes[0]&&b.childNodes[0].textContent||'').replace(' …','').trim();U.act(b.dataset.act)});
 // (Einfach-Modus entfernt)
 $('#home').onclick=()=>U.act('home');
 $('#pname').onchange=async e=>{const v=e.target.value.trim();if(!v){e.target.value=Doc.d.name;return}Doc.d.name=v;try{await api('api/rename',{ID:Doc.d.id,Name:v})}catch(x){}};
 $('#pname').onkeydown=e=>{if(e.key==='Enter')e.target.blur()};
 U.setMode=(m,view)=>{m='pro';U.mode=m;ls.set('mode',m);if(typeof Dock!=='undefined'&&Dock.ready)Dock.hide([]);$('#editor').classList.remove('simple');document.querySelectorAll('#mode [data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));
  if(m==='simple'&&!Tools.SIMPLE.includes(Tools.tool))Tools.tool='move';Tools.bar();Tools.opts();Tools.cursor();U.side();requestAnimationFrame(()=>{View.resize();if(!View.set(view))View.fit()})};
 const askNum=(title,label,def)=>new Promise(res=>{U.modal(`<div class="mhead"><h3>${esc(t(title))}</h3></div><div class="mbody"><label class="fld"><span>${esc(t(label))}</span><input type="number" id="askn" value="${def}" min="1" max="2000"></label></div><div class="mfoot"><button class="btn" data-a="no">${esc(t('Abbrechen'))}</button><button class="btn primary" data-a="ok">${esc(t('OK'))}</button></div>`);
  const i=$('#askn');i.focus();i.select();const fin=ok=>{const v=+i.value;U.close();res(ok?v:0)};i.onkeydown=e=>{if(e.key==='Enter')fin(true);e.stopPropagation()};$('#mbox').onclick=e=>{const b=e.target.closest('[data-a]');if(b)fin(b.dataset.a==='ok')}});
 const menuChecks=()=>{const on={rulers:View.rulers,grid:View.grid,guides:View.guidesOn,snap:View.snapOn};document.querySelectorAll('.ddm [data-act]').forEach(b=>{if(b.dataset.act in on)b.classList.toggle('chk',!!on[b.dataset.act])})};
 U.menuChecks=menuChecks;
 $('#mColors').innerHTML=FX.menu('Farben');$('#mFilters').innerHTML=FX.menu('Filter');
 $('#mTools').innerHTML=Tools.LIST.map(([id,n])=>`<button data-settool="${id}">${esc(t(n))}</button>`).join('');
 $('#menus').addEventListener('click',e=>{let b;if(b=e.target.closest('[data-fx]')){U.closeMenus();if(Doc.d)FX.run(b.dataset.fx)}if(b=e.target.closest('[data-settool]')){U.closeMenus();Tools.set(b.dataset.settool)}});
 U.act=async a=>{const d=Doc.d;if(!d&&!['new','home'].includes(a))return;if(typeof Extra!=='undefined')Extra.recAct(a);if(!Doc._label){const mb=document.querySelector(`#menus [data-act="${a}"]`);if(mb){const cl=mb.cloneNode(true);cl.querySelectorAll('kbd').forEach(k=>k.remove());Doc._label=cl.textContent.replace(/[…]|\.\.\./g,'').trim();setTimeout(()=>{Doc._label=''},0)}}
  switch(a){
   case'mask_white':case'mask_black':case'mask_sel':case'mask_alpha':Doc._label='Ebenenmaske hinzufügen';return Doc.addMask(a.slice(5));
   case'mask_apply':Doc._label='Maske anwenden';return Doc.applyMask();
   case'mask_del':Doc._label='Maske löschen';return Doc.delMask();
   case'mask_edit':{const L=Doc.layer();if(!L||!L.mask)return Kit.toast(t('Die Ebene hat keine Maske.'));L.editMask=!L.editMask;U.layers();return}
   case'mask_off':{const L=Doc.layer();if(!L||!L.mask)return Kit.toast(t('Die Ebene hat keine Maske.'));Doc._label='Maske aus/an';Doc.begin();L.maskOff=!L.maskOff;Doc.changed('layers');return}
   case'alpha_add':{const L=Doc.layer();if(!L||L.type!=='pixel')return;Doc._label=t('Alphakanal hinzufügen');Doc.begin();L.noAlpha=false;Doc.changed('layers');Kit.toast(t('Die Ebene hat jetzt einen Alphakanal: Der Radierer radiert zu Transparenz.'));return}
   case'alpha_rm':{const L=Doc.layer();if(!L||L.type!=='pixel')return;Doc._label=t('Alphakanal entfernen');Doc.begin();const cv=Doc.mk(L.cv.width,L.cv.height),c=cv.getContext('2d');c.fillStyle=Tools.color2;c.fillRect(0,0,cv.width,cv.height);c.drawImage(L.cv,0,0);L.cv=cv;L.rev=(L.rev||0)+1;L.noAlpha=true;Doc.changed('layers');return}
   case'alphalock':{const L=Doc.layer();if(!L)return;Doc._label='Alphakanal sperren';Doc.begin();L.alphaLock=!L.alphaLock;Doc.changed('layers');Kit.toast(t(L.alphaLock?'Alphakanal gesperrt: Malen nur auf vorhandenen Pixeln.':'Alphakanal entsperrt.'));return}
   case'l2img':Doc._label='Ebene auf Bildgröße';return Doc.layerToImage();
   case'lautocrop':Doc._label='Ebene automatisch zuschneiden';return Doc.autocropLayer();
   case'imgautocrop':Doc._label='Bild automatisch zuschneiden';Doc.autocropImage();return View.fit();
   case'visible':Doc._label='Sichtbares als neue Ebene';return Doc.visibleToLayer();
   case'feather':case'grow':case'shrink':case'border':{if(!Sel.has())return Kit.toast(t('Es ist nichts ausgewählt.'));const n=await askNum({feather:'Auswahl ausblenden',grow:'Auswahl vergrößern',shrink:'Auswahl verkleinern',border:'Auswahl-Rand'}[a],{feather:'Weiche Kante (px)',grow:'Um (px)',shrink:'Um (px)',border:'Breite (px)'}[a],a==='feather'?10:5);if(n>0)Sel[a](n);return}
   case'alpha2sel':return Sel.fromAlpha();
   case'rulers':View.rulers=!View.rulers;View.draw();return menuChecks();
   case'grid':View.grid=!View.grid;View.draw();return menuChecks();
   case'gridsize':{const n=await askNum('Rastergröße','Abstand (px)',View.gridSize);if(n>0){View.gridSize=n;View.grid=true;View.draw();menuChecks()}return}
   case'guides':View.guidesOn=!View.guidesOn;View.draw();return menuChecks();
   case'snap':View.snapOn=!View.snapOn;return menuChecks();
   case'guidesclear':View.guides().length=0;Doc.mark(true);View.draw();return;
   case'guidecenter':View.guides().push({o:'v',p:Math.round(d.w/2)},{o:'h',p:Math.round(d.h/2)});View.guidesOn=true;Doc.mark(true);View.draw();return menuChecks();
   case'journal':U.setMode('pro');U.ptab='journal';U.side();return;
   case'selsave':{if(!Sel.has())return Kit.toast(t('Es ist nichts ausgewählt.'));d.chans=d.chans||[];d.chans.push({id:Doc.uid(),name:t('Auswahl')+' '+(d.chans.length+1),cv:Doc.clone(Sel.mask)});Doc.mark(true);U.setMode('pro');U.ptab='chan';U.side();return}
   case'group':Doc._label='Neue Ebenengruppe';return Doc.addGroup();
   case'ungroup':Doc._label='Gruppe auflösen';return Doc.ungroup();
   case'print':return Exp.print(Doc.renderAt(d.w,d.h));
   case'dupimg':return dupImage();
   case'macrorec':Extra.start();U.setMode('pro');U.ptab='journal';return U.side();
   case'macrostop':return Extra.stop();
   case'tipsel':return Extra.tipFromSel();
   case'patsel':return Extra.patFromSel();
   case'fillpat':{const pc=Extra.pat(Tools.o.fill.pat||'checker');const had=Sel.has();if(!had)Sel.all();const L=Doc.layer();if(!L)return;Doc._label='Mit Muster füllen';Doc.begin();const T2=L.type==='pixel'?L:Doc.rasterize(L);const W2=T2.cv.width,H2=T2.cv.height,pt=Doc.mk(W2,H2),c2=pt.getContext('2d');c2.setTransform(Doc.pixMatrix(T2).inverse());c2.fillStyle=c2.createPattern(pc,'repeat');c2.fillRect(-1e5,-1e5,2e5,2e5);const res=Doc.clone(T2.cv);res.getContext('2d').drawImage(pt,0,0);T2.cv=Sel.merge(T2,T2.cv,res);if(!had)Sel.mask=null;Doc.changed('layers');return}
   case'copy':return U.copy();
   case'cut':if(Sel.has()){U.copy();Sel.clear()}else{U.copy();Doc.del()}return;
   case'paste':return U.paste();
   case'clearsel':if(Sel.has())Sel.clear();else Kit.toast(t('Es ist nichts ausgewählt.'));return;
   case'fillfg':case'fillbg':{const c=a==='fillfg'?Tools.color:Tools.color2;if(Sel.has())Sel.fill(c);else{Sel.all();Sel.fill(c);Sel.none()}return}
   case'selall':return Sel.all();
   case'selnone':return Sel.none();
   case'selinv':return Sel.invert();
   case'seltolayer':{const c=Sel.copy();if(!c)return Kit.toast(t('Es ist nichts ausgewählt.'));Doc.addPixel(c.cv,c.name+' '+t('Ausschnitt'),{x:c.x,y:c.y,w:c.cv.width,h:c.cv.height});return}
   case'croptosel':return Sel.cropTo();
   case'top':case'bottom':{const L=Doc.layer();if(!L)return;const i=Doc.idx(L.id);Doc.reorder(i,a==='top'?d.layers.length-1:0);return}
   case'raster':{const L=Doc.layer();if(!L||L.type==='pixel')return;Doc.begin();Doc.rasterize(L);Doc.changed('layers');return}
   case'lfliph':case'lflipv':{const L=Doc.layer();if(!L)return;Doc.begin();if(a==='lfliph')L.fx=!L.fx;else L.fy=!L.fy;Doc.changed('canvas');return}
   case'home':case'new':stash();return U.start();
   case'save':return U.save();
   case'export':return U.exportDlg();
   case'addimg':{const ps=await Kit.pick('files',IMGF);return addPaths(ps)}
   case'undo':Doc.doUndo();return;
   case'redo':Doc.doRedo();return;
   case'dup':Doc.dup();return;
   case'del':Doc.del();return;
   case'up':Doc.move(1);return;
   case'down':Doc.move(-1);return;
   case'merge':Doc.merge();return;
   case'flatten':Doc.flatten();return;
   case'newlayer':return newLayerDlg();
   case'newlayerq':Doc.addEmpty();return;
   case'text':Doc.addText({text:t('Dein Text')});setTimeout(()=>U.focusText(true),30);return;
   case'rotl':Doc.rotate90(-1);return;
   case'rotr':Doc.rotate90(1);return;
   case'fliph':Doc.flip('h');return;
   case'flipv':Doc.flip('v');return;
   case'crop':Tools.set('crop');return;
   case'resize':return resizeDlg();
   case'canvas':return canvasDlg();
   case'fit':return View.fit();
   case'z100':return View.zoomAt(1);
   case'zin':return View.zoomAt(View.z*1.25);
   case'zout':return View.zoomAt(View.z/1.25);
   case'keys':return Keys.editor();
   case'layout':return Dock.reset();
   default:if(typeof AI!=='undefined'&&AI.ACTS[a])return AI.ACTS[a]();
  }};
 const addPaths=async ps=>{ps=(ps||[]).filter(isImg);if(!ps.length)return;busy(true,'Bild wird eingefügt …');for(const p of ps){if(Import.isDoc(p)){try{const r=await Import.load(p);Doc._label=t('Datei einfügen');Doc.begin();for(const L of toLayers(r))Doc.d.layers.push(L);Doc.sel=Doc.d.layers.at(-1).id;Doc.changed('layers')}catch(e){Kit.toast(e.message)}continue}const cv=await Doc.loadPath(p);if(cv)Doc.addImage(cv,stem(p));else Kit.toast(t('Das Bild ließ sich nicht öffnen.')+' '+Kit.base(p))}busy(false);Tools.set('move')};

 // ---- Speichern und Nachfragen ----
 let saving=null;
 U.save=async()=>{if(!Doc.d)return;if(saving)return saving;const s=$('#saved');s.className='saved';s.textContent=t('Speichert …');
  saving=(async()=>{try{await Doc.save();s.className='saved justsaved';s.textContent=t('Gespeichert');U.renderTabs();setTimeout(()=>{if(!Doc.dirty&&s.classList.contains('justsaved')){s.className='saved';s.textContent=''}},2500);return true}
   catch(e){Kit.toast(e.message||t('Speichern fehlgeschlagen.'));Doc.mark(true);throw e}finally{saving=null}})();return saving};
 U.askUnsaved=leave=>new Promise(res=>{if(!Doc.d||!Doc.dirty)return res(true);
  U.modal(`<div class="unsaved-dlg"><div class="ud-ico"><svg viewBox="0 0 24 24"><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18v.5"/></svg></div>
   <h2>${esc(t(leave?'Bild verlassen, ohne zu speichern?':'Tool schließen, ohne zu speichern?'))}</h2>
   <p>${esc(t('Du hast seit dem letzten Speichern Änderungen gemacht an'))} <b>${esc(Doc.d.name)}</b>. ${esc(t('Ohne Speichern gehen sie verloren.'))}</p>
   <div class="ud-btns"><button class="btn primary" data-ud="save">${esc(t('Speichern'))}</button><button class="btn danger" data-ud="discard">${esc(t('Nicht speichern'))}</button><button class="btn" data-ud="cancel">${esc(t('Abbrechen'))}</button></div></div>`);U.locked=true;
  $('#mbox').onclick=async e=>{const b=e.target.closest('[data-ud]');if(!b)return;const a=b.dataset.ud;
   if(a==='cancel'){U.close();return res(false)}
   if(a==='save'){b.disabled=true;try{await U.save()}catch(x){b.disabled=false;return}U.close();return res(true)}
   Doc.mark(false);fetch('api/dirty?id='+Doc.d.id,{method:'POST'}).catch(()=>{});U.close();res(true)}});
 let quitting=false;
 Kit._closeAsk=async()=>{stash();for(let i=0;i<U.tabs.length;i++){const T=U.tabs[i];if(!(T.st&&T.st.dirty))continue;switchTo(i);if(!await U.askUnsaved(false))return;stash()}quitting=true;api('kit/quit',{})};
 addEventListener('beforeunload',e=>{if((Doc.dirty||U.tabs.some(T=>T.st&&T.st.dirty))&&!quitting){e.preventDefault();e.returnValue=''}});
addEventListener('pagehide',()=>{try{keepView()}catch(e){}});

 // ---- Seitenleiste ----
 const sec=(id,title,body,extra='')=>`<div class="sec${closed.has(id)?' closed':''}" data-sec="${id}"><h3>${esc(t(title))}${extra}</h3><div class="sb">${body}</div></div>`;
 const ADJ=[['exposure','Belichtung',-100,100],['brightness','Helligkeit',-100,100],['contrast','Kontrast',-100,100],['saturation','Sättigung',-100,100],['warmth','Wärme',-100,100],['tint','Tönung',-100,100],['fade','Verblassen',0,100],['vignette','Vignette',0,100],['sharpen','Schärfe',0,100],['blur','Weichzeichnen',0,100]];
 const PRESETS=[['','Original',{}],['vivid','Kräftig',{contrast:18,saturation:35,vignette:15}],['pop','Pop',{saturation:60,contrast:25,brightness:5,sharpen:25}],['gaming','Gaming',{saturation:45,contrast:30,tint:12,vignette:30,sharpen:35}],
  ['warm','Warm',{warmth:30,saturation:10}],['cool','Kühl',{warmth:-30,tint:-5}],['sun','Sonnig',{exposure:12,warmth:18,brightness:6}],['night','Nacht',{exposure:-25,warmth:-35,saturation:-20,vignette:40}],
  ['drama','Drama',{contrast:40,exposure:-8,saturation:-15,vignette:45,sharpen:30}],['vintage','Vintage',{warmth:22,fade:30,contrast:-12,saturation:-25,vignette:35}],['matte','Matt',{fade:40,contrast:-15}],['bw','Schwarzweiß',{saturation:-100,contrast:15}]];
 const adjHTML=()=>{const a=Doc.d.adjust;return ADJ.map(([k,n,mi,ma])=>`<div class="row"><span>${esc(t(n))}</span><input type="range" min="${mi}" max="${ma}" value="${a[k]||0}" data-a="${k}"><span class="v" data-av="${k}">${a[k]||0}</span></div>`).join('')};
 const filterHTML=()=>`<div class="presetsf">${PRESETS.map(([k,n])=>`<button class="pf${(Doc.d.adjust.preset||'')===k?' on':''}" data-preset="${k}"><canvas width="120" height="90" data-pfc="${k}"></canvas>${esc(t(n))}</button>`).join('')}</div>`;
 const ratiosHTML=()=>`<div class="ratios">${Tools.RATIOS.filter(r=>r[0]!=='3').map(([k,n])=>`<button class="btn" data-cropr="${k}">${esc(t(n))}</button>`).join('')}</div>`;
 const rotHTML=()=>`<div class="btns"><button class="btn" data-act="rotl" title="${esc(t('90° nach links drehen'))}">⟲ 90°</button><button class="btn" data-act="rotr" title="${esc(t('90° nach rechts drehen'))}">⟳ 90°</button><button class="btn" data-act="fliph" title="${esc(t('Horizontal spiegeln'))}">⇋</button><button class="btn" data-act="flipv" title="${esc(t('Vertikal spiegeln'))}">⇵</button></div>`;
 const partsHTML=()=>{const tl=Tools.tool;const b=(k,ic,n)=>`<button class="btn${tl===k?' on':''}" data-stool="${k}">${ic} ${esc(t(n))}</button>`;
  return`<div class="btns">${b('rsel','▭','Rechteck')}${b('lasso','✎','Frei zeichnen')}</div><div class="btns">${b('wand','✦','Zauberstab')}<button class="btn" data-act="ai_lift">✂ ${esc(t('Motiv (KI)'))}</button></div><label class="chk" style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" data-liftfill ${Tools.o.liftFill!==false?'checked':''}> ${esc(t('Lücke automatisch füllen'))}</label>${tl!=='move'?`<div class="btns"><button class="btn" data-stool="move">✥ ${esc(t('Fertig, zurück zum Verschieben'))}</button></div>`:''}<p class="hint2">${esc(t('Markiere einen Teil des Bildes und ziehe ihn an eine andere Stelle. Er wird dabei zu einer eigenen Ebene. Mit gedrückter Alt-Taste ziehst du eine Kopie.'))}</p>`};
 const addHTML=()=>`<div class="btns"><button class="btn" data-act="text">${Tools.icon('<path d="M5 5h14M12 5v14M9 19h6"/>')}${esc(t('Text'))}</button><button class="btn" data-addshape="rect">▭ ${esc(t('Rechteck'))}</button></div><div class="btns"><button class="btn" data-addshape="ellipse">◯ ${esc(t('Kreis'))}</button><button class="btn" data-addshape="arrow">➜ ${esc(t('Pfeil'))}</button></div><div class="btns"><button class="btn" data-act="addimg">${Tools.icon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>')}${esc(t('Bild einfügen'))}</button></div>`;
 U.ptab=ls.get('ptab','props');
 const BR=[[3,100],[8,100],[16,100],[32,100],[64,100],[128,100],[8,50],[16,50],[32,50],[64,50],[128,50],[256,50],[16,0],[32,0],[64,0],[128,0],[256,0],[480,0]];
 const brushesHTML=()=>{const pt=Tools.PAINT.includes(Tools.tool)?Tools.tool:'brush';const o=Tools.o[pt];return`<div class="sb" style="padding-top:12px"><div class="brushes">${BR.map(([z,h])=>`<button class="brp${o.size===z&&o.hard===h?' on':''}" data-br="${z},${h}" title="${z} px · ${esc(t('Härte'))} ${h} %"><canvas width="56" height="56" data-brc="${z},${h}"></canvas><small>${z}</small></button>`).join('')}</div><div class="sub">${esc(t('Eigene Pinselspitzen'))}</div><div class="brushes">${Extra.tips.map(tp=>`<button class="brp${o.tip===tp.id?' on':''}" data-tip="${tp.id}"><canvas width="56" height="56" data-tipc="${tp.id}"></canvas><small data-tipdel="${tp.id}" title="${esc(t('Löschen'))}">×</small></button>`).join('')}</div><button class="btn sm" data-act="tipsel" style="margin-top:6px">${esc(t('Pinselspitze aus Auswahl'))}</button><p class="hint2">${esc(t('Gilt für das gewählte Malwerkzeug:'))} <b>${esc(t(Tools.name(pt)))}</b></p></div>`};
 const tipThumbs=()=>document.querySelectorAll('[data-tipc]').forEach(c=>{const tc=Extra.tip(c.dataset.tipc);if(!tc)return;const x=c.getContext('2d'),k=Math.min(48/tc.width,48/tc.height);x.clearRect(0,0,56,56);const t2=Doc.mk(tc.width,tc.height),tx=t2.getContext('2d');tx.drawImage(tc,0,0);tx.globalCompositeOperation='source-in';tx.fillStyle=getComputedStyle(document.body).color;tx.fillRect(0,0,t2.width,t2.height);x.drawImage(t2,(56-tc.width*k)/2,(56-tc.height*k)/2,tc.width*k,tc.height*k)});
 const drawBrushes=()=>document.querySelectorAll('[data-brc]').forEach(c=>{const [z,h]=c.dataset.brc.split(',').map(Number);const x=c.getContext('2d');x.clearRect(0,0,56,56);const r=Math.max(1.5,Math.min(25,z/5+1));const col=getComputedStyle(document.body).color;const g=x.createRadialGradient(28,28,r*Math.min(.99,h/100),28,28,r);g.addColorStop(0,col);g.addColorStop(1,'transparent');x.fillStyle=h>=100?col:g;x.beginPath();x.arc(28,28,r,0,7);x.fill()});
 U.side=()=>{if(!Doc.d)return;const side=$('#side');
  const resetBtn=`<button class="reset" data-adjreset>${esc(t('Zurücksetzen'))}</button>`;
  {const tabs=[['props','Eigenschaften'],['brushes','Pinsel'],['adjust','Anpassen'],['filter','Filter'],['chan','Kanäle'],['nav','Navigator'],['journal','Journal']];
   side.innerHTML=`<div class="ptabs">${tabs.map(([k,n])=>`<button data-ptab="${k}" class="${U.ptab===k?'on':''}">${esc(t(n))}</button>`).join('')}</div><div class="scroll" id="ptab">${
    U.ptab==='journal'?`<div class="journal" id="journal"></div>${Extra.macroHTML()}`:U.ptab==='chan'?chanHTML():U.ptab==='nav'?Extra.navHTML():U.ptab==='brushes'?brushesHTML():U.ptab==='adjust'?`<div class="sb" style="padding-top:12px">${adjHTML()}<button class="btn sm" data-adjreset>${esc(t('Alles zurücksetzen'))}</button><p class="hint2">${esc(t('Wirkt auf das ganze Bild und lässt die Ebenen unverändert.'))}</p></div>`:U.ptab==='filter'?`<div class="sb" style="padding-top:12px">${filterHTML()}<p class="hint2">${esc(t('Für Filter auf einzelne Ebenen: Menü Filter und Farben.'))}</p></div>`:'<div id="propsBox"></div>'}</div>
   <div class="lpanel"><div class="lhead"><span>${esc(t('Ebenen'))}</span></div><div class="lmode" id="lmode"></div><div id="layersBox" class="lbox"></div><div class="lbar">
   <button class="ib" data-act="newlayer" title="${esc(t('Neue Ebene'))}">${Tools.icon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>')}</button>
   <button class="ib" data-act="addimg" title="${esc(t('Bild einfügen'))}">${Tools.icon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>')}</button>
   <button class="ib" data-act="text" title="${esc(t('Text hinzufügen'))}">${Tools.icon('<path d="M5 5h14M12 5v14M9 19h6"/>')}</button>
   <span class="grow"></span>
   <button class="ib" data-act="up" title="${esc(t('Nach oben'))}">${Tools.icon('<path d="M12 19V5M6 11l6-6 6 6"/>')}</button>
   <button class="ib" data-act="down" title="${esc(t('Nach unten'))}">${Tools.icon('<path d="M12 5v14M6 13l6 6 6-6"/>')}</button>
   <button class="ib" data-act="dup" title="${esc(t('Duplizieren'))}">${Tools.icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>')}</button>
   <button class="ib" data-act="merge" title="${esc(t('Mit darunter zusammenfügen'))}">${Tools.icon('<path d="M12 3v12M7 10l5 5 5-5M5 20h14"/>')}</button>
   <button class="ib" data-act="del" title="${esc(t('Löschen'))}">${Tools.icon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')}</button></div></div>`}
  U.layers();U.props();previews();drawBrushes();U.journal();chanThumbs();Extra.nav();tipThumbs()};
 // Kanäle: Farbkanäle ein-/ausblenden (nur Ansicht), Kanal als Auswahl, gespeicherte Auswahlen
 const chanHTML=()=>{const C=View.chan,d=Doc.d;const row=(k,n)=>`<div class="chrow"><button class="ib eye${C[k]?'':' off'}" data-chv="${k}">${Tools.icon(C[k]?'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>':'<path d="M3 3l18 18"/>')}</button><canvas width="66" height="44" data-chth="${k}"></canvas><span>${esc(t(n))}</span><button class="btn sm" data-ch2sel="${k}" title="${esc(t('Kanal als Auswahl'))}">${esc(t('Auswahl'))}</button></div>`;
  return`<div class="sb" style="padding-top:12px"><div class="sub" style="margin-top:0">${esc(t('Farbkanäle'))}</div>${row('r','Rot')}${row('g','Grün')}${row('b','Blau')}${row('a','Alpha')}
   <div class="sub">${esc(t('Gespeicherte Auswahlen'))}</div>${(d.chans||[]).map(c=>`<div class="chrow"><canvas width="66" height="44" data-chs="${c.id}"></canvas><span class="grow" data-chren="${c.id}">${esc(c.name)}</span><button class="btn sm" data-chload="${c.id}" title="${esc(t('Klick = laden, Umschalt = hinzufügen, Alt = abziehen'))}">${esc(t('Laden'))}</button><button class="ib" data-chdel="${c.id}" title="${esc(t('Löschen'))}">×</button></div>`).join('')||`<p class="hint2">${esc(t('Noch keine gespeicherte Auswahl.'))}</p>`}
   <div class="btns" style="margin-top:8px"><button class="btn sm" data-act="selsave">${esc(t('Auswahl speichern'))}</button></div></div>`};
 const chanThumbs=()=>{const d=Doc.d;if(!d)return;const out=Doc.need?Doc.render():Doc.out;document.querySelectorAll('[data-chth]').forEach(c=>{const k=c.dataset.chth,x=c.getContext('2d');const s2=Doc.mk(c.width,c.height),sc=s2.getContext('2d');const f=Math.min(c.width/d.w,c.height/d.h);sc.drawImage(out,(c.width-d.w*f)/2,(c.height-d.h*f)/2,d.w*f,d.h*f);
   const id=sc.getImageData(0,0,c.width,c.height),p=id.data,o={r:0,g:1,b:2,a:3}[k];for(let i=0;i<p.length;i+=4){const v=p[i+o];p[i]=p[i+1]=p[i+2]=v;p[i+3]=255}x.putImageData(id,0,0)});
  document.querySelectorAll('[data-chs]').forEach(c=>{const C=(d.chans||[]).find(x=>x.id===c.dataset.chs);if(!C)return;const x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,c.width,c.height);const a=Doc.mk(C.cv.width,C.cv.height),ac=a.getContext('2d');ac.fillStyle='#000';ac.fillRect(0,0,a.width,a.height);ac.drawImage(C.cv,0,0);const f=Math.min(c.width/d.w,c.height/d.h);x.drawImage(a,(c.width-d.w*f)/2,(c.height-d.h*f)/2,d.w*f,d.h*f)})};
 const chanToSel=k=>{const d=Doc.d,out=Doc.need?Doc.render():Doc.out;const m=Doc.mk(d.w,d.h),mc=m.getContext('2d');const id=out.getContext('2d').getImageData(0,0,d.w,d.h),p=id.data,o={r:0,g:1,b:2,a:3}[k];for(let i=0;i<p.length;i+=4){const v=p[i+o];p[i]=p[i+1]=p[i+2]=255;p[i+3]=k==='a'?v:v*p[i+3]/255}mc.putImageData(id,0,0);Doc._label=t('Kanal als Auswahl');Sel.combine(m)};
 U.journal=()=>{const j=$('#journal');if(!j||!Doc.d)return;const u=Doc.undo,r=Doc.redo;
  j.innerHTML=[`<button data-jump="0" class="${u.length===0?'on':''}">${esc(t('Geöffnet'))}</button>`,...u.map((x,i)=>`<button data-jump="${i+1}" class="${i+1===u.length?'on':''}">${esc(t(x.label||'Bearbeitung'))}</button>`),...[...r].reverse().map((x,i)=>`<button data-jump="${u.length+i+1}" class="fut">${esc(t(x.label||'Bearbeitung'))}</button>`)].join('');const on=j.querySelector('.on');if(on)on.scrollIntoView({block:'nearest'})};

 // Ebenenliste (oben = vorne)
 U.layers=()=>{const box=$('#layersBox');if(!box||!Doc.d)return;const a=Doc.d.layers;
  const kind=L=>L.type==='text'?'T':L.type==='shape'?'◆':L.type==='group'?'▤':'';
  const gOpen=id=>{const L0=a.find(x=>x.id===id);if(!L0)return true;return L0.open!==false&&Doc.ancestors(L0).every(g=>g.open!==false)};
  box.innerHTML=`<div class="layers">${a.map((L,i)=>({L,i})).reverse().filter(({L})=>!L.parent||gOpen(L.parent)).map(({L,i})=>`<div class="lyr${L.id===Doc.sel?' on':''}${L.parent?' child':''}${L.type==='group'?' grp':''}" style="padding-left:${6+Doc.depth(L)*18}px" data-lid="${L.id}" data-i="${i}" draggable="true">${L.type==='group'?`<button class="ib gtog" data-gtog="${L.id}">${L.open===false?'▸':'▾'}</button>`:''}<button class="ib eye${L.visible?'':' off'}" data-eye="${L.id}" title="${esc(t('Ein-/Ausblenden'))}">${Tools.icon(L.visible?'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>':'<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/>')}</button><canvas width="88" height="60" data-lth="${L.id}" class="${L.mask&&!L.editMask?'act':''}" title="${esc(t('Ebene bearbeiten'))}"></canvas>${L.mask?`<canvas width="88" height="60" data-lmk="${L.id}" class="mk${L.editMask?' act':''}${L.maskOff?' off':''}" title="${esc(t('Maske bearbeiten (Klick) · Strg+Klick: Maske aus/an'))}"></canvas>`:''}${L.alphaLock?`<span class="kind" title="${esc(t('Alphakanal gesperrt'))}">α</span>`:''}<span class="ln">${esc(L.name)}</span><span class="kind">${kind(L)}</span><button class="ib eye${L.locked?'':' off'}" data-lock="${L.id}" title="${esc(t(L.locked?'Gesperrt: im Bild nicht anklickbar (klicken zum Entsperren)':'Sperren'))}">${Tools.icon(L.locked?'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>':'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>')}</button></div>`).join('')}</div>`||'';
  const lm=$('#lmode'),L=Doc.layer();if(lm)lm.innerHTML=L?`<select data-p="blend" title="${esc(t('Mischmodus'))}">${Doc.BLENDS.map(([k,n])=>`<option value="${k}"${L.blend===k?' selected':''}>${esc(t(n))}</option>`).join('')}</select><label title="${esc(t('Deckkraft'))}"><input type="range" min="0" max="100" value="${Math.round(L.opacity*100)}" data-p="opacity" data-div="100"><span class="v" data-pv="opacity">${Math.round(L.opacity*100)} %</span></label>`:'';
  U.thumbsNow()};
 U.thumbsNow=()=>{if(!Doc.d)return;const d=Doc.d;document.querySelectorAll('[data-lth]').forEach(c=>{const L=Doc.layer(c.dataset.lth);if(!L)return;const x=c.getContext('2d');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,c.width,c.height);const k=Math.min(c.width/d.w,c.height/d.h);x.translate((c.width-d.w*k)/2,(c.height-d.h*k)/2);x.scale(k,k);Doc.drawLayer(x,L,k,true)});mthumbs()};
 const mthumbs=()=>document.querySelectorAll('[data-lmk]').forEach(c=>{const L=Doc.layer(c.dataset.lmk);if(!L||!L.mask)return;const x=c.getContext('2d');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,c.width,c.height);const k=Math.min(c.width/L.mask.width,c.height/L.mask.height);x.drawImage(L.mask,(c.width-L.mask.width*k)/2,(c.height-L.mask.height*k)/2,L.mask.width*k,L.mask.height*k)});
 let thT=0;U.thumbs=()=>{clearTimeout(thT);thT=setTimeout(U.thumbsNow,250)};
 const side=$('#side');
 // ---- Rechtsklick auf eine Ebene: Menü wie in GIMP ----
 const lmenu=(x,y)=>{const L=Doc.layer();if(!L)return;const n=Doc.d.layers.length,hm=!!L.mask,hs=Sel.has(),px=L.type==='pixel';
  const I=(act,label,dis,chk)=>`<button data-lact="${act}"${dis?' disabled':''}${chk?' class="chk"':''}><span>${esc(t(label))}</span></button>`;
  const html=I('lprops','Ebeneneigenschaften …')+'<hr>'+I('newlayer','Neue Ebene …')+I('visible','Neu aus Sichtbarem')+I('group','Neue Ebenengruppe')+I('dup','Ebene duplizieren')+I('merge','Nach unten vereinen',Doc.idx(L.id)<1)+I('del','Ebene löschen')+'<hr>'+
   I('up','Ebene anheben',Doc.idx(L.id)>=n-1)+I('down','Ebene absenken',Doc.idx(L.id)<1)+'<hr>'+
   I('l2img','Ebene auf Bildgröße')+I('lscale','Ebene skalieren …')+I('lautocrop','Ebene automatisch zuschneiden',!px)+I('lfliph','Ebene horizontal spiegeln')+I('lflipv','Ebene vertikal spiegeln')+'<hr>'+
   I('mask_white','Ebenenmaske hinzufügen (weiß)',hm)+I('mask_black','Ebenenmaske hinzufügen (schwarz)',hm)+I('mask_sel','Ebenenmaske aus Auswahl',hm||!hs)+I('mask_alpha','Ebenenmaske aus Alphakanal',hm)+I('mask_apply','Ebenenmaske anwenden',!hm)+I('mask_del','Ebenenmaske löschen',!hm)+
   I('mask_edit','Ebenenmaske bearbeiten',!hm,hm&&L.editMask)+I('mask_off','Ebenenmaske deaktivieren',!hm,hm&&L.maskOff)+I('mask2sel','Auswahl aus Maske',!hm)+'<hr>'+
   (L.type==='pixel'?(L.noAlpha?I('alpha_add','Alphakanal hinzufügen'):I('alpha_rm','Alphakanal entfernen')):'')+I('alphalock','Alphakanal sperren',false,!!L.alphaLock)+I('alpha2sel','Auswahl aus Alphakanal')+I('raster','In Pixel umwandeln',px)+'<hr>'+I('flatten','Bild zusammenfügen',n<2);
  if(typeof Tools!=='undefined'&&Tools.popClose)Tools.popClose();const p=document.createElement('div');p.className='tpop lpop';p.innerHTML=html;document.body.appendChild(p);
  const r=p.getBoundingClientRect();p.style.left=Math.max(6,Math.min(x,innerWidth-r.width-6))+'px';p.style.top=Math.max(6,Math.min(y,innerHeight-r.height-6))+'px';
  const close=()=>{p.remove();document.removeEventListener('pointerdown',out,true);document.removeEventListener('keydown',esck,true)};
  const out=e=>{if(!p.contains(e.target))close()},esck=e=>{if(e.key==='Escape'){e.stopPropagation();close()}};
  setTimeout(()=>{document.addEventListener('pointerdown',out,true);document.addEventListener('keydown',esck,true)});
  p.onclick=e=>{const b=e.target.closest('[data-lact]');if(!b||b.disabled)return;close();const a=b.dataset.lact;Doc._label=b.textContent.replace(' …','').trim();
   if(a==='lprops'){U.ptab='props';ls.set('ptab','props');Doc._label='';return U.side()}
   if(a==='lscale'){Doc._label='';return Tools.set('scale')}
   if(a==='mask2sel'){const m=L.mask,c=Doc.mk(m.width,m.height),x=c.getContext('2d');x.drawImage(m,0,0);const id=x.getImageData(0,0,c.width,c.height),q=id.data;for(let i=0;i<q.length;i+=4){q[i+3]=Math.round(q[i]*q[i+3]/255);q[i]=q[i+1]=q[i+2]=0}x.putImageData(id,0,0);
    const full=Doc.mk(Doc.d.w,Doc.d.h);full.getContext('2d').drawImage(c,L.x||0,L.y||0,L.w||c.width,L.h||c.height);return Sel.combine(full,'replace')}
   U.act(a)}};
 side.addEventListener('wheel',e=>{const tb=e.target.closest('.ptabs');if(tb&&Math.abs(e.deltaY)>Math.abs(e.deltaX)){tb.scrollLeft+=e.deltaY;e.preventDefault()}},{passive:false});
 side.addEventListener('contextmenu',e=>{const row=e.target.closest('[data-lid]');if(!row)return;e.preventDefault();if(Doc.sel!==row.dataset.lid){Doc.sel=row.dataset.lid;Doc.baseExplicit=true;U.layers();U.props();View.draw()}lmenu(e.clientX,e.clientY)});
 side.addEventListener('click',e=>{let b;
  if(b=e.target.closest('.sec>h3')){if(e.target.closest('button'))return;const s=b.parentElement,id=s.dataset.sec;if(!id||id==='layers')return;s.classList.toggle('closed');s.classList.contains('closed')?closed.add(id):closed.delete(id);ls.set('closed',[...closed]);if(!s.classList.contains('closed'))previews();return}
  if(b=e.target.closest('[data-chv]')){const k=b.dataset.chv;View.chan[k]=!View.chan[k];View.draw();U.side();return}
  if(b=e.target.closest('[data-ch2sel]'))return chanToSel(b.dataset.ch2sel);
  if(b=e.target.closest('[data-chload]')){const C=Doc.d.chans.find(x=>x.id===b.dataset.chload);if(C){Doc._label=t('Auswahl laden');Sel.combine(Doc.clone(C.cv),e.shiftKey?'add':e.altKey||e.ctrlKey?'sub':'replace')}return}
  if(b=e.target.closest('[data-chdel]')){Doc.d.chans=Doc.d.chans.filter(x=>x.id!==b.dataset.chdel);Doc.mark(true);U.side();return}
  if(b=e.target.closest('[data-sfxon]')){const L=Doc.layer();Doc._label='Smart-Filter an/aus';Doc.begin();const f=L.sfx[+b.dataset.sfxon];f.on=f.on===false;Doc.changed('canvas');U.props();return}
  if(b=e.target.closest('[data-sfxedit]')){const L=Doc.layer(),i=+b.dataset.sfxedit;return FX.run(L.sfx[i].id,{smart:true,edit:i})}
  if(b=e.target.closest('[data-sfxdel]')){const L=Doc.layer();Doc._label='Smart-Filter löschen';Doc.begin();L.sfx.splice(+b.dataset.sfxdel,1);Doc.changed('canvas');U.props();return}
  if(b=e.target.closest('[data-mplay]'))return Extra.play(+b.dataset.mplay);
  if(b=e.target.closest('[data-mdel]'))return Extra.del(+b.dataset.mdel);
  if(b=e.target.closest('[data-jump]')){Doc.jump(+b.dataset.jump);U.journal();return}
  if(b=e.target.closest('[data-ptab]')){U.ptab=b.dataset.ptab;ls.set('ptab',U.ptab);U.side();return}
  if(b=e.target.closest('[data-tipdel]')){e.stopPropagation();Extra.delTip(b.dataset.tipdel);return}
  if(b=e.target.closest('[data-tip]')){const pt=Tools.PAINT.includes(Tools.tool)?Tools.tool:'brush';Tools.o[pt].tip=b.dataset.tip;if(Tools.tool!==pt)Tools.set(pt);else Tools.opts();U.side();return}
  if(b=e.target.closest('[data-br]')){const [z,h]=b.dataset.br.split(',').map(Number);const pt=Tools.PAINT.includes(Tools.tool)?Tools.tool:'brush';Tools.o[pt].size=z;Tools.o[pt].hard=h;delete Tools.o[pt].tip;if(Tools.tool!==pt)Tools.set(pt);else Tools.opts();U.side();return}
  if(b=e.target.closest('[data-lock]')){const L=Doc.layer(b.dataset.lock);Doc.begin();L.locked=!L.locked;Doc.changed('layers');return}
  if(b=e.target.closest('[data-eye]')){const L=Doc.layer(b.dataset.eye);Doc.begin();L.visible=!L.visible;Doc.changed('layers');return}
  if(b=e.target.closest('[data-gtog]')){const g=Doc.layer(b.dataset.gtog);g.open=g.open===false;U.layers();return}
  if(b=e.target.closest('[data-lmk]')){const L=Doc.layer(b.dataset.lmk);Doc.sel=L.id;if(e.ctrlKey||e.metaKey){Doc._label='Maske aus/an';Doc.begin();L.maskOff=!L.maskOff;Doc.changed('layers')}else{L.editMask=true;U.layers();U.props();Kit.toast(t('Du bearbeitest jetzt die Maske: Schwarz versteckt, Weiß zeigt.'))}return}
  if(b=e.target.closest('[data-lth]')){const L=Doc.layer(b.dataset.lth);if(L&&L.editMask){L.editMask=false;Doc.sel=L.id;U.layers();U.props();return}}
  if(b=e.target.closest('[data-lid]')){if(e.target.closest('input'))return;Doc.sel=b.dataset.lid;Doc.baseExplicit=true;U.layers();U.props();View.draw();return}
  if(b=e.target.closest('[data-preset]'))return applyPreset(b.dataset.preset);
  if(e.target.closest('[data-adjreset]')){Doc.begin();Doc.d.adjust={...Doc.ADJ0};Doc.changed('canvas');U.side();return}
  if(b=e.target.closest('[data-cropr]'))return Tools.cropRatio(b.dataset.cropr);
  if(b=e.target.closest('[data-addshape]')){const d=Doc.d,s=Math.min(d.w,d.h)/3,k=b.dataset.addshape;const line=k==='arrow';Doc.addShape(k,line?{x:d.w/2-s/2,y:d.h/2-s/4,w:s,h:s/2}:{x:(d.w-s)/2,y:(d.h-s)/2,w:s,h:s},line?{strokeC:Tools.color==='#ffffff'?'#ff3b3b':Tools.color}:{fill:Tools.color==='#ffffff'?'#ff3b3b':Tools.color});return}
  if(b=e.target.closest('[data-tog]')){const L=Doc.layer();if(!L)return;Doc.begin();const k=b.dataset.tog;setP(L,k,!getP(L,k));afterP(L,k);U.props();return}
  if(b=e.target.closest('[data-align]')){const L=Doc.layer();Doc.begin();L.align=b.dataset.align;Doc.measure(L);Doc.changed('canvas');U.props();return}
  if(b=e.target.closest('[data-glow]')){const L=Doc.layer();Doc.begin();L.shadow={on:true,color:b.dataset.glow==='glow'?'#ffffff':'#000000',alpha:b.dataset.glow==='glow'?.9:.65,blur:b.dataset.glow==='glow'?30:14,dx:b.dataset.glow==='glow'?0:6,dy:b.dataset.glow==='glow'?0:6};Doc.changed('canvas');U.props();return}
  if(e.target.closest('[data-raster]')){const L=Doc.layer();Doc.begin();Doc.rasterize(L);Doc.changed('layers');return}
  if(e.target.closest('[data-fit]')){const L=Doc.layer(),d=Doc.d;Doc.begin();const k=Math.max(d.w/L.w,d.h/L.h);L.w*=k;L.h*=k;L.x=(d.w-L.w)/2;L.y=(d.h-L.h)/2;L.rot=0;Doc.changed('canvas');U.props();return}
  if(e.target.closest('[data-center]')){const L=Doc.layer(),d=Doc.d;Doc.begin();L.x=(d.w-L.w)/2;L.y=(d.h-L.h)/2;Doc.changed('canvas');U.props();return}});
 side.addEventListener('dblclick',e=>{const n=e.target.closest('.lyr .ln');if(!n)return;const L=Doc.layer(n.parentElement.dataset.lid);n.innerHTML=`<input value="${esc(L.name)}">`;const i=n.querySelector('input');i.focus();i.select();
  const done=ok=>{if(ok&&i.value.trim()){Doc.begin();L.name=i.value.trim();Doc.mark(true)}U.layers()};i.onkeydown=e=>{L.named=true;if(e.key==='Enter')done(true);if(e.key==='Escape')done(false);e.stopPropagation()};i.onblur=()=>done(true)});
 // Ebenen ziehen zum Umsortieren
 let dragI=null;
 side.addEventListener('dragstart',e=>{const r=e.target.closest('.lyr');if(!r)return;dragI=r.dataset.lid;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain','layer')}catch(x){}});
 side.addEventListener('dragover',e=>{const r=e.target.closest('.lyr');if(dragI==null||!r)return;e.preventDefault();e.stopPropagation();document.querySelectorAll('.lyr').forEach(x=>x.classList.remove('drop-a','drop-b','drop-in'));const rc=r.getBoundingClientRect(),f=(e.clientY-rc.top)/rc.height;r.classList.add(r.classList.contains('grp')&&f>.3&&f<.7?'drop-in':f<.5?'drop-a':'drop-b')});
 side.addEventListener('drop',e=>{const r=e.target.closest('.lyr');if(dragI==null||!r)return;e.preventDefault();e.stopPropagation();const w=r.classList.contains('drop-in')?'into':r.classList.contains('drop-a')?'above':'below';const id=dragI;dragI=null;if(id===r.dataset.lid)return;Doc._label='Ebene verschieben';Doc.begin();Doc.place(id,r.dataset.lid,w);Doc.changed('layers')});
 side.addEventListener('dragend',()=>{dragI=null;document.querySelectorAll('.lyr').forEach(x=>x.classList.remove('drop-a','drop-b'))});

 // ---- Eigenschaften der ausgewählten Ebene ----
 const getP=(o,p)=>p.split('.').reduce((a,k)=>a&&a[k],o);
 const setP=(o,p,v)=>{const ks=p.split('.');const last=ks.pop();const tgt=ks.reduce((a,k)=>a[k],o);tgt[last]=v};
 const TEXTK=/^(text|font|size|bold|italic|ls|lh|stroke\.|box|rich)/;
 const afterP=(L,p)=>{if(L.type==='text'&&p==='text'&&!L.named){const n=String(L.text).replace(/\*\*|\*|\[#[0-9a-fA-F]{3,8}\]|\[\/\]/g,'').replace(/\s+/g,' ').trim().slice(0,32);if(n)L.name=n;U.layers()}if(p==='name')L.named=true;if(L.type==='text'&&TEXTK.test(p))Doc.measure(L);if(p==='name')U.layers();Doc.changed('canvas');U.thumbs()};
 const r1=v=>Math.round(v*10)/10;
 const rng=(p,lab,min,max,v,div=1,unit='')=>`<div class="row"><span>${esc(t(lab))}</span><input type="range" min="${min}" max="${max}" step="${div===1?1:1}" value="${Math.round(v*div)}" data-p="${p}" data-div="${div}"><span class="v" data-pv="${p}">${Math.round(v*div)}${unit}</span></div>`;
 const num=(p,lab,v,dis)=>`<label>${esc(t(lab))}<input type="number" data-p="${p}" value="${r1(v)}"${dis?' disabled':''}></label>`;
 const col=(p,v)=>`<input type="color" data-p="${p}" value="${v}">`;
 const chk=(p,lab,v)=>`<label style="display:flex;align-items:center;gap:6px;flex:none"><input type="checkbox" data-p="${p}"${v?' checked':''}>${esc(t(lab))}</label>`;
 U.props=()=>{const box=$('#propsBox');if(!box||!Doc.d)return;const L=Doc.layer();
  const simple=U.mode==='simple';
  if(!L){box.innerHTML=simple?'':sec('p-props','Eigenschaften',`<p class="muted" style="margin:0">${esc(t('Wähle eine Ebene aus, um sie zu bearbeiten.'))}</p>`);return}
  let h='';
  if(L.type==='group'){box.innerHTML=sec('p-props','Ebenengruppe',`<div class="row"><span>${esc(t('Name'))}</span><input data-p="name" value="${esc(L.name)}"></div>${rng('opacity','Deckkraft',0,100,L.opacity,100,' %')}<div class="btns"><button class="btn sm" data-act="ungroup">${esc(t('Gruppe auflösen'))}</button><button class="btn sm" data-act="merge">${esc(t('Gruppe zusammenfügen'))}</button><button class="btn sm danger" data-act="del">${esc(t('Löschen'))}</button></div><p class="hint2">${esc(t('Ziehe Ebenen in der Liste auf die Gruppe, um sie hineinzulegen. Mit dem Verschieben-Werkzeug bewegst du die ganze Gruppe.'))}</p>`);return}
  if(L.type==='text')h+=`<textarea data-p="text" spellcheck="false" rows="3">${esc(L.text)}</textarea><div class="row" style="margin-top:8px"><span>${esc(t('Schrift'))}</span><select data-p="font">${[...new Set([L.font,...Doc.FONTS])].map(f=>`<option${f===L.font?' selected':''} style="font-family:'${esc(f)}'">${esc(f)}</option>`).join('')}</select></div>
   <div class="row"><span>${esc(t('Farbe'))}</span>${col('color',L.color)}<button class="btn sm${L.bold?' on':''}" data-tog="bold"><b>F</b></button><button class="btn sm${L.italic?' on':''}" data-tog="italic"><i>K</i></button></div><div class="row"><span>${esc(t('Ausrichtung'))}</span><div class="seg" style="flex:1">${['left','center','right','justify'].map(a=>`<button data-align="${a}" class="${L.align===a?'on':''}" title="${esc(t({left:'Links',center:'Mitte',right:'Rechts',justify:'Blocksatz'}[a]))}">${{left:'⯇',center:'≡',right:'⯈',justify:'☰'}[a]}</button>`).join('')}</div></div>
   <div class="row">${chk('box','Textrahmen mit Umbruch',L.box)}${L.box?`<input type="range" min="40" max="${Math.max(4000,Doc.d.w)}" value="${Math.round(L.boxW||300)}" data-p="boxW"><span class="v" data-pv="boxW">${Math.round(L.boxW||300)}</span>`:''}</div>
   <div class="row">${chk('rich','Formatierung im Text',L.rich)}</div>${L.rich?`<p class="hint2" style="margin:-4px 0 8px">${esc(t('**fett**  *kursiv*  [#ff0000]Farbe[/]'))}</p>`:''}
   ${rng('size','Größe',4,600,L.size,1,' px')}${rng('lh','Zeilenabstand',60,250,L.lh,100,' %')}${rng('ls','Abstand',-20,80,L.ls||0,1,' px')}
   <div class="sub">${esc(t('Kontur'))}</div><div class="row">${chk('stroke.on','An',L.stroke.on)}${col('stroke.color',L.stroke.color)}<input type="range" min="0" max="60" value="${Math.round(L.stroke.w)}" data-p="stroke.w"><span class="v" data-pv="stroke.w">${Math.round(L.stroke.w)}</span></div>`;
  if(L.type==='shape'){const line=L.kind==='line'||L.kind==='arrow';
   h+=line?`<div class="row"><span>${esc(t('Farbe'))}</span>${col('strokeC',L.strokeC)}</div>${rng('strokeW','Dicke',1,120,L.strokeW,1,' px')}`
    :`<div class="row"><span>${esc(t('Füllung'))}</span>${chk('fillOn','An',L.fillOn)}${col('fill',L.fill)}</div><div class="row"><span>${esc(t('Rand'))}</span>${col('strokeC',L.strokeC)}<input type="range" min="0" max="80" value="${Math.round(L.strokeW)}" data-p="strokeW"><span class="v" data-pv="strokeW">${Math.round(L.strokeW)}</span></div>${L.kind==='rect'?rng('radius','Ecken',0,Math.round(Math.min(L.w,L.h)/2),L.radius,1,' px'):''}`}
  if(simple)h+=`${rng('opacity','Deckkraft',0,100,L.opacity,100,' %')}`;
  h+=`<div class="sub">${esc(t('Schatten / Leuchten'))}</div><div class="row">${chk('shadow.on','An',L.shadow.on)}${col('shadow.color',L.shadow.color)}<button class="btn sm" data-glow="shadow">${esc(t('Schatten'))}</button><button class="btn sm" data-glow="glow">${esc(t('Leuchten'))}</button></div>`;
  if(L.shadow.on)h+=rng('shadow.blur','Weichheit',0,120,L.shadow.blur,1,' px')+rng('shadow.alpha','Stärke',0,100,L.shadow.alpha,100,' %')+rng('shadow.dx','Versatz X',-80,80,L.shadow.dx,1,' px')+rng('shadow.dy','Versatz Y',-80,80,L.shadow.dy,1,' px');
  if(!L.fxs)L.fxs={stroke:{on:false,color:'#ffffff',w:8},glow:{on:false,color:'#ffd23f',size:30,alpha:.8},over:{on:false,color:'#ff3b3b',alpha:.5}};const X=L.fxs;
  h+=`<div class="sub">${esc(t('Ebeneneffekte (bleiben änderbar)'))}</div>
   <div class="row">${chk('fxs.stroke.on','Kontur',X.stroke.on)}${col('fxs.stroke.color',X.stroke.color)}<input type="range" min="1" max="80" value="${X.stroke.w}" data-p="fxs.stroke.w"><span class="v" data-pv="fxs.stroke.w">${X.stroke.w}</span></div>
   <div class="row">${chk('fxs.glow.on','Leuchten außen',X.glow.on)}${col('fxs.glow.color',X.glow.color)}<input type="range" min="2" max="200" value="${X.glow.size}" data-p="fxs.glow.size"><span class="v" data-pv="fxs.glow.size">${X.glow.size}</span></div>
   <div class="row">${chk('fxs.over.on','Farbüberlagerung',X.over.on)}${col('fxs.over.color',X.over.color)}<input type="range" min="0" max="100" value="${Math.round(X.over.alpha*100)}" data-p="fxs.over.alpha" data-div="100"><span class="v" data-pv="fxs.over.alpha">${Math.round(X.over.alpha*100)}</span></div>`;
  if(!simple&&L.type==='pixel'){const sf=L.sfx||[];h+=`<div class="sub">${esc(t('Smart-Filter'))}</div>${sf.map((f,i)=>{const d=FX.get(f.id);return`<div class="row sfx"><button class="ib eye${f.on===false?' off':''}" data-sfxon="${i}">${Tools.icon(f.on===false?'<path d="M3 3l18 18"/>':'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>')}</button><span style="flex:1;width:auto;color:var(--text)">${esc(t(d?d[2].replace(' …',''):f.id))}</span><button class="btn sm" data-sfxedit="${i}">${esc(t('Ändern'))}</button><button class="ib" data-sfxdel="${i}">×</button></div>`}).join('')}
   <select data-sfxadd><option value="">${esc(t('Smart-Filter hinzufügen …'))}</option>${FX.LIST.filter(f=>f[3].length||true).map(f=>`<option value="${f[0]}">${esc(t(f[2].replace(' …','')))}</option>`).join('')}</select>`}
  if(!simple)h+=`<div class="sub">${esc(t('Position und Größe'))}</div><div class="grid2">${num('x','X',L.x)}${num('y','Y',L.y)}${num('w','B',L.w,L.type==='text')}${num('h','H',L.h,L.type==='text')}</div><div class="grid2">${num('rot','Drehung',L.rot||0)}<span></span></div>`;
  h+=`<div class="btns"><button class="btn sm" data-center>${esc(t('Zentrieren'))}</button>${L.type==='pixel'?`<button class="btn sm" data-fit>${esc(t('Bild füllen'))}</button>`:''}${!simple&&L.type!=='pixel'?`<button class="btn sm" data-raster>${esc(t('In Pixel umwandeln'))}</button>`:''}<button class="btn sm danger" data-act="del">${esc(t('Löschen'))}</button></div>`;
  const title=simple?(L.type==='text'?'Text bearbeiten':L.type==='shape'?'Form bearbeiten':'Ausgewählte Ebene'):'Eigenschaften';
  box.innerHTML=sec(simple?'s-props':'p-props',title,h,`<span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400;margin-left:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px">· ${esc(L.name)}</span>`)};
 U.propsLive=()=>{const L=Doc.layer();if(!L)return;for(const k of['x','y','w','h','rot']){const i=document.querySelector(`#propsBox input[data-p="${k}"]`);if(i&&document.activeElement!==i)i.value=r1(L[k]||0)}
  if(L.type==='text'){const i=document.querySelector('#propsBox input[data-p="size"]');if(i){i.value=Math.round(L.size);const v=document.querySelector('[data-pv="size"]');if(v)v.textContent=Math.round(L.size)+' px'}}};
 U.focusText=sel=>{const L=Doc.layer();if(!L||L.type!=='text')return;closed.delete(U.mode==='simple'?'s-props':'p-props');U.props();const ta=document.querySelector('#propsBox textarea[data-p="text"]');if(ta){ta.focus();if(sel)ta.select();ta.scrollIntoView({block:'nearest'})}};
 side.addEventListener('input',e=>{const el=e.target;
  if(el.dataset.a){const k=el.dataset.a;Doc.begin('adj:'+k);Doc.d.adjust[k]=+el.value;Doc.d.adjust.preset='';const v=side.querySelector(`[data-av="${k}"]`);if(v)v.textContent=el.value;side.querySelectorAll('.pf.on').forEach(x=>x.classList.remove('on'));Doc.changed('adjust');return}
  const p=el.dataset.p;if(!p)return;const L=Doc.layer();if(!L)return;
  let v=el.type==='checkbox'?el.checked:el.type==='range'||el.type==='number'?+el.value:el.value;if(el.type==='range')v=v/(+el.dataset.div||1);if(el.type==='number'&&!isFinite(v))return;
  Doc.begin('p:'+L.id+':'+p);setP(L,p,v);const pv=side.querySelector(`[data-pv="${p}"]`);if(pv)pv.textContent=el.value+(p==='opacity'||p==='lh'||p==='shadow.alpha'?' %':/^(size|ls|strokeW|radius|shadow\.(blur|dx|dy))$/.test(p)?' px':'');
  afterP(L,p);if(el.type==='checkbox'&&(p==='shadow.on'||p==='box'||p==='rich')){if(p==='box'&&L.box&&!L.boxW){L.boxW=Math.round(L.w);Doc.measure(L)}U.props()}});
 side.addEventListener('change',e=>{if(e.target.matches('[data-sfxadd]')&&e.target.value){const id=e.target.value;e.target.value='';FX.run(id,{smart:true})}});
 side.addEventListener('keydown',e=>{if(e.target.matches('textarea'))e.stopPropagation()});

 // ---- Filter und Vorschaubilder der Filter ----
 const applyPreset=k=>{const p=PRESETS.find(x=>x[0]===k);Doc.begin();Doc.d.adjust={...Doc.ADJ0,...p[2],preset:k};Doc.changed('adjust');U.side()};
 let pvT=0;
 const previews=()=>{clearTimeout(pvT);pvT=setTimeout(()=>{const cs=document.querySelectorAll('[data-pfc]');if(!cs.length||!Doc.d)return;if(cs[0].closest('.sec.closed'))return;
  const d=Doc.d,src=Doc.mk(120,90),sc=src.getContext('2d');const k=Math.max(120/d.w,90/d.h);sc.fillStyle='#fff';sc.fillRect(0,0,120,90);sc.translate((120-d.w*k)/2,(90-d.h*k)/2);sc.scale(k,k);if(Doc.need)Doc.render();sc.drawImage(Doc.comp,0,0);
  cs.forEach(c=>{const p=PRESETS.find(x=>x[0]===c.dataset.pfc);const a={...Doc.ADJ0,...p[2]};if(Doc.isNeutral(a))c.getContext('2d').drawImage(src,0,0);else Doc.applyAdjust(src,c,a)})},350)};
 U.previews=previews;

 // ---- Änderungen am Bild ----
 Doc.on=what=>{if(!Doc.d)return;setTimeout(()=>{U.journal();U.renderTabs()},0);
  if(what==='all'||what==='size'){U.side();if(what==='size')View.fit()}
  else if(what==='layers'){U.layers();U.props()}
  else if(what==='canvas'){U.thumbs();}
  if(what!=='adjust')previews();View.draw()};
 U.refresh=()=>{U.side();View.draw()};
 U.cropInfo=()=>{};

 // ---- Export ----
 U.exportDlg=()=>{const d=Doc.d;let fmt=ls.get('fmt','png'),q=ls.get('q',92),sc=1,dir=ls.get('dir','')||S.exportDir||'';
  U.modal(`<div class="mhead"><h3>${esc(t('Exportieren'))}</h3><button class="ib" data-x>×</button></div><div class="mbody"><div class="excols"><div class="exprev"><img id="exprev" alt=""></div><div>
   <div class="fld"><span>${esc(t('Format'))}</span><div class="fmts">${[['png','PNG','verlustfrei'],['jpg','JPG','klein'],['webp','WebP','modern'],['gif','GIF','auch Animation'],['psd','PSD','mit Ebenen'],['pdf','PDF','zum Drucken'],['tif','TIFF','Druckerei'],['bmp','BMP','Windows'],['ico','ICO','Symbol']].map(([k,n,s])=>`<button class="btn${fmt===k?' on':''}" data-fmt="${k}"><b>${n}</b><small>${esc(t(s))}</small></button>`).join('')}</div></div>
   <div class="fld" id="anirow"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="exani">${esc(t('Ebenen als Animation (jede sichtbare Ebene = ein Bild)'))}</label><span>${esc(t('Dauer pro Bild (ms)'))}</span><input type="number" id="exdel" value="${ls.get('gifdelay',150)}" min="20" max="10000"></div>
   <div class="fld" id="qrow"><span>${esc(t('Qualität'))}: <b id="qv">${q}</b> %</span><input type="range" min="40" max="100" value="${q}" id="exq"></div>
   <div class="fld"><span>${esc(t('Größe'))}</span><select id="exs">${[[.25,'25 %'],[.5,'50 %'],[1,'100 % (Original)'],[2,'200 %']].map(([k,n])=>`<option value="${k}"${k===1?' selected':''}>${esc(t(n))}</option>`).join('')}</select><small class="muted" id="exdim"></small></div>
   <div class="fld"><span>${esc(t('Dateiname'))}</span><input id="exn" value="${esc(d.name)}" spellcheck="false"></div>
   <div class="fld"><span>${esc(t('Ordner'))}</span><div class="dirrow"><input id="exd" value="${esc(dir)}" spellcheck="false"><button class="btn" data-dir>${esc(t('Ändern'))}</button></div></div>
  </div></div></div><div class="mfoot"><span class="grow muted" id="exmsg"></span><button class="btn" data-x>${esc(t('Abbrechen'))}</button><button class="btn primary" data-go>${esc(t('Exportieren'))}</button></div>`);
  const upd=()=>{$('#qrow').style.display=['jpg','webp','pdf'].includes(fmt)?'':'none';$('#anirow').style.display=fmt==='gif'?'':'none';$('#exdim').textContent=Math.round(d.w*sc)+' × '+Math.round(d.h*sc)+' px';document.querySelectorAll('[data-fmt]').forEach(b=>b.classList.toggle('on',b.dataset.fmt===fmt))};
  upd();setTimeout(async()=>{const k=Math.min(1,600/Math.max(d.w,d.h));const cv=Doc.renderAt(Math.max(1,Math.round(d.w*k)),Math.max(1,Math.round(d.h*k)));const b=await Doc.blob(cv);const im=$('#exprev');if(im)im.src=URL.createObjectURL(b)},20);
  const mb=$('#mbox');
  mb.oninput=e=>{if(e.target.id==='exq'){q=+e.target.value;$('#qv').textContent=q}};
  mb.onchange=e=>{if(e.target.id==='exs'){sc=+e.target.value;upd()}};
  mb.onclick=async e=>{let b;if(e.target.closest('[data-x]'))return U.close();
   if(b=e.target.closest('[data-fmt]')){fmt=b.dataset.fmt;upd();return}
   if(e.target.closest('[data-dir]')){const ps=await Kit.pick('folder','');if(ps[0])$('#exd').value=ps[0];return}
   if(b=e.target.closest('[data-go]')){b.disabled=true;$('#exmsg').textContent=t('Wird exportiert …');
    try{const w=Math.max(1,Math.round(d.w*sc)),h=Math.max(1,Math.round(d.h*sc));const cv=Doc.renderAt(w,h,fmt==='jpg'?'#ffffff':null);
     let blob,ext=fmt;
     if(fmt==='gif'){let frames=[cv];if($('#exani').checked){frames=Exp.layerCanvases(true).map(l=>{const f=Doc.mk(w,h);f.getContext('2d').drawImage(l.cv,0,0,w,h);return f});if(frames.length<2)throw new Error(t('Für eine Animation braucht es mindestens zwei sichtbare Ebenen.'))}const dl=+$('#exdel').value||150;ls.set('gifdelay',dl);blob=Exp.gif(frames,w,h,dl)}
     else if(fmt==='psd'){const ls2=Exp.layerCanvases(false).map(l=>{if(sc===1)return l;const f=Doc.mk(w,h);f.getContext('2d').drawImage(l.cv,0,0,w,h);return{...l,cv:f}});blob=Exp.psd(ls2,w,h,cv)}
     else if(fmt==='pdf')blob=await Exp.pdf(cv,q/100);else if(fmt==='bmp')blob=Exp.bmp(cv);else if(fmt==='tif')blob=Exp.tiff(cv);else if(fmt==='ico')blob=await Exp.ico(cv);
     else{const type={png:'image/png',jpg:'image/jpeg',webp:'image/webp'}[fmt];blob=await Doc.blob(cv,type,q/100);
      if(!blob||blob.type!==type){blob=await Doc.blob(cv,'image/png');ext='png';Kit.toast(t('WebP wird hier nicht unterstützt, es wurde PNG gespeichert.'))}}
     const name=($('#exn').value.trim()||d.name).replace(/[\\/:*?"<>|]/g,'_')+'.'+ext;const dir2=$('#exd').value.trim();
     const r=await fetch('api/export?dir='+encodeURIComponent(dir2)+'&name='+encodeURIComponent(name),{method:'POST',body:blob});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||t('Export fehlgeschlagen.'));
     ls.set('fmt',fmt);ls.set('q',q);if(dir2)ls.set('dir',dir2);
     U.modal(`<div class="unsaved-dlg"><div class="ud-ico" style="background:color-mix(in srgb,var(--ok) 16%,transparent);color:var(--ok)"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></div><h2>${esc(t('Fertig exportiert'))}</h2><p>${esc(j.path)}</p><div class="ud-btns"><button class="btn primary" data-of>${esc(t('Ordner öffnen'))}</button><button class="btn" data-x>${esc(t('Schließen'))}</button></div></div>`);
     $('#mbox').onclick=e=>{if(e.target.closest('[data-of]')){Kit.openFolder(j.path);U.close()}if(e.target.closest('[data-x]'))U.close()}}
    catch(x){b.disabled=false;$('#exmsg').textContent=x.message}}}};

 // ---- Bildgröße und Arbeitsfläche ----
 // ---- Maßeinheiten wie in GIMP: Pixel, Millimeter, Zentimeter, Zoll, Punkt ----
 U.UNITS=[['px','Pixel (px)'],['mm','Millimeter (mm)'],['cm','Zentimeter (cm)'],['in','Zoll (in)'],['pt','Punkt (pt)']];
 U.unitF=(u,ppi)=>u==='in'?ppi:u==='cm'?ppi/2.54:u==='mm'?ppi/25.4:u==='pt'?ppi/72:1;
 const fmtU=(v,u)=>u==='px'?String(Math.round(v)):String(Math.round(v*100)/100);
 // Einheit wechseln: Werte umrechnen, die Pixelgröße bleibt gleich
 U.unitSwitch=(ids,uSel,ppiEl,ppiLbl)=>{let cur=uSel.value;const ppi=()=>+ppiEl.value||300;
  const conv=()=>{const u=uSel.value;for(const id of ids){const el=$(id);const px=+el.value*U.unitF(cur,ppi());el.value=fmtU(px/U.unitF(u,ppi()),u);el.step=u==='px'?'1':'0.01'}cur=u;if(ppiLbl)ppiLbl.hidden=u==='px'};
  uSel.onchange=conv;if(ppiLbl)ppiLbl.hidden=uSel.value==='px'};
 setTimeout(()=>{const u=$('#nunit');if(u)U.unitSwitch(['#nw','#nh'],u,$('#nppi'),$('#nppiL'))});
 function resizeDlg(){const d=Doc.d;let lock=true;U.modal(`<div class="mhead"><h3>${esc(t('Bildgröße'))}</h3><button class="ib" data-x>×</button></div><div class="mbody"><div class="grid2"><label>${esc(t('Breite'))}<input type="number" id="rw" value="${d.w}" min="0.01"></label><label>${esc(t('Höhe'))}<input type="number" id="rh" value="${d.h}" min="0.01"></label><label>${esc(t('Einheit'))}<select id="ru">${U.UNITS.map(([k,n])=>`<option value="${k}">${esc(t(n))}</option>`).join('')}</select></label><label id="rpL">${esc(t('Auflösung (ppi)'))}<input type="number" id="rp" value="${d.ppi||U.newPPI||300}" min="10" max="2400"></label></div>${chk('_lock','Seitenverhältnis beibehalten',true).replace('data-p="_lock"','id="rl"')}<label class="row" style="margin-top:8px">${esc(t('Interpolation'))}<select id="rint"><option value="high">${esc(t('Hohe Qualität (verlustfrei, bleibt änderbar)'))}</option><option value="linear">${esc(t('Linear'))}</option><option value="none">${esc(t('Keine (harte Pixel, für Pixel-Art)'))}</option></select></label><p class="muted" style="font-size:12px">${esc(t('Alle Ebenen werden mit skaliert.'))}</p></div><div class="mfoot"><button class="btn" data-x>${esc(t('Abbrechen'))}</button><button class="btn primary" data-ok>${esc(t('Übernehmen'))}</button></div>`);
  const mb=$('#mbox');U.unitSwitch(['#rw','#rh'],$('#ru'),$('#rp'),$('#rpL'));const rnd=v=>$('#ru').value==='px'?Math.max(1,Math.round(v)):Math.round(v*100)/100;mb.oninput=e=>{lock=$('#rl').checked;if(!lock)return;if(e.target.id==='rw')$('#rh').value=rnd(+e.target.value*d.h/d.w);if(e.target.id==='rh')$('#rw').value=rnd(+e.target.value*d.w/d.h)};
  mb.onclick=e=>{if(e.target.closest('[data-x]'))return U.close();if(e.target.closest('[data-ok]')){const f=U.unitF($('#ru').value,+$('#rp').value||300),w=Math.round(+$('#rw').value*f),h=Math.round(+$('#rh').value*f);if(!(w>0&&h>0&&w<=30000&&h<=30000))return Kit.toast(t('Bitte eine Größe zwischen 1 und 30000 Pixel eingeben.'));d.ppi=+$('#rp').value||d.ppi;const ip=$('#rint').value;U.close();Doc.resize(w,h,ip)}}}
 // Neue Ebene wie in GIMP: Name, Füllung, Modus, Deckkraft
 let nlLast={fill:'transparent',blend:'source-over',op:100};
 function newLayerDlg(){if(!Doc.d)return;const n=Doc.d.layers.length+1;U.modal(`<div class="mhead"><h3>${esc(t('Neue Ebene'))}</h3><button class="ib" data-x>×</button></div><div class="mbody"><div class="grid2">
  <label>${esc(t('Ebenenname'))}<input id="nlname" value="${esc(t('Ebene')+' '+n)}"></label><label>${esc(t('Modus'))}<select id="nlblend">${Doc.BLENDS.map(([k,v])=>`<option value="${k}"${nlLast.blend===k?' selected':''}>${esc(t(v))}</option>`).join('')}</select></label>
  <label>${esc(t('Deckkraft'))} (%)<input type="number" id="nlop" min="0" max="100" value="${nlLast.op}"></label><label>${esc(t('Füllen mit'))}<select id="nlfill">${[['transparent','Transparenz'],['white','Weiß'],['fg','Vordergrundfarbe'],['bg','Hintergrundfarbe'],['pattern','Muster (aktuelles Füllmuster)']].map(([k,v])=>`<option value="${k}"${nlLast.fill===k?' selected':''}>${esc(t(v))}</option>`).join('')}</select></label></div></div>
  <div class="mfoot"><button class="btn" data-x>${esc(t('Abbrechen'))}</button><button class="btn primary" data-ok>OK</button></div>`);
  const ok=()=>{nlLast={fill:$('#nlfill').value,blend:$('#nlblend').value,op:Math.max(0,Math.min(100,+$('#nlop').value||100))};const name=$('#nlname').value.trim()||t('Ebene');U.close();Doc._label=t('Neue Ebene');Doc.addEmpty();const L=Doc.layer();if(!L)return;
   L.name=name;L.blend=nlLast.blend;L.opacity=nlLast.op/100;const f=nlLast.fill;if(f!=='transparent'){const c=L.cv.getContext('2d');if(f==='pattern'){const pt=typeof Extra!=='undefined'&&Extra.pat(Tools.o.fill.pat);c.fillStyle=pt?c.createPattern(pt,'repeat'):'#fff'}else c.fillStyle=f==='white'?'#ffffff':f==='fg'?Tools.color:Tools.color2;c.fillRect(0,0,L.cv.width,L.cv.height)}Doc.changed('layers');UI.props()};
  $('#mbox').onclick=e=>{if(e.target.closest('[data-x]'))return U.close();if(e.target.closest('[data-ok]'))ok()};$('#mbox').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();ok()}};setTimeout(()=>{const i=$('#nlname');if(i){i.focus();i.select()}},30)}
 function canvasDlg(){const d=Doc.d;let ax=.5,ay=.5;const grid=()=>[0,.5,1].map(y=>[0,.5,1].map(x=>`<button class="btn sm${x===ax&&y===ay?' on':''}" data-anc="${x},${y}" style="width:34px;height:30px;padding:0">${x===ax&&y===ay?'●':'·'}</button>`).join('')).join('');
  U.modal(`<div class="mhead"><h3>${esc(t('Arbeitsfläche'))}</h3><button class="ib" data-x>×</button></div><div class="mbody"><div class="grid2"><label>${esc(t('Breite'))}<input type="number" id="cw" value="${d.w}" min="1"></label><label>${esc(t('Höhe'))}<input type="number" id="ch" value="${d.h}" min="1"></label></div><div class="sub">${esc(t('Ausrichtung'))}</div><div id="anc" style="display:grid;grid-template-columns:repeat(3,34px);gap:4px">${grid()}</div></div><div class="mfoot"><button class="btn" data-x>${esc(t('Abbrechen'))}</button><button class="btn primary" data-ok>${esc(t('Übernehmen'))}</button></div>`);
  $('#mbox').onclick=e=>{let b;if(e.target.closest('[data-x]'))return U.close();if(b=e.target.closest('[data-anc]')){[ax,ay]=b.dataset.anc.split(',').map(Number);$('#anc').innerHTML=grid();return}
   if(e.target.closest('[data-ok]')){const w=Math.round(+$('#cw').value),h=Math.round(+$('#ch').value);if(!(w>0&&h>0&&w<=30000&&h<=30000))return Kit.toast(t('Bitte eine Größe zwischen 1 und 30000 Pixel eingeben.'));U.close();Doc.canvasSize(w,h,ax,ay)}}}

 // ---- Dateien hineinziehen und einfügen ----
 Kit.onDrop(paths=>{const ps=paths.filter(isImg);if(!ps.length)return Kit.toast(t('Bitte Bilddateien (PNG, JPG, WebP, GIF, PSD, XCF) verwenden.'));if($('#editor').hidden)return openPath(ps[0]);addPaths(ps)});
 let clip=null;
 U.copy=()=>{if(Sel.has()){const c=Sel.copy();if(c){clip={pix:c,t:Date.now()};Kit.toast(t('Auswahl kopiert'))}return}const L=Doc.layer();if(!L)return;clip={...L,shadow:{...L.shadow},stroke:L.stroke&&{...L.stroke}};delete clip._prev;clip.t=Date.now();Kit.toast(t('Ebene kopiert'))};
 U.paste=()=>{if(!clip)return;if(clip.pix){const c=clip.pix;Doc.addPixel(Doc.clone(c.cv),t('Eingefügt'),{x:c.x,y:c.y,w:c.cv.width,h:c.cv.height});Tools.set('move');return}
  Doc.begin();const n={...clip,t:undefined,id:Doc.uid(),shadow:{...clip.shadow},stroke:clip.stroke&&{...clip.stroke},x:clip.x+20,y:clip.y+20};clip.x+=20;clip.y+=20;const i=Doc.sel?Doc.idx(Doc.sel):-1;Doc.d.layers.splice(i+1,0,n);Doc.sel=n.id;Doc.changed('layers')};
 U._extT=0;addEventListener('blur',()=>{U._extT=Date.now()});
 document.addEventListener('paste',async e=>{if($('#editor').hidden||e.target.matches('input,textarea'))return;const items=[...(e.clipboardData&&e.clipboardData.items||[])];const it=items.find(i=>i.type.startsWith('image/'));
  if(it&&!(clip&&clip.t>U._extT)){e.preventDefault();const f=it.getAsFile();const url=URL.createObjectURL(f);const cv=await Doc.loadCv(url);URL.revokeObjectURL(url);if(cv)Doc.addImage(cv,t('Eingefügtes Bild'));Tools.set('move');return}
  if(clip){e.preventDefault();U.paste()}});

 // ---- Start ----
 U.boot=async()=>{View.init();Tools.init();try{await Extra.init()}catch(e){}await Keys.load();U.start()};
 return U})();

// Tastenkürzel: zentrale Liste, eigene Belegung (tastenkuerzel.json), Einstellungsfenster.
const Keys=(()=>{const K={};const {$,esc,api}=Kit;
 const tool=id=>{const f=()=>Tools.set(id);f.tool=id;return f};
 const sz=f=>()=>{const t=Tools.PAINT.includes(Tools.tool)?Tools.tool:'brush';Tools.o[t].size=Math.max(1,Math.min(500,Math.round(Tools.o[t].size*f)));Tools.opts();View.draw()};
 const A=[
  ['save','Datei','Speichern',['Ctrl+S'],()=>UI.save()],
  ['export','Datei','Exportieren',['Ctrl+E'],()=>UI.act('export')],
  ['addimg','Datei','Bild als Ebene einfügen',['Ctrl+Shift+O'],()=>UI.act('addimg')],
  ['new','Datei','Neues Bild',['Ctrl+N'],()=>UI.act('new')],
  ['keys','Datei','Tastenkürzel',['F1'],()=>K.editor()],
  ['undo','Bearbeiten','Rückgängig',['Ctrl+Z'],()=>Doc.doUndo()],
  ['redo','Bearbeiten','Wiederholen',['Ctrl+Y','Ctrl+Shift+Z'],()=>Doc.doRedo()],
  ['copy','Bearbeiten','Kopieren',['Ctrl+C'],()=>UI.copy()],
  ['cut','Bearbeiten','Ausschneiden',['Ctrl+X'],()=>UI.act('cut')],
  ['selall','Auswahl','Alles auswählen',['Ctrl+A'],()=>Sel.all()],
  ['selnone','Auswahl','Auswahl aufheben',['Ctrl+Shift+A'],()=>Sel.none()],
  ['selinv','Auswahl','Auswahl umkehren',['Ctrl+I'],()=>Sel.invert()],
  ['seltolayer','Auswahl','Auswahl als neue Ebene',['Ctrl+Shift+J'],()=>UI.act('seltolayer')],
  ['fillfg','Bearbeiten','Mit Vordergrundfarbe füllen',['Ctrl+,'],()=>UI.act('fillfg')],
  ['fillbg','Bearbeiten','Mit Hintergrundfarbe füllen',['Ctrl+.'],()=>UI.act('fillbg')],
  ['deselect','Bearbeiten','Auswahl aufheben / Abbrechen',['Escape'],()=>{const X=Tools.EXT[Tools.tool];if(X&&X.key&&X.key('cancel'))return;if(Tools.cropping())return Tools.cropCancel();if(Sel.has())return Sel.none();Doc.sel=null;UI.layers();UI.props();View.draw()}],
  ['apply','Bearbeiten','Zuschnitt anwenden',['Enter'],()=>{const X=Tools.EXT[Tools.tool];if(X&&X.key&&X.key('apply'))return;if(Tools.cropping())Tools.cropApply()}],
  ['nl','Bearbeiten','Ebene 1 px nach links',['ArrowLeft'],()=>Tools.nudge(-1,0)],
  ['nr','Bearbeiten','Ebene 1 px nach rechts',['ArrowRight'],()=>Tools.nudge(1,0)],
  ['nu','Bearbeiten','Ebene 1 px nach oben',['ArrowUp'],()=>Tools.nudge(0,-1)],
  ['nd','Bearbeiten','Ebene 1 px nach unten',['ArrowDown'],()=>Tools.nudge(0,1)],
  ['nl10','Bearbeiten','Ebene 10 px nach links',['Shift+ArrowLeft'],()=>Tools.nudge(-10,0)],
  ['nr10','Bearbeiten','Ebene 10 px nach rechts',['Shift+ArrowRight'],()=>Tools.nudge(10,0)],
  ['nu10','Bearbeiten','Ebene 10 px nach oben',['Shift+ArrowUp'],()=>Tools.nudge(0,-10)],
  ['nd10','Bearbeiten','Ebene 10 px nach unten',['Shift+ArrowDown'],()=>Tools.nudge(0,10)],
  ['newlayer','Ebene','Neue Ebene',['Ctrl+Shift+N'],()=>UI.act('newlayer')],
  ['dup','Ebene','Ebene duplizieren',['Ctrl+J'],()=>Doc.dup()],
  ['del','Ebene','Ebene löschen (mit Auswahl: Auswahl leeren)',['Delete','Backspace'],()=>Sel.has()?Sel.clear():Doc.del()],
  ['up','Ebene','Nach oben',['Ctrl+]'],()=>Doc.move(1)],
  ['down','Ebene','Nach unten',['Ctrl+['],()=>Doc.move(-1)],
  ['merge','Ebene','Mit darunter zusammenfügen',['Ctrl+Alt+E'],()=>Doc.merge()],
  ['text','Ebene','Text hinzufügen',[],()=>UI.act('text')],
  ['t_bycolor','Werkzeuge','Nach Farbe auswählen',['Shift+O'],tool('bycolor')],
  ['t_scissors','Werkzeuge','Intelligente Schere',['I'],tool('scissors')],
  ['t_ink','Werkzeuge','Tinte',['K'],tool('ink')],
  ['t_warp','Werkzeuge','Verformen (Warp)',['W'],tool('warp')],
  ['t_rotate','Werkzeuge','Drehen',['Shift+R'],tool('rotate')],
  ['t_scale','Werkzeuge','Skalieren',['Shift+S'],tool('scale')],
  ['t_flip','Werkzeuge','Spiegeln',['Shift+F'],tool('flip')],
  ['t_align','Werkzeuge','Ausrichten',['Q'],tool('align')],
  ['t_measure','Werkzeuge','Maßband',['Shift+M'],tool('measure')],
  ['t_move','Werkzeuge','Verschieben',['M'],tool('move')],
  ['t_rsel','Werkzeuge','Rechteckige Auswahl',['R'],tool('rsel')],
  ['t_esel','Werkzeuge','Elliptische Auswahl',['E'],tool('esel')],
  ['t_lasso','Werkzeuge','Freie Auswahl (Lasso)',['F'],tool('lasso')],
  ['t_wand','Werkzeuge','Zauberstab',['U'],tool('wand')],
  ['t_brush','Werkzeuge','Pinsel',['P'],tool('brush')],
  ['t_grad','Werkzeuge','Farbverlauf',['G'],tool('gradient')],
  ['t_clone','Werkzeuge','Klonen (Stempel)',['C'],tool('clone')],
  ['t_smudge','Werkzeuge','Verwischen',['S'],tool('smudge')],
  ['t_zoom','Werkzeuge','Zoom',['Z'],tool('zoom')],
  ['t_tf','Werkzeuge','Transformieren (alle Arten)',[],tool('transform')],
  ['t_unified','Werkzeuge','Vereinheitlichte Transformation',['Shift+T'],tool('unified')],
  ['t_persp','Werkzeuge','Perspektive',['Shift+P'],tool('perspective')],
  ['t_shear','Werkzeuge','Scheren',['Shift+H'],tool('shear')],
  ['t_3d','Werkzeuge','3D-Transformation',['Shift+W'],tool('tf3d')],
  ['t_handle','Werkzeuge','Griff-Transformation',['Shift+L'],tool('handle')],
  ['t_cage','Werkzeuge','Käfig-Transformation',['Shift+G'],tool('cage')],
  ['t_path','Werkzeuge','Pfade',['B'],tool('path')],
  ['t_fg','Werkzeuge','Vordergrundauswahl',['Shift+X'],tool('fgsel')],
  ['group','Ebene','Neue Ebenengruppe',['Ctrl+G'],()=>UI.act('group')],
  ['ungroup','Ebene','Gruppe auflösen',['Ctrl+Shift+U'],()=>UI.act('ungroup')],
  ['nexttab','Ansicht','Nächstes Bild (Tab)',['Ctrl+Tab'],()=>{if(UI.tabs.length>1)UI.tabTo((UI.cur+1)%UI.tabs.length)}],
  ['t_pencil','Werkzeuge','Stift',['N'],tool('pencil')],
  ['t_air','Werkzeuge','Airbrush',['A'],tool('airbrush')],
  ['t_heal','Werkzeuge','Heilen',['H'],tool('heal')],
  ['t_dodge','Werkzeuge','Abwedeln (aufhellen)',['Shift+D'],tool('dodge')],
  ['t_burn','Werkzeuge','Nachbelichten (abdunkeln)',['Shift+Alt+D'],tool('burn')],
  ['t_blurb','Werkzeuge','Weichzeichnen-Pinsel',['Shift+U'],tool('blurb')],
  ['t_sharpb','Werkzeuge','Schärfen-Pinsel',['Shift+Alt+U'],tool('sharpb')],
  ['grid','Ansicht','Raster an/aus',['Ctrl+Shift+G'],()=>UI.act('grid')],
  ['rulers','Ansicht','Lineale an/aus',['Ctrl+Shift+R'],()=>UI.act('rulers')],
  ['feather','Auswahl','Auswahl ausblenden',['Ctrl+Shift+F'],()=>UI.act('feather')],
  ['alphalock','Ebene','Alphakanal sperren',['Shift+Alt+L'],()=>UI.act('alphalock')],
  ['cdef','Werkzeuge','Standardfarben (Schwarz/Weiß)',['D'],()=>{Tools.color='#000000';Tools.color2='#ffffff';Tools.bar();Tools.opts()}],
  ['t_eraser','Werkzeuge','Radierer',['Shift+E'],tool('eraser')],
  ['t_text','Werkzeuge','Text',['T'],tool('text')],
  ['t_shape','Werkzeuge','Formen',['Shift+Y'],tool('shape')],
  ['t_crop','Werkzeuge','Zuschneiden',['Shift+C'],tool('crop')],
  ['t_picker','Werkzeuge','Pipette',['O'],tool('picker')],
  ['t_fill','Werkzeuge','Füllen',['Shift+B'],tool('fill')],
  ['t_hand','Werkzeuge','Hand',['Shift+Space'],tool('hand')],
  ['swap','Werkzeuge','Farben tauschen',['X'],()=>Tools.swap()],
  ['bigger','Werkzeuge','Pinsel größer',[']'],sz(1.2)],
  ['smaller','Werkzeuge','Pinsel kleiner',['['],sz(1/1.2)],
  ['fit','Ansicht','Ganzes Bild',['Ctrl+0'],()=>View.fit()],
  ['z100','Ansicht','Originalgröße (100 %)',['1','Ctrl+1'],()=>View.zoomAt(1)],
  ['zin','Ansicht','Vergrößern',['Ctrl++','Ctrl+='],()=>View.zoomAt(View.z*1.25)],
  ['zout','Ansicht','Verkleinern',['Ctrl+-'],()=>View.zoomAt(View.z/1.25)]];
 let custom={};const byId={};for(const a of A)byId[a[0]]=a;
 const combos=id=>custom[id]||byId[id][3];
 const CODE={BracketLeft:'[',BracketRight:']',Minus:'-',Equal:'=',NumpadAdd:'+',NumpadSubtract:'-',Digit0:'0',Digit1:'1'};
 const keyName=e=>{let k=e.key;if(k===' ')k='Space';else if(k&&k.length===1)k=k.toUpperCase();if(k==='Dead')k=CODE[e.code]||k;if(k==='Esc')k='Escape';return k};
 const mods=e=>(e.ctrlKey||e.metaKey?'Ctrl+':'')+(e.altKey?'Alt+':'')+(e.shiftKey?'Shift+':'');
 K.fromEvent=e=>{const k=keyName(e);if(['Control','Alt','Shift','Meta','AltGraph'].includes(k))return null;return mods(e)+k};
 const altFromEvent=e=>{const c=CODE[e.code]||(/^Digit\d$/.test(e.code)?e.code.slice(5):/^Key[A-Z]$/.test(e.code)?e.code.slice(3):null);return c?mods(e)+c:null};
 const SHOW={Ctrl:'Strg',Shift:'Umschalt',Alt:'Alt',Space:'Leertaste',Delete:'Entf',Backspace:'Rücktaste',Escape:'Esc',Enter:'Enter',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓'};
 K.show=c=>c.split(/\+(?=.)/).map(p=>SHOW[p]||p).join('+');
 const find=c=>{for(const a of A)if(combos(a[0]).includes(c))return a[0];return null};
 K.handle=e=>{if($('#editor').hidden)return;if($('#modal').classList.contains('show'))return;const tg=e.target;const c=K.fromEvent(e);if(!c)return;let id=find(c);
  if(!id){const c2=altFromEvent(e);if(c2&&c2!==c)id=find(c2)}
  if(tg.matches('input,textarea,select')&&!(tg.type==='range'||tg.type==='checkbox'||tg.type==='color')&&id!=='save')return;
  if(!id)return;if(id==='copy'&&window.getSelection&&String(window.getSelection()))return;e.preventDefault();byId[id][4]()};
 document.addEventListener('keydown',K.handle);
 K.menus=()=>{document.querySelectorAll('.ddm [data-act]').forEach(b=>{const id=b.dataset.act;let kb=b.querySelector('kbd');if(!byId[id]){return}const cs=combos(id);if(!cs.length){if(kb)kb.remove();return}if(!kb){kb=document.createElement('kbd');b.append(kb)}kb.textContent=K.show(cs[0])})};
 K.load=async()=>{try{const j=await api('api/keys');custom=j&&typeof j==='object'?j:{}}catch(e){custom={}}for(const k of Object.keys(custom))if(!byId[k])delete custom[k];K.menus();try{Tools.bar();Tools.opts()}catch(e){}};
 const store=()=>{api('api/keys',custom).catch(()=>{});K.menus();try{Tools.bar();Tools.opts()}catch(e){}};
 K.toolDef=id=>{const a=A.find(a=>a[4].tool===id);return a?a[0]:null};
 K.toolKey=id=>{const d=K.toolDef(id);const c=d?combos(d)[0]:'';return c?K.show(c):''};
 let rec=null;
 K.editor=focus=>{const groups=[...new Set(A.map(a=>a[1]))];rec=typeof focus==='string'&&byId[focus]?focus:null;
  const row=a=>{const cs=combos(a[0]),own=!!custom[a[0]];return`<div class="krow${rec===a[0]?' rec':''}"><span>${esc(Kit.t(a[2]))}</span><div class="kcur">${rec===a[0]?`<i>${esc(Kit.t('Drücke die neue Taste … (Esc bricht ab)'))}</i>`:cs.length?cs.map(c=>`<kbd>${esc(K.show(c))}</kbd>`).join(''):`<i class="muted">${esc(Kit.t('keine'))}</i>`}</div><div class="kact"><button class="btn sm" data-krec="${a[0]}">${esc(Kit.t('Ändern'))}</button><button class="btn sm" data-kclr="${a[0]}">${esc(Kit.t('Leeren'))}</button>${own?`<button class="btn sm" data-kdef="${a[0]}">${esc(Kit.t('Standard'))}</button>`:''}</div></div>`};
  const hit=(a,q)=>{if(!q)return true;const hay=[a[2],Kit.t(a[2]),a[1],Kit.t(a[1]),...combos(a[0]).map(c=>c+' '+K.show(c))].join(' ').toLowerCase();return q.split(/\s+/).filter(Boolean).every(w=>hay.includes(w))};
  const draw=()=>{UI.locked=!!rec;const q=($('#kq')&&$('#kq').value||'').toLowerCase();const html=groups.map(g=>{const rs=A.filter(a=>a[1]===g&&hit(a,q));return rs.length?`<h4>${esc(Kit.t(g))}</h4>`+rs.map(row).join(''):''}).join('');$('#klist').innerHTML=(html||`<p class="kempty">${esc(Kit.t('Nichts gefunden.'))}</p>`)+`<p class="muted" style="font-size:12px;margin-top:12px">${esc(Kit.t('Leertaste gedrückt halten und ziehen verschiebt die Ansicht. Strg+V fügt ein Bild aus der Zwischenablage ein.'))}</p>`};
  UI.modal(`<div class="mhead"><h3>${esc(Kit.t('Tastenkürzel'))}</h3><label class="ksbox"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="kq" class="ksearch" type="search" placeholder="${esc(Kit.t('Aktion oder Taste suchen …'))}" spellcheck="false" autocomplete="off"></label><button class="btn" data-kall>${esc(Kit.t('Alle zurücksetzen'))}</button><button class="ib" data-close>×</button></div><div class="mbody"><div id="klist" class="klist"></div></div>`);
  $('#mbox').style.width='min(760px,94vw)';
  draw();const mb=$('#mbox');if(!rec)setTimeout(()=>$('#kq')&&$('#kq').focus(),30);if(rec)setTimeout(()=>{const r=$('#klist .krow.rec');if(r)r.scrollIntoView({block:'center'})},30);
  mb.oninput=e=>{if(e.target.id==='kq')draw()};
  mb.onclick=e=>{let b;
   if(e.target.closest('[data-close]')){rec=null;$('#mbox').style.width='';return UI.close()}
   if(b=e.target.closest('[data-krec]')){rec=b.dataset.krec;return draw()}
   if(b=e.target.closest('[data-kclr]')){custom[b.dataset.kclr]=[];store();return draw()}
   if(b=e.target.closest('[data-kdef]')){delete custom[b.dataset.kdef];store();return draw()}
   if(e.target.closest('[data-kall]')){custom={};store();return draw()}};
  const cap=e=>{if(!rec||!$('#klist'))return;e.preventDefault();e.stopPropagation();
   if(e.key==='Escape'){rec=null;return draw()}const c=K.fromEvent(e);if(!c)return;
   const other=find(c);if(other&&other!==rec){custom[other]=combos(other).filter(x=>x!==c);Kit.toast(Kit.t('Vorher belegt mit:')+' '+Kit.t(byId[other][2]))}
   custom[rec]=[c];rec=null;store();draw()};
  document.addEventListener('keydown',cap,true);
  const stop=new MutationObserver(()=>{if(!$('#modal').classList.contains('show')){document.removeEventListener('keydown',cap,true);rec=null;$('#mbox').style.width='';stop.disconnect()}});stop.observe($('#modal'),{attributes:true,attributeFilter:['class']})};
 return K})();

UI.boot();
Dock.onChange(()=>{requestAnimationFrame(()=>{try{View.resize();View.draw()}catch(e){}})});try{new ResizeObserver(()=>{if(Doc.d)try{View.resize();View.draw()}catch(e){}}).observe(document.getElementById('stage'))}catch(e){}Dock.init().then(()=>{Dock.ready=true;Dock.hide(UI.mode==='simple'?['tools']:[])});
