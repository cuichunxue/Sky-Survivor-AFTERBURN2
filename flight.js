export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const damp=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
export function segmentDistance(a,b){const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;const q=dx*dx+dy*dy+dz*dz;const t=q?clamp(-(a.x*dx+a.y*dy+a.z*dz)/q,0,1):0;return Math.hypot(a.x+dx*t,a.y+dy*t,a.z+dz*t);}
export function islandHeight(x,z,island){const dx=(x-island.x)/island.radius,dz=(z-island.z)/island.radius;const r=Math.hypot(dx,dz);if(r>=1)return -4;return Math.max(-4,Math.pow(1-r*r,2)*island.height*(.76+.13*Math.sin(dx*8+dz*4)+.11*Math.cos(dz*9-dx*3))-5);}
