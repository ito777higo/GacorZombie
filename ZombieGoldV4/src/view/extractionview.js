import * as THREE from './three.js';
import { EVAC_MODES } from '../content/experience.js';
import { propGeo } from './cast.js';
import { PROP_MAT } from './props.js';

export class ExtractionView {
  constructor(world,sim){
    this.sim=sim;this.group=new THREE.Group();world.scene.add(this.group);
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=1024;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#5c665e';ctx.fillRect(0,0,256,1024);
    ctx.fillStyle='#abb092';ctx.fillRect(6,0,4,1024);ctx.fillRect(246,0,4,1024);
    ctx.fillStyle='#b8b79c';for(let y=20;y<1024;y+=84)ctx.fillRect(125,y,6,40);
    ctx.fillStyle='#d1cfac';ctx.font='900 26px sans-serif';ctx.textAlign='center';ctx.fillText('EVAC',128,150);ctx.fillText('↓',128,210);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
    const floor=new THREE.Mesh(new THREE.BoxGeometry(11.2,.35,43),new THREE.MeshStandardMaterial({map:tex,roughness:1}));floor.userData.ownMap=true;
    floor.position.set(0,-.11,sim.squad.z-13);floor.receiveShadow=true;this.group.add(floor);
    const make=(g,color,opacity)=>{const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}));this.group.add(m);return m;};
    this.beacon=make(new THREE.RingGeometry(1.4,1.8,48),0x8fc9a1,.9);this.beacon.rotation.x=-Math.PI/2;
    this.signalPole=make(new THREE.CylinderGeometry(.08,.08,4,8),0xb9e8ba,.8);
    this.danger=make(new THREE.PlaneGeometry(3.8,12),0xe95b47,.55);this.danger.rotation.x=-Math.PI/2;
    const geo=propGeo('Vehicle_Pickup_Armored');
    if(geo){this.truck=new THREE.Mesh(geo,PROP_MAT);this.truck.userData.sharedGeo=true;this.group.add(this.truck);}
    this.hud=document.createElement('div');this.hud.className='evac-hud';document.getElementById('frame').append(this.hud);
  }
  update(){
    const e=this.sim.extraction,s=this.sim.squad;if(!e)return;
    const p=Math.min(1,e.elapsed/e.duration);
    this.beacon.visible=e.mode==='signal';this.beacon.position.set(e.signalX,.07,s.z-.8);this.beacon.material.opacity=.55+Math.sin(e.realTime*4)*.2;
    this.signalPole.visible=this.beacon.visible;this.signalPole.position.set(e.signalX,2,s.z-.8);
    this.danger.visible=!!e.warning;
    if(e.warning){this.danger.position.set(e.warning.x,.08,s.z-3);this.danger.material.opacity=.25+Math.abs(Math.sin(e.realTime*10))*.45;}
    if(this.truck){this.truck.visible=p>.55;this.truck.position.set(4.3,.03,s.z+18-(p-.55)/.45*15);this.truck.rotation.y=Math.PI;}
    const a=EVAC_MODES[e.mode],left=Math.max(0,Math.ceil(e.duration-e.elapsed));
    this.hud.innerHTML=`<small>撤离阶段 · ${a.name}</small><div><b>${e.complete?'接应到达':`${left} 秒`}</b><span>${e.warning?'危险区即将被扑击 · 向另一侧移动':a.task}</span></div><i><em style="width:${p*100}%"></em></i><p>${e.mode==='supply'?`补给回收 ${e.cargo}/3 · `:e.mode==='signal'?'绿圈内接应加速 · ':''}保持射击，带队活下来</p>`;
    this.hud.classList.toggle('danger',!!e.warning);
  }
  dispose(){
    this.group.traverse(o=>{if(o.isMesh&&!o.userData.sharedGeo){o.geometry.dispose();if(o.userData.ownMap)o.material.map.dispose();o.material.dispose();}});
    this.group.removeFromParent();this.hud.remove();
  }
}
