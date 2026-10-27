import * as THREE from './three.js';
import {groundTexture,roadTexture,skyTexture} from './textures.js';
import {box,cylinder,prop,sign,landmark,survivor,lootModel,mat} from './journeyart.js';

const PALETTES={
  highway:{ground:'asphalt',sky:['#738a88','#b5b9a3','#e2ceb0'],fog:'#c0c3ae',soil:'#696b5d',road:true},
  clinic:{ground:'dirt',sky:['#788b8c','#b9c6b6','#e1d9c0'],fog:'#b9c5b4',soil:'#a39e83',road:true},
  wasteland:{ground:'ash',sky:['#867d69','#c1ac85','#e7d0a4'],fog:'#c6b397',soil:'#bba682',road:false},
  farm:{ground:'grass',sky:['#708b80','#b0c0a0','#e3d1a8'],fog:'#b8bea0',soil:'#84915f',road:false},
  radio:{ground:'dirt',sky:['#3f626c','#809b99','#b7bc9e'],fog:'#8caaa2',soil:'#89917b',road:true},
};
export function buildJourneyWorld(w,sim){
  w.clearLevel();w.setTheme('highway');const g=w.levelGroup,L=sim.L,P=PALETTES[L.story.scene];
  w.scene.background=skyTexture(...P.sky);w.scene.fog=new THREE.Fog(P.fog,58,180);w.hemi.color.set('#fff5da');w.hemi.groundColor.set('#61715e');w.hemi.intensity=1.25;w.sun.color.set('#ffe3b4');w.sun.intensity=1.7;w.rim.intensity=.55;
  const end=sim.platZ-45,len=35-end,center=(35+end)/2;
  const groundTex=groundTexture(P.ground);groundTex.repeat.set(15,len/12);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,len),new THREE.MeshStandardMaterial({map:groundTex,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(0,-.09,center);ground.receiveShadow=true;g.add(ground);
  const roadTex=P.road?roadTexture():groundTexture('dirt');roadTex.repeat.set(1,len/14);
  const road=new THREE.Mesh(new THREE.PlaneGeometry(11.2,len),new THREE.MeshStandardMaterial({map:roadTex,roughness:1,color:P.road?'#b8b9a6':'#c2b28d'}));road.rotation.x=-Math.PI/2;road.position.set(0,.015,center);road.receiveShadow=true;g.add(road);
  const seed=sim.L.code.length*577+L.ch*177;let n=seed;const rand=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
  const farFromPoint=z=>sim.pois.every(p=>Math.abs(p.z-z)>15);
  for(let z=15;z>end;z-=12){
    for(const sd of [-1,1]){
      const x=sd*(7.5+rand()*7);
      if(L.story.scene==='highway'&&farFromPoint(z)){
        const h=4+rand()*10,b=box(g,5+rand()*4,h,6,sd*(16+rand()*7),h/2,z,'#7b8277');
        for(let y=2;y<h-1;y+=2.6)for(const dx of [-1.4,1.4])box(g,.9,.85,.04,b.position.x+dx,y,z+3.02,rand()>.3?'#3b5555':'#b9ae81');
        if(rand()>.3)prop(g,'Debris_BrokenCar',sd*8.5,0,z,1.1,sd*.25);
        box(g,.25,1.7,7,sd*6.3,.85,z,'#8b8c76');
      }else{
        const r=new THREE.Mesh(new THREE.DodecahedronGeometry(.6+rand(),0),mat(P.soil));r.position.set(x,.25,z);r.scale.y=.6;g.add(r);
        if(rand()>.35){cylinder(g,.15,2.7,x,1.35,z,'#695a48');for(let k=0;k<2;k++){const branch=box(g,.08,1.5,.08,x+(k?-.3:.3),2.4,z,'#695a48');branch.rotation.z=k?.5:-.5;}}
        if(L.story.scene==='farm'){for(let j=0;j<3;j++)box(g,.15,.6,5,sd*(11+j*3),.3,z,'#b09e5e');box(g,.12,1,8,sd*8,.5,z,'#8b7b55');}
        if(L.story.scene==='clinic'&&farFromPoint(z)&&rand()>.5){prop(g,'PA_Container_Green',sd*12,0,z,.8,Math.PI/2);}
      }
      if(rand()>.6)prop(g,'PA_TrafficBarrier_1',sd*6.6,0,z,.9,Math.PI/2);
      if(rand()>.72)prop(g,'PA_Pallet',sd*7.2,0,z,1,rand());
    }
  }
  if(P.road)for(let z=5;z>end;z-=35){cylinder(g,.08,6.5,-7,3.25,z,'#5c6b64');box(g,1.9,.15,.3,-6.25,6.4,z,'#63746c');}
  const points=[];
  for(const p of sim.pois){
    const model=landmark(p.kind,p.name);model.position.set(p.x<0?-8:8,0,p.z-3);model.scale.setScalar(.93);g.add(model);
    const beacon=new THREE.Mesh(new THREE.ConeGeometry(.42,1,4),new THREE.MeshBasicMaterial({color:p.required?'#d7bd75':'#9bbac2'}));beacon.position.set(model.position.x,5.4,p.z);g.add(beacon);
    sign(g,p.required?'SOS':'SEARCH',model.position.x,4.7,p.z+2,{w:3.7,h:1,color:p.required?'#dbcfa1':'#a5c2bf'});
    const people=[];for(let i=0;i<p.people;i++)people.push(survivor(g,model.position.x+(i-1)*.5,p.z-.25,{color:i===0?'#bc805b':'#9aa88d',scale:i>0&&p.kind==='barn'?.75:1}));
    points.push({p,model,beacon,people,baseX:model.position.x});
  }
  const exit=new THREE.Group();exit.position.set(0,0,sim.standZ-5);g.add(exit);
  box(exit,10,.5,.45,0,1.1,0,'#a78051');box(exit,.22,1.5,.5,-4.6,.75,0,'#666b5a');box(exit,.22,1.5,.5,4.6,.75,0,'#666b5a');
  sign(g,'CONVOY 17',-8,3,sim.standZ+8,{w:5,h:1.2,color:'#9cad8c'});
  const truck=prop(g,'Vehicle_Pickup_Armored',4.3,0,sim.standZ+11,1,Math.PI);
  w.applyEnv(g);w.storyScene={points,exit,truck,sim,boarding:0};
}

export function updateJourneyWorld(w,sim,dt,boarding=0){
  const scene=w.storyScene;if(!scene||scene.sim!==sim)return;
  for(const q of scene.points){
    q.beacon.visible=!q.p.done;q.beacon.rotation.y+=dt*.7;q.beacon.position.y=5.4+Math.sin(sim.t*2)*.18;
    if(q.p.done&&!q.p.skipped){
      q.model.userData.door.rotation.y+=(-1.7-q.model.userData.door.rotation.y)*Math.min(1,dt*4);
      for(const [i,ring]of(q.model.userData.waves||[]).entries()){const t=(sim.t*.55+i/3)%1;ring.visible=true;ring.scale.setScalar(.5+t*4);ring.material.opacity=(1-t)*.65;}
      q.people.forEach((person,i)=>{person.position.x+=(sim.squad.x-person.position.x)*Math.min(1,dt*2);person.position.z+=(sim.squad.z+2+i*.5-person.position.z)*Math.min(1,dt*2);if(Math.abs(person.position.x-sim.squad.x)<.6)person.visible=false;});
      q.model.userData.light.material.color.set(q.p.alarm?'#dc654b':'#b8dc9e');
    }
  }
  const open=boarding>0||(!sim.boss&&sim.phase==='done')||(sim.boss&&!sim.boss.alive);
  if(open)scene.exit.rotation.z+=(Math.PI/2-scene.exit.rotation.z)*Math.min(1,dt*3);
  if(boarding&&scene.truck){scene.truck.visible=true;scene.truck.position.set(3.8,0,sim.squad.z+10-boarding*5);}
}
