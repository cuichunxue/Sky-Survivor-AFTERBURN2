import * as THREE from './vendor/three.module.js';
import {clamp,damp,segmentDistance,islandHeight} from './flight.js';
import {SoundEngine} from './audio.js';
import {Particles,Shockwaves,glowTexture,cloudTexture} from './fx.js';

const $=id=>document.getElementById(id),V=THREE.Vector3;
const ui={};
for(const id of ['game','intro','hud','start','pause','pauseScreen','result','timer','progress','health','score','phase','alert','threat','toast','speed','altitude','energy','flareLabel','flare','boost','stick','knob','tutorial','damage','loadShade','powerReadout','bankReadout','horizon','radar','overlay','banner','countdown','combo','comboText','comboBar','callouts','lowAlt','sound','camera','audioOn','audioOff','introBest','rank','newRecord','resultTag','resultTitle','resultText','resultTime','resultScore','resultCombo','achievement','nextGoal','best','flash'])ui[id]=$(id);

// ---------- renderer / scene ----------
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:devicePixelRatio<2,powerPreference:'high-performance',alpha:false});}
catch(e){$('error').hidden=false;$('errorText').textContent='3D表示に対応したSafariまたはChromeで開いてください。';throw e;}
let pixelRatio=Math.min(devicePixelRatio,1.65);
renderer.setPixelRatio(pixelRatio);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x8faeb9,.000135);
const camera=new THREE.PerspectiveCamera(57,innerWidth/innerHeight,.3,16000);scene.add(camera);
const hemi=new THREE.HemisphereLight(0xcceeff,0x36464c,2.5);scene.add(hemi);
const sunLight=new THREE.DirectionalLight(0xffddb0,3.8);sunLight.position.set(1500,1900,-2200);scene.add(sunLight);
const ambientRim=new THREE.DirectionalLight(0x80bdf0,1.7);ambientRim.position.set(-500,150,700);scene.add(ambientRim);

// Sky and sea share a palette that drifts from afternoon gold to dusk as the mission advances.
const sunDir=new V(.53,.3,-.7).normalize();
const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
 uniforms:{sunDir:{value:sunDir},zenith:{value:new THREE.Color()},horizon:{value:new THREE.Color()},glow:{value:new THREE.Color()}},
 vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`varying vec3 vDir;uniform vec3 sunDir,zenith,horizon,glow;void main(){vec3 d=normalize(vDir);float h=max(d.y,0.);vec3 c=mix(horizon,zenith,pow(h,.45));c=mix(c,horizon*.85,clamp(-d.y*4.,0.,1.));float s=max(dot(d,sunDir),0.);c+=glow*pow(s,12.)*.5;c+=glow*pow(s,3.)*.14*(1.-h);c+=vec3(1.,.83,.56)*pow(s,900.);c+=vec3(1.5,1.15,.75)*smoothstep(.9994,.9997,s);gl_FragColor=vec4(c,1.);}`});
const sky=new THREE.Mesh(new THREE.SphereGeometry(14500,32,16),skyMat);scene.add(sky);
const waterMat=new THREE.ShaderMaterial({fog:false,
 uniforms:{time:{value:0},eye:{value:new V()},sunDir:{value:sunDir},fogColor:{value:new THREE.Color()},deep:{value:new THREE.Color()},shallow:{value:new THREE.Color()},sunCol:{value:new THREE.Color()}},
 vertexShader:`uniform float time;varying vec3 wp;void main(){vec4 w=modelMatrix*vec4(position,1.);w.y+=sin(w.x*.017+time*.8)*1.6+sin(w.z*.023+time*.65)*.9;wp=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:`varying vec3 wp;uniform float time;uniform vec3 eye,sunDir,fogColor,deep,shallow,sunCol;void main(){vec2 p=wp.xz;float n=sin(p.x*.055+time*1.3)*sin(p.y*.074-time)+sin(p.x*.11+p.y*.067+time)*.4;vec3 norm=normalize(vec3(cos(p.x*.055+time)*.08+sin(p.y*.21+time*1.7)*.03,1.,sin(p.y*.074-time)*.09+cos(p.x*.19-time*1.4)*.03));vec3 view=normalize(eye-wp);float fres=pow(1.-max(dot(norm,view),0.),3.);vec3 color=mix(deep,shallow,fres);vec3 r=reflect(-sunDir,norm);float sd=max(dot(r,view),0.);color+=sunCol*(pow(sd,140.)*.95+pow(sd,10.)*.1);color+=smoothstep(.96,1.35,n)*.045;float fog=1.-exp(-distance(eye,wp)*.00019);color=mix(color,fogColor,fog);gl_FragColor=vec4(color,1.);}`});
const ocean=new THREE.Mesh(new THREE.PlaneGeometry(26000,26000,90,90),waterMat);ocean.rotation.x=-Math.PI/2;scene.add(ocean);

const C=(r,g,b)=>new THREE.Color(r,g,b);
const PALETTE={
 day:{horizon:C(.66,.76,.80),zenith:C(.12,.32,.49),glow:C(.85,.48,.22),fog:C(.55,.67,.72),deep:C(.025,.16,.22),shallow:C(.34,.51,.59),sunCol:C(1,.67,.36),sun:new THREE.Color(0xffddb0),hemi:new THREE.Color(0xcceeff),cloud:C(.95,.97,.98),sunY:.3},
 dusk:{horizon:C(.98,.58,.40),zenith:C(.12,.14,.34),glow:C(1,.38,.16),fog:C(.78,.55,.47),deep:C(.03,.08,.14),shallow:C(.52,.42,.44),sunCol:C(1,.52,.26),sun:new THREE.Color(0xff9a5a),hemi:new THREE.Color(0xffc9a8),cloud:C(1,.74,.62),sunY:.09}};
const cloudMats=[];let duskApplied=-1;
function applyDusk(t){
 if(Math.abs(t-duskApplied)<.002)return;duskApplied=t;const a=PALETTE.day,b=PALETTE.dusk,u=skyMat.uniforms,w=waterMat.uniforms;
 u.horizon.value.copy(a.horizon).lerp(b.horizon,t);u.zenith.value.copy(a.zenith).lerp(b.zenith,t);u.glow.value.copy(a.glow).lerp(b.glow,t);
 w.fogColor.value.copy(a.fog).lerp(b.fog,t);w.deep.value.copy(a.deep).lerp(b.deep,t);w.shallow.value.copy(a.shallow).lerp(b.shallow,t);w.sunCol.value.copy(a.sunCol).lerp(b.sunCol,t);
 scene.fog.color.copy(w.fogColor.value).lerp(u.horizon.value,.35);
 sunDir.set(.53,a.sunY+(b.sunY-a.sunY)*t,-.7).normalize();sunLight.position.copy(sunDir).multiplyScalar(3000);
 sunLight.color.copy(a.sun).lerp(b.sun,t);sunLight.intensity=3.8-t*.7;hemi.color.copy(a.hemi).lerp(b.hemi,t);hemi.intensity=2.5-t*.6;
 for(const m of cloudMats)m.color.copy(a.cloud).lerp(b.cloud,t);
}

// ---------- aircraft ----------
const metal=new THREE.MeshStandardMaterial({color:0x718794,metalness:.72,roughness:.37,side:THREE.DoubleSide});
const upper=new THREE.MeshStandardMaterial({color:0x84949b,metalness:.6,roughness:.43,side:THREE.DoubleSide});
const dark=new THREE.MeshStandardMaterial({color:0x172c36,metalness:.65,roughness:.38});
const edge=new THREE.MeshStandardMaterial({color:0xa8b4ba,metalness:.72,roughness:.32});
const glass=new THREE.MeshStandardMaterial({color:0x102e40,metalness:.93,roughness:.14});
const black=new THREE.MeshStandardMaterial({color:0x060d12,roughness:.7});
const additive=(color,opacity)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});
const flameMat=additive(0x77bbff,.7),flameOuter=additive(0xff9b5c,.32);
const glowTex=glowTexture();
const sprite=(color,opacity,scale)=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));s.scale.setScalar(scale);return s;};
function mesh(geo,mat,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);parent.add(m);return m;}
function bodyGeo(sections){const arr=[],indices=[],n=28;sections.forEach(([z,rx,ry,cy],k)=>{for(let i=0;i<n;i++){const a=i/n*Math.PI*2;arr.push(Math.cos(a)*rx,cy+Math.sin(a)*ry,z);if(k){const a0=(k-1)*n+i,b0=(k-1)*n+(i+1)%n,c0=k*n+i,d0=k*n+(i+1)%n;indices.push(a0,b0,c0,b0,d0,c0);}}});const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));g.setIndex(indices);g.computeVertexNormals();return g;}
function wing(points,thickness,mat,parent){const a=[],idx=[];for(const side of [-1,1])for(const p of points)a.push(p[0],p[1]+side*thickness/2,p[2]);const n=points.length;for(let i=1;i<n-1;i++)idx.push(0,i+1,i,n,n+i,n+i+1);for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(i,j,n+i,j,n+j,n+i);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(a,3));g.setIndex(idx);g.computeVertexNormals();return mesh(g,mat,parent);}
function line(points,color,parent){const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new V(...p)));const l=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity:.65}));parent.add(l);return l;}
function createJet(){
 const jet=new THREE.Group();jet.userData.flames=[];jet.userData.glows=[];jet.userData.navs=[];
 mesh(bodyGeo([[-9,.015,.015,0],[-7.3,.43,.4,.03],[-5.2,.7,.6,.05],[-3,.98,.65,.06],[0,1.28,.55,0],[3,1.2,.5,0],[5.7,.83,.4,-.03],[6.2,.5,.27,-.05]]),metal,jet);
 mesh(bodyGeo([[-9,.014,.014,0],[-7.4,.42,.39,.03]]),dark,jet);
 const canopy=mesh(new THREE.SphereGeometry(1,32,20),glass,jet,0,.57,-4.4);canopy.scale.set(.63,.64,1.65);
 const seal=mesh(new THREE.TorusGeometry(.62,.045,6,32),dark,jet,0,.65,-3.1);seal.scale.set(1,.75,1);
 for(const sign of [-1,1]){
  const engine=mesh(new THREE.CylinderGeometry(.62,.73,7.4,24),metal,jet,sign*.92,-.25,2.3);engine.rotation.x=Math.PI/2;
  const intake=mesh(new THREE.BoxGeometry(.98,.78,1.3),dark,jet,sign*1.05,-.43,-2.1);intake.rotation.x=-.06;
  mesh(new THREE.PlaneGeometry(.75,.5),black,jet,sign*1.05,-.42,-2.765).rotation.y=Math.PI;
  wing([[sign*.8,.15,-3.5],[sign*1.7,.03,-1.8],[sign*6.5,-.12,2.15],[sign*6.7,-.12,3.25],[sign*2.1,.08,2.25],[sign*.8,.16,1.5]],.14,upper,jet);
  wing([[sign*1.05,.25,-4.9],[sign*1.75,.04,-1.9],[sign*1.25,.1,.6]],.09,metal,jet);
  wing([[sign*.9,.06,3.3],[sign*3.35,.02,5.1],[sign*3.4,.02,6.1],[sign*1.0,.05,5.6]],.12,upper,jet);
  wing([[sign*1,.45,2.45],[sign*1.55,3.2,4.2],[sign*1.75,3.2,5.25],[sign*1.28,.45,5.6]],.12,metal,jet);
  line([[sign*1.9,.15,1.45],[sign*5.7,-.015,2.8],[sign*6.6,-.015,2.94]],0x293f4c,jet);
  line([[sign*1.2,.49,3.7],[sign*1.6,2.9,4.8]],0xc2cbd0,jet);
  const pod=mesh(new THREE.CylinderGeometry(.11,.12,2.5,10),edge,jet,sign*6.4,-.08,2.4);pod.rotation.x=Math.PI/2;
  const nav=mesh(new THREE.SphereGeometry(.09,8,6),new THREE.MeshBasicMaterial({color:sign>0?0x83ffc7:0xff4230}),jet,sign*6.55,-.07,2.9);
  const navGlow=sprite(sign>0?0x83ffc7:0xff4230,.9,1.6);nav.add(navGlow);jet.userData.navs.push(navGlow);
  const nozzle=mesh(new THREE.CylinderGeometry(.57,.66,.85,24,1,true),dark,jet,sign*.92,-.25,6.05);nozzle.rotation.x=Math.PI/2;
  mesh(new THREE.TorusGeometry(.56,.045,7,28),edge,jet,sign*.92,-.25,6.46);
  mesh(new THREE.CircleGeometry(.5,20),new THREE.MeshBasicMaterial({color:0xffc690}),jet,sign*.92,-.25,6.42);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const petal=mesh(new THREE.BoxGeometry(.045,.14,.52),edge,jet,sign*.92+Math.cos(a)*.61,-.25+Math.sin(a)*.61,6.08);petal.rotation.z=a;}
  const f=new THREE.Group();f.position.set(sign*.92,-.25,6.45);const inner=mesh(new THREE.ConeGeometry(.44,3.1,16,1,true),flameMat,f,0,0,1.55);inner.rotation.x=Math.PI/2;const outer=mesh(new THREE.ConeGeometry(.57,4.5,16,1,true),flameOuter,f,0,0,2.25);outer.rotation.x=Math.PI/2;jet.add(f);jet.userData.flames.push(f);
  for(let i=0;i<4;i++){const diamond=mesh(new THREE.OctahedronGeometry(.32,0),additive(0xbfe9ff,.65),f,0,0,.7+i*.65);diamond.scale.set(.65,.65,1.8);}
  const glow=sprite(0xff9a50,.75,3.2);glow.position.set(sign*.92,-.25,6.9);jet.add(glow);jet.userData.glows.push(glow);
  line([[sign*.65,.48,-2.7],[sign*.77,.51,-.3],[sign*.67,.5,1.5]],0x324b5b,jet);
 }
 line([[0,.55,-7],[0,.69,-6]],0xb1bdc4,jet);
 const strobe=sprite(0xffffff,0,2.4);strobe.position.set(0,3.4,5.3);jet.add(strobe);jet.userData.strobe=strobe;
 return jet;
}
const jet=createJet();
// Hinged control surfaces respond to the pilot's input.
const controlSurfaces=[];
for(const sign of [-1,1]){const hinge=new THREE.Group();hinge.position.set(sign*4,0,2.25);jet.add(hinge);wing([[sign*-1.25,0,0],[sign*1.8,-.04,.5],[sign*1.8,-.04,.86],[sign*-1.25,0,.3]],.07,edge,hinge);controlSurfaces.push({hinge,sign});}
scene.add(jet);jet.position.set(0,320,0);

// Flight deck frame stays fixed to the camera, with the horizon visible through it.
const cockpit=new THREE.Group();camera.add(cockpit);cockpit.visible=false;
const cockpitMat=new THREE.MeshStandardMaterial({color:0x14212a,roughness:.65,metalness:.35});
mesh(new THREE.BoxGeometry(3.8,.62,.6),cockpitMat,cockpit,0,-1.38,-1.7).rotation.x=.22;
for(const sign of [-1,1]){mesh(new THREE.CylinderGeometry(.035,.06,3,10),cockpitMat,cockpit,sign*1.15,.13,-1.9).rotation.z=sign*-.18;mesh(new THREE.PlaneGeometry(.43,.29),new THREE.MeshBasicMaterial({color:0x0b493e}),cockpit,sign*.55,-1.08,-1.37);}
mesh(new THREE.TorusGeometry(1.18,.035,8,40,Math.PI),cockpitMat,cockpit,0,.3,-1.9);
const cockpitStick=new THREE.Group();cockpitStick.position.set(.18,-1.45,-1.15);cockpit.add(cockpitStick);mesh(new THREE.CylinderGeometry(.035,.05,.35,8),dark,cockpitStick,0,.16,0);mesh(new THREE.BoxGeometry(.12,.14,.09),black,cockpitStick,0,.37,0);
const instrumentBars=[];for(let i=0;i<6;i++)instrumentBars.push(mesh(new THREE.PlaneGeometry(.045,.15),new THREE.MeshBasicMaterial({color:i>3?0xffb86d:0x88ffe0}),cockpit,-.7+i*.065,-1.08,-1.359));

// Speed streaks live in camera space.
const STREAKS=48,streakPositions=new Float32Array(STREAKS*6),streakSeeds=Array.from({length:STREAKS},(_,i)=>({a:i*2.39996,r:7+(i%7)*1.4,z:-10-(i*17%110)}));
const streakGeometry=new THREE.BufferGeometry();streakGeometry.setAttribute('position',new THREE.BufferAttribute(streakPositions,3));
const streaks=new THREE.LineSegments(streakGeometry,new THREE.LineBasicMaterial({color:0xd1edff,transparent:true,opacity:0,depthWrite:false}));streaks.frustumCulled=false;camera.add(streaks);

// ---------- world ----------
let seed=704;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const ISLANDS=22,ISLAND_GAP=480,islands=[];
for(let k=0;k<ISLANDS;k++){
 const island={x:(k%2?-1:1)*(430+random()*1900),z:-k*ISLAND_GAP+600,radius:180+random()*420,height:80+random()*240};
 const g=new THREE.PlaneGeometry(island.radius*2,island.radius*2,28,28);g.rotateX(-Math.PI/2);const pos=g.attributes.position,colors=[];
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),h=islandHeight(x+island.x,z+island.z,island);pos.setY(i,h);const c=new THREE.Color(h<3?0xb5a486:h<30?0x5f7770:h<130?0x405d5e:0x5d6d73);c.multiplyScalar(.9+random()*.19);colors.push(c.r,c.g,c.b);}
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();island.mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.98}));island.mesh.position.set(island.x,0,island.z);scene.add(island.mesh);islands.push(island);
}
// Billboard cumulus: soft sprites instead of hard ellipsoids.
const clouds=[];
for(let i=0;i<3;i++){const m=new THREE.SpriteMaterial({map:cloudTexture(random),transparent:true,depthWrite:false,opacity:.9});cloudMats.push(m);}
for(let i=0;i<26;i++){const group=new THREE.Group(),puffs=5+Math.floor(random()*4);for(let j=0;j<puffs;j++){const s=new THREE.Sprite(cloudMats[(i+j)%3]);const w=260+random()*260;s.scale.set(w,w*(.45+random()*.2),1);s.position.set((j-puffs/2)*85+random()*40,random()*45,random()*120);group.add(s);}group.position.set((random()-.5)*9000,700+random()*900,-random()*12000);scene.add(group);clouds.push(group);}

// Rings: a bright core plus an additive halo. Every fourth gate is gold.
const RINGS=9,RING_GAP=870,rings=[];
const ringMat=new THREE.MeshBasicMaterial({color:0x83efe4,transparent:true,opacity:.75}),ringHalo=additive(0x5fe6ff,.22);
const goldMat=new THREE.MeshBasicMaterial({color:0xffd36b,transparent:true,opacity:.85}),goldHalo=additive(0xffb347,.3);
const ringGeo=new THREE.TorusGeometry(39,.65,6,64),haloGeo=new THREE.TorusGeometry(39,2.6,8,64),tabGeo=new THREE.BoxGeometry(1.8,7,1);
let ringSerial=0;
function placeRing(r,z){r.position.z=z;r.position.x=Math.sin(-z*.0011)*260;r.position.y=320+Math.sin(z*.001)*100;const gold=ringSerial%4===3;r.userData.gold=gold;r.userData.serial=ringSerial++;
 r.userData.core.forEach(m=>m.material=gold?goldMat:ringMat);r.userData.halo.material=gold?goldHalo:ringHalo;r.visible=true;}
for(let i=0;i<RINGS;i++){const g=new THREE.Group(),core=[mesh(ringGeo,ringMat,g)];const halo=mesh(haloGeo,ringHalo,g);for(let j=0;j<4;j++){const m=mesh(tabGeo,ringMat,g,Math.cos(j*Math.PI/2)*45,Math.sin(j*Math.PI/2)*45,0);m.rotation.z=j*Math.PI/2+Math.PI/2;core.push(m);}g.userData={core,halo};g.visible=false;scene.add(g);rings.push(g);}

// Missiles share geometry; each carries an exhaust glow and a blinking seeker light.
const missileGeo=new THREE.CylinderGeometry(.28,.4,4.8,8);missileGeo.rotateX(-Math.PI/2);
const noseGeo=new THREE.ConeGeometry(.28,1.2,8);noseGeo.rotateX(-Math.PI/2);
const finGeo=new THREE.BoxGeometry(2.4,.12,.9);
const missileMat=new THREE.MeshStandardMaterial({color:0xeee0be,metalness:.3,roughness:.5});
const missiles=[],flares=[];

// ---------- effects ----------
const fire=new Particles(2600,true),smoke=new Particles(1800,false);scene.add(smoke.points);scene.add(fire.points);
const waves=new Shockwaves(scene,16);
const wingTrails=[0,1].map(()=>{const l=new THREE.Line(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(96),3)),new THREE.LineBasicMaterial({color:0xe9f9fc,transparent:true,opacity:.3}));l.frustumCulled=false;l.userData.points=[];scene.add(l);return l;});

const sound=new SoundEngine();

// ---------- state ----------
const radar=ui.radar.getContext('2d'),ov=ui.overlay.getContext('2d');
let mode='intro',elapsed=0,worldTime=0,bank=0,pitch=0,velocity=new V(0,0,-190),energy=100,hp=3,score=0,ringCount=0,nearCount=0,splashCount=0,flareCd=0,invulnerable=0,spawnClock=0,phase=-1,boosting=false,boostHeld=false,boostLocked=false,cameraMode=0,toastTime=0,damageTime=0,shake=0;
let thrust=0,loadFeel=0,bankRate=0,previousBank=0,subtleMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let steerTime=0,boostTime=0,flareSaves=0,lastDamage='',coachStep=-1,threatPan=0,lastBeep=-100;
let combo=0,comboTimer=0,maxCombo=0,lowTime=0,lowScoreAcc=0,launchTime=0,timeScale=1,slowmo=0,endTimer=0,won=false,crashPoint=new V(),orbit=0,lastCount=-1,heartClock=0,fireworkClock=0,fireworksLeft=0,flashTime=0,resultShownAt=0,missileWarned=false;
const STORE='sky-survivor-afterburn-v2';
let best={time:0,score:0,rank:''};
try{const saved=JSON.parse(localStorage.getItem(STORE))||JSON.parse(localStorage.getItem('sky-survivor-afterburn-v1'));if(saved)best={...best,...saved};}catch{}
let soundPref=true;try{const s=localStorage.getItem(STORE+'-sound');if(s!==null)soundPref=s==='1';}catch{}
const keys=new Set(),stick={x:0,y:0,id:null};
const oldPlayer=new V(),temp=new V(),temp2=new V(),target=new V(),follow=new V(),rel=new V(),before=new V(),aim=new V(),dir=new V();
let pad=null,padPrev={};

// ---------- feedback helpers ----------
function toast(text){ui.toast.textContent=text;toastTime=2.2;}
function callout(text,kind=''){const el=document.createElement('div');el.className='callout '+kind;el.textContent=text;ui.callouts.prepend(el);while(ui.callouts.children.length>3)ui.callouts.lastChild.remove();setTimeout(()=>el.remove(),1500);}
let bannerTimer=0;
function banner(num,title,sub,kind=''){ui.banner.innerHTML=`<span>${num}</span><b>${title}</b><small>${sub}</small>`;ui.banner.className='';void ui.banner.offsetWidth;ui.banner.className='show '+kind;clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>ui.banner.className='',2600);}
function flash(color='#fff',strength=.5){ui.flash.style.background=color;flashTime=strength;}
const multiplier=()=>1+Math.min(3,Math.floor(combo/3));
function award(points,label,kind='',chain=true){
 if(chain){combo++;maxCombo=Math.max(maxCombo,combo);comboTimer=6;}
 const pts=Math.round(points*multiplier());score+=pts;callout(`+${pts} ${label}${multiplier()>1?' ×'+multiplier():''}`,kind);return pts;
}
function breakCombo(){if(combo>=3)callout('COMBO BREAK','bad');combo=0;comboTimer=0;}
function vibrate(p){try{navigator.vibrate?.(p);}catch{}}

// ---------- sound wiring ----------
function chooseSound(on,{click=true}={}){
 soundPref=on;try{localStorage.setItem(STORE+'-sound',on?'1':'0');}catch{}
 sound.setEnabled(on);
 ui.sound.textContent=on?'音 ON':'音 OFF';ui.sound.setAttribute('aria-label',on?'音声をオフにする':'音声をオンにする');
 ui.audioOn.setAttribute('aria-pressed',String(on));ui.audioOff.setAttribute('aria-pressed',String(!on));
 if(on){syncMusic();if(click)sound.click();}else{sound.stopMusic(.1);sound.silenceEngine();}
}
function musicLevel(){if(mode!=='play'&&mode!=='ending'&&mode!=='pause')return [0,104];return elapsed<15?[0,120]:elapsed<55?[1,128]:elapsed<80?[2,136]:[3,140];}
function syncMusic(){if(!soundPref||!sound.ctx)return;const [l,b]=musicLevel();sound.setLevel(l,b);sound.startMusic(l,b);}
// Any first gesture unlocks audio so the title theme can play.
const unlock=()=>{if(soundPref){sound.enabled=true;if(sound.ensure()){sound.setEnabled(true);syncMusic();}}window.removeEventListener('pointerdown',unlock,true);window.removeEventListener('keydown',unlock,true);};
window.addEventListener('pointerdown',unlock,true);window.addEventListener('keydown',unlock,true);

// ---------- coaching (first 15 seconds) ----------
function coaching(dt,inputX,inputY){
 if(Math.hypot(inputX,inputY)>.25)steerTime+=dt;if(boosting&&launchTime<=0)boostTime+=dt;
 const stage=elapsed<4?0:elapsed<10?1:elapsed<15?2:3;
 ui.tutorial.hidden=stage===3;
 ui.stick.classList.toggle('guided',stage===0);ui.boost.classList.toggle('guided',stage===2&&boostTime<.5);
 document.body.classList.toggle('training',stage<3);
 let text=ui.tutorial.textContent;
 if(stage===0)text=steerTime>.35?'旋回できました。指を中央へ戻すと水平に。':'練習 1/3 · 左の丸を少し動かして旋回';
 if(stage===1)text=ringCount?'リング通過！ 連続で通すとコンボ倍率アップ':'練習 2/3 · 青いリングの中心へ。矢印が方向を示します';
 if(stage===2)text=boostTime>.5?'加速できました。海面すれすれは低空ボーナス！':'練習 3/3 · 右の「加速」を長押し';
 if(ui.tutorial.textContent!==text)ui.tutorial.textContent=text;
 if(stage!==coachStep){coachStep=stage;if(stage===3)toast('練習終了 · 接近方向を見てフレアで回避');}
}
function threatHint(){
 let nearest=null,dist=Infinity;for(const m of missiles){if(m.diverted)continue;const d=m.mesh.position.distanceTo(jet.position);if(d<dist){nearest=m;dist=d;}}
 if(!nearest||dist>650){ui.threat.hidden=true;threatPan=0;ui.flare.classList.remove('guided');return;}
 rel.copy(nearest.mesh.position).sub(jet.position);threatPan=clamp(rel.x/200,-.8,.8);
 const side=rel.x>45?'右':rel.x<-45?'左':'',direction=rel.z>0?'後方':'前方';ui.threat.hidden=false;
 const text=`${side}${direction}から接近 · ${flareCd>0?'フレア回復中、旋回して回避':'フレアで誘導を解除'}`;if(ui.threat.textContent!==text)ui.threat.textContent=text;
 ui.flare.classList.toggle('guided',dist<420&&flareCd<=0);
}

// ---------- lifecycle ----------
function clearEntities(){for(const m of missiles)scene.remove(m.mesh);missiles.length=0;flares.length=0;fire.clear();smoke.clear();waves.clear();wingTrails.forEach(l=>l.userData.points=[]);ui.callouts.textContent='';}
function reset(){
 clearEntities();const fromIntro=mode==='intro';
 thrust=0;loadFeel=0;previousBank=0;bankRate=0;threatPan=0;steerTime=0;boostTime=0;flareSaves=0;lastDamage='';coachStep=-1;ui.threat.hidden=true;lastBeep=-100;
 elapsed=0;bank=0;pitch=0;jet.position.set(0,320,0);jet.rotation.set(0,0,0);jet.visible=true;velocity.set(0,0,-190);energy=100;hp=3;score=0;ringCount=0;nearCount=0;splashCount=0;flareCd=0;invulnerable=0;spawnClock=15;phase=-1;damageTime=0;shake=0;
 combo=0;comboTimer=0;maxCombo=0;lowTime=0;lowScoreAcc=0;launchTime=1.5;timeScale=1;slowmo=0;endTimer=0;won=false;lastCount=-1;heartClock=0;fireworksLeft=0;missileWarned=false;
 boostHeld=false;boostLocked=false;keys.clear();resetStick();
 ui.result.hidden=true;ui.pauseScreen.hidden=true;ui.intro.hidden=true;ui.hud.hidden=false;ui.pause.hidden=false;ui.countdown.className='';ui.countdown.textContent='';
 document.body.classList.add('playing');document.body.classList.remove('ending');
 if(!fromIntro)camera.position.set(0,340,60);camera.up.set(0,1,0);
 mode='play';ringSerial=0;rings.forEach((r,i)=>placeRing(r,-650-i*RING_GAP));
 islands.forEach((s,i)=>{s.z=-i*ISLAND_GAP+600;s.mesh.position.z=s.z;});clouds.forEach((c,i)=>c.position.z=-i*460);
 ui.alert.textContent='';ui.tutorial.hidden=false;toast('最初の15秒は練習 · 耐久は減りません');
 sound.resume();if(soundPref){sound.enabled=true;sound.ensure();sound.setEnabled(true);syncMusic();sound.boom();}
 waves.spawn(temp.copy(jet.position).add(temp2.set(0,-.2,7)),0xffe2c0,2,46,.9,.55,new V(0,0,1));
 for(let i=0;i<40;i++)fire.spawn(jet.position.x+(random()-.5)*2,jet.position.y-.2,jet.position.z+7,(random()-.5)*40,(random()-.5)*40,60+random()*60,.5,3,2,1,.7,.4,.9,2);
 shake=.6;updateView();
}
function finish(win){
 if(mode!=='play')return;mode='ending';won=win;endTimer=win?3.2:2.6;orbit=Math.atan2(camera.position.x-jet.position.x,camera.position.z-jet.position.z);
 boostHeld=false;keys.clear();resetStick();ui.alert.textContent='';ui.threat.hidden=true;ui.tutorial.hidden=true;document.body.classList.remove('training');document.body.classList.add('ending');ui.countdown.className='';
 if(win){score+=1000;callout('+1000 SURVIVED','gold');banner('★','MISSION COMPLETE','空を、生き抜いた。','win');sound.stopMusic(.3);sound.victory();fireworksLeft=9;fireworkClock=.25;
  // Clear the sky: every live missile pops.
  for(const m of missiles)explode(m.mesh.position,.8,false);missiles.forEach(m=>scene.remove(m.mesh));missiles.length=0;
  if(!subtleMotion){slowmo=1.1;}}
 else{crashPoint.copy(jet.position);jet.visible=false;explode(jet.position,2.4,true);for(let i=0;i<16;i++)smoke.spawn(jet.position.x,jet.position.y,jet.position.z,(random()-.5)*30,8+random()*20,(random()-.5)*30,3,7,3.5,.22,.21,.22,.45,.6,-3);
  for(let i=0;i<24;i++){const a=random()*Math.PI*2;fire.spawn(jet.position.x,jet.position.y,jet.position.z,Math.cos(a)*(40+random()*40),20+random()*50,Math.sin(a)*(40+random()*40),1.6+random(),2.4,0,1,.6,.25,1,.4,45);}
  banner('✕','SHOT DOWN','その旋回が、次につながる。','lose');sound.stopMusic(.6);sound.defeat();flash('#ffb070',.9);if(!subtleMotion)slowmo=1.4;vibrate([80,40,160]);}
 cockpit.visible=false;
}
const RANKS=[['S',16000],['A',10000],['B',5000],['C',0]];
function rankFor(win,s,t){if(win){for(const [r,min] of RANKS)if(s>=min)return r;}return t>=60?'C':'D';}
const RANK_ORDER='DCBAS';
let countUp=null;
function showResult(){
 mode='result';sound.silenceEngine();ui.hud.hidden=true;ui.pause.hidden=true;ui.result.hidden=false;document.body.classList.remove('ending');resultShownAt=performance.now();
 const win=won,rank=rankFor(win,score,elapsed),isRecord=score>(Number(best.score)||0);
 best.time=Math.max(Number(best.time)||0,elapsed);best.score=Math.max(Number(best.score)||0,score);if(RANK_ORDER.indexOf(rank)>RANK_ORDER.indexOf(best.rank||'D')||!best.rank)best.rank=rank;
 try{localStorage.setItem(STORE,JSON.stringify(best));}catch{}
 ui.resultTag.textContent=win?'MISSION COMPLETE':'FLIGHT REPORT';ui.resultTitle.textContent=win?'空を、生き抜いた。':'その旋回が、次につながる。';
 ui.resultText.textContent=win?`90秒の空域突破。リング ${ringCount} 回、ニアミス ${nearCount} 回、撃墜誘導 ${splashCount} 発。`:`飛行終了：${lastDamage||'機体損傷'}。リング ${ringCount} 回、ニアミス ${nearCount} 回。`;
 ui.resultTime.textContent=elapsed.toFixed(1);ui.resultScore.textContent='0';ui.resultCombo.textContent='×'+maxCombo;
 ui.rank.textContent=rank;ui.rank.dataset.rank=rank;ui.rank.className='';void ui.rank.offsetWidth;ui.rank.className='stamp';ui.newRecord.hidden=!isRecord;
 const next=RANKS.find(([r,min])=>min>score);
 ui.best.textContent=`自己ベスト ${best.time.toFixed(1)} 秒 / ${best.score} pt / 最高ランク ${best.rank}`;
 ui.achievement.textContent=splashCount?`フレアで誘導した ${splashCount} 発を空中で撃破。`:flareSaves?`フレアで ${flareSaves} 発の誘導を解除できました。`:ringCount?`リングを ${ringCount} 回通過できました。`:steerTime>.35?'自分の操作で機体を旋回できました。':'90秒の挑戦、次もここから始められます。';
 ui.nextGoal.textContent=lastDamage.includes('接触')?'次の目標：高度100m以上を保って飛ぶ。':!flareSaves?'次の目標：接近案内が出たらフレアを使う。':!ringCount?'次の目標：青いリングを1回通過する。':!win?'次の目標：90秒の空域突破。':next&&rank!=='S'?`次の目標：あと ${next[1]-score} pt でランク ${RANKS[RANKS.indexOf(next)-1]?.[0]||next[0]}。コンボを切らさずに。`:'最高ランク達成！ 最大コンボ更新を狙おう。';
 if(win&&rank!=='S'){const up=RANKS[RANKS.findIndex(r=>r[0]===rank)-1];if(up)ui.nextGoal.textContent=`次の目標：あと ${up[1]-score} pt でランク ${up[0]}。コンボを切らさずに。`;}
 countUp={t:0,to:score};
 if(soundPref){sound.setLevel(0,104);sound.startMusic(0,104);if(isRecord)setTimeout(()=>sound.newRecord(),700);}
 updateIntroBest();
}
function togglePause(){
 if(mode==='play'){mode='pause';ui.pauseScreen.hidden=false;boostHeld=false;boosting=false;keys.clear();resetStick();sound.silenceEngine();sound.pause();}
 else if(mode==='pause'){mode='play';ui.pauseScreen.hidden=true;sound.resume();}
}
function updateView(){cockpit.visible=cameraMode===1&&mode==='play';jet.visible=mode==='ending'&&!won?false:!cockpit.visible;ui.camera.querySelector('span').textContent=cameraMode?'操縦席':'追尾';document.body.classList.toggle('cockpit',!!cameraMode);}
function updateIntroBest(){ui.introBest.hidden=!(best.score>0);ui.introBest.innerHTML=`<span>BEST</span> ${Number(best.score)||0} pt · ${(Number(best.time)||0).toFixed(1)}秒${best.rank?` · RANK <b>${best.rank}</b>`:''}`;}

// ---------- combat ----------
function explode(p,scale=1,big=false,quiet=false){
 const x=p.x,y=p.y,z=p.z;
 for(let i=0;i<3;i++)fire.spawn(x,y,z,0,0,0,.28,26*scale,1.2,1,.92,.75,1);
 const n=Math.round(36*scale);
 for(let i=0;i<n;i++){const a=random()*Math.PI*2,b=Math.acos(random()*2-1),s=(25+random()*75)*Math.sqrt(scale);const sx=Math.sin(b)*Math.cos(a),sy=Math.cos(b),sz=Math.sin(b)*Math.sin(a);const hot=random();fire.spawn(x,y,z,sx*s,sy*s,sz*s,.5+random()*.7,(5+random()*8)*scale,1.4,1,.45+hot*.45,.15+hot*.25,.95,2.6);}
 for(let i=0;i<n*.7;i++){const a=random()*Math.PI*2,b=Math.acos(random()*2-1),s=70+random()*110;fire.spawn(x,y,z,Math.sin(b)*Math.cos(a)*s,Math.cos(b)*s,Math.sin(b)*Math.sin(a)*s,.8+random()*.8,1.1+random(),0,1,.85,.5,1,.9,40);}
 for(let i=0;i<n*.5;i++)smoke.spawn(x+(random()-.5)*6*scale,y+(random()-.5)*6*scale,z+(random()-.5)*6*scale,(random()-.5)*14,4+random()*10,(random()-.5)*14,2+random()*1.5,(7+random()*6)*scale,2.6,.28,.26,.25,.55,.5,-2);
 waves.spawn(p,0xffd7a0,2,(big?95:55)*scale,.65,.75);
 if(!quiet){const d=p.distanceTo(camera.position);sound.explosion(clamp(320/(d+60),.08,1.1),clamp((p.x-camera.position.x)/250,-.8,.8),big);if(d<220)shake=Math.max(shake,big?1.2:.5);}
}
function waterSplash(p){for(let i=0;i<34;i++)smoke.spawn(p.x+(random()-.5)*8,1,p.z+(random()-.5)*8,(random()-.5)*26,30+random()*45,(random()-.5)*26,1.4+random()*.6,4+random()*3,2.2,.93,.97,1,.75,.6,38);waves.spawn(temp.set(p.x,1.5,p.z),0xe8fbff,4,50,.9,.6,new V(0,1,0));sound.splash(clamp((p.x-camera.position.x)/250,-.8,.8));}
function flare(){
 if(mode!=='play'||flareCd>0)return;flareCd=7;
 // A fan of burning decoys arcs away behind the jet.
 for(let i=0;i<10;i++){const side=i%2?1:-1,spread=(.3+Math.floor(i/2)*.18);flares.push({p:jet.position.clone().add(temp.set(side*1.5,-1,5)),v:new V(side*(30+spread*80),-6+random()*34-spread*16,velocity.z*.86+random()*10),life:2.2+random()*.6});}
 let count=0;
 for(const m of missiles){if(m.diverted||m.mesh.position.distanceTo(jet.position)>900)continue;m.diverted=true;m.decoy=flares[flares.length-1-Math.floor(random()*10)];m.life=Math.min(m.life,1.7+random()*.5);count++;}
 flareSaves+=count;toast(count?`回避成功 · ${count} 発の誘導を解除`:'フレア散布 · 接近時に使うと効果的');sound.flare();flash('#fff3d0',.25);
}
function spawnMissile(){
 const phaseN=elapsed<30?0:elapsed<60?1:2,m=new THREE.Group();
 mesh(missileGeo,missileMat,m);mesh(noseGeo,missileMat,m,0,0,-2.9);
 for(let k=0;k<2;k++){const fin=mesh(finGeo,dark,m,0,0,1.7);fin.rotation.z=k*Math.PI/2;}
 const glow=sprite(0xffa04a,.95,9);glow.position.z=2.8;m.add(glow);const seeker=sprite(0xff3b2a,0,3);seeker.position.z=-3.2;m.add(seeker);
 const behind=random()>.24;m.position.copy(jet.position).add(temp.set((random()-.5)*360,(random()-.5)*210,behind?500+random()*250:-850));m.position.y=Math.max(60,m.position.y);
 const v=jet.position.clone().sub(m.position).normalize().multiplyScalar(290+phaseN*12);scene.add(m);
 missiles.push({mesh:m,glow,seeker,v,life:11,diverted:false,near:false,scored:false,trail:0,turn:.48+phaseN*.1,decoy:null,age:0});
 sound.missileLaunch(clamp((m.position.x-jet.position.x)/300,-.8,.8),behind?.9:.6);
 if(!missileWarned){missileWarned=true;callout('MISSILE LAUNCH','bad');}
}
function damage(reason){
 if(invulnerable>0||mode!=='play')return;
 if(elapsed<15){toast('練習中 · 上へ操作して高度を戻そう');return;}
 lastDamage=reason;hp--;invulnerable=2.2;damageTime=.65;shake=1.2;breakCombo();
 for(let i=0;i<26;i++)fire.spawn(jet.position.x,jet.position.y,jet.position.z,(random()-.5)*90,(random()-.5)*70,(random()-.5)*90+30,.6+random()*.4,1.2+random(),0,1,.75,.4,1,1,30);
 waves.spawn(jet.position,0xff8a5c,2,30,.4,.7);toast(reason);sound.hit();vibrate(120);flash('#ff5a2a',.55);
 if(hp<=0)finish(false);
}

// ---------- simulation ----------
function readPad(){
 const pads=navigator.getGamepads?.();pad=null;if(!pads)return;for(const p of pads)if(p&&p.connected){pad=p;break;}if(!pad)return;
 const pressed=i=>!!pad.buttons[i]?.pressed;
 if(pressed(0)&&!padPrev[0])mode==='play'?flare():(mode==='intro'||mode==='result')&&reset();
 if(pressed(9)&&!padPrev[9])togglePause();
 if(pressed(3)&&!padPrev[3]){cameraMode=1-cameraMode;updateView();}
 for(const i of [0,3,9])padPrev[i]=pressed(i);
}
function simulate(dt){
 elapsed=Math.min(90,elapsed+dt);setPhase();oldPlayer.copy(jet.position);
 let inputX=stick.x+(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0);
 let inputY=-stick.y+(keys.has('ArrowUp')||keys.has('KeyW')?1:0)-(keys.has('ArrowDown')||keys.has('KeyS')?1:0);
 let padBoost=false;
 if(pad){const ax=pad.axes[0]||0,ay=pad.axes[1]||0;if(Math.abs(ax)>.15)inputX+=ax;if(Math.abs(ay)>.15)inputY-=ay;padBoost=(pad.buttons[7]?.value||0)>.3||!!pad.buttons[5]?.pressed||!!pad.buttons[1]?.pressed;}
 inputX=clamp(inputX,-1,1);inputY=clamp(inputY,-1,1);
 bank=damp(bank,-inputX*.88,4.2,dt);pitch=damp(pitch,inputY*.37,3.5,dt);
 launchTime=Math.max(0,launchTime-dt);
 const boostRequested=boostHeld||padBoost||keys.has('ShiftLeft')||keys.has('ShiftRight');
 if(!boostRequested)boostLocked=false;if(energy<=1&&boostRequested)boostLocked=true;
 const wasBoosting=boosting;boosting=launchTime>0||(boostRequested&&!boostLocked&&energy>1);
 if(boosting&&!wasBoosting&&launchTime<=0&&elapsed>1){waves.spawn(temp.copy(jet.position).add(temp2.set(0,0,6)),0xdff6ff,3,22,.5,.4,new V(0,0,1));sound.boom();}
 if(launchTime<=0)energy=clamp(energy+(boosting?-27:16)*dt,0,100);
 const speed=boosting?335:190;
 velocity.x=damp(velocity.x,inputX*130,2.4,dt);velocity.y=damp(velocity.y,inputY*100,2.8,dt);velocity.z=damp(velocity.z,-speed,2.2,dt);
 jet.position.addScaledVector(velocity,dt);jet.position.x=clamp(jet.position.x,-2900,2900);jet.position.y=clamp(jet.position.y,14,1450);
 jet.rotation.set(pitch,-velocity.x*.0025,bank,'YXZ');
 if(jet.position.y<18){damage('海面接触 · 上昇せよ');jet.position.y=36;velocity.y=50;}
 for(const s of islands){const h=islandHeight(jet.position.x,jet.position.z,s);if(h+7>jet.position.y){damage('地形接触 · 高度を確保');jet.position.y=h+25;velocity.y=50;}}
 // Low-altitude risk bonus.
 const low=jet.position.y<55&&invulnerable<=0;
 if(low){lowTime+=dt;lowScoreAcc+=40*dt*multiplier();if(lowScoreAcc>=1){const add=Math.floor(lowScoreAcc);score+=add;lowScoreAcc-=add;}comboTimer=Math.max(comboTimer,1.2);}
 ui.lowAlt.classList.toggle('on',low);
 // Rings
 for(const r of rings){
  if(r.visible&&oldPlayer.z>r.position.z&&jet.position.z<=r.position.z){
   const f=(oldPlayer.z-r.position.z)/(oldPlayer.z-jet.position.z),x=oldPlayer.x+(jet.position.x-oldPlayer.x)*f,y=oldPlayer.y+(jet.position.y-oldPlayer.y)*f;
   if(Math.hypot(x-r.position.x,y-r.position.y)<38){
    ringCount++;const gold=r.userData.gold;award(gold?600:250,gold?'GOLD RING':'PERFECT LINE',gold?'gold':'ring');energy=gold?100:Math.min(100,energy+18);
    sound.ring(combo,gold);waves.spawn(r.position,gold?0xffc94a:0x7ff5ff,1,2.2,.6,.9,new V(0,0,1));
    for(let i=0;i<(gold?60:34);i++){const a=i/(gold?60:34)*Math.PI*2;fire.spawn(r.position.x+Math.cos(a)*39,r.position.y+Math.sin(a)*39,r.position.z,Math.cos(a)*30,Math.sin(a)*30,velocity.z*.2,.9,gold?3.4:2.6,0,gold?1:.5,gold?.8:1,gold?.35:.95,1,1.5);}
    flash(gold?'#ffe08a':'#9ffcff',.18);
   }
   r.visible=false;
  }
  if(r.position.z>jet.position.z+150)placeRing(r,r.position.z-RINGS*RING_GAP);
 }
 spawnClock-=dt;if(spawnClock<=0){spawnMissile();spawnClock=elapsed<20?4.8:elapsed<55?3.2:2.3;}
 const closest=updateMissiles(dt);updateFlares(dt);
 if(mode==='play'){
  const alert=jet.position.y<65&&!low?'PULL UP · 高度を上げて':closest<190?'MISSILE · フレアで回避':closest<420?'ミサイル接近':'';if(ui.alert.textContent!==alert)ui.alert.textContent=alert;
  if(closest<260&&worldTime-lastBeep>(closest<120?.22:.55)){sound.lock(threatPan,closest<120);lastBeep=worldTime;}
 }
 flareCd=Math.max(0,flareCd-dt);invulnerable=Math.max(0,invulnerable-dt);
 if(comboTimer>0){comboTimer-=dt;if(comboTimer<=0)combo=0;}
 if(hp===1){heartClock-=dt;if(heartClock<=0){sound.heartbeat();heartClock=.95;}}
 const secLeft=Math.ceil(90-elapsed);
 if(secLeft<=10&&secLeft!==lastCount&&mode==='play'){lastCount=secLeft;if(secLeft>0){ui.countdown.textContent=secLeft;ui.countdown.className='';void ui.countdown.offsetWidth;ui.countdown.className='tick'+(secLeft<=3?' hot':'');sound.countdown(secLeft);}}
 coaching(dt,inputX,inputY);
 if(elapsed>=90&&mode==='play'){sound.countdown(0);finish(true);}
}
function setPhase(){
 const p=elapsed<15?0:elapsed<55?1:2;
 if(elapsed>=80&&musicLevel()[0]===3&&sound.level!==3){sound.setLevel(3,140);sound.riser(9.5);}
 if(p===phase)return;phase=p;
 ui.phase.innerHTML=[`<span>01</span> 練習空域 <small>15秒間、耐久は減りません</small>`,`<span>02</span> HOSTILE SKIES <small>ミサイル接近。フレアを使い分けよう</small>`,`<span>03</span> LAST HORIZON <small>あと少し。加速で振り切れ</small>`][p];
 if(p===0)banner('01','OPEN WATER','15秒の練習空域 · 翼の感覚をつかもう');
 if(p===1){banner('02','HOSTILE SKIES','敵ミサイル接近 · フレアで誘導を外せ','danger');sound.stinger(1);flash('#ff7048',.2);}
 if(p===2){banner('03','LAST HORIZON','最終空域 · 加速で振り切れ','danger');sound.stinger(2);flash('#ffb070',.25);}
 if(soundPref)syncMusic();
}
function updateMissiles(dt){
 let closest=9999;
 for(let i=missiles.length-1;i>=0;i--){
  const m=missiles[i],mp=m.mesh.position;m.life-=dt;m.age+=dt;before.copy(mp).sub(oldPlayer);
  if(!m.diverted){
   aim.copy(jet.position).addScaledVector(velocity,.12).sub(mp).normalize();dir.copy(m.v).normalize();
   const angle=dir.angleTo(aim);dir.lerp(aim,Math.min(1,m.turn*dt/Math.max(angle,.001))).normalize();m.v.copy(dir).multiplyScalar(elapsed<30?290:305);
  }else if(m.decoy){aim.copy(m.decoy.p).sub(mp).normalize();dir.copy(m.v).normalize().lerp(aim,Math.min(1,dt*3)).normalize();m.v.copy(dir).multiplyScalar(300);}
  mp.addScaledVector(m.v,dt);m.mesh.lookAt(temp.copy(mp).add(m.v));m.mesh.rotateY(Math.PI);
  m.seeker.material.opacity=m.diverted?0:(Math.sin(m.age*(18))>0?.95:.1);
  rel.copy(mp).sub(jet.position);const distance=rel.length();if(!m.diverted)closest=Math.min(closest,distance);
  m.trail+=dt;
  if(m.trail>.028){m.trail=0;temp.set(0,0,2.9).applyQuaternion(m.mesh.quaternion).add(mp);
   smoke.spawn(temp.x,temp.y,temp.z,(random()-.5)*4,(random()-.5)*4,(random()-.5)*4,1.8,2.6,4.2,.88,.86,.82,.42,.4,-1.5);
   fire.spawn(temp.x,temp.y,temp.z,m.v.x*.15,m.v.y*.15,m.v.z*.15,.12,3.6,-.5,1,.6,.25,.9);}
  let dead=false;
  if(!m.diverted&&segmentDistance(before,rel)<7.5){damage('ミサイル被弾 · 接近案内でフレアを使おう');explode(mp,1.1);dead=true;}
  else if(!m.diverted){
   if(distance<42)m.near=true;
   if(m.near&&!m.scored&&distance>55&&rel.dot(temp.copy(m.v).sub(velocity))>0){m.scored=true;nearCount++;award(150,'CLOSE CALL','near');sound.closeCall(clamp(rel.x/40,-.9,.9));if(!subtleMotion&&mode==='play')slowmo=Math.max(slowmo,.45);}
  }
  if(!dead&&mp.y<2){if(mode==='play'&&m.diverted){splashCount++;award(150,'SPLASH','splash');}waterSplash(mp);dead=true;}
  if(!dead&&m.life<=0){if(m.diverted&&mode==='play'){splashCount++;award(150,'SPLASH','splash');explode(mp,.9);}else explode(mp,.6,false,distance>900);dead=true;}
  if(!dead&&distance>2300)dead=true;
  if(dead){scene.remove(m.mesh);missiles.splice(i,1);}
 }
 return closest;
}
function updateFlares(dt){
 for(let i=flares.length-1;i>=0;i--){const f=flares[i];f.life-=dt;f.v.y-=22*dt;f.v.multiplyScalar(Math.exp(-dt*.6));f.p.addScaledVector(f.v,dt);
  fire.spawn(f.p.x,f.p.y,f.p.z,0,0,0,.22,5.5,-.4,1,.95,.8,1);fire.spawn(f.p.x,f.p.y,f.p.z,(random()-.5)*20,(random()-.5)*20,(random()-.5)*20,.4,1.2,0,1,.7,.35,.9,1,10);
  if(random()<.45)smoke.spawn(f.p.x,f.p.y,f.p.z,(random()-.5)*3,2,(random()-.5)*3,1.6,2.6,3.5,.95,.94,.92,.4,.4);
  if(f.life<=0)flares.splice(i,1);}
}

// ---------- per-frame visuals ----------
function updateFeel(dt){
 const flying=mode==='play';thrust=damp(thrust,(flying||mode==='ending'&&won)&&boosting?1:0,2.8,dt);bankRate=dt>0?(bank-previousBank)/dt:0;previousBank=bank;
 loadFeel=damp(loadFeel,flying?clamp(Math.abs(bank)*.7+Math.abs(pitch)*.6+Math.abs(bankRate)*.12,0,1):0,4,dt);
 for(const {hinge,sign} of controlSurfaces)hinge.rotation.x=-pitch*.65+bank*sign*.42;
 cockpitStick.rotation.set(-pitch*.8,0,bank*.35);instrumentBars.forEach((b,i)=>{b.scale.y=.25+.7*(i<3?(.4+thrust*.6):(.3+loadFeel*.7));});
 const amount=subtleMotion?0:1;cockpit.position.set(-bank*.045*amount,-thrust*.018*amount,thrust*.045*amount);cockpit.rotation.z=bankRate*.007*amount;
 streaks.visible=flying&&!subtleMotion;streaks.material.opacity=thrust*.2+Math.max(0,120-jet.position.y)/120*.06;
 if(streaks.visible){for(let i=0;i<STREAKS;i++){const t=streakSeeds[i];t.z+=dt*(35+thrust*110);if(t.z>0)t.z=-120;const x=Math.cos(t.a)*t.r,y=Math.sin(t.a)*t.r,o=i*6;streakPositions[o]=x;streakPositions[o+1]=y;streakPositions[o+2]=t.z;streakPositions[o+3]=x;streakPositions[o+4]=y;streakPositions[o+5]=t.z-1.5-thrust*5;}streakGeometry.attributes.position.needsUpdate=true;}
 const active=soundPref&&(flying||mode==='ending'&&won);sound.updateEngine(active,thrust,loadFeel,cameraMode===1,bank,Math.max(0,120-jet.position.y)/120);
}
const nozzleL=new V(-.92,-.25,7),nozzleR=new V(.92,-.25,7);
function updateJetFx(dt,simDt){
 const show=jet.visible;
 jet.userData.flames.forEach(f=>f.scale.set(1,1,(.55+thrust*1.55)+Math.sin(worldTime*35)*.08));
 jet.userData.glows.forEach(g=>{g.scale.setScalar(2.6+thrust*5+Math.sin(worldTime*40)*.3);g.material.opacity=.45+thrust*.5;});
 const blink=(worldTime%1.2)<.08;jet.userData.strobe.material.opacity=blink?1:0;jet.userData.navs.forEach(n=>n.material.opacity=.6+Math.sin(worldTime*3)*.2);
 if(!show||simDt<=0||mode==='intro')return;
 // Afterburner sparks
 if(thrust>.25){for(const nz of [nozzleL,nozzleR]){temp.copy(nz).applyQuaternion(jet.quaternion).add(jet.position);fire.spawn(temp.x,temp.y,temp.z,velocity.x*.4+(random()-.5)*6,velocity.y*.4+(random()-.5)*6,velocity.z*.35,.14+thrust*.08,2.2+thrust*1.6,-.3,1,.55+random()*.2,.3,.8*thrust);}}
 // Damage smoke
 if(hp<3&&mode==='play'&&random()<(hp===1?.9:.4)*simDt*60){temp.copy(hp===1?nozzleL:nozzleR).applyQuaternion(jet.quaternion).add(jet.position);const d=hp===1?.16:.6;smoke.spawn(temp.x,temp.y,temp.z,(random()-.5)*5,3,(random()-.5)*5,hp===1?2.2:1.4,2.2,4,d,d,d+.02,hp===1?.6:.3,.3);if(hp===1&&random()<.5)fire.spawn(temp.x,temp.y,temp.z,0,0,10,.18,2.4,0,1,.5,.2,.9);}
 // Sea spray when skimming the water
 if(jet.position.y<55&&mode==='play'){const k=1-(jet.position.y-14)/41;if(random()<k*simDt*60*1.6){for(const side of [-1,1])smoke.spawn(jet.position.x+side*(3+random()*4),1.5,jet.position.z+8+random()*6,side*(8+random()*14),12+random()*22*k,velocity.z*.1,.9+random()*.5,2.5,3,.92,.97,1,.5*k+.2,.8,30);}}
 // Wingtip vortices
 wingTrails.forEach((l,i)=>{const points=l.userData.points;if(mode==='play'||mode==='ending'&&won){const point=new V((i?1:-1)*6.4,0,2.9).applyEuler(jet.rotation).add(jet.position);points.unshift(point);if(points.length>32)points.pop();const attr=l.geometry.attributes.position;points.forEach((p,j)=>attr.setXYZ(j,p.x,p.y,p.z));attr.needsUpdate=true;l.geometry.setDrawRange(0,points.length);l.visible=!cameraMode&&(boosting||Math.abs(bank)>.3);l.material.opacity=.18+loadFeel*.4+thrust*.12;}else l.visible=false;});
}
function updateFireworks(dt){
 if(fireworksLeft<=0)return;fireworkClock-=dt;if(fireworkClock>0)return;fireworkClock=.22+random()*.25;fireworksLeft--;
 const c=new THREE.Color().setHSL(random(),.9,.62),p=temp.copy(jet.position).add(temp2.set((random()-.5)*260,40+random()*120,-180-random()*260));
 for(let i=0;i<80;i++){const a=random()*Math.PI*2,b=Math.acos(random()*2-1),s=70+random()*40;fire.spawn(p.x,p.y,p.z,Math.sin(b)*Math.cos(a)*s,Math.cos(b)*s,Math.sin(b)*Math.sin(a)*s+velocity.z*.6,1.6+random()*.6,4.2,-.3,c.r,c.g,c.b,1,1.3,22);}
 waves.spawn(p,c.getHex(),4,90,.7,.6);sound.firework(clamp((p.x-jet.position.x)/200,-.8,.8));
}
function updateCamera(dt){
 const amount=subtleMotion?0:1;
 if(mode==='play'||mode==='pause'){
  follow.copy(jet.position).add(temp.set(-velocity.x*.045,7.6+Math.abs(bank)*1.3,boosting?35:30));
  if(cameraMode){camera.position.copy(jet.position).add(temp.set(0,1.05,-4.9));target.copy(jet.position).add(temp.set(velocity.x*.3,velocity.y*.3,-160));}
  else{camera.position.lerp(follow,1-Math.exp(-(launchTime>0?2.6:6)*dt));target.copy(jet.position).add(temp.set(velocity.x*.06,2,-38));}
  camera.up.set(-Math.sin(bank*(cameraMode?.7:.14)),Math.cos(bank*(cameraMode?.7:.14)),0);camera.lookAt(target);
  camera.fov=damp(camera.fov,subtleMotion?59:59+thrust*13,3,dt);
  if(mode==='play'&&!subtleMotion){const buffet=(.006+thrust*.019+loadFeel*.016);camera.position.x+=Math.sin(worldTime*31)*buffet;camera.position.y+=Math.sin(worldTime*43)*buffet*.7;}
 }else if(mode==='ending'){
  camera.up.set(0,1,0);
  if(won){follow.copy(jet.position).add(temp.set(38,8,-46));camera.position.lerp(follow,1-Math.exp(-1.6*dt));camera.lookAt(jet.position);camera.fov=damp(camera.fov,52,2,dt);}
  else{orbit+=dt*.45;follow.copy(crashPoint).add(temp.set(Math.sin(orbit)*120,38,Math.cos(orbit)*120));camera.position.lerp(follow,1-Math.exp(-2*dt));camera.lookAt(crashPoint);camera.fov=damp(camera.fov,55,2,dt);}
 }else if(mode==='intro'){
  const mobile=innerWidth<700,a=worldTime*.07;
  follow.set(Math.sin(a)*8+25,331+Math.sin(worldTime*.13)*1.5,27+Math.cos(a)*6);camera.position.lerp(follow,1-Math.exp(-1.5*dt));camera.up.set(0,1,0);
  camera.lookAt(mobile?temp.set(0,300,0):temp.set(-11,320,0));camera.fov=damp(camera.fov,mobile?60:49,3,dt);
 }else if(mode==='result'){camera.up.set(0,1,0);orbit+=dt*.15;follow.copy(won?jet.position:crashPoint).add(temp.set(Math.sin(orbit)*120,38,Math.cos(orbit)*120));camera.position.lerp(follow,1-Math.exp(-1*dt));camera.lookAt(won?jet.position:crashPoint);}
 if(shake>0&&amount){camera.position.x+=(random()-.5)*shake*.55;camera.position.y+=(random()-.5)*shake*.4;}
 camera.updateProjectionMatrix();
}

// ---------- HUD ----------
const hudCache={};
function setText(key,el,value){if(hudCache[key]!==value){hudCache[key]=value;el.textContent=value;}}
function setStyle(key,el,prop,value){if(hudCache[key]!==value){hudCache[key]=value;el.style[prop]=value;}}
function updateHUD(){
 const sec=Math.floor(elapsed);if(hudCache.sec!==sec){hudCache.sec=sec;ui.timer.innerHTML=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')} <em>/ 01:30</em>`;}
 setStyle('prog',ui.progress,'width',(elapsed/90*100).toFixed(1)+'%');
 setText('hp',ui.health,'▰ '.repeat(Math.max(0,hp))+'▱ '.repeat(3-Math.max(0,hp)));ui.health.classList.toggle('critical',hp===1);
 setText('score',ui.score,'SCORE '+String(score).padStart(5,'0'));
 setText('speed',ui.speed,String(Math.round(velocity.length()*3.6)));setText('alt',ui.altitude,String(Math.round(jet.position.y)));
 setStyle('energy',ui.energy,'width',Math.round(energy)+'%');
 setText('flareLabel',ui.flareLabel,flareCd>0?flareCd.toFixed(1)+'s':'フレアで回避');
 ui.flare.classList.toggle('cooldown',flareCd>0);ui.flare.setAttribute('aria-disabled',String(flareCd>0));ui.flare.style.setProperty('--cd',String(flareCd/7));
 ui.boost.classList.toggle('active',boosting);setText('boostLabel',ui.boost.querySelector('span'),boostLocked?'指を離して回復':'長押しで加速');
 setStyle('horizon',ui.horizon,'transform',`rotate(${(-bank*30).toFixed(1)}deg) translateY(${(pitch*35).toFixed(1)}px)`);
 setText('power',ui.powerReadout,launchTime>0?'LAUNCH':boosting?'AFTERBURN':boostLocked?'COOLING':'MIL POWER');setText('bank',ui.bankReadout,`BANK ${Math.round(Math.abs(bank)*180/Math.PI)}°`);
 setStyle('load',ui.loadShade,'opacity',String(mode==='play'?(loadFeel*.36*(subtleMotion?0:1)).toFixed(2):0));
 const m=multiplier();ui.combo.classList.toggle('on',combo>0);setText('combo',ui.comboText,combo>0?`×${m} COMBO ${combo}`:'');setStyle('comboBar',ui.comboBar,'transform',`scaleX(${clamp(comboTimer/6,0,1).toFixed(3)})`);ui.combo.dataset.mult=m;
 if(!toastTime&&ui.toast.textContent)ui.toast.textContent='';
 setStyle('damage',ui.damage,'opacity',String((damageTime*.8).toFixed(2)));
}
let ovW=0,ovH=0,ovScale=1,ovDirty=false;const touchUI=matchMedia('(pointer:coarse)').matches||innerWidth<700;
function drawArrow(x,y,ang,color,label,size=13){ov.save();ov.translate(x,y);ov.rotate(ang);ov.fillStyle=color;ov.beginPath();ov.moveTo(size,0);ov.lineTo(-size*.7,size*.75);ov.lineTo(-size*.35,0);ov.lineTo(-size*.7,-size*.75);ov.closePath();ov.fill();ov.restore();if(label){ov.fillStyle=color;ov.fillText(label,x-Math.cos(ang)*26,y-Math.sin(ang)*26+4);}}
// Off-screen targets are pinned to an inner frame that stays clear of the header and thumb controls.
function markerFor(pos,margin){
 temp.copy(pos).project(camera);const behind=temp.z>1;let x=(temp.x*.5+.5)*ovW,y=(-temp.y*.5+.5)*ovH;
 if(behind){x=ovW-x;y=ovH-y;}
 const top=Math.min(120,ovH*.2),bottom=ovH-Math.min(ovH*.3,touchUI?230:150),cx=ovW/2,cy=(top+bottom)/2;
 const on=!behind&&x>margin&&x<ovW-margin&&y>top&&y<bottom;
 if(on)return {on,x,y};
 let dx=x-cx,dy=y-cy;if(behind&&Math.abs(dx)<1&&Math.abs(dy)<1)dy=1;
 const k=Math.min((cx-margin)/Math.max(Math.abs(dx),1e-3),(bottom-cy)/Math.max(Math.abs(dy),1e-3));
 return {on,x:cx+dx*k,y:cy+dy*k,ang:Math.atan2(dy,dx)};
}
function drawOverlay(){
 if(ovDirty){ov.setTransform(ovScale,0,0,ovScale,0,0);ov.clearRect(0,0,ovW,ovH);ovDirty=false;}
 if(mode!=='play')return;
 ov.setTransform(ovScale,0,0,ovScale,0,0);ov.font='600 11px Arial,sans-serif';ov.textAlign='center';ov.lineWidth=2;ovDirty=true;
 const margin=Math.min(70,ovW*.08);
 // Next ring guidance
 let next=null;for(const r of rings)if(r.visible&&r.position.z<jet.position.z-20&&(!next||r.position.z>next.position.z))next=r;
 if(next){const mk=markerFor(next.position,margin),col=next.userData.gold?'#ffd36b':'#8ff6ec';
  if(!mk.on)drawArrow(mk.x,mk.y,mk.ang,col,'RING',11);
  else{const d=jet.position.distanceTo(next.position);if(d<700){ov.strokeStyle=col;ov.globalAlpha=.55;ov.beginPath();const s=10;ov.moveTo(mk.x,mk.y-s);ov.lineTo(mk.x+s,mk.y);ov.lineTo(mk.x,mk.y+s);ov.lineTo(mk.x-s,mk.y);ov.closePath();ov.stroke();ov.globalAlpha=1;}}}
 // Missile markers
 for(const m of missiles){if(m.diverted)continue;const d=m.mesh.position.distanceTo(jet.position);if(d>1500)continue;
  const hot=d<200,col=hot?((worldTime*8|0)%2?'#ff3b2a':'#ffd0c0'):d<450?'#ff7048':'#ffb27a',mk=markerFor(m.mesh.position,margin),label=Math.round(d)+'m';
  if(mk.on){const s=clamp(2600/(d+20),9,30);ov.strokeStyle=col;ov.beginPath();for(const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){ov.moveTo(mk.x+sx*s,mk.y+sy*s*.55);ov.lineTo(mk.x+sx*s,mk.y+sy*s);ov.lineTo(mk.x+sx*s*.55,mk.y+sy*s);}ov.stroke();ov.fillStyle=col;ov.fillText(label,mk.x,mk.y+s+14);}
  else drawArrow(mk.x,mk.y,mk.ang,col,label,hot?17:13);}
}
function drawRadar(){
 radar.clearRect(0,0,180,180);radar.fillStyle='#08222d90';radar.strokeStyle='#b1ebdb55';radar.lineWidth=1;radar.beginPath();radar.arc(90,90,82,0,Math.PI*2);radar.fill();radar.stroke();
 radar.beginPath();radar.arc(90,90,43,0,Math.PI*2);radar.moveTo(8,90);radar.lineTo(172,90);radar.moveTo(90,8);radar.lineTo(90,172);radar.stroke();
 // Sweep
 const sw=worldTime*2.2%(Math.PI*2);const g=radar.createConicGradient?radar.createConicGradient(sw-.6,90,90):null;if(g){g.addColorStop(0,'#9ffae100');g.addColorStop(.095,'#9ffae150');g.addColorStop(.1,'#9ffae100');radar.fillStyle=g;radar.beginPath();radar.arc(90,90,82,0,Math.PI*2);radar.fill();}
 radar.fillStyle='#9ffae1';radar.beginPath();radar.moveTo(90,83);radar.lineTo(85,97);radar.lineTo(90,94);radar.lineTo(95,97);radar.fill();
 const dot=(px,pz,color,r)=>{const dx=(px-jet.position.x)*.1,dz=(pz-jet.position.z)*.1,len=Math.hypot(dx,dz),s=len>74?74/len:1;radar.fillStyle=color;radar.beginPath();radar.arc(90+dx*s,90+dz*s,r,0,Math.PI*2);radar.fill();};
 for(const r of rings)if(r.visible&&r.position.z<jet.position.z)dot(r.position.x,r.position.z,r.userData.gold?'#ffd36b':'#7ff5ff88',2.5);
 for(const m of missiles)dot(m.mesh.position.x,m.mesh.position.z,m.diverted?'#ffe8a3':'#ff6040',3.6);
}

// ---------- main frame ----------
function frame(dt){
 worldTime+=dt;readPad();
 // Slow motion eases in and out; it is skipped entirely with reduced motion.
 if(slowmo>0){slowmo-=dt;timeScale=damp(timeScale,.3,14,dt);}else timeScale=damp(timeScale,1,5,dt);
 sound.setMuffle(mode==='pause'?0:(1-timeScale)*.9);
 const simDt=mode==='pause'||mode==='result'?0:dt*timeScale;
 if(mode==='play'){const steps=Math.min(6,Math.max(1,Math.ceil(simDt*60)));for(let s=0;s<steps&&mode==='play';s++)simulate(simDt/steps);threatHint();}
 else if(mode==='ending'){
  endTimer-=dt;updateMissiles(simDt);updateFlares(simDt);updateFireworks(simDt);
  if(won){boosting=true;velocity.z=damp(velocity.z,-300,2,simDt);velocity.x=damp(velocity.x,0,2,simDt);velocity.y=damp(velocity.y,25,1,simDt);jet.position.addScaledVector(velocity,simDt);bank=damp(bank,0,3,simDt);pitch=damp(pitch,.08,2,simDt);jet.rotation.set(pitch,-velocity.x*.0025,bank+Math.sin(worldTime*1.3)*.06,'YXZ');}
  if(endTimer<=0)showResult();
 }else if(mode==='intro'){jet.position.set(0,320+Math.sin(worldTime*.4)*.7,0);jet.rotation.set(.04,Math.sin(worldTime*.09)*.14,-.035);jet.visible=true;cockpit.visible=false;}
 if(mode!=='pause'){
  updateFeel(mode==='result'?dt:simDt);updateJetFx(dt,simDt);
  for(const s of islands)if(s.z>jet.position.z+1500){s.z-=ISLANDS*ISLAND_GAP;s.mesh.position.z=s.z;}
  for(const c of clouds)if(c.position.z>jet.position.z+2000)c.position.z-=12000;
  fire.update(simDt);smoke.update(simDt);waves.update(simDt,camera);
  for(const r of rings)if(r.visible){r.userData.halo.rotation.z+=dt*.6;const pulse=1+Math.sin(worldTime*4+r.userData.serial)*.04;r.userData.halo.scale.setScalar(pulse);}
  shake=Math.max(0,shake-dt*2);damageTime=Math.max(0,damageTime-dt);toastTime=Math.max(0,toastTime-dt);
 }
 flashTime=Math.max(0,flashTime-dt*2.2);ui.flash.style.opacity=flashTime.toFixed(3);
 applyDusk(mode==='intro'?.18:mode==='result'?(won?.95:Math.min(1,.1+.9*elapsed/90)):.12+.88*Math.pow(clamp(elapsed/90,0,1),1.25));
 updateCamera(dt);
 sky.position.copy(camera.position);ocean.position.x=camera.position.x;ocean.position.z=camera.position.z;waterMat.uniforms.time.value=worldTime;waterMat.uniforms.eye.value.copy(camera.position);
 const pxScale=renderer.domElement.height/(2*Math.tan(camera.fov*Math.PI/360));fire.material.uniforms.scale.value=smoke.material.uniforms.scale.value=pxScale;
 if(mode==='play'){updateHUD();drawRadar();}
 drawOverlay();
 if(countUp){countUp.t=Math.min(1,countUp.t+dt/1.1);const v=Math.round(countUp.to*(1-Math.pow(1-countUp.t,3)));ui.resultScore.textContent=String(v);if(countUp.t>=1)countUp=null;}
}

// ---------- input ----------
function resetStick(){stick.x=stick.y=0;stick.id=null;ui.knob.style.transform='translate(0,0)';}
function moveStick(e){const rect=ui.stick.getBoundingClientRect(),range=rect.width*.34;let x=(e.clientX-rect.left-rect.width/2)/range,y=(e.clientY-rect.top-rect.height/2)/range;const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}stick.x=x;stick.y=y;ui.knob.style.transform=`translate(${x*range}px,${y*range}px)`;}
ui.stick.addEventListener('pointerdown',e=>{if(mode!=='play'||stick.id!==null)return;stick.id=e.pointerId;ui.stick.setPointerCapture(e.pointerId);moveStick(e);e.preventDefault();});
ui.stick.addEventListener('pointermove',e=>{if(stick.id===e.pointerId)moveStick(e);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])ui.stick.addEventListener(type,e=>{if(stick.id===e.pointerId)resetStick();});
ui.boost.addEventListener('pointerdown',e=>{if(mode==='play'){boostHeld=true;ui.boost.setPointerCapture(e.pointerId);e.preventDefault();}});
for(const type of ['pointerup','pointercancel','lostpointercapture'])ui.boost.addEventListener(type,()=>boostHeld=false);
ui.flare.addEventListener('pointerdown',e=>{e.preventDefault();flare();});
ui.flare.addEventListener('click',e=>{if(e.detail===0)flare();});
window.addEventListener('keydown',e=>{
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(e.code)&&mode!=='intro'&&mode!=='result')e.preventDefault();
 if(e.repeat)return;
 if(mode==='result'&&['Enter','KeyR','Space'].includes(e.code)&&performance.now()-resultShownAt>700){e.preventDefault();reset();return;}
 if(mode==='intro'&&e.code==='Enter'&&!ui.start.disabled&&document.activeElement?.tagName!=='BUTTON'){reset();return;}
 if(e.code==='KeyP'||e.code==='Escape')togglePause();
 if(e.code==='KeyC'){cameraMode=1-cameraMode;updateView();}
 if(e.code==='KeyM')chooseSound(!soundPref);
 if(e.code==='Space'&&mode==='play')flare();
 keys.add(e.code);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{if(mode==='play')togglePause();keys.clear();boostHeld=false;resetStick();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='play')togglePause();});
const motionLabel=()=>{$('motion').textContent=subtleMotion?'揺れ：控えめ':'揺れ：標準';$('motion').setAttribute('aria-pressed',String(subtleMotion));};
$('motion').onclick=()=>{subtleMotion=!subtleMotion;motionLabel();};motionLabel();
ui.start.onclick=reset;$('restart').onclick=reset;$('retryPause').onclick=reset;ui.pause.onclick=togglePause;$('resume').onclick=togglePause;
ui.camera.onclick=()=>{cameraMode=1-cameraMode;updateView();};
ui.sound.onclick=()=>chooseSound(!soundPref);ui.audioOn.onclick=()=>chooseSound(true);ui.audioOff.onclick=()=>chooseSound(false);
$('back').onclick=()=>{mode='intro';document.body.classList.remove('training','playing','ending');clearEntities();rings.forEach(r=>r.visible=false);ui.result.hidden=true;ui.intro.hidden=false;camera.up.set(0,1,0);boosting=false;jet.visible=true;jet.position.set(0,320,0);velocity.set(0,0,-190);if(soundPref)syncMusic();};

let lastAspect=0;
function resize(){
 const w=ui.game.clientWidth,h=ui.game.clientHeight,nextAspect=w/h;
 if(lastAspect&&((lastAspect>1)!==(nextAspect>1))&&mode==='play')togglePause();lastAspect=nextAspect;resetStick();boostHeld=false;
 renderer.setSize(w,h,false);camera.aspect=nextAspect;camera.updateProjectionMatrix();
 ovScale=Math.min(devicePixelRatio,1.5);ovW=w;ovH=h;ui.overlay.width=Math.round(w*ovScale);ui.overlay.height=Math.round(h*ovScale);ovDirty=true;
}
window.addEventListener('resize',resize);resize();
$('world').addEventListener('webglcontextlost',e=>{e.preventDefault();if(mode==='play')togglePause();$('error').hidden=false;$('errorText').textContent='3D表示が中断されました。再読み込みして飛行を再開してください。';});

// Init UI state
chooseSound(soundPref,{click:false});updateIntroBest();applyDusk(.18);camera.position.set(25,331,33);camera.lookAt(-11,320,0);

// Adaptive resolution: step pixel ratio down while frames stay slow.
let last=performance.now(),frameSum=0,frameCount=0;
function loop(now){
 const raw=(now-last)/1000;last=now;const dt=raw>.35?0:Math.min(raw,.1);
 try{frame(dt);renderer.render(scene,camera);}catch(e){console.error(e);$('error').hidden=false;return;}
 frameSum+=raw;frameCount++;
 if(frameCount===120){const avg=frameSum/120;if(avg>.026&&pixelRatio>.8){pixelRatio=Math.max(.8,pixelRatio-.25);renderer.setPixelRatio(pixelRatio);resize();}frameSum=0;frameCount=0;}
 requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.skyReady=true;ui.start.disabled=false;ui.start.textContent='出撃する ↗';$('loading').textContent='';
// Debug hook for automated checks.
window.__sky={get state(){return {mode,elapsed:+elapsed.toFixed(2),score,hp,combo,maxCombo,missiles:missiles.length,ringCount,nearCount,splashCount,timeScale:+timeScale.toFixed(2),pixelRatio};},
 peek(){let next=null;for(const r of rings)if(r.visible&&r.position.z<jet.position.z-20&&(!next||r.position.z>next.position.z))next=r;let md=1e9;for(const m of missiles)if(!m.diverted)md=Math.min(md,m.mesh.position.distanceTo(jet.position));return {x:jet.position.x,y:jet.position.y,rx:next?.position.x,ry:next?.position.y,md,flareCd,energy};},
 jump(t){elapsed=t;spawnClock=Math.min(spawnClock,.5);}};
