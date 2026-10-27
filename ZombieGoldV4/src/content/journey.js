// A five-stop rescue journey. Each destination exists because of what happened at the previous one.
export const JOURNEY_CHAPTERS = [
  {name:'断线公路',no:'一',concept:'求救信号来自一辆被困的巴士。',color:'#e8b36b',deep:'#8d5e34',theme:'highway',open:true,steps:['公路上的求救']},
  {name:'最后的服务区',no:'二',concept:'伤员等不起了，阿岚记得路边还有一间诊所。',color:'#a8c7b3',deep:'#4a7567',theme:'highway',open:true,steps:['去诊所取药']},
  {name:'穿过无人区',no:'三',concept:'车队快没油了。农场里的修理工知道一条近路。',color:'#c0aa74',deep:'#756442',theme:'highway',open:true,steps:['荒地加油站','谷仓里的回应']},
  {name:'让人听见我们',no:'四',concept:'修好山顶广播，给仍困在荒野的人一条回来的路。',color:'#92b1ba',deep:'#465f70',theme:'highway',open:true,steps:['山顶广播站']},
];

export const GOODS = {
  wire:{name:'铜线圈',value:180,color:'#bd9562',shape:'wire',rarity:'普通'},
  meds:{name:'密封药箱',value:420,color:'#b5ceb4',shape:'meds',rarity:'任务物资'},
  fuel:{name:'备用燃油',value:360,color:'#d7b768',shape:'fuel',rarity:'任务物资'},
  tools:{name:'精密工具',value:650,color:'#9eaece',shape:'tools',rarity:'精良'},
  radio:{name:'军用收发器',value:1400,color:'#d2b16d',shape:'radio',rarity:'稀有'},
  circuit:{name:'完好的电路板',value:520,color:'#8aba94',shape:'circuit',rarity:'精良'},
  photo:{name:'阿岚的全家照',value:0,color:'#c6b8a3',shape:'photo',rarity:'纪念物'},
};
export const GEAR = [
  {id:'mag',name:'扩容弹匣',price:450,desc:'每次出发射速 +20%',icon:'ammo'},
  {id:'barrel',name:'改良枪管',price:950,desc:'每次出发伤害 +25%',icon:'rifle'},
  {id:'vest',name:'防护背心',price:750,desc:'每次出发多一层护盾',icon:'shield'},
];

const point=(id,kind,name,people,items,extra={})=>({id,kind,name,people,items,guards:5,guardHp:12,required:true,...extra});
const optional=(id,kind,name,items,extra={})=>point(id,kind,name,0,items,{required:false,escape:true,alarm:true,guards:5,guardHp:18,...extra});
const base=(ch,code,title,scene,startN,seq,story,boss)=>({ch,code,title,experience:true,journey:true,learn:story.goal,hint:story.goal,stake:0,run:{startN,army:1,seq},story:{scene,...story},finale:{after:'journey',...(boss?{boss}: {})}});

export const JOURNEY_LEVELS = [
  base(0,'1-1','公路上的求救','highway',5,[
    ['g','+4','+2'],['w',4,5],['b','gun',1,12,'C'],['w',5,7],['g','+6','x2'],['poi','bus'],['w',6,8],['poi','trunk'],
  ],{speaker:'阿岚',call:'有人听见吗？巴士翻在公路上了，里面还有两个人！',goal:'清掉巴士前的感染者，救出阿岚和乘客。',end:'阿岚扶着乘客上车：谢谢。伤口需要药，前面的服务区有间诊所。',intro:'断电后的第三天。一段短促的呼救从车载电台传来。',reward:150,
    pois:[point('bus','bus','侧翻巴士',3,['photo','wire'],{line:'门被卡住了。先清掉车门前的感染者！',found:'阿岚和两名乘客得救了。',action:'打开车门 · 救出 3 人'}),optional('trunk','wreck','遗弃越野车',['wire'],{line:'后备箱上有一把旧锁。继续搜索会有声音，也可以直接带人回车队。',guards:3,guardHp:9})]}),
  base(1,'2-1','去诊所取药','clinic',7,[
    ['g','+5','+3'],['w',5,8],['roll','gun',1,16,'C'],['w',7,10],['poi','clinic'],['g','x2','+10'],['w',8,13],['poi','cabinet'],
  ],{speaker:'阿岚',call:'伤员开始发烧了。白色招牌还在，药柜可能没被翻完。',goal:'拿到诊所的密封药箱，把里面的值班护士一起带走。',end:'药用上了，伤员终于安静下来。司机敲了敲油表：我们得离开公路，去找燃油。',intro:'第一位被救的人，带来了一条值得冒险的线索。',reward:180,
    pois:[point('clinic','clinic','路边诊所',1,['meds'],{line:'值班护士躲在诊室。门前有感染者，她不敢出来。',found:'找到了药箱，值班护士也加入车队。',action:'进入诊所 · 找药救人'}),optional('cabinet','clinic','上锁的药房',['meds','circuit'],{line:'药房防盗警报还接着备用电源。更多药在里面，打开会引来后街的感染者。'})]},
    {hp:420,name:'撞门者',model:'chubby',sec:8,slam:2.9,bite:2}),
  base(2,'3-1','荒地加油站','wasteland',8,[
    ['g','+6','+3'],['ambush',6,10],['b','gun',1,18,'C'],['g','x2','+10'],['w',8,12],['poi','pump'],['w',9,15],['poi','store'],
  ],{speaker:'司机',call:'油灯亮了。地图上这条旧路经过废弃加油站，我们只需要一罐。',goal:'在废弃加油站找到燃油，接上被困的站员。',end:'引擎重新响起来。站员指着田野：老周还在那边的谷仓，他会修那座广播塔。',intro:'柏油到这里结束。最后一条车辙，通向风里的荒地。',reward:210,
    pois:[point('pump','pump','废弃加油站',1,['fuel'],{line:'站员躲在泵房，燃油在铁柜里。先清空门口。',found:'拿到备用燃油，救出了站员。',action:'进入泵房 · 带走燃油'}),optional('store','store','加油站便利店',['wire','radio'],{line:'柜台下面有军用电台。门上的旧警铃还会响——拿到它，可能要打一场硬仗。',guardHp:22})]},
    {hp:550,name:'矿区重感染者',model:'raider',moves:['slam','lane','summon'],sec:8,slam:2.6,bite:2.5}),
  base(2,'3-2','谷仓里的回应','farm',8,[
    ['g','+8','+4'],['w',7,12],['row',['gun',1,20],['men',4,14],['heal',3,14]],['ambush',8,14],['g','x2','+12'],['poi','barn'],['w',10,17],['poi','workbench'],
  ],{speaker:'老周',call:'我是老周。谷仓门外全是它们，我把工具都收好了，别扔下我。',goal:'救出修理工老周和谷仓里的两名孩子。',end:'老周把工具铺在车厢：塔上的供电还能修。孩子们问，广播能叫到他们的家人吗？',intro:'麦田已经荒了。仓门上的三下敲击，回答了电台。',reward:240,
    pois:[point('barn','barn','紧闭的谷仓',3,['tools'],{line:'老周用木板顶着门，两个孩子在他身后。',found:'老周带着孩子们走了出来。',action:'移开门闩 · 救出 3 人',guards:7,guardHp:18}),optional('workbench','workshop','农场维修棚',['tools','circuit'],{line:'这里的电机还在响。多拿一箱工具，会把棚后的感染者引过来。',guards:6,guardHp:22})]},
    {hp:750,name:'谷仓外的巨尸',model:'chubby',big:true,sec:8,slam:2.5,bite:3}),
  base(3,'4-1','让人听见我们','radio',10,[
    ['g','+8','+5'],['w',8,15],['b','gun',1,22,'C'],['shield',4,22],['g','x2','+18'],['poi','station'],['ambush',10,18],['poi','supply'],
  ],{speaker:'老周',call:'塔就在前面。把维修员接出来，接上发射机，这次会有更多人听见。',goal:'救出广播站维修员，恢复求救广播。',end:'“这里是 17 号车队。公路向西仍然通行。听见的人，沿着路标来，我们会接你们。”',intro:'车队已经有了药、燃油和修理工。现在，轮到我们发出信号。',reward:300,
    pois:[point('station','radio','山顶广播站',2,['circuit'],{line:'维修员被困在控制室，发射机就差最后一个接头。',found:'发射机重新亮了。两名维修员加入车队。',action:'接通电源 · 救出维修员',guards:8,guardHp:20}),optional('supply','military','军用储备箱',['radio','tools'],{line:'备用军需库还有装备。广播已经恢复，可以回车队，也可以冒险取走它们。',guards:7,guardHp:26})]},
    {hp:900,name:'被广播引来的巨尸',model:'hulk',moves:['slam','lane','summon'],sec:9,slam:2.5,bite:3}),
];

JOURNEY_LEVELS[0].teach=[{at:'start',freeze:true,text:'左右拖动，清出一条路',sub:'先汇合队员，再靠近求救的巴士',hand:'drag'}];
export const cargoValue = bag => bag.reduce((n,item)=>n+(GOODS[item.type]?.value||0),0);
