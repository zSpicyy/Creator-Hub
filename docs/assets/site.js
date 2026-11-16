// Gemeinsam für alle Seiten: Design (folgt dem Hell-/Dunkelmodus des Browsers), Sprache, Version von GitHub,
// Download-Knöpfe (zeigen immer auf die neueste Version für das gewählte System).
(()=>{const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],REPO=CH.repo;
const LIGHT=['light','latte'],ls={get:k=>{try{return localStorage.getItem(k)||''}catch(e){return''}},set:(k,v)=>{try{v?localStorage.setItem(k,v):localStorage.removeItem(k)}catch(e){}}};
const mq=window.matchMedia?matchMedia('(prefers-color-scheme: light)'):{matches:false};const mode=()=>mq.matches?'light':'dark';
CH.ls=ls;
function theme(){const fixed=ls.get('ch-theme'),t=fixed||ls.get('ch-theme-'+mode())||(mode()==='light'?'light':'black');document.documentElement.setAttribute('data-ch',t);
 const mt=$('meta[name=theme-color]');if(mt)mt.content=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
 $$('#thMenu [data-th]').forEach(b=>b.setAttribute('aria-checked',fixed?b.dataset.th===fixed:(b.dataset.th==='auto'||b.dataset.th===t)));
 const de=document.documentElement.lang==='de',n=$('#thNow');if(n)n.textContent=mode()==='light'?(de?'Browser: hell':'browser: light'):(de?'Browser: dunkel':'browser: dark');
 document.dispatchEvent(new CustomEvent('ch-theme',{detail:t}))}
CH.theme=theme;
const thBtn=$('#thBtn'),thMenu=$('#thMenu'),thOpen=o=>{thMenu.classList.toggle('on',o);thBtn.setAttribute('aria-expanded',o)};
thBtn.onclick=e=>{e.stopPropagation();thOpen(!thMenu.classList.contains('on'))};
document.addEventListener('click',e=>{if(!thMenu.contains(e.target))thOpen(false)});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&thMenu.classList.contains('on')){thOpen(false);thBtn.focus()}});
$$('#thMenu [data-th]').forEach(b=>b.onclick=()=>{const t=b.dataset.th;if(t==='auto')ls.set('ch-theme','');else if((LIGHT.includes(t)?'light':'dark')===mode()){ls.set('ch-theme','');ls.set('ch-theme-'+mode(),t)}else ls.set('ch-theme',t);theme()});
if(mq.addEventListener)mq.addEventListener('change',theme);
// Sprache
const setLang=l=>{document.documentElement.lang=l;$$('.langs button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lang===l));ls.set('ch-lang',l);theme();paint();document.dispatchEvent(new CustomEvent('ch-lang',{detail:l}))};
CH.lang=()=>document.documentElement.lang==='de'?'de':'en';
$$('.langs button').forEach(b=>b.onclick=()=>setLang(b.dataset.lang));
// Version und Downloads
const DLB='https://github.com/'+REPO+'/releases/latest/download/';
const HUBF={win:'Creator-Hub-Setup.exe',linux:'Creator-Hub-x86_64.AppImage',macarm:'Creator-Hub-macOS-AppleSilicon.zip',macintel:'Creator-Hub-macOS-Intel.zip'};
const SUF={win:'-Setup.exe',linux:'-Linux-x86_64.AppImage',macarm:'-macOS-AppleSilicon.zip',macintel:'-macOS-Intel.zip'};
let rel=null;
const fmtDate=d=>new Date(d).toLocaleDateString(CH.lang()==='de'?'de-DE':'en-GB',{day:'numeric',month:'long',year:'numeric'});
const fmtSize=b=>(b/1048576).toFixed(0)+' MB';
function paint(){const de=CH.lang()==='de',os=CH.os||'win';document.body.classList.toggle('os-win',os==='win');
 for(const p of $$('a.portable[data-base]'))p.href=DLB+p.dataset.base+'-Windows.exe';
 for(const b of $$('a.get[data-base]')){const f=b.dataset.base==='Creator-Hub'?HUBF[os]:b.dataset.base+SUF[os],sm=b.querySelector('small'),t=b.querySelector('.get-tx');b.href=DLB+f;b.setAttribute('download','');
  const as=rel&&(rel.assets||[]).find(x=>x.name===f),miss=rel&&!as;
  sm.textContent=as?fmtSize(as.size):'';b.setAttribute('aria-disabled',miss?'true':'false');
  t.textContent=miss?(de?'Kommt mit der nächsten Version':'Coming with the next version'):(de?'Herunterladen':'Download')}
 const v=rel?rel.tag_name.replace(/^v/,''):(de?'aktuell':'latest');$$('.js-ver').forEach(e=>e.textContent=v);
 if(rel){const d=fmtDate(rel.published_at);$$('.js-date').forEach(e=>e.textContent=d);$$('.js-datewrap').forEach(e=>e.hidden=false);$$('.js-date2').forEach(e=>e.textContent=(de?', veröffentlicht am ':', released ')+d);
  const n=$('#news'),parts=(rel.body||'').split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean),t=parts.length>1?(de?parts[0]:parts[1]):parts[0];if(n&&t){$('#newsTx').textContent=t;n.hidden=false}}}
CH.paint=paint;
let lang=ls.get('ch-lang');if(lang!=='de'&&lang!=='en')lang=(navigator.language||'en').toLowerCase().startsWith('de')?'de':'en';
const KEY='ch-rel';try{const c=JSON.parse(sessionStorage.getItem(KEY)||'null');if(c&&Date.now()-c.t<6e5)rel=c.r}catch(e){}
setLang(lang);
if(!rel)fetch(`https://api.github.com/repos/${REPO}/releases/latest`,{headers:{Accept:'application/vnd.github+json'}}).then(r=>r.ok?r.json():null).then(r=>{if(!r||!r.tag_name)return;rel={tag_name:r.tag_name,published_at:r.published_at,body:r.body,assets:(r.assets||[]).map(a=>({name:a.name,size:a.size}))};try{sessionStorage.setItem(KEY,JSON.stringify({t:Date.now(),r:rel}))}catch(e){}paint()}).catch(()=>{});
})();
