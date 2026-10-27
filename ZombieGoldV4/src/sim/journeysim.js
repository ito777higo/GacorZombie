// Search stops use the same squad, bullets and zombie collision rules as the run.
export function startPoint(sim,p){
  if(p.done||sim.activePoint)return false;
  sim.activePoint=p;sim.phase='search';sim.squad.speed=0;
  sim.emit('pointStart',{p});return true;
}
export function requestSearch(sim){
  const p=sim.activePoint;
  if(!p||p.searching)return false;
  // Cover the search with the same guns, or clear the approach first. Enemies do not act as a key.
  p.forced=sim.zombies.some(z=>z.alive&&z.guardPoint===p.id);
  p.searching=true;p.progress=0;sim.emit('searchStart',{p});return true;
}
export function resumePoint(sim){
  const p=sim.activePoint;if(!p||p.required)return false;
  p.done=true;p.skipped=true;sim.activePoint=null;sim.phase='run';sim.emit('pointSkip',{p});return true;
}
export function tickPoint(sim,dt){
  sim.t+=dt;sim.updateZombies(dt);if(sim.phase==='fail')return;
  sim.fire(dt);sim.updateBullets(dt);
  const p=sim.activePoint;if(!p||!p.searching)return;
  p.progress+=dt/(p.forced?2.6:1.4);
  if(p.progress>=1){
    p.done=true;p.progress=1;sim.activePoint=null;sim.phase='run';
    // Rescued civilians board the convoy; they are never converted into soldiers or coins.
    sim.emit('pointFound',{p});
    if(p.alarm||p.forced){
      for(let i=0;i<6+sim.L.ch;i++){
        const z=sim.mkZombie((i%2?1:-1)*(3+sim.rng.next()),sim.squad.z-17-sim.rng.next()*8,8+sim.L.ch*3,1,false);
        z.active=true;z.ambush={side:i%2?1:-1,delay:0};z.wave=3000;z.m=0;sim.zombies.push(z);
      }
      sim.emit('pointAlarm',{p});
    }
  }
}
