'use strict';
/* ถ่ายเป็น — composition coach: image stats, people detection (MediaPipe), scene rules, scoring, auto-edit plan */

var SCENES=[
 {id:'auto',ic:'🤖',name:'อัตโนมัติ',sub:'แอปเดาฉากให้'},
 {id:'land',ic:'🏞️',name:'วิว',sub:'ทะเล ภูเขา ทุ่ง'},
 {id:'solo',ic:'🧍',name:'คน 1 คน',sub:'ถ่ายเพื่อน แฟน'},
 {id:'duo',ic:'👫',name:'คนคู่/กลุ่ม',sub:'2 คนขึ้นไป'},
 {id:'food',ic:'🍜',name:'อาหาร',sub:'จาน แก้ว ขนม'},
 {id:'city',ic:'🏙️',name:'ตึก/เมือง',sub:'ตึก ถนน วัด'}
];
var SCENE_TIP={
 land:'วางเส้นขอบฟ้าไว้บนเส้น 1/3 ไม่ใช่กลางภาพ',
 solo:'วางตาไว้บนเส้น 1/3 ด้านบน เว้นที่ว่างฝั่งที่คนหันหน้าไป',
 duo:'ให้หัวสองคนอยู่ระดับใกล้กัน ยืนชิดกันนิดนึง',
 food:'ถ่ายจากด้านบนตรงๆ หรือเอียงประมาณ 45° ใกล้หน้าต่าง',
 city:'ถือกล้องตั้งตรง ตึกจะไม่เอียงสอบ ถอยหลังแทนการเงยกล้อง'
};
function sceneById(id){for(var i=0;i<SCENES.length;i++)if(SCENES[i].id===id)return SCENES[i];return SCENES[0]}
var clamp=function(v,a,b){return v<a?a:v>b?b:v};
var lin=function(v,a,b){return clamp((v-a)/(b-a),0,1)};

/* ---------------- image statistics ---------------- */
function statsOf(src){
 var c=src.width>256||src.height>256?downscale(src,256):src,w=c.width,h=c.height;
 var d=c.getContext('2d').getImageData(0,0,w,h).data,n=w*h,G=new Float32Array(n),hist=new Float64Array(256);
 var r=0,g=0,b=0,sat=0,hiC=0,loC=0;
 for(var i=0,p=0;i<n;i++,p+=4){var R=d[p],Gg=d[p+1],B=d[p+2],l=.299*R+.587*Gg+.114*B,mx=Math.max(R,Gg,B),mn=Math.min(R,Gg,B);
  G[i]=l;hist[l|0]++;r+=R;g+=Gg;b+=B;sat+=mx?(mx-mn)/mx:0;if(l>248)hiC++;if(l<6)loC++}
 r/=n;g/=n;b/=n;sat/=n;
 /* light blur (1-2-1) so pixel staircases don't read as horizontal edges */
 var Bt=new Float32Array(n),Gs=new Float32Array(n);
 for(var yy=0;yy<h;yy++)for(var xx=0;xx<w;xx++){var q=yy*w+xx,a1=G[xx>0?q-1:q],a2=G[xx<w-1?q+1:q];Bt[q]=(a1+2*G[q]+a2)/4}
 for(yy=0;yy<h;yy++)for(xx=0;xx<w;xx++){q=yy*w+xx;Gs[q]=(Bt[yy>0?q-w:q]+2*Bt[q]+Bt[yy<h-1?q+w:q])/4}
 var pct=function(q){var t=0,lim=q*n;for(var v=0;v<256;v++){t+=hist[v];if(t>=lim)return v}return 255};
 /* sharpness (laplacian variance) + edge orientation histogram for tilt */
 var lap=0,lap2=0,cnt=0,BIN=0.5,NB=61,HH=new Float64Array(NB),HV=new Float64Array(NB),eH=0,eV=0,eAll=0;
 for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){
  var k=y*w+x,L=G[k-1]+G[k+1]+G[k-w]+G[k+w]-4*G[k];lap+=L;lap2+=L*L;cnt++;
  var gx=(Gs[k-w+1]+2*Gs[k+1]+Gs[k+w+1])-(Gs[k-w-1]+2*Gs[k-1]+Gs[k+w-1]);
  var gy=(Gs[k+w-1]+2*Gs[k+w]+Gs[k+w+1])-(Gs[k-w-1]+2*Gs[k-w]+Gs[k-w+1]);
  var m=Math.sqrt(gx*gx+gy*gy);if(m<70)continue;eAll+=m;
  var a=Math.atan2(gy,gx)*57.2958-90;a=((a%180)+270)%180-90; /* edge line angle, -90..90 */
  if(Math.abs(a)<15){HH[Math.round((a+15)/BIN)]+=m;eH+=m}
  else if(Math.abs(a)>75){var dv=a>0?a-90:a+90;HV[Math.round((dv+15)/BIN)]+=m;eV+=m}
 }
 lap/=cnt;var sharp=lap2/cnt-lap*lap;
 /* tilt: peak of combined (horizontal+vertical) deviation histogram */
 var best=-1,bi=30,tot=0,S=new Float64Array(NB);
 for(var j=0;j<NB;j++){for(var t=-2;t<=2;t++){var q=j+t;if(q>=0&&q<NB)S[j]+=(HH[q]+HV[q])*(3-Math.abs(t))}tot+=HH[j]+HV[j]}
 for(j=0;j<NB;j++)if(S[j]>best){best=S[j];bi=j}
 var near=0,wsum=0;for(j=Math.max(0,bi-3);j<=Math.min(NB-1,bi+3);j++){near+=HH[j]+HV[j];wsum+=(HH[j]+HV[j])*(j*BIN-15)}var dev=near?wsum/near:0;
 var tiltConf=tot?near/tot:0;
 /* horizon: strongest bright->dark drop of row means */
 var rows=new Float64Array(h);for(y=0;y<h;y++){var s=0;for(x=0;x<w;x++)s+=G[y*w+x];rows[y]=s/w}
 var hy=-1,hd=0,win=Math.max(2,h/20|0);
 for(y=Math.round(h*.12);y<h*.88;y++){var up=0,dn=0;for(t=1;t<=win;t++){up+=rows[Math.max(0,y-t)];dn+=rows[Math.min(h-1,y+t)]}var dd=(up-dn)/win;if(dd>hd){hd=dd;hy=y}}
 return {w:w,h:h,gray:G,lum:(.299*r+.587*g+.114*b),p1:pct(.01),p50:pct(.5),p99:pct(.99),hiClip:hiC/n,loClip:loC/n,sat:sat,warm:r-b,green:g-(r+b)/2,blue:b-r,
  sharp:sharp,tilt:{deg:-dev,conf:tiltConf},vert:eAll?eV/eAll:0,horiz:eAll?eH/eAll:0,horizon:{y:hy/h,conf:hd/255}};
}
function regionLum(st,b){
 var w=st.w,h=st.h,x0=clamp(b.x*w|0,0,w-1),y0=clamp(b.y*h|0,0,h-1),x1=clamp((b.x+b.w)*w|0,x0+1,w),y1=clamp((b.y+b.h)*h|0,y0+1,h),s=0,n=0;
 for(var y=y0;y<y1;y++)for(var x=x0;x<x1;x++){s+=st.gray[y*w+x];n++}return n?s/n:st.lum;
}

/* ---------------- MediaPipe (loaded on demand, cached by service worker) ---------------- */
var MP={state:'idle',p:null,face:null,pose:null};
var MP_V='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
function loadMP(){
 if(MP.p)return MP.p;MP.state='loading';
 MP.p=(async function(){
  var vis=await import(MP_V+'/vision_bundle.mjs');
  var fs=await vis.FilesetResolver.forVisionTasks(MP_V+'/wasm');
  MP.face=await vis.FaceDetector.createFromOptions(fs,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite',delegate:'CPU'},runningMode:'IMAGE',minDetectionConfidence:.5});
  try{MP.pose=await vis.PoseLandmarker.createFromOptions(fs,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'IMAGE',numPoses:2})}catch(e){console.warn('pose off',e)}
  MP.state='ready';return MP;
 })().catch(function(e){console.warn('MediaPipe off',e);MP.state='fail';MP.p=null;throw e});
 return MP.p;
}
/* returns {faces:[{x,y,w,h,eyes:{x,y},nose,ears}], people:[{pts,box}]} in normalized coords */
function detectPeople(c,withPose){
 var out={faces:[],people:[],ok:MP.state==='ready'};if(!out.ok)return out;
 try{
  var r=MP.face.detect(c),W=c.width,H=c.height;
  (r.detections||[]).forEach(function(d){var bb=d.boundingBox,k=d.keypoints||[],sc=d.categories&&d.categories[0]?d.categories[0].score:1;
   var f={x:bb.originX/W,y:bb.originY/H,w:bb.width/W,h:bb.height/H,score:sc};
   if(k.length>=6){f.eyes={x:(k[0].x+k[1].x)/2,y:(k[0].y+k[1].y)/2};f.nose={x:k[2].x,y:k[2].y};f.ears=[{x:k[4].x,y:k[4].y},{x:k[5].x,y:k[5].y}]}
   else f.eyes={x:f.x+f.w/2,y:f.y+f.h*.4};
   if(sc>.5&&f.w>.03)out.faces.push(f)});
 }catch(e){}
 if(withPose&&MP.pose){try{
  var pr=MP.pose.detect(c);(pr.landmarks||[]).forEach(function(L){
   var x0=1,y0=1,x1=0,y1=0;L.forEach(function(p){if(p.x>-.05&&p.x<1.05&&p.y>-.05&&p.y<1.05){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y)}});
   out.people.push({pts:L,box:{x0:clamp(x0,0,1),y0:clamp(y0,0,1),x1:clamp(x1,0,1),y1:clamp(y1,0,1)}})});
  if(pr.close)pr.close();
 }catch(e){}}
 return out;
}

/* ---------------- analysis bundle ---------------- */
/* A = {st, faces, people, mp, tilt (deg, +=needs clockwise fix), tiltSrc, pitch, shake, hour, live} */
function buildA(st,pp,sens,hour,live){
 var tilt=null,src='';
 if(sens&&sens.roll!=null&&Math.abs(sens.roll)<30){tilt=sens.roll;src='sensor'}
 else if(st.tilt.conf>.22&&Math.abs(st.tilt.deg)<12){tilt=Math.abs(st.tilt.deg)<.8?0:st.tilt.deg;src='image'}
 pp.faces.forEach(function(f){f.lum=regionLum(st,{x:f.x+f.w*.2,y:f.y+f.h*.25,w:f.w*.6,h:f.h*.55})});
 pp.faces.sort(function(a,b){return b.w-a.w});
 /* keep faces of similar size to the biggest (ignore tiny background people) */
 var big=pp.faces.length?pp.faces[0].w:0;pp.faces=pp.faces.filter(function(f){return f.w>big*.45});
 return {st:st,faces:pp.faces,people:pp.people,mp:pp.ok,tilt:tilt,tiltSrc:src,pitch:sens?sens.pitch:null,shake:sens?sens.shake:0,hour:hour,live:!!live};
}
function guessScene(A){
 if(A.faces.length>=2)return 'duo';
 if(A.faces.length===1&&A.faces[0].w>.05)return 'solo';
 if(A.people.length===1)return 'solo';
 if(A.pitch!=null&&A.pitch<-35)return 'food';
 if(A.st.vert>.42&&A.st.vert>A.st.horiz*1.2)return 'city';
 return 'land';
}

/* ---------------- scoring rules ---------------- */
function amt(d){return Math.abs(d)<.09?'นิดนึง':'อีกหน่อย'}
function moveMsg(dx,dy){ /* dx,dy = how far subject must move inside the frame */
 if(Math.abs(dx)>=Math.abs(dy))return (dx<0?'ขยับกล้องไปทางขวา':'ขยับกล้องไปทางซ้าย')+amt(dx);
 return (dy<0?'ก้มกล้องลง':'เงยกล้องขึ้น')+amt(dy);
}
function lm(person,i){var p=person&&person.pts[i];if(!p)return null;var v=p.visibility;if(v!=null&&v>0&&v<.35)return null;return p}

function compTilt(A,c){
 if(A.tilt==null)return;var a=Math.abs(A.tilt);
 c.push({k:'tilt',w:2,s:1-lin(a,1.5,7),msg:'กล้องเอียง หมุนมือถือให้ตรง',teach:'ภาพเอียงไปประมาณ '+a.toFixed(0)+'° ครั้งหน้ารอให้เส้นระดับบนจอเป็นสีเขียวก่อนกด',good:'ถือกล้องตรง เส้นในภาพไม่เอียง',fix:true});
}
function compLight(A,c,scene){
 var L=A.st.lum,s=1,msg='',teach='';
 if(L<45){s=.15;msg='มืดเกินไป หาที่สว่างขึ้น หรือเปิดไฟ';teach='ภาพมืดมาก ลองถ่ายใกล้หน้าต่างหรือที่มีไฟ ภาพจะใสและชัดกว่า'}
 else if(L<75){s=.6;msg='แสงน้อยไปหน่อย ขยับเข้าหาแสง';teach='แสงน้อยไปหน่อย ถ่ายใกล้แสงจะได้สีสวยกว่าแต่งทีหลัง'}
 else if(A.st.hiClip>.18||L>205){s=.5;msg='สว่างจ้าเกินไป เลี่ยงแดดตรงๆ';teach='บางส่วนสว่างจ้าจนขาว ลองหลบแดดแรง หรือถ่ายในร่ม'}
 if(scene==='food'&&L>=75&&L<110){s=Math.min(s,.75);msg='อาหารจะน่ากินขึ้นถ้าสว่างกว่านี้';teach='อาหารน่ากินเมื่อสว่าง ลองย้ายไปใกล้หน้าต่าง'}
 c.push({k:'light',w:scene==='food'?2.5:1.5,s:s,msg:msg,teach:teach,good:'แสงพอดี ภาพไม่มืดไม่จ้า',fix:true});
}
function compShake(A,c){
 if(A.live){c.push({k:'shake',w:1.2,s:1-lin(A.shake||0,20,70),msg:'ถือมือถือนิ่งๆ ภาพจะชัด',teach:'',good:'',fix:false});return}
 if(A.st.sharp<18)c.push({k:'sharp',w:1.5,s:.35,msg:'ภาพไม่ค่อยชัด',teach:'ภาพไม่ค่อยชัด ครั้งหน้าถือนิ่งๆ แตะจอที่ตัวแบบให้โฟกัสก่อนกด',good:'',fix:false});
 else c.push({k:'sharp',w:.8,s:1,msg:'',teach:'',good:'ภาพคมชัด ถือกล้องนิ่งดี',fix:false});
}
function compBacklight(A,c){
 if(!A.faces.length)return;var f=A.faces[0],bl=A.st.lum-f.lum;
 var s=1-lin(bl,25,70);
 c.push({k:'back',w:2,s:s,msg:'ย้อนแสง หน้ามืด ลองหันให้แสงส่องหน้า',teach:'ถ่ายย้อนแสงจนหน้ามืด ลองให้คนหันหน้าเข้าหาแสง หรือเปลี่ยนมุมให้แสงอยู่ด้านข้าง',good:'แสงส่องหน้าดี หน้าสว่างชัด',fix:true});
}
/* subject placement towards a target point */
function compPlace(c,k,sub,tgt,w,good,teachBad){
 var dx=tgt.x-sub.x,dy=tgt.y-sub.y,d=Math.sqrt(dx*dx+dy*dy*1.4);
 c.push({k:k,w:w,s:1-lin(d,.045,.26),msg:moveMsg(dx,dy),teach:teachBad,good:good,fix:true,sub:sub,tgt:tgt,dx:dx,dy:dy});
}
function pickX(sx,mem,key,closeUp,face){
 var cands=closeUp?[1/3,.5,2/3]:[1/3,2/3];
 /* lead room: facing right (nose right of ear middle) -> keep subject on left third */
 if(face&&face.nose&&face.ears){var em=(face.ears[0].x+face.ears[1].x)/2,off=(face.nose.x-em)/Math.max(.01,face.w);
  if(off>.22)cands=[1/3];else if(off<-.22)cands=[2/3]}
 var best=cands[0];cands.forEach(function(x){if(Math.abs(x-sx)<Math.abs(best-sx))best=x});
 if(mem){var prev=mem[key];if(prev!=null&&cands.indexOf(prev)>=0&&Math.abs(prev-sx)<Math.abs(best-sx)+.08)best=prev;mem[key]=best}
 return best;
}
function compCuts(A,c,per){
 var top=1,face=A.faces[0];
 if(face){var headTop=face.y-face.h*.35;
  if(headTop<-.02)c.push({k:'head',w:3,s:.05,msg:'หัวถูกตัด ถอยหลังหรือเงยกล้องขึ้นนิดนึง',teach:'หัวโดนตัดขอบบน ให้เหลือที่ว่างเหนือหัวเล็กน้อย',good:'',fix:false,cap:55});
  else if(headTop<.025&&face.w<.3)c.push({k:'headroom',w:1.5,s:.4,msg:'หัวชิดขอบบน เงยกล้องขึ้นนิดนึง',teach:'หัวชิดขอบบนเกินไป เว้นที่ว่างเหนือหัวเล็กน้อยจะดูสบายตา',good:'',fix:true});
 }
 if(!per)return;
 var J=[[27,28,'ข้อเท้า','ถอยให้เห็นเท้า หรือซูมให้ตัดที่ต้นขา'],[25,26,'เข่า','ให้เห็นถึงเท้า หรือตัดที่ต้นขาแทน'],[15,16,'ข้อมือ','ให้เห็นมือทั้งหมด']];
 for(var i=0;i<J.length;i++){
  var a=lm(per,J[i][0]),b=lm(per,J[i][1]),hit=false,ps=[a,b];
  for(var j=0;j<2;j++){var p=ps[j];if(!p)continue;
   if(i<2&&p.y>.94&&p.y<1.07)hit=true;
   if(i===2&&((p.x<.03&&p.x>-.06)||(p.x>.97&&p.x<1.06)||(p.y>.95&&p.y<1.06)))hit=true}
  if(hit){c.push({k:'cut',w:2,s:.3,msg:'อย่าตัดที่'+J[i][2]+' '+J[i][3],teach:'ขอบภาพตัดตรง'+J[i][2]+'พอดี ภาพจะดูขาดๆ ลองตัดที่กลางแขนขา หรือให้เห็นทั้งตัว',good:'',fix:false});return}
 }
 c.push({k:'cut',w:1,s:1,msg:'',teach:'',good:'ไม่ตัดขอบภาพตรงข้อต่อ ภาพดูเต็มตัว',fix:false});
}
function compEdge(A,c,box){
 if(!box)return;var bw=box.x1-box.x0;if(bw>.65)return;
 var s=1;if(box.x0<.03||box.x1>.97)s=.35;
 c.push({k:'edge',w:1.2,s:s,msg:'คนชิดขอบเกินไป '+(box.x0<.03?'ขยับกล้องไปทางซ้ายนิดนึง':'ขยับกล้องไปทางขวานิดนึง'),teach:'คนชิดขอบภาพเกินไป เว้นที่ว่างรอบตัวคนหน่อยจะดูสบายตา',good:'',fix:true});
}
function personBox(A){
 if(A.people.length){var b=A.people[0].box;return b}
 if(A.faces.length){var f=A.faces[0];return {x0:f.x-f.w*.6,y0:f.y-f.h*.4,x1:f.x+f.w*1.6,y1:Math.min(1,f.y+f.h*3)}}
 return null;
}
function evaluate(scene,A,mem){
 var c=[],ov={};
 compTilt(A,c);compLight(A,c,scene);compShake(A,c);
 if(scene==='solo'||scene==='duo'){
  var per=A.people[0]||null,faces=A.faces;
  if(!faces.length&&!per){
   if(A.mp)c.push({k:'none',w:3,s:.3,msg:'ยังไม่เห็นหน้าคน หันกล้องไปที่คน',teach:'แอปหาหน้าคนไม่เจอ ลองให้เห็นหน้าชัดๆ',good:'',fix:false,cap:60});
   else if(A.live)c.push({k:'wait',w:0,s:1,msg:MP.state==='fail'?'ตัวช่วยหาคนโหลดไม่ได้ (ต้องต่อเน็ตครั้งแรก)':'กำลังโหลดตัวช่วยหาคน…',teach:'',good:'',fix:false});
  }else if(scene==='solo'){
   var f=faces[0],eyes=f?f.eyes:null;
   if(!eyes&&per){var le=lm(per,2),re=lm(per,5);if(le&&re)eyes={x:(le.x+re.x)/2,y:(le.y+re.y)/2}}
   if(eyes){
    var full=per&&lm(per,27)&&lm(per,28)&&per.pts[27].y<.96&&per.pts[28].y<.96,close=f&&f.w>.28;
    var ty=full?.24:close?.4:1/3,tx=pickX(eyes.x,mem,'sx',close,f);
    compPlace(c,'place',eyes,{x:tx,y:ty},3,'วางตาไว้ใกล้เส้น 1/3 ภาพดูลงตัว ไม่แข็ง','ตาไม่ได้อยู่บนเส้น 1/3 ลองวางตาไว้ที่จุดตัดเส้นด้านบน (จุดวงกลมบนจอ)');
   }
   compCuts(A,c,per);compEdge(A,c,personBox(A));compBacklight(A,c);
  }else{
   if(faces.length<2&&A.mp&&!(A.people.length>=2)){c.push({k:'two',w:2.5,s:.35,msg:'ให้เห็นหน้าทุกคน ถอยหลังนิดนึง',teach:'มองไม่เห็นหน้าครบทุกคน',good:'',fix:false})}
   if(faces.length>=2){
    var gx=0,gy=0,minx=1,maxx=0,ys=[];faces.forEach(function(ff){gx+=ff.eyes.x;gy+=ff.eyes.y;minx=Math.min(minx,ff.x);maxx=Math.max(maxx,ff.x+ff.w);ys.push(ff.eyes.y)});
    gx/=faces.length;gy/=faces.length;
    var gtx=pickX(gx,mem,'gx',true,null);
    compPlace(c,'place',{x:gx,y:gy},{x:gtx,y:1/3},2.2,'วางกลุ่มคนได้สมดุล ตาอยู่แถวเส้น 1/3','กลุ่มคนยังไม่อยู่ในตำแหน่งดี ลองให้ตาทุกคนอยู่แถวเส้น 1/3 ด้านบน');
    var dy=Math.max.apply(null,ys)-Math.min.apply(null,ys);
    c.push({k:'level',w:1.2,s:1-lin(dy,.06,.18),msg:'ให้หัวทุกคนอยู่ระดับใกล้กัน',teach:'หัวแต่ละคนสูงต่ำต่างกันมาก ลองให้คนสูงย่อตัวหรือยืนเยื้องกัน',good:'หัวทุกคนอยู่ระดับใกล้กัน ดูเป็นกลุ่มเดียวกัน',fix:false});
    var fw=faces[0].w,spread=(maxx-minx)-fw*faces.length;
    c.push({k:'gap',w:1,s:1-lin(spread/fw,2.2,5),msg:'ให้ยืนชิดกันอีกนิด',teach:'ยืนห่างกันเกินไป ภาพดูไม่เป็นกลุ่ม ลองให้ชิดกันอีกนิด',good:'ยืนชิดกันพอดี ดูสนิทกัน',fix:false});
    var gb={x0:minx,x1:maxx};if(gb.x1-gb.x0<.75)compEdge(A,c,gb);
   }
   compCuts(A,c,per);compBacklight(A,c);
  }
 }else if(scene==='land'){
  var hz=A.st.horizon;
  if(hz.conf>.08&&hz.y>.15&&hz.y<.85){
   var hty=Math.abs(hz.y-1/3)<=Math.abs(hz.y-2/3)?1/3:2/3;if(mem){if(mem.hy&&Math.abs(mem.hy-hz.y)<Math.abs(hty-hz.y)+.08)hty=mem.hy;mem.hy=hty}
   var hd=hty-hz.y,mid=Math.abs(hz.y-.5)<.07;
   c.push({k:'horizon',w:2.5,s:1-lin(Math.abs(hd),.05,.17),msg:mid?'เส้นขอบฟ้าอยู่กลางภาพ '+(hd<0?'ก้มกล้องลงนิดนึง':'เงยกล้องขึ้นนิดนึง'):(hd<0?'ก้มกล้องลง':'เงยกล้องขึ้น')+amt(hd)+' ให้ขอบฟ้าอยู่บนเส้น 1/3',
    teach:'เส้นขอบฟ้าอยู่กลางภาพ ภาพจะดูแบ่งครึ่ง ลองวางไว้บนเส้น 1/3 บนหรือล่าง',good:'วางเส้นขอบฟ้าบนเส้น 1/3 ภาพดูมีมิติ',fix:true,horizon:hz.y,tgt:{x:.5,y:hty},sub:{x:.5,y:hz.y},dx:0,dy:hd});
   ov.horizon=hz.y;
  }
 }else if(scene==='food'){
  if(A.pitch!=null){var pt=A.pitch,s=1,msg='';
   if(pt>-20){s=.35;msg='ลองถ่ายจากด้านบน หรือเอียงกล้องลง 45°'}else if(pt>-30){s=.7;msg='ก้มกล้องลงอีกนิด ให้เห็นอาหารเต็มๆ'}
   c.push({k:'angle',w:2,s:s,msg:msg,teach:'มุมกล้องต่ำไป อาหารดูแบน ลองถ่ายจากด้านบนตรงๆ หรือเอียง 45°',good:'มุมกล้องดี เห็นอาหารชัด น่ากิน',fix:false});
   if(pt<-60){for(var i=0;i<c.length;i++)if(c[i].k==='tilt')c.splice(i,1)}
  }
 }else if(scene==='city'){
  if(A.pitch!=null&&A.live){var ap=Math.abs(A.pitch);
   c.push({k:'vert',w:2.5,s:1-lin(ap,6,20),msg:A.pitch>0?'อย่าเงยกล้อง ตึกจะเอียงสอบ ถือตั้งตรงแล้วถอยหลัง':'อย่าก้มกล้อง ถือตั้งตรง ตึกจะไม่เอียง',teach:'',good:'ถือกล้องตั้งตรง ตึกไม่เอียงสอบ',fix:false})}
  else if(A.st.vert>.3)c.push({k:'vert',w:1,s:1,msg:'',teach:'',good:'เส้นตึกตั้งตรงดี',fix:false});
 }
 /* score */
 var sw=0,ss=0,cap=100;c.forEach(function(x){sw+=x.w;ss+=x.w*x.s;if(x.cap&&x.s<.5)cap=Math.min(cap,x.cap)});
 var score=sw?Math.round(Math.min(cap,100*ss/sw)):70;
 var top=null;c.forEach(function(x){if(x.s<.8&&x.msg&&(!top||x.w*(1-x.s)>top.w*(1-top.s)))top=x});
 var wait=null;c.forEach(function(x){if(x.k==='wait')wait=x});
 var pl=null;c.forEach(function(x){if(x.tgt)pl=x});
 return {score:score,comps:c,top:top,msg:top?top.msg:(wait?wait.msg:'ดีมาก! กดถ่ายได้เลย 👍'),good:!top,place:pl,horizon:ov.horizon};
}

/* ---------------- tone choice ---------------- */
function chooseTone(scene,A){
 var st=A.st,L=st.lum,h=A.hour,night=L<55,golden=h>=16&&h<19&&st.warm>8&&L>=80,indoor=st.warm>25&&L<140,grey=st.sat<.17;
 var people=scene==='solo'||scene==='duo';
 if(people){
  if(golden)return {id:'sunset',why:'🌇 แดดเย็น + คน → อุ่น ผิวเปล่งแสง'};
  if(night||indoor)return {id:'muted',why:'💡 ไฟในร่ม → อุ่นหม่น ผิวดูนุ่ม'};
  return {id:'tokyo',why:'☀️ ถ่ายคนกลางวัน → สว่าง ผิวใส'};
 }
 if(scene==='food'){
  if(indoor||night)return {id:'muted',why:'🍜 อาหารใต้ไฟในร้าน → อุ่น ละมุน'};
  return {id:'tokyo',why:'🍰 อาหาร → สว่าง สะอาด น่ากิน'};
 }
 if(scene==='city'){
  if(night)return {id:'neg',why:'🌃 เมืองตอนค่ำ → ฟิล์มเข้ม ไฟสวย'};
  if(golden)return {id:'sunset',why:'🌇 แดดเย็นในเมือง → อุ่นฟุ้ง'};
  return {id:'chrome',why:'🏙️ ตึก/เมือง → เย็น นิ่ง แบบฟิล์มสไลด์'};
 }
 if(golden)return {id:'sunset',why:'🌅 แดดเย็น → อุ่น ฟุ้ง'};
 if(night)return {id:'neg',why:'🌙 แสงน้อย → ฟิล์มเข้ม'};
 if(grey)return {id:'chrome',why:'☁️ ฟ้าครึ้ม → เย็น นิ่ง ละมุน'};
 return {id:'neg',why:'🌿 วิว → สีฟิล์มเข้ม ฟ้า-ต้นไม้สด'};
}

/* ---------------- auto edit ---------------- */
function rotFit(W,H,deg){var t=Math.abs(deg)*Math.PI/180,c=Math.cos(t),s=Math.sin(t);return Math.min(W/(W*c+H*s),H/(W*s+H*c))}
/* point (normalized in source) -> normalized in straightened frame */
function rotPt(p,W,H,deg,k){
 var t=deg*Math.PI/180,x=(p.x-.5)*W,y=(p.y-.5)*H,X=x*Math.cos(t)-y*Math.sin(t),Y=x*Math.sin(t)+y*Math.cos(t);
 return {x:X/(W*k)+.5,y:Y/(H*k)+.5};
}
function mapPt(p,plan){var q=plan.rot?rotPt(p,plan.W,plan.H,plan.rot,plan.k):{x:p.x,y:p.y};var c=plan.crop;return {x:(q.x-c.x)/c.w,y:(q.y-c.y)/c.h}}
function planEdit(scene,A,W,H,opt){
 var plan={W:W,H:H,rot:0,k:1,crop:{x:0,y:0,w:1,h:1},curve:null};
 if(opt.straight&&A.tilt!=null&&Math.abs(A.tilt)>=.8&&Math.abs(A.tilt)<=12){plan.rot=A.tilt;plan.k=rotFit(W,H,A.tilt)}
 if(opt.crop){
  var ev=evaluate(scene,A,{}),pl=ev.place;
  if(pl&&pl.s<.95){
   var sub=plan.rot?rotPt(pl.sub,W,H,plan.rot,plan.k):pl.sub,tgt=pl.tgt;
   /* protected region (heads) must stay inside */
   var prot=[];A.faces.forEach(function(f){prot.push(rp({x:f.x-f.w*.15,y:f.y-f.h*.45}));prot.push(rp({x:f.x+f.w*1.15,y:f.y+f.h*1.1}))});
   var joints=[];if(A.people[0])[25,26,27,28].forEach(function(i){var p=lm(A.people[0],i);if(p&&p.y<.97)joints.push(rp(p).y)});
   var horizonOnly=pl.k==='horizon',best=null,d0=Math.hypot(sub.x-tgt.x,sub.y-tgt.y);
   for(var s=1;s>=.749;s-=.025){
    var cx=clamp(sub.x-tgt.x*s,0,1-s),cy=clamp(sub.y-tgt.y*s,0,1-s);if(horizonOnly)cx=(1-s)/2;
    var nx=(sub.x-cx)/s,ny=(sub.y-cy)/s,d=horizonOnly?Math.abs(ny-tgt.y):Math.hypot(nx-tgt.x,ny-tgt.y),cost=d+(1-s)*.45;
    prot.forEach(function(p){if(p.x<cx+.01||p.x>cx+s-.01||p.y<cy+.005||p.y>cy+s-.005)cost+=5});
    joints.forEach(function(jy){if(Math.abs(cy+s-jy)<.035)cost+=.4});
    if(!best||cost<best.cost)best={cost:cost,x:cx,y:cy,s:s,d:d};
   }
   if(best&&best.s<1&&best.cost<5&&d0-best.d>.03)plan.crop={x:best.x,y:best.y,w:best.s,h:best.s};
  }
 }
 function rp(p){return plan.rot?rotPt(p,W,H,plan.rot,plan.k):p}
 return plan;
}
function levelsCurve(st,A,scene){
 var lo=st.p1>4?Math.min(st.p1,40)*.75:0,hi=st.p99<248?Math.max(st.p99,170)+(255-Math.max(st.p99,170))*.25:255;
 var mean=clamp((st.p50-lo)/(hi-lo),.02,.98),night=st.lum<55;
 var want=night?.36:scene==='food'?.52:(scene==='solo'||scene==='duo')?.5:.46;
 var g=Math.log(want)/Math.log(mean);
 if(A.faces.length&&A.faces[0].lum<st.lum-20){var fl=clamp((A.faces[0].lum-lo)/(hi-lo),.03,.97);g=Math.min(g,Math.log(.48)/Math.log(fl))}
 g=clamp(g,.55,1.4);
 var C=new Array(256);for(var v=0;v<256;v++){var x=clamp((v-lo)/(hi-lo),0,1),y=Math.pow(x,g);C[v]=Math.round(clamp(v+(y*255-v)*.85,0,255))}
 for(v=1;v<256;v++)if(C[v]<C[v-1])C[v]=C[v-1];
 return C;
}
/* render: returns canvas */
function renderEdit(img,plan,tone,max,opt){
 var W=plan.W,H=plan.H,k=plan.k,cr=plan.crop,ow=W*k*cr.w,oh=H*k*cr.h,sc=Math.min(1,(max||2400)/Math.max(ow,oh));
 var out=mk(ow*sc,oh*sc),x=out.getContext('2d');x.imageSmoothingQuality='high';
 x.save();x.scale(out.width/(W*k*cr.w),out.height/(H*k*cr.h));x.translate(-cr.x*W*k,-cr.y*H*k);
 x.translate(W*k/2,H*k/2);if(plan.rot)x.rotate(plan.rot*Math.PI/180);x.drawImage(img,-W/2,-H/2,W,H);x.restore();
 var curve=null;
 if(opt&&opt.light){if(!plan.curve){var st=statsOf(out);plan.curve=levelsCurve(st,opt.A,opt.scene)}curve=plan.curve}
 if(tone.id!=='original'||curve)applyTone(out,tone,{curve:curve,I:opt&&opt.I!=null?opt.I:1});
 return out;
}
/* analysis of the edited result (for the after-score) */
function transformA(A,plan,st2){
 var mp=function(p){return mapPt(p,plan)};
 var faces=A.faces.map(function(f){var a=mp({x:f.x,y:f.y}),b=mp({x:f.x+f.w,y:f.y+f.h});var g={x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y,score:f.score,lum:f.lum,eyes:mp(f.eyes)};if(f.nose){g.nose=mp(f.nose);g.ears=f.ears.map(mp)}return g});
 var people=A.people.map(function(pp){var pts=pp.pts.map(function(p){var q=mp(p);return {x:q.x,y:q.y,visibility:p.visibility}}),a=mp({x:pp.box.x0,y:pp.box.y0}),b=mp({x:pp.box.x1,y:pp.box.y1});return {pts:pts,box:{x0:clamp(a.x,0,1),y0:clamp(a.y,0,1),x1:clamp(b.x,0,1),y1:clamp(b.y,0,1)}}});
 var st=st2;if(A.st.horizon.conf>.08){var hz=mp({x:.5,y:A.st.horizon.y});st.horizon={y:hz.y,conf:A.st.horizon.conf}}
 faces.forEach(function(f){f.lum=regionLum(st,{x:f.x+f.w*.2,y:f.y+f.h*.25,w:f.w*.6,h:f.h*.55})});
 return {st:st,faces:faces,people:people,mp:A.mp,tilt:plan.rot?0:A.tilt,tiltSrc:A.tiltSrc,pitch:A.pitch,shake:0,hour:A.hour,live:false};
}
/* teaching summary: 1 good + 1 to improve */
function summarize(ev,evAfter){
 var c=ev.comps.filter(function(x){return x.k!=='wait'&&x.k!=='shake'}),good=null,bad=null;
 c.forEach(function(x){if(x.good&&x.s>=.85&&(!good||x.w>good.w))good=x;if(x.s<.8&&x.teach&&(!bad||x.w*(1-x.s)>bad.w*(1-bad.s)))bad=x});
 var g=good?good.good:'กล้าลองถ่ายแล้ว ถ่ายบ่อยๆ จะเก่งขึ้นเร็วมาก';
 var b=bad?bad.teach:'ภาพนี้ดีแล้ว ครั้งหน้าลองมุมต่ำหรือมุมสูง ให้ภาพแปลกตาขึ้น';
 if(bad&&bad.fix&&evAfter&&evAfter.score>ev.score)b+=' (รูปนี้แอปช่วยแก้ให้แล้ว)';
 return {good:g,bad:b};
}
