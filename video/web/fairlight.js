// Videoschnitt – Ton wie in Fairlight: Kanalzug je Clip in der Vorschau hörbar (Hochpass, Tiefpass, Kompressor,
// Verstärkung, Limiter – gleiche Einstellungen wie beim Export in render.go: audioFxFF) und Lautheitsmessung (LUFS).
(()=>{const t=s=>Kit.t(s);let ctx=null;const chains=new Map();
 const active=a=>!!a&&((a.hpf||0)>=20||((a.lpf||20000)<20000)||(a.comp||0)>0.01||Math.abs(a.gain||0)>0.05||a.limit);
 const resume=()=>{if(ctx&&ctx.state==='suspended')ctx.resume().catch(()=>{})};
 addEventListener('pointerdown',resume,true);addEventListener('keydown',resume,true);
 // Kanalzug an ein Medien-Element hängen (erst, wenn der Clip wirklich Tonbearbeitung hat)
 const attach=(e)=>{if(chains.has(e))return chains.get(e);try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();resume();
   const src=ctx.createMediaElementSource(e),hp=ctx.createBiquadFilter(),lp=ctx.createBiquadFilter(),comp=ctx.createDynamicsCompressor(),gain=ctx.createGain(),lim=ctx.createDynamicsCompressor();
   hp.type='highpass';lp.type='lowpass';lim.threshold.value=-1;lim.knee.value=0;lim.ratio.value=20;lim.attack.value=.003;lim.release.value=.05;
   src.connect(hp).connect(lp).connect(comp).connect(gain).connect(lim).connect(ctx.destination);const ch={hp,lp,comp,gain,lim};chains.set(e,ch);return ch}catch(x){chains.set(e,null);return null}};
 const set=(ch,a)=>{a=a||{};const T=ctx.currentTime;
  ch.hp.frequency.setTargetAtTime((a.hpf||0)>=20?a.hpf:10,T,.02);ch.lp.frequency.setTargetAtTime((a.lpf||20000)<20000?a.lpf:22000,T,.02);
  const k=Math.min(1,a.comp||0);ch.comp.threshold.setTargetAtTime(k>0.01?-10-20*k:0,T,.02);ch.comp.ratio.setTargetAtTime(k>0.01?2+6*k:1,T,.02);ch.comp.knee.value=4;ch.comp.attack.value=.01;ch.comp.release.value=.15;
  const g=Math.pow(10,((a.gain||0)+(k>0.01?6*k:0))/20);ch.gain.gain.setTargetAtTime(g,T,.02);
  ch.lim.threshold.setTargetAtTime(a.limit?-1:0,T,.02);ch.lim.ratio.setTargetAtTime(a.limit?20:1,T,.02)};
 setInterval(()=>{if(!App.P)return;const hid=document.getElementById('hidden');if(!hid)return;
  for(const e of hid.querySelectorAll('video,audio')){const id=e.dataset.clip;if(!id)continue;const f=App.find(id);if(!f)continue;const a=f.c.audio;
   if(!chains.has(e)&&!active(a))continue;const ch=attach(e);if(ch)set(ch,a)}},250);

 // Lautheit messen (Export-Fenster)
 document.addEventListener('click',async e=>{const b=e.target.closest('#exmeasure');if(!b)return;const out=document.getElementById('exlufs');b.disabled=true;out.textContent=t('Wird gemessen …');
  try{if(App.saveNow)await App.saveNow();const r=await fetch('api/loudness?id='+encodeURIComponent(App.P.id));const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);
   const sel=document.getElementById('exloud'),target=sel?+sel.value:0;
   out.textContent=`${t('Integriert')} ${j.i.toFixed(1)} LUFS · LRA ${j.lra.toFixed(1)} LU · ${t('Spitze')} ${j.peak.toFixed(1)} dBFS`+(target<0?` · ${t('Ziel')} ${target} LUFS (${(target-j.i>=0?'+':'')+(target-j.i).toFixed(1)} dB)`:'')}
  catch(x){out.textContent=t('Messen fehlgeschlagen: ')+(x.message||x)}finally{b.disabled=false}});
})();
