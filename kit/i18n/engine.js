// Übersetzt alle Texte im Fenster ins Englische, auch solche, die später erscheinen.
function tr0(t){if(Object.prototype.hasOwnProperty.call(EN,t))return EN[t];for(const [re,rep] of PAT){if(re.test(t))return t.replace(re,rep)}return null}
function trText(s){const t=s.trim();if(!t||!/[A-Za-zÄÖÜäöüß]/.test(t))return null;const e=tr0(t);if(e==null||e===t)return null;return s.replace(t,e)}
const ATTRS=['title','placeholder','aria-label','alt'];
function walk(n){
 if(n.nodeType===3){const p=n.parentNode;if(p&&(p.nodeName==='SCRIPT'||p.nodeName==='STYLE'||p.nodeName==='TEXTAREA'||p.isContentEditable))return;const r=trText(n.nodeValue);if(r!=null)n.nodeValue=r;return}
 if(n.nodeType!==1)return;if(n.nodeName==='SCRIPT'||n.nodeName==='STYLE')return;
 for(const a of ATTRS){if(n.hasAttribute(a)){const r=trText(n.getAttribute(a));if(r!=null)n.setAttribute(a,r)}}
 if(n.nodeName==='INPUT'&&(n.type==='button'||n.type==='submit')&&n.value){const r=trText(n.value);if(r!=null)n.value=r}
 for(const c of n.childNodes)walk(c)}
let on=false;
const mo=new MutationObserver(ms=>{for(const m of ms){if(m.type==='childList')m.addedNodes.forEach(walk);else if(m.type==='characterData')walk(m.target);else if(m.type==='attributes')walk(m.target)}});
window.I18N={lang:'de',
 start(){if(on)return;on=true;this.lang='en';document.documentElement.lang='en';const t=trText(document.title);if(t)document.title=t;
  const go=()=>{walk(document.body);mo.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTRS})};
  if(document.body)go();else document.addEventListener('DOMContentLoaded',go)},
 t(s){return on?(trText(s)??s):s}};
