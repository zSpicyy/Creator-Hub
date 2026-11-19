// Regler wie in GIMP: Name, Balken und Wert in einer Zeile – der Balken füllt sich, Ziehen/Klicken ändert,
// Mausrad ändert, Klick auf die Zahl zum Eintippen. Wird auf alle einfachen Regler (Name, Regler, Wert) angewendet.
(()=>{const fill=r=>{const mn=r.min===''?0:+r.min,mx=r.max===''?100:+r.max;r.style.setProperty('--p',Math.max(0,Math.min(100,((+r.value-mn)/((mx-mn)||1))*100))+'%')};
 const tag=root=>{for(const r of root.querySelectorAll('input[type=range]')){const p=r.parentElement;if(p&&!p.classList.contains('ss')){const k=[...p.children];if(k.length===3&&k[1]===r&&k[0].tagName==='SPAN'&&(k[2].tagName==='B'||k[2].classList.contains('v')))p.classList.add('ss')}fill(r)}};
 let q=0;const later=()=>{if(q)return;q=requestAnimationFrame(()=>{q=0;tag(document.body)})};
 new MutationObserver(later).observe(document.body,{childList:true,subtree:true});addEventListener('pointerup',later,true);addEventListener('change',later,true);addEventListener('keyup',later,true);
 document.addEventListener('input',e=>{if(e.target.matches&&e.target.matches('input[type=range]'))fill(e.target)},true);
 document.addEventListener('wheel',e=>{if(e.defaultPrevented)return;const r=e.target.closest&&e.target.closest('.ss')?.querySelector('input[type=range]');if(!r)return;e.preventDefault();const mn=+r.min||0,mx=r.max===''?100:+r.max,st=Math.max(+r.step||1,(mx-mn)>200?Math.round((mx-mn)/100):1);
  r.value=Math.max(mn,Math.min(mx,+r.value+(e.deltaY<0?st:-st)));r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}))},{passive:false});
 document.addEventListener('click',e=>{if(e.defaultPrevented)return;const s=e.target.closest&&e.target.closest('.ss');if(!s)return;const v=s.lastElementChild;if(!v||!v.contains(e.target)||v.tagName==='INPUT')return;e.preventDefault();if(v.querySelector('input'))return;const r=s.querySelector('input[type=range]');
  const u=v.textContent.replace(/^[-\d.,\s]+/,'');const inp=document.createElement('input');inp.type='number';inp.value=r.value;inp.min=r.min;inp.max=r.max;inp.step=r.step||1;inp.className='onum';v.textContent='';v.appendChild(inp);inp.focus();inp.select();
  const done=ok=>{if(ok&&inp.value!==''){r.value=Math.max(+r.min,Math.min(+r.max,+inp.value));r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}))}if(v.contains(inp))v.textContent=r.value+u;fill(r)};
  inp.onkeydown=ev=>{ev.stopPropagation();if(ev.key==='Enter')inp.blur();if(ev.key==='Escape'){inp.onblur=null;done(false)}};inp.onblur=()=>done(true)});
 tag(document.body)})();
