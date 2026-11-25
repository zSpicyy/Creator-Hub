// StreamPilot – Navigation oben wie in Social-Planer: Bereiche als Reiter, darunter die Seiten des Bereichs.
(()=>{const groups=()=>{const out=[];let g=null;for(const [k,i] of NAV){if(k==='grp'){g={label:i,items:[]};out.push(g)}else{if(!g){g={label:'',items:[]};out.push(g)}g.items.push([k,i])}}return out.filter(x=>x.items.length)};
 const orig=window.renderNav;const isTop=()=>document.documentElement.dataset.nav==='top';
 window.renderNav=function(){if(!isTop())return orig();const gs=groups();const cur=gs.find(g=>g.items.some(([k])=>k===page))||gs[0];
  const top=gs.map(g=>`<button type="button" class="ch-item grp-tab ${g===cur?'on':''}" data-gp="${g.items[0][0]}">${t(g.label)}</button>`).join('');
  const sub=cur&&cur.items.length>1?cur.items.map(([k,i])=>`<button data-page="${k}" class="ch-item sub ${page===k?'on':''}">${ic(i)}${t('nav_'+k)}${k==='sort'?`<span class="beta">${t('beta')}</span>`:''}</button>`).join(''):'';
  $('#nav').innerHTML=`<div class="nrow">${top}</div>${sub?`<div class="nrow subs">${sub}</div>`:''}`};
 document.addEventListener('click',e=>{const b=e.target.closest('[data-gp]');if(!b)return;page=b.dataset.gp;render();$('#app').scrollTop=0});
 const st=document.createElement('style');st.textContent=`
 html[data-nav=top] body{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto auto minmax(0,1fr)!important;grid-template-areas:"top" "nav" "main"!important}
 html[data-nav=top] #nav{flex-direction:column!important;align-items:stretch!important;gap:0!important;padding:0!important}
 html[data-nav=top] #nav .nrow{display:flex;gap:4px;padding:8px 20px;overflow-x:auto;scrollbar-width:none}
 html[data-nav=top] #nav .nrow.subs{padding-top:0;padding-bottom:10px}
 html[data-nav=top] #nav .sub{font-weight:600;padding:5px 13px!important;font-size:13.5px;display:flex;align-items:center;gap:7px}
 html[data-nav=top] #nav .sub.on{background:color-mix(in srgb,var(--accent) 16%,var(--panel))!important;color:var(--text)!important}
 html[data-nav=top] #nav .sub.on svg{color:var(--accent)!important}
 html[data-nav=top] #nav .grp-tab .feat-off-tag{display:none}
 html[data-nav=top] #nav .sub .feat-off-tag{margin-left:2px}
 html[data-nav=top] #app{padding-top:24px}`;document.head.appendChild(st);
 if(typeof S!=='undefined'&&S)render();
 let lm=isTop();document.addEventListener('kit-theme',()=>{if(isTop()!==lm){lm=isTop();if(typeof S!=='undefined'&&S)render()}});
})();
