/* ============================================================
   FPS-GL — renderer dunia WebGL2 mode OPERATOR:
   medan berpetak LOD (peta tinggi di tekstur), detail material
   per piksel (rumput, batu, pasir, aspal, rawa basah, lahar
   menyala), air berpantul, langit + awan, bayangan matahari
   (shadow map PCF), kabut, gedung & properti kota (mesh statis),
   pohon ber-instans dengan angin, prajurit bertulang beranimasi,
   kendaraan/heli/jet/UFO, partikel & jejak peluru.
   Bila WebGL2 tak tersedia → renderer perangkat lunak (fps-render).
   ============================================================ */
(function () {
  'use strict';
  const TK = window.TK, W = TK.WAR, F = TK.FPS, P = F.P, Q = TK.war.Q, UT = W.UT, MD = F.MDL, X = MD.X;
  const { clamp } = TK.util;
  const G = F.GLW = { ok: false, tried: false, err: '' };
  let gl = null, cv = null, PR = {}, RES = null, WR = null, frame = 0;
  const S = MD.STRIDE * 4;

  /* ---------------- SHADER ---------------- */
  const HEAD = '#version 300 es\nprecision highp float;precision highp int;precision highp sampler2D;precision highp sampler2DShadow;precision highp sampler2DArray;\n';
  const COMMON = `
#ifdef DESK
uniform sampler2DArray uDA,uDN;
#endif
uniform vec3 uCam,uSun,uSunC,uSky,uGnd,uFogC,uS0,uS1,uS2,uSunV;uniform float uFogD,uTime,uNight,uNvg,uShOn,uShSize,uLo,uShQ;uniform mat4 uShM;uniform sampler2DShadow uShT;
uint ih(uint x){x^=x>>16;x*=0x7feb352dU;x^=x>>15;x*=0x846ca68bU;x^=x>>16;return x;}
float hash(vec2 p){uvec2 q=floatBitsToUint(p);return float(ih(q.x^ih(q.y+0x9e3779b9U))>>8)*(1./16777216.);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*noise(p);p=p*2.03+17.1;a*=.5;}return s;}
float shadowAt(vec3 P,vec3 N){if(uShOn<.5)return 1.;vec4 s=uShM*vec4(P+N*.12,1.);vec3 c=s.xyz/s.w*.5+.5;if(c.x<0.||c.x>1.||c.y<0.||c.y>1.||c.z>1.)return 1.;
 float e=smoothstep(0.,.06,min(min(c.x,1.-c.x),min(c.y,1.-c.y)));if(uShQ<.5)return mix(1.,texture(uShT,vec3(c.xy,c.z-.0006)),e);
 float t=1./uShSize,k=0.;for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++)k+=texture(uShT,vec3(c.xy+vec2(float(i),float(j))*t,c.z-.0006));k/=9.;return mix(1.,k,e);}
vec3 skyCol(vec3 d){float el=d.z;if(el<=0.)return uS2;float a=min(1.,atan(el)/1.1);return a<.22?mix(uS2,uS1,a/.22):mix(uS1,uS0,min(1.,(a-.22)/.78));}
vec3 light(vec3 alb,vec3 N,vec3 P,float spec,float gloss,float sh){vec3 V=normalize(uCam-P);float ndl=max(dot(N,uSun),0.);vec3 amb=mix(uGnd,uSky,N.z*.5+.5);
 vec3 H=normalize(uSun+V);float sp=pow(max(dot(N,H),0.),gloss)*spec*(gloss+8.)/50.;float fr=pow(1.-max(dot(N,V),0.),4.)*spec;
 return alb*(amb+uSunC*ndl*sh)+uSunC*sp*sh+skyCol(reflect(-V,N))*fr*.35;}
vec3 fogit(vec3 c,vec3 P){float d=length(P-uCam)/uFogD;return mix(c,uFogC,clamp(1.-exp(-d*d),0.,1.));}
vec3 post(vec3 c){if(uNvg>1.5){float l=dot(c,vec3(.3,.59,.11));l=l/(1.+l*.4)*1.08+.03;return vec3(l*.95,l,l*.93);}if(uNvg>.5){float l=dot(c,vec3(.3,.59,.11))*2.6+.03;c=vec3(l*.25,l,l*.32);}
#ifdef DESK
else{float l=dot(c,vec3(.3,.59,.11));c=mix(vec3(l),c,.86);c*=.94;c=c*(2.51*c+.03)/(c*(2.43*c+.59)+.14);c=mix(c,c*c*(3.-2.*c),.22);}
#endif
return c;}
`;
  /* medan: grid patch, tinggi diambil dari tekstur R32F */
  const TER_VS = HEAD + `layout(location=0) in vec3 aG;uniform mat4 uVP;uniform vec4 uPatch;uniform sampler2D uH;uniform vec2 uTex;uniform float uTX;out vec3 vP;out vec3 vN;out vec2 vT;
float hg(ivec2 t){if(t.x<0||t.y<0||t.x>=int(uTex.x)||t.y>=int(uTex.y))return -14.;return texelFetch(uH,t,0).r;}
void main(){vec2 tc=uPatch.xy+aG.xy*uPatch.z;ivec2 ti=ivec2(tc);float h=hg(ti);int s=int(max(1.,uPatch.z));
float hx=hg(ti+ivec2(s,0))-hg(ti-ivec2(s,0)),hy=hg(ti+ivec2(0,s))-hg(ti-ivec2(0,s));vN=normalize(vec3(-hx,-hy,2.*float(s)*uTX));
vec3 p=vec3((tc+.5)*uTX,h-aG.z*(3.+uPatch.z*1.5));vP=p;vT=(tc+.5)/uTex;gl_Position=uVP*vec4(p,1.);}`;
  const TER_FS = HEAD + COMMON + `in vec3 vP;in vec3 vN;in vec2 vT;uniform sampler2D uAlb,uMat;out vec4 o;
#ifdef DESK
uniform sampler2D uRd;
#define LAY(i,w,t) if((w)>.02){vec4 a=texture(uDA,vec3(uv,i));vec4 q=texture(uDN,vec3(uv,i));alb+=(w)*a.rgb*(t)*(tb?.74+.52*texture(uDA,vec3(uv2,i)).a:1.);nn+=(w)*(q.xy*2.-1.);cav+=(w)*q.b;sp+=(w)*q.a;}
void main(){vec4 al=texture(uAlb,vT),mt=texture(uMat,vT);vec3 N=normalize(vN);float dist=length(vP-uCam);vec2 p=vP.xy;float sl=1.-N.z;
float mac=texture(uDA,vec3(p/411.,7.)).a,m1=texture(uDA,vec3(p/97.,7.)).a,m2=texture(uDA,vec3(p/23.,7.)).a;bool tb=uLo<.5&&dist<240.;
float rk=clamp(mt.r+smoothstep(.3,.55,sl)*(1.-mt.b),0.,1.),gv=clamp((mt.r-.08)*6.,0.,1.)*clamp((mt.g-.15)*6.,0.,1.);rk*=1.-gv;
float sd=mt.g*(1.-rk)*(1.-gv),pa=mt.b*(1.-rk),gr=clamp(1.-rk-sd-pa-gv-mt.a,0.,1.),dt=gr*smoothstep(.47,.62,m1*.55+m2*.38+sl*1.5+.04);gr-=dt;
vec2 uv=p/4.7,uv2=mat2(.8,.6,-.6,.8)*p/11.3;vec3 alb=vec3(0.);vec2 nn=vec2(0.);float cav=0.,sp=0.,lu=dot(al.rgb,vec3(.33));vec3 tn=al.rgb*1.04;
LAY(0.,gr,tn*mix(vec3(1.06,.98,.84),vec3(.93,1.04,1.),m1))LAY(1.,dt,mix(vec3(1.),al.rgb/max(lu,.05),.22))LAY(2.,rk,mix(vec3(lu),al.rgb,.55)*1.25)LAY(3.,sd,tn)
if(mt.b>.93){LAY(4.,pa,vec3(1.))}else{LAY(5.,pa,tn*1.08)}LAY(6.,gv,mix(vec3(1.),al.rgb/max(lu,.05),.3))
float wsum=gr+dt+rk+sd+pa+gv;if(wsum>.03){alb/=wsum;nn/=wsum;cav/=wsum;sp/=wsum;}else{alb=al.rgb;cav=1.;sp=.04;}alb*=.84+.32*mac;
float k=clamp(1.-dist/170.,0.,1.),gloss=14.,wet=al.a,pud=wet*smoothstep(.48,.62,m1+m2*.15);
vec3 Nn=normalize(N+vec3(nn*k*1.15,0.));
vec4 rd=texture(uRd,vT);float d=abs(rd.r),hw=rd.a;
if(hw>.5&&d<hw+4.&&vP.z>-.22){float fw=max(fwidth(d),.02),rg=(m2-.5)*(hw<4.?.7:.12),rm=1.-smoothstep(hw-.06-fw,hw+.06+fw,d+rg);
 float cb=pa*(1.-smoothstep(hw+.28,hw+.34+fw,d))*smoothstep(hw-.02,hw+.02,d);if(cb>0.){alb=mix(alb,vec3(.56,.55,.52),cb);cav=mix(cav,.9,cb);}
 if(rm>0.){vec2 uvr=p/4.1;vec4 a=texture(uDA,vec3(uvr,4.)),q=texture(uDN,vec3(uvr,4.));vec3 ac=a.rgb*(.86+.28*m1);
  float tr=hw*.5,wr=exp(-pow((d-tr)/(hw*.17),2.));ac*=1.+.2*wr*(.6+.8*m2);ac=mix(ac,ac*.72,smoothstep(.6,.68,m2*.6+mac*.45));
  float mk=length(rd.gb);if(mk>.3&&k>0.){float an=atan(rd.g,rd.b),ds=step(abs(an),.95),f2=max(fwidth(rd.r),.01);
   float cl=(1.-smoothstep(.07,.07+f2,abs(rd.r)))*ds,el=(1.-smoothstep(.055,.055+f2,abs(d-(hw-.36))));float pw=(cl+el)*(.72+.45*(a.a-.5))*smoothstep(.45,.75,m2*.4+.5);ac=mix(ac,vec3(.74,.72,.64),clamp(pw,0.,1.));}
  alb=mix(alb,ac,rm);Nn=normalize(mix(Nn,normalize(N+vec3((q.xy*2.-1.)*k*.9,0.)),rm));cav=mix(cav,q.b,rm);sp=mix(sp,.09+.05*wr,rm);gloss=mix(gloss,28.,rm);}}
alb=mix(alb,alb*.55,wet*.6);if(pud>.02){sp=mix(sp,1.,pud);gloss=mix(gloss,140.,pud);Nn=normalize(mix(Nn,vec3(0,0,1),pud));alb=mix(alb,vec3(.04,.06,.05),pud);}
float sh=shadowAt(vP,N);vec3 col=light(alb,Nn,vP,sp,gloss,sh)*mix(1.,cav,.62*k);
if(mt.a>.01){float v=noise(p*.22+vec2(uTime*.05,-uTime*.04));vec3 hot=mix(vec3(1.,.25,.02),vec3(1.,.8,.3),v)*(2.4+sin(uTime*2.+v*10.)*.4);col=mix(col,mix(hot,vec3(.05,.04,.035),step(.58,m2)*.85),mt.a);}
o=vec4(post(fogit(col,vP)),1.);}
#else
void main(){vec4 al=texture(uAlb,vT),mt=texture(uMat,vT);vec3 N=normalize(vN);float dist=length(vP-uCam);vec2 p=vP.xy;
if(uLo>.5){float m1=noise(p*.07),m2=noise(p*.55),sl=1.-N.z,rk=clamp(mt.r+smoothstep(.3,.55,sl)*(1.-mt.b),0.,1.);   // jalur hemat: 2 noise per piksel
 vec3 c=al.rgb*(.88+.24*m2*(1.-mt.b)*(1.-mt.g*.7)+.1*(m1-.5));c=mix(c,mix(vec3(dot(al.rgb,vec3(.33))),al.rgb,.5)*(.74+.4*m1),rk);c=mix(c,c*.55,al.a*.6);
 vec3 col=light(c,N,vP,.04+mt.b*.06+rk*.05,14.,shadowAt(vP,N));
 if(mt.a>.01){float v=noise(p*.22+vec2(uTime*.05,-uTime*.04));vec3 hot=mix(vec3(1.,.25,.02),vec3(1.,.8,.3),v)*(2.4+sin(uTime*2.+v*10.)*.4);col=mix(col,mix(hot,vec3(.05,.04,.035),step(.58,m2)*.85),mt.a);}
 o=vec4(post(fogit(col,vP)),1.);return;}
float n1=fbm(p*.07),n2=noise(p*.55),n3=noise(p*2.3);vec3 c=al.rgb;
float sd=mt.g;c*=.86+.28*n2*(1.-mt.b)*(1.-sd*.7)+.12*(n1-.5)*(1.-sd*.5);c*=mix(1.,.88+.24*n3*(1.-sd*.6),clamp(1.-dist/140.,0.,1.));
float grass=clamp(1.-mt.r-mt.g-mt.b*1.5-mt.a,0.,1.);if(dist<60.){float bl=noise(vec2(p.x*9.,p.y*9.)+noise(p*3.)*2.);c*=1.+grass*(bl-.5)*.35*(1.-dist/60.);}
float slope=1.-N.z,rock=clamp(mt.r+smoothstep(.3,.55,slope)*(1.-mt.b),0.,1.);
vec3 rc=mix(vec3(dot(al.rgb,vec3(.33))),al.rgb,.5)*(.72+.45*fbm(p*.35+vec2(vP.z*.25)));c=mix(c,rc,rock);
c*=1.+mt.g*.08*sin(dot(p,vec2(.8,.35))*2.6+n1*9.);
if(mt.b>.05)c*=mix(1.,.9+.16*n3,mt.b);
float spec=.04+mt.b*.06+rock*.05,gloss=14.,wet=al.a,pud=wet*smoothstep(.48,.62,noise(p*.09)+n2*.15);vec3 Nn=N;
if(dist<90.&&pud<.5){float e=.2,b0=noise(p*1.6);vec2 gr=vec2(noise((p+vec2(e,0.))*1.6)-b0,noise((p+vec2(0.,e))*1.6)-b0)/e;Nn=normalize(N-vec3(gr*(.16+rock*.3)*(1.-sd*.6),0.)*(1.-dist/90.));}
c=mix(c,c*.55,wet*.6);if(pud>.02){spec=mix(spec,1.,pud);gloss=mix(gloss,140.,pud);Nn=normalize(mix(Nn,vec3(0,0,1),pud));c=mix(c,vec3(.04,.06,.05),pud);}
float sh=shadowAt(vP,N);vec3 col=light(c,Nn,vP,spec,gloss,sh);
if(mt.a>.01){float t=uTime,v=fbm(p*.22+vec2(t*.05,-t*.04)),cr=smoothstep(.36,.5,abs(fbm(p*.55-t*.02)-.5)*2.);
 vec3 hot=mix(vec3(1.,.25,.02),vec3(1.,.8,.3),v)*(2.4+sin(t*2.+v*10.)*.4);vec3 lc=mix(hot,light(vec3(.07,.05,.045),Nn,vP,.1,8.,sh),cr*.85);col=mix(col,lc,mt.a);}
col=fogit(col,vP);o=vec4(post(col),1.);}
#endif
`;
  const TERS_FS = HEAD + 'out vec4 o;void main(){o=vec4(1.);}';
  /* air */
  const WAT_VS = HEAD + 'layout(location=0) in vec2 aP;uniform mat4 uVP;uniform float uWZ;out vec3 vP;void main(){vP=vec3(aP,uWZ);gl_Position=uVP*vec4(vP,1.);}';
  const WAT_FS = HEAD + COMMON + `in vec3 vP;uniform sampler2D uH;uniform vec2 uTex;uniform float uTX;out vec4 o;
float hg(ivec2 t){if(t.x<0||t.y<0||t.x>=int(uTex.x)||t.y>=int(uTex.y))return -14.;return texelFetch(uH,t,0).r;}
void main(){vec2 t=vP.xy/uTX-.5;ivec2 i=ivec2(floor(t));vec2 f=fract(t);float gz=mix(mix(hg(i),hg(i+ivec2(1,0)),f.x),mix(hg(i+ivec2(0,1)),hg(i+ivec2(1,1)),f.x),f.y);
float dep=vP.z-gz;if(dep<0.)discard;vec2 p=vP.xy;float tt=uTime;
vec3 N=normalize(vec3((noise(p*.31+vec2(tt*.35,0.))-.5)*.3+(noise(p*1.3-vec2(0.,tt*.6))-.5)*.14,(noise(p*.29+vec2(3.,tt*.28))-.5)*.3+(noise(p*1.2+vec2(tt*.5,7.))-.5)*.14,1.));
vec3 V=normalize(uCam-vP);float fr=.03+.97*pow(1.-max(dot(N,V),0.),5.);vec3 sky=skyCol(reflect(-V,N));
float sh=shadowAt(vP,vec3(0,0,1));vec3 body=mix(vec3(.09,.28,.27),vec3(.02,.1,.15),clamp(dep/6.,0.,1.))*(uSky*1.3+uSunC*.35*sh);
vec3 H=normalize(uSun+V);vec3 col=mix(body,sky,fr)+uSunC*pow(max(dot(N,H),0.),280.)*2.5*sh;
float foam=smoothstep(.7,0.,dep)*(.4+.6*noise(p*2.2+tt*.7));col=mix(col,(uSky+uSunC*.6*sh)*.9,foam*.55);
float a=clamp(.5+dep*.3+fr*.4,0.,.96);col=fogit(col,vP);o=vec4(post(col)*a,a);}`;
  /* langit */
  const SKY_VS = HEAD + 'layout(location=0) in vec2 aQ;out vec2 vQ;void main(){vQ=aQ;gl_Position=vec4(aQ,.9999,1.);}';
  const SKY_FS = HEAD + COMMON + `in vec2 vQ;uniform mat4 uIVP;uniform float uSunR;out vec4 o;
/* langit dinamis: hamburan atmosfer (cakrawala berkabut terang, pendar Mie di sekitar matahari/bulan), awan kumulus bervolume yang
   diterangi dari arah matahari (sisi gelap, tepi keperakan), lapisan sirus tinggi, keduanya bergerak tertiup angin; malam: bulan & bintang berkelip */
float fb5(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p+3.1;a*=.5;}return s;}
#ifdef DESK
float cden(vec2 q,float cov){float b=texture(uDA,vec3(q/8.,7.)).a*.97;return clamp((b-cov)*2.8,0.,1.);}
#else
float cden(vec2 q,float cov){float b=uLo>.5?fbm(q*1.1):fb5(q);return clamp((b-cov)*2.8,0.,1.);}
#endif
void main(){vec4 a=uIVP*vec4(vQ,1.,1.);vec3 d=normalize(a.xyz/a.w-uCam);vec3 c=skyCol(d);
float el=d.z,mu=dot(d,uSunV),sd=max(mu,0.),hz=exp(-max(el,0.)*6.),nt=step(.5,uNight);
c=mix(c,uS2*1.04,hz*.4);
c+=uSunC*(pow(sd,7.)*.16+pow(sd,48.)*.42)*(.45+.55*hz)*mix(1.,.12,nt);
c*=1.-.1*max(-mu,0.)*(1.-hz)*(1.-nt);
c+=uSunC*(smoothstep(.99955,.9998,mu)*mix(9.,1.6,nt)+pow(sd,1400.)*mix(2.5,.6,nt));
if(el>0.){float t=(2300.-uCam.z)/max(el,.015);vec2 w=uCam.xy+d.xy*t,q=w/2400.+vec2(uTime*.009,uTime*.003),cov=vec2(uNight>.5?.56:.5);
 float de=cden(q,cov.x),dl=cden(q+uSunV.xy*.035,cov.x),fade=smoothstep(.0,.16,el);
 float lit=exp(-dl*1.7)*(.62+.38*(1.-de));
 vec3 shd=uSky*1.25+uGnd*.3+uSunC*.1,brt=uSunC*1.02+uSky*.5;vec3 cc=mix(shd,brt,lit)*mix(1.,.16,nt);
 cc+=uSunC*pow(sd,5.)*de*(1.-de)*1.6*mix(1.,.2,nt);
 cc=mix(cc,uS2*1.02,hz*.55);
 float ci=0.;if(uLo<.5){vec2 r=w/9000.+vec2(uTime*.004,0.);ci=smoothstep(.55,.85,noise(vec2(r.x*1.,r.y*5.))*.6+noise(r*7.)*.4)*.32*(1.-de);}
 c=mix(c,uSunC*.5+uSky*.9,ci*fade*mix(1.,.2,nt));
 c=mix(c,cc,de*fade*.94);}
if(uNight>.5&&el>0.){float s=hash(floor(d.xy/max(el,.05)*420.));c+=vec3(step(.997,s)*(.5+.5*sin(uTime*3.+s*99.)))*.8*(1.-hz);}
o=vec4(post(c),1.);}`;
  /* objek umum (gedung, properti, unit bertulang, pohon ber-instans) */
  const OBJ_VS = HEAD + `layout(location=0) in vec3 aP;layout(location=1) in vec3 aN;layout(location=2) in vec4 aC;layout(location=3) in vec4 aM;layout(location=4) in float aB;
layout(location=5) in vec4 iA;layout(location=6) in vec4 iB;layout(location=7) in vec3 iC;
uniform mat4 uVP;uniform mat4 uBones[24];uniform float uInst,uTime,uWind;out vec3 vP;out vec3 vN;out vec4 vC;out vec4 vM;out vec3 vT;out vec3 vL;
void main(){vL=aP;vT=vec3(1.);vec3 p,n;
if(uInst>.5){vec3 q=aP*iB.xyz;if(aM.x>2.5&&aM.x<3.5){float h=max(0.,aP.z)*iB.z;q.xy+=vec2(sin(uTime*1.7+iB.w+aP.z*.5),cos(uTime*1.3+iB.w*1.7+aP.x*.6))*.012*h*uWind;}
 float c=cos(iA.w),s=sin(iA.w);p=vec3(q.x*c-q.y*s,q.x*s+q.y*c,q.z)+iA.xyz;vec3 m=aN/iB.xyz;n=vec3(m.x*c-m.y*s,m.x*s+m.y*c,m.z);vT=iC;}
else{mat4 B=uBones[int(aB+.5)];p=(B*vec4(aP,1.)).xyz;n=mat3(B)*aN;}
vP=p;vN=n;vC=aC;vM=aM;gl_Position=uVP*vec4(p,1.);}`;
  const OBJ_FS = HEAD + COMMON + `in vec3 vP;in vec3 vN;in vec4 vC;in vec4 vM;in vec3 vT;in vec3 vL;uniform sampler2D uLeaf;uniform vec4 uFx;uniform vec4 uTC;uniform float uPass,uHot;out vec4 o;
void main(){int k=int(vM.x+.5);if((k==13)!=(uPass>.5))discard;float pr=vM.y;vec2 uv=vM.zw;vec3 alb=vC.rgb*vT,emi=vec3(0.);float spec=vC.a,gloss=24.;
vec3 N=normalize(vN),V=normalize(uCam-vP);bool back=dot(N,V)<0.;if(back)N=-N;float trans=0.;
if(k==3){vec4 t=texture(uLeaf,uv);if(t.a<.45)discard;alb=t.rgb*vT*1.08;spec=.04;trans=.35;}
else if(k==1){
#ifdef DESK
emi=alb*alb*1.35;
#else
emi=alb*1.4;
#endif
}
else if(k==12){emi=alb*uNight*3.;}
else if(k==14){emi=alb*(1.6+.6*sin(uTime*6.+pr*3.+vL.x));}
else if(k==13){vec3 c=alb*(uSky+uSunC*.4);float r=length(vL.xy)/(pr>.5?pr:6.6),a=(pr>6.9?.34:.2)*uFx.w*(1.-smoothstep(.8,1.,r))*(.75+.25*sin(atan(vL.y,vL.x)*4.-uTime*40.));o=vec4(post(fogit(c,vP))*a,a);return;}
else if(k==2){int s=int(pr);float sd=fract(pr),fh=s==5||s==3?3.1:s==1||s==2?3.4:3.3,ws=s==2?2.2:s==4?2.6:s==5?3.4:s==7?3.2:2.8,ww=s==2?.82:s==5?.36:s==7?.5:.46,wh=s==2?.5:s==4?.52:.42;
 float fl=floor(uv.y/fh),fy=fract(uv.y/fh),cx=floor(uv.x/ws),fx=fract(uv.x/ws);
 bool win=abs(fx-.5)<ww*.5&&fy>.3&&fy<.3+wh&&uv.y>1.2;if(s==1&&uv.y<4.6){win=fx>.07&&fx<.93&&uv.y>.25&&uv.y<3.7;}
 if(s==5&&fl<.5&&abs(fx-.5)<.16&&uv.y<2.1&&mod(cx,3.)<.5){alb=vec3(.28,.2,.14);}
 else if(win){float lit=step(.6,hash(vec2(cx,fl)+sd*91.7)),ex=abs(fx-.5)/(ww*.5),ey=abs((fy-.3)/wh-.5)*2.;
  if(ex>.9||ey>.88){alb=vec3(.72,.72,.7);spec=.2;}else if((abs(fx-.5)<.012&&s!=1)||abs((fy-.3)/wh-.62)<.02){alb=vec3(.55,.56,.56);spec=.2;}
  else{vec3 rf=skyCol(reflect(-V,N));float f=.35+.5*pow(1.-max(dot(N,V),0.),2.);float cur=step(.55,hash(vec2(cx*3.1,fl*1.7)+sd));
   alb=mix(vec3(.05,.06,.07),vec3(.32,.28,.22),cur*.35)*(1.-uNight*.3);emi=rf*f*.45*(1.-uNight*.8)+uNight*lit*vec3(1.,.76,.42)*(.9+.4*hash(vec2(fl,cx)));spec=.9;gloss=120.;}}
 else{alb*=.9+.14*noise(uv*vec2(.7,.2));alb*=1.-.14*smoothstep(.55,1.,noise(vec2(uv.x*1.2,uv.y*.07+sd*10.)));
  if(abs(fx-.5)<ww*.5+.06&&fy>.24&&fy<.3&&uv.y>1.2)alb*=1.18;if(s==4&&abs(abs(fx-.5)-ww*.5-.09)<.07&&fy>.3&&fy<.3+wh)alb=mix(alb,vec3(.18,.3,.2),.85);
  if(fy<.03)alb*=.86;}}
else if(k==9&&pr<-.5){vec3 rf=skyCol(reflect(-V,N));float f=.3+.6*pow(1.-max(dot(N,V),0.),3.);alb=vC.rgb*.35;emi=rf*f*.5*(1.-uNight*.7);spec=1.;gloss=220.;}   // kaca kendaraan/heli: gelap, memantulkan langit, tanpa kusen & lampu malam jendela gedung
else if(k==9){float fl=fract(uv.y/3.4),cc=fract(uv.x/1.6);bool fr=fl<.06||cc<.05;if(fr){alb=vec3(.32,.33,.35);spec=.5;}else{float lit=step(.7,hash(vec2(floor(uv.x/1.6),floor(uv.y/3.4))+pr*37.));
 vec3 rf=skyCol(reflect(-V,N));float f=.25+.6*pow(1.-max(dot(N,V),0.),3.);alb=vC.rgb*.22;emi=rf*f*.7+uNight*lit*vec3(.95,.85,.6)*.8;spec=1.;gloss=160.;}}
else if(k==6){float r=fract(vP.z*3.2),c2=fract((vP.x+vP.y)*1.6+floor(vP.z*3.2)*.5);alb*=.82+.18*smoothstep(0.,.25,r)+.06*(hash(floor(vec2((vP.x+vP.y)*1.6,vP.z*3.2)))-.5);alb*=1.-.15*smoothstep(.9,1.,c2);}
else if(k==7){float r=sin((vP.x+vP.y)*9.+vP.z*(abs(N.z)>.5?9.:0.));N=normalize(N+vec3(r*.18*(1.-abs(N.z)),r*.18*(1.-abs(N.z)),0.));alb*=.9+.1*r;spec=max(spec,.35);alb*=1.-.25*smoothstep(.6,1.,noise(vP.xy*.3+vP.z*.2));}
else if(k==8){alb*=.86+.22*noise(vP.xy*1.3+vP.z*.7)+.06*(noise(vP.xy*9.+vP.z*9.)-.5);if(pr>.5)alb*=.8+.3*noise(vec2(vP.x+vP.y,vP.z*3.)*3.);}
else if(k==10){alb*=.86+.2*noise(vP.xy*.9+vP.z*.6)-.08*smoothstep(.7,1.,noise(vP.xy*4.+vP.z*2.));}
else if(k==4){float a=atan(vL.y,vL.x);if(pr>.5&&pr<1.5)alb*=.8+.25*smoothstep(.1,.5,fract(vL.z*3.2));else alb*=.72+.38*noise(vec2(a*5.,vL.z*1.6))+.1*noise(vec2(a*20.,vL.z*6.));}
else if(k==11){alb*=.55+.6*step(.5,fract(uv.x*3.5+uFx.z));}
else if(k==15){float a=atan(vL.y,vL.x),r=sin(a*14.);N=normalize(N+vec3(cos(a+1.57),sin(a+1.57),0.)*r*.35);alb*=.82+.18*r;}
else if(k==16){vec2 rq=vL.xy*2.6+vL.z*1.7;alb=vT*(.62+.5*(uLo>.5?noise(rq):fbm(rq)));spec=.12;}
else if(k==5&&pr>.5){vec2 cq=vL.xy*.55+vL.z*.4+pr*13.;float c=uLo>.5?noise(cq):fbm(cq);alb*=c<.42?.8:c>.6?1.1:1.;if(pr>2.5&&c>.62)alb*=.8;}
else if(k==18){
#ifdef DESK
vec2 cq=vL.xy*5.+vec2(vL.z*5.,-vL.z*3.);float wv=texture(uDA,vec3(cq*3.1,3.)).r;alb*=.8+.42*wv;vec3 nq=texture(uDN,vec3(cq*2.,0.)).xyz;N=normalize(N+(nq-.5)*.22);
if(pr>1.5){vec2 cu=vL.xy*.3+vec2(vL.z*.3,-vL.z*.13)+pr*.13;vec3 cn=texture(uDA,vec3(cu,7.)).rgb;float n1=texture(uDA,vec3(cu*.5,7.)).a,c1=smoothstep(.47,.5,cn.g),c2=smoothstep(.49,.53,n1),c3=smoothstep(.56,.58,cn.b);alb*=mix(mix(1.3,.72,c1),.42,c2*.9)*(1.+c3*.5);}
#else
alb*=.9+.12*noise(vL.xy*40.+vL.z*40.);
#endif
if(uTC.w>.5)alb=uTC.rgb*(.75+.25*noise(vP.xy*2.+uTime));}
else if(k==19){gloss=40.;
#ifdef DESK
vec3 ln=normalize(cross(dFdx(vL),dFdy(vL)));vec2 pu=abs(ln.z)>.6?vL.xy:(abs(ln.x)>abs(ln.y)?vL.yz:vL.xz);float sc=texture(uDA,vec3(pu*1.1,4.)).a;alb*=.74+.52*sc;spec*=.65+.7*sc;
#endif
}
else if(k==20){spec=.03;emi=alb*(uSky*.5+uSunC*max(uSun.z,0.)*.55);}   // kanopi parasut: kain tembus cahaya langit/matahari (redup di malam hari)
#ifdef DESK
if(k==5||k==0){vec3 ln=normalize(cross(dFdx(vL),dFdy(vL)));vec2 pu=abs(ln.z)>.6?vL.xy:(abs(ln.x)>abs(ln.y)?vL.yz:vL.xz);float gr=texture(uDA,vec3(pu*.13,7.)).a;alb*=.66+.68*gr;
 if(k==5){vec4 q=texture(uDA,vec3(pu*.8,4.));alb*=.76+.56*q.a;vec3 nq=texture(uDN,vec3(pu*.8,4.)).xyz;N=normalize(N+(nq-.5)*.24);spec*=.5+.9*q.a;
  vec2 pc=pu/vec2(3.7,2.3);pc.x+=floor(pc.y)*.37;vec2 fp=abs(fract(pc)-.5);float w0=.009,fw=fwidth(pc.y),ed=max(smoothstep(.5-w0-fw,.5-w0,fp.y),smoothstep(.5-w0-fw,.5-w0,fp.x));alb*=1.-.3*ed*(1.-smoothstep(.02,.06,fw));}}
#endif
if(uTC.w>1.5)alb=uTC.rgb;
if(uFx.y>.5)alb=mix(alb,vec3(.07,.065,.06)*(.7+.6*noise(vL.xy*3.)),.88);
float sh=shadowAt(vP,N);vec3 col=light(alb,N,vP,spec,gloss,sh)+emi;
if(trans>0.)col+=alb*uSunC*max(dot(-N,uSun),0.)*trans*sh;
col+=vec3(.55)*uFx.x;if(uNvg>1.5)col=mix(col*.5,vec3(2.8*(.85+.15*N.z)),uHot*.88);col=fogit(col,vP);o=vec4(post(col),1.);}`;
  const OBJS_FS = HEAD + 'in vec4 vM;uniform sampler2D uLeaf;out vec4 o;void main(){if(int(vM.x+.5)==3&&texture(uLeaf,vM.zw).a<.45)discard;if(int(vM.x+.5)==13)discard;o=vec4(1.);}';
  const OBJS_VS = OBJ_VS;
  /* partikel billboard & garis */
  const PAR_VS = HEAD + `layout(location=0) in vec2 aQ;layout(location=1) in vec4 iP;layout(location=2) in vec4 iC;layout(location=3) in float iK;uniform mat4 uVP;uniform vec3 uR,uU;out vec2 vQ;out vec4 vC;out float vK;out vec3 vP;
void main(){vec3 p=iP.xyz+(uR*aQ.x+uU*aQ.y)*iP.w;vP=p;vQ=aQ;vC=iC;vK=iK;gl_Position=uVP*vec4(p,1.);}`;
  const PAR_FS = HEAD + COMMON + `in vec2 vQ;in vec4 vC;in float vK;in vec3 vP;out vec4 o;
void main(){float r=length(vQ);if(r>1.)discard;
if(vK<.5){float n=noise(vQ*2.2+vC.a*31.+vP.xy*.05);float a=(1.-r*r)*(.45+.75*n)*vC.a;vec3 c=vC.rgb*(uSky*1.1+uSunC*.5)*(.75+.35*n);c=fogit(c,vP);o=vec4(post(c)*a,a);}
else{float a=(1.-r)*(1.-r*.4)*vC.a;o=vec4(post(vC.rgb)*a,0.);}}`;
  /* ---- tekstur material PC: dipanggang sekali oleh GPU (bukan noise per piksel tiap frame): albedo+tinggi & normal+rongga+kilap, 8 lapis, bisa berulang tanpa sambungan ---- */
  const BAK_VS = HEAD + 'layout(location=0) in vec2 aQ;out vec2 vQ;void main(){vQ=aQ;gl_Position=vec4(aQ,0.,1.);}';
  const BAK_FS = HEAD + `in vec2 vQ;uniform int uL;out vec4 o;
uint ih(uint x){x^=x>>16;x*=0x7feb352dU;x^=x>>15;x*=0x846ca68bU;x^=x>>16;return x;}
float hs(ivec2 p,int k){return float(ih(uint(p.x)*1597U^ih(uint(p.y)+uint(k)*7919U+0x9e3779b9U))>>8)*(1./16777216.);}
float pn(vec2 p,vec2 per,int k){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);ivec2 P=ivec2(per),a=ivec2(i)+P*64;
 float q0=hs(a%P,k),q1=hs((a+ivec2(1,0))%P,k),q2=hs((a+ivec2(0,1))%P,k),q3=hs((a+ivec2(1,1))%P,k);return mix(mix(q0,q1,f.x),mix(q2,q3,f.x),f.y);}
float pf(vec2 uv,vec2 per,int oct,int k){float s=0.,a=.5,n=0.;for(int i=0;i<oct;i++){s+=a*pn(uv*per,per,k+i);n+=a;per*=2.;a*=.5;}return s/n;}
vec3 pv(vec2 uv,float per,int k){vec2 p=uv*per,i=floor(p),f=fract(p);float F1=9.,F2=9.,id=0.;ivec2 P=ivec2(per);
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){ivec2 c=(ivec2(i)+ivec2(x,y)+P*64)%P;vec2 r=vec2(x,y)+vec2(hs(c,k),hs(c,k+1))-f;float d=dot(r,r);if(d<F1){F2=F1;F1=d;id=hs(c,k+2);}else if(d<F2)F2=d;}
 return vec3(sqrt(F1),sqrt(F2),id);}
void main(){vec2 uv=vQ*.5+.5;vec3 c;float h;
if(uL==0){float d1=pn(vec2(uv.x*210.,uv.y*52.),vec2(210.,52.),1),d2=pn(vec2(uv.y*210.,uv.x*60.),vec2(210.,60.),3),d3=pn(vec2((uv.x+uv.y)*170.,(uv.x-uv.y)*44.),vec2(170.,44.),5),pt=pf(uv,vec2(6.),4,9),f=pn(uv*256.,vec2(256.),13),o2=pf(uv,vec2(10.),3,15);
 float b=mix(mix(d1,d2,smoothstep(.35,.65,o2)),d3,smoothstep(.45,.75,pt));h=b*.5+f*.25+pt*.25;c=mix(vec3(.66,.7,.54),vec3(1.14,1.18,.96),smoothstep(.22,.8,h));c*=mix(vec3(1.06,.97,.8),vec3(.95,1.05,1.03),pn(uv*16.,vec2(16.),11));}
else if(uL==1){float b=pf(uv,vec2(8.),6,21),wx=pf(uv,vec2(12.),3,31)-.5,wy=pf(fract(uv+.5),vec2(12.),3,35)-.5;vec3 v=pv(fract(uv+vec2(wx,wy)*.09),7.,25),v2=pv(uv,44.,29);float gt=smoothstep(.5,.66,pf(uv,vec2(5.),3,37)),cr=1.-(1.-smoothstep(0.,.05,v.y-v.x))*gt*.55,pb=smoothstep(.2,.08,v2.x)*step(.78,v2.z);
 h=b*.82*cr+pb*.22;c=mix(vec3(.21,.165,.115),vec3(.46,.375,.275),smoothstep(.3,.72,b+pn(uv*180.,vec2(180.),39)*.12));c*=cr;c=mix(c,vec3(.4,.36,.31)*(.75+.5*v2.z),pb*.8);}
else if(uL==2){float r=1.-abs(2.*pf(uv,vec2(5.),6,41)-1.),r2=1.-abs(2.*pf(fract(uv+.37),vec2(13.),5,47)-1.);vec3 v=pv(uv,7.,51);float cr=smoothstep(0.,.05,v.y-v.x);
 h=(r*.55+r2*.35+.1)*mix(.55,1.,cr);c=vec3(.82,.79,.74)*(.4+.88*h);c*=mix(.86,1.1,pf(uv,vec2(4.),3,55));}
else if(uL==3){float wv=sin(6.2832*(floor(uv.y*14.+.5)+fract(uv.y*14.+.5)-.5+uv.x*2.)+6.*pf(uv,vec2(4.),3,61))*.5+.5,g=pn(uv*256.,vec2(256.),65);
 h=wv*.6+g*.4;c=vec3(.84+.18*wv+.13*(g-.5));c*=mix(vec3(1.03,.99,.93),vec3(.97,1.,1.04),pn(uv*32.,vec2(32.),67));}
else if(uL==4){float g=pn(uv*220.,vec2(220.),71),g2=pn(uv*90.,vec2(90.),72),spk=smoothstep(.74,.92,g),pt=pf(uv,vec2(4.),4,73),wx=pf(uv,vec2(16.),3,74)-.5;vec3 v=pv(fract(uv+vec2(wx,-wx)*.12),3.,77);float crk=smoothstep(.012,0.,v.y-v.x)*smoothstep(.56,.68,pf(uv,vec2(3.),3,79));
 h=.5+.3*(g-.5)+.2*(g2-.5)-crk*.35;c=vec3(.2,.2,.205)*(.76+.5*pt)+spk*.13;c*=1.-crk*.5;}
else if(uL==5){float R=8.,y=uv.y*R,ry=floor(y),x=uv.x*R+.5*mod(ry,2.),rx=floor(x);vec2 f=vec2(fract(x),fract(y));float e=min(min(f.x,1.-f.x),min(f.y,1.-f.y)),jn=smoothstep(.015,.045,e),id=hs(ivec2(mod(rx,R),ry),81),n=pf(uv,vec2(20.),4,83);
 h=jn*(.7+.12*id+.18*n);c=vec3(.72+.22*id+.24*(n-.5)+.12*(pn(uv*180.,vec2(180.),85)-.5));c*=mix(.42,1.,jn);}
else if(uL==6){vec3 v=pv(uv,26.,91),v2=pv(fract(uv+.21),58.,95);float s1=smoothstep(.62,.12,v.x),s2=smoothstep(.62,.15,v2.x);
 h=max(s1,s2*.75);c=mix(vec3(.2,.18,.15),vec3(.66,.62,.56)*(.55+.75*(s1>s2*.75?v.z:v2.z)),smoothstep(.12,.42,h));}
else{h=pf(uv,vec2(8.),6,101);c=vec3(pf(uv,vec2(16.),5,107),pf(uv,vec2(32.),4,113),pn(uv*64.,vec2(64.),119));}
o=vec4(clamp(c*.8,0.,1.),h);}`;
  const BAKN_FS = HEAD + `in vec2 vQ;uniform sampler2DArray uA;uniform int uL;uniform float uK,uS;out vec4 o;
float h(vec2 uv){return texture(uA,vec3(uv,float(uL))).a;}
void main(){vec2 uv=vQ*.5+.5;float e=1./512.,c=h(uv),dx=h(uv+vec2(e,0.))-h(uv-vec2(e,0.)),dy=h(uv+vec2(0.,e))-h(uv-vec2(0.,e)),av=(h(uv+vec2(e*3.,0.))+h(uv-vec2(e*3.,0.))+h(uv+vec2(0.,e*3.))+h(uv-vec2(0.,e*3.)))*.25;
vec3 n=normalize(vec3(-dx*uK,-dy*uK,1.));o=vec4(n.xy*.5+.5,clamp(.92+(c-av)*2.6,.35,1.),uS);}`;
  const LIN_VS = HEAD + 'layout(location=0) in vec3 aP;layout(location=1) in vec4 aC;uniform mat4 uVP;out vec4 vC;void main(){vC=aC;gl_Position=uVP*vec4(aP,1.);}';
  const LIN_FS = HEAD + 'in vec4 vC;uniform float uNvg;out vec4 o;void main(){vec3 c=vC.rgb;if(uNvg>1.5){c=vec3(dot(c,vec3(.3,.59,.11))*1.6);}else if(uNvg>.5){float l=dot(c,vec3(.3,.59,.11))*2.;c=vec3(l*.25,l,l*.32);}o=vec4(c*vC.a,0.);}';

  function prog(vs, fs) {
    const D = G.desk ? '#define DESK\n' : '', sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src.replace('\n', '\n' + D)); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) + '\n' + src.split('\n').slice(0, 3).join(' ')); return o; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), nm = a.name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  }

  /* ---------------- BUFFER ---------------- */
  function meshGL(m) {   // unggah mesh 15-float ke VAO
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, m.v, gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.i, gl.STATIC_DRAW);
    [[0, 3, 0], [1, 3, 12], [2, 4, 24], [3, 4, 40], [4, 1, 56]].forEach(([l, s, o]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, s, gl.FLOAT, false, S, o); });
    gl.bindVertexArray(null);
    const c = [(m.min[0] + m.max[0]) / 2, (m.min[1] + m.max[1]) / 2, (m.min[2] + m.max[2]) / 2];
    return { vao, vb, ib, n: m.ni, c, r: Math.hypot(m.max[0] - c[0], m.max[1] - c[1], m.max[2] - c[2]) };
  }
  function freeMesh(o) { if (!o) return; gl.deleteVertexArray(o.vao); gl.deleteBuffer(o.vb); gl.deleteBuffer(o.ib); }

  function init() {
    G.tried = true; PR = {}; WR = null; motion.clear();
    try {
      if (typeof document === 'undefined' || !document.createElement) return;
      const oldW = document.getElementById('fpsw'); if (oldW && oldW.parentNode) oldW.parentNode.removeChild(oldW);   // konteks dibuat ulang: buang lapisan lama
      G.sw = !F.opts.mobile && !!F.swGL; G.desk = !F.opts.mobile && !G.sw; G.layered = false;
      cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
      G.aa = !G.sw && F.opts.quality >= 2;   // MSAA hanya di TINGGI (mahal di GPU terintegrasi)
      gl = cv.getContext('webgl2', { antialias: G.aa, alpha: false, depth: true, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) { G.err = 'no webgl2'; return; }
      G.gl = gl;   // laporan masalah: nama GPU
      // GPU/driver di-reset oleh sistem → tandai, render berikutnya membuat konteks baru (tidak membekukan halaman)
      if (cv.addEventListener) cv.addEventListener('webglcontextlost', e => { e.preventDefault(); G.lost = (G.lost || 0) + 1; G.ok = false; G.tried = G.lost > 3; });
      PR.ter = prog(TER_VS, TER_FS); PR.ters = prog(TER_VS, TERS_FS); PR.wat = prog(WAT_VS, WAT_FS); PR.sky = prog(SKY_VS, SKY_FS);
      PR.obj = prog(OBJ_VS, OBJ_FS); PR.objs = prog(OBJS_VS, OBJS_FS); PR.par = prog(PAR_VS, PAR_FS); PR.lin = prog(LIN_VS, LIN_FS);
      RES = {};
      // grid patch medan 32×32 + rok
      const PN = 32, v = [], idx = [], id = (x, y) => y * (PN + 1) + x;
      for (let y = 0; y <= PN; y++) for (let x = 0; x <= PN; x++) v.push(x, y, 0);
      for (let y = 0; y < PN; y++) for (let x = 0; x < PN; x++) idx.push(id(x, y), id(x + 1, y), id(x + 1, y + 1), id(x, y), id(x + 1, y + 1), id(x, y + 1));
      const ring = []; for (let x = 0; x < PN; x++) ring.push([x, 0]); for (let y = 0; y < PN; y++) ring.push([PN, y]); for (let x = PN; x > 0; x--) ring.push([x, PN]); for (let y = PN; y > 0; y--) ring.push([0, y]);
      const sb = v.length / 3; ring.forEach(([x, y]) => v.push(x, y, 1));
      for (let i = 0; i < ring.length; i++) { const j = (i + 1) % ring.length, a = id(...ring[i]), b = id(...ring[j]); idx.push(a, b, sb + j, a, sb + j, sb + i); }
      RES.patch = { vao: gl.createVertexArray(), n: idx.length };
      gl.bindVertexArray(RES.patch.vao); let b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
      b = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW); gl.bindVertexArray(null);
      // bidang air (grid 48×48)
      const WN = 48, wv = [], wi = [], M = 1400;
      for (let y = 0; y <= WN; y++) for (let x = 0; x <= WN; x++) wv.push(-M + (W.WW + 2 * M) * x / WN, -M + (W.WH + 2 * M) * y / WN);
      for (let y = 0; y < WN; y++) for (let x = 0; x < WN; x++) { const a = y * (WN + 1) + x; wi.push(a, a + 1, a + WN + 2, a, a + WN + 2, a + WN + 1); }
      RES.water = { vao: gl.createVertexArray(), n: wi.length }; gl.bindVertexArray(RES.water.vao);
      b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wv), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      b = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(wi), gl.STATIC_DRAW); gl.bindVertexArray(null);
      // segitiga layar penuh (langit)
      RES.sky = gl.createVertexArray(); gl.bindVertexArray(RES.sky); b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0); gl.bindVertexArray(null);
      // partikel: quad + buffer instans
      RES.par = gl.createVertexArray(); gl.bindVertexArray(RES.par); b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      RES.parB = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, RES.parB);
      [[1, 4, 0], [2, 4, 16], [3, 1, 32]].forEach(([l, s, o]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, s, gl.FLOAT, false, 36, o); gl.vertexAttribDivisor(l, 1); }); gl.bindVertexArray(null);
      RES.lin = gl.createVertexArray(); gl.bindVertexArray(RES.lin); RES.linB = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, RES.linB);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12); gl.bindVertexArray(null);
      RES.inst = gl.createBuffer();
      // atlas daun
      RES.leaf = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, RES.leaf); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, MD.leafAtlas()); gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // pohon: 9 jenis × 3 varian × 3 LOD
      RES.trees = {}; for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8]) for (let v2 = 0; v2 < 3; v2++) for (let l = 0; l < 3; l++) RES.trees[k + '_' + v2 + '_' + l] = meshGL(MD.tree(k, v2, l));
      RES.box = meshGL(MD.unitBox()); RES.flag = meshGL(MD.flag()); RES.chute = meshGL(MD.chute()); if (MD.ramChute) RES.ram = meshGL(MD.ramChute()); if (MD.helios) RES.sat = meshGL(MD.helios());
      RES.units = new Map();
      // peta bayangan
      RES.sh = { size: 0, tex: null, fbo: null, M: null };
      if (G.desk) bake();
      G.ok = true;
    } catch (e) { G.ok = false; G.err = String(e && e.message || e); if (window.console) console.warn('[fps-gl] WebGL2 gagal, pakai renderer perangkat lunak:', G.err); }
  }
  /* PC: panggang 8 lapis tekstur material ke array (mipmap + filter anisotropik agar tajam di sudut rendah seperti jalan) */
  function bake() {
    const SZ = 512, LAY = 8, ARR = gl.TEXTURE_2D_ARRAY, FB = gl.FRAMEBUFFER, ani = gl.getExtension('EXT_texture_filter_anisotropic');
    const mk = () => { const t = gl.createTexture(); gl.bindTexture(ARR, t); gl.texStorage3D(ARR, 10, gl.RGBA8, SZ, SZ, LAY); gl.texParameteri(ARR, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(ARR, gl.TEXTURE_WRAP_T, gl.REPEAT); gl.texParameteri(ARR, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(ARR, gl.TEXTURE_MAG_FILTER, gl.LINEAR); if (ani) gl.texParameterf(ARR, ani.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ani.MAX_TEXTURE_MAX_ANISOTROPY_EXT))); return t; };
    const A = mk(), N = mk(), fb = gl.createFramebuffer(), pa = prog(BAK_VS, BAK_FS), pn = prog(BAK_VS, BAKN_FS);
    gl.bindFramebuffer(FB, fb); gl.viewport(0, 0, SZ, SZ); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.bindVertexArray(RES.sky); gl.useProgram(pa.p);
    for (let l = 0; l < LAY; l++) { gl.framebufferTextureLayer(FB, gl.COLOR_ATTACHMENT0, A, 0, l); gl.uniform1i(pa.u.uL, l); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.flush(); }
    gl.bindFramebuffer(FB, null); gl.activeTexture(gl.TEXTURE6); gl.bindTexture(ARR, A); gl.generateMipmap(ARR);
    const KN = [1.6, 3.2, 3.8, 1.3, 1.3, 3, 4.2, 0], SP = [.04, .05, .1, .05, .09, .09, .08, 0];
    gl.bindFramebuffer(FB, fb); gl.viewport(0, 0, SZ, SZ); gl.useProgram(pn.p); gl.uniform1i(pn.u.uA, 6);
    for (let l = 0; l < LAY; l++) { gl.framebufferTextureLayer(FB, gl.COLOR_ATTACHMENT0, N, 0, l); gl.uniform1i(pn.u.uL, l); gl.uniform1f(pn.u.uK, KN[l]); gl.uniform1f(pn.u.uS, SP[l]); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.flush(); }
    gl.bindFramebuffer(FB, null); gl.activeTexture(gl.TEXTURE7); gl.bindTexture(ARR, N); gl.generateMipmap(ARR);
    gl.deleteFramebuffer(fb); gl.deleteProgram(pa.p); gl.deleteProgram(pn.p); gl.bindVertexArray(null);
    RES.dA = A; RES.dN = N;
  }
  function shadowRes(size) {
    const s = RES.sh; if (s.size === size) return; s.M = null; if (s.tex) { gl.deleteTexture(s.tex); gl.deleteFramebuffer(s.fbo); }
    s.size = size; if (!size) { s.tex = null; return; }
    s.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, s.tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    s.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, s.tex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* ---------------- SUMBER DAYA DUNIA (dibangun ulang tiap peta baru) ---------------- */
  function worldRes(w) {
    if (WR && WR.w === w) return WR;
    if (WR) { gl.deleteTexture(WR.hT); gl.deleteTexture(WR.aT); gl.deleteTexture(WR.mT); if (WR.rT) gl.deleteTexture(WR.rT); WR.cities.forEach(c => freeMesh(c.m)); }
    const tex = (fmt, ifmt, type, data, lin) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, F.NX, F.NY, 0, fmt, type, data);
      if (lin) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); }
      else { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    WR = { w, hT: tex(gl.RED, gl.R32F, gl.FLOAT, w.G, false), aT: tex(gl.RGBA, gl.RGBA8, gl.UNSIGNED_BYTE, w.ALB, true), mT: tex(gl.RGBA, gl.RGBA8, gl.UNSIGNED_BYTE, w.MAT, true), cities: [] };
    if (G.desk && w.RDF) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, F.NX, F.NY, 0, gl.RGBA, gl.FLOAT, w.RDF); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); WR.rT = t; }
    for (const c of w.cities) { const m = meshGL(MD.city(w, c)); WR.cities.push({ c, m }); }
    RES.units.forEach(freeMesh); RES.units.clear(); motion.clear();
    return WR;
  }

  /* ---------------- MATRIKS & KAMERA ---------------- */
  let LODK = 1, VP = new Float32Array(16), IVP = new Float32Array(16), CAM = null, FWD = [1, 0, 0], RGT = [0, 1, 0], UPV = [0, 0, 1], PL = [], RWp = 1, RHp = 1;
  function mmul(a, b, o) { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function inv(m, o) {
    const a = m, b = new Float32Array(16);
    b[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
    b[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
    b[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
    b[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
    b[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
    b[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
    b[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
    b[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
    b[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
    b[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
    b[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
    b[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
    b[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
    b[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
    b[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
    b[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
    let det = a[0] * b[0] + a[1] * b[4] + a[2] * b[8] + a[3] * b[12]; det = det ? 1 / det : 0; for (let i = 0; i < 16; i++) o[i] = b[i] * det; return o;
  }
  function setupCam(cam, w, h) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    FWD = [cy * cp, sy * cp, sp]; RGT = [-sy, cy, 0]; UPV = MD.v.crs(FWD, RGT); CAM = cam;
    if (cam.roll) { const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll), r0 = RGT, u0 = UPV; RGT = r0.map((v, i) => v * cr + u0[i] * sr); UPV = u0.map((v, i) => v * cr - r0[i] * sr); }   // kamera miring (operator roboh)
    LODK = clamp(.7 / Math.tan(cam.fov / 2), 1, 5);   // pandangan sempit (zoom) = medan lebih rinci
    const n = cam.air ? 6 : .2, f = 6000, tH = Math.tan(cam.fov / 2), tV = tH * h / w, e = [cam.x, cam.y, cam.z], d = MD.v.dot;
    const V = new Float32Array([RGT[0], UPV[0], -FWD[0], 0, RGT[1], UPV[1], -FWD[1], 0, RGT[2], UPV[2], -FWD[2], 0, -d(RGT, e), -d(UPV, e), d(FWD, e), 1]);
    const Pm = new Float32Array([1 / tH, 0, 0, 0, 0, 1 / tV, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]);
    mmul(Pm, V, VP); inv(VP, IVP);
    PL = [];   // bidang frustum (Gribb–Hartmann)
    const m = VP, row = r => [m[r], m[4 + r], m[8 + r], m[12 + r]], r3 = row(3);
    for (const [r, s] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1]]) { const a = row(r), p = [r3[0] + s * a[0], r3[1] + s * a[1], r3[2] + s * a[2], r3[3] + s * a[3]], l = Math.hypot(p[0], p[1], p[2]); PL.push(p.map(v => v / l)); }
  }
  const visS = (x, y, z, r) => { for (const p of PL) if (p[0] * x + p[1] * y + p[2] * z + p[3] < -r) return false; return true; };
  const visB = (x0, y0, z0, x1, y1, z1) => { for (const p of PL) if (p[0] * (p[0] > 0 ? x1 : x0) + p[1] * (p[1] > 0 ? y1 : y0) + p[2] * (p[2] > 0 ? z1 : z0) + p[3] < 0) return false; return true; };
  G.project = function (x, y, z, CW, CH) {
    const m = VP, w = m[3] * x + m[7] * y + m[11] * z + m[15]; if (w < .5) return null;
    return { x: ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * .5 + .5) * CW, y: (.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * .5) * CH, f: w };
  };

  /* ---------------- PENCAHAYAAN WAKTU HARI ---------------- */
  const LT = {
    DAY: { sun: [1.28, 1.2, 1.04], sky: [.42, .47, .56], gnd: [.25, .23, .19] },
    DUSK: { sun: [1.3, .74, .42], sky: [.34, .3, .42], gnd: [.21, .16, .12] },
    NIGHT: { sun: [.16, .2, .32], sky: [.075, .095, .16], gnd: [.04, .045, .06] }
  };
  function common(pp, U) {
    const u = pp.u; gl.useProgram(pp.p);
    const s = (n, f, ...a) => { if (u[n] !== undefined && u[n] !== null) gl[f](u[n], ...a); };
    s('uVP', 'uniformMatrix4fv', false, U.vp || VP); s('uCam', 'uniform3f', CAM.x, CAM.y, CAM.z); s('uSun', 'uniform3fv', U.L); s('uSunV', 'uniform3fv', U.L);
    s('uSunC', 'uniform3fv', U.sunC); s('uSky', 'uniform3fv', U.sky); s('uGnd', 'uniform3fv', U.gnd); s('uFogC', 'uniform3fv', U.fog); s('uFogD', 'uniform1f', U.fogD);
    s('uS0', 'uniform3fv', U.s0); s('uS1', 'uniform3fv', U.s1); s('uS2', 'uniform3fv', U.s2); s('uTime', 'uniform1f', U.time); s('uNight', 'uniform1f', U.night); s('uNvg', 'uniform1f', U.nvg);
    s('uShOn', 'uniform1f', U.shOn); s('uShSize', 'uniform1f', RES.sh.size || 1); s('uLo', 'uniform1f', U.lo); s('uShQ', 'uniform1f', U.shq); s('uShM', 'uniformMatrix4fv', false, U.shM);
    if (u.uShT) { gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, U.shOn ? RES.sh.tex : RES.dummyShadow()); gl.uniform1i(u.uShT, 5); }
    s('uWind', 'uniform1f', 1);
    if (u.uDA) { gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D_ARRAY, RES.dA); gl.uniform1i(u.uDA, 6); }
    if (u.uDN) { gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D_ARRAY, RES.dN); gl.uniform1i(u.uDN, 7); }
  }

  /* ---------------- MEDAN: pohon-empat LOD ---------------- */
  function terrain(pp, U, shadow) {
    const w = WR, u = pp.u; gl.bindVertexArray(RES.patch.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, w.hT); gl.uniform1i(u.uH, 0);
    if (!shadow) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, w.aT); gl.uniform1i(u.uAlb, 1); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, w.mT); gl.uniform1i(u.uMat, 2); if (u.uRd && w.rT) { gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, w.rT); gl.uniform1i(u.uRd, 4); } }
    gl.uniform2f(u.uTex, F.NX, F.NY); gl.uniform1f(u.uTX, F.TX);
    const TX = F.TX, cx = CAM.x / TX, cy = CAM.y / TX, near = shadow ? U.shBox : null; let n = 0;
    const node = (x0, y0, sz) => {
      const X0 = x0 * TX, Y0 = y0 * TX, X1 = (x0 + sz) * TX, Y1 = (y0 + sz) * TX;
      if (near) { if (X1 < near[0] || X0 > near[2] || Y1 < near[1] || Y0 > near[3]) return; }
      else if (!visB(X0, Y0, -16, X1, Y1, 190)) return;
      const mx = x0 + sz / 2, my = y0 + sz / 2, d = Math.hypot((mx - cx) * TX, (my - cy) * TX, Math.max(0, CAM.z - 60));
      const split = sz > 32 && d < sz * TX * (shadow ? .9 : 1.45 * LODK);
      if (split) { const h = sz / 2; node(x0, y0, h); node(x0 + h, y0, h); node(x0, y0 + h, h); node(x0 + h, y0 + h, h); return; }
      gl.uniform4f(u.uPatch, x0, y0, sz / 32, 0); gl.drawElements(gl.TRIANGLES, RES.patch.n, gl.UNSIGNED_SHORT, 0); n++;
    };
    for (let y = -512; y < F.NY + 512; y += 512) for (let x = -512; x < F.NX + 512; x += 512) node(x, y, 512);
    return n;
  }

  /* ---------------- POHON BER-INSTANS ---------------- */
  const INST = new Float32Array(11 * 40000);
  const TINT = { rockT: [.56, .54, .5], rockD: [.82, .64, .46], rockV: [.27, .25, .24], rockS: [.46, .48, .4], bushD: [1.05, .86, .55], bushS: [.78, .86, .62], bushV: [.8, .78, .6] };
  function treeBuckets(range, shadowBox) {
    const w = F.world, tr = w.trees, cxc = Math.floor(CAM.x / W.CELL), cyc = Math.floor(CAM.y / W.CELL), rc = Math.ceil(range / W.CELL) + 1, B = new Map();
    let n = 0;
    for (let gy = cyc - rc; gy <= cyc + rc; gy++) for (let gx = cxc - rc; gx <= cxc + rc; gx++) {
      if (gx < 0 || gy < 0 || gx >= W.GW || gy >= W.GH) continue;
      const a = w.tc.get(gy * W.GW + gx); if (!a) continue;
      if (shadowBox) { const X0 = gx * W.CELL, Y0 = gy * W.CELL; if (X0 + W.CELL < shadowBox[0] || X0 > shadowBox[2] || Y0 + W.CELL < shadowBox[1] || Y0 > shadowBox[3]) continue; }
      else if (!visB(gx * W.CELL - 10, gy * W.CELL - 10, -5, (gx + 1) * W.CELL + 10, (gy + 1) * W.CELL + 10, 130)) continue;
      for (let q = 0; q < a.length; q++) {
        const k = a[q] * 6, kind = tr[k + 4]; if (kind === 9 || (F.felled && F.felled.size && F.felled.has(a[q]))) continue;
        const x = tr[k], y = tr[k + 1], d = Math.hypot(x - CAM.x, y - CAM.y), small = kind === 2 || kind === 3 || kind === 8;
        if (d > (small ? Math.min(range, 170) : range)) continue;
        if (!shadowBox && !visS(x, y, tr[k + 2] + tr[k + 3] * .5, tr[k + 3] + 4)) continue;
        const lod = shadowBox ? 1 : d < (small ? 40 : 55) ? 0 : d < 170 ? 1 : 2, vr = a[q] % 3, key = kind + '_' + vr + '_' + (small && lod === 2 ? 1 : lod);
        let L = B.get(key); if (!L) { L = []; B.set(key, L); } L.push(a[q]); n++;
      }
    }
    return B;
  }
  function drawFallen(pp, range) {   // pohon yang ditumbangkan tank (fps-veh): mesh pohon yang sama, diputar rebah ke arah tabrakan
    if (!F.falling || !F.falling.length) return;
    gl.uniform1f(pp.u.uInst, 0); gl.uniform4f(pp.u.uFx, 0, 0, 0, 0);
    for (const f of F.falling) {
      if (Math.abs(f.x - CAM.x) > range || Math.abs(f.y - CAM.y) > range) continue;
      const m = RES.trees[f.kind + '_' + (f.k % 3) + '_0'] || RES.trees[f.kind + '_' + (f.k % 3) + '_1']; if (!m) continue;
      const hh = ((f.k * 2654435761) >>> 0) / 4294967295, s = f.h / (MD.TREE_H[f.kind] || 10), sx = s * (.85 + hh * .3);
      X.write(X.chain(X.T(f.x, f.y, f.z), X.rz(f.dir), X.ry(-f.a), X.rz(hh * 6.283 - f.dir), { c: [[sx, 0, 0], [0, sx, 0], [0, 0, s]], t: [0, 0, 0] }), BONES, 0);
      gl.uniformMatrix4fv(pp.u.uBones, false, BONES); gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0);
    }
    X.write(ID, BONES, 0); gl.bindVertexArray(null);
  }
  function drawTrees(pp, B) {
    const w = F.world, tr = w.trees; let off = 0; const draws = [];
    for (const [key, L] of B) {
      const st = off;
      for (const id of L) {
        if (off >= 40000) break;
        const k = id * 6, kind = tr[k + 4], h = tr[k + 3], rad = tr[k + 5], H0 = MD.TREE_H[kind] || 10, j = off * 11, hh = ((id * 2654435761) >>> 0) / 4294967295;
        const bi = w.BI[Math.min(F.NX * F.NY - 1, Math.floor(tr[k + 1] / F.TX) * F.NX + Math.floor(tr[k] / F.TX))];
        INST[j] = tr[k]; INST[j + 1] = tr[k + 1]; INST[j + 2] = tr[k + 2]; INST[j + 3] = hh * 6.283;
        let sx, sz, tint;
        if (kind === 3) { sx = rad; sz = h * .75; tint = bi === 1 ? TINT.rockD : bi === 3 ? TINT.rockV : bi === 2 ? TINT.rockS : TINT.rockT; INST[j + 4] = sx; INST[j + 5] = sx * .8; INST[j + 6] = sz; }
        else { const s = h / H0; sx = s * (.85 + hh * .3); INST[j + 4] = sx; INST[j + 5] = sx; INST[j + 6] = s; tint = kind === 2 ? (bi === 1 ? TINT.bushD : bi === 2 ? TINT.bushS : bi === 3 ? TINT.bushV : null) : null; }
        INST[j + 7] = hh * 50; const tv = .88 + hh * .24;
        INST[j + 8] = (tint ? tint[0] : 1) * tv; INST[j + 9] = (tint ? tint[1] : 1) * tv; INST[j + 10] = (tint ? tint[2] : 1) * tv;
        off++;
      }
      draws.push([key, st, off - st]);
    }
    if (!off) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, RES.inst); gl.bufferData(gl.ARRAY_BUFFER, INST.subarray(0, off * 11), gl.STREAM_DRAW);
    gl.uniform1f(pp.u.uInst, 1);
    for (const [key, st, cnt] of draws) {
      const m = RES.trees[key]; if (!m || !cnt) continue;
      gl.bindVertexArray(m.vao); gl.bindBuffer(gl.ARRAY_BUFFER, RES.inst);
      [[5, 4, 0], [6, 4, 16], [7, 3, 32]].forEach(([l, s, o]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, s, gl.FLOAT, false, 44, st * 44 + o); gl.vertexAttribDivisor(l, 1); });
      gl.drawElementsInstanced(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0, cnt);
      [5, 6, 7].forEach(l => gl.disableVertexAttribArray(l));
    }
    gl.uniform1f(pp.u.uInst, 0); gl.bindVertexArray(null);
  }

  /* ---------------- UNIT: mesh, pose, gerak ---------------- */
  const motion = new Map(), BONES = new Float32Array(16 * 24), ID = X.I();
  let emberA = 0;
  function emberFx(u, yaw, gz, hs, dt) {
    emberA += dt * 16; const c = Math.cos(yaw), sn = Math.sin(yaw);
    while (emberA > 1) { emberA--; const ring = Math.random() < .55, a = Math.random() * 6.283, bx = ring ? -.33 : -.3 - Math.random() * .35, by = ring ? Math.cos(a) * .66 : (Math.random() < .5 ? -1 : 1) * (.2 + Math.random() * .6), bz = ring ? 1.42 + Math.sin(a) * .66 : .02 + Math.random() * .3, wx = u.x + (c * bx - sn * by) * hs, wy = u.y + (sn * bx + c * by) * hs; F.emit('spark', wx, wy, gz + bz * hs, { vx: (Math.random() - .5) * 1.2, vy: (Math.random() - .5) * 1.2, vz: .8 + Math.random() * 2, life: .5 + Math.random() * .9, s0: .045, s1: .012, col: Math.random() < .5 ? [255, 120, 30] : [255, 190, 80], g: -.4, drag: .6 }); }
  }
  for (let i = 0; i < 24; i++) X.write(ID, BONES, i * 16);
  const HUMAN = { INF: 1, SF: 1, AT: 1, MORT: 1, MEDIC: 1, OPR: 1, CMDR: 1, WARLORD: 1, CLAY: 1 };
  const palOf = u => u.team === 'B' ? (TK.S.doc === 'us' ? 'US' : 'B') : 'R';
  function unitMesh(u, burnt, lod) {
    const T = UT[u.type], pal = burnt ? 'BURNT' : palOf(u), kit = u.kit || (u.type === 'SF' ? 'SMG' : u.type === 'CMDR' || u.type === 'WARLORD' || u.type === 'CLAY' ? 'MG' : 'RIF');
    let key;
    if (HUMAN[u.type]) key = 'H' + pal + u.type + kit + (lod ? 'L' : '');
    else if (T.struct) key = 'S' + u.type + u.team;
    else if (T.dom === 'S') key = 'P' + u.type + pal;
    else if (u.fly || u.jet || T.tc === 'A') key = 'A' + u.type + pal;
    else key = 'V' + u.type + pal;
    let m = RES.units.get(key);
    if (!m) {
      let mesh;
      if (key[0] === 'H') mesh = MD.human(pal === 'BURNT' ? 'R' : pal, kit, u.type, lod);
      else if (key[0] === 'S') mesh = MD.structure(u.type, u.team);
      else if (key[0] === 'P') mesh = MD.ship(u.type, pal);
      else if (key[0] === 'A') mesh = MD.aircraft(u.type, pal);
      else mesh = MD.vehicle(u.type, pal);
      m = meshGL(mesh); RES.units.set(key, m);
    }
    return m;
  }
  function mot(u, dt) {
    let m = motion.get(u.id);
    if (!m) { m = { x: u.x, y: u.y, ph: Math.random() * 6, sp: 0, yaw: u.hdg || 0, pit: 0, rol: 0, yr: 0, dist: 0, aim: 0, seen: frame }; motion.set(u.id, m); }
    m.seen = frame; if (dt <= 0) return m;   // lintasan peta bayangan (dt 0): jangan menghabiskan perpindahan frame ini
    const d = Math.hypot(u.x - m.x, u.y - m.y), sp0 = m.sp; m.x = u.x; m.y = u.y; m.sp = m.sp * .85 + d / dt * .15; m.acc = (m.acc || 0) * .9 + (m.sp - sp0) / dt * .1; m.dist += d;
    return m;
  }
  const wrap = a => { if (!isFinite(a)) return 0; a = (a + Math.PI) % 6.283185307; return (a < 0 ? a + 6.283185307 : a) - Math.PI; };
  function bodyFrame(u, m, dt, alt, kind) {   // posisi + orientasi: kemiringan medan untuk kendaraan, miring belok untuk pesawat
    if (u.pose) { const q = u.pose; m.yaw = q.yaw; m.pit = q.pit; m.rol = q.rol; return X.chain(X.T(u.x, u.y, q.z), X.rz(q.yaw), X.ry(q.pit), X.rx(q.rol)); }   // Apache operator: sikap dari model terbang (fps-heli)
    const gz = F.gzOf(u), want = u.hdg || 0, grd = u.ts && u.ts.ph !== 'climb' || u.lf && u.lf.ph !== 'climb';   // grd: di landasan / helipad
    const dy = wrap(want - m.yaw), k = grd && u.ts ? Math.min(1, dt * 14) : Math.min(1, dt * (kind === 'J' ? 3 : kind === 'G' ? 7 : 4)); m.yaw = wrap(m.yaw + dy * k); if (dt > 0) m.yr = m.yr * .9 + dy * k / dt * .1;
    let pit = 0, rol = 0, z = gz + alt;
    if (kind === 'G') {   // roda/rantai mengikuti lereng di sepanjang badan + suspensi: menukik saat mengerem, mendongak saat menggas, condong keluar di tikungan
      const T = UT[u.type], c = Math.cos(m.yaw), s = Math.sin(m.yaw), L = 2.3 * (T.sz || 1), Wd = 1.3 * (T.sz || 1), hg = (x, y) => F.floorAt(x, y);
      pit = Math.atan2(hg(u.x + c * L, u.y + s * L) - hg(u.x - c * L, u.y - s * L), 2 * L); rol = Math.atan2(hg(u.x - s * Wd, u.y + c * Wd) - hg(u.x + s * Wd, u.y - c * Wd), 2 * Wd);
      pit += clamp((m.acc || 0) * .006, -.05, .04); rol += clamp(m.yr * m.sp * .004, -.06, .06);
      m.steer = clamp(m.yr * 2.6 / Math.max(m.sp, 2.5), -.5, .5);
      if (m.sp > 1 && Math.random() < dt * Math.min(6, m.sp * .25) && !F.water(u.x, u.y)) F.emit('dust', u.x - c * L * 1.1 + (Math.random() - .5) * Wd, u.y - s * L * 1.1 + (Math.random() - .5) * Wd, gz + .3, { vx: -c * 1.5, vy: -s * 1.5, vz: .6, life: 1.2, s0: .7, s1: 2.6, col: [150, 136, 108], a: .3, drag: 1 });   // debu roda
    }
    else if (grd) {
      if (u.ts) pit = u.ts.pit || 0;
      else { const ag = clamp((alt - 1.3) / 9, 0, 1); pit = 0; z += Math.sin(TIME * 1.3 + u.id) * .3 * ag; }
    }
    else if (kind === 'A') {
      const T = UT[u.type];
      if (T.bank !== undefined) { pit = 0; rol = T.bank; z += Math.sin(TIME * .5 + u.id) * .6; }   // balon udara tegak, gunship miring tetap ke dalam lingkaran
      else { pit = -clamp(m.sp / (T.spd || 1), 0, 1) * .2 - clamp((m.acc || 0) * .025, -.2, .14) + clamp((u.gzV || 0) * .03, -.14, .36); rol = clamp(m.yr * .6, -.5, .5); z += Math.sin(TIME * 1.3 + u.id) * .4; }   // menunduk saat melaju & berakselerasi, mendongak (flare) saat mengerem
    }
    else if (kind === 'J') { rol = clamp(m.yr * .9, -1.1, 1.1); pit = clamp((u.gzV || 0) * .012, -.2, .4); }
    else if (kind === 'U') { pit = Math.sin(TIME * .9 + u.id) * .06; rol = Math.cos(TIME * 1.1 + u.id) * .06; z += Math.sin(TIME * 1.6 + u.id) * 1.2; }
    m.pit += (pit - m.pit) * Math.min(1, dt * 6); m.rol += (rol - m.rol) * Math.min(1, dt * 6);
    return X.chain(X.T(u.x, u.y, z), X.rz(m.yaw), X.ry(m.pit), X.rx(m.rol));
  }
  let TIME = 0, FOGD = 1100, DV = { hum: 600, veh: 1700 };
  function doorBone(u, H0, tur) {   // pintu / palka / kanopi kendaraan operator (u.door 0 tertutup … 1 terbuka; animasi naik di fps-life)
    const D = MD.DOOR[u.type]; if (!D) return;
    const o = u.door || 0, h = D.h, a = D.a * o, R = Array.isArray(D.ax) ? X.ra(D.ax, a) : D.ax === 'z' ? X.rz(a) : D.ax === 'y' ? X.ry(a) : X.rx(a);
    X.write(X.chain(D.tur ? tur : H0, X.T(h[0], h[1], h[2]), R, X.T(-h[0], -h[1], -h[2])), BONES, D.b * 16);
    if (D.lb) { const q = D.lh, k = Math.max(.002, Math.min(1, o * 1.6)); X.write(X.chain(H0, X.T(q[0], q[1], q[2]), { c: [[k, 0, 0], [0, k, 0], [0, 0, k]], t: [0, 0, 0] }, X.T(-q[0], -q[1], -q[2])), BONES, D.lb * 16); }   // tangga / pijakan lipat: muncul saat kanopi dibuka
  }
  const lerp = (a, b, q) => a + (b - a) * q;
  const RAGT = { INF: 1, SF: 1, AT: 1, MORT: 1, MEDIC: 1, OPR: 1 };
  let ragA = 0, ragF = -1;
  function ragOf(c, u, gz, d, dt) {   // ragdoll dibuat saat jasad pertama tergambar di dekat kamera; maks. 16 aktif sekaligus, sisanya animasi jatuh lama
    if (c.rag === undefined) {
      if (ragF !== frame) { ragF = frame; ragA = 0; }
      if (!RAGT[u.type] || !MD.ragInit || d > 170 || ragA >= 16 || F.opts.mobile && ragA >= 6) { c.rag = null; return null; }
      const q = c.pose || {}, gv = q.gv || 0, sp = q.sp || 0, h = c.hdg0 || 0, bl = c.blast, kick = bl ? 6 + Math.random() * 5 : 2.2 + Math.random() * 1.4, up = bl ? 5 + Math.random() * 5 : .5 + Math.random() * .8;
      const st = { x: u.x, y: u.y, z: gz, yaw: q.yaw !== undefined ? q.yaw : u.face || 0, mv: clamp(gv / 1.3, 0, 1), run: gv > 3.3, rk: MD.gaitRun(gv), gv, ph: q.ph || 0, aim: q.aim || 0, dead: 0, look: 0, recoil: 0, kneel: 0 };
      c.rag = MD.ragInit(st, [Math.cos(h) * Math.min(sp, 9), Math.sin(h) * Math.min(sp, 9)], [(c.ix || 0) * kick, (c.iy || 0) * kick, up], bl);
    }
    const r = c.rag; if (!r) return null;
    if (!r.sleep && dt > 0) { if (ragF !== frame) { ragF = frame; ragA = 0; } ragA++; MD.ragStep(r, dt); }
    return r;
  }
  /* CLAY MARTIN terbang: badan mengikuti vektor laju lewat pegas teredam (ada inersia & sedikit melewati sasaran), guling saat berbelok,
     berdiri & kaki maju saat mengerem, leher mengangkat kepala, menembak = badan tegak membidik. Ancang-ancang jongkok sebelum melesat, mendarat diredam lutut */
  /* v2.12 CRAY: pose katana dari aksi sim. Kunci = [tsuba x,y,z, arah bilah, arah mata] di kerangka bahu (x depan, z atas, +y sisi tangan kanan / gagang).
     G siaga chudan · W ancang-ancang di atas bahu · C akhir tebasan diagonal · S limbung · B menahan (bilah melintang) · D melesat (bilah rendah di belakang) */
  const KK = { G: [.42, .03, .2, .75, -.05, .66, .66, 0, -.75], W: [.16, .18, .66, -.3, .15, .94, .94, 0, .3], C: [.5, -.12, .02, .45, -.55, -.7, .3, -.4, -.85],
    S: [.22, .1, .55, -.2, .5, .84, .8, 0, .2], B: [.4, .2, .38, .15, -.97, .2, .95, .1, .2], D: [.18, .22, .15, -.75, .3, -.55, 0, 0, -1],
    L: [.3, -.22, .05, -.35, -.5, -.6, .3, -.2, .9], U: [.35, .3, .55, .25, .5, .83, .9, -.2, 0] };   // v2.13: L ancang-ancang rendah kiri → U akhir tebasan naik di kanan atas (backhand / Tebasan Naik)
  const kcurve = (keys, t) => { for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const a = keys[i - 1], b = keys[i], f = clamp((t - a[0]) / (b[0] - a[0]), 0, 1), e = f * f * (3 - 2 * f); return a[1].map((v, j) => v + (b[1][j] - v) * e); } return keys[keys.length - 1][1].slice(); };
  function crayPose(u, s, m, dt) {
    const A = u.act, C = TK.war.CRAY, dif = Q.diff; let tgt = null, kat = 0, iai = 0, fast = false;
    const W0 = A && A.W || C.duel.wind[dif] || .4, R0 = C.duel.rec[dif] || .4, ph3 = (wd, sw, rc) => A.ph === 'wind' ? .45 * Math.min(1, A.t / wd) : A.ph === 'swing' ? .45 + .17 * Math.min(1, A.t / sw) : .62 + .38 * Math.min(1, A.t / rc);
    if (A && A.k === 'duel') { tgt = kcurve(A.n % 2 && !A.hv ? [[0, KK.G], [.45, KK.L], [.62, KK.U], [1, KK.G]] : [[0, KK.G], [.45, KK.W], [.62, KK.C], [1, KK.G]], ph3(W0, C.duel.swing, R0)); kat = 1; fast = A.ph === 'swing'; }   // rentetan: tebasan bergantian turun-diagonal / naik-backhand
    else if (A && A.k === 'rise') { tgt = kcurve([[0, KK.G], [.45, KK.L], [.62, KK.U], [1, KK.G]], ph3(C.rise.wind[dif] || .3, C.duel.swing, R0)); kat = 1; fast = A.ph === 'swing'; s.cr = A.ph === 'wind' ? .4 * Math.min(1, A.t / .15) : 0; }
    else if (A && A.k === 'iai') { if (A.ph === 'aim') { iai = .22 * Math.min(1, A.t / .2); s.cr = .6; s.mv = 0; s.aim = 0; } else { tgt = A.ph === 'dash' ? KK.D : kcurve([[0, KK.C], [1, KK.G]], Math.min(1, A.t / C.iai.rec)); kat = 1; fast = true; } }   // kuda-kuda iai: tangan di gagang, badan merendah → melesat
    else if (A && A.k === 'space') { const MK = C.space.mark[dif] || .5; tgt = A.ph === 'mark' && A.t > MK * .72 ? KK.C : KK.W; kat = 1; fast = A.ph === 'mark' && A.t > MK * .72; }
    else if (A && (A.k === 'swords' || A.k === 'blink')) { tgt = KK.G; kat = 1; }
    else if (A && A.k === 'cut') { const t = A.ph === 'dash' ? .4 * Math.min(1, A.t / C.cut.dash) : A.ph === 'swing' ? .4 + .22 * Math.min(1, A.t / C.cut.swing) : .62 + .38 * Math.min(1, A.t / C.cut.rec); tgt = kcurve([[0, KK.D], [.4, KK.W], [.62, KK.C], [1, KK.G]], t); kat = 1; fast = A.ph !== 'rec'; }
    else if (A && A.k === 'stun') { tgt = KK.S; kat = 1; }
    else if (A && A.k === 'guard') { tgt = KK.B; kat = 1; fast = true; }
    else if (A && A.k === 'jce') { const J = C.jce; iai = A.ph === 'sheath' ? Math.min(1, A.t / .3) * .22 : A.ph === 'end' ? 1 - Math.min(1, A.t / (J.end * .62)) : 0; s.cr = A.ph === 'sheath' ? .55 : A.ph === 'end' ? .55 * (1 - Math.min(1, A.t / J.end)) : 0; s.mv = 0; s.aim = 0; }
    else if (u.duel && !u.jf) { tgt = KK.G; kat = 1; }
    m.katK = (m.katK || 0) + (kat - (m.katK || 0)) * Math.min(1, dt * 10);
    if (tgt) { if (!m.kq) m.kq = tgt.slice(); const r = Math.min(1, dt * (fast ? 45 : 14)); for (let i = 0; i < 9; i++) m.kq[i] += (tgt[i] - m.kq[i]) * r; }
    s.kat = m.katK; s.kq = m.kq || KK.G; s.kiai = iai; s.kjce = !!(A && A.k === 'jce'); if (s.kat > .05) { s.aim = 0; s.two = false; }
  }
  function clayAir(u, s, m, alt, gz, dt) {
    s.jetOn = u.jpk > Q.t && !u.die; s.z = gz + alt;
    const tg0 = u.ftg && !u.ftg.dead ? u.ftg : null;
    if (tg0) { const dh = Math.hypot(tg0.x - u.x, tg0.y - u.y), tz = F.zOf(tg0) + 1; s.gunP = clamp(Math.atan2(tz - (gz + alt + 1.8), Math.max(dh, 3)), -1.25, 1.1); }
    if (dt > 0 && !u.die) {
      if (u.jf && !m.wasF && Q.t >= u.jt0) { m.wasF = true; m.sbT = 0; m.burst = 1; const A = TK.fpsaudio; if (A) A.at('jetign', u.x, u.y, 1.8); F.shock && F.shock.push({ x: u.x, y: u.y, R: 15, t: 0, life: .4, col: [225, 222, 214], w: .12, al: .3 }); for (let i = 0; i < 22; i++) { const a = i / 22 * 6.283; F.emit('dust', u.x + Math.cos(a) * 1.5, u.y + Math.sin(a) * 1.5, gz + .3, { vx: Math.cos(a) * 15, vy: Math.sin(a) * 15, vz: .7, life: 1.1, s0: .9, s1: 3.6, col: [150, 138, 116], a: .34, drag: 2 }); } }
      else if (!u.jf && m.wasF) { m.wasF = false; const A = TK.fpsaudio; if (A) A.at('jetland', u.x, u.y, 1.6); F.shock && F.shock.push({ x: u.x, y: u.y, R: 12, t: 0, life: .36, col: [225, 222, 214], w: .1, al: .3 }); for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; F.emit('dust', u.x + Math.cos(a), u.y + Math.sin(a), gz + .25, { vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, vz: .5, life: .9, s0: .7, s1: 2.8, col: [150, 138, 116], a: .34, drag: 2.2 }); } }
    }
    if (u.jf && u.jt0 > Q.t && !u.die) {   // awalan (video rujukan v2.14): berjalan 2–3 langkah hampir tegak, kepalan langsung naik ke dada, lalu menekuk lutut sejenak & melesat
      const q = clamp(1 - (u.jt0 - Q.t) / UT.CLAY.jetRun, 0, 1), dip = clamp((q - .74) / .18, 0, 1), cr = Math.sin(Math.min(1, dip) * Math.PI * .5) * (q > .94 ? 1 - (q - .94) / .06 : 1);
      s.mv = 1 - dip * .85; s.run = false; s.rk = 1; s.gv = 2.6; s.aim = 0; s.tilt = -.1 - .26 * cr - .55 * clamp((q - .9) / .1, 0, 1); s.pv = [0, 0, 0]; s.fly = Math.min(1, q * 4); s.sweep = 0; s.cr = .55 * cr; m.aim = 0; m.tiltS = s.tilt; m.tiltV = 0; m.rolS = m.rolV = 0; return;
    }
    if (alt <= .5 || u.die) {
      if (u.jf && !u.die && Q.t >= u.jt0) { s.tilt = m.tiltS = Math.min(m.tiltS || 0, -.66); m.tiltV = 0; m.rolS = m.rolV = 0; s.fly = 1; s.sweep = 0; s.mv = 0; s.aim = 0; s.pv = [0, 0, 0]; m.aim = 0; return; }   // v2.14: detik lepas dari tanah — sudah condong serong, kepalan di dada (bukan berdiri tegak)
      m.tiltS = m.tiltV = m.rolS = m.rolV = 0; m.altP = undefined;
      const la = u.landed !== undefined ? 1 - (Q.t - u.landed) / .4 : 0; if (la > 0 && !u.die) { s.cr = la * .9; s.mv = 0; s.aim *= 1 - la; }
      return;
    }
    const hd = Math.max(dt, 1e-3), vz = m.vz = dt > 0 ? (m.vz || 0) + ((alt - (m.altP === undefined ? alt : m.altP)) / hd - (m.vz || 0)) * Math.min(1, dt * 6) : (m.vz || 0); if (dt > 0) m.altP = alt;
    const vh = m.sp, k = clamp(vh / 70, 0, 1), aimK = clamp(m.aim * 1.2, 0, 1);
    let tg = Math.max(-Math.atan2(vh, Math.max(9, vz > 0 ? vz + 9 : 9 - vz * .15)), -1.42);   // sumbu badan searah laju; laju kecil = tegak melayang
    tg += clamp(-(m.acc || 0) / 80, 0, 1) * 1.45;                                            // mengerem: badan berdiri, kaki terayun ke depan
    if (u.jt0 !== undefined && Q.t - u.jt0 < .45) tg = Math.min(tg, -.78);   // v2.14: sesaat setelah lepas badan langsung condong serong searah lesatan (video rujukan)
    tg = lerp(Math.min(tg, .4), -.26, aimK);
    if (dt > 0) {
      const dy = wrap(m.yaw - (m.yawP === undefined ? m.yaw : m.yawP)) / hd; m.yawP = m.yaw;
      const rg = clamp(-dy * (.25 + .5 * k), -1.05, 1.05) * (1 - aimK * .7);
      const st = Math.min(dt, 1 / 30);
      m.tiltV = (m.tiltV || 0) + ((tg - (m.tiltS || 0)) * 15 - (m.tiltV || 0) * 5.2) * st; m.tiltS = (m.tiltS || 0) + m.tiltV * st;
      m.rolV = (m.rolV || 0) + ((rg - (m.rolS || 0)) * 18 - (m.rolV || 0) * 5.8) * st; m.rolS = (m.rolS || 0) + m.rolV * st;
    }
    s.tilt = m.tiltS || 0; s.rolA = m.rolS || 0; s.pv = [0, 0, 1.1 * clamp(alt / 7, 0, 1)]; s.mv = 0; s.kneel = 0; s.rk = 1; s.gv = 0; s.run = false; s.flyK = k; s.fly = clamp((vh - 12) / 26, 0, 1); s.sweep = 1;
    s.z += (1 - k) * (Math.sin(TIME * 1.7 + u.id) * .1 + Math.sin(TIME * .93 + u.id) * .06);   // melayang: naik-turun halus
    const w = Math.sin(TIME * 3.1 + u.id) * .03, fl = Math.sin(TIME * 23 + u.id) * .014 * k;
    s.legs = [lerp(-.1, .02, k) + w + fl, lerp(.26, .1, k), lerp(.09, .075, k)]; s.toe = lerp(.45, 1.1, k);   // kaki rapat lurus sejajar badan, satu lutut sedikit tertekuk
    s.neck = clamp(-s.tilt, 0, 1.45) * .84 * (1 - aimK);
  }
  /* efek terbang (rujukan: lepas landas serial Lanterns): tanpa api; semburan kabut energi saat lepas yang cepat memudar, lalu SATU kontrail tebal mengikuti lintasan badan yang makin panjang seiring laju */
  function clayFx(u, s, m, B, gz, alt, dt, d) {
    const px = b => [B[b * 16 + 12], B[b * 16 + 13], B[b * 16 + 14]], hs = UT.CLAY.hs || 1, R = Math.random, k = s.flyK || 0, c = px(1), h = px(2), p0 = px(0), f1 = px(12), f2 = px(13);
    m.auT = (m.auT || 0) - dt;
    if (m.auT <= 0 && d < 520) { m.auT = .05; for (const [p, q] of [[c, .95], [h, .55], [p0, .8]]) F.emit('fire', p[0] + (R() - .5) * .1, p[1] + (R() - .5) * .1, p[2] + (R() - .5) * .1, { life: .11, s0: q * hs, s1: q * hs * 1.08, col: [255, 54, 20], a: .055 + .03 * k }); }
    if (m.burst && alt > 1.5) { m.burst = 0; if (d < 1300) { for (let i = 0; i < 26; i++) { const a = R() * 6.283, e = (R() - .5) * 2.4, v = 3 + R() * 7; F.emit('smoke', p0[0] + (R() - .5) * .6, p0[1] + (R() - .5) * .6, p0[2] + (R() - .5) * .9, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: Math.sin(e) * v, life: .45 + R() * .45, s0: .55 * hs, s1: (2 + R() * 1.4) * hs, col: [196, 190, 180], a: .3, drag: 2.6 }); } } }
    /* v2.14 (video rujukan): tanpa kabut merah — garis kondensasi putih tipis di belakang badan, dan saat menembus kecepatan suara
       muncul KERUCUT UAP (selubung putih berbentuk lonceng di sekeliling badan, ujung depan paling terang) yang ikut terbang selama ia supersonik */
    const vt = Math.hypot(m.sp, m.vz || 0), tail = [p0[0], p0[1], p0[2]], vk = m.vcK = clamp((m.vcK || 0) + ((vt > 84 ? 1 : 0) - (m.vcK || 0)) * Math.min(1, dt * (vt > 84 ? 3.2 : 1.6)), 0, 1);
    if (m.ct0 && (vt > 40 || vk > .05) && d < 2600) {
      const a = m.ct0, L = Math.hypot(tail[0] - a[0], tail[1] - a[1], tail[2] - a[2]);
      if (L > .02 && L < 300) F.tracers.push({ x0: a[0], y0: a[1], z0: a[2], x1: tail[0], y1: tail[1], z1: tail[2], t: 0, life: .5 + .9 * vk, w: (.014 + .02 * vk) * hs * Math.max(1, d * .004), col: [236, 240, 246], inst: true, a: .08 + .17 * vk, tp: 1 });
    }
    m.ct0 = tail;
    if (vk > .02 && d < 4000 && F.vcs) { const dz = m.vz || 0, cy0 = Math.cos(m.yaw), sy0 = Math.sin(m.yaw), n = Math.hypot(m.sp, dz) || 1; F.vcs.push({ p: [(c[0] + h[0]) * .5, (c[1] + h[1]) * .5, (c[2] + h[2]) * .5], d: [cy0 * m.sp / n, sy0 * m.sp / n, dz / n], k: vk, R: 1.25 * hs, d0: d }); }
    const yw = m.yaw, cy = Math.cos(yw), sy = Math.sin(yw);
    if (alt < 26 && alt > .5 && d < 500 && R() < dt * 46 * (1 - alt / 26)) { const a = R() * 6.283, q = 1 + R() * 2; F.emit('dust', u.x + Math.cos(a) * q, u.y + Math.sin(a) * q, gz + .3, { vx: Math.cos(a) * 13, vy: Math.sin(a) * 13, vz: .6, life: .9, s0: .7, s1: 3.1, col: [150, 138, 116], a: .3, drag: 2 }); }
    if (Math.hypot(m.sp, m.vz || 0) > 84 && !m.sbT) { m.sbT = 1; const A = TK.fpsaudio; if (A) A.at('sboom', u.x, u.y, 2.2); for (let i = 0; i < 18; i++) { const a = i / 18 * 6.283, cq = Math.cos(a), sq = Math.sin(a); F.emit('dust', c[0] - sy * cq * 1.6, c[1] + cy * cq * 1.6, c[2] + sq * 1.6, { vx: -sy * cq * 13 - cy * 7, vy: cy * cq * 13 - sy * 7, vz: sq * 13, life: .55, s0: .6, s1: 2.5, col: [235, 235, 238], a: .3, drag: 3 }); } }
    else if (Math.hypot(m.sp, m.vz || 0) < 50) m.sbT = 0;
  }
  const JETL = { FGT: 7.8, CAS: 4.6, BMB: 15.4, UCAV: 3.4 };
  function launchFx(u, alt, gz, d, dt) {   // debu sapuan rotor di helipad, semburan mesin saat pesawat lepas landas
    if (d > 1500) return;
    if (u.lf) {
      const rk = u.rotK || 0; if (rk < .3 || alt > 20 || Math.random() > dt * 34 * rk) return;
      const a = Math.random() * 6.283, r = 5 + Math.random() * 3, sp = 8 + 5 * rk;
      F.emit('dust', u.x + Math.cos(a) * r, u.y + Math.sin(a) * r, gz + .25, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: .5 + Math.random(), life: .9 + Math.random() * .6, s0: 1, s1: 4, col: [150, 142, 118], a: .3 * (1 - alt / 24), drag: 1.6 });
      return;
    }
    const S = u.ts, L = JETL[u.type] || 6, c = Math.cos(u.hdg), s = Math.sin(u.hdg), z = gz + alt + (u.type === 'CAS' ? 1.3 : 0), tx = u.x - c * L, ty = u.y - s * L, pw = S.ph === 'roll' || S.ph === 'lift' ? 1 : S.ph === 'hold' ? .5 : .12;
    if (u.type === 'UCAV') return;
    if (S.ph === 'climb' && alt > 60) return;
    if (Math.random() < dt * 40 * pw) F.emit('fire', tx, ty, z, { vx: -c * 12, vy: -s * 12, vz: 0, life: .1 + Math.random() * .08, s0: u.type === 'BMB' ? 1.1 : .75, s1: .2, col: [255, 150, 70], a: .8 * pw });
    if (Math.random() < dt * 22 * pw) F.emit('smoke', tx - c * 3, ty - s * 3, Math.max(gz + .5, z - .4), { vx: -c * 7, vy: -s * 7, vz: .8, life: 1 + Math.random() * .8, s0: .8, s1: 4, col: [150, 146, 138], a: .22 * pw, drag: .8 });
  }
  function drawUnit(pp, u, dt, corpse, shadow) {
    const T = UT[u.type]; if (!T) return;
    const alt = corpse ? 0 : F.altOf(u), gz = F.gzOf(u), chute = u.chute > 0 && !corpse, r = chute ? 6 : T.hb ? T.hb[0] * 1.5 : (HUMAN[u.type] ? 2 : T.struct ? 16 : (u.fly || u.jet) ? 16 : 8);
    if (!shadow && !visS(u.x, u.y, chute ? gz + (F.chuteVis ? F.chuteVis(u).z : 3 + u.chute * 18) + 2.5 : gz + alt + 1, r)) return;   // penerjun: uji layar di ketinggian sebenarnya (prajurit + kanopi)
    const d = Math.hypot(u.x - CAM.x, u.y - CAM.y); if (d > (shadow ? 400 : HUMAN[u.type] ? DV.hum : DV.veh)) return;
    if (!corpse && u.cloakT > Q.t && (TIME * 14 | 0) % 4) return;
    if (!corpse && u.vanish) return;   // CRAY: menghilang selama tebasan Judgement Cut End   // kamuflase adaptif Komandan Bayangan: hanya berkedip samar
    if (dt > 0 && !corpse) u._dF = frame;   // gerak unit ini sudah dihitung bingkai ini (kamera mini tidak menghitung dua kali)
    const burnt = (corpse || u.burnt) && !HUMAN[u.type], mesh = unitMesh(u, burnt, HUMAN[u.type] && (shadow || F.opts.mobile || d > 38 || corpse) ? 1 : 0), m = corpse ? null : mot(u, dt);   // u.burnt: bos sekarat (fps-bossdie) mulai hangus
    let B;
    if (HUMAN[u.type]) {
      const s = { x: u.x, y: u.y, z: gz, yaw: 0, mv: 0, run: false, ph: 0, aim: 0, dead: 0, sc: T.hs, sword: u.type === 'WARLORD' ? 1 : u.type === 'CLAY' ? 2 : 0, armK: u.type === 'WARLORD' ? 1.13 : u.type === 'CLAY' ? 1.06 : 1 };   // armK: lengan bos sesuai anatomi (ujung jari sampai pertengahan paha)
      if (u.die) { s.yaw = u.face; s.die = u.die; s.dk = u.dk; s.side = u.side; }   // bos prajurit: animasi tewas khusus (terhuyung, berlutut, tersungkur / roboh)
      else if (corpse) { s.yaw = u.face; s.dead = Math.min(1, (u.t || 1) / .7); s.side = (u.id || 1) % 2 ? 1 : -1; }
      else {
        const mv = m.sp > 1.1, recent = (u.revealT || -9) > Q.t - .5, lf = (u.revealT || -9) - 1.6;
        const want = recent ? u.face : mv ? u.hdg : u.face; m.yaw = wrap(m.yaw + wrap(want - m.yaw) * Math.min(1, dt * 8));
        const hs0 = T.hs || 1, gv = m.gvS = (m.gvS || 0) + (m.sp / hs0 - (m.gvS || 0)) * Math.min(1, dt * 7), hvy = u.type === 'WARLORD' ? .7 : u.type === 'CMDR' || u.type === 'CLAY' ? .3 : (u.kit === 'MG' || u.type === 'AT' || u.type === 'MORT') ? .15 : 0;
        m.ph += gv > .15 ? 6.283185 * MD.gaitHz(gv, hvy) * (1 + ((u.id * 37) % 9 - 4) * .008) * dt : wrap(MD.gaitPass(u.id) - m.ph) * Math.min(1, dt * 5);   // irama dari kecepatan; diam: kembali ke passing pose agar mulai jalan tidak melompat
        m.aim += ((recent || (!mv && u.stance === 'HOLD' && u.type !== 'WARLORD' && u.type !== 'CLAY') ? 1 : .15) - m.aim) * Math.min(1, dt * 5);
        Object.assign(s, { yaw: m.yaw, mv: clamp(gv / 1.3, 0, 1), run: gv > 3.3, rk: MD.gaitRun(gv), gv, hvy, two: u.kit === 'MG' || u.type === 'AT' || u.type === 'MORT' || u.type === 'CLAY', ph: m.ph, aim: m.aim, recoil: Math.max(0, 1 - (Q.t - lf) / .1), kneel: !mv && u.stance === 'HOLD' && u.id % 3 === 0 ? 1 : 0, look: Math.sin(TIME * .4 + u.id) * .3 * (1 - m.aim), long: u.kit === 'DMR' });
        if (F.chutePose && F.chutePose(u, s, TIME)) { if (u.chute > 0) { s.z = gz + F.chuteVis(u).z; s.mv = 0; s.aim = 0; s.kneel = 0; } }   // terjun bebas / tergantung di kanopi / berlutut setelah mendarat (fps-chute)
        else if (u.chute > 0) { s.z = gz + 3 + u.chute * 18; s.mv = 0; s.aim = 0; }
        if (u.az !== undefined) { s.z = u.az; s.mv = Math.max(s.mv, .6); }   // operator memanjat masuk kendaraan (fps-life)
      }
      if (u.type === 'CLAY' && !corpse) clayAir(u, s, m, alt, gz, dt);   // mengudara: badan condong mengikuti laju, kaki menjuntai
      if (u.cr && !corpse && !u.die) crayPose(u, s, m, dt);   // v2.12: katana (duel / tebasan / Judgement Cut End)
      if (u.type === 'WARLORD' && u.lz > .05 && !corpse && !u.die) { s.z += u.lz; s.legs = [-1.05, 1.85, .14]; s.mv = 0; s.aim = 0; s.kneel = 0; }   // Hantaman Bumi: melayang dengan lutut terlipat
      if (u.type === 'WARLORD' && !u.die && !corpse && !shadow && dt > 0) emberFx(u, s.yaw, gz, T.hs || 1, dt);   // bara dari cincin api & ujung jubah
      if (corpse && u.dz) s.z += u.dz;   // bangkai prajurit tenggelam ke tanah
      const rg = corpse && u._c && !u.die && !shadow ? ragOf(u._c, u, gz, d, dt) : null;
      B = rg ? MD.ragPose(rg, BONES, u.dz || 0) : u.die ? MD.humanDie(s, BONES) : MD.humanPose(s, BONES);
      if (u.cr && !corpse && !u.die && !shadow) { const q = 17 * 16; u._kt = [B[q + 12] + B[q] * 1.02, B[q + 13] + B[q + 1] * 1.02, B[q + 14] + B[q + 2] * 1.02]; u._ktT = F.P.time; }   // ujung katana (efek)
      if (u.type === 'CLAY' && !corpse && !u.die) { if (!shadow) { const q = 11 * 16; u._mz = [B[q + 12] + B[q] * 1.06, B[q + 13] + B[q + 1] * 1.06, B[q + 14] + B[q + 2] * 1.06]; u._mzT = F.P.time; } if (u.jpk > Q.t && !shadow && dt > 0) clayFx(u, s, m, B, gz, alt, dt, d); }
    } else {
      const kind = T.struct ? 'S' : u.type === 'UFO' ? 'U' : u.jet ? 'J' : (u.fly || T.tc === 'A') ? 'A' : T.dom === 'S' ? 'W' : 'G';
      let H0;
      if (corpse) H0 = X.chain(X.T(u.x, u.y, gz - .15 + (u.dz || 0)), X.rz(u.face || 0), X.ry(u.pp || 0), X.rx(u.rol !== undefined ? u.rol : .04));   // dz/pp/rol: bangkai bos (terbaring miring, hidung terbenam)
      else if (kind === 'W' && !u.pose) {
        const dy = wrap((u.hdg || 0) - m.yaw), k = Math.min(1, dt * 1.6); m.yaw = wrap(m.yaw + dy * k); if (dt > 0) m.yr = m.yr * .9 + dy * k / dt * .1;
        const sk = clamp(m.sp / (T.spd || 20), 0, 1), c = Math.cos(m.yaw), s = Math.sin(m.yaw);
        m.pit += (sk * .07 + Math.sin(TIME * 1.1 + u.id) * .015 - m.pit) * Math.min(1, dt * 2); m.rol += (clamp(m.yr * sk * .5, -.12, .12) + Math.sin(TIME * .8 + u.id) * .025 - m.rol) * Math.min(1, dt * 2);
        H0 = X.chain(X.T(u.x, u.y, Math.sin(TIME + u.id) * .15 - .2 + sk * .15), X.rz(m.yaw), X.ry(m.pit), X.rx(m.rol));
        if (sk > .15 && Math.random() < dt * 14) { const b = 6 * (T.sz || 1), l = (Math.random() - .5) * 3; F.emit('dust', u.x - c * b - s * l, u.y - s * b + c * l, F.WZ + .1, { vx: -c * 3 + (Math.random() - .5) * 2, vy: -s * 3 + (Math.random() - .5) * 2, vz: 1, life: 2, s0: 1, s1: 3.5, col: [228, 236, 240], a: .55 }); }   // buih buritan
      }
      else if (kind === 'S') H0 = X.T(u.x, u.y, gz);
      else { H0 = bodyFrame(u, m, dt, alt, kind); if (!shadow && (kind === 'A' || kind === 'J' || kind === 'U')) { u._rp = [m.yaw, m.pit, m.rol, H0.t[2]]; u._rpT = F.P.time; } }   // pose gambar → hitbox (fps.js) persis mengikuti model yang terlihat
      if (u.sq) H0 = X.cmp(H0, { c: [[1, 0, 0], [0, 1, 0], [0, 0, u.sq]], t: [0, 0, 0] });   // kantong gas balon udara kempis
      X.write(H0, BONES, 0); for (const b of [5, 6, 7]) X.write(H0, BONES, b * 16);   // tulang tambahan (pintu, roda, nasel) default ikut badan — tidak tertinggal dari unit sebelumnya
      const lf = (u.revealT || -9) - 1.6, rec = corpse ? 0 : Math.max(0, 1 - (Q.t - lf) / .3), ty = corpse ? .3 : wrap((u.face || 0) - (m ? m.yaw : u.hdg || 0));
      if (kind === 'G' || kind === 'S') {
        const VX = MD.VEHX[u.type] || MD.RIG[u.type];   // kendaraan operator / bos penyerbu / meriam & SMB markas: poros kubah & laras sendiri, elevasi laras u.gunE, hentakan u.rec
        const tp = VX ? [VX.tur, 0, 0] : u.type === 'IFV' ? [-.3, 0, 0] : u.type === 'JEEP' ? [-.75, 0, 0] : u.type === 'LEVI' ? [MD.LEVI.tur, 0, 0] : u.type === 'ULTIMA' ? [-.3, 0, 0] : u.type === 'ZEUS' ? [MD.ZEUS.tur, 0, 0] : [-.2, 0, 0], tur = X.chain(H0, X.T(...tp), X.rz(ty), X.T(-tp[0], 0, 0));
        X.write(u.type === 'MLRS' || u.type === 'REPAIR' || u.type === 'TITAN' ? H0 : tur, BONES, 16);
        const gp = VX ? VX.gp : [1.6, 0, u.type === 'ARTY' ? 2.5 : 2.15], el = u.gunE !== undefined ? u.gunE : u.type === 'ARTY' ? .5 : VX && VX.el || 0, rk = u.rec !== undefined ? u.rec : rec * .5;
        const gun = X.chain(tur, X.T(gp[0], gp[1], gp[2]), X.ry(el), X.T(-rk - gp[0], -gp[1], -gp[2]));
        X.write(gun, BONES, 32);
        if (u.type === 'TITAN') { const e = u.ere || 0, pv = MD.TITAN.pv; X.write(X.chain(H0, X.T(...pv), X.ry(e), X.T(-pv[0], -pv[1], -pv[2])), BONES, 32); }   // peluncur rudal menegak sebelum meluncur
        X.write(X.chain(H0, X.T(-.7, 0, 0), X.rz(TIME * 2), X.T(.7, 0, 0)), BONES, 64);
        doorBone(u, H0, tur);
        const WH = MD.WHEEL[u.type]; if (WH) { const st = corpse ? .2 : u.steer !== undefined ? u.steer : m ? m.steer || 0 : 0; for (const [b, x, y, z] of WH) X.write(X.chain(H0, X.T(x, y, z), X.rz(st), X.T(-x, -y, -z)), BONES, b * 16); }   // roda depan ikut berbelok
        if (u.type === 'SAM') X.write(X.chain(H0, X.T(-2.2, 0, 0), X.rz(TIME * 1.5), X.T(2.2, 0, 0)), BONES, 64);
      } else if (kind === 'A' || kind === 'U' || kind === 'J') {
        const ah = u.type === 'AH64' || u.type === 'ATK2', rph = u.rph !== undefined ? u.rph : TIME * 31;   // fase rotor: Apache operator berputar sesuai putaran mesin
        X.write(X.chain(H0, X.rz(kind === 'U' ? TIME * 1.2 : rph)), BONES, 48);
        const AM = u.type === 'AH64' ? MD.GHOST : MD.APACHE, pv = ah ? AM.tail : [-7.3, .3, 1.4];
        X.write(X.chain(H0, X.T(...pv), X.ry(rph * 1.3), X.T(-pv[0], -pv[1], -pv[2])), BONES, 64);
        if (ah) {
          const g = AM.gun, a = u.gunA || [0, 0]; X.write(X.chain(H0, X.T(...g), X.rz(a[0]), X.ry(a[1]), X.T(-g[0], -g[1], -g[2])), BONES, 32);   // turret meriam M230
          const rk = u.rotK !== undefined ? u.rotK : 1, k = 1 - .82 * Math.min(1, Math.max(0, (rk - .5) / .4));   // bilah memendek ke hub, piringan kabur mengambil alih
          X.write(X.chain(H0, X.rz(rph), { c: [[k, 0, 0], [0, k, 0], [0, 0, 1]], t: [0, 0, 0] }), BONES, 80);
        }
        doorBone(u, H0, H0);
        const GZ = MD.GEARZ[u.type]; if (GZ !== undefined) { const gk = Math.max(.02, u.gearK || 0); X.write(X.chain(H0, X.T(0, 0, GZ), { c: [[1, 0, 0], [0, 1, 0], [0, 0, gk]], t: [0, 0, 0] }, X.T(0, 0, -GZ)), BONES, 80); }   // roda pendarat
        if (!corpse && !shadow && dt > 0 && (u.lf || u.ts)) launchFx(u, alt, gz, d, dt);
        if (u.type === 'VTOL') {   // jet VTOL operator: nosel berputar ke bawah saat melayang (u.noz), roda terlipat saat terbang (u.gearK)
          const V = MD.VEHX.VTOL, nz = V.noz, gk = Math.max(.02, u.gearK !== undefined ? u.gearK : 1);
          X.write(X.chain(H0, X.T(...nz), X.ry(u.noz || 0), X.T(-nz[0], -nz[1], -nz[2])), BONES, 32);
          X.write(X.chain(H0, X.T(0, 0, V.gz), { c: [[1, 0, 0], [0, 1, 0], [0, 0, gk]], t: [0, 0, 0] }, X.T(0, 0, -V.gz)), BONES, 80);
        }
        if (u.type === 'KRAKEN') { const rr = MD.KRAKEN.rot; for (const [b, x, sg] of [[48, rr, 1], [64, -rr, -1]]) X.write(X.chain(H0, X.T(x, 0, 0), X.rz((b === 64 && u.rph2 !== undefined ? u.rph2 : rph) * sg), X.T(-x, 0, 0)), BONES, b); }   // rotor tandem berlawanan arah (rph2: rotor belakang yang mati saat jatuh)
        if (u.type === 'WYVERN') {   // nasel miring ke depan saat melaju (mode pesawat), tegak saat melayang; rotor ikut nasel
          const W0 = MD.WYV, tl = m ? (m.tilt = (m.tilt || 0) + (clamp(m.sp / (T.spd || 24), 0, 1) * 1.1 - (m.tilt || 0)) * Math.min(1, dt * 1.2)) : .3;
          for (const [b, nb, y, sg] of [[48, 80, W0.ry, 1], [64, 96, -W0.ry, -1]]) { const N = X.chain(H0, X.T(W0.rx, y, W0.pz), X.ry(-tl), X.T(-W0.rx, -y, -W0.pz)); X.write(N, BONES, nb); X.write(X.chain(N, X.T(W0.rx, y, 0), X.rz((b === 64 && u.rph2 !== undefined ? u.rph2 : rph) * sg), X.T(-W0.rx, -y, 0)), BONES, b); }
        }   // dua rotor ujung sayap berlawanan arah (rph2: rotor kanan mati saat jatuh)
        if (u.type === 'UAV' || u.type === 'UCAV') { const k = u.type === 'UCAV' ? 1.5 : 1; X.write(X.chain(H0, X.T(-2.22 * k, 0, 0), X.rx(TIME * 50), X.T(2.22 * k, 0, 0)), BONES, 48); }
      }
      if (u.bo) for (const q of u.bo) { const o = q.o, M = X.chain(H0, X.T(q.p[0] + o[0], q.p[1] + o[1], q.p[2] + o[2]), X.rz(o[3]), X.ry(o[4]), X.rx(o[5]), X.T(-q.p[0], -q.p[1], -q.p[2])); for (const b of q.b) X.write(M, BONES, b * 16); }   // bagian terlepas: kubah terlempar, rel ZEUS, tiang radar
      if (m && kind === 'G') m.scroll = (m.dist * .9) % 1;
      if (m && !shadow && (u.type === 'HELI' || u.type === 'ATK2' || u.type === 'MEDHELI' || u.type === 'AH64' || u.type === 'KRAKEN' || u.type === 'WYVERN')) { m.B = BONES.slice(0, 128); m.rf = frame; m.mesh = mesh; m.rk = u.rotK !== undefined ? u.rotK : 1; }
      B = BONES;
    }
    gl.uniformMatrix4fv(pp.u.uBones, false, B);
    if (!shadow) { gl.uniform4f(pp.u.uFx, !corpse && !u.ctl && u.hitT > Q.t - .11 ? 1 : 0, burnt ? 1 : 0, m && m.scroll || 0, 0); if (pp.u.uHot) gl.uniform1f(pp.u.uHot, corpse ? .12 : HUMAN[u.type] ? 1 : T.struct ? .08 : .5); }   // termal: prajurit paling panas, mesin hangat
    gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_INT, 0);
    if (u.chute > 0 && !corpse && !RES.ram) { const c = X.chain(X.T(u.x, u.y, gz + 3 + u.chute * 18 + 1.6), X.rz(TIME * .3)); X.write(c, BONES, 0); gl.uniformMatrix4fv(pp.u.uBones, false, BONES); gl.bindVertexArray(RES.chute.vao); gl.drawElements(gl.TRIANGLES, RES.chute.n, gl.UNSIGNED_INT, 0); X.write(ID, BONES, 0); }
  }

  /* ---------------- TUBUH OPERATOR SENDIRI (orang pertama) ----------------
     badan & kaki terlihat saat menunduk, jongkok, berjalan, terjun bebas (rebah, lutut menekuk) dan tergantung di parasut (kaki menjuntai).
     Dada, kepala, lengan & senjata disembunyikan (lengan + senjata = viewmodel; dada tepat di bawah mata menutupi layar). Tidak ikut peta bayangan:
     dada yang tak terlihat akan menggelapkan kaki sendiri.  */
  const ZERO = { c: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], t: [0, 0, 0] }, EYE = 1.73;   // EYE: tinggi mata pose berdiri MD.humanPose
  function selfPose(shadow) {
    const P = F.P;
    if (F.selfBody === false || !P.alive || !P.unit || P.gs || P.mnt || P.veh || P.swim || P.down || P.menu || F.camHide) return null;
    const ch = P.chute, cr = ch ? 0 : clamp((1.7 - P.eye) / .58, 0, 1), t = P.time || 0;
    const s = { x: P.x, y: P.y, z: P.z, yaw: P.yaw, mv: ch ? 0 : clamp(P.spd / 1.3, 0, 1), run: !!P.sprint && P.spd > 4.5, rk: MD.gaitRun(P.spd || 0), gv: P.spd || 0, ph: P.bob * 1.4, aim: 1, dead: 0, cr };
    if (ch) {   // terjun: rebah tengkurap (berporos di mata) → kanopi terbuka = tegak tergantung dengan kaki menjuntai & berayun pelan
      const o = ch === 2 ? clamp(P.chO || 0, 0, 1) : 0, e = 1 - Math.pow(1 - o, 3);
      s.tilt = -1.35 * (1 - e); s.pv = [.1, 0, EYE];
      s.legs = [.3 * (1 - e) - .18 * e + Math.sin(t * 7) * .04 * (1 - e), 1.3 * (1 - e) + .32 * e, Math.sin(t * 1.3) * .1 * e + .05];
    }
    s.z = P.z + P.eye - (EYE - cr * .55);   // kepala model tepat di kamera
    if (P.landA && !ch) { const t = P.landA.t, L = F.LANDP; s.kneel = t < L.dip ? t / L.dip : t < L.up ? 1 : 1 - clamp((t - L.up) / L.rise, 0, 1); s.mv = 0; s.z = P.z; }   // mendarat: satu lutut di tanah
    else if (cr > 0) { const kl = cr * clamp(1 - (P.spd || 0) / 1.2, 0, 1); s.knl = kl; s.cr = cr - kl; s.gz = P.z - s.z; }   // jongkok diam = berlutut satu kaki (lutut kanan di tanah); bergerak = jalan jongkok
    const bk = .2, sd = .07; s.x += -Math.cos(P.yaw) * bk + Math.sin(P.yaw) * sd; s.y += -Math.sin(P.yaw) * bk - Math.cos(P.yaw) * sd;   // sd: badan sedikit ke kiri (kepala condong ke popor di bahu kanan)   // orang pertama: pinggul sedikit di belakang garis mata (seperti FPS umumnya) → saat menunduk terlihat lutut, kaki & sepatu, bukan atas pinggul
    return s;
  }
  G.selfPose = selfPose;   // uji
  function drawSelf(pp, shadow) {
    const s = selfPose(shadow); if (!s) return;
    const mesh = unitMesh(F.P.unit); MD.humanPose(s, BONES);
    if (!shadow) for (const b of [1, 2, 3, 4, 5, 6, 11]) X.write(ZERO, BONES, b * 16);   // orang pertama: pinggang ke bawah (dada terlalu dekat mata)
    gl.uniformMatrix4fv(pp.u.uBones, false, BONES);
    if (!shadow) { gl.uniform4f(pp.u.uFx, 0, 0, 0, 0); if (pp.u.uHot) gl.uniform1f(pp.u.uHot, 1); }
    gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_INT, 0);
    for (let i = 0; i < 12; i++) X.write(ID, BONES, i * 16);
  }

  /* ---------------- KOTAK DINAMIS (granat, roket, bom, penanda) ---------------- */
  function drawCars(pp, shadow, cx, cy, R) {   // mobil sipil: mesh mobil kota (warna per mobil), hangus bila terkena ledakan
    if (!F.traffic || !F.traffic.length) return;
    RES.cars = RES.cars || [];
    for (const c of F.traffic) {
      if (Math.abs(c.x - cx) > R || Math.abs(c.y - cy) > R) continue;
      if (!shadow && !visS(c.x, c.y, c.z + 1, 3)) continue;
      const ci = c.dead ? 7 : Math.floor(c.c * 7), mesh = RES.cars[ci] || (RES.cars[ci] = meshGL(MD.carMesh(ci)));
      X.write(X.chain(X.T(c.x, c.y, c.z), X.rz(c.yaw), X.ry(c.pit || 0)), BONES, 0); gl.uniformMatrix4fv(pp.u.uBones, false, BONES);
      if (!shadow) { gl.uniform4f(pp.u.uFx, 0, c.dead ? 1 : 0, 0, 0); if (pp.u.uHot) gl.uniform1f(pp.u.uHot, c.dead ? .3 : .35); }
      gl.bindVertexArray(mesh.vao); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_INT, 0);
    }
    X.write(ID, BONES, 0); if (!shadow) gl.uniform4f(pp.u.uFx, 0, 0, 0, 0);
  }
  function drawBox(pp, x, y, z, hx, hy, hz, yaw, pitch, col) {
    const M = X.chain(X.T(x, y, z), X.rz(yaw), X.ry(pitch)); M.c[0] = M.c[0].map(v => v * hx); M.c[1] = M.c[1].map(v => v * hy); M.c[2] = M.c[2].map(v => v * hz);
    X.write(M, BONES, 0); gl.uniformMatrix4fv(pp.u.uBones, false, BONES); gl.uniform4f(pp.u.uTC, col[0] / 255, col[1] / 255, col[2] / 255, 2);
    gl.bindVertexArray(RES.box.vao); gl.drawElements(gl.TRIANGLES, RES.box.n, gl.UNSIGNED_INT, 0);
  }

  /* ---------------- PARTIKEL & GARIS ---------------- */
  const PB = new Float32Array(9 * 6000), LB = new Float32Array(7 * 6 * 3000);
  let pn = 0, ln = 0;
  const part = (x, y, z, s, c, a, glow) => { if (pn >= 6000) return; const j = pn * 9; PB[j] = x; PB[j + 1] = y; PB[j + 2] = z; PB[j + 3] = s; PB[j + 4] = c[0] / 255; PB[j + 5] = c[1] / 255; PB[j + 6] = c[2] / 255; PB[j + 7] = clamp(a, 0, 1); PB[j + 8] = glow ? 1 : 0; pn++; };
  function line(x0, y0, z0, x1, y1, z1, w, c, a) {
    if (ln >= 3000) return;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, ex = x0 - CAM.x, ey = y0 - CAM.y, ez = z0 - CAM.z;
    let sx = dy * ez - dz * ey, sy = dz * ex - dx * ez, sz = dx * ey - dy * ex; const l = Math.hypot(sx, sy, sz) || 1; sx *= w / l; sy *= w / l; sz *= w / l;
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, P4 = [[x0 - sx, y0 - sy, z0 - sz], [x0 + sx, y0 + sy, z0 + sz], [x1 + sx, y1 + sy, z1 + sz], [x1 - sx, y1 - sy, z1 - sz]];
    let o = ln * 42; for (const i of [0, 1, 2, 0, 2, 3]) { const p = P4[i]; LB[o] = p[0]; LB[o + 1] = p[1]; LB[o + 2] = p[2]; LB[o + 3] = r; LB[o + 4] = g; LB[o + 5] = b; LB[o + 6] = a; o += 7; }
    ln++;
  }
  function ringG(x, y, r, col, a, w, n, zo) {   // cincin mengikuti permukaan tanah (zo: tinggi di atas tanah, bawaan .8 m)
    const h = zo === undefined ? .8 : zo; let px = x + r, py = y, pz = F.hAt(px, py) + h;
    for (let i = 1; i <= n; i++) { const t = i / n * 6.283, qx = x + Math.cos(t) * r, qy = y + Math.sin(t) * r, qz = F.hAt(qx, qy) + h; line(px, py, pz, qx, qy, qz, w, col, a); px = qx; py = qy; pz = qz; }
  }
  function laserFx(L) {   // SATELIT HELIOS: isi daya (sinar pemandu + cincin menyempit) → sinar 3 lapis + spiral energi + cincin kejut → SUPERNOVA
    const LS = F.LASER, gz = F.hAt(L.x, L.y), T = TIME, top = gz + 2600, WK = LS.r / 13;   // WK: tebal sinar mengikuti radius bakar
    if (L.ph === 'sat') {   // sinematik turun: selubung panas & jejak saat masih jauh, nyala roket pengereman ke arah jatuh, lampu & lensa setelah berhenti
      const Z = F.satPose(L), S = Z.S, a = Z.a, b = Z.burn, d = Math.hypot(S[0] - CAM.x, S[1] - CAM.y, S[2] - CAM.z), far = clamp(d * .014, 1, 42), cr = Math.cos(Z.roll), sr = Math.sin(Z.roll);
      if (b > .004) {
        part(S[0], S[1], S[2], far * 2.3, [255, 150, 70], Math.min(.85, b * 1.5), true); part(S[0], S[1], S[2], far, [255, 236, 200], Math.min(1, b * 2.4), true);
        const TL = 700 * Math.sqrt(b); line(S[0], S[1], S[2], S[0] - a[0] * TL, S[1] - a[1] * TL, S[2] - a[2] * TL, far * .34, [255, 150, 80], .32 * Math.min(1, b * 2)); line(S[0], S[1], S[2], S[0] - a[0] * TL * .55, S[1] - a[1] * TL * .55, S[2] - a[2] * TL * .55, far * .14, [255, 230, 190], .6 * Math.min(1, b * 2));
        const FL = 8 + 44 * Math.min(1, Math.sqrt(b) * 1.15), fk = .88 + .12 * Math.sin(T * 61);
        for (const [nx, ny] of [[3.3, 1.4], [-3.3, 1.4], [3.3, -1.4], [-3.3, -1.4]]) {
          const lx = nx * cr - ny * sr, ly = nx * sr + ny * cr, X0 = S[0] + Z.xL[0] * lx + Z.yL[0] * ly + a[0] * 1.5, Y0 = S[1] + Z.xL[1] * lx + Z.yL[1] * ly + a[1] * 1.5, Z0 = S[2] + Z.xL[2] * lx + Z.yL[2] * ly + a[2] * 1.5, g = Math.min(1, Math.sqrt(b) * 1.8);
          for (let i = 0; i < 9; i++) { const f = i / 8, q = FL * fk * f * f, w = 1 - f; part(X0 + a[0] * q, Y0 + a[1] * q, Z0 + a[2] * q, .9 + 3.4 * w * Math.sqrt(g) + f * 1.4, f < .4 ? [255, 236, 205] : [255, 150 - 70 * f, 60], (.2 + .55 * w) * g, true); }
        }
      }
      part(S[0] + a[0] * 10.4, S[1] + a[1] * 10.4, S[2] + a[2] * 10.4, 3.6 + 2.6 * Z.dep, [255, 150, 70], .35 + .55 * Z.dep, true);   // lensa emitor mengisi
      if ((T * 2.2 | 0) % 2) part(S[0] - a[0] * 6.9, S[1] - a[1] * 6.9, S[2] - a[2] * 6.9, 1.1, [255, 70, 55], .95, true);   // lampu navigasi
      part(L.cx, L.cy, F.hAt(L.cx, L.cy) + 1, 22, [255, 90, 50], .35 + .2 * Math.sin(T * 7), true); ringG(L.cx, L.cy, LS.nova.r * (.28 + .05 * Math.sin(T * 4)), [255, 110, 60], .75, 1.2, 32);   // titik yang dipilih menyala di tanah
    } else if (L.ph === 'charge') {
      const k = clamp(1 - L.ch / LS.charge, 0, 1), fl = (T * 24 | 0) % 2 ? 1 : .35;
      line(L.x, L.y, gz, L.x, L.y, top, .15 + k * .45, [255, 170, 110], (.15 + .55 * k) * fl);
      ringG(L.x, L.y, LS.r + 80 * (1 - k), [255, 110, 50], .45 + .45 * k, .55, 32);
      for (let i = 0; i < 3; i++) { const a = T * (2 + 4 * k) + i * 2.094, R0 = LS.r * 1.7 + 40 * (1 - k), z = gz + 1; line(L.x + Math.cos(a) * R0, L.y + Math.sin(a) * R0, z, L.x + Math.cos(a + .6) * R0, L.y + Math.sin(a + .6) * R0, z, .8, [255, 210, 130], .85); }
      part(L.x, L.y, gz + .6, 2 + k * 8, [255, 140, 60], .3 + k * .5, true);
    } else if (L.ph === 'fire') {
      const fl = .85 + .15 * Math.sin(T * 47), wd = 1 - .35 * L.foc;
      line(L.x, L.y, gz, L.x, L.y, top, 15 * WK * fl * wd, [255, 90, 30], .1);   // kabut panas di sekitar sinar
      line(L.x, L.y, gz, L.x, L.y, top, 7.5 * WK * fl * wd, [255, 60, 15], .25);
      line(L.x, L.y, gz, L.x, L.y, top, 3.4 * WK * fl * wd, [255, 130, 50], .65);
      line(L.x, L.y, gz, L.x, L.y, top, 1.5 * WK * wd, [255, 242, 225], 1);
      for (let h = 0; h < 2; h++) { let q0 = null; for (let i = 0; i <= 40; i++) { const a = T * 8 + i * .5 + h * 3.1416, R0 = (5 - 1.8 * L.foc) * WK * (1 + i * .02), q = [L.x + Math.cos(a) * R0, L.y + Math.sin(a) * R0, gz + i * 8]; if (q0) line(q0[0], q0[1], q0[2], q[0], q[1], q[2], .35, [255, 200, 120], .7 * (1 - i / 40)); q0 = q; } }
      part(L.x, L.y, gz + 1.2, 13 * WK * fl * wd, [255, 150, 70], .9, true); part(L.x, L.y, gz + 2.5, 26 * WK * wd, [255, 80, 25], .3, true);
      part(L.x, L.y, gz + .4, LS.r * 2.2 * wd, [255, 110, 40], .32 + .2 * L.foc, true); ringG(L.x, L.y, LS.r * .85 * wd, [255, 215, 140], .9, .9, 32);   // genangan tanah meleleh + tepi pijar
      part(L.x, L.y, top - 40, 90, [255, 225, 190], .45, true);   // titik satelit menyala di langit
      for (let k = 0; k < 6; k++) { const a = T * 3 + k * 1.047, h = ((T * 40 + k * 23) % 60), R0 = LS.r * (.6 + h / 90) * wd; part(L.x + Math.cos(a) * R0, L.y + Math.sin(a) * R0, gz + h, 1.4, [255, 190, 110], .9 * (1 - h / 60), true); }   // bara terangkat berputar
      for (const a of L.rings) ringG(L.x, L.y, LS.r * .6 + a * 110, [255, 160, 80], .75 * (1 - a / .9), .7, 32);
    } else {
      const k = 1 - L.nova / LS.nova.t, R = LS.nova.r;
      line(L.x, L.y, gz, L.x, L.y, top, 14 * WK * (1 - k) + 1, [255, 225, 190], (1 - k) * .7);
      part(L.x, L.y, gz + 5, R * (.4 + k * .9), [255, 205, 150], .95 * (1 - k), true);
      ringG(L.x, L.y, R * (.2 + k * 1.8), [255, 225, 170], 1 - k, 1.6, 40); ringG(L.x, L.y, R * (.1 + k * 1.2), [255, 120, 50], .85 * (1 - k), 1.1, 32);
    }
  }
  function collectFx() {
    pn = 0; ln = 0; const fwd = p => (p.x - CAM.x) * FWD[0] + (p.y - CAM.y) * FWD[1] + (p.z - CAM.z) * FWD[2];
    const list = F.fx3.filter(p => fwd(p) > .3);
    list.sort((a, b) => fwd(b) - fwd(a));
    const hot = CAM.therm ? [] : null;   // termal: api & kilat (panas) tetap tampak menembus asap yang dingin
    const FN = Math.min(700, FOGD * .5);
    const one = p0 => {
      let p = p0, k = p.t / p.life, s = p.s0 + (p.s1 - p.s0) * k;
      if (p.far) { const dx = p.x - CAM.x, dy = p.y - CAM.y, dz = p.z - CAM.z, d = Math.hypot(dx, dy, dz); if (d > FN) { const f = (FN + (d - FN) * .12) / d; p = { k: p.k, t: p.t, life: p.life, col: p.col, a: p.a, x: CAM.x + dx * f, y: CAM.y + dy * f, z: CAM.z + dz * f }; s *= f; } }   // erupsi: ditarik mendekati kamera (ukuran layar sama) agar menembus kabut jarak
      if (p.k === 'flash') part(p.x, p.y, p.z, s, p.col, (1 - k) * .95, true);
      else if (p.k === 'fire') part(p.x, p.y, p.z, s, p.col.map((v, i) => v * (1 - k * (i ? .6 : .2))), (1 - k * .8) * p.a, true);
      else if (p.k === 'spark') part(p.x, p.y, p.z, Math.max(.05, s), p.col, 1, true);
      else if (p.k === 'casing' || p.k === 'debris') part(p.x, p.y, p.z, Math.max(.06, s), p.col, 1, false);
      else part(p.x, p.y, p.z, s, p.col, p.a * (1 - k) * Math.min(1, k * 8 + .3), false);
    };
    for (const p of list) { if (hot && (p.k === 'flash' || p.k === 'fire' || p.k === 'spark')) hot.push(p); else one(p); }
    if (F.birdPts && !CAM.therm) F.birdPts(TIME, (x, y, z, yaw, fl) => {   // burung: dua sayap mengepak (garis), makin jauh makin tebal agar tetap tampak sebagai titik
      const d = Math.hypot(x - CAM.x, y - CAM.y, z - CAM.z); if (d > 700) return;
      const w = Math.max(.04, d * .0016), sx = -Math.sin(yaw) * .42, sy = Math.cos(yaw) * .42, up = fl * .2, c = [30, 28, 26];
      line(x, y, z, x + sx, y + sy, z + up, w, c, .95); line(x, y, z, x - sx, y - sy, z + up, w, c, .95);
    });
    if (F.hookRope) F.hookRope((x0, y0, z0, x1, y1, z1) => {   // tali kait (sedikit melengkung saat kait masih melayang) + kepala kait
      const H = P.hook, sag = H && H.ph === 'fly' ? .6 : .05, N = 8; let px = x0, py = y0, pz = z0;
      for (let i = 1; i <= N; i++) { const t = i / N, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t - Math.sin(t * Math.PI) * sag; line(px, py, pz, x, y, z, .018, [34, 32, 28], 1); px = x; py = y; pz = z; }
      part(x1, y1, z1, .22, [70, 72, 74], 1, false);
    });
    if (hot) hot.forEach(one);
    for (const p of Q.projs) {
      if (p.t < 0) continue;
      const s = p.src, sz = s ? F.zOf(s) + (HUMAN[s.type] ? 1.4 : 2) : 2, tz = p.tgt ? F.zOf(p.tgt) + (HUMAN[p.tgt.type] ? 1.2 : 1.5) : F.hAt(p.tx, p.ty) + 1;
      if (p.kind === 'bullet') {
        const k = clamp(p.t / p.dur, 0, 1), L = Math.hypot(p.tx - p.sx, p.ty - p.sy) || 1, ux = (p.tx - p.sx) / L, uy = (p.ty - p.sy) / L, z = sz + (tz - sz) * k, back = Math.min(p.beam ? 60 : 16, L * k);
        if (p.beam === 3 && !p._tr) { p._tr = 1; const MZ = s && s._mz && F.P.time - s._mzT < .25 ? s._mz : null; if (MZ) { F.emit('fire', MZ[0], MZ[1], MZ[2], { life: .13, s0: .7, s1: 1.9, col: [255, 90, 50], a: .55 }); F.emit('flash', MZ[0], MZ[1], MZ[2], { life: .05, s0: .3, s1: .8, col: [255, 225, 205] }); } F.tracers.push({ x0: MZ ? MZ[0] : p.sx, y0: MZ ? MZ[1] : p.sy, z0: MZ ? MZ[2] : sz, x1: p.tx, y1: p.ty, z1: tz, t: 0, life: .8, w: p.src && p.src.type === 'CLAY' ? .07 : .16, col: p.src && p.src.type === 'CLAY' ? [255, 70, 40] : [150, 215, 255], inst: true, tp: 1 }); const A = TK.fpsaudio; if (A && A.at && Math.hypot(p.sx - CAM.x, p.sy - CAM.y) < 900) A.at('rail', p.sx, p.sy, .7); }   // railgun CLAY: jejak ionisasi membekas + dentum rel
        const c = p.beam === 3 ? (p.src && p.src.type === 'CLAY' ? [255, 90, 60] : [200, 235, 255]) : p.beam === 2 ? [255, 60, 44] : p.beam ? [90, 255, 150] : p.big ? [255, 190, 90] : p.team === 'B' ? [170, 230, 255] : [255, 150, 80];
        line(p.x - ux * back, p.y - uy * back, z - (tz - sz) * back / L, p.x, p.y, z, p.beam === 2 && !p.big ? .12 : p.beam ? .35 : p.big ? .09 : .045, c, p.beam ? 1 : .9);
        if (p.beam) part(p.x, p.y, z, p.beam === 3 ? 1.4 : p.beam === 2 ? (p.big ? 1.8 : .7) : 1.6, p.beam === 3 ? (p.src && p.src.type === 'CLAY' ? [255, 80, 50] : [170, 225, 255]) : p.beam === 2 ? [255, 110, 80] : [120, 255, 170], .9, true);   // beam 2 = laser merah CLAY MARTIN
      } else if (p.kind === 'shell') part(p.x, p.y, F.hAt(p.x, p.y) + 20 + (p.h || 0) * 170, .8, [60, 56, 50], .9, false);
      else if (p.kind === 'missile') {
        const L = Math.hypot(p.tx - p.sx, p.ty - p.sy) || 1, k = clamp(Math.hypot(p.x - p.sx, p.y - p.sy) / L, 0, 1), z = sz + (tz - sz) * k;
        for (let i = 0; i < p.trail.length - 1; i++) { const a = p.trail[i], b = p.trail[i + 1], ka = clamp(Math.hypot(a[0] - p.sx, a[1] - p.sy) / L, 0, 1), kb = clamp(Math.hypot(b[0] - p.sx, b[1] - p.sy) / L, 0, 1); line(a[0], a[1], sz + (tz - sz) * ka, b[0], b[1], sz + (tz - sz) * kb, .35, [220, 220, 214], .35 * i / p.trail.length); }
        part(p.x, p.y, z, 1.2, [255, 190, 90], .95, true);
      }
    }
    for (const r of F.rkts || []) {   // roket bantuan mortir: ekor api terang + kepala menyala (asap dipancarkan fps.js)
      if (r.t < 0 || !r.b) continue;
      line(r.b[0], r.b[1], r.b[2], r.x, r.y, r.z, .7, [255, 214, 150], .95); part(r.x, r.y, r.z, 2.6, [255, 236, 190], 1, true);
    }
    if (P.gs && !P.gs.mode) for (const s of P.gs.shots) {   // peluru AC-130: inti terang + ekor menuju titik jatuh
      /* berangkat dari meriam di sisi kiri-bawah kamera SEKARANG (kamera = pesawat): dulu dari posisi lama pesawat, jadi peluru tampak menyamping, atau segaris kamera sehingga tak terlihat.
         Tebal mengikuti ukuran di layar agar sama jelas di semua perbesaran */
      const k = clamp(s.t / s.dur, 0, 1), mx = CAM.x - RGT[0] * 14 - UPV[0] * 9, my = CAM.y - RGT[1] * 14 - UPV[1] * 9, mz = CAM.z - RGT[2] * 14 - UPV[2] * 9, dx = s.x - mx, dy = s.y - my, dz = s.z - mz, L = Math.hypot(dx, dy, dz) || 1, d = L * k;
      if (d < 60) continue;
      const b = Math.min(d, s.w === 2 ? 60 : s.w === 1 ? 42 : 30) / L, x = mx + dx * k, y = my + dy * k, z = mz + dz * k, sz = d * 2 * Math.tan(CAM.fov / 2) * (s.w === 2 ? .011 : s.w === 1 ? .0075 : .0045);
      line(x - dx * b, y - dy * b, z - dz * b, x, y, z, sz * .13, [255, 220, 160], .8); part(x, y, z, sz * .75, [255, 235, 200], .95, true);
    }
    if (CAM.therm) for (const u of Q.units) {   // termal: pendar panas tiap unit hidup (minimal ±2 piksel) agar pasukan tetap tampak dari ketinggian
      if (u.dead || u.chute > 0 || u.struct) continue; const hb = F.hitbox(u), z = hb.z0 + hb.h * .55, d = Math.hypot(u.x - CAM.x, u.y - CAM.y, z - CAM.z);
      if (d > 3200 || !visS(u.x, u.y, z, 6)) continue; const hum = HUMAN[u.type], px = d * Math.tan(CAM.fov / 2) / (RHp / 2);
      part(u.x, u.y, z, Math.max(hum ? .5 : hb.r * .5, px * (hum ? 2.4 : 3.2)), [255, 255, 255], hum ? .55 : .4, true);
    }
    for (const t of F.tracers) { const a = (1 - t.t / t.life) * (t.a || 1), f = t.inst ? 1 : Math.min(1, t.t / t.life * 2.2 + .15); line(t.x0, t.y0, t.z0, t.x0 + (t.x1 - t.x0) * f, t.y0 + (t.y1 - t.y0) * f, t.z0 + (t.z1 - t.z0) * f, (t.w || .03) * (t.tp ? 1 - t.t / t.life : 1), t.col || [255, 236 * a + 20, 150 * a], t.col ? .9 * a : .9); }   // inst: jejak seketika (railgun) memudar
    const HB = F.hbeam; if (HB) {   // sinar laser Shadow Hunter: inti putih-merah + selubung pendar, titik panas di ujung (makin panas makin oranye)
      const fl = .85 + .15 * Math.sin(TIME * 60), hk = HB.k;
      line(HB.x0, HB.y0, HB.z0, HB.x1, HB.y1, HB.z1, 1.3 * fl, [255, 50 + 70 * hk, 40], .22); line(HB.x0, HB.y0, HB.z0, HB.x1, HB.y1, HB.z1, .32, [255, 60 + 60 * hk, 50], .9); line(HB.x0, HB.y0, HB.z0, HB.x1, HB.y1, HB.z1, .11, [255, 235, 225], 1);
      part(HB.x0, HB.y0, HB.z0, .7, [255, 120, 90], .8, true); if (HB.hit) { part(HB.x1, HB.y1, HB.z1 + .2, 2.4 * fl, [255, 150 + 60 * hk, 80], .9, true); part(HB.x1, HB.y1, HB.z1 + .2, 5, [255, 90, 40], .25, true); }
    }
    for (const r of F.rock) part(r.x - r.vx * .01, r.y - r.vy * .01, r.z, .7, [255, 180, 80], .9, true);
    for (const r of F.hm) if (r.k !== 'gl' && (r.k !== 'hf' || r.lit)) part(r.x - r.vx * .008, r.y - r.vy * .008, r.z - r.vz * .008, r.k === 'hy' ? .6 : 1.1, r.gd ? [255, 120, 110] : [255, 190, 90], .95, true);   // nyala motor roket Apache (Hellfire baru menyala setelah lepas rel)
    for (const r of F.vp || []) if (r.k !== 'bomb') part(r.x - r.vx * .008, r.y - r.vy * .008, r.z - r.vz * .008, r.k === 'gl' ? .35 : r.k === 'sh' ? .7 : .9, r.k === 'gl' ? [255, 160, 90] : [255, 190, 90], r.k === 'gl' ? .6 : .95, true);   // pelacak peluru / motor rudal kendaraan
    for (const l of F.vlines || []) line(l[0], l[1], l[2], l[3], l[4], l[5], l[6] || .04, l[7] || [40, 40, 38], l[8] || .9);   // tali sling heli angkut, tali parasut kargo
    for (const o of Q.objs) { const col = o.owner === 'B' ? [70, 210, 255] : o.owner === 'R' ? [255, 70, 70] : [235, 225, 130], gz = F.hAt(o.x, o.y); line(o.x, o.y, gz, o.x, o.y, gz + 90, .6, col, .18); part(o.x, o.y, gz + 11, 5, col, .25, true); }
    for (const m of F.marks) { const gz = F.hAt(m.x, m.y); line(m.x, m.y, gz, m.x, m.y, gz + 80, .35, m.cmd ? [60, 190, 255] : [255, 60, 60], .5); }
    for (const c of F.scorch) {   // jejak bakar laser: bara oranye yang mendingin menjadi tanah hangus
      const k = c.t / c.life, gz = F.hAt(c.x, c.y), heat = Math.max(0, 1 - k * 2.4);
      part(c.x, c.y, gz + .15, c.r, [24, 20, 17], (CAM.air ? .6 : .3) * (1 - k * k), false);
      if (heat > 0) part(c.x, c.y, gz + .3, c.r * (.35 + .25 * heat), [255, 110 + 90 * heat, 40 + 60 * heat], heat * .85, true);
    }
    for (const c of F.shock || []) { const k = c.t / c.life; ringG(c.x, c.y, c.fix ? c.R : c.lin ? c.R * k : c.R * (.15 + .85 * Math.sqrt(k)), c.col || [255, 225, 175], (c.fix ? .55 + .3 * Math.sin(TIME * 18) : c.lin ? .75 * (1 - k * k) : .85 * (1 - k)) * (c.al || 1), c.w || c.R * .03, c.R > 300 ? 96 : 36, c.zo); }   // cincin kejut 40/105 mm & gelombang pindai kemampuan (lin)
    for (const g of F.stun || []) { part(g.x, g.y, g.z, .3, [255, 250, 230], .5 + .5 * ((TIME * 14 | 0) % 2), true); }   // granat kejut: lampu berkedip
    const D = F.abDrone; if (D) { const bl = (TIME * 2.5 | 0) % 2; part(D.x, D.y, D.z + .2, bl ? 1.1 : .5, bl ? [255, 60, 50] : [80, 255, 120], .95, true); line(D.x, D.y, D.z, D.x, D.y, F.hAt(D.x, D.y), .25, [120, 255, 150], .12 + .1 * Math.sin(TIME * 5)); }   // drone intai: lampu navigasi + sinar pindai
    for (const u of Q.units) if (u.paintT > Q.t && !u.dead && u.team === 'R') { const gz = F.hAt(u.x, u.y), a = .35 + .25 * Math.sin(TIME * 6); line(u.x, u.y, gz, u.x, u.y, gz + 60, .45, [255, 50, 40], a); part(u.x, u.y, gz + 4.5, 1.4, [255, 60, 50], .8, true); }   // kendaraan dicat laser
    for (const a of F.arcs || []) { const k = 1 - a.t / a.life, col = a.col || [150, 220, 255]; for (let i = 0; i < a.p.length - 1; i++) { const p = a.p[i], q = a.p[i + 1]; line(p[0], p[1], p[2], q[0], q[1], q[2], a.w || .14, col, k); if (a.w) line(p[0], p[1], p[2], q[0], q[1], q[2], a.w * .3, [255, 240, 230], k); } part(a.p[0][0], a.p[0][1], a.p[0][2], 1.2, col, .8 * k, true); }   // busur listrik ZEUS / rambatan Railing Power (merah)
    for (const v of F.vcs || []) {   // kerucut uap Cray (v2.14): 6 cincin lonceng sepanjang sumbu laju, depan sempit & terang → belakang lebar & pudar, plus kabut tipis di tepinya
      const D = v.d, ax = Math.abs(D[2]) < .9 ? [0, 0, 1] : [1, 0, 0], u0 = [D[1] * ax[2] - D[2] * ax[1], D[2] * ax[0] - D[0] * ax[2], D[0] * ax[1] - D[1] * ax[0]], un = Math.hypot(u0[0], u0[1], u0[2]) || 1, U1 = [u0[0] / un, u0[1] / un, u0[2] / un], V1 = [D[1] * U1[2] - D[2] * U1[1], D[2] * U1[0] - D[0] * U1[2], D[0] * U1[1] - D[1] * U1[0]];
      const R = v.R, wq = Math.max(.016, v.d0 * .001), fl = .9 + .1 * Math.sin(TIME * 37), far = v.d0 > 900, NS = far ? 12 : 26, ph = TIME * 2.3, NR = far ? 4 : 7;
      for (let j = -1; j < NR; j++) {   // lonceng menyelubungi seluruh badan: tepi depan (j 0) tegas & terang di depan kepala, tudung kecil (j -1) membulatkan ujungnya, cincin ke belakang makin lebar & samar
        const sq = Math.max(0, j) / (NR - 1), off = j < 0 ? 1.2 * R : 1.0 * R - sq * 3.4 * R, r = j < 0 ? R * .3 : R * (.55 + .75 * Math.sqrt(sq)), al = (j < 0 ? .22 : j === 0 ? .6 : .09 * (1 - sq) + .02) * v.k * fl, cx = v.p[0] + D[0] * off, cy = v.p[1] + D[1] * off, cz = v.p[2] + D[2] * off;
        let px, py, pz;
        for (let i = 0; i <= NS; i++) { const t = i / NS * 6.2832 + ph * (j % 2 ? 1 : -1), rr = r * (1 + .035 * Math.sin(t * 3 + j)), qx = cx + (U1[0] * Math.cos(t) + V1[0] * Math.sin(t)) * rr, qy = cy + (U1[1] * Math.cos(t) + V1[1] * Math.sin(t)) * rr, qz = cz + (U1[2] * Math.cos(t) + V1[2] * Math.sin(t)) * rr; if (i) line(px, py, pz, qx, qy, qz, wq * (j === 0 ? 1.5 : .6), [244, 246, 250], al); px = qx; py = qy; pz = qz; if (j >= 0 && i % 2 === 0) part(qx, qy, qz, r * .62 + wq * 3, [238, 242, 248], (j === 0 ? .1 : .085 - .06 * sq) * v.k, false); }
      }
    }
    if (F.vcs) F.vcs.length = 0;
    for (const c of F.cuts || []) { if (c.t < 0) continue; const k = c.t / c.life, a = (c.full && !c.fade ? 1 : 1 - k * k) * (c.al || 1), g = c.full ? 1 : Math.min(1, c.t / .045), x1 = c.x0 + (c.x1 - c.x0) * g, y1 = c.y0 + (c.y1 - c.y0) * g, z1 = c.z0 + (c.z1 - c.z0) * g; line(c.x0, c.y0, c.z0, x1, y1, z1, c.w * 1.6, [255, 40, 26], .45 * a); line(c.x0, c.y0, c.z0, x1, y1, z1, c.w * .22, [255, 246, 240], a); }   // tebasan katana Cray (JCE / tebasan darat): inti putih + pendar merah
    if (P.laser) laserFx(P.laser);
    if (Q.nuke) { const n = Q.nuke, gz = F.hAt(n.x, n.y); for (let i = 0; i < 24; i++) { const a0 = i / 24 * 6.283, a1 = (i + 1) / 24 * 6.283; line(n.x + Math.cos(a0) * n.r, n.y + Math.sin(a0) * n.r, F.hAt(n.x + Math.cos(a0) * n.r, n.y + Math.sin(a0) * n.r) + 2, n.x + Math.cos(a1) * n.r, n.y + Math.sin(a1) * n.r, F.hAt(n.x + Math.cos(a1) * n.r, n.y + Math.sin(a1) * n.r) + 2, 1.5, [255, 50, 30], .6); } line(n.x, n.y, gz, n.x, n.y, gz + 400, 3, [255, 220, 60], .4); }
    for (const n of Q.strk || []) { const gz = F.hAt(n.x, n.y), bl = (TIME * 4 | 0) % 2; for (let i = 0; i < 20; i++) { const a0 = i / 20 * 6.283, a1 = (i + 1) / 20 * 6.283; line(n.x + Math.cos(a0) * n.r, n.y + Math.sin(a0) * n.r, F.hAt(n.x + Math.cos(a0) * n.r, n.y + Math.sin(a0) * n.r) + 1.5, n.x + Math.cos(a1) * n.r, n.y + Math.sin(a1) * n.r, F.hAt(n.x + Math.cos(a1) * n.r, n.y + Math.sin(a1) * n.r) + 1.5, 1.2, [255, 40, 30], bl ? .8 : .45); } line(n.x, n.y, gz, n.x, n.y, gz + 250, 2.5, [255, 60, 40], .45); }   // zona jatuh rudal TITAN
  }
  function drawFx(U) {
    gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (pn) { common(PR.par, U); gl.uniform3fv(PR.par.u.uR, RGT); gl.uniform3fv(PR.par.u.uU, UPV); gl.bindVertexArray(RES.par); gl.bindBuffer(gl.ARRAY_BUFFER, RES.parB); gl.bufferData(gl.ARRAY_BUFFER, PB.subarray(0, pn * 9), gl.STREAM_DRAW); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, pn); }
    if (ln) { gl.useProgram(PR.lin.p); gl.uniformMatrix4fv(PR.lin.u.uVP, false, VP); gl.uniform1f(PR.lin.u.uNvg, U.nvg); gl.bindVertexArray(RES.lin); gl.bindBuffer(gl.ARRAY_BUFFER, RES.linB); gl.bufferData(gl.ARRAY_BUFFER, LB.subarray(0, ln * 42), gl.STREAM_DRAW); gl.drawArrays(gl.TRIANGLES, 0, ln * 6); }
    gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND);
  }

  /* ---------------- RENDER UTAMA ---------------- */
  // profil per kualitas: skala resolusi, batas dpr, peta bayangan, shader hemat, jarak pohon/prajurit/kendaraan
  const PROF = [
    { sc: .6, dpr: 1, sh: 0, shq: 0, lo: 1, tree: 450, hum: 320, veh: 1000, nh: 90 },
    { sc: .8, dpr: 1.25, sh: 1024, shq: 0, lo: 0, tree: 520, hum: 450, veh: 1400, nh: 140 },
    { sc: 1, dpr: 1.5, sh: 2048, shq: 1, lo: 0, tree: 700, hum: 600, veh: 1700, nh: 200 }];
  const PROFM = { sc: .68, dpr: 1, sh: 0, shq: 0, lo: 1, tree: 300, hum: 220, veh: 800, nh: 45 };   // HP/tablet (F.opts.mobile) di kualitas RENDAH: layar kecil, jarak pandang & jumlah prajurit dipangkas
  // PC (mouse/keyboard): resolusi asli layar; bayangan diperbarui selang-seling (shN) — dulu RENDAH = 60% resolusi lalu turun sampai 36% → kabur di layar laptop
  const PROFD = [
    { sc: .85, dpr: 1, sh: 0, shq: 0, lo: 1, tree: 450, hum: 320, veh: 1000, nh: 90 },
    { sc: 1, dpr: 1, sh: 1536, shq: 0, shN: 2, lo: 0, tree: 520, hum: 450, veh: 1400, nh: 120 },
    { sc: 1, dpr: 1.5, sh: 2048, shq: 1, shN: 1, lo: 0, tree: 700, hum: 600, veh: 1700, nh: 200 }];
  const PROFS = { sc: .5, dpr: 1, sh: 0, shq: 0, lo: 1, tree: 220, hum: 160, veh: 700, nh: 30 };   // PC tanpa akselerasi GPU (WARP/SwiftShader): dirender CPU, hanya agar masih bisa dimainkan
  G.PROFD = PROFD; G.dbg = {}; G.motOf = id => motion.get(id);
  G.dy = 1; G.ft = 1 / 60; let lastT = 0, dyT = 0;
  function dynRes() {   // resolusi dinamis: turun bila frame > 24 ms, naik pelan bila < 17,5 ms
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()), ft = lastT ? Math.min(.25, (now - lastT) / 1000) : 1 / 60; lastT = now;
    if (ft > .2) return;   // jeda/tab tersembunyi: abaikan
    G.ft = G.ft * .9 + ft * .1; dyT += ft;
    if (dyT < .5) return; dyT = 0;
    const tg = F.opts.cap || 60;   // batas FPS (edisi offline di HP: 30) — ambang relatif terhadap target
    G.dyMin = F.opts.mobile ? .6 : G.sw ? .7 : .75;   // PC: jangan pernah di bawah 75% resolusi
    if (G.ft > 1.43 / tg && G.dy > G.dyMin) G.dy = Math.max(G.dyMin, +(G.dy - .05).toFixed(2));
    else if (G.ft < 1.05 / tg && G.dy < 1) G.dy = Math.min(1, +(G.dy + .05).toFixed(2));
  }
  function reset() {   // buang konteks lama (mis. ganti MSAA) lalu bangun ulang
    try { const x = gl && gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* ok */ }
    if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
    gl = null; cv = null; RES = null; G.ok = false; G.tried = false; warmI = 0;
  }
  G.render = function (ctx, CW, CH, dpr, dt) {
    if (G.disabled || F.useGL === false) return false;
    if (G.ok && G.aa !== (!G.sw && F.opts.quality >= 2)) reset();
    if (!G.tried) init();
    if (!G.ok || !F.world || !P.cam) return false;
    try { return renderInner(ctx, CW, CH, dpr, dt); } catch (e) { G.ok = false; G.err = String(e && e.message || e); if (window.console) console.warn('[fps-gl] dimatikan:', e); return false; }
  };
  const warmL = ['HELI', 'MEDHELI', 'ATK2', 'FGT', 'CAS', 'BMB', 'UAV', 'UCAV', 'TANK', 'LTANK', 'IFV', 'ARTY', 'AA', 'ZSU', 'MLRS', 'REPAIR', 'JEEP', 'SHIP', 'GBOAT', 'CLAY', 'WARLORD', 'CMDR'];
  let warmI = 0;
  function warmMesh() {   // mesh bangkai & bos dibuat lebih awal: dulu dibuat saat unit pertama hancur = patah di tengah pertempuran
    if (warmI >= warmL.length || !RES || !RES.units) return; const t = warmL[warmI++], T = UT[t]; if (!T) return;
    if (HUMAN[t]) { unitMesh({ type: t, team: 'R' }, false, 0); unitMesh({ type: t, team: 'R' }, false, 1); } else unitMesh({ type: t, team: 'R' }, true, 0);
  }
  /* kamera mini Clay Martin (fps-claycam): adegan kedua di persegi kecil pada kanvas dunia, hanya beberapa detik saat ditampilkan.
     Tanpa bayangan matahari (petanya mengikuti kamera utama), hanya unit di sekitar Clay. */
  function pipPass(U, units, w, h, CW, dt) {
    const C = F.clayCam; if (!C || !C.vis || !C.cam || !C.rect || !C.u || C.u.dead || G.sw) return;
    const sx = w / CW, pw = Math.round(C.rect[2] * sx), ph = Math.round(C.rect[3] * sx), px = Math.round(C.rect[0] * sx), py = h - Math.round((C.rect[1] + C.rect[3]) * sx), c = C.u;
    if (pw < 40 || ph < 30) return;
    const dv0 = DV.hum, dv1 = DV.veh, world = WR, UP = Object.assign({}, U, { shOn: 0, nvg: C.cam.therm ? 2 : 0, fogD: Math.max(U.fogD, C.cam.fogD || 0) }), fog0 = FOGD;
    setupCam(C.cam, pw, ph); RWp = pw; RHp = ph; DV.hum = DV.veh = 3600; FOGD = UP.fogD;
    gl.enable(gl.SCISSOR_TEST); gl.scissor(px, py, pw, ph); gl.viewport(px, py, pw, ph);
    gl.clearColor(U.fog[0], U.fog[1], U.fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); common(PR.sky, UP); gl.uniformMatrix4fv(PR.sky.u.uIVP, false, IVP); gl.bindVertexArray(RES.sky); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    common(PR.ter, UP); terrain(PR.ter, UP, false);
    const op = PR.obj; common(op, UP); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, RES.leaf); gl.uniform1i(op.u.uLeaf, 3);
    for (let i = 0; i < 24; i++) X.write(ID, BONES, i * 16);
    gl.uniform1f(op.u.uInst, 0); gl.uniform4f(op.u.uTC, 1, 1, 1, 0); gl.uniform4f(op.u.uFx, 0, 0, 0, 0); gl.uniformMatrix4fv(op.u.uBones, false, BONES); gl.uniform1f(op.u.uHot, 0);
    for (const q of world.cities) { const m = q.m; if (!visS(m.c[0], m.c[1], m.c[2], m.r)) continue; gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0); }
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE); drawTrees(op, treeBuckets(240)); gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    let seen = false;
    for (const u of units) if (u === c || (Math.abs(u.x - c.x) < 110 && Math.abs(u.y - c.y) < 110)) { if (u === c) seen = true; drawUnit(op, u, u._dF === frame ? 0 : dt, false, false); }
    if (!seen) drawUnit(op, c, c._dF === frame ? 0 : dt, false, false);
    for (let i = 0; i < 24; i++) X.write(ID, BONES, i * 16);
    gl.uniform4f(op.u.uFx, 0, 0, 0, 0); gl.uniform1f(op.u.uHot, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    common(PR.wat, UP); gl.uniform1f(PR.wat.u.uWZ, F.WZ); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, world.hT); gl.uniform1i(PR.wat.u.uH, 0); gl.uniform2f(PR.wat.u.uTex, F.NX, F.NY); gl.uniform1f(PR.wat.u.uTX, F.TX);
    gl.bindVertexArray(RES.water.vao); gl.drawElements(gl.TRIANGLES, RES.water.n, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true); gl.disable(gl.BLEND);
    collectFx(); drawFx(UP);
    gl.disable(gl.SCISSOR_TEST); DV.hum = dv0; DV.veh = dv1; FOGD = fog0;
    setupCam(P.cam, w, h); RWp = w; RHp = h; gl.viewport(0, 0, w, h);
  }
  function renderInner(ctx, CW, CH, dpr, dt) {
    frame++; TIME = P.time || 0; X.write(ID, BONES, 0); dynRes(); warmMesh();
    const q = clamp(F.opts.quality | 0, 0, 2), PF = G.sw ? PROFS : !F.opts.mobile ? PROFD[q] : q === 0 ? PROFM : PROF[q], sc = PF.sc * G.dy, w = Math.max(320, Math.round(CW * Math.min(dpr, PF.dpr) * sc)), h = Math.max(200, Math.round(CH * Math.min(dpr, PF.dpr) * sc));
    const air = P.cam.air, therm = !!P.cam.therm;   // kamera drone / AC-130 / Predator: unit jauh tetap digambar, tanpa bayangan saat termal
    DV.hum = air ? 2600 : PF.hum; DV.veh = air ? 3400 : PF.veh;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    RWp = w; RHp = h;
    const world = worldRes(F.world), tod = F.TOD[P.tod] || F.TOD.DAY, lt = LT[P.tod] || LT.DAY, night = tod.sun[1] < 0 ? 1 : 0;
    setupCam(P.cam, w, h);
    const az = tod.sun[0] * Math.PI / 180, el = (tod.sun[1] < 4 ? 40 : tod.sun[1]) * Math.PI / 180, L = new Float32Array([Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)]);
    const c255 = a => new Float32Array(a.map(v => v / 255));
    const U = { L, sunC: new Float32Array(lt.sun), sky: new Float32Array(lt.sky), gnd: new Float32Array(lt.gnd), fog: c255(tod.fog), fogD: tod.dist, s0: c255(tod.sky[0]), s1: c255(tod.sky[1]), s2: c255(tod.fog), time: TIME, night, nvg: therm ? 2 : F.R.nvg ? 1 : 0, shOn: 0, shM: new Float32Array(16), lo: PF.lo, shq: PF.shq };
    if (air) U.fogD = Math.max(U.fogD, P.cam.fogD || (therm ? 4200 : 1800));
    FOGD = U.fogD;
    if (U.nvg === 1 && night) { U.sunC = U.sunC.map(v => v * 2.2); U.sky = U.sky.map(v => v * 2.2); U.gnd = U.gnd.map(v => v * 2.2); }
    if (!RES.dummy) { RES.dummy = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, RES.dummy); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, 1, 1); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); RES.dummyShadow = () => RES.dummy; }
    // gerombolan ratusan prajurit (MUDAH): gambar hanya N terdekat; kendaraan/pesawat selalu digambar
    let units = Q.units.filter(u => !u.dead && !u.inV && (u !== P.unit || air) && u !== F.camHide);
    if (F.crowd && F.crowd.length && !therm) units = units.concat(F.crowd.filter(u => !u.hide && Math.hypot(u.x - CAM.x, u.y - CAM.y) > 2.5));   // prajurit kosmetik markas (fps-life)   // inV: penumpang di dalam kendaraan   // camHide: Apache operator saat kamera kokpit; dari udara tubuh operator ikut tampak
    const hum = units.filter(u => HUMAN[u.type]);
    if (hum.length > PF.nh) {
      const cx = air ? air[0] : CAM.x, cy = air ? air[1] : CAM.y; hum.forEach(u => { u._d = (u.x - cx) * (u.x - cx) + (u.y - cy) * (u.y - cy); }); hum.sort((a, b) => a._d - b._d);
      units = units.filter(u => !HUMAN[u.type]).concat(hum.slice(0, PF.nh));
    }
    let corpses = F.corpses;
    if (corpses.length > PF.nh >> 2) corpses = corpses.slice().sort((a, b) => Math.hypot(a.x - CAM.x, a.y - CAM.y) - Math.hypot(b.x - CAM.x, b.y - CAM.y)).slice(0, PF.nh >> 2);
    const range = air ? Math.min(1700, Math.hypot(air[0] - CAM.x, air[1] - CAM.y) + 500) : Math.min(PF.tree, tod.dist * .62);

    /* --- 1) peta bayangan matahari --- */
    shadowRes(night || therm ? 0 : PF.sh);
    if (RES.sh.size && RES.sh.M && PF.shN > 1 && frame % PF.shN) { U.shM = RES.sh.M; U.shOn = 1; }   // bingkai ini memakai peta bayangan bingkai lalu (matriksnya ikut, jadi tetap pas)
    else if (RES.sh.size) {
      const S2 = q >= 2 ? 130 : 105, cx = CAM.x + FWD[0] * S2 * .55, cy = CAM.y + FWD[1] * S2 * .55, cz = F.hAt(cx, cy);
      const lz = [L[0], L[1], L[2]], lx = MD.v.nrm(MD.v.crs([0, 0, 1], lz)), ly = MD.v.crs(lz, lx), tx = 2 * S2 / RES.sh.size;
      let ux = cx * lx[0] + cy * lx[1] + cz * lx[2], uy = cx * ly[0] + cy * ly[1] + cz * ly[2]; ux = Math.floor(ux / tx) * tx; uy = Math.floor(uy / tx) * tx;
      const uz = cx * lz[0] + cy * lz[1] + cz * lz[2], D = 700;
      const M = new Float32Array([lx[0] / S2, ly[0] / S2, -lz[0] / D, 0, lx[1] / S2, ly[1] / S2, -lz[1] / D, 0, lx[2] / S2, ly[2] / S2, -lz[2] / D, 0, -ux / S2, -uy / S2, uz / D, 1]);
      U.shM = M; RES.sh.M = M; U.shBox = [cx - S2 * 1.6, cy - S2 * 1.6, cx + S2 * 1.6, cy + S2 * 1.6];
      gl.bindFramebuffer(gl.FRAMEBUFFER, RES.sh.fbo); gl.viewport(0, 0, RES.sh.size, RES.sh.size); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 3);
      const SU = Object.assign({}, U, { vp: M, shOn: 0 });
      common(PR.ters, SU); terrain(PR.ters, SU, true);
      common(PR.objs, SU); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, RES.leaf); gl.uniform1i(PR.objs.u.uLeaf, 3);
      gl.uniformMatrix4fv(PR.objs.u.uBones, false, BONES); gl.uniform1f(PR.objs.u.uInst, 0);
      for (const c of world.cities) { gl.bindVertexArray(c.m.vao); gl.drawElements(gl.TRIANGLES, c.m.n, gl.UNSIGNED_INT, 0); }
      drawTrees(PR.objs, treeBuckets(S2 * 1.7, U.shBox));
      for (const u of units) if (Math.abs(u.x - cx) < S2 * 1.5 && Math.abs(u.y - cy) < S2 * 1.5) drawUnit(PR.objs, u, 0, false, true);
      drawCars(PR.objs, true, cx, cy, S2 * 1.5);
      for (let i = 0; i < 24; i++) X.write(ID, BONES, i * 16);
      gl.disable(gl.POLYGON_OFFSET_FILL); gl.bindFramebuffer(gl.FRAMEBUFFER, null); U.shOn = 1;
    }

    /* --- 2) adegan utama --- */
    gl.viewport(0, 0, w, h); gl.clearColor(U.fog[0], U.fog[1], U.fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); common(PR.sky, U); gl.uniformMatrix4fv(PR.sky.u.uIVP, false, IVP); gl.bindVertexArray(RES.sky); if (!G.dbg.noSky) gl.drawArrays(gl.TRIANGLES, 0, 3); gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    common(PR.ter, U); G.stat = { patches: G.dbg.noTer ? 0 : terrain(PR.ter, U, false) };
    const op = PR.obj; common(op, U); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, RES.leaf); gl.uniform1i(op.u.uLeaf, 3);
    gl.uniform1f(op.u.uInst, 0); gl.uniform4f(op.u.uTC, 1, 1, 1, 0); gl.uniform4f(op.u.uFx, 0, 0, 0, 0); gl.uniformMatrix4fv(op.u.uBones, false, BONES); gl.uniform1f(op.u.uHot, 0);
    if (!G.dbg.noCity) for (const c of world.cities) { const m = c.m; if (!visS(m.c[0], m.c[1], m.c[2], m.r)) continue; gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0); }
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE); if (!G.dbg.noTree) drawTrees(op, treeBuckets(range)); drawFallen(op, range); gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    if (!G.dbg.noUnit) for (const u of units) drawUnit(op, u, dt, false, false);
    if (!air) drawSelf(op, false);
    for (const c of corpses) drawUnit(op, Object.assign({ hdg: c.face, id: (c.x * 7 + c.y) | 0, _c: c }, c), dt, true, false);
    for (const d of F.dying || []) drawUnit(op, d.u, dt, false, false);   // bos sekarat (fps-bossdie)
    for (const a of F.vprops || []) drawUnit(op, a, dt, false, false);   // pesawat kargo / heli angkut pengantar kendaraan operator (fps-veh)
    for (const a of F.sprops || []) drawUnit(op, a, dt, false, false);   // meja senjata markas (fps-kit)
    drawCars(op, false, CAM.x, CAM.y, 650);   // lalu lintas sipil (fps-life)
    for (const c of (F.vchutes || []).concat(F.pchutes || [])) {   // parasut kargo kendaraan & parasut operator sendiri: kanopi prajurit diperbesar (k), mengembang (o) lalu kempis
      const k = c.k * c.o, M = X.chain(X.T(c.x, c.y, c.z), X.rz(c.yaw), X.rx(c.tilt || 0), { c: [[k, 0, 0], [0, k, 0], [0, 0, c.k * (c.sq !== undefined ? c.sq : 1)]], t: [0, 0, 0] });
      X.write(M, BONES, 0); gl.uniformMatrix4fv(op.u.uBones, false, BONES); gl.uniform4f(op.u.uFx, 0, 0, 0, 0); gl.bindVertexArray(RES.chute.vao); gl.drawElements(gl.TRIANGLES, RES.chute.n, gl.UNSIGNED_INT, 0);
    }
    if (RES.ram && F.canopies) for (const c of F.canopies) {   // parasut ram-air kain (fps-chute): 11 tulang dari simulasi rusuk
      if (Math.abs(c.h[0] - CAM.x) > 900 || Math.abs(c.h[1] - CAM.y) > 900 || !visS(c.h[0], c.h[1], c.h[2] + 4, 9)) continue;
      F.cnBones(c, X, BONES); gl.uniformMatrix4fv(op.u.uBones, false, BONES); gl.uniform4f(op.u.uFx, 0, 0, 0, 0); gl.bindVertexArray(RES.ram.vao); gl.drawElements(gl.TRIANGLES, RES.ram.n, gl.UNSIGNED_INT, 0);
    }
    if (RES.sat && P.laser && P.laser.ph === 'sat') {   // satelit HELIOS saat sinematik turun: sayap surya berporos di tepi badan, terbuka dari terlipat ke atas
      const Z = F.satPose(P.laser), base = X.chain(X.T(Z.S[0], Z.S[1], Z.S[2]), { c: [Z.xL, Z.yL, Z.zL], t: [0, 0, 0] }, X.rz(Z.roll)), fold = (1 - Z.dep) * 1.5708;
      X.write(base, BONES, 0); X.write(X.chain(base, X.T(0, 2.7, 1.2), X.rx(fold)), BONES, 16); X.write(X.chain(base, X.T(0, -2.7, 1.2), X.rx(-fold)), BONES, 32);
      gl.uniformMatrix4fv(op.u.uBones, false, BONES); gl.uniform4f(op.u.uTC, 1, 1, 1, 0); gl.uniform4f(op.u.uFx, 0, 0, 0, 0); gl.bindVertexArray(RES.sat.vao); gl.drawElements(gl.TRIANGLES, RES.sat.n, gl.UNSIGNED_INT, 0);
    }
    for (let i = 0; i < 12; i++) X.write(ID, BONES, i * 16);
    gl.uniform4f(op.u.uFx, 0, 0, 0, 0); gl.uniform1f(op.u.uHot, 0);
    // piringan rotor heli (transparan, setelah semua benda padat)
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.uniform1f(op.u.uPass, 1);
    for (const m of motion.values()) if (m.rf === frame && m.B && m.rk > .02) { BONES.set(m.B, 0); gl.uniformMatrix4fv(op.u.uBones, false, BONES); gl.uniform4f(op.u.uFx, 0, 0, 0, m.rk); gl.bindVertexArray(m.mesh.vao); gl.drawElements(gl.TRIANGLES, m.mesh.n, gl.UNSIGNED_INT, 0); }
    gl.uniform1f(op.u.uPass, 0); gl.depthMask(true); gl.disable(gl.BLEND); for (let i = 0; i < 24; i++) X.write(ID, BONES, i * 16);
    // bendera objektif
    for (const o of Q.objs) { const col = o.owner === 'B' ? [.2, .7, 1] : o.owner === 'R' ? [1, .2, .2] : [.92, .88, .5]; X.write(X.chain(X.T(o.x, o.y, F.hAt(o.x, o.y)), X.rz(TIME * .2)), BONES, 0); gl.uniformMatrix4fv(op.u.uBones, false, BONES); gl.uniform4f(op.u.uTC, col[0], col[1], col[2], 1); gl.bindVertexArray(RES.flag.vao); gl.drawElements(gl.TRIANGLES, RES.flag.n, gl.UNSIGNED_INT, 0); }
    for (const g2 of F.gren) drawBox(op, g2.x, g2.y, g2.z, .07, .07, .1, g2.t * 9, 0, [58, 72, 48]);
    for (const c of F.chunks || []) if (Math.abs(c.x - CAM.x) < 900 && Math.abs(c.y - CAM.y) < 900) drawBox(op, c.x, c.y, c.z, c.hx, c.hy, c.hz, c.yaw, c.pit, c.hot > c.t ? c.col.map(v => v * .6) : c.col);   // kepingan bos
    for (const d of F.drops || []) {   // paket VULTURE: kotak amunisi hijau zaitun + kotak obat putih bertanda merah, berputar pelan
      if (Math.abs(d.x - CAM.x) > 300 || Math.abs(d.y - CAM.y) > 300) continue;
      const z = F.hAt(d.x, d.y) + .16 + Math.sin(TIME * 3 + d.yaw) * .04, yw = d.yaw + TIME * .8, c = Math.cos(yw), sn = Math.sin(yw);
      drawBox(op, d.x - sn * .17, d.y + c * .17, z, .2, .11, .1, yw, 0, [84, 92, 60]); drawBox(op, d.x - sn * .17, d.y + c * .17, z + .105, .1, .03, .012, yw, 0, [40, 42, 34]);
      drawBox(op, d.x + sn * .15, d.y - c * .15, z - .02, .12, .1, .08, yw, 0, [236, 236, 230]); drawBox(op, d.x + sn * .15, d.y - c * .15, z + .062, .08, .022, .004, yw, 0, [220, 30, 30]); drawBox(op, d.x + sn * .15, d.y - c * .15, z + .062, .022, .08, .004, yw, 0, [220, 30, 30]);
    }
    for (const g2 of F.stun || []) drawBox(op, g2.x, g2.y, g2.z, .05, .05, .1, g2.t * 11, g2.t * 7, [70, 72, 76]);
    if (F.abDrone) { const D = F.abDrone; drawBox(op, D.x, D.y, D.z, .22, .22, .06, D.yaw, 0, [40, 42, 44]); drawBox(op, D.x, D.y, D.z + .04, .42, .04, .02, D.yaw + .785, 0, [30, 30, 32]); drawBox(op, D.x, D.y, D.z + .04, .42, .04, .02, D.yaw - .785, 0, [30, 30, 32]); }
    for (const r of F.rock) drawBox(op, r.x, r.y, r.z, .7, .08, .08, Math.atan2(r.vy, r.vx), Math.atan2(r.vz, Math.hypot(r.vx, r.vy)), [96, 100, 90]);
    for (const r of F.hm) { const hf = r.k === 'hf', st = r.k === 'st'; const gl2 = r.k === 'gl'; drawBox(op, r.x, r.y, r.z, gl2 ? .06 : hf ? .82 : .7, gl2 ? .022 : hf ? .09 : st ? .05 : .06, gl2 ? .022 : hf ? .09 : st ? .05 : .06, Math.atan2(r.vy, r.vx), Math.atan2(r.vz, Math.hypot(r.vx, r.vy)), hf ? [58, 62, 50] : st ? [196, 198, 188] : r.k === 'gl' ? [96, 104, 70] : r.w === 'FL' ? [150, 60, 50] : r.w === 'WP' ? [210, 210, 200] : r.gd ? [70, 90, 60] : [150, 150, 140]); }
    for (const r of F.vp || []) { const big = r.k === 'sh' || r.k === 'bomb', ms = r.k === 'tm' || r.k === 'agm' || r.k === 'aam'; drawBox(op, r.x, r.y, r.z, big ? (r.k === 'bomb' ? 1.3 : .5) : ms ? .8 : .12, big ? (r.k === 'bomb' ? .2 : .1) : ms ? .08 : .06, big ? (r.k === 'bomb' ? .2 : .1) : ms ? .08 : .06, Math.atan2(r.vy, r.vx), Math.atan2(r.vz, Math.hypot(r.vx, r.vy)), r.k === 'bomb' ? [64, 68, 58] : r.k === 'aam' ? [196, 198, 188] : ms ? [86, 94, 74] : [120, 110, 80]); }
    for (const p of Q.projs) if (p.kind === 'bomb' && p.t >= 0) { const k = clamp(p.t / p.dur, 0, 1); drawBox(op, p.x, p.y, F.hAt(p.x, p.y) + 150 * (1 - k * k), .9, .25, .25, Math.atan2(p.ty - p.y, p.tx - p.x), -.5 * k, [70, 70, 66]); }
    for (const b of (Q.fac ? Q.fac.bays : []).concat(Q.facB ? Q.facB.bays : [])) {   // pintu garasi (gulung ke atas) & hanggar (2 daun bergeser ke samping); juga hanggar markas kita (v3.0)
      if (Math.abs(b.x - CAM.x) > DV.veh || Math.abs(b.y - CAM.y) > DV.veh) continue;
      const gz = F.gAt(b.x, b.y), k = b.door, c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      if (!visS(b.x, b.y, gz + b.h / 2, b.w)) continue;
      if (b.k === 'gar') { if (k < .99) { const hz = b.h / 2 * (1 - k); drawBox(op, b.x + c * .02, b.y + s * .02, gz + b.h - hz, .07, b.w / 2, hz, b.yaw, 0, [92, 96, 88]); } }
      else { const hy = b.w / 4 * (1 - .84 * k), of = b.w / 2 - hy; for (const q of [-1, 1]) drawBox(op, b.x - s * q * of, b.y + c * q * of, gz + b.h / 2, .1, hy, b.h / 2, b.yaw, 0, [104, 110, 104]); }
    }
    X.write(ID, BONES, 0); gl.uniform4f(op.u.uTC, 1, 1, 1, 0);
    // air
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    common(PR.wat, U); gl.uniform1f(PR.wat.u.uWZ, F.WZ); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, world.hT); gl.uniform1i(PR.wat.u.uH, 0); gl.uniform2f(PR.wat.u.uTex, F.NX, F.NY); gl.uniform1f(PR.wat.u.uTX, F.TX);
    gl.bindVertexArray(RES.water.vao); gl.drawElements(gl.TRIANGLES, RES.water.n, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true); gl.disable(gl.BLEND);
    collectFx(); drawFx(U);
    pipPass(U, units, w, h, CW, dt);
    gl.bindVertexArray(null);
    if (frame % 120 === 0) for (const [id, m] of motion) if (frame - m.seen > 240) motion.delete(id);
    if (!F.opts.mobile && ctx.canvas && ctx.canvas.parentNode) {   // PC: kanvas dunia tampil langsung di bawah kanvas HUD (dulu disalin ke kanvas 2D tiap frame = beban & jeda GPU)
      if (!G.layered || cv.parentNode !== ctx.canvas.parentNode) { cv.id = 'fpsw'; cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none'; ctx.canvas.parentNode.insertBefore(cv, ctx.canvas); ctx.canvas.style.background = 'transparent'; G.layered = true; }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
    } else { ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(cv, 0, 0, CW, CH); ctx.restore(); }
    return true;
  }
  G.info = () => ({ ok: G.ok, err: G.err, w: cv && cv.width, h: cv && cv.height, aa: G.aa, dy: G.dy, stat: G.stat });
})();
