// Usage: node handoff/verify-browser.cjs http://127.0.0.1:8028/ output-dir [--reference]
// Install Playwright normally, or set PLAYWRIGHT_MODULE to an existing installation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const url=process.argv[2]||'http://127.0.0.1:8028/',out=path.resolve(process.argv[3]||'handoff/evidence/received');fs.mkdirSync(out,{recursive:true});
 const offline=!process.argv.includes('--reference'),origin=new URL(url).origin,browser=await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],failed=[],external=[],art={};
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(offline&&/^https?:/.test(u.protocol)&&u.origin!==origin){external.push(u.href);return r.abort();}return r.continue();});
 page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.status()>=400)failed.push([r.status(),r.url()]);if(/\/assets\/(models|spine)\//.test(r.url())&&r.ok()){try{art[new URL(r.url()).pathname.replace(/^.*\/assets\//,'assets/')]=crypto.createHash('sha256').update(await r.body()).digest('hex');}catch{}}});
 try{
 await page.goto(url);await page.waitForFunction(()=>window.__gf&&document.querySelector('#ovBoot').hidden,null,{timeout:60000});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(400);
 await page.screenshot({path:path.join(out,'map.png')});await page.click('[data-lab]');await page.waitForTimeout(200);await page.screenshot({path:path.join(out,'lab.png')});await page.click('[data-unlock]');await page.click('#mapSheet [data-close]');
 const unlock=await page.evaluate(()=>({flag:__gf.save.unlockAll,disabled:document.querySelectorAll('.route-node:disabled').length}));
 await page.click('[data-i="0"]');await page.click('[data-go]');await page.waitForFunction(()=>['run','intro'].includes(__gf.game.state));await page.evaluate(()=>{__gf.hold=true;__gf.ff(1.5)});
 await page.mouse.move(180,600);await page.mouse.down();await page.mouse.move(255,600);await page.evaluate(()=>__gf.ff(.4));await page.mouse.up();await page.keyboard.down('ArrowLeft');await page.evaluate(()=>__gf.ff(.4));await page.keyboard.up('ArrowLeft');
 await page.evaluate(()=>__gf.ff(3));await page.waitForTimeout(150);await page.screenshot({path:path.join(out,'battlefield.png')});
 for(let k=0;k<260;k++){const s=await page.evaluate(()=>({point:__gf.game.sim.activePoint?.id,state:__gf.game.state}));if(s.point==='bus')break;if(s.state==='result')throw Error('Lost before rescue');await page.evaluate(()=>__gf.ff(.2));}
 await page.evaluate(()=>__gf.ff(.02));await page.screenshot({path:path.join(out,'door.png')});await page.evaluate(()=>{window.__pressedButton=document.querySelector('[data-search]');});
 const bb=await page.locator('[data-search]').boundingBox();if(!bb)throw Error('Door button missing');await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await page.mouse.down();await page.evaluate(()=>__gf.ff(.15));const stable=await page.evaluate(()=>__pressedButton===document.querySelector('[data-search]'));await page.mouse.up();
 const clicked=await page.evaluate(()=>({searching:!!__gf.game.sim.activePoint?.searching,bot:__gf.game.bot||null}));if(!clicked.searching)throw Error('Real door click failed');await page.evaluate(()=>__gf.ff(3));
 for(let k=0;k<260;k++){const s=await page.evaluate(()=>({point:__gf.game.sim.activePoint?.id,state:__gf.game.state}));if(s.point==='trunk')break;if(s.state==='result')throw Error('Lost before convoy');await page.evaluate(()=>__gf.ff(.2));}
 await page.evaluate(()=>__gf.ff(.02));await page.click('[data-leave]');await page.evaluate(()=>__gf.ff(3.5));await page.waitForTimeout(100);
 const first=await page.evaluate(()=>({state:__gf.game.state,phase:__gf.game.sim.phase,people:__gf.game.campaign.outcome?.people,visible:!document.querySelector('#ovResult').hidden}));await page.screenshot({path:path.join(out,'first-result.png')});
 await page.reload();await page.waitForFunction(()=>window.__gf&&document.querySelector('#ovBoot').hidden,null,{timeout:60000});const persisted=await page.evaluate(()=>({unlockAll:__gf.save.unlockAll,disabled:document.querySelectorAll('.route-node:disabled').length}));
 await page.click('[data-i="4"]');await page.click('[data-go]');await page.waitForFunction(()=>['run','intro'].includes(__gf.game.state),null,{timeout:60000});await page.evaluate(()=>{__gf.hold=true;__gf.ff(1.5)});await page.waitForTimeout(300);await page.screenshot({path:path.join(out,'last-level.png')});
 await page.evaluate(async()=>{(await import('./src/platform/audio.js')).audioMeter();});await page.waitForTimeout(250);
 const last=await page.evaluate(async()=>{const {CAST}=await import('./src/view/cast.js'),a=await import('./src/platform/audio.js');return {code:__gf.game.L.code,castFailed:CAST.failed,skeletons:CAST.skeletons.size,models:Object.keys(CAST.props).length,audio:a.audioState(),meter:a.audioMeter()};});
 const pass=stable&&clicked.searching&&!clicked.bot&&first.phase==='done'&&first.visible&&first.people===3&&unlock.flag&&unlock.disabled===0&&persisted.unlockAll&&persisted.disabled===0&&last.code==='4-1'&&!last.castFailed&&last.skeletons>0&&last.audio.loaded&&last.audio.playing&&!last.audio.failed&&!errors.length&&!failed.length&&!external.length;
 const result={pass,offline,checks:{stable,clicked,first,unlock,persisted,last},errors,httpErrors:failed,externalRequests:external,artAssets:art,scope:'Real mouse/keyboard first level, lab unlock, enter level five, reload persistence, original asset responses, audio. No bot or direct search/settlement. All five levels not replayed.'};fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({pass,offline,artAssets:Object.keys(art).length,checks:result.checks,errors,failed,external}));if(!pass)process.exitCode=1;
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
