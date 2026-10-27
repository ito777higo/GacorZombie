import * as THREE from './three.js';
import {LEVELS} from '../content/levels.js';
import {save} from '../platform/save.js';
import {roadTexture,skyTexture} from './textures.js';
import {box,cylinder,landmark,prop,survivor,mat} from './journeyart.js';

export class MapView {
  constructor(world){
    this.world=world;world.clearLevel();world.setTheme('highway');world.mapDiorama=this;
    world.scene.background=skyTexture('#738e8c','#b9c6b1','#dfd4ad');
    world.scene.fog.near=350;world.scene.fog.far=800;
    const g=this.group=world.levelGroup;
    const sc=world.sun.shadow.camera,old=[sc.left,sc.right,sc.top,sc.bottom,sc.far];
    sc.left=-40;sc.right=40;sc.top=50;sc.bottom=-50;sc.far=160;sc.updateProjectionMatrix();
    world.onClear=()=>{[sc.left,sc.right,sc.top,sc.bottom,sc.far]=old;sc.updateProjectionMatrix();world.resize(world.w,world.h);};
    box(g,61,2.1,79,0,-1.15,-8,'#9b9478');
    const colors=['#8b9587','#a9ae8d','#bbab81','#8d9e6b','#92a68e'];
    const coords=[[-9,17],[9,4],[-9,-9],[9,-22],[-6,-36]];
    this.nodes=coords.map(([x,z],i)=>({i,p:new THREE.Vector3(x,0,z),ch:LEVELS[i].ch}));
    this.nodes.forEach((n,i)=>{
      box(g,57,.05,15,0,-.04,n.p.z,colors[i]);
      const lm=landmark(LEVELS[i].story.pois[0].kind);lm.position.set(n.p.x,0,n.p.z-2);lm.scale.setScalar(.78);g.add(lm);
      n.landmark=lm;
      const pad=new THREE.Mesh(new THREE.CylinderGeometry(2.1,2.25,.3,32),mat(save.cleared[i]?'#a2ba80':'#c1b48c'));pad.position.set(n.p.x,.15,n.p.z+3.5);g.add(pad);
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(.22,10,8),new THREE.MeshBasicMaterial({color:save.cleared[i]?'#99d190':i===Math.min(save.next,4)?'#f3d47d':'#9bada4'}));lamp.position.set(n.p.x,3.8,n.p.z+2);g.add(lamp);n.lamp=lamp;
    });
    const pts=[new THREE.Vector3(-17,.06,30),...this.nodes.map(n=>new THREE.Vector3(n.p.x,.06,n.p.z+3.5)),new THREE.Vector3(-2,.06,-45)];
    const curve=new THREE.CatmullRomCurve3(pts,false,'centripetal'),samples=curve.getSpacedPoints(240),pos=[],uv=[],ids=[];let len=0;
    samples.forEach((p,i)=>{const a=samples[Math.max(0,i-1)],b=samples[Math.min(samples.length-1,i+1)],dx=b.x-a.x,dz=b.z-a.z,h=Math.hypot(dx,dz)||1,nx=-dz/h,nz=dx/h;if(i)len+=p.distanceTo(samples[i-1]);pos.push(p.x+nx*1.3,.22,p.z+nz*1.3,p.x-nx*1.3,.22,p.z-nz*1.3);uv.push(0,len/6,1,len/6);if(i){const j=(i-1)*2;ids.push(j,j+2,j+1,j+1,j+2,j+3);}});
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(ids);geo.computeVertexNormals();
    const road=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:roadTexture(),roughness:1}));road.receiveShadow=true;g.add(road);
    for(const [x,z,h]of[[-22,23,6],[-16,10,5],[-23,3,8],[23,10,4]]){box(g,5,h,5,x,h/2,z,'#7c8c81');for(const dx of[-1.2,1.2])for(let y=2;y<h;y+=2)box(g,.8,.8,.04,x+dx,y,z+2.52,'#465e59');}
    for(let i=0;i<13;i++){const x=(i%2?1:-1)*(19+(i%3)*3),z=21-i*5;cylinder(g,.15,2.4,x,1.2,z,'#6e654d');if(i%2){const crown=new THREE.Mesh(new THREE.DodecahedronGeometry(1.5,0),mat('#6e8b5e'));crown.position.set(x,3,z);g.add(crown);}}
    for(let z=-14;z>-30;z-=4)for(const x of[20,24,28])box(g,1,.3,3,x,.15,z,'#b3a26e');
    prop(g,'Debris_BrokenCar',-16,0,23,1,.2);
    this.truck=prop(g,'Vehicle_Pickup_Armored',-15,0,27,.8,.3);
    for(let i=0;i<3;i++)survivor(g,-17+i*.65,25,{scale:.7,color:'#c5a06d'});
    world.applyEnv(g);this.fit(world.h*.12,world.h*.72);
  }
  animate(dt){this.time=(this.time||0)+dt;this.nodes.forEach((n,i)=>{n.lamp.position.y=3.8+Math.sin(this.time*2+i)*.15;n.lamp.scale.setScalar(i===Math.min(save.next,4)?1.15+Math.sin(this.time*3)*.15:1);});}
  fit(top,bottom){
    const w=this.world,cam=w.camera;cam.fov=35;cam.updateProjectionMatrix();
    const dir=new THREE.Vector3(0,.87,.49),look=new THREE.Vector3(0,0,-7);let d=115;
    const pts=[];for(const n of this.nodes)pts.push([n.p.x-6,n.p.z],[n.p.x+6,n.p.z],[n.p.x,n.p.z-6],[n.p.x,n.p.z+8]);
    for(let k=0;k<7;k++){
      w.camLook.copy(look);w.camPos.copy(look).addScaledVector(dir,d);w.update(0);cam.updateMatrixWorld();
      let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
      for(const[x,z]of pts){const p=w.project(x,1,z,{x:0,y:0});x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}
      d*=Math.max((x1-x0)/(w.w-36),(y1-y0)/(bottom-top));
      const a=new THREE.Vector3(),b=new THREE.Vector3();w.unproject((x0+x1)/2,(y0+y1)/2,0,a);w.unproject(w.w/2,(top+bottom)/2,0,b);look.x+=a.x-b.x;look.z+=a.z-b.z;
    }
    w.camLook.copy(look);w.camPos.copy(look).addScaledVector(dir,d);w.update(0);cam.updateMatrixWorld();
  }
  layout(){return {nodes:this.nodes.map(n=>({i:n.i,...this.world.project(n.p.x,.5,n.p.z+4,{x:0,y:0})}))};}
  dispose(){this.world.clearLevel();}
}
