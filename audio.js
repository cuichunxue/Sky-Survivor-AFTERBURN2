// Procedural sound for Sky Survivor: engine bed, adaptive music and one-shot effects.
// Everything is synthesized with Web Audio so the game ships without audio files.
import {clamp} from './flight.js';

const mtof=m=>440*Math.pow(2,(m-69)/12);
// A minor, i–VI–III–VII: Am · F · C · G
const CHORDS=[[57,60,64],[53,57,60],[55,60,64],[55,59,62]];
const ROOTS=[45,41,48,43];
// Lead line for the last horizon, one entry per 16th step over 4 bars (-1 = rest).
const LEAD=(()=>{const s=new Array(64).fill(-1);const put=(bar,step,n)=>s[bar*16+step]=n;
 put(0,0,69);put(0,4,72);put(0,6,76);put(0,10,74);put(0,12,72);
 put(1,0,72);put(1,4,69);put(1,6,72);put(1,8,77);put(1,12,76);
 put(2,0,76);put(2,4,79);put(2,8,76);put(2,10,72);put(2,12,74);
 put(3,0,74);put(3,4,71);put(3,8,74);put(3,10,79);put(3,14,76);return s;})();
const PENTA=[0,3,5,7,10];

export class SoundEngine{
 constructor(){this.ctx=null;this.enabled=false;this.level=0;this.bpm=118;this.musicOn=false;this.step=0;this.nextTime=0;this.timer=null;}
 // Builds the graph on first use; must be called from a user gesture on iOS.
 ensure(){
  if(this.ctx){if(this.ctx.state==='suspended'&&!this.paused)this.ctx.resume().catch(()=>{});return true;}
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
  try{
   const c=this.ctx=new AC();
   this.master=c.createGain();this.master.gain.value=this.enabled?.9:0;
   this.muffle=c.createBiquadFilter();this.muffle.type='lowpass';this.muffle.frequency.value=20000;this.muffle.Q.value=.4;
   const comp=c.createDynamicsCompressor();comp.threshold.value=-16;comp.knee.value=10;comp.ratio.value=4;comp.attack.value=.004;comp.release.value=.2;
   this.master.connect(this.muffle);this.muffle.connect(comp);comp.connect(c.destination);
   this.sfx=c.createGain();this.sfx.gain.value=.9;this.sfx.connect(this.master);
   this.music=c.createGain();this.music.gain.value=.42;this.music.connect(this.master);
   this.engineBus=c.createGain();this.engineBus.gain.value=1;this.engineBus.connect(this.master);
   // Short generated hall for chimes, stingers and the lead.
   this.reverb=c.createConvolver();const len=c.sampleRate*2.2,ir=c.createBuffer(2,len,c.sampleRate);
   for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6);}
   this.reverb.buffer=ir;this.reverbSend=c.createGain();this.reverbSend.gain.value=.32;this.reverbSend.connect(this.reverb);this.reverb.connect(this.master);
   const nb=c.createBuffer(1,c.sampleRate*2,c.sampleRate),nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;this.noise=nb;
   this.buildEngine();
  }catch(e){console.warn('audio unavailable',e);this.ctx=null;return false;}
  return true;
 }
 get now(){return this.ctx.currentTime;}
 setEnabled(on){this.enabled=on;if(on)this.ensure();if(!this.ctx)return;this.master.gain.setTargetAtTime(on?.9:0,this.now,.05);if(on&&this.ctx.state==='suspended'&&!this.paused)this.ctx.resume().catch(()=>{});}
 pause(){this.paused=true;this.ctx?.suspend().catch(()=>{});}
 resume(){this.paused=false;this.ctx?.resume().catch(()=>{});}
 // 0 = clear, 1 = heavily muffled (slow motion / impact).
 setMuffle(a){if(!this.ctx)return;this.muffle.frequency.setTargetAtTime(20000*Math.pow(1-clamp(a,0,1)*.97,2.4)+300,this.now,.06);}

 // ---------- continuous engine bed ----------
 buildEngine(){
  const c=this.ctx;
  const mk=(type,f)=>{const o=c.createOscillator();o.type=type;o.frequency.value=f;o.start();return o;};
  this.eOsc1=mk('sawtooth',52);this.eOsc2=mk('sawtooth',52.6);this.eSub=mk('sine',26);
  this.eFilter=c.createBiquadFilter();this.eFilter.type='lowpass';this.eFilter.frequency.value=220;this.eFilter.Q.value=1.4;
  this.eGain=c.createGain();this.eGain.gain.value=0;
  for(const o of [this.eOsc1,this.eOsc2])o.connect(this.eFilter);const subG=c.createGain();subG.gain.value=.6;this.eSub.connect(subG);subG.connect(this.eFilter);
  this.eFilter.connect(this.eGain);this.eGain.connect(this.engineBus);
  this.whine=mk('sine',340);this.whineGain=c.createGain();this.whineGain.gain.value=0;this.whine.connect(this.whineGain);
  this.pan=c.createStereoPanner?c.createStereoPanner():null;if(this.pan){this.whineGain.connect(this.pan);this.pan.connect(this.engineBus);}else this.whineGain.connect(this.engineBus);
  const loop=()=>{const s=c.createBufferSource();s.buffer=this.noise;s.loop=true;s.start(0,Math.random()*1.5);return s;};
  this.windFilter=c.createBiquadFilter();this.windFilter.type='bandpass';this.windFilter.frequency.value=850;this.windFilter.Q.value=.5;this.windGain=c.createGain();this.windGain.gain.value=0;loop().connect(this.windFilter);this.windFilter.connect(this.windGain);this.windGain.connect(this.engineBus);
  this.roarFilter=c.createBiquadFilter();this.roarFilter.type='lowpass';this.roarFilter.frequency.value=380;this.roarGain=c.createGain();this.roarGain.gain.value=0;loop().connect(this.roarFilter);this.roarFilter.connect(this.roarGain);this.roarGain.connect(this.engineBus);
 }
 updateEngine(active,thrust,load,cockpit,bank,speed=0){
  if(!this.ctx)return;const t=this.now,k=active?1:0,cp=cockpit?.62:1;
  this.eGain.gain.setTargetAtTime(k*.032*cp*(1+thrust*.5),t,.12);
  this.eOsc1.frequency.setTargetAtTime(50+thrust*48+load*9,t,.2);this.eOsc2.frequency.setTargetAtTime(50.7+thrust*49+load*9,t,.2);this.eSub.frequency.setTargetAtTime(25+thrust*24,t,.2);
  this.eFilter.frequency.setTargetAtTime((cockpit?200:320)+thrust*700+load*120,t,.15);
  this.whineGain.gain.setTargetAtTime(k*.014*cp*(1+thrust*.6),t,.2);this.whine.frequency.setTargetAtTime(320+thrust*300+load*80,t,.22);
  this.pan?.pan.setTargetAtTime(clamp(bank*.45,-.5,.5),t,.2);
  this.windGain.gain.setTargetAtTime(k*(.02+thrust*.03+load*.025+speed*.012)*cp,t,.25);this.windFilter.frequency.setTargetAtTime((cockpit?600:950)+thrust*900+load*300,t,.3);
  this.roarGain.gain.setTargetAtTime(k*thrust*.055*cp,t,.12);this.roarFilter.frequency.setTargetAtTime(260+thrust*520,t,.15);
 }
 silenceEngine(){if(!this.ctx)return;for(const g of [this.eGain,this.whineGain,this.windGain,this.roarGain]){g.gain.cancelScheduledValues(this.now);g.gain.setTargetAtTime(0,this.now,.05);}}

 // ---------- building blocks ----------
 out(pan=0,dest=this.sfx,wet=0){
  const c=this.ctx,g=c.createGain();let head=g;
  if(c.createStereoPanner&&pan){const p=c.createStereoPanner();p.pan.value=clamp(pan,-.95,.95);g.connect(p);head=p;}
  head.connect(dest);if(wet){const s=c.createGain();s.gain.value=wet;head.connect(s);s.connect(this.reverbSend);}
  return g;
 }
 osc(type,freq,t,dur,vol,{dest=this.sfx,pan=0,wet=0,attack=.005,to=null,filter=null,q=1,detune=0}={}){
  const c=this.ctx,o=c.createOscillator(),g=this.out(pan,dest,wet);o.type=type;o.frequency.setValueAtTime(freq,t);o.detune.value=detune;
  if(to)o.frequency.exponentialRampToValueAtTime(to,t+dur);
  let src=o;if(filter){const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=filter;f.Q.value=q;o.connect(f);src=f;}
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+attack);g.gain.exponentialRampToValueAtTime(.0008,t+dur);
  src.connect(g);o.start(t);o.stop(t+dur+.05);o.onended=()=>g.disconnect();return o;
 }
 noiseHit(t,dur,vol,{type='bandpass',freq=1000,to=null,q=1,pan=0,wet=0,dest=this.sfx,attack=.003}={}){
  const c=this.ctx,s=c.createBufferSource(),f=c.createBiquadFilter(),g=this.out(pan,dest,wet);
  s.buffer=this.noise;s.loop=true;f.type=type;f.frequency.setValueAtTime(freq,t);f.Q.value=q;if(to)f.frequency.exponentialRampToValueAtTime(to,t+dur);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+attack);g.gain.exponentialRampToValueAtTime(.0008,t+dur);
  s.connect(f);f.connect(g);s.start(t,Math.random()*1.2);s.stop(t+dur+.05);s.onended=()=>g.disconnect();return f;
 }
 ok(){return this.enabled&&this.ctx&&this.ctx.state!=='closed';}

 // ---------- effects ----------
 click(){if(!this.ok())return;this.osc('triangle',1200,this.now,.06,.09,{to:900});}
 ring(combo=0,gold=false){if(!this.ok())return;const t=this.now,base=69+12;const deg=Math.min(combo,9);const n=base+PENTA[deg%5]+12*Math.floor(deg/5);
  this.osc('triangle',mtof(n),t,.5,.07,{wet:.6});this.osc('sine',mtof(n+7),t+.06,.6,.05,{wet:.7});
  if(gold)[0,4,7,12].forEach((d,i)=>this.osc('square',mtof(n+d),t+.08*i,.35,.03,{wet:.6,filter:3200}));
  this.noiseHit(t,.3,.04,{type:'highpass',freq:6000,wet:.4});}
 closeCall(pan=0){if(!this.ok())return;const t=this.now,f=this.noiseHit(t,.55,.4,{freq:400,to:2600,q:2.4,pan:clamp(pan,-.9,.9),attack:.12});f.frequency.exponentialRampToValueAtTime(500,t+.55);this.osc('sine',mtof(88),t+.05,.25,.03,{wet:.5});}
 flare(){if(!this.ok())return;const t=this.now;this.noiseHit(t,.45,.2,{freq:900,to:3000,q:.8,attack:.01});
  for(let i=0;i<9;i++)this.noiseHit(t+.05+i*.055+Math.random()*.03,.07,.12,{type:'highpass',freq:2500+Math.random()*3000,pan:(Math.random()-.5)*1.4});
  this.osc('sine',180,t,.3,.12,{to:70});}
 missileLaunch(pan=0,vol=1){if(!this.ok())return;const t=this.now;this.noiseHit(t,1.1,.16*vol,{freq:300,to:1400,q:1.5,pan,attack:.2});this.osc('sawtooth',90,t,.9,.03*vol,{to:180,filter:600,pan});}
 lock(pan=0,urgent=false){if(!this.ok())return;const t=this.now;this.osc('square',urgent?1480:1180,t,.1,.13,{pan,filter:4500});if(urgent)this.osc('square',1480,t+.11,.1,.11,{pan,filter:4500});}
 explosion(vol=1,pan=0,big=false){if(!this.ok())return;const t=this.now,d=big?2.4:1.3;vol=clamp(vol,0,1.2);
  this.noiseHit(t,d,.5*vol,{type:'lowpass',freq:big?5000:3200,to:120,q:.7,pan,wet:.35,attack:.004});
  this.osc('sine',big?110:140,t,d*.6,.55*vol,{to:28,pan});
  this.noiseHit(t,.12,.25*vol,{type:'highpass',freq:3000,pan});
  if(big)for(let i=0;i<6;i++)this.noiseHit(t+.15+Math.random()*.9,.18,.12*vol,{type:'lowpass',freq:1800,to:200,pan:(Math.random()-.5)*1.6});}
 splash(pan=0){if(!this.ok())return;const t=this.now;this.noiseHit(t,.9,.16,{type:'lowpass',freq:2600,to:300,pan,wet:.3});this.osc('sine',90,t,.4,.2,{to:35,pan});}
 hit(){if(!this.ok())return;const t=this.now;this.explosion(.8);this.osc('square',190,t,.35,.12,{to:60,filter:1600});this.osc('sawtooth',260,t,.25,.08,{to:90,filter:1200,detune:30});}
 boom(){if(!this.ok())return;const t=this.now;this.osc('sine',70,t,.9,.5,{to:24});this.noiseHit(t,1.1,.38,{type:'lowpass',freq:1600,to:90,wet:.45,attack:.01});this.noiseHit(t+.02,.5,.15,{freq:600,to:2400,q:.7});}
 stinger(level=1){if(!this.ok())return;const t=this.now;this.noiseHit(t,2.4,.16,{type:'highpass',freq:5000,wet:.6,attack:.002});
  const root=level>1?57:52;[0,7,12,15].forEach(d=>this.osc('sawtooth',mtof(root+d),t,1.6,.045,{filter:1800,wet:.5,detune:(Math.random()-.5)*14}));
  this.osc('sine',55,t,.6,.4,{to:30});
  // Rising siren for incoming hostiles.
  this.osc('sawtooth',440,t+.05,.9,.025,{to:880,filter:2000,wet:.4});}
 riser(dur=2){if(!this.ok())return;const t=this.now;this.noiseHit(t,dur,.12,{freq:300,to:6000,q:2,attack:dur*.9});this.osc('sawtooth',110,t,dur,.03,{to:440,filter:2500,attack:dur*.8});}
 countdown(n){if(!this.ok())return;const t=this.now;if(n>0)this.osc('square',n<=3?1320:990,t,.14,.08,{filter:3500,wet:.25});else this.osc('square',1760,t,.7,.09,{filter:4000,wet:.5});}
 heartbeat(){if(!this.ok())return;const t=this.now;this.osc('sine',62,t,.16,.28,{to:40});this.osc('sine',58,t+.19,.2,.2,{to:38});}
 lowBonus(){if(!this.ok())return;this.noiseHit(this.now,.25,.05,{type:'highpass',freq:3500});}
 victory(){if(!this.ok())return;const t=this.now;[69,73,76,81].forEach((n,i)=>{this.osc('square',mtof(n),t+i*.12,.5,.05,{filter:3000,wet:.5});this.osc('triangle',mtof(n+12),t+i*.12,.5,.035,{wet:.5});});
  [57,61,64,69,73].forEach(n=>this.osc('sawtooth',mtof(n),t+.5,2.6,.035,{filter:2400,wet:.6,attack:.05,detune:(Math.random()-.5)*12}));
  this.noiseHit(t+.5,2.5,.14,{type:'highpass',freq:5000,wet:.6});}
 firework(pan=0){if(!this.ok())return;const t=this.now;this.osc('sine',1800,t,.35,.025,{to:600,pan});this.noiseHit(t+.32,.8,.16,{type:'lowpass',freq:4000,to:500,pan,wet:.5});for(let i=0;i<6;i++)this.noiseHit(t+.45+Math.random()*.6,.05,.06,{type:'highpass',freq:4000,pan});}
 defeat(){if(!this.ok())return;const t=this.now;[64,60,57,52].forEach((n,i)=>this.osc('sawtooth',mtof(n),t+.3+i*.32,.9,.04,{filter:1100,wet:.6,detune:-8}));this.osc('sine',45,t+.3,2.4,.18,{attack:.4});}
 newRecord(){if(!this.ok())return;const t=this.now;[76,79,83,88].forEach((n,i)=>this.osc('triangle',mtof(n),t+i*.07,.4,.05,{wet:.6}));}

 // ---------- adaptive music ----------
 startMusic(level=0,bpm=118){if(!this.ctx)return;this.level=level;this.bpm=bpm;if(this.musicOn)return;this.musicOn=true;this.step=0;this.nextTime=this.now+.08;this.music.gain.cancelScheduledValues(this.now);this.music.gain.setTargetAtTime(.42,this.now,.3);this.timer=setInterval(()=>this.schedule(),25);}
 stopMusic(fade=.4){if(!this.ctx||!this.musicOn)return;this.musicOn=false;clearInterval(this.timer);this.timer=null;this.music.gain.setTargetAtTime(0,this.now,fade/3);}
 setLevel(level,bpm){this.level=level;if(bpm)this.bpm=bpm;}
 schedule(){
  if(!this.ctx||this.ctx.state!=='running'||!this.enabled)return;
  // Catch up gracefully after a stall instead of machine-gunning old notes.
  if(this.nextTime<this.now-.2)this.nextTime=this.now+.05;
  while(this.nextTime<this.now+.14){this.playStep(this.step,this.nextTime);this.nextTime+=60/this.bpm/4;this.step=(this.step+1)%64;}
 }
 playStep(step,t){
  const L=this.level,bar=Math.floor(step/16)%4,s=step%16,chord=CHORDS[bar],root=ROOTS[bar],m=this.music,sixteenth=60/this.bpm/4;
  if(s===0){chord.forEach(n=>{this.osc('sawtooth',mtof(n),t,sixteenth*16,L?.02:.034,{dest:m,filter:L>=2?1500:900,attack:.25,detune:(Math.random()-.5)*16,wet:.5});});
   this.osc('triangle',mtof(root+12),t,sixteenth*16,L?.03:.05,{dest:m,attack:.3});}
  // Arpeggio: 8ths when calm, 16ths once things heat up.
  if(L>=2||s%2===0){const idx=(s>>(L>=2?0:1))%4,n=idx===3?chord[0]+12:chord[idx];this.osc(L>=1?'square':'triangle',mtof(n+12),t,sixteenth*1.6,L>=1?.018:.04,{dest:m,filter:L>=2?3600:2200,wet:.3});}
  if(L>=1){
   if(s%4===0){this.osc('sine',150,t,.32,.42,{dest:m,to:42,attack:.002});this.noiseHit(t,.02,.08,{type:'highpass',freq:3000,dest:m});}
   if(s%2===0){const oct=(s%4===2)?12:0;this.osc('sawtooth',mtof(root+oct),t,sixteenth*1.8,.07,{dest:m,filter:L>=2?720:520,q:5});}
   if(L>=2?true:s%4===2)this.noiseHit(t,s%4===2?.06:.03,s%4===2?.05:.025,{type:'highpass',freq:8000,dest:m});
  }
  if(L>=2&&(s===4||s===12)){this.noiseHit(t,.22,.16,{freq:1800,q:.8,dest:m,wet:.4});this.osc('triangle',190,t,.12,.12,{dest:m,to:130});}
  if(L>=2){const n=LEAD[step];if(n>0){this.osc('square',mtof(n),t,sixteenth*3.2,.026,{dest:m,filter:2600,wet:.5});this.osc('sawtooth',mtof(n),t,sixteenth*3.2,.018,{dest:m,filter:2200,detune:9,wet:.5});}}
  if(L>=3&&s%8===4)this.noiseHit(t,.35,.04,{freq:2000+s*200,to:7000,q:3,dest:m});
 }
}
