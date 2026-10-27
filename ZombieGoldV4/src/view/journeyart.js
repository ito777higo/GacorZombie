// Scene-native art: the same props, depth, lighting and shadows in the map and in the playable road.
import * as THREE from './three.js';
import {propGeo} from './cast.js';
import {PROP_MAT} from './props.js';

export const mat=(color)=>new THREE.MeshStandardMaterial({color,roughness:.87});
export function box(group,w,h,d,x,y,z,color){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;group.add(m);return m;}
export function cylinder(group,r,h,x,y,z,color){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,10),mat(color));m.position.set(x,y,z);m.castShadow=true;group.add(m);return m;}
export function prop(group,name,x,y,z,scale=1,ry=0){const geo=propGeo(name);if(!geo)return null;const m=new THREE.Mesh(geo,PROP_MAT);m.userData.sharedGeo=true;m.userData.sharedMat=true;m.position.set(x,y,z);m.scale.setScalar(scale);m.rotation.y=ry;m.castShadow=m.receiveShadow=true;group.add(m);return m;}
export function sign(group,text,x,y,z,{color='#ded8bf',ink='#35483b',w=5,h=1.4}={}){
  const c=document.createElement('canvas');c.width=512;c.height=160;const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,512,160);g.strokeStyle=ink;g.lineWidth=10;g.strokeRect(5,5,502,150);g.fillStyle=ink;g.font='900 62px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,256,84,475);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:tex,roughness:1,side:THREE.DoubleSide}));m.position.set(x,y,z);group.add(m);return m;
}
export function survivor(group,x,z,{color='#cc9667',scale=1}={}){
  const g=new THREE.Group();group.add(g);g.position.set(x,0,z);g.scale.setScalar(scale);
  box(g,.42,.68,.32,0,.74,0,color);const head=new THREE.Mesh(new THREE.SphereGeometry(.23,10,8),mat('#ddbaa0'));head.position.y=1.32;g.add(head);
  box(g,.14,.45,.17,-.12,.2,0,'#43545d');box(g,.14,.45,.17,.12,.2,0,'#43545d');
  box(g,.12,.48,.13,-.3,.84,0,color).rotation.z=-.3;box(g,.12,.48,.13,.3,.84,0,color).rotation.z=.3;return g;
}
export function landmark(kind,label){
  const g=new THREE.Group();g.userData.people=[];
  if(kind==='bus'){
    box(g,3.1,2.2,6.3,0,1.55,0,'#d4ad64');box(g,3.2,.3,6.4,0,2.8,0,'#e0d4b4');
    for(const sd of [-1,1])for(let i=0;i<5;i++)box(g,.04,.85,.7,sd*1.58,1.94,-2.4+i*1.15,'#485b5e');
    box(g,2.65,.9,.04,0,2,-3.17,'#526769');for(const sd of [-1,1])for(const z of [-2.1,2.1]){const w=cylinder(g,.48,.25,sd*1.5,.45,z,'#343b3b');w.rotation.z=Math.PI/2;}
    sign(g,'SOS',0,3.6,0,{w:3,h:1,color:'#f1dec1',ink:'#a74e37'});
  }else if(kind==='pump'){
    box(g,6,.4,4,0,3.7,0,'#ac5140');for(const x of [-2.4,2.4])cylinder(g,.12,3.6,x,1.8,0,'#c9bda4');
    for(const x of [-1.4,1.4]){box(g,.9,1.6,.7,x,.85,0,'#b7533f');box(g,.65,.45,.05,x,1.3,.39,'#ccd8c9');}
    box(g,5,2.5,3,0,1.25,-3.4,'#b0a18a');sign(g,'FUEL 17',0,3.9,2.1,{w:4.9,h:1});
  }else if(kind==='wreck'){
    prop(g,'Debris_BrokenCar',0,0,0,1.5,.2)||box(g,2.5,1.1,4,0,.7,0,'#7b8b7d');
    box(g,1.8,.25,1.5,0,1.3,1.5,'#536a5b').rotation.x=-.5;
  }else{
    const barn=kind==='barn',radio=kind==='radio',mil=kind==='military';
    box(g,6,3.1,4.5,0,1.55,0,barn?'#985c43':mil?'#657462':'#c3b79c');
    if(barn){const roof=new THREE.Mesh(new THREE.ConeGeometry(4.3,2,4),mat('#635a47'));roof.rotation.y=Math.PI/4;roof.scale.z=.8;roof.position.y=4.1;g.add(roof);}
    else box(g,6.5,.35,4.9,0,3.3,0,radio?'#607379':'#71856c');
    box(g,1.8,2.35,.12,0,1.2,2.33,'#49534b');for(const x of [-2,2])box(g,1.1,1,.14,x,1.9,2.34,'#78968d');
    if(radio){cylinder(g,.14,11,3.8,5.5,-1.2,'#6f7e7c');for(let y=5;y<11;y+=2)box(g,3,.1,.1,3.8,y,-1.2,'#87978e');const dish=new THREE.Mesh(new THREE.SphereGeometry(1.2,14,8,0,Math.PI),mat('#c4c9bd'));dish.position.set(3.8,7,-1.2);dish.rotation.z=.3;g.add(dish);}
    sign(g,kind==='clinic'?'CLINIC +':radio?'RADIO 17':barn?'FARM 04':mil?'SUPPLY':'SERVICE',0,3.3,2.51,{w:5,h:.95,color:kind==='clinic'?'#c9dfd5':'#d3d2b3',ink:kind==='clinic'?'#846451':'#3c5449'});
  }
  const door=new THREE.Group();door.position.set(-.9,0,kind==='bus'?3.25:2.55);g.add(door);
  for(const y of [.8,1.5])box(door,2,.16,.12,1,y,0,'#a58a58').rotation.z=y>1?.16:-.14;
  g.userData.door=door;
  if(kind==='radio'){
    g.userData.waves=[];
    for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.025,5,40),new THREE.MeshBasicMaterial({color:'#b7dcb1',transparent:true,opacity:.6}));ring.position.set(3.8,9.6,-1.2);ring.rotation.x=Math.PI/2;ring.visible=false;g.add(ring);g.userData.waves.push(ring);}
  }
  const light=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),new THREE.MeshBasicMaterial({color:'#b5dec3'}));light.position.set(0,3.1,2.5);g.add(light);g.userData.light=light;
  if(kind==='bus')g.rotation.z=-.45;
  return g;
}
export function lootModel(type){
  const g=new THREE.Group();
  if(type==='fuel'){box(g,.7,1,.45,0,.5,0,'#c1a751');box(g,.4,.15,.2,0,1.07,0,'#75683c');}
  else if(type==='wire'){for(let i=0;i<4;i++){const m=new THREE.Mesh(new THREE.TorusGeometry(.34,.09,6,14),mat('#b68a51'));m.position.set(0,.5,i*.12);g.add(m);}}
  else if(type==='meds'){box(g,1,.65,.55,0,.4,0,'#cfddc5');box(g,.14,.45,.02,0,.44,.29,'#a35b4b');box(g,.45,.14,.02,0,.44,.3,'#a35b4b');}
  else{box(g,1,.65,.65,0,.4,0,type==='radio'?'#61796b':'#7b8c8c');for(let x=-.3;x<.5;x+=.2)box(g,.08,.16,.03,x,.5,.35,'#c6ccb4');if(type==='radio')cylinder(g,.03,.8,.32,1,0,'#bac3ad');}
  return g;
}
