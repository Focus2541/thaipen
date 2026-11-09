'use strict';
/* ถ่ายเป็น — app UI: live coach camera, import, auto-edit result, album */

const $=id=>document.getElementById(id);
const LS={get(k,d){try{const v=localStorage.getItem('tp_'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem('tp_'+k,JSON.stringify(v))}catch(e){}}};
const S={scene:LS.get('scene','auto'),tone:LS.get('tone','auto'),autoShot:LS.get('autoShot',false),thr:LS.get('thr',80),grid:LS.get('grid',true),sound:LS.get('sound',true),
 fix:LS.get('fix',{straight:true,crop:true,light:true}),aiKey:LS.get('aiKey',''),aiModel:LS.get('aiModel','gemini-2.5-flash')};
const LIVE={scene:'land',sc:null,scN:0,tone:'neg',why:'',tc:null,tcN:0,ev:null,score:0,mem:{},msg:'',msgT:0,mc:'',mcN:0,stableT:0,lastShot:0,n:0};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pad2=n=>(n<10?'0':'')+n;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toBlob=(c,q)=>new Promise(r=>c.toBlob(r,'image/jpeg',q||.92));
function el(html){const d=document.createElement('div');d.innerHTML=html.trim();return d.firstElementChild}
function toast(t,ms){const e=$('toast');e.textContent=t;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),ms||2200)}
function scoreColor(s){return 'hsl('+Math.round(Math.max(0,Math.min(100,s))*1.2)+',80%,52%)'}
function viaImg(b){return new Promise((res,rej)=>{const u=URL.createObjectURL(b),i=new Image();i.onload=()=>{res(i);setTimeout(()=>URL.revokeObjectURL(u),5000)};i.onerror=rej;i.src=u})}
async function loadImg(b){if(window.createImageBitmap){try{return await createImageBitmap(b,{imageOrientation:'from-image'})}catch(e){}}return viaImg(b)}

/* ================= sheet ================= */
function openSheet(title,body){$('sTitle').textContent=title;const b=$('sBody');b.innerHTML='';b.appendChild(body);b.scrollTop=0;$('sheet').classList.add('open');$('scrim').classList.add('open')}
function closeSheet(){$('sheet').classList.remove('open');$('scrim').classList.remove('open')}
$('scrim').onclick=closeSheet;
function big(label,cls,fn){const b=el('<button class="big '+(cls||'')+'">'+label+'</button>');b.onclick=fn;return b}
function toggleRow(box,label,get,set){const r=el('<label class="row"><span>'+label+'</span><input type="checkbox"></label>');const i=r.querySelector('input');i.checked=get();i.onchange=()=>set(i.checked);box.appendChild(r);return r}
function selectRow(box,label,opts,get,set){const r=el('<div class="row"><span>'+label+'</span><select></select></div>');const s=r.querySelector('select');opts.forEach(o=>s.appendChild(new Option(o[1],o[0])));s.value=String(get());s.onchange=()=>set(s.value);box.appendChild(r);return r}
function swatch(t){return 'linear-gradient(135deg,'+t.c[0]+','+t.c[1]+')'}

/* ================= sound ================= */
let actx=null;
function click(){if(!S.sound)return;try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();const a=actx,n=a.sampleRate*.08|0,b=a.createBuffer(1,n,a.sampleRate),d=b.getChannelData(0);
 for(let i=0;i<n;i++){const t=i/n;d[i]=(Math.random()*2-1)*(t<.15?1:t<.35?.15:t<.5?.7:.05)*(1-t)}const s=a.createBufferSource();s.buffer=b;const g=a.createGain();g.gain.value=.45;s.connect(g);g.connect(a.destination);s.start()}catch(e){}}

/* ================= sensors ================= */
const SENS={roll:null,pitch:null,shake:0,ax:0,ay:0,az:0,init:false,flip:1};
addEventListener('devicemotion',e=>{
 const a=e.accelerationIncludingGravity;if(!a||a.x==null||a.y==null)return;
 const k=SENS.init?.25:1;SENS.ax+=(a.x-SENS.ax)*k;SENS.ay+=(a.y-SENS.ay)*k;SENS.az+=((a.z||0)-SENS.az)*k;SENS.init=true;
 if(SENS.ay<-4&&Math.abs(SENS.ay)>Math.abs(SENS.ax)*2)SENS.flip=-1;else if(SENS.ay>4&&Math.abs(SENS.ay)>Math.abs(SENS.ax)*2)SENS.flip=1;
 const f=SENS.flip,ax=SENS.ax*f,ay=SENS.ay*f,az=SENS.az*f,ang=(screen.orientation&&screen.orientation.angle)||window.orientation||0;
 let roll=Math.atan2(-ax,ay)*57.2958+ang;roll=((roll+540)%360)-180;
 SENS.pitch=Math.atan2(-az,Math.sqrt(ax*ax+ay*ay))*57.2958;
 SENS.roll=Math.abs(SENS.pitch)>60?null:roll;
 const r=e.rotationRate;if(r){const m=Math.sqrt((r.alpha||0)*(r.alpha||0)+(r.beta||0)*(r.beta||0)+(r.gamma||0)*(r.gamma||0));SENS.shake+=(m-SENS.shake)*.3}
});
function sensSnap(){return {roll:SENS.roll,pitch:SENS.init?SENS.pitch:null,shake:SENS.shake}}

/* ================= camera ================= */
const video=$('video');let stream=null,camOn=false,paused=false,busy=false;
async function startCam(){
 if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}camOn=false;
 try{
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('nomedia');
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1440}},audio:false});
  video.srcObject=stream;await video.play().catch(()=>{});
  for(let i=0;i<40&&!video.videoWidth;i++)await sleep(50);
  camOn=true;$('msg').style.display='none';
 }catch(e){
  console.warn(e);$('msg').style.display='flex';
  $('msg').innerHTML='เปิดกล้องไม่ได้ 📷<br><small>ต้องกดอนุญาตกล้อง (และเปิดผ่านลิงก์ https)<br><br>หรือกด 🖼️ นำเข้า เพื่อเลือกรูป / ถ่ายด้วยแอปกล้องมือถือ<br>แล้วให้แอปช่วยแต่งให้</small>';
  setCoach('ใช้ 🖼️ นำเข้า ได้เลย',false);
 }
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}camOn=false}else if(!$('res').classList.contains('open'))startCam()});
function cropRect(){const vw=video.videoWidth,vh=video.videoHeight,A=3/4;let w=vw,h=w/A;if(h>vh){h=vh;w=h*A}return {x:(vw-w)/2,y:(vh-h)/2,w:w,h:h}}
function fitVF(){const W=$('wrap').clientWidth-16,H=$('wrap').clientHeight-8;let w=W,h=w*4/3;if(h>H){h=H;w=h*3/4}$('vf').style.width=Math.round(w)+'px';$('vf').style.height=Math.round(h)+'px'}
addEventListener('resize',fitVF);
function grab(){const cr=cropRect(),s=Math.min(1,3000/Math.max(cr.w,cr.h)),c=mk(cr.w*s,cr.h*s);c.getContext('2d').drawImage(video,cr.x,cr.y,cr.w,cr.h,0,0,c.width,c.height);return c}

/* ================= live loop ================= */
const anaC=mk(240,320),anaX=anaC.getContext('2d',{willReadFrequently:true});
function loop(){
 requestAnimationFrame(loop);
 if(paused||!camOn||video.readyState<2||!video.videoWidth||document.hidden)return;
 const vf=$('vf'),dpr=Math.min(1.5,devicePixelRatio||1),W=Math.round(vf.clientWidth*dpr),H=Math.round(vf.clientHeight*dpr);
 if(GL.ok)glDraw(video,cropRect(),W,H);
 drawOverlay(W,H,dpr);
}
async function tick(){
 let dur=0;
 if(!paused&&camOn&&video.videoWidth&&!document.hidden){
  const t0=performance.now();
  try{
   const cr=cropRect();anaX.drawImage(video,cr.x,cr.y,cr.w,cr.h,0,0,240,320);
   const st=statsOf(anaC),L=LIVE;L.n++;
   const people=S.scene==='solo'||S.scene==='duo'||(S.scene==='auto'&&(L.scene==='solo'||L.scene==='duo'||L.n%3===0));
   const A=buildA(st,detectPeople(anaC,people),sensSnap(),new Date().getHours(),true);
   let scene=S.scene;
   if(scene==='auto'){const g=guessScene(A);if(g===L.scene)L.scN=0;else{if(g===L.sc)L.scN++;else{L.sc=g;L.scN=1}if(L.scN>=3){L.scene=g;L.scN=0;L.mem={}}}scene=L.scene}else L.scene=scene;
   const ev=evaluate(scene,A,L.mem);L.ev=ev;L.A=A;
   const tc=chooseTone(scene,A),want=S.tone==='auto'?tc.id:S.tone;
   if(S.tone!=='auto'){if(L.tone!==want){L.tone=want;glSetTone(toneById(want))}L.why=''}
   else if(tc.id!==L.tone){if(tc.id===L.tc)L.tcN++;else{L.tc=tc.id;L.tcN=1}if(L.tcN>=4||!L.why){L.tone=tc.id;L.why=tc.why;glSetTone(toneById(tc.id))}}
   else L.why=tc.why;
   updateLive(ev,scene);
  }catch(e){console.warn(e)}
  dur=performance.now()-t0;
 }
 setTimeout(tick,Math.max(170,dur*1.6));
}
function setCoach(t,good){const c=$('coach');if(c.textContent!==t)c.textContent=t;c.classList.toggle('good',!!good)}
function updateLive(ev,scene){
 const L=LIVE;L.score=L.score?L.score*.55+ev.score*.45:ev.score;const s=Math.round(L.score);
 $('score').textContent=s;$('arc').style.strokeDashoffset=289*(1-s/100);$('arc').style.stroke=scoreColor(s);
 /* message: switch only when stable */
 const now=Date.now();
 if(ev.msg!==L.msg){if(ev.msg===L.mc)L.mcN++;else{L.mc=ev.msg;L.mcN=1}if((L.mcN>=2&&now-L.msgT>1100)||!L.msg){L.msg=ev.msg;L.msgT=now}}
 let msg=L.msg,good=ev.good&&L.msg===ev.msg;
 /* auto shot */
 if(S.autoShot&&!busy&&!$('sheet').classList.contains('open')){
  if(s>=S.thr&&ev.score>=S.thr-5&&(SENS.shake||0)<35&&now-L.lastShot>3500){if(!L.stableT)L.stableT=now;msg='นิ่งไว้… กำลังถ่ายให้ ⏱';good=true;if(now-L.stableT>=1000){L.stableT=0;shoot()}}
  else L.stableT=0;
 }
 setCoach(msg,good);
 const sc=sceneById(scene),t=toneById(L.tone);
 $('bScene').innerHTML=S.scene==='auto'?'🤖 '+sc.ic+' '+sc.name:sc.ic+' '+sc.name;
 $('bTone').textContent='🎨 '+t.name;
 $('why').textContent=S.tone==='auto'&&L.why?'โทนออโต้ · '+L.why:'';
}
function drawOverlay(W,H,dpr){
 const cv=$('ov');if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H}
 const x=cv.getContext('2d');x.clearRect(0,0,W,H);const ev=LIVE.ev;
 x.lineWidth=Math.max(1,dpr);
 if(S.grid){x.strokeStyle='rgba(255,255,255,.33)';x.beginPath();[1/3,2/3].forEach(f=>{x.moveTo(W*f,0);x.lineTo(W*f,H);x.moveTo(0,H*f);x.lineTo(W,H*f)});x.stroke();
  x.fillStyle='rgba(255,255,255,.5)';[[1/3,1/3],[2/3,1/3],[1/3,2/3],[2/3,2/3]].forEach(p=>{x.beginPath();x.arc(p[0]*W,p[1]*H,3*dpr,0,6.3);x.fill()})}
 if(ev){
  const A=LIVE.A;if(A)A.faces.forEach(f=>{x.strokeStyle='rgba(255,255,255,.55)';const a=f.x*W,b=f.y*H,w=f.w*W,h=f.h*H,k=Math.min(w,h)*.25;x.beginPath();
   [[a,b,1,1],[a+w,b,-1,1],[a,b+h,1,-1],[a+w,b+h,-1,-1]].forEach(q=>{x.moveTo(q[0],q[1]+k*q[3]);x.lineTo(q[0],q[1]);x.lineTo(q[0]+k*q[2],q[1])});x.stroke()});
  if(ev.horizon!=null){x.setLineDash([8*dpr,6*dpr]);x.strokeStyle='rgba(255,255,255,.7)';x.beginPath();x.moveTo(0,ev.horizon*H);x.lineTo(W,ev.horizon*H);x.stroke();x.setLineDash([])}
  const p=ev.place;
  if(p){const ok=p.s>=.8,tx=p.tgt.x*W,ty=p.tgt.y*H,sx=p.sub.x*W,sy=p.sub.y*H,col=ok?'#3ddc84':'#ffc53d';
   if(p.k==='horizon'){x.strokeStyle=col;x.lineWidth=2.5*dpr;x.beginPath();x.moveTo(0,ty);x.lineTo(W,ty);x.stroke();x.lineWidth=Math.max(1,dpr);
    if(!ok&&Math.abs(ty-sy)>24*dpr){const ax=W*.86,u=ty>sy?1:-1;x.fillStyle=col;x.strokeStyle=col;x.lineWidth=3*dpr;x.beginPath();x.moveTo(ax,sy);x.lineTo(ax,ty-u*12*dpr);x.stroke();x.beginPath();x.moveTo(ax,ty);x.lineTo(ax-8*dpr,ty-u*13*dpr);x.lineTo(ax+8*dpr,ty-u*13*dpr);x.closePath();x.fill();x.lineWidth=Math.max(1,dpr)}}
   else{x.strokeStyle=col;x.lineWidth=3*dpr;x.beginPath();x.arc(tx,ty,(ok?16:13)*dpr,0,6.3);x.stroke();if(ok){x.fillStyle='rgba(61,220,132,.35)';x.fill()}
    x.fillStyle='#fff';x.beginPath();x.arc(sx,sy,5*dpr,0,6.3);x.fill();
    if(!ok){const dx=tx-sx,dy=ty-sy,d=Math.sqrt(dx*dx+dy*dy);if(d>30*dpr){const ux=dx/d,uy=dy/d,ex=tx-ux*18*dpr,ey=ty-uy*18*dpr;x.beginPath();x.moveTo(sx+ux*9*dpr,sy+uy*9*dpr);x.lineTo(ex,ey);x.stroke();
     x.beginPath();x.moveTo(ex,ey);x.lineTo(ex-ux*10*dpr-uy*6*dpr,ey-uy*10*dpr+ux*6*dpr);x.lineTo(ex-ux*10*dpr+uy*6*dpr,ey-uy*10*dpr-ux*6*dpr);x.closePath();x.fillStyle=col;x.fill()}}
    x.lineWidth=Math.max(1,dpr)}
  }
 }
 /* level */
 if(SENS.roll!=null&&Math.abs(SENS.roll)<35){
  const ok=Math.abs(SENS.roll)<1.5,cx=W/2,cy=H/2,L=W*.18;x.save();x.translate(cx,cy);
  x.strokeStyle=ok?'#3ddc84':'rgba(255,255,255,.55)';x.lineWidth=2*dpr;x.beginPath();x.moveTo(-L-26*dpr,0);x.lineTo(-L-8*dpr,0);x.moveTo(L+8*dpr,0);x.lineTo(L+26*dpr,0);x.stroke();
  x.rotate(-SENS.roll*Math.PI/180);x.strokeStyle=ok?'#3ddc84':'#ffc53d';x.lineWidth=(ok?3:2.5)*dpr;x.beginPath();x.moveTo(-L,0);x.lineTo(L,0);x.stroke();x.restore();
 }
}
async function shoot(){
 if(busy)return;if(!camOn||!video.videoWidth){$('fileIn').click();return}
 busy=true;LIVE.lastShot=Date.now();click();
 const fl=$('flash');fl.style.transition='none';fl.style.opacity='.7';requestAnimationFrame(()=>requestAnimationFrame(()=>{fl.style.transition='opacity .35s';fl.style.opacity='0'}));
 try{const g=grab();await openResult([{canvas:g,sens:sensSnap(),hour:new Date().getHours(),ts:Date.now(),scene:S.scene==='auto'?LIVE.scene:S.scene}])}catch(e){console.error(e);toast('ถ่ายไม่สำเร็จ ลองใหม่')}
 busy=false;
}
$('shutter').onclick=shoot;
$('bAuto').onclick=()=>{S.autoShot=!S.autoShot;LS.set('autoShot',S.autoShot);paintAuto();toast(S.autoShot?'เปิดถ่ายอัตโนมัติ: คะแนนถึง '+S.thr+' และนิ่ง 1 วินาที แอปกดให้เอง':'ปิดถ่ายอัตโนมัติ',3000)};
function paintAuto(){$('bAuto').textContent='⏱ ถ่ายอัตโนมัติ: '+(S.autoShot?'เปิด (≥'+S.thr+')':'ปิด');$('bAuto').classList.toggle('on',S.autoShot)}

/* ================= pickers ================= */
$('bScene').onclick=()=>{
 const box=el('<div></div>');
 SCENES.forEach(s=>{const o=el('<button class="opt'+(S.scene===s.id?' on':'')+'"><span class="ic">'+s.ic+'</span><span><b>'+s.name+'</b><span>'+s.sub+(SCENE_TIP[s.id]?' · '+SCENE_TIP[s.id]:'')+'</span></span></button>');
  o.onclick=()=>{S.scene=s.id;LS.set('scene',s.id);LIVE.mem={};if(s.id!=='auto')LIVE.scene=s.id;closeSheet();toast(s.ic+' '+s.name)};box.appendChild(o)});
 openSheet('ถ่ายอะไรอยู่?',box);
};
$('bTone').onclick=()=>{
 const box=el('<div></div>');
 const a=el('<button class="opt'+(S.tone==='auto'?' on':'')+'"><span class="ic">🤖</span><span><b>อัตโนมัติ (แนะนำ)</b><span>แอปเลือกโทนตามฉากและแสงให้</span></span></button>');
 a.onclick=()=>{S.tone='auto';LS.set('tone','auto');LIVE.why='';closeSheet()};box.appendChild(a);
 TONES.forEach(t=>{const o=el('<button class="opt'+(S.tone===t.id?' on':'')+'"><span class="sw" style="background:'+swatch(t)+'"></span><span><b>'+t.name+'</b><span>'+t.th+'</span></span></button>');
  o.onclick=()=>{S.tone=t.id;LS.set('tone',t.id);LIVE.tone=t.id;glSetTone(t);closeSheet();toast('🎨 '+t.name)};box.appendChild(o)});
 openSheet('เลือกโทนสี',box);
};
$('bImport').onclick=()=>{
 const box=el('<div></div>');
 box.appendChild(big('📷 ถ่ายด้วยแอปกล้องมือถือ','pri',()=>{closeSheet();$('camIn').value='';$('camIn').click()}));
 box.appendChild(big('🖼️ เลือกรูปจากเครื่อง (ได้หลายรูป)','',()=>{closeSheet();$('fileIn').value='';$('fileIn').click()}));
 box.appendChild(el('<div class="note">ภาพจากแอปกล้องของมือถือคมกว่าถ่ายผ่านเบราว์เซอร์ แอปจะวิเคราะห์การจัดภาพ แก้เอียง ครอปตามกฎ 1/3 ปรับแสง และใส่โทนให้อัตโนมัติ — ต้นฉบับเก็บไว้เสมอ</div>'));
 openSheet('นำเข้ารูป',box);
};
function importFiles(list){
 const files=[].slice.call(list||[]).filter(f=>/^image\//.test(f.type)||/\.(jpe?g|png|webp|heic)$/i.test(f.name));if(!files.length)return;
 openResult(files.map(f=>{const t=f.lastModified||Date.now();return {file:f,ts:t,hour:new Date(t).getHours()}}));
}
$('fileIn').onchange=e=>importFiles(e.target.files);
$('camIn').onchange=e=>importFiles(e.target.files);

/* ================= result (auto edit + before/after) ================= */
const R={q:[],i:0,split:.5};
async function openResult(items){R.q=items;R.i=0;paused=true;$('res').classList.add('open');await loadItem()}
function closeResult(){$('res').classList.remove('open');R.img=R.before=R.after=null;R.q=[];paused=false;if(!camOn&&!document.hidden)startCam();loadThumb()}
$('rClose').onclick=closeResult;
function busyR(on,t){$('rBusy').style.display=on?'flex':'none';if(t)$('rBusy').textContent=t}
async function loadItem(){
 const it=R.q[R.i];R.it=it;busyR(true,'กำลังวิเคราะห์รูป…');
 $('rTitle').textContent=(it.rec?'แต่งใหม่':'แต่งให้แล้ว ✨')+(R.q.length>1?' ('+(R.i+1)+'/'+R.q.length+')':'');
 $('rSave').disabled=$('rOrig').disabled=true;
 try{
  const src=it.canvas||await loadImg(it.file||it.blob);
  R.img=downscale(src,3000);if(src.close)try{src.close()}catch(e){}
  R.origBlob=it.file||it.blob||await toBlob(it.canvas,.93);
  R.before=downscale(R.img,1400);
  if(MP.state!=='ready'){busyR(true,'กำลังโหลดตัวช่วยหาคน… (ครั้งแรกต้องต่อเน็ต)');try{await Promise.race([loadMP(),sleep(15000)])}catch(e){}}
  busyR(true,'กำลังวิเคราะห์รูป…');await sleep(20);
  const st=statsOf(R.img),pp=detectPeople(downscale(R.img,512),true);
  R.A=buildA(st,pp,it.sens||null,it.hour==null?new Date().getHours():it.hour,false);
  if(R.A.tiltSrc==='image'&&R.A.tilt){/* refine: rotate by estimate, measure what is left */
   const sm=downscale(R.img,512),t=R.A.tilt,k=rotFit(sm.width,sm.height,t),c2=mk(sm.width*k,sm.height*k),x2=c2.getContext('2d');
   x2.translate(c2.width/2,c2.height/2);x2.rotate(t*Math.PI/180);x2.drawImage(sm,-sm.width/2,-sm.height/2);
   const r2=statsOf(c2).tilt;if(r2.conf>.2&&Math.abs(r2.deg)<3)R.A.tilt=t+r2.deg}
  const rec=it.rec;
  R.scene=rec&&rec.scene?rec.scene:(it.scene&&it.scene!=='auto'?it.scene:(S.scene==='auto'?guessScene(R.A):S.scene));
  R.auto=chooseTone(R.scene,R.A);R.tone=rec&&rec.tone?rec.tone:(S.tone==='auto'?R.auto.id:S.tone);R.toneSet=!!rec||S.tone!=='auto';
  R.fix=rec&&rec.fix?Object.assign({},rec.fix):Object.assign({},S.fix);
  R.ev=evaluate(R.scene,R.A,{});
  await renderResult();
 }catch(e){console.error(e);busyR(true,'เปิดรูปนี้ไม่ได้ 😢');$('rSave').disabled=true;$('rOrig').disabled=false;$('rOrig').textContent=R.q.length>1?'ข้าม':'ปิด';R.broken=true;return}
 R.broken=false;$('rOrig').textContent='เก็บต้นฉบับ';
}
async function renderResult(){
 busyR(true,'กำลังแต่งรูป…');await sleep(30);
 const A=R.A,W=R.img.width,H=R.img.height;
 R.plan=planEdit(R.scene,A,W,H,R.fix);
 R.after=renderEdit(R.img,R.plan,toneById(R.tone),1400,{light:R.fix.light,A:A,scene:R.scene});
 const st2=statsOf(R.after);R.ev2=evaluate(R.scene,transformA(A,R.plan,st2),{});
 R.sum=summarize(R.ev,R.ev2);
 paintResult();drawCompare();busyR(false);
 $('rSave').disabled=$('rOrig').disabled=false;
}
function paintResult(){
 const sc=sceneById(R.scene),t=toneById(R.tone),a=R.ev.score,b=R.ev2.score;
 $('rScene').textContent=sc.ic+' '+sc.name+' ▾';
 $('rScore').innerHTML='คะแนนจัดภาพ <span class="num" style="color:'+scoreColor(a)+'">'+a+'</span>'+(b!==a?'→<span class="num" style="color:'+scoreColor(b)+'">'+b+'</span>':'')+'<span class="sp"></span>'+(R.A.faces.length?'<span class="pill">👤 '+R.A.faces.length+' คน</span>':'')+(R.A.tilt!=null&&Math.abs(R.A.tilt)>=.8?'<span class="pill">↻ เอียง '+Math.abs(R.A.tilt).toFixed(1)+'°</span>':'');
 const tr=$('rTones');tr.innerHTML='';
 TONES.forEach(x=>{const c=el('<button class="tchip'+(x.id===R.tone?' on':'')+'"><span class="sw" style="background:'+swatch(x)+'"></span>'+x.name+(x.id===R.auto.id?'<span class="rec">แนะนำ</span>':'')+'</button>');
  c.onclick=()=>{if(R.tone===x.id)return;R.tone=x.id;R.toneSet=true;renderResult()};tr.appendChild(c)});
 const on=tr.querySelector('.on');if(on&&on.scrollIntoView)setTimeout(()=>on.scrollIntoView({inline:'center',block:'nearest'}),0);
 const fx=$('rFix');fx.innerHTML='';
 const p=R.plan,cropped=p.crop.w<1;
 [['straight','แก้เอียง'+(p.rot?' '+Math.abs(p.rot).toFixed(1)+'°':'')],['crop','ครอปตามกฎ 1/3'+(R.fix.crop&&!cropped?' (ไม่ต้องครอป)':'')],['light','ปรับแสง']].forEach(q=>{
  const b=el('<button class="'+(R.fix[q[0]]?'on':'')+'">'+(R.fix[q[0]]?'✓ ':'')+q[1]+'</button>');b.onclick=()=>{R.fix[q[0]]=!R.fix[q[0]];renderResult()};fx.appendChild(b)});
 $('rSum').innerHTML='<div><b>👍 ทำได้ดี</b>'+esc(R.sum.good)+'</div><div><b>💡 ครั้งหน้าลอง</b>'+esc(R.sum.bad)+'</div><div><b>🎨 โทน '+esc(t.name)+'</b>'+esc(R.tone===R.auto.id?R.auto.why:t.th+' (เลือกเอง · แอปแนะนำ '+toneById(R.auto.id).name+')')+'</div>';
}
function fitIn(img,W,H){const s=Math.min(W/img.width,H/img.height),w=img.width*s,h=img.height*s;return [(W-w)/2,(H-h)/2,w,h]}
function drawCompare(){
 const st=$('rStage'),cv=$('rCv'),dpr=Math.min(2,devicePixelRatio||1),W=Math.round(st.clientWidth*dpr),H=Math.round(st.clientHeight*dpr);if(!R.before||!R.after||!W)return;
 if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H}
 const x=cv.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,W,H);
 const f1=fitIn(R.before,W,H),f2=fitIn(R.after,W,H),sp=R.split*W;
 x.save();x.beginPath();x.rect(0,0,sp,H);x.clip();x.drawImage(R.before,f1[0],f1[1],f1[2],f1[3]);x.restore();
 x.save();x.beginPath();x.rect(sp,0,W-sp,H);x.clip();x.drawImage(R.after,f2[0],f2[1],f2[2],f2[3]);x.restore();
 $('rHandle').style.left=(R.split*100)+'%';
}
addEventListener('resize',()=>{if($('res').classList.contains('open'))drawCompare()});
(()=>{const st=$('rStage');let down=false;
 const set=e=>{const r=st.getBoundingClientRect();R.split=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));drawCompare()};
 st.addEventListener('pointerdown',e=>{down=true;set(e)});st.addEventListener('pointermove',e=>{if(down)set(e)});
 ['pointerup','pointercancel','pointerleave'].forEach(n=>st.addEventListener(n,()=>down=false));
})();
$('rScene').onclick=()=>{
 const box=el('<div></div>');
 SCENES.filter(s=>s.id!=='auto').forEach(s=>{const o=el('<button class="opt'+(R.scene===s.id?' on':'')+'"><span class="ic">'+s.ic+'</span><span><b>'+s.name+'</b><span>'+s.sub+'</span></span></button>');
  o.onclick=()=>{closeSheet();R.scene=s.id;R.ev=evaluate(R.scene,R.A,{});R.auto=chooseTone(R.scene,R.A);if(!R.toneSet)R.tone=R.auto.id;renderResult()};box.appendChild(o)});
 openSheet('รูปนี้เป็นฉากอะไร?',box);
};
async function saveResult(edited){
 if(R.broken){nextItem();return}
 busyR(true,'กำลังบันทึก…');$('rSave').disabled=$('rOrig').disabled=true;await sleep(30);
 try{
  let blob=R.origBlob;
  if(edited){const full=renderEdit(R.img,R.plan,toneById(R.tone),3000,{light:R.fix.light,A:R.A,scene:R.scene});blob=await toBlob(full,.92)}
  const tsrc=edited?R.after:R.before,thumb=await toBlob(downscale(tsrc,420),.8),it=R.it;
  const rec={ts:it.ts||Date.now(),blob:blob,orig:R.origBlob,thumb:thumb,edited:edited,scene:R.scene,tone:R.tone,fix:R.fix,score:R.ev.score,score2:edited?R.ev2.score:R.ev.score,sum:R.sum,why:R.auto.why};
  if(it.rec){rec.id=it.rec.id;await store('readwrite',s=>s.put(rec))}else rec.id=await store('readwrite',s=>s.add(rec));
  toast(edited?'เก็บรูปแต่งแล้ว (มีต้นฉบับด้วย) ✨':'เก็บต้นฉบับแล้ว');
  if(it.rec&&$('view').classList.contains('open')){await openGallery(true);openViewer(rec)}
 }catch(e){console.error(e);toast('บันทึกไม่สำเร็จ — พื้นที่เต็มหรือเปล่า?',3500);busyR(false);$('rSave').disabled=$('rOrig').disabled=false;return}
 nextItem();
}
function nextItem(){if(R.i<R.q.length-1){R.i++;loadItem()}else closeResult()}
$('rSave').onclick=()=>saveResult(true);
$('rOrig').onclick=()=>saveResult(false);

/* ================= storage ================= */
const DB=new Promise((res,rej)=>{try{const r=indexedDB.open('thaipen',1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id',autoIncrement:true});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}});
async function store(mode,fn){const db=await DB;return new Promise((res,rej)=>{const t=db.transaction('photos',mode),r=fn(t.objectStore('photos'));t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})}
const getAll=()=>store('readonly',s=>s.getAll()).catch(()=>[]);
let thumbURL=null;
async function loadThumb(){const all=await getAll(),t=$('thumb'),last=all[all.length-1];if(thumbURL){URL.revokeObjectURL(thumbURL);thumbURL=null}
 if(last){thumbURL=URL.createObjectURL(last.thumb||last.blob);t.style.backgroundImage='url('+thumbURL+')';t.textContent=''}else{t.style.backgroundImage='none';t.innerHTML='<small style="font-size:11px;color:var(--mute)">อัลบั้ม</small>'}}
function fname(r,orig){const d=new Date(r.ts||Date.now());return 'ThaiPen_'+d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate())+'_'+pad2(d.getHours())+pad2(d.getMinutes())+pad2(d.getSeconds())+(orig?'_orig':'')+'.jpg'}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),8000)}
async function shareBlob(blob,name){
 try{const file=new File([blob],name,{type:blob.type||'image/jpeg'});
  if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'ถ่ายเป็น'});return true}catch(e){if(e&&e.name==='AbortError')return false}}}catch(e){}
 download(blob,name);toast('เครื่องนี้แชร์ตรงไม่ได้ เลยดาวน์โหลดให้แทน');return true;
}

/* ================= gallery ================= */
let gURLs=[],selMode=false,picked=[];const VIEW={list:[],i:0,url:null,origURL:null};
async function openGallery(keep){
 $('gal').classList.add('open');paused=true;const g=$('grid');g.innerHTML='';gURLs.forEach(u=>URL.revokeObjectURL(u));gURLs=[];
 const all=(await getAll()).reverse();VIEW.list=all;$('gCount').textContent=all.length?'· '+all.length:'';
 $('gal').classList.toggle('sel',selMode);
 if(!all.length){g.innerHTML='<div class="empty">ยังไม่มีรูปเลย<br>ไปถ่ายรูปแรกกันเถอะ 📸</div>';return}
 all.forEach(r=>{const u=URL.createObjectURL(r.thumb||r.blob);gURLs.push(u);
  const t=el('<div class="tile"><img alt="" draggable="false" loading="lazy"><div class="badge"></div>'+(r.score2!=null?'<span class="sc" style="color:'+scoreColor(r.score2)+'">'+r.score2+'</span>':'')+'</div>');
  t.querySelector('img').src=u;t.dataset.id=r.id;
  let lp=0,fired=false;
  t.addEventListener('pointerdown',()=>{fired=false;clearTimeout(lp);lp=setTimeout(()=>{fired=true;if(navigator.vibrate)navigator.vibrate(20);if(!selMode)setSel(true,r);else togglePick(r)},450)});
  ['pointerup','pointercancel','pointerleave'].forEach(n=>t.addEventListener(n,()=>clearTimeout(lp)));
  t.addEventListener('contextmenu',e=>e.preventDefault());
  t.onclick=()=>{if(fired){fired=false;return}if(selMode)togglePick(r);else openViewer(r)};
  g.appendChild(t)});
 paintPicks();
}
function paintPicks(){
 [].forEach.call(document.querySelectorAll('#grid .tile'),t=>{const i=picked.findIndex(p=>String(p.id)===t.dataset.id);t.classList.toggle('picked',i>=0);t.querySelector('.badge').textContent=i>=0?i+1:''});
 $('selDel').textContent='🗑️ ลบ ('+picked.length+')';$('selAll').textContent=picked.length&&picked.length===VIEW.list.length?'ไม่เลือก':'เลือกทั้งหมด';
 $('gSel').textContent=selMode?'ยกเลิก':'เลือก';$('gSel').classList.toggle('on',selMode);
}
function togglePick(r){const i=picked.findIndex(p=>p.id===r.id);if(i>=0)picked.splice(i,1);else picked.push(r);paintPicks()}
function setSel(on,first){selMode=on;picked=first?[first]:[];$('gal').classList.toggle('sel',on);paintPicks()}
$('gSel').onclick=()=>setSel(!selMode);
$('selAll').onclick=()=>{picked=picked.length===VIEW.list.length?[]:VIEW.list.slice();paintPicks()};
$('selDel').onclick=()=>{
 const n=picked.length;if(!n){toast('ยังไม่ได้เลือกรูป');return}
 const box=el('<div></div>');box.appendChild(el('<div class="note">ลบ '+n+' รูป (รวมต้นฉบับ) ออกจากแอป กู้คืนไม่ได้ ยกเว้นมีไฟล์สำรองไว้</div>'));
 box.appendChild(big('🗑️ ลบ '+n+' รูป','pri',async()=>{const ids=picked.map(r=>r.id);await store('readwrite',s=>{ids.forEach(id=>s.delete(id))});closeSheet();setSel(false);await openGallery();loadThumb();toast('ลบแล้ว '+n+' รูป')}));
 box.appendChild(big('ยกเลิก','',closeSheet));openSheet('ยืนยันการลบ',box);
};
$('thumb').onclick=()=>{setSel(false);openGallery()};
$('gClose').onclick=()=>{$('gal').classList.remove('open');selMode=false;gURLs.forEach(u=>URL.revokeObjectURL(u));gURLs=[];paused=$('res').classList.contains('open')};

/* ================= viewer ================= */
function openViewer(r,dir){
 let i=VIEW.list.findIndex(x=>x.id===r.id);if(i<0){VIEW.list=[r];i=0}VIEW.i=i;VIEW.r=r;
 if(VIEW.url)URL.revokeObjectURL(VIEW.url);if(VIEW.origURL){URL.revokeObjectURL(VIEW.origURL);VIEW.origURL=null}
 VIEW.url=URL.createObjectURL(r.blob);const im=$('vImg');im.src=VIEW.url;
 im.style.transition='none';im.style.transform=dir?'translateX('+(dir*40)+'%)':'none';im.style.opacity=dir?'0':'1';
 if(dir)requestAnimationFrame(()=>requestAnimationFrame(()=>{im.style.transition='transform .2s,opacity .2s';im.style.transform='none';im.style.opacity='1'}));
 const sc=sceneById(r.scene),t=toneById(r.tone);
 $('vTitle').textContent=(VIEW.i+1)+' / '+VIEW.list.length;
 $('vOrig').style.display=r.edited&&r.orig?'':'none';
 $('vInfo').innerHTML=new Date(r.ts).toLocaleString('th-TH')+' · '+sc.ic+' '+sc.name+(r.edited?' · 🎨 '+esc(t.name):' · ต้นฉบับ')+(r.score!=null?' · คะแนน '+r.score+(r.score2!==r.score?' → '+r.score2:''):'')+
  (r.sum?'<br>👍 <b>'+esc(r.sum.good)+'</b><br>💡 '+esc(r.sum.bad):'');
 $('vEdit').disabled=!r.orig;$('view').classList.add('open');
}
function viewStep(d){const n=VIEW.i+d;if(n<0||n>=VIEW.list.length){$('vImg').style.transition='transform .2s';$('vImg').style.transform='none';return}openViewer(VIEW.list[n],d)}
(()=>{const st=$('vStage');let x0=null,y0=0,dx=0,lock=null;
 st.addEventListener('pointerdown',e=>{x0=e.clientX;y0=e.clientY;dx=0;lock=null});
 st.addEventListener('pointermove',e=>{if(x0==null)return;dx=e.clientX-x0;const dy=e.clientY-y0;if(!lock&&(Math.abs(dx)>8||Math.abs(dy)>8))lock=Math.abs(dx)>Math.abs(dy)?'x':'y';if(lock==='x'){$('vImg').style.transition='none';$('vImg').style.transform='translateX('+dx+'px)'}});
 const end=()=>{if(x0==null)return;x0=null;if(lock!=='x')return;if(dx<-60)viewStep(1);else if(dx>60)viewStep(-1);else{$('vImg').style.transition='transform .2s';$('vImg').style.transform='none'}};
 st.addEventListener('pointerup',end);st.addEventListener('pointercancel',end);
 addEventListener('keydown',e=>{if(!$('view').classList.contains('open'))return;if(e.key==='ArrowRight')viewStep(1);if(e.key==='ArrowLeft')viewStep(-1)});
})();
(()=>{const b=$('vOrig');const on=()=>{const r=VIEW.r;if(!r||!r.orig)return;if(!VIEW.origURL)VIEW.origURL=URL.createObjectURL(r.orig);$('vImg').src=VIEW.origURL;b.textContent='กำลังดูต้นฉบับ'};
 const off=()=>{if(VIEW.url)$('vImg').src=VIEW.url;b.textContent='กดค้างดูต้นฉบับ'};
 b.addEventListener('pointerdown',on);['pointerup','pointercancel','pointerleave'].forEach(n=>b.addEventListener(n,off));b.addEventListener('contextmenu',e=>e.preventDefault());})();
$('vClose').onclick=()=>{$('view').classList.remove('open')};
$('vShare').onclick=()=>{if(VIEW.r)shareBlob(VIEW.r.blob,fname(VIEW.r))};
$('vSave').onclick=()=>{const r=VIEW.r;if(!r)return;
 if(!r.edited||!r.orig){download(r.blob,fname(r));return}
 const box=el('<div></div>');box.appendChild(big('⬇️ รูปแต่ง','pri',()=>{closeSheet();download(r.blob,fname(r))}));box.appendChild(big('⬇️ ต้นฉบับ','',()=>{closeSheet();download(r.orig,fname(r,true))}));openSheet('ดาวน์โหลด',box)};
$('vEdit').onclick=()=>{const r=VIEW.r;if(!r||!r.orig)return;openResult([{blob:r.orig,rec:r,ts:r.ts,hour:new Date(r.ts).getHours()}])};
let delArm=0;
$('vDel').onclick=async()=>{const r=VIEW.r;if(!r)return;
 if(Date.now()-delArm>2500){delArm=Date.now();$('vDel').innerHTML='<i>⚠️</i>แตะอีกครั้ง';setTimeout(()=>$('vDel').innerHTML='<i>🗑️</i>ลบ',2500);return}
 delArm=0;$('vDel').innerHTML='<i>🗑️</i>ลบ';await store('readwrite',s=>s.delete(r.id));const at=VIEW.i;await openGallery();loadThumb();toast('ลบแล้ว');
 if(VIEW.list.length)openViewer(VIEW.list[Math.min(at,VIEW.list.length-1)]);else $('view').classList.remove('open')};

/* ================= ask AI (Gemini, user's own key) ================= */
$('vAI').onclick=()=>{const r=VIEW.r;if(!r)return;if(!S.aiKey){aiSetup(()=>askAI(r));return}askAI(r)};
function aiSetup(done){
 const box=el('<div></div>');box.appendChild(el('<div class="note">ใส่ Gemini API key ของคุณ (ขอฟรีที่ aistudio.google.com → Get API key) key เก็บในเครื่องนี้เท่านั้น รูปจะถูกส่งไปที่ Google เฉพาะตอนกด "ถาม AI"</div>'));
 const k=el('<input class="txtin" placeholder="AIza…" autocomplete="off">');k.value=S.aiKey;box.appendChild(k);
 const m=el('<input class="txtin" placeholder="รุ่นโมเดล">');m.value=S.aiModel;box.appendChild(m);
 box.appendChild(big('💾 บันทึก','pri',()=>{S.aiKey=k.value.trim();S.aiModel=m.value.trim()||'gemini-2.5-flash';LS.set('aiKey',S.aiKey);LS.set('aiModel',S.aiModel);closeSheet();toast(S.aiKey?'บันทึก key แล้ว':'ลบ key แล้ว');if(S.aiKey&&done)done()}));
 openSheet('ตั้งค่า ถาม AI',box);
}
function b64(blob){return new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(String(f.result).split(',')[1]);f.onerror=rej;f.readAsDataURL(blob)})}
async function askAI(r){
 const box=el('<div></div>'),out=el('<div class="ai">🤖 กำลังดูรูป…</div>');box.appendChild(out);openSheet('AI วิจารณ์รูปนี้',box);
 try{
  const img=await loadImg(r.blob),small=await toBlob(downscale(img,1024),.85),data=await b64(small);
  const prompt='คุณคือครูสอนถ่ายรูปใจดี สำหรับมือใหม่ที่ใช้มือถือ ดูรูปนี้ (ฉาก: '+sceneById(r.scene).name+') แล้วตอบเป็นภาษาไทยสั้นๆ อ่านง่ายบนมือถือ ไม่เกิน 120 คำ แบ่งเป็น:\n👍 จุดเด่น 1-2 ข้อ\n💡 ควรปรับ 1-2 ข้อ (บอกวิธีทำจริง เช่น ขยับไปทางไหน มุมไหน)\n⭐ คะแนนรวม /10';
  const res=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(S.aiModel)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':S.aiKey},
   body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:'image/jpeg',data:data}}]}]})});
  const j=await res.json();
  if(!res.ok)throw new Error((j&&j.error&&j.error.message)||('HTTP '+res.status));
  const parts=(j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts)||[];
  out.textContent=parts.map(p=>p.text||'').join('').trim()||'AI ไม่ได้ตอบกลับมา ลองใหม่อีกครั้ง';
 }catch(e){out.textContent='ถาม AI ไม่สำเร็จ: '+e.message+'\n\nเช็กอินเทอร์เน็ต หรือ API key ในตั้งค่า';box.appendChild(big('🔑 ตั้งค่า key','',()=>aiSetup()))}
}

/* ================= settings ================= */
$('bSet').onclick=()=>{
 const box=el('<div></div>');
 toggleRow(box,'เส้นช่วยจัดภาพ 1/3',()=>S.grid,v=>{S.grid=v;LS.set('grid',v)});
 toggleRow(box,'เสียงชัตเตอร์',()=>S.sound,v=>{S.sound=v;LS.set('sound',v)});
 selectRow(box,'ถ่ายอัตโนมัติเมื่อคะแนนถึง',[['70','70'],['80','80'],['90','90']],()=>S.thr,v=>{S.thr=+v;LS.set('thr',S.thr);paintAuto()});
 box.appendChild(el('<div class="note" style="padding-top:14px">แต่งอัตโนมัติหลังถ่าย/นำเข้า</div>'));
 [['straight','แก้เอียง'],['crop','ครอปตามกฎ 1/3'],['light','ปรับแสง']].forEach(q=>toggleRow(box,q[1],()=>S.fix[q[0]],v=>{S.fix[q[0]]=v;LS.set('fix',S.fix)}));
 box.appendChild(big('🤖 ตั้งค่า ถาม AI (Gemini)','',()=>aiSetup()));
 box.appendChild(big('💾 สำรองรูปทั้งหมด (.zip)','',()=>{closeSheet();backupAll()}));
 box.appendChild(big('📥 กู้คืนจากไฟล์สำรอง','',()=>{closeSheet();$('zipIn').value='';$('zipIn').click()}));
 const lb=LS.get('lastBackup',0);
 box.appendChild(el('<div class="note">'+(lb?'สำรองล่าสุด '+new Date(lb).toLocaleDateString('th-TH'):'ยังไม่เคยสำรองรูป')+' · ฟรี ไม่มีโฆษณา ประมวลผลในเครื่อง รูปไม่ถูกส่งไปไหน (ยกเว้นตอนกด ถาม AI)<br>รูปในแอปจะหายถ้าล้างข้อมูลเบราว์เซอร์ — สำรองไว้เป็นระยะ<br>ตัวช่วยหาคน: '+({ready:'พร้อม ✅',loading:'กำลังโหลด…',fail:'โหลดไม่ได้ (ต้องต่อเน็ตครั้งแรก)',idle:'ยังไม่โหลด'}[MP.state])+'</div>'));
 openSheet('ตั้งค่า',box);
};

/* ================= backup (zip, stored) ================= */
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u8){let c=-1;for(let i=0;i<u8.length;i++)c=CRC[(c^u8[i])&255]^(c>>>8);return(c^-1)>>>0}
function makeZip(files){
 const parts=[],central=[],enc=new TextEncoder();let off=0;
 files.forEach(f=>{const nm=enc.encode(f.name),crc=crc32(f.data),sz=f.data.length,h=new DataView(new ArrayBuffer(30));
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(12,0x21,true);h.setUint32(14,crc,true);h.setUint32(18,sz,true);h.setUint32(22,sz,true);h.setUint16(26,nm.length,true);
  parts.push(h.buffer,nm,f.data);
  const c=new DataView(new ArrayBuffer(46));c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(14,0x21,true);c.setUint32(16,crc,true);c.setUint32(20,sz,true);c.setUint32(24,sz,true);c.setUint16(28,nm.length,true);c.setUint32(42,off,true);
  central.push(c.buffer,nm);off+=30+nm.length+sz});
 const cs=central.reduce((a,b)=>a+b.byteLength,0),e=new DataView(new ArrayBuffer(22));
 e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cs,true);e.setUint32(16,off,true);
 return new Blob(parts.concat(central,[e.buffer]),{type:'application/zip'});
}
function readZip(buf){
 const dv=new DataView(buf),u8=new Uint8Array(buf),dec=new TextDecoder();let e=-1;
 for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-65557);i--)if(dv.getUint32(i,true)===0x06054b50){e=i;break}
 if(e<0)throw new Error('not zip');
 const n=dv.getUint16(e+10,true),out={};let p=dv.getUint32(e+16,true);
 for(let i=0;i<n;i++){if(dv.getUint32(p,true)!==0x02014b50)throw new Error('bad zip');
  const method=dv.getUint16(p+10,true),sz=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true);
  const name=dec.decode(u8.subarray(p+46,p+46+nl)),ds=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true);
  if(method===0)out[name]=u8.subarray(ds,ds+sz);p+=46+nl+xl+cl}
 return out;
}
async function backupAll(){
 const all=await getAll();if(!all.length){toast('ยังไม่มีรูปให้สำรอง');return}
 toast('กำลังเตรียม '+all.length+' รูป…',4000);
 const files=[],items=[],used={};
 for(const r of all){let base=fname(r).replace(/\.jpg$/,'');while(used[base])base+='_';used[base]=1;
  const it={};for(const k in r)if(k!=='blob'&&k!=='orig'&&k!=='thumb')it[k]=r[k];
  it.file=base+'.jpg';files.push({name:it.file,data:new Uint8Array(await new Response(r.blob).arrayBuffer())});
  if(r.orig&&r.orig!==r.blob&&r.edited){it.origFile='originals/'+base+'.jpg';files.push({name:it.origFile,data:new Uint8Array(await new Response(r.orig).arrayBuffer())})}
  items.push(it)}
 files.push({name:'thaipen-backup.json',data:new TextEncoder().encode(JSON.stringify({app:'thaipen',v:1,created:Date.now(),items:items}))});
 const zip=makeZip(files),d=new Date(),name='ThaiPen_backup_'+d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate())+'.zip';
 const box=el('<div></div>');box.appendChild(el('<div class="note">ไฟล์สำรอง '+all.length+' รูป · '+(zip.size/1048576).toFixed(1)+' MB<br>แนะนำ: กด "แชร์" แล้วเลือก <b>Google Drive</b></div>'));
 box.appendChild(big('📤 แชร์ไป Google Drive / แอปอื่น','pri',async()=>{if(await shareBlob(zip,name)){LS.set('lastBackup',Date.now());closeSheet()}}));
 box.appendChild(big('⬇️ ดาวน์โหลดลงเครื่อง','',()=>{download(zip,name);LS.set('lastBackup',Date.now());closeSheet()}));
 openSheet('สำรองรูปทั้งหมด',box);
}
$('zipIn').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{toast('กำลังกู้คืน…',4000);const Z=readZip(await file.arrayBuffer()),mj=Z['thaipen-backup.json'];if(!mj)throw new Error('no meta');
  const meta=JSON.parse(new TextDecoder().decode(mj)),have={};(await getAll()).forEach(r=>have[r.ts]=1);let n=0;
  for(const it of meta.items||[]){if(have[it.ts]||!Z[it.file])continue;
   const rec={};for(const k in it)if(k!=='id'&&k!=='file'&&k!=='origFile')rec[k]=it[k];
   rec.blob=new Blob([Z[it.file]],{type:'image/jpeg'});rec.orig=it.origFile&&Z[it.origFile]?new Blob([Z[it.origFile]],{type:'image/jpeg'}):rec.blob;
   rec.thumb=await toBlob(downscale(await loadImg(rec.blob),420),.8);
   await store('readwrite',s=>s.add(rec));n++}
  loadThumb();toast(n?'กู้คืนแล้ว '+n+' รูป 🎉':'ไม่มีรูปใหม่ให้กู้คืน');
 }catch(err){console.error(err);toast('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ ถ่ายเป็น')}
};

/* ================= init ================= */
if(initGL($('live'))){$('live').style.display='block';video.style.opacity='0';glSetTone(toneById(LIVE.tone))}
fitVF();paintAuto();loadThumb();startCam().then(()=>{loadMP().catch(()=>{})});requestAnimationFrame(loop);setTimeout(tick,400);
if(!LS.get('seenIntro',false)){LS.set('seenIntro',true);setTimeout(()=>{const box=el('<div></div>');
 box.appendChild(el('<div class="note" style="font-size:14px;color:var(--ink)">📸 หันกล้องไปที่สิ่งที่อยากถ่าย<br>💬 ทำตามคำแนะนำด้านบนจอ<br>🟢 วงแหวนเขียว = จัดภาพดีแล้ว กดถ่ายได้เลย<br>✨ ถ่ายเสร็จ แอปแต่งให้ เทียบก่อน/หลังได้<br>🖼️ มือถือกล้องเบราว์เซอร์ไม่ชัด? กด "นำเข้า" แล้วถ่ายด้วยแอปกล้องมือถือแทน</div>'));
 box.appendChild(big('เริ่มเลย','pri',closeSheet));openSheet('ยินดีต้อนรับสู่ ถ่ายเป็น 👋',box)},900)}
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
window.__tp={R,LIVE,S,SENS,openResult,evaluate,statsOf};
