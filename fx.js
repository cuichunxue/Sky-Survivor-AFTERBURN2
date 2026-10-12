// Pooled visual effects: GPU point particles, shockwave rings and generated textures.
import * as THREE from './vendor/three.module.js';

export function glowTexture(size=64){
 const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');
 const r=g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
 r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.25,'rgba(255,255,255,.55)');r.addColorStop(.6,'rgba(255,255,255,.12)');r.addColorStop(1,'rgba(255,255,255,0)');
 g.fillStyle=r;g.fillRect(0,0,size,size);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
// Soft cumulus puff built from overlapping radial blobs.
export function cloudTexture(rand,size=128){
 const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');
 for(let i=0;i<22;i++){const a=rand()*Math.PI*2,d=rand()*size*.22,x=size/2+Math.cos(a)*d,y=size/2+Math.sin(a)*d*.6,rad=size*(.14+rand()*.16);
  const r=g.createRadialGradient(x,y,0,x,y,rad);r.addColorStop(0,'rgba(255,255,255,.42)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,size,size);}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

const VERT=`attribute float size;attribute float alpha;attribute vec3 tint;uniform float scale;varying float vAlpha;varying vec3 vTint;
void main(){vAlpha=alpha;vTint=tint;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=alpha<=0.?0.:clamp(size*scale/max(-mv.z,.1),0.,420.);}`;
const FRAG_ADD=`varying float vAlpha;varying vec3 vTint;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float core=exp(-d*d*3.2);gl_FragColor=vec4(vTint*(core+pow(core,6.)*.8),vAlpha*core);}`;
const FRAG_SMOKE=`varying float vAlpha;varying vec3 vTint;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float a=smoothstep(1.,.15,d);gl_FragColor=vec4(vTint,vAlpha*a*a);}`;

// A fixed-size pool of point sprites. Each particle fades its alpha over its life and grows.
export class Particles{
 constructor(max,additive){
  this.max=max;this.cursor=0;
  const g=new THREE.BufferGeometry();
  this.pos=new Float32Array(max*3);this.size=new Float32Array(max);this.alpha=new Float32Array(max);this.tint=new Float32Array(max*3);
  this.vel=new Float32Array(max*3);this.life=new Float32Array(max);this.maxLife=new Float32Array(max);this.size0=new Float32Array(max);this.grow=new Float32Array(max);this.alpha0=new Float32Array(max);this.drag=new Float32Array(max);this.gravity=new Float32Array(max);
  g.setAttribute('position',new THREE.BufferAttribute(this.pos,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('size',new THREE.BufferAttribute(this.size,1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('alpha',new THREE.BufferAttribute(this.alpha,1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('tint',new THREE.BufferAttribute(this.tint,3).setUsage(THREE.DynamicDrawUsage));
  this.material=new THREE.ShaderMaterial({uniforms:{scale:{value:400}},vertexShader:VERT,fragmentShader:additive?FRAG_ADD:FRAG_SMOKE,transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending});
  this.points=new THREE.Points(g,this.material);this.points.frustumCulled=false;this.points.renderOrder=additive?3:2;this.active=0;
 }
 spawn(x,y,z,vx,vy,vz,life,size,grow,r,g,b,alpha=1,drag=0,gravity=0){
  const i=this.cursor;this.cursor=(this.cursor+1)%this.max;const i3=i*3;
  this.pos[i3]=x;this.pos[i3+1]=y;this.pos[i3+2]=z;this.vel[i3]=vx;this.vel[i3+1]=vy;this.vel[i3+2]=vz;
  this.tint[i3]=r;this.tint[i3+1]=g;this.tint[i3+2]=b;this.life[i]=this.maxLife[i]=life;this.size[i]=this.size0[i]=size;this.grow[i]=grow;this.alpha[i]=this.alpha0[i]=alpha;this.drag[i]=drag;this.gravity[i]=gravity;
  this.active=Math.max(this.active,1);
 }
 update(dt){
  if(!this.active)return;let alive=0;const P=this.pos,V=this.vel;
  for(let i=0;i<this.max;i++){
   if(this.life[i]<=0){if(this.alpha[i]){this.alpha[i]=0;}continue;}
   alive++;const l=this.life[i]-=dt;const i3=i*3;
   if(l<=0){this.alpha[i]=0;continue;}
   const k=this.drag[i]?Math.exp(-this.drag[i]*dt):1;V[i3]*=k;V[i3+1]=V[i3+1]*k-this.gravity[i]*dt;V[i3+2]*=k;
   P[i3]+=V[i3]*dt;P[i3+1]+=V[i3+1]*dt;P[i3+2]+=V[i3+2]*dt;
   const t=1-l/this.maxLife[i];this.size[i]=this.size0[i]*(1+this.grow[i]*t);
   // Quick fade-in, long fade-out.
   this.alpha[i]=this.alpha0[i]*Math.min(1,t*12)*(1-t)*(1-t*.3);
  }
  const a=this.points.geometry.attributes;a.position.needsUpdate=a.size.needsUpdate=a.alpha.needsUpdate=a.tint.needsUpdate=true;
  if(!alive)this.active=0;
 }
 clear(){this.life.fill(0);this.alpha.fill(0);this.points.geometry.attributes.alpha.needsUpdate=true;}
}

// Expanding additive rings for sonic booms, explosions and ring pickups.
export class Shockwaves{
 constructor(scene,count=14){
  this.pool=[];const geo=new THREE.RingGeometry(.78,1,64);
  for(let i=0;i<count;i++){const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false}));m.visible=false;m.renderOrder=4;scene.add(m);this.pool.push({m,life:0,max:1,from:1,to:10,op:1,face:null});}
  this.i=0;
 }
 // face: 'camera' to billboard, or a Vector3 direction the ring's normal should follow.
 spawn(pos,color,from,to,life,opacity=.8,face='camera'){
  const s=this.pool[this.i++%this.pool.length];s.m.position.copy(pos);s.m.material.color.set(color);s.life=s.max=life;s.from=from;s.to=to;s.op=opacity;s.face=face;s.m.visible=true;
  if(face!=='camera')s.m.lookAt(pos.clone().add(face));
 }
 update(dt,camera){
  for(const s of this.pool){if(!s.m.visible)continue;s.life-=dt;if(s.life<=0){s.m.visible=false;continue;}
   const t=1-s.life/s.max,e=1-Math.pow(1-t,3),r=s.from+(s.to-s.from)*e;s.m.scale.setScalar(r);
   // Fade rings that would sweep through the camera into a screen-filling arc.
   const near=Math.min(1,s.m.position.distanceTo(camera.position)/(r*1.4));s.m.material.opacity=s.op*(1-t)*(1-t)*near*near;
   if(s.face==='camera')s.m.quaternion.copy(camera.quaternion);}
 }
 clear(){for(const s of this.pool){s.m.visible=false;s.life=0;}}
}
