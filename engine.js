'use strict';
/* ถ่ายเป็น — tone engine (ported from FilmCam: buildLUT / HSL per-colour / WebGL live preview) */

/* ---------- tones: 5 presets from FilmCam + Original ---------- */
var TONES=[
 {id:'original',name:'Original',th:'สีจริง',c:['#9aa3ad','#ffffff']},
 {id:'tokyo',name:'Tokyo Bright',th:'สว่าง ใส ผิวสวย',c:['#e8833a','#f4ede0'],exp:.15,con:.85,sat:.92,temp:.18,tint:-.02,fade:.08,sh:[-.01,.025,.035],hi:[.03,.02,-.01],halo:.12,vig:.08,hsl:[[0,.12,0],[-2,.28,.03],[-6,-.12,.03],[28,-.45,0],[6,-.25,0],[-6,-.35,.05]]},
 {id:'sunset',name:'Sunset Glow',th:'อุ่น ฟุ้ง แดดเย็น',c:['#f0a868','#fbe3d2'],exp:.12,con:.82,sat:.9,temp:.3,tint:-.08,fade:.06,sh:[.03,.01,.01],hi:[.03,.02,0],halo:.35,bloom:.3,vig:.12,hsl:[[0,.05,0],[3,.05,.03],[-4,-.1,.02],[12,-.35,0],[0,-.3,0],[-4,-.3,.05]]},
 {id:'chrome',name:'Wander Chrome',th:'เย็น นิ่ง โทนเมือง',c:['#6f8a8f','#e6e2d6'],exp:-.02,gam:1.05,con:1.05,sat:.78,temp:-.16,fade:.05,sh:[-.03,.02,.04],hi:[.03,.015,-.02],vig:.15,hsl:[[0,.06,-.03],[0,0,0],[-6,-.25,0],[22,-.45,-.05],[0,-.3,0],[-6,-.35,.03]]},
 {id:'neg',name:'Wander Neg',th:'ฟิล์มสีเข้ม คมชัด',c:['#b5482e','#d9cfc0'],gam:1.08,con:1.15,sat:.95,temp:.1,tint:-.05,fade:.07,sh:[-.02,.03,.04],hi:[.05,.02,-.04],halo:.1,vig:.15,hsl:[[3,.12,-.03],[0,.18,0],[-8,-.2,0],[30,-.5,-.04],[0,-.3,-.03],[-8,-.4,0]]},
 {id:'muted',name:'Warm Muted',th:'อุ่น หม่น ละมุน',c:['#8a6a4f','#e8dccb'],exp:-.05,gam:1.15,dim:.08,con:.92,sat:.65,temp:.28,tint:-.03,fade:.05,sh:[.03,.015,-.01],hi:[.03,.015,-.03],halo:.15,vig:.2,hsl:[[0,0,0],[0,-.05,0],[-4,-.2,0],[15,-.5,-.05],[0,-.4,-.03],[0,-.5,-.05]]}
];
function toneById(id){for(var i=0;i<TONES.length;i++)if(TONES[i].id===id)return TONES[i];return TONES[0]}

function mk(w,h){var c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c}
function downscale(src,max){
 var w=src.width,h=src.height,s=Math.min(1,max/Math.max(w,h)),cur=src,cw=w,ch=h;
 var tw=w*s;while(tw<cw/2-1&&cw>2){var t=mk(cw/2,ch/2),tx=t.getContext('2d');tx.imageSmoothingQuality='high';tx.drawImage(cur,0,0,t.width,t.height);cur=t;cw=t.width;ch=t.height}
 var c=mk(w*s,h*s),x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(cur,0,0,c.width,c.height);return c}

/* LUT: optional per-channel pre-curve f.match (used for auto-levels), then film curve */
function buildLUT(f,ev){
 var L=[new Uint8ClampedArray(256),new Uint8ClampedArray(256),new Uint8ClampedArray(256)];
 var exp=Math.pow(2,(f.exp||0)+(ev||0)),con=f.con||1,fade=f.fade||0,t=f.temp||0,tn=f.tint||0;
 var sh=f.sh||[0,0,0],hi=f.hi||[0,0,0],mul=[1+t*.12,1+tn*.08,1-t*.12],M=f.match;
 for(var c=0;c<3;c++)for(var v=0;v<256;v++){
  var y=Math.min(1,(M?M[c][v]:v)/255*exp);
  if(f.gam)y=Math.pow(y,f.gam);
  y=y<.5?.5*Math.pow(2*y,con):1-.5*Math.pow(2*(1-y),con);
  if(f.dim)y=y*(1-f.dim*y);
  y=y*mul[c];
  y+=sh[c]*(1-y)*(1-y)*1.5+hi[c]*y*y*1.5;
  y=fade+y*(1-fade*1.5);
  L[c][v]=Math.round(Math.max(0,Math.min(1,y))*255);
 }
 return L;
}
/* per-colour tweaks: bands red, orange, yellow, green, aqua, blue — [hueShift, satDelta, lightDelta] */
var HB_C=[0,30,58,120,180,222],HB_W=[28,30,30,55,40,45];
function hslFn(H){
 if(!H)return null;
 return function(rgb){
  var r=rgb[0],g=rgb[1],b=rgb[2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(d<2||mx<4)return;
  var s=d/mx,v=mx/255,h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360;
  var dh=0,ds=0,dv=0,any=0;
  for(var k=0;k<6;k++){var q=H[k];if(!q)continue;var dist=Math.abs(((h-HB_C[k])%360+540)%360-180);var w=1-dist/HB_W[k];if(w<=0)continue;w=w*w*(3-2*w);dh+=q[0]*w;ds+=q[1]*w;dv+=q[2]*w;any=1}
  if(!any)return;
  h=(h+dh+360)%360;s=Math.max(0,Math.min(1,s*(1+ds)));v=Math.max(0,Math.min(1,v+dv*s));
  var cc=v*s,x=cc*(1-Math.abs((h/60)%2-1)),m=v-cc,i=Math.floor(h/60)%6,R,G,B;
  if(i===0){R=cc;G=x;B=0}else if(i===1){R=x;G=cc;B=0}else if(i===2){R=0;G=cc;B=x}else if(i===3){R=0;G=x;B=cc}else if(i===4){R=x;G=0;B=cc}else{R=cc;G=0;B=x}
  rgb[0]=(R+m)*255;rgb[1]=(G+m)*255;rgb[2]=(B+m)*255;
 };
}
function colorize(img,f,P){
 var d=img.data,w=img.width,h=img.height,LL=buildLUT(f,P.ev),R=LL[0],G=LL[1],B=LL[2],sat=f.sat||1,I=P.I==null?1:P.I,vig=P.vig||0;
 var cx=w/2,cy=h/2,rn=Math.sqrt(cx*cx+cy*cy),HS=hslFn(f.hsl),T=[0,0,0],M=f.match;
 for(var j=0,p=0;j<h;j++){
  var dy=(j-cy)/rn,dy2=dy*dy;
  for(var i=0;i<w;i++,p+=4){
   var r0=d[p],g0=d[p+1],b0=d[p+2],r=R[r0],g=G[g0],b=B[b0];
   if(sat!==1){var l=.299*r+.587*g+.114*b;r=l+(r-l)*sat;g=l+(g-l)*sat;b=l+(b-l)*sat}
   if(HS){T[0]=r<0?0:r>255?255:r;T[1]=g<0?0:g>255?255:g;T[2]=b<0?0:b>255?255:b;HS(T);r=T[0];g=T[1];b=T[2]}
   if(I<1){var a0=M?M[0][r0]:r0,a1=M?M[1][g0]:g0,a2=M?M[2][b0]:b0;r=a0+(r-a0)*I;g=a1+(g-a1)*I;b=a2+(b-a2)*I}
   if(vig){var dx=(i-cx)/rn,dd=Math.sqrt(dx*dx+dy2);if(dd>.45){var s2=Math.min(1,(dd-.45)/.6);var k=1-vig*s2*s2*(3-2*s2);r*=k;g*=k;b*=k}}
   d[p]=r;d[p+1]=g;d[p+2]=b;
  }
 }
}
function glow(c,x,soft,halo){
 if(!soft&&!halo)return;var w=c.width,h=c.height,t=mk(w,h),tx=t.getContext('2d');
 if(!('filter' in tx))return;
 if(soft){tx.filter='blur('+Math.max(2,Math.round(w*.012))+'px)';tx.drawImage(c,0,0);x.globalAlpha=soft*.7;x.drawImage(t,0,0);x.globalAlpha=1}
 if(halo){
  var t2=mk(w,h),t2x=t2.getContext('2d');t2x.filter='blur('+Math.round(w*.02)+'px) brightness(.9) contrast(3)';t2x.drawImage(c,0,0);
  t2x.filter='none';t2x.globalCompositeOperation='multiply';t2x.fillStyle='#ff6a3a';t2x.fillRect(0,0,w,h);
  x.globalCompositeOperation='screen';x.globalAlpha=halo*.45;x.drawImage(t2,0,0);
 }
 x.globalAlpha=1;x.globalCompositeOperation='source-over';
}
/* apply tone (+optional levels curve) to a canvas in place */
function applyTone(c,tone,o){
 o=o||{};var f=tone;
 if(o.curve){f={};for(var k in tone)f[k]=tone[k];f.match=[o.curve,o.curve,o.curve]}
 var x=c.getContext('2d'),img=x.getImageData(0,0,c.width,c.height),I=o.I==null?1:o.I;
 colorize(img,f,{ev:o.ev||0,I:I,vig:(f.vig||0)*.8*I});
 x.putImageData(img,0,0);
 glow(c,x,(f.bloom||0)*I,(f.halo||0)*I);
 return c;
}

/* ---------- WebGL live preview ---------- */
var GL={ok:false};
function initGL(cv){
 try{
  var gl=cv.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:false});if(!gl)return false;
  var vs='attribute vec2 a;varying vec2 v;void main(){v=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}';
  var fs='precision mediump float;varying vec2 v;uniform sampler2D uVid,uLut;uniform vec2 uRes,uOff,uSize;'+
  'uniform float uSat,uVig,uHon;uniform vec3 uH0,uH1,uH2,uH3,uH4,uH5;'+
  'vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-10)),d/(q.x+1e-10),q.x);}'+
  'vec3 hsv2rgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(1.,2./3.,1./3.))*6.-3.);return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y);}'+
  'void band(float h,float cen,float w,vec3 q,inout vec3 acc){float d=abs(mod(h-cen+540.,360.)-180.);float t=clamp(1.-d/w,0.,1.);t=t*t*(3.-2.*t);acc+=q*t;}'+
  'void main(){vec2 px=(v-.5)*uRes;float R=length(uRes)*.5;'+
  'vec3 s=texture2D(uVid,uOff+v*uSize).rgb;'+
  'vec3 c=vec3(texture2D(uLut,vec2(s.r*.996+.002,.5)).r,texture2D(uLut,vec2(s.g*.996+.002,.5)).g,texture2D(uLut,vec2(s.b*.996+.002,.5)).b);'+
  'float l=dot(c,vec3(.299,.587,.114));c=vec3(l)+(c-vec3(l))*uSat;'+
  'if(uHon>.5){c=clamp(c,0.,1.);vec3 hv=rgb2hsv(c);if(hv.y>.008){float hd=hv.x*360.;vec3 a=vec3(0.);band(hd,0.,28.,uH0,a);band(hd,30.,30.,uH1,a);band(hd,58.,30.,uH2,a);band(hd,120.,55.,uH3,a);band(hd,180.,40.,uH4,a);band(hd,222.,45.,uH5,a);'+
  'hv.x=fract((hd+a.x)/360.+1.);hv.y=clamp(hv.y*(1.+a.y),0.,1.);hv.z=clamp(hv.z+a.z*hv.y,0.,1.);c=hsv2rgb(hv);}}'+
  'float dd=length(px)/R;if(dd>.45){float t=clamp((dd-.45)/.6,0.,1.);c*=1.-uVig*t*t*(3.-2.*t);}gl_FragColor=vec4(c,1.);}';
  var sh=function(t,src){var s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s};
  var p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('link');gl.useProgram(p);
  var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  var al=gl.getAttribLocation(p,'a');gl.enableVertexAttribArray(al);gl.vertexAttribPointer(al,2,gl.FLOAT,false,0,0);
  var tex=function(u){var t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+u);gl.bindTexture(gl.TEXTURE_2D,t);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);return t};
  GL.vt=tex(0);GL.lt=tex(1);
  var U={};['uVid','uLut','uRes','uOff','uSize','uSat','uVig','uHon','uH0','uH1','uH2','uH3','uH4','uH5'].forEach(function(n){U[n]=gl.getUniformLocation(p,n)});
  gl.uniform1i(U.uVid,0);gl.uniform1i(U.uLut,1);
  GL.gl=gl;GL.U=U;GL.cv=cv;GL.ok=true;return true;
 }catch(e){console.warn('WebGL off',e);GL.ok=false;return false}
}
function glSetTone(tone){
 if(!GL.ok)return;var gl=GL.gl,U=GL.U,L=buildLUT(tone,0),d=new Uint8Array(1024);
 for(var i=0;i<256;i++){d[i*4]=L[0][i];d[i*4+1]=L[1][i];d[i*4+2]=L[2][i];d[i*4+3]=255}
 gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,GL.lt);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,1,0,gl.RGBA,gl.UNSIGNED_BYTE,d);
 gl.uniform1f(U.uSat,tone.sat||1);gl.uniform1f(U.uVig,(tone.vig||0)*.8);
 var H=tone.hsl;gl.uniform1f(U.uHon,H?1:0);for(var k=0;k<6;k++){var q=(H&&H[k])||[0,0,0];gl.uniform3f(U['uH'+k],q[0],q[1],q[2])}
}
/* draw video crop region (cr in video px) into the GL canvas */
function glDraw(video,cr,W,H){
 var gl=GL.gl,U=GL.U,cv=GL.cv,vw=video.videoWidth,vh=video.videoHeight;
 if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H}
 gl.viewport(0,0,W,H);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,GL.vt);
 try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,video)}catch(e){return false}
 gl.uniform2f(U.uRes,W,H);gl.uniform2f(U.uOff,cr.x/vw,cr.y/vh);gl.uniform2f(U.uSize,cr.w/vw,cr.h/vh);
 gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return true;
}
