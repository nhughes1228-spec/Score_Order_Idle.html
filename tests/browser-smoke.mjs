import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import {fileURLToPath,pathToFileURL} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const playwrightPath=process.env.PLAYWRIGHT_MODULE || path.join(process.env.HOME,".codex/skills/develop-web-game/node_modules/playwright/index.mjs");
const {chromium,webkit}=await import(pathToFileURL(playwrightPath));
const server=http.createServer((req,res)=>{
  const file=path.join(root,decodeURIComponent(new URL(req.url,"http://localhost").pathname));
  fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404);res.end();return;}
    const types={".js":"text/javascript",".css":"text/css",".html":"text/html",".json":"application/json",".musicxml":"application/xml"};
    res.setHeader("Content-Type",types[path.extname(file)]||"application/octet-stream");res.end(data);
  });
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url="http://127.0.0.1:"+server.address().port+"/index.html";
const output=path.join(root,"outputs/architecture");fs.mkdirSync(output,{recursive:true});
const engine=process.env.BROWSER === "webkit" ? webkit : chromium;
const browser=await engine.launch({headless:true});
const errors=[];
async function page(options={},seed={}){
  const context=await browser.newContext(options),p=await context.newPage();
  p.setDefaultTimeout(6000);p.on("pageerror",e=>{errors.push(e.stack);console.error("PAGE ERROR",e.stack)});
  await p.addInitScript({content:fs.readFileSync(path.join(root,"game-data.js"),"utf8")+"\n"+fs.readFileSync(path.join(root,"state-save.js"),"utf8")});
  await p.addInitScript(seed=>{
    if(sessionStorage.getItem("test-seeded"))return;
    const s=ScoreState.createDefaultState(ScoreData.BUILDINGS,Date.now);
    s.notes=1e8;s.ui.hasStarted=true;s.ui.tutorialCompleted=true;s.ui.tab="main";s.settings.disableTooltips=true;
    if(seed.fresh){s.notes=0;s.ui.hasStarted=false;s.ui.tutorialCompleted=false;s.ui.tab="start";}
    if(seed.prestige){s.runNotes=500000;s.patrons=100;s.patronsEver=100;s.ui.hasPrestiged=true;}
    if(seed.softCap){s.runNotes=4.9e15;s.patrons=123456;s.patronsEver=234567;s.ui.hasPrestiged=true;}
    if(seed.library){s.library.unlocked=true;s.library.endowments=1;}
    if(seed.skills){s.batonOwned=100; s.owned.piccolo=100;}
    if(seed.endowment){s.patrons=1000000;s.patronsEver=1000000;s.ui.hasPrestiged=true;s.ui.tab="prestige";s.ui.endowmentReadyShown=true;
      for(const f of ScoreData.FACILITIES){s.facility.unlocked[f.id]=true;s.facility.currentId=f.id;for(const up of f.upgrades)s.facility.purchasedUpgrades[up.id]=true;}
    }
    if(seed.empty)s.notes=0;
    localStorage.setItem(ScoreState.SAVE_KEY,JSON.stringify(s));sessionStorage.setItem("test-seeded","true");
  },seed);
  await p.goto(url);await p.waitForTimeout(600);
  return p;
}
const state=p=>p.evaluate(()=>JSON.parse(render_game_to_text()));
try{
  const p=await page();
  await p.evaluate(()=>{window.testButton=document.querySelector("[data-buy=piccolo]");window.testImage=document.querySelector("#noteBtn img");});
  const buy=p.locator("[data-buy=piccolo]");
  await buy.scrollIntoViewIfNeeded();const box=await buy.boundingBox();
  await p.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await p.mouse.down();await p.waitForTimeout(800);await p.mouse.up();
  assert.equal((await state(p)).owned.piccolo,1);
  for(let i=0;i<4;i++){await buy.click();await p.waitForTimeout(160);}
  assert.equal((await state(p)).owned.piccolo,5);
  assert.ok(await p.evaluate(()=>testButton===document.querySelector("[data-buy=piccolo]") && testImage===document.querySelector("#noteBtn img")));
  await buy.focus();await p.keyboard.press("Enter");assert.equal((await state(p)).owned.piccolo,6);
  await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(1,1);await p.mouse.up();
  assert.equal((await state(p)).owned.piccolo,6);
  await p.click("[data-tab=stats]");await p.click("[data-tab=achievements]");await p.click("[data-tab=settings]");await p.click("[data-tab=main]");
  await p.screenshot({path:path.join(output,"desktop.png")});
  console.log("PASS stable first-click/rapid/keyboard/cancelled purchases; navigation");
  const mobile=await page({viewport:{width:390,height:844},isMobile:true,hasTouch:true},{empty:true});
  await mobile.locator("[data-buy=piccolo]").scrollIntoViewIfNeeded();await mobile.waitForTimeout(300);
  const next=mobile.locator("#mBuyMax");await next.focus();await mobile.keyboard.press("ArrowDown");
  assert.ok(await mobile.locator("#dockActionMenu").isVisible());
  await mobile.click("[data-dock-action=upgrades]");assert.equal(await next.isDisabled(),false);
  assert.equal(await mobile.locator("#dBuyMax").textContent(),await next.textContent());
  await next.focus();await mobile.keyboard.press("ArrowDown");await mobile.keyboard.press("Escape");
  assert.equal(await mobile.locator("#dockActionMenu").isVisible(),false);
  await next.focus();await mobile.keyboard.press("ArrowDown");await mobile.click("[data-dock-action=next]");
  await next.focus();await mobile.keyboard.press("Enter");
  assert.ok(await next.evaluate(el=>el.classList.contains("active")));
  const center=await mobile.locator("#mQuickNoteBtn").boundingBox();
  assert.ok(Math.abs(center.x+center.width/2-195)<2,"mobile note centered");
  const before=(await state(mobile)).notes;await mobile.locator("#mQuickNoteBtn").tap();
  assert.ok((await state(mobile)).notes>before);
  await mobile.screenshot({path:path.join(output,"mobile.png")});
  console.log("PASS mobile note centered; touch tap; unavailable action selector; keyboard and Escape");
  const hold=await page({viewport:{width:390,height:844},isMobile:true,hasTouch:true},{skills:true});
  await hold.locator("[data-buy=piccolo]").scrollIntoViewIfNeeded();await hold.waitForTimeout(400);
  await hold.locator("#mBuyMax").focus();await hold.keyboard.press("ArrowDown");await hold.click("[data-dock-action=upgrades]");
  const hb=await hold.locator("#mBuyMax").boundingBox();const money=(await state(hold)).notes;
  await hold.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await hold.mouse.down();await hold.waitForTimeout(600);await hold.mouse.up();
  assert.ok(await hold.locator("#dockActionMenu").isVisible());assert.ok((await state(hold)).notes>=money,"hold must not spend Notes");
  await hold.keyboard.press("Escape");
  console.log("PASS long press opens selector without buying upgrades");
  const fresh=await page({}, {fresh:true});
  assert.equal(await fresh.locator("#mobileActionBar").isVisible(),false);
  await fresh.click("#startBtn");await fresh.waitForTimeout(350);
  assert.ok(await fresh.locator("#tutorialOverlay").evaluate(el=>el.classList.contains("show")));
  await fresh.click("#tutNextBtn");await fresh.waitForTimeout(350);await fresh.click("#tutNextBtn");await fresh.waitForTimeout(350);
  await fresh.screenshot({path:path.join(output,"tutorial.png")});
  assert.equal((await state(fresh)).blocked,true);
  await fresh.click("#tutSkipBtn");await fresh.waitForTimeout(200);
  assert.equal((await state(fresh)).blocked,false);
  assert.equal(await fresh.locator("#prestigeRow").isVisible(),false);
  await fresh.goto(pathToFileURL(path.join(root,"index.html")).href);
  assert.ok(await fresh.locator("#startBtn").isVisible());
  console.log("PASS start/tutorial/hidden prestige; direct file opening");
  const prestige=await page({}, {prestige:true});
  prestige.on("dialog",d=>d.accept());
  await prestige.click("#prestigeBtn");assert.equal((await state(prestige)).patrons,101);
  assert.ok(await prestige.locator("#facilityName").isVisible());
  await prestige.click("[data-tab=settings]");await prestige.click("#resetBtn");
  assert.ok(await prestige.locator("#startBtn").isVisible());
  assert.equal((await state(prestige)).patrons,0);
  assert.equal(await prestige.evaluate(()=>localStorage.getItem(ScoreState.SAVE_KEY+"_backup")),null);
  console.log("PASS prestige and hard reset including backup");
  const music=await page({}, {library:true});
  const fixture='<score-partwise><work><work-title>Timing</work-title></work><part id="P1"><measure number="1"><attributes><divisions>2</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="start"/></note><note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note><note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="stop"/></note><backup><duration>4</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration></note><forward><duration>4</duration></forward></measure><measure number="2"><note><rest/><duration>2</duration></note></measure></part><part id="ignored"><measure><note><rest/><duration>99</duration></note></measure></part></score-partwise>';
  const events=await music.evaluate(xml=>ScoreMusicXML.parseMusicXML(xml).events,fixture);
  assert.deepEqual(events.map(e=>e.startTimeBeats),[0,0,1,4]);assert.deepEqual(events[0].pitches,[60,64]);assert.equal(events[3].type,"rest");
  await music.evaluate(xml=>{
    const s=ScoreState.createDefaultState(ScoreData.BUILDINGS,Date.now);
    s.library.works.old={id:"old",xmlText:xml,events:[{idx:0},{idx:1},{idx:2},{idx:3}],unlockedCount:3,practice:87,practicePerSecond:1};
    ScoreLibrary.ensureLibraryState(s);
    if(s.library.works.old.practice!==87 || s.library.works.old.unlockedCount!==3 || s.library.works.old.events[1].startTimeBeats!==0)throw Error("reparse lost progress");
  },fixture);
  const supplied=fs.readFileSync(path.join(root,"assets/music/mary-had-a-little-lamb.musicxml"),"utf8");
  const score=await music.evaluate(xml=>ScoreMusicXML.parseMusicXML(xml).events,supplied);
  assert.ok(score.some((e,i)=>i>0&&e.startTimeBeats===score[i-1].startTimeBeats));
  const measures=[...new Set(score.map(e=>e.measureNumber))];
  for(let i=1;i<measures.length;i++){
    const prev=score.filter(e=>e.measureNumber===measures[i-1]);
    const current=score.filter(e=>e.measureNumber===measures[i]);
    assert.equal(Math.min(...current.map(e=>e.startTimeBeats)),Math.max(...prev.map(e=>e.startTimeBeats+e.durationBeats)));
  }
  await music.click("[data-tab=library]");
  assert.equal(await music.locator("#desktopBuyDock").isVisible(),false);
  await music.click("[data-lib-open-work]");
  await music.evaluate(()=>{
    window.tones=[];
    window.AudioContext=class {
      state="running";currentTime=0;destination={};
      createOscillator(){const tone={start:t=>tones.push(t),stop(){},disconnect(){},connect(){},frequency:{setValueAtTime(){}}};return tone;}
      createGain(){return {connect(){},disconnect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}};}
    };
    const s=ScoreState.createDefaultState(ScoreData.BUILDINGS,Date.now);
    s.library.works.test={id:"test",events:[{idx:0,type:"note",startTimeBeats:0,durationBeats:1,pitches:[60]},{idx:1,type:"note",startTimeBeats:0,durationBeats:1,pitches:[48]},{idx:2,type:"note",startTimeBeats:1,durationBeats:1,pitches:[62]}],unlockedCount:2,bpm:120,practice:0,xmlText:""};
    ScoreLibrary.playUnlocked(s,"test");
  });
  assert.deepEqual(await music.evaluate(()=>tones),[.05,.05]);assert.ok(await music.evaluate(()=>ScoreLibrary.isPlaying()));
  await music.click("[data-tab=main]");assert.equal(await music.evaluate(()=>ScoreLibrary.isPlaying()),false);
  await music.click("[data-tab=library]");await music.screenshot({path:path.join(output,"music.png")});
  console.log("PASS backup/forward/chords/ties/first-part parser; supplied simultaneous staves; migration; partial audio and navigation stop");
  const endowment=await page({}, {endowment:true});
  endowment.on("dialog",d=>d.accept());
  await endowment.click("#endowmentOfferBtn");
  assert.ok(await endowment.locator("#startBtn").isVisible());
  const endowed=await endowment.evaluate(()=>JSON.parse(localStorage.getItem(ScoreState.SAVE_KEY)));
  assert.equal(endowed.library.endowments,1);assert.equal(endowed.library.unlocked,true);assert.equal(endowed.facility.currentId,"shed");
  console.log("PASS endowment UI reset and Music Library unlock");
  const timed=await page({}, {skills:true,library:true});
  await timed.evaluate(()=>{
    window.testNow=Date.now();Date.now=()=>testNow;
    window.testHidden=true;Object.defineProperty(document,"hidden",{configurable:true,get:()=>testHidden});
    document.dispatchEvent(new Event("visibilitychange"));
    window.testBefore=JSON.parse(localStorage.getItem(ScoreState.SAVE_KEY));
    window.testNps=JSON.parse(render_game_to_text()).nps;
    testNow+=7*3600000;
  });
  await timed.waitForTimeout(350);
  assert.equal((await state(timed)).notes,await timed.evaluate(()=>testBefore.notes));
  await timed.evaluate(()=>{testHidden=false;document.dispatchEvent(new Event("visibilitychange"));});
  const elapsed=await timed.evaluate(()=>({now:JSON.parse(render_game_to_text()),before:testBefore,nps:testNps}));
  assert.ok(Math.abs(elapsed.now.notes-elapsed.before.notes-elapsed.nps*21600)<.01);
  const once=elapsed.now.notes;
  await timed.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));
  assert.equal((await state(timed)).notes,once);
  await timed.click("[data-tab=settings]");await timed.click("#saveBtn");
  const catchup=await timed.evaluate(()=>JSON.parse(localStorage.getItem(ScoreState.SAVE_KEY)));
  const wid=catchup.library.order[0];
  assert.ok(Math.abs(catchup.library.works[wid].practice-elapsed.before.library.works[wid].practice-21600)<.01);
  assert.equal(catchup.stats.clicks,elapsed.before.stats.clicks);
  await timed.reload();assert.equal((await state(timed)).notes,once);
  console.log("PASS browser background catch-up cap, Practice, repeated visibility and reload (no double credit)");
  const softCap=await page({}, {softCap:true});
  assert.equal((await state(softCap)).patrons,123456);
  assert.ok((await softCap.locator("#patronLine").textContent()).includes("Take-a-bow Gain: +3149"));
  const nextLabel=await softCap.evaluate(()=>{
    const rules=ScoreEconomy.createProgressionRules(ScoreData);
    return "Next Patron in: "+ScoreRender.fmtExact(rules.runNotesUntilNextPatron({runNotes:4.9e15}),true)+" Notes";
  });
  assert.equal(await softCap.locator("#nextPatronInfo").textContent(),nextLabel);
  await softCap.locator("#prestigeRow").scrollIntoViewIfNeeded();
  await softCap.screenshot({path:path.join(output,"patron-soft-cap.png")});
  softCap.on("dialog",d=>d.accept());
  await softCap.click("#prestigeBtn");
  assert.equal((await state(softCap)).patrons,126605);
  await softCap.reload();assert.equal((await state(softCap)).patrons,126605);
  console.log("PASS softened prestige preview, Next Patron label, reward and save reload");
  const failure=await page();
  await failure.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error("quota exceeded")};});
  await failure.click("[data-tab=settings]");await failure.click("#saveBtn");
  assert.ok(await failure.locator("#saveStatus").isVisible());assert.equal((await state(failure)).notes,1e8);
  console.log("PASS visible write-failure warning without resetting game");
  assert.deepEqual(errors,[]);
  console.log("All browser checks passed without page errors.");
}finally{await browser.close();server.close();}
