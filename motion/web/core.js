// Kern von Motion Design: Datenmodell, Keyframes (mit Easing wie After Effects), Expressions,
// Formen, Text-Animatoren, Masken, Track Mattes, Mischmodi, Effekte und das Zeichnen einer Komposition.
const M=(()=>{const M={};
 const uid=()=>Math.random().toString(36).slice(2,10);M.uid=uid;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));M.clamp=clamp;
 const lerp=(a,b,u)=>a+(b-a)*u;
 // ---------- Eigenschaften ----------
 M.P=(v)=>({v});
 M.clone=o=>JSON.parse(JSON.stringify(o));
 const isArr=Array.isArray;
 const hex2rgb=h=>{h=String(h||'#000').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h.slice(0,6),16)||0;return[n>>16&255,n>>8&255,n&255]};M.hex2rgb=hex2rgb;
 const rgb2hex=(r,g,b)=>'#'+[r,g,b].map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');M.rgb2hex=rgb2hex;
 const mix=(a,b,u)=>{if(typeof a==='number'&&typeof b==='number')return lerp(a,b,u);
  if(typeof a==='string'&&a[0]==='#'&&typeof b==='string'&&b[0]==='#'){const x=hex2rgb(a),y=hex2rgb(b);return rgb2hex(lerp(x[0],y[0],u),lerp(x[1],y[1],u),lerp(x[2],y[2],u))}
  if(isArr(a)&&isArr(b))return a.map((v,i)=>mix(v,b[i]??v,u));
  if(a&&b&&typeof a==='object'&&a.v&&b.v&&a.v.length===b.v.length)return{c:a.c,v:mix(a.v,b.v,u),i:mix(a.i,b.i,u),o:mix(a.o,b.o,u)};
  return u<1?a:b};M.mix=mix;
 // kubische Bézierkurve wie in After Effects: Zeit (x) → Fortschritt (y)
 const bez=(x1,y1,x2,y2,x)=>{if(x<=0)return 0;if(x>=1)return 1;if(x1===y1&&x2===y2)return x;let lo=0,hi=1,t=x;for(let i=0;i<24;i++){const cx=3*t*(1-t)*(1-t)*x1+3*t*t*(1-t)*x2+t*t*t;if(Math.abs(cx-x)<1e-5)break;if(cx<x)lo=t;else hi=t;t=(lo+hi)/2}return 3*t*(1-t)*(1-t)*y1+3*t*t*(1-t)*y2+t*t*t};M.bez=bez;
 M.LIN_O=[1/3,1/3];M.LIN_I=[2/3,2/3];M.EASE_O=[1/3,0];M.EASE_I=[2/3,1];
 // Wert aus Keyframes (t in Ebenenzeit)
 const kfVal=(p,t)=>{const k=p.k;if(!k||!k.length)return p.v;if(t<=k[0].t)return k[0].v;const n=k.length;if(t>=k[n-1].t)return k[n-1].v;
  let i=0;while(i<n-2&&t>=k[i+1].t)i++;const a=k[i],b=k[i+1];if(a.h)return a.v;const u=(t-a.t)/Math.max(1e-9,b.t-a.t);const eo=a.eo||M.LIN_O,ei=b.ei||M.LIN_I;
  const y=bez(eo[0],eo[1],ei[0],ei[1],u);return mix(a.v,b.v,y)};M.kfVal=kfVal;
 // ---------- Expressions ----------
 const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
 const rnd=seed=>{let s=seed>>>0||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return((s>>>0)%1e6)/1e6}};
 const noise1=(seed,x)=>{const i=Math.floor(x),f=x-i;const r=n=>{let h=hash(seed+':'+n);return(h%10000)/5000-1};const u=f*f*(3-2*f);return lerp(r(i),r(i+1),u)};
 const fnCache=new Map();
 const compile=code=>{if(fnCache.has(code))return fnCache.get(code);let f=null;const names=['time','value','wiggle','loopOut','loopIn','linear','ease','easeIn','easeOut','clamp','random','index','thisComp','thisLayer','degreesToRadians','radiansToDegrees','posterizeTime','valueAtTime','length','add','sub','mul','div','Math','framesToTime','timeToFrames'];
  const body=code.trim();const lines=body.split(/;\s*\n|;|\n/).map(s=>s.trim()).filter(Boolean);
  const src=lines.length<=1?'return ('+(lines[0]||'value')+');':lines.slice(0,-1).join(';\n')+';\nreturn ('+lines[lines.length-1]+');';
  try{f=new Function(...names,src)}catch(e){f=e}fnCache.set(code,f);return f};
 M.exprError=code=>{const f=compile(code);return f instanceof Error?f.message:null};
 // ---------- Zugriff auf Eigenschaften mit Expressions ----------
 // ctx: {comp, layer, idx, key, t (Ebenenzeit), ct (Kompositionszeit)}
 M.val=(p,ctx)=>{if(!p)return undefined;let v=kfVal(p,ctx.t);if(p.x&&p.xon!==false){v=runExpr(p,v,ctx)}return v};
 const runExpr=(p,v,ctx)=>{const f=compile(p.x);if(f instanceof Error){p._err=f.message;return v}const L=ctx.layer||{},comp=ctx.comp||{};const fps=comp.fps||30;const seed=(L.id||'')+(ctx.key||'');
  const wiggle=(freq,amp,oct=1,ampMul=.5,tt)=>{const T=(tt??ctx.ct)*freq;const one=(d)=>{let s=0,a=1,fr=1,norm=0;for(let o=0;o<Math.max(1,oct);o++){s+=noise1(seed+d+':'+o,T*fr)*a;norm+=a;a*=ampMul;fr*=2}return s/norm*amp};return isArr(v)?v.map((x,d)=>x+one(d)):(typeof v==='number'?v+one(0):v)};
  const atT=tt=>kfVal(p,tt);
  const loop=(type,n,out)=>{const k=p.k;if(!k||k.length<2)return v;const t=ctx.t;type=type||'cycle';const a=out?(n?k[Math.max(0,k.length-1-n)].t:k[0].t):k[0].t,b=out?k[k.length-1].t:(n?k[Math.min(k.length-1,n)].t:k[k.length-1].t),d=b-a;if(d<=0)return v;
   if(out&&t<=b)return v;if(!out&&t>=a)return v;const rel=out?t-a:b-t;const cyc=Math.floor(rel/d);let u=rel-cyc*d;
   if(type==='pingpong'&&cyc%2===1)u=d-u;if(type==='continue'){const e=out?b:a;const v1=atT(e),v0=atT(out?e-1/fps:e+1/fps);const dt=out?t-e:e-t;return mix(v1,mix(v1,v0,-1),dt*fps)}
   let r=atT(out?a+u:b-u);if(type==='offset'){const dv=sub(atT(b),atT(a));r=add(r,mul(dv,out?cyc:-cyc))}return r};
  const add=(x,y)=>isArr(x)?x.map((a,i)=>a+(isArr(y)?y[i]:y)):x+y,sub=(x,y)=>isArr(x)?x.map((a,i)=>a-(isArr(y)?y[i]:y)):x-y,mul=(x,s)=>isArr(x)?x.map(a=>a*s):x*s,div=(x,s)=>isArr(x)?x.map(a=>a/s):x/s;
  const linear=(t,a,b,v1,v2)=>{if(v2===undefined){v2=b;v1=a;a=0;b=1}const u=clamp((t-a)/(b-a||1),0,1);return mix(v1,v2,u)};
  const easeF=(fn)=>(t,a,b,v1,v2)=>{if(v2===undefined){v2=b;v1=a;a=0;b=1}const u=clamp((t-a)/(b-a||1),0,1);return mix(v1,v2,fn(u))};
  const R=rnd(hash(seed));const random=(a,b)=>{const r=R();if(a===undefined)return r;if(b===undefined)return isArr(a)?a.map(x=>x*R()):r*a;return isArr(a)?a.map((x,i)=>x+(b[i]-x)*R()):a+(b-a)*r};
  const thisComp={width:comp.w,height:comp.h,duration:comp.dur,frameDuration:1/fps,numLayers:(comp.layers||[]).length,layer:(n)=>{const ls=comp.layers||[];const l=typeof n==='number'?ls[n-1]:ls.find(x=>x.name===n);return l?layerApi(l,comp,ctx.ct):null}};
  const thisLayer=layerApi(L,comp,ctx.ct);
  try{const r=f(ctx.ct,v,wiggle,(ty,n)=>loop(ty,n,true),(ty,n)=>loop(ty,n,false),linear,easeF(u=>bez(.33,0,.67,1,u)),easeF(u=>bez(.33,0,1,1,u)),easeF(u=>bez(0,0,.67,1,u)),clamp,random,(ctx.idx??0)+1,thisComp,thisLayer,d=>d*Math.PI/180,r=>r*180/Math.PI,
    fr=>{const st=1/fr;return Math.floor(ctx.ct/st)*st},tt=>atT(tt-(L.st||0)),(a,b)=>{if(b===undefined)return isArr(a)?Math.hypot(...a):Math.abs(a);return Math.hypot(...a.map((x,i)=>x-b[i]))},add,sub,mul,div,Math,f=>f/fps,s=>Math.round(s*fps));
   delete p._err;if(r===undefined||r===null||(typeof r==='number'&&!isFinite(r)))return v;if(isArr(v)&&typeof r==='number')return v.map(()=>r);return r}catch(e){p._err=e.message;return v}};
 const layerApi=(l,comp,ct)=>({name:l.name,index:(comp.layers||[]).indexOf(l)+1,inPoint:l.in,outPoint:l.out,startTime:l.st,
  transform:new Proxy({},{get:(o,k)=>{const map={position:'pos',scale:'scale',rotation:'rot',opacity:'op',anchorPoint:'anchor'};const key=map[k]||k;const p=l.tr&&l.tr[key];return p?M.val(p,{comp,layer:l,key,t:ct-(l.st||0),ct}):undefined}}),
  get position(){return this.transform.position},get scale(){return this.transform.scale},get rotation(){return this.transform.rotation},get opacity(){return this.transform.opacity}});

 // ---------- Neue Objekte ----------
 M.LABELS=['#e05252','#e3a33b','#e8d84f','#6ac46a','#45b8c4','#4f86e0','#9a6ce0','#e06fb8','#a1a1a1','#c48a57'];
 M.newComp=(o={})=>Object.assign({id:uid(),name:'Komp 1',w:1920,h:1080,fps:30,dur:10,bg:'#000000',layers:[],work:null,mb:true,markers:[]},o);
 const tr=(w,h,o={})=>({anchor:M.P(o.anchor||[w/2,h/2]),pos:M.P(o.pos||[0,0]),scale:M.P([100,100]),rot:M.P(0),op:M.P(100)});
 M.newLayer=(type,comp,o={})=>{const W=comp.w,H=comp.h,dur=comp.dur;const base={id:uid(),type,name:o.name||type,label:M.LABELS[{solid:0,shape:5,text:2,image:7,video:4,audio:3,null:8,adjust:1,comp:6}[type]??8],
  st:0,in:0,out:dur,hidden:false,solo:false,locked:false,shy:false,mb:false,blend:'normal',matte:null,parent:null,masks:[],fx:[],open:false};
  let l;const C=[W/2,H/2];
  if(type==='solid'){l={...base,solid:{color:o.color||'#4f5bd5',w:o.w||W,h:o.h||H},tr:tr(o.w||W,o.h||H,{pos:C})}}
  else if(type==='adjust'){l={...base,name:o.name||'Einstellungsebene',solid:{color:'#ffffff',w:W,h:H},tr:tr(W,H,{pos:C})}}
  else if(type==='null'){l={...base,name:o.name||'Null-Objekt',tr:tr(100,100,{pos:C,anchor:[50,50]})}}
  else if(type==='shape'){l={...base,name:o.name||'Formebene',tr:tr(0,0,{pos:C,anchor:[0,0]}),shape:{items:o.items||[],fill:{on:true,type:'solid',color:M.P(o.fill||'#ff4d6d'),c2:M.P('#ffd166'),p1:M.P([-100,0]),p2:M.P([100,0]),op:M.P(100)},
   stroke:{on:!!o.stroke,color:M.P(o.strokeColor||'#ffffff'),w:M.P(o.strokeW||8),op:M.P(100),cap:'round',join:'round',dash:M.P(0),gap:M.P(0),off:M.P(0)},
   trim:{on:false,s:M.P(0),e:M.P(100),o:M.P(0)},rep:{on:false,n:M.P(3),off:M.P(0),pos:M.P([120,0]),scale:M.P([100,100]),rot:M.P(0),sop:M.P(100),eop:M.P(100)},round:M.P(0)}}}
  else if(type==='text'){l={...base,name:o.name||(o.str||'Text').slice(0,24),tr:tr(0,0,{pos:o.pos||C,anchor:[0,0]}),text:{str:o.str||'Text',font:o.font||'Arial',size:M.P(o.size||120),color:M.P(o.color||'#ffffff'),
   sw:M.P(0),sc:M.P('#000000'),track:M.P(0),lead:M.P(1.2),align:o.align||'center',bold:true,italic:false,box:0,
   anims:[]}}}
  else if(type==='image'||type==='video'){l={...base,asset:o.asset,src:{w:o.w||W,h:o.h||H,dur:o.dur||dur},speed:1,vol:M.P(100),tr:tr(o.w||W,o.h||H,{pos:C})};if(type==='video'){l.out=Math.min(dur,o.dur||dur)}}
  else if(type==='audio'){l={...base,asset:o.asset,src:{dur:o.dur||dur},vol:M.P(100),tr:tr(0,0,{pos:C})};l.out=Math.min(dur,o.dur||dur)}
  else if(type==='comp'){l={...base,comp:o.comp,src:{w:o.w,h:o.h,dur:o.dur},tr:tr(o.w,o.h,{pos:C})}}
  return l};
 M.newMask=(path,o={})=>({id:uid(),name:o.name||'Maske',mode:'add',inv:false,path:M.P(path),feather:M.P(0),op:M.P(100),exp:M.P(0),open:true});
 M.rectPath=(x,y,w,h)=>({c:true,v:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],i:[[0,0],[0,0],[0,0],[0,0]],o:[[0,0],[0,0],[0,0],[0,0]]});
 M.ellipsePath=(cx,cy,rx,ry)=>{const k=.5523;return{c:true,v:[[cx,cy-ry],[cx+rx,cy],[cx,cy+ry],[cx-rx,cy]],i:[[-rx*k,0],[0,-ry*k],[rx*k,0],[0,ry*k]],o:[[rx*k,0],[0,ry*k],[-rx*k,0],[0,-ry*k]]}};

 // ---------- Matrizen ----------
 // [a,b,c,d,e,f] wie DOMMatrix 2D
 const mul=(m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];M.mmul=mul;
 const inv=m=>{const d=m[0]*m[3]-m[1]*m[2]||1e-12;return[m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d]};M.minv=inv;
 M.apply=(m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
 const ctxOf=(comp,l,ct)=>({comp,layer:l,t:ct-(l.st||0),ct});
 M.ltime=(l,ct)=>ct-(l.st||0);
 // Matrix einer Ebene (mit Eltern-Ebenen) zur Kompositionszeit ct
 M.matrix=(comp,l,ct,depth=0)=>{const c=ctxOf(comp,l,ct);const g=k=>M.val(l.tr[k],{...c,key:k});const a=g('anchor'),p=g('pos'),s=g('scale'),r=g('rot')*Math.PI/180;
  const co=Math.cos(r),si=Math.sin(r);const sx=s[0]/100,sy=s[1]/100;let m=[co*sx,si*sx,-si*sy,co*sy,p[0],p[1]];m=mul(m,[1,0,0,1,-a[0],-a[1]]);
  if(l.parent&&depth<20){const par=comp.layers.find(x=>x.id===l.parent);if(par)m=mul(M.matrix(comp,par,ct,depth+1),m)}return m};
 // Größe des Ebeneninhalts (für Begrenzungsrahmen)
 M.bounds=(comp,l,ct)=>{if(l.solid)return[0,0,l.solid.w,l.solid.h];if(l.src&&l.src.w)return[0,0,l.src.w,l.src.h];if(l.type==='null')return[0,0,100,100];
  if(l.type==='shape'){const g=shapeGeo(comp,l,ct);let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of g.paths)for(let i=0;i<p.v.length;i++){const v=p.v[i];x0=Math.min(x0,v[0]);y0=Math.min(y0,v[1]);x1=Math.max(x1,v[0]);y1=Math.max(y1,v[1])}if(x0>x1)return[-50,-50,100,100];const sw=g.stroke?g.sw/2:0;return[x0-sw,y0-sw,x1-x0+sw*2,y1-y0+sw*2]}
  if(l.type==='text'){const lay=textLayout(comp,l,ct);return[lay.x0,lay.y0,lay.x1-lay.x0,lay.y1-lay.y0]}return[0,0,0,0]};

 // ---------- Formen ----------
 const vx=(p,i)=>p.v[i];
 const pathTo=(ctx,p)=>{const n=p.v.length;if(!n)return;ctx.moveTo(p.v[0][0],p.v[0][1]);for(let i=1;i<=n;i++){if(i===n&&!p.c)break;const a=p.v[i-1],b=p.v[i%n],o=p.o[i-1]||[0,0],ii=p.i[i%n]||[0,0];
   if(!o[0]&&!o[1]&&!ii[0]&&!ii[1])ctx.lineTo(b[0],b[1]);else ctx.bezierCurveTo(a[0]+o[0],a[1]+o[1],b[0]+ii[0],b[1]+ii[1],b[0],b[1])}if(p.c)ctx.closePath()};M.pathTo=pathTo;
 const starPath=(it,c)=>{const n=Math.max(3,Math.round(M.val(it.pts,c))),pos=M.val(it.pos,c),or=M.val(it.or,c),ir=M.val(it.ir,c),rot=M.val(it.rot,c)*Math.PI/180;const poly=it.type==='polygon';const v=[];const cnt=poly?n:n*2;
  for(let i=0;i<cnt;i++){const ang=rot-Math.PI/2+i*Math.PI*2/cnt;const r=poly||i%2===0?or:ir;v.push([pos[0]+Math.cos(ang)*r,pos[1]+Math.sin(ang)*r])}return{c:true,v,i:v.map(()=>[0,0]),o:v.map(()=>[0,0])}};
 const roundRect=(x,y,w,h,r)=>{r=Math.max(0,Math.min(r,Math.abs(w)/2,Math.abs(h)/2));if(r<.01)return M.rectPath(x,y,w,h);const k=.5523*r;
  return{c:true,v:[[x+r,y],[x+w-r,y],[x+w,y+r],[x+w,y+h-r],[x+w-r,y+h],[x+r,y+h],[x,y+h-r],[x,y+r]],i:[[-k,0],[0,0],[0,-k],[0,0],[k,0],[0,0],[0,k],[0,0]],o:[[0,0],[k,0],[0,0],[0,k],[0,0],[-k,0],[0,0],[0,-k]]}};
 const itemPath=(it,c)=>{if(it.type==='rect'){const s=M.val(it.size,c),p=M.val(it.pos,c);return roundRect(p[0]-s[0]/2,p[1]-s[1]/2,s[0],s[1],M.val(it.round,c)||0)}
  if(it.type==='ellipse'){const s=M.val(it.size,c),p=M.val(it.pos,c);return M.ellipsePath(p[0],p[1],s[0]/2,s[1]/2)}
  if(it.type==='star'||it.type==='polygon')return starPath(it,c);if(it.type==='path')return M.val(it.path,c);return null};
 M.newItem=(type,o={})=>{if(type==='rect')return{id:uid(),type,name:'Rechteck',size:M.P(o.size||[400,250]),pos:M.P(o.pos||[0,0]),round:M.P(o.round||0)};
  if(type==='ellipse')return{id:uid(),type,name:'Ellipse',size:M.P(o.size||[300,300]),pos:M.P(o.pos||[0,0])};
  if(type==='star')return{id:uid(),type,name:'Stern',pts:M.P(5),pos:M.P(o.pos||[0,0]),or:M.P(o.or||180),ir:M.P(o.ir||80),rot:M.P(0)};
  if(type==='polygon')return{id:uid(),type,name:'Polygon',pts:M.P(6),pos:M.P(o.pos||[0,0]),or:M.P(o.or||180),ir:M.P(80),rot:M.P(0)};
  return{id:uid(),type:'path',name:'Pfad',path:M.P(o.path)}};
 // Pfad in Linienstücke zerlegen (für Trimmen)
 const flatten=(p,steps=16)=>{const out=[];const n=p.v.length;if(!n)return out;out.push(p.v[0]);for(let i=1;i<=n;i++){if(i===n&&!p.c)break;const a=p.v[i-1],b=p.v[i%n],o=p.o[i-1]||[0,0],ii=p.i[i%n]||[0,0];
   if(!o[0]&&!o[1]&&!ii[0]&&!ii[1]){out.push(b);continue}const c1=[a[0]+o[0],a[1]+o[1]],c2=[b[0]+ii[0],b[1]+ii[1]];for(let s=1;s<=steps;s++){const t=s/steps,u=1-t;out.push([u*u*u*a[0]+3*u*u*t*c1[0]+3*u*t*t*c2[0]+t*t*t*b[0],u*u*u*a[1]+3*u*u*t*c1[1]+3*u*t*t*c2[1]+t*t*t*b[1]])}}return out};
 const trimPolys=(polys,s,e,o)=>{let total=0;const lens=polys.map(p=>{let L=0;for(let i=1;i<p.length;i++)L+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);total+=L;return L});if(total<=0)return[];
  let a=(s+o/360*100)/100,b=(e+o/360*100)/100;if(b<a)[a,b]=[b,a];const segs=[];const cut=(A,B)=>{A*=total;B*=total;let acc=0;polys.forEach((p,pi)=>{const L=lens[pi];if(acc+L<A||acc>B){acc+=L;return}const out=[];let d=acc;for(let i=1;i<p.length;i++){const p0=p[i-1],p1=p[i],sl=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]);const d0=d,d1=d+sl;d=d1;if(d1<A||d0>B)continue;const u0=sl?clamp((A-d0)/sl,0,1):0,u1=sl?clamp((B-d0)/sl,0,1):1;const q0=[lerp(p0[0],p1[0],u0),lerp(p0[1],p1[1],u0)],q1=[lerp(p0[0],p1[0],u1),lerp(p0[1],p1[1],u1)];if(!out.length)out.push(q0);out.push(q1)}if(out.length>1)segs.push(out);acc+=L})};
  const span=b-a;if(span>=1)return polys.map(p=>p);const a0=((a%1)+1)%1,b0=a0+span;if(b0<=1)cut(a0,b0);else{cut(a0,1);cut(0,b0-1)}return segs};
 const shapeGeo=(comp,l,ct)=>{const c=ctxOf(comp,l,ct);const S=l.shape;const paths=[];(S.items||[]).forEach(it=>{const p=itemPath(it,{...c,key:it.id});if(p&&p.v&&p.v.length)paths.push(p)});
  return{paths,stroke:S.stroke.on,sw:S.stroke.on?M.val(S.stroke.w,c):0}};
 const drawShape=(ctx,comp,l,ct)=>{const c=ctxOf(comp,l,ct);const S=l.shape;const g=shapeGeo(comp,l,ct);if(!g.paths.length)return;
  const trim=S.trim&&S.trim.on;let polys=null;if(trim){polys=trimPolys(g.paths.map(p=>flatten(p)),M.val(S.trim.s,c),M.val(S.trim.e,c),M.val(S.trim.o,c))}
  const build=()=>{const P=new Path2D();if(trim){for(const q of polys){P.moveTo(q[0][0],q[0][1]);for(let i=1;i<q.length;i++)P.lineTo(q[i][0],q[i][1])}}else for(const p of g.paths)pathTo(P,p);return P};
  const P=build();const paint=()=>{if(S.fill.on){const f=S.fill;const op=M.val(f.op,c)/100;if(op>0){ctx.globalAlpha*=op;if(f.type==='linear'||f.type==='radial'){const p1=M.val(f.p1,c),p2=M.val(f.p2,c);const gr=f.type==='linear'?ctx.createLinearGradient(p1[0],p1[1],p2[0],p2[1]):ctx.createRadialGradient(p1[0],p1[1],0,p1[0],p1[1],Math.hypot(p2[0]-p1[0],p2[1]-p1[1])||1);gr.addColorStop(0,M.val(f.color,c));gr.addColorStop(1,M.val(f.c2,c));ctx.fillStyle=gr}else ctx.fillStyle=M.val(f.color,c);ctx.fill(P,'nonzero');ctx.globalAlpha/=op}}
   if(S.stroke.on){const s=S.stroke;const w=M.val(s.w,c),op=M.val(s.op,c)/100;if(w>0&&op>0){ctx.globalAlpha*=op;ctx.strokeStyle=M.val(s.color,c);ctx.lineWidth=w;ctx.lineCap=s.cap||'round';ctx.lineJoin=s.join||'round';const d=M.val(s.dash,c);if(d>0){ctx.setLineDash([d,M.val(s.gap,c)||d]);ctx.lineDashOffset=-M.val(s.off,c)}ctx.stroke(P);ctx.setLineDash([]);ctx.globalAlpha/=op}}};
  const R=S.rep;if(R&&R.on){const n=Math.max(1,Math.round(M.val(R.n,c))),off=M.val(R.off,c),pos=M.val(R.pos,c),sc=M.val(R.scale,c),rot=M.val(R.rot,c)*Math.PI/180,so=M.val(R.sop,c)/100,eo=M.val(R.eop,c)/100;const base=ctx.globalAlpha;
   for(let i=0;i<n;i++){const k=i+off;ctx.save();ctx.translate(pos[0]*k,pos[1]*k);ctx.rotate(rot*k);ctx.scale(Math.pow(sc[0]/100,k),Math.pow(sc[1]/100,k));ctx.globalAlpha=base*lerp(so,eo,n>1?i/(n-1):0);paint();ctx.restore()}ctx.globalAlpha=base}else paint()};

 // ---------- Text ----------
 const mctx=document.createElement('canvas').getContext('2d');
 const fontStr=(T,size)=>`${T.italic?'italic ':''}${T.bold?'700 ':'400 '}${size}px "${T.font}", ${T.font}, sans-serif`;M.fontStr=fontStr;
 const textLayout=(comp,l,ct)=>{const c=ctxOf(comp,l,ct);const T=l.text;const size=Math.max(1,M.val(T.size,c));const track=M.val(T.track,c)*size/1000;const lead=(M.val(T.lead,c)||1.2)*size;mctx.font=fontStr(T,size);
  let raw=String(T.str??'').split('\n');if(T.box>0){const W=T.box;const out=[];for(const line of raw){const words=line.split(/(\s+)/);let cur='';for(const w of words){const test=cur+w;if(cur&&mctx.measureText(test).width+track*test.length>W&&w.trim()){out.push(cur.trimEnd());cur=w.trimStart()}else cur=test}out.push(cur)}raw=out}
  const chars=[];let x0=1e9,x1=-1e9;let wi=0;raw.forEach((line,li)=>{const ws=[...line].map(ch=>mctx.measureText(ch).width+track);const lw=ws.reduce((a,b)=>a+b,0)-(ws.length?track:0);const sx=T.align==='left'||T.box>0&&T.align==='left'?0:T.align==='right'?-lw:-lw/2;let x=T.box>0?(T.align==='center'?(T.box-lw)/2:T.align==='right'?T.box-lw:0):sx;
   [...line].forEach((ch,ci)=>{if(/\s/.test(ch)&&ci>0&&!/\s/.test(line[ci-1]))wi++;chars.push({ch,x,y:li*lead,w:ws[ci],line:li,word:wi});x+=ws[ci]});wi++;x0=Math.min(x0,T.box>0?0:sx);x1=Math.max(x1,T.box>0?T.box:sx+lw)});
  if(!chars.length){x0=0;x1=0}return{chars,size,lead,lines:raw.length,x0,x1,y0:-size*.85,y1:(raw.length-1)*lead+size*.25}};M.textLayout=textLayout;
 // Bereichsauswahl eines Animators: Anteil 0…1 für Element i von n
 const selAmount=(an,i,n,c)=>{const s=M.val(an.s,c),e=M.val(an.e,c),o=M.val(an.o,c);let a=Math.min(s,e)+o,b=Math.max(s,e)+o;const p0=i/n*100,p1=(i+1)/n*100;const shape=an.shape||'square';
  if(shape==='square'){const ov=Math.max(0,Math.min(b,p1)-Math.max(a,p0));return clamp(ov/(p1-p0),0,1)}
  const pc=(p0+p1)/2;const w=Math.max(.001,b-a);const u=(pc-a)/w;if(shape==='up')return clamp(u,0,1);if(shape==='down')return clamp(1-u,0,1);if(shape==='tri')return u<0||u>1?0:1-Math.abs(u*2-1);
  if(shape==='round')return u<0||u>1?0:Math.sqrt(1-Math.pow(u*2-1,2));if(shape==='smooth'){if(u<0||u>1)return 0;const v=1-Math.abs(u*2-1);return v*v*(3-2*v)}return 0};
 const drawText=(ctx,comp,l,ct)=>{const c=ctxOf(comp,l,ct);const T=l.text;const lay=textLayout(comp,l,ct);const col=M.val(T.color,c),sw=M.val(T.sw,c),sc=M.val(T.sc,c);ctx.font=fontStr(T,lay.size);ctx.textBaseline='alphabetic';
  const anims=(T.anims||[]).filter(a=>a.on!==false);const by=a=>a.unit==='word'?'word':a.unit==='line'?'line':'ch';const counts={ch:lay.chars.length,word:(lay.chars.at(-1)?.word??0)+1,line:lay.lines};
  const base=ctx.globalAlpha;ctx.lineJoin='round';
  lay.chars.forEach((g,i)=>{if(/\s/.test(g.ch))return;let dx=0,dy=0,s=[100,100],r=0,op=100,blur=0,fill=col,trk=0;
   for(const an of anims){const u=by(an)==='ch'?i:by(an)==='word'?g.word:g.line;const amt=selAmount(an,u,counts[by(an)],{...c,key:an.id});if(amt<=0)continue;const P=an.props||{};
    if(P.pos){const v=M.val(P.pos,c);dx+=v[0]*amt;dy+=v[1]*amt}if(P.scale){const v=M.val(P.scale,c);s=[s[0]+(v[0]-100)*amt,s[1]+(v[1]-100)*amt]}if(P.rot)r+=M.val(P.rot,c)*amt;if(P.op)op+= (M.val(P.op,c)-100)*amt;
    if(P.blur)blur+=M.val(P.blur,c)*amt;if(P.color)fill=mix(fill,M.val(P.color,c),amt);if(P.track)trk+=M.val(P.track,c)*amt*i/10}
   if(op<=0)return;ctx.save();ctx.translate(g.x+g.w/2+dx+trk,g.y+dy);ctx.rotate(r*Math.PI/180);ctx.scale(s[0]/100,s[1]/100);ctx.globalAlpha=base*clamp(op/100,0,1);if(blur>0&&M.canFilter)ctx.filter=`blur(${blur}px)`;
   if(sw>0){ctx.strokeStyle=sc;ctx.lineWidth=sw*2;ctx.strokeText(g.ch,-g.w/2,0)}ctx.fillStyle=fill;ctx.fillText(g.ch,-g.w/2,0);ctx.restore()});ctx.globalAlpha=base};

 // ---------- Medien ----------
 M.media={};// assetId → {el, kind, w, h, dur, ok}
 M.base='';M.pid='';
 M.assetUrl=id=>`api/asset?id=${M.pid}&a=${id}`;
 M.loadAsset=(a)=>new Promise(res=>{if(M.media[a.id]&&M.media[a.id].ok)return res(M.media[a.id]);const k=a.kind.replace(':missing','');
  if(k==='image'){const im=new Image();im.onload=()=>{M.media[a.id]={el:im,kind:k,w:im.naturalWidth,h:im.naturalHeight,ok:true};res(M.media[a.id])};im.onerror=()=>{M.media[a.id]={kind:k,ok:false};res(M.media[a.id])};im.src=M.assetUrl(a.id);return}
  const el=document.createElement(k==='video'?'video':'audio');el.preload='auto';el.muted=true;el.playsInline=true;el.crossOrigin='anonymous';el.src=M.assetUrl(a.id);
  el.onloadedmetadata=()=>{M.media[a.id]={el,kind:k,w:el.videoWidth||0,h:el.videoHeight||0,dur:el.duration||0,ok:true,clones:{}};res(M.media[a.id])};el.onerror=()=>{M.media[a.id]={kind:k,ok:false};res(M.media[a.id])}});
 // je Ebene ein eigenes Video-Element (dieselbe Datei kann mehrmals laufen)
 M.elFor=(l)=>{const m=M.media[l.asset];if(!m||!m.ok||!m.el)return null;if(m.kind==='image')return m.el;let e=m.clones[l.id];if(!e){e=m.el.cloneNode();e.muted=true;e.preload='auto';e.playsInline=true;e.crossOrigin='anonymous';e.addEventListener('seeked',()=>M.onSeeked&&M.onSeeked());m.clones[l.id]=e;e.load()}return e};
 M.srcTime=(l,ct)=>Math.max(0,(ct-(l.st||0))*(l.speed||1));
 M.playing=false;
 // Video auf die richtige Stelle bringen. Beim Export wird auf das Bild gewartet.
 M.syncVideo=(l,ct,exact)=>{const e=M.elFor(l);if(!e||e.tagName!=='VIDEO')return null;const t=M.srcTime(l,ct);const d=Math.abs(e.currentTime-t);
  if(M.playing&&!exact){if(e.paused){e.playbackRate=l.speed||1;e.currentTime=t;e.play().catch(()=>{})}else if(d>.25)e.currentTime=t}else{if(!e.paused)e.pause();if(d>.5/60&&!e.seeking)e.currentTime=t}return e};
 M.waitVideos=(comp,ct)=>{const ps=[];const walk=(cp,t,depth)=>{for(const l of cp.layers){if(l.hidden&&!usedAsMatte(cp,l))continue;if(t<l.in||t>=l.out)continue;if(l.type==='video'){const e=M.syncVideo(l,t,true);if(e&&(e.seeking||e.readyState<2))ps.push(new Promise(r=>{const done=()=>{e.removeEventListener('seeked',done);e.removeEventListener('canplay',done);r()};e.addEventListener('seeked',done);e.addEventListener('canplay',done);setTimeout(r,3000)}))}
   if(l.type==='comp'&&depth<10){const sub=M.compById(l.comp);if(sub)walk(sub,t-(l.st||0),depth+1)}}};walk(comp,ct,0);return Promise.all(ps)};
 M.project=null;M.compById=id=>M.project&&M.project.comps.find(c=>c.id===id);

 // ---------- Effekte ----------
 M.canFilter=(()=>{try{const c=document.createElement('canvas').getContext('2d');c.filter='blur(2px)';return c.filter==='blur(2px)'}catch(e){return false}})();
 M.FX={};// id → {name, cat, params:[[key,label,type,def,min,max]], run(canvasCtx, vals, info)}
 const pool=[];const getCv=(w,h)=>{let c=pool.pop();if(!c)c=document.createElement('canvas');if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;const x=c.getContext('2d');x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;x.globalCompositeOperation='source-over';x.filter='none';x.clearRect(0,0,w,h);return c};
 const putCv=c=>{if(pool.length<24)pool.push(c)};M.getCv=getCv;M.putCv=putCv;
 // ---------- Komposition zeichnen ----------
 const BLEND={normal:'source-over',add:'lighter',multiply:'multiply',screen:'screen',overlay:'overlay',darken:'darken',lighten:'lighten',colorDodge:'color-dodge',colorBurn:'color-burn',hardLight:'hard-light',softLight:'soft-light',difference:'difference',exclusion:'exclusion',hue:'hue',saturation:'saturation',color:'color',luminosity:'luminosity'};
 M.BLENDS=[['normal','Normal'],['add','Addieren'],['multiply','Multiplizieren'],['screen','Negativ multiplizieren'],['overlay','Ineinanderkopieren'],['softLight','Weiches Licht'],['hardLight','Hartes Licht'],['darken','Abdunkeln'],['lighten','Aufhellen'],['colorDodge','Farbig abwedeln'],['colorBurn','Farbig nachbelichten'],['difference','Differenz'],['exclusion','Ausschluss'],['hue','Farbton'],['saturation','Sättigung'],['color','Farbe'],['luminosity','Luminanz']];
 const usedAsMatte=(comp,l)=>comp.layers.some(x=>x.matte&&x.matte.src===l.id);M.usedAsMatte=usedAsMatte;
 // Inhalt einer Ebene mit Transformation zeichnen (ohne Masken/Effekte)
 const drawContent=(ctx,comp,l,ct,S,opt,depth)=>{const m=M.matrix(comp,l,ct);ctx.setTransform(S*m[0],S*m[1],S*m[2],S*m[3],S*m[4],S*m[5]);
  if(l.type==='solid'){ctx.fillStyle=l.solid.color;ctx.fillRect(0,0,l.solid.w,l.solid.h)}
  else if(l.type==='image'){const e=M.elFor(l);if(e)ctx.drawImage(e,0,0,l.src.w,l.src.h);else miss(ctx,l)}
  else if(l.type==='video'){const e=opt.noSync?M.elFor(l):M.syncVideo(l,ct,opt.exact);if(e&&e.readyState>=2)ctx.drawImage(e,0,0,l.src.w,l.src.h);else if(!e)miss(ctx,l)}
  else if(l.type==='shape')drawShape(ctx,comp,l,ct);
  else if(l.type==='text')drawText(ctx,comp,l,ct);
  else if(l.type==='comp'){const sub=M.compById(l.comp);if(sub&&depth<10){const cv=M.render(sub,M.ltime(l,ct)*(l.speed||1),S,{...opt,depth:depth+1,nested:true});ctx.drawImage(cv,0,0,sub.w,sub.h);putCv(cv)}}
  ctx.setTransform(1,0,0,1,0,0)};
 const miss=(ctx,l)=>{const w=l.src.w,h=l.src.h;ctx.fillStyle='#3a1f2a';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#ff6b8b';ctx.lineWidth=Math.max(2,w/200);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(w,h);ctx.moveTo(w,0);ctx.lineTo(0,h);ctx.stroke()};
 const hasMasks=l=>l.masks&&l.masks.some(m=>m.mode!=='none');
 const activeFx=l=>(l.fx||[]).filter(f=>f.on!==false&&M.FX[f.type]);
 // Masken anwenden
 const applyMasks=(cv,comp,l,ct,S)=>{const W=cv.width,H=cv.height;const mk=getCv(W,H),x=mk.getContext('2d');const m=M.matrix(comp,l,ct);const c=ctxOf(comp,l,ct);let first=true;
  for(const ms of l.masks){if(ms.mode==='none')continue;const path=M.val(ms.path,{...c,key:ms.id});if(!path||!path.v)continue;const fe=M.val(ms.feather,c)||0,op=clamp((M.val(ms.op,c)??100)/100,0,1),ex=M.val(ms.exp,c)||0;
   const one=getCv(W,H),o=one.getContext('2d');o.setTransform(S*m[0],S*m[1],S*m[2],S*m[3],S*m[4],S*m[5]);const P=new Path2D();pathTo(P,path);o.fillStyle='#fff';if(fe>0&&M.canFilter)o.filter=`blur(${fe*S/2}px)`;o.fill(P);if(ex>0){o.strokeStyle='#fff';o.lineWidth=ex*2;o.lineJoin='round';o.stroke(P)}else if(ex<0){o.globalCompositeOperation='destination-out';o.lineWidth=-ex*2;o.lineJoin='round';o.stroke(P)}
   o.setTransform(1,0,0,1,0,0);o.filter='none';if(ms.inv){o.globalCompositeOperation='xor';o.fillStyle='#fff';o.fillRect(0,0,W,H)}
   x.globalAlpha=op;if(first&&ms.mode!=='sub'){x.globalCompositeOperation='source-over';first=false}else if(first&&ms.mode==='sub'){x.globalAlpha=1;x.fillStyle='#fff';x.fillRect(0,0,W,H);x.globalAlpha=op;x.globalCompositeOperation='destination-out';first=false}
   else x.globalCompositeOperation=ms.mode==='add'?'source-over':ms.mode==='sub'?'destination-out':ms.mode==='int'?'destination-in':ms.mode==='diff'?'xor':'source-over';x.drawImage(one,0,0);putCv(one)}
  const cx=cv.getContext('2d');cx.globalCompositeOperation='destination-in';cx.drawImage(mk,0,0);cx.globalCompositeOperation='source-over';putCv(mk)};
 const runFx=(cv,comp,l,ct,S,list)=>{const c=ctxOf(comp,l,ct);for(const f of list){const D=M.FX[f.type];const vals={};for(const p of D.params){const pv=f.params&&f.params[p[0]];vals[p[0]]=pv===undefined?p[3]:(pv&&typeof pv==='object'&&!Array.isArray(pv)&&'v' in pv)?M.val(pv,{...c,key:f.id+p[0]}):pv}try{D.run(cv,vals,{S,comp,l,ct,c})}catch(e){console.warn(e)}}};
 M.runFx=runFx;
 // eine Ebene vollständig (Inhalt, Bewegungsunschärfe, Masken, Effekte) auf eine eigene Leinwand
 const layerCanvas=(comp,l,ct,S,opt,depth)=>{const W=Math.ceil(comp.w*S),H=Math.ceil(comp.h*S);const cv=getCv(W,H),x=cv.getContext('2d');
  const mb=!opt.noMB&&comp.mb&&l.mb&&(comp.mbOn!==false);if(mb){const n=opt.export?12:6,sh=.5/comp.fps;x.globalCompositeOperation='lighter';for(let i=0;i<n;i++){const t=ct-sh/2+sh*i/(n-1);const one=getCv(W,H);drawContent(one.getContext('2d'),comp,l,t,S,{...opt,noSync:i>0},depth);x.globalAlpha=1/n;x.drawImage(one,0,0);putCv(one)}x.globalAlpha=1;x.globalCompositeOperation='source-over'}
  else drawContent(x,comp,l,ct,S,opt,depth);
  if(hasMasks(l))applyMasks(cv,comp,l,ct,S);const fx=activeFx(l);if(fx.length)runFx(cv,comp,l,ct,S,fx);return cv};
 const lumaToAlpha=(cv,inv)=>{const x=cv.getContext('2d');const d=x.getImageData(0,0,cv.width,cv.height);const p=d.data;for(let i=0;i<p.length;i+=4){const L=(p[i]*.299+p[i+1]*.587+p[i+2]*.114)*p[i+3]/255/255;const a=inv?1-L:L;p[i]=p[i+1]=p[i+2]=255;p[i+3]=a*255}x.putImageData(d,0,0)};
 // Komposition zur Zeit ct mit Maßstab S rendern → Leinwand (aus dem Vorrat, nach Gebrauch putCv)
 M.render=(comp,ct0,S=1,opt={})=>{let ct=ct0;const depth=opt.depth||0;const W=Math.ceil(comp.w*S),H=Math.ceil(comp.h*S);const out=getCv(W,H),o=out.getContext('2d');
  if(!opt.nested&&!opt.transparent){o.fillStyle=comp.bg||'#000';o.fillRect(0,0,W,H)}
  const ls=comp.layers;const solo=ls.some(l=>l.solo&&!l.hidden);
  const CT=ct;for(let i=ls.length-1;i>=0;i--){ct=CT;const l=ls[i];if(l.type==='audio'||l.type==='null')continue;if(l.hidden)continue;if(solo&&!l.solo)continue;if(ct<l.in||ct>=l.out)continue;if(opt.only&&opt.only!==l.id)continue;
   const pz=(l.fx||[]).find(f=>f.type==='posterizeTime'&&f.on!==false);const ct0=ct;if(pz){const r=Math.max(1,+(pz.params&&pz.params.fps&&pz.params.fps.v)||12);ct=Math.floor((ct-(l.st||0))*r+1e-6)/r+(l.st||0)}
   const c=ctxOf(comp,l,ct);const op=clamp(M.val(l.tr.op,{...c,key:'op'})/100,0,1);if(op<=0){ct=ct0;continue}
   if(l.type==='adjust'){const fx=activeFx(l);if(!fx.length)continue;const tmp=getCv(W,H),tx=tmp.getContext('2d');tx.drawImage(out,0,0);runFx(tmp,comp,l,ct,S,fx);
    const area=getCv(W,H),ax=area.getContext('2d');const m=M.matrix(comp,l,ct);ax.setTransform(S*m[0],S*m[1],S*m[2],S*m[3],S*m[4],S*m[5]);ax.fillStyle='#fff';ax.fillRect(0,0,l.solid.w,l.solid.h);ax.setTransform(1,0,0,1,0,0);if(hasMasks(l))applyMasks(area,comp,l,ct,S);
    tx.globalCompositeOperation='destination-in';tx.drawImage(area,0,0);o.globalAlpha=op;o.globalCompositeOperation=BLEND[l.blend]||'source-over';o.drawImage(tmp,0,0);o.globalAlpha=1;o.globalCompositeOperation='source-over';putCv(tmp);putCv(area);continue}
   const simple=!hasMasks(l)&&!activeFx(l).length&&!l.matte&&!(comp.mb&&l.mb&&!opt.noMB)&&l.type!=='comp';
   o.globalCompositeOperation=BLEND[l.blend]||'source-over';
   if(simple){o.globalAlpha=op;drawContent(o,comp,l,ct,S,opt,depth);o.globalAlpha=1;o.globalCompositeOperation='source-over';continue}
   const cv=layerCanvas(comp,l,ct,S,opt,depth);
   if(l.matte){const src=ls.find(x=>x.id===l.matte.src);if(src&&ct>=src.in&&ct<src.out){const mc=layerCanvas(comp,src,ct,S,opt,depth);const so=clamp(M.val(src.tr.op,ctxOf(comp,src,ct))/100,0,1);
     if(l.matte.mode==='luma'||l.matte.mode==='lumaInv')lumaToAlpha(mc,l.matte.mode==='lumaInv');const cx=cv.getContext('2d');cx.globalAlpha=so;cx.globalCompositeOperation=(l.matte.mode==='alphaInv'||l.matte.mode==='lumaInv')?'destination-out':'destination-in';cx.drawImage(mc,0,0);cx.globalAlpha=1;cx.globalCompositeOperation='source-over';putCv(mc)}
    else if(src&&(l.matte.mode==='alpha'||l.matte.mode==='luma')){const cx=cv.getContext('2d');cx.clearRect(0,0,W,H)}}
   o.globalAlpha=op;o.drawImage(cv,0,0);o.globalAlpha=1;o.globalCompositeOperation='source-over';putCv(cv)}
  return out};
 // Ebene unter einem Punkt (Kompositionskoordinaten) finden
 M.hit=(comp,ct,x,y)=>{for(const l of comp.layers){if(l.hidden||l.locked||ct<l.in||ct>=l.out||l.type==='audio')continue;const m=M.matrix(comp,l,ct);const p=M.apply(inv(m),[x,y]);const b=M.bounds(comp,l,ct);if(p[0]>=b[0]&&p[0]<=b[0]+b[2]&&p[1]>=b[1]&&p[1]<=b[1]+b[3])return l}return null};
 // Alle animierbaren Eigenschaften einer Ebene (für Timeline, U-Taste, Expressions)
 M.props=l=>{const out=[];const add=(grp,key,name,p,kind,extra)=>{if(p)out.push({grp,key,name,p,kind,...extra})};
  for(const ms of l.masks||[]){add('masks:'+ms.id,'mpath'+ms.id,'Maskenpfad',ms.path,'path',{mask:ms});add('masks:'+ms.id,'mfe'+ms.id,'Weiche Maskenkante',ms.feather,'num',{min:0});add('masks:'+ms.id,'mop'+ms.id,'Maskendeckkraft',ms.op,'pct',{min:0,max:100});add('masks:'+ms.id,'mex'+ms.id,'Maskenausweitung',ms.exp,'num')}
  if(l.shape){const S=l.shape;for(const it of S.items||[]){const g='items:'+it.id;if(it.type==='rect'){add(g,it.id+'size','Größe',it.size,'xy');add(g,it.id+'pos','Position',it.pos,'xy');add(g,it.id+'round','Rundung',it.round,'num',{min:0})}
    else if(it.type==='ellipse'){add(g,it.id+'size','Größe',it.size,'xy');add(g,it.id+'pos','Position',it.pos,'xy')}else if(it.type==='star'||it.type==='polygon'){add(g,it.id+'pts','Punkte',it.pts,'num',{min:3,step:1});add(g,it.id+'pos','Position',it.pos,'xy');add(g,it.id+'or','Außenradius',it.or,'num');if(it.type==='star')add(g,it.id+'ir','Innenradius',it.ir,'num');add(g,it.id+'rot','Drehung',it.rot,'deg')}else add(g,it.id+'path','Pfad',it.path,'path',{item:it})}
   add('fill','fcol','Füllfarbe',S.fill.color,'color');if(S.fill.type!=='solid'){add('fill','fc2','Verlaufsfarbe 2',S.fill.c2,'color');add('fill','fp1','Verlauf Start',S.fill.p1,'xy');add('fill','fp2','Verlauf Ende',S.fill.p2,'xy')}add('fill','fop','Fülldeckkraft',S.fill.op,'pct',{min:0,max:100});
   add('stroke','scol','Konturfarbe',S.stroke.color,'color');add('stroke','sw','Konturbreite',S.stroke.w,'num',{min:0});add('stroke','sop','Konturdeckkraft',S.stroke.op,'pct',{min:0,max:100});add('stroke','sdash','Strichlänge',S.stroke.dash,'num',{min:0});add('stroke','sgap','Lücke',S.stroke.gap,'num',{min:0});add('stroke','soff','Strich-Versatz',S.stroke.off,'num');
   if(S.trim.on){add('trim','ts','Anfang',S.trim.s,'pct',{min:0,max:100});add('trim','te','Ende',S.trim.e,'pct',{min:0,max:100});add('trim','to','Versatz',S.trim.o,'deg')}
   if(S.rep.on){add('rep','rn','Kopien',S.rep.n,'num',{min:1,step:1});add('rep','roff','Versatz',S.rep.off,'num');add('rep','rpos','Position',S.rep.pos,'xy');add('rep','rsc','Skalierung',S.rep.scale,'xyp');add('rep','rrot','Drehung',S.rep.rot,'deg');add('rep','rso','Startdeckkraft',S.rep.sop,'pct',{min:0,max:100});add('rep','reo','Enddeckkraft',S.rep.eop,'pct',{min:0,max:100})}}
  if(l.text){const T=l.text;add('text','tsize','Schriftgröße',T.size,'num',{min:1});add('text','tcol','Textfarbe',T.color,'color');add('text','ttrack','Laufweite',T.track,'num');add('text','tlead','Zeilenabstand',T.lead,'num',{step:.05,min:.3});add('text','tsw','Konturbreite',T.sw,'num',{min:0});add('text','tsc','Konturfarbe',T.sc,'color');
   for(const an of T.anims||[]){const g='anim:'+an.id;add(g,an.id+'s','Anfang',an.s,'pct',{min:0,max:100});add(g,an.id+'e','Ende',an.e,'pct',{min:0,max:100});add(g,an.id+'o','Versatz',an.o,'pct',{min:-100,max:100});const P=an.props||{};
    if(P.op)add(g,an.id+'pop','Deckkraft',P.op,'pct',{min:0,max:100});if(P.pos)add(g,an.id+'ppos','Position',P.pos,'xy');if(P.scale)add(g,an.id+'psc','Skalierung',P.scale,'xyp');if(P.rot)add(g,an.id+'prot','Drehung',P.rot,'deg');if(P.blur)add(g,an.id+'pblur','Weichzeichnen',P.blur,'num',{min:0});if(P.color)add(g,an.id+'pcol','Füllfarbe',P.color,'color');if(P.track)add(g,an.id+'ptrk','Laufweite',P.track,'num')}}
  for(const f of l.fx||[]){const D=M.FX[f.type];if(!D)continue;for(const p of D.params){if(p[2]==='sel'||p[2]==='bool')continue;f.params=f.params||{};if(!f.params[p[0]])f.params[p[0]]=M.P(p[3]);add('fx:'+f.id,f.id+p[0],p[1],f.params[p[0]],p[2],{min:p[4],max:p[5],fx:f,pk:p[0]})}}
  if(l.vol&&(l.type==='video'||l.type==='audio'))add('audio','vol','Lautstärke',l.vol,'pct',{min:0,max:200});
  add('tr','anchor','Ankerpunkt',l.tr.anchor,'xy');add('tr','pos','Position',l.tr.pos,'xy');add('tr','scale','Skalierung',l.tr.scale,'xyp');add('tr','rot','Drehung',l.tr.rot,'deg');add('tr','op','Deckkraft',l.tr.op,'pct',{min:0,max:100});
  return out};
 M.animated=p=>!!(p&&((p.k&&p.k.length)||p.x));
 // Keyframe setzen (t in Ebenenzeit); legt den Keyframe an oder ändert ihn
 M.setKey=(p,t,v)=>{p.k=p.k||[];const fr=1e-4;let k=p.k.find(x=>Math.abs(x.t-t)<fr);if(k)k.v=M.clone(v);else{p.k.push({t,v:M.clone(v)});p.k.sort((a,b)=>a.t-b.t)}};
 // Wert ändern: mit Stoppuhr → Keyframe, sonst fester Wert
 M.setVal=(p,t,v)=>{if(p.k&&p.k.length)M.setKey(p,t,v);else p.v=M.clone(v)};
 M.toggleSW=(p,t)=>{if(p.k&&p.k.length){p.v=kfVal(p,t);delete p.k}else{p.k=[{t,v:M.clone(p.v)}]}};
 return M})();
