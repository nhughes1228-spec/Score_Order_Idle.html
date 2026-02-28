(() => {
// Game content and progression tables for Score Order Idle.
// This file is intentionally data-heavy to keep main.js focused on runtime logic/UI.

// ---------- Real Note Art (from /assets) ----------
const NOTE_STAGES = [
  { id:"whole",         label:"Whole Note",        img:"assets/note-whole.png" },
  { id:"dottedHalf",    label:"Dotted Half",       img:"assets/note-half-dotted.png" },
  { id:"half",          label:"Half Note",         img:"assets/note-half.png" },
  { id:"dottedQuarter", label:"Dotted Quarter",    img:"assets/note-quarter-dotted.png" },
  { id:"quarter",       label:"Quarter Note",      img:"assets/note-quarter.png" },
  { id:"dottedEighth",  label:"Dotted Eighth",     img:"assets/note-eighth-dotted.png" },
  { id:"eighth",        label:"Eighth Note",       img:"assets/note-eighth.png" },
];
const BATON_ITEM = {
  id: "baton",
  name: "Baton",
  baseCost: 10,
  costMult: 1.15,
  basePer: 0.12
};
const MUSIC_LIBRARY_CONFIG = {
  defaultBpm: 120,
  defaultPracticePerSecond: 1,
  unlockBaseCost: 10,
  unlockCostGrowth: 1.08,
  defaultVelocity: 0.6,
};
const ENDGAME_LIBRARY_UNLOCK = {
  requiredPatrons: 1000000,
  gainBasePatrons: 1000000
};
const MUSIC_LIBRARY_DEMO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work>
    <work-title>Codex Miniature</work-title>
  </work>
  <identification>
    <creator type="composer">Demo Composer</creator>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>2</duration>
      </note>
      <note>
        <chord/>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>2</duration>
      </note>
      <note>
        <rest/>
        <duration>2</duration>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>2</duration>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>4</duration>
      </note>
    </measure>
  </part>
</score-partwise>`;
function totalCostToOwnUnits(baseCost, costMult, units){
  if (!units || units <= 0) return 0;
  if (Math.abs(costMult - 1) < 1e-9) return Math.floor(baseCost * units);
  return Math.floor(baseCost * ((Math.pow(costMult, units) - 1) / (costMult - 1)));
}
function scaledUnlockCost(baseCost, costMult, units, ratio){
  const totalToUnlock = totalCostToOwnUnits(baseCost, costMult, units);
  return Math.max(1, Math.floor(totalToUnlock * ratio));
}
function buildBatonUpgrades(){
  const defs = [
    { id:"bt_fermata",     name:"Fermata Hold",           desc:"Upgrade to Dotted Half. Baton click x1.55.",         requireBatons: 10,   setStage: 1, clickMult: 1.55, priceRatio: 0.32 },
    { id:"bt_cue",         name:"Confident Cue",          desc:"Upgrade to Half Note. Baton click x1.30.",           requireBatons: 25,   setStage: 2, clickMult: 1.30, priceRatio: 0.34 },
    { id:"bt_crescendo",   name:"Crescendo Sweep",        desc:"Upgrade to Dotted Quarter. Baton click x1.16.",      requireBatons: 50,   setStage: 3, clickMult: 1.16, priceRatio: 0.36 },
    { id:"bt_syncopation", name:"Gesture of Syncopation", desc:"Upgrade to Quarter Note. Baton click x1.12.",        requireBatons: 100,  setStage: 4, clickMult: 1.12, priceRatio: 0.38 },
    { id:"bt_ritardando",  name:"Ritardando Control",     desc:"Upgrade to Dotted Eighth. Baton click x1.10.",       requireBatons: 150,  setStage: 5, clickMult: 1.10, priceRatio: 0.40 },
    { id:"bt_precision",   name:"Precision Flick",        desc:"Upgrade to Eighth Note. Baton click x1.08.",         requireBatons: 200,  setStage: 6, clickMult: 1.08, priceRatio: 0.42 },
    { id:"bt_legato",      name:"Legato Arc",             desc:"Advanced baton flow. Baton click x1.07.",             requireBatons: 250,                 clickMult: 1.07, priceRatio: 0.44 },
    { id:"bt_marcato",     name:"Marcato Strike",         desc:"Accented strike control. Baton click x1.06.",         requireBatons: 500,                 clickMult: 1.06, priceRatio: 0.46 },
    { id:"bt_prestissimo", name:"Prestissimo Pulse",      desc:"Rapid precision control. Baton click x1.05.",         requireBatons: 750,                 clickMult: 1.05, priceRatio: 0.48 },
    { id:"bt_maestro",     name:"Maestro's Signature",    desc:"Signature conducting power. Baton click x1.05.",      requireBatons: 1000,                clickMult: 1.05, priceRatio: 0.50 },
  ];

  return defs.map(u => ({
    ...u,
    costNotes: scaledUnlockCost(BATON_ITEM.baseCost, BATON_ITEM.costMult, u.requireBatons || 0, u.priceRatio || 0.4)
  }));
}
const BATON_UPGRADES = buildBatonUpgrades();
function hasBatonTechnique(s, id){
  return !!(s?.batonUpgrades && (s.batonUpgrades[id] || 0) > 0);
}
function batonUpgradeUnlockedInState(s, u){
  const idx = BATON_UPGRADES.findIndex(x => x.id === u.id);
  if (idx < 0) return false;
  const prevOk = (idx === 0) || hasBatonTechnique(s, BATON_UPGRADES[idx - 1].id);
  return prevOk && ((s.batonOwned || 0) >= (u.requireBatons || 0));
}


// ---------- Buildings ----------
const BUILDINGS = [
  { id:"piccolo",     name:"Piccolo",       family:"Winds",   baseCost: 15,     costMult: 1.15, nps: 0.1 },
  { id:"flute",       name:"Flute",         family:"Winds",   baseCost: 100,    costMult: 1.15, nps: 1   },
  { id:"oboe",        name:"Oboe",          family:"Winds",   baseCost: 1100,   costMult: 1.15, nps: 8   },
  { id:"enghorn",     name:"English Horn",  family:"Winds",   baseCost: 12000,  costMult: 1.15, nps: 47  },
  { id:"bassoon",     name:"Bassoon",       family:"Winds",   baseCost: 130000, costMult: 1.15, nps: 260 },
  { id:"contrabassoon", name:"Contrabassoon", family:"Winds", baseCost: 1.4e6,  costMult: 1.15, nps: 1400},
  { id:"clarinet",       name:"Clarinet",         family:"Winds",   baseCost: 2.0e7,   costMult: 1.15, nps: 7.8e3 },
  { id:"basscl",         name:"Bass Clarinet",    family:"Winds",   baseCost: 1.0e8,   costMult: 1.15, nps: 3.9e4 },

  { id:"horn",           name:"French Horn",      family:"Brass",   baseCost: 5.0e8,   costMult: 1.15, nps: 1.95e5 },
  { id:"posthorn",       name:"Post Horn",        family:"Brass",   baseCost: 2.5e9,   costMult: 1.15, nps: 9.75e5 },
  { id:"trumpet",        name:"Trumpet",          family:"Brass",   baseCost: 1.25e10, costMult: 1.15, nps: 4.88e6 },
  { id:"picctrumpet",    name:"Piccolo Trumpet",  family:"Brass",   baseCost: 6.25e10, costMult: 1.15, nps: 2.44e7 },
  { id:"rotarytrumpet",  name:"Rotary Trumpet",   family:"Brass",   baseCost: 3.1e11,  costMult: 1.15, nps: 1.22e8 },
  { id:"trombone",       name:"Trombone",         family:"Brass",   baseCost: 1.56e12, costMult: 1.15, nps: 6.1e8 },
  { id:"basstrombone",   name:"Bass Trombone",    family:"Brass",   baseCost: 7.8e12,  costMult: 1.15, nps: 3.05e9 },
  { id:"cimbasso",       name:"Cimbasso",         family:"Brass",   baseCost: 3.9e13,  costMult: 1.15, nps: 1.53e10 },
  { id:"tuba",           name:"Tuba",             family:"Brass",   baseCost: 1.95e14, costMult: 1.15, nps: 7.63e10 },
  { id:"wagnertuba",     name:"Wagner Tuba",      family:"Brass",   baseCost: 9.75e14, costMult: 1.15, nps: 3.81e11 },

  { id:"timpani",        name:"Timpani",          family:"Perc",    baseCost: 4.9e15,  costMult: 1.15, nps: 1.91e12 },
  { id:"xylophone",      name:"Xylophone",        family:"Perc",    baseCost: 2.45e16, costMult: 1.15, nps: 9.53e12 },
  { id:"marimba",        name:"Marimba",          family:"Perc",    baseCost: 1.23e17, costMult: 1.15, nps: 4.77e13 },
  { id:"perc",           name:"Snare Drum",       family:"Perc",    baseCost: 6.15e17, costMult: 1.15, nps: 2.38e14 },
  { id:"bassdrum",       name:"Bass Drum",        family:"Perc",    baseCost: 3.08e18, costMult: 1.15, nps: 1.19e15 },
  { id:"crashcymbals",   name:"Crash Cymbals",    family:"Perc",    baseCost: 1.54e19, costMult: 1.15, nps: 5.96e15 },
  { id:"tambourine",     name:"Tambourine",       family:"Perc",    baseCost: 7.7e19,  costMult: 1.15, nps: 2.98e16 },
  { id:"triangle",       name:"Triangle",         family:"Perc",    baseCost: 3.85e20, costMult: 1.15, nps: 1.49e17 },

  { id:"harp",           name:"Harp",             family:"Other",   baseCost: 1.93e21, costMult: 1.15, nps: 7.45e17 },
  { id:"harpsichord",    name:"Harpsichord",      family:"Other",   baseCost: 9.65e21, costMult: 1.15, nps: 3.73e18 },
  { id:"piano",          name:"Piano",            family:"Other",   baseCost: 4.83e22, costMult: 1.15, nps: 1.86e19 },
  { id:"celeste",        name:"Celeste",          family:"Other",   baseCost: 2.42e23, costMult: 1.15, nps: 9.31e19 },
  { id:"organ",          name:"Organ",            family:"Other",   baseCost: 1.21e24, costMult: 1.15, nps: 4.66e20 },

  { id:"vln1",           name:"Violin I",         family:"Strings", baseCost: 6.05e24, costMult: 1.15, nps: 2.33e21 },
  { id:"vln2",           name:"Violin II",        family:"Strings", baseCost: 3.03e25, costMult: 1.15, nps: 1.16e22 },
  { id:"viola",          name:"Viola",            family:"Strings", baseCost: 1.52e26, costMult: 1.15, nps: 5.82e22 },
  { id:"cello",          name:"Cello",            family:"Strings", baseCost: 7.6e26,  costMult: 1.15, nps: 2.91e23 },
  { id:"bass",           name:"Bass",             family:"Strings", baseCost: 3.8e27,  costMult: 1.15, nps: 1.45e24 },
];
const FAMILY_ORDER = [
  { id:"Winds",   label:"Woodwinds",  defaultOpen:true },
  { id:"Brass",   label:"Brass",      defaultOpen:false },
  { id:"Perc",    label:"Percussion", defaultOpen:false },
  { id:"Strings", label:"Strings",    defaultOpen:false },
  { id:"Other",   label:"Other",      defaultOpen:false },
];

// ---------- NOTE Upgrades (per-building ladder) ----------
const UPGRADE_MILESTONES = [10, 25, 50, 100, 150, 200, 250, 500, 1000];
const UPGRADE_PRICE_RATIOS = [0.30, 0.32, 0.34, 0.36, 0.38, 0.40, 0.42, 0.45, 0.48];
const UPGRADE_NAME_TEMPLATES = [
  "Etude Book",
  "Better Pads",
  "Handcrafted Mouthpiece",
  "Sectional Rehearsals",
  "Masterclass Series",
  "Principal Auditions",
  "Touring Season",
  "Legendary Legacy",
  "Immortal Repertoire"
];
const noteUpgradeId = (buildingId, tierIdx) => `nu_${buildingId}_${tierIdx}`;
function buildNoteUpgrades(){
  const upgrades = [];
  for (const b of BUILDINGS){
    for (let i=0;i<UPGRADE_MILESTONES.length;i++){
      const milestone = UPGRADE_MILESTONES[i];
      const ratio = UPGRADE_PRICE_RATIOS[i] || 0.4;
      upgrades.push({
        id: noteUpgradeId(b.id, i),
        buildingId: b.id,
        family: b.family,
        name: `${UPGRADE_NAME_TEMPLATES[i]}`,
        desc: `${b.name} output x2 (requires ${milestone} owned)`,
        costNotes: scaledUnlockCost(b.baseCost, b.costMult, milestone, ratio),
        requireOwned: milestone,
        apply: (s)=>{ s.buildingMult[b.id] *= 2; }
      });
    }
  }
  return upgrades;
}
const NOTE_UPGRADES = buildNoteUpgrades();

// ---------- Achievements ----------
function countPurchased(obj){
  if (!obj) return 0;
  let n = 0;
  for (const k of Object.keys(obj)){
    if (obj[k]) n++;
  }
  return n;
}

function fmtInt(n){
  return Math.floor(Math.max(0, n || 0)).toLocaleString();
}

function progressLine(cur, target){
  return `${fmtInt(cur)} / ${fmtInt(target)}`;
}

function buildAchievements(){
  const list = [];
  const add = (a) => list.push(a);
  const NPS_MINOR = 1.004;
  const NPS_MAJOR = 1.006;
  const CLICK_MINOR = 1.004;
  const CLICK_MAJOR = 1.006;

  const makeTiered = ({
    idPrefix,
    namePrefix,
    descPrefix,
    kind,
    thresholds,
    mult,
    mults,
    valueFn
  }) => {
    thresholds.forEach((target, i) => {
      const reward = (mults && mults[i] !== undefined) ? mults[i] : mult;
      add({
        id: `${idPrefix}_${i}`,
        name: `${namePrefix} ${i + 1}`,
        desc: `${descPrefix} ${fmtInt(target)}.`,
        kind,
        mult: reward,
        target,
        unlocked: (s) => valueFn(s) >= target,
        progress: (s) => progressLine(valueFn(s), target)
      });
    });
  };

  makeTiered({
    idPrefix: "ach_life_notes",
    namePrefix: "Archivist",
    descPrefix: "Reach lifetime notes",
    kind: "nps",
    thresholds: [1e3, 1e5, 1e7, 1e9, 1e11, 1e13],
    mult: NPS_MINOR,
    valueFn: (s) => s.lifetimeNotes || 0
  });

  makeTiered({
    idPrefix: "ach_run_notes",
    namePrefix: "Standing Ovation",
    descPrefix: "Reach run notes",
    kind: "click",
    thresholds: [5e4, 2e5, 1e6, 5e6, 2e7],
    mult: CLICK_MINOR,
    valueFn: (s) => s.runNotes || 0
  });

  makeTiered({
    idPrefix: "ach_clicks",
    namePrefix: "Conductor's Wrist",
    descPrefix: "Reach total clicks",
    kind: "click",
    thresholds: [100, 1000, 10000, 50000, 200000],
    mult: CLICK_MINOR,
    valueFn: (s) => s.stats?.clicks || 0
  });

  makeTiered({
    idPrefix: "ach_owned",
    namePrefix: "Full Ensemble",
    descPrefix: "Own instruments (total)",
    kind: "nps",
    thresholds: [25, 100, 250, 600, 1200],
    mult: NPS_MINOR,
    valueFn: (s) => BUILDINGS.reduce((a,b)=>a+(s.owned?.[b.id]||0), 0)
  });

  makeTiered({
    idPrefix: "ach_ink",
    namePrefix: "Ink Keeper",
    descPrefix: "Hold Ink",
    kind: "click",
    thresholds: [10, 100, 500, 2000],
    mult: CLICK_MINOR,
    valueFn: (s) => s.ink || 0
  });

  makeTiered({
    idPrefix: "ach_patrons",
    namePrefix: "Patron Circle",
    descPrefix: "Earn patrons (lifetime)",
    kind: "nps",
    thresholds: [1, 5, 20, 60],
    mult: NPS_MAJOR,
    valueFn: (s) => s.patronsEver || 0
  });

  makeTiered({
    idPrefix: "ach_baton",
    namePrefix: "Technique Chain",
    descPrefix: "Purchase baton techniques",
    kind: "click",
    thresholds: [1, 3, 6, 8, 10],
    mult: CLICK_MAJOR,
    valueFn: (s) => countPurchased(s.batonUpgrades)
  });

  makeTiered({
    idPrefix: "ach_facility_up",
    namePrefix: "Venue Steward",
    descPrefix: "Purchase facility upgrades",
    kind: "nps",
    thresholds: [3, 10, 20, 35],
    mult: NPS_MAJOR,
    valueFn: (s) => countPurchased(s.facility?.purchasedUpgrades)
  });

  makeTiered({
    idPrefix: "ach_batons_owned",
    namePrefix: "Baton Stockpile",
    descPrefix: "Own Batons",
    kind: "click",
    thresholds: [24, 34, 44, 68, 98, 128],
    mult: CLICK_MINOR,
    valueFn: (s) => s.batonOwned || 0
  });

  makeTiered({
    idPrefix: "ach_ink_earned",
    namePrefix: "Ink Ledger",
    descPrefix: "Earn total Ink",
    kind: "click",
    thresholds: [50, 500, 5000, 50000],
    mult: CLICK_MINOR,
    valueFn: (s) => s.stats?.inkEarned || 0
  });

  makeTiered({
    idPrefix: "ach_archive",
    namePrefix: "Archive Scholar",
    descPrefix: "Purchase Archive upgrades",
    kind: "nps",
    thresholds: [2, 5, 9, 12, 14],
    mult: NPS_MINOR,
    valueFn: (s) => countPurchased(s.inkUpgrades)
  });

  makeTiered({
    idPrefix: "ach_synergy",
    namePrefix: "Synergy Architect",
    descPrefix: "Purchase synergies",
    kind: "nps",
    thresholds: [1, 3, 6, 10],
    mult: NPS_MAJOR,
    valueFn: (s) => countPurchased(s.synergyUpgrades)
  });

  makeTiered({
    idPrefix: "ach_note_stage",
    namePrefix: "Note Evolution",
    descPrefix: "Unlock note stage",
    kind: "click",
    thresholds: [1, 3, 6],
    mult: CLICK_MAJOR,
    valueFn: (s) => s.noteStageIdx || 0
  });

  const woodwinds = BUILDINGS.filter(b => b.family === "Winds").map(b => b.id);
  const brass = BUILDINGS.filter(b => b.family === "Brass").map(b => b.id);
  const strings = BUILDINGS.filter(b => b.family === "Strings").map(b => b.id);
  const percussion = BUILDINGS.filter(b => b.family === "Perc").map(b => b.id);
  const windThresholds = [1, 10, 25, 50, 100];
  windThresholds.forEach((target) => {
    add({
      id: `ach_woodwind_all_${target}`,
      name: `Woodwind Corps ${target}`,
      desc: `Own ${target} of each woodwind instrument.`,
      kind: "nps",
      mult: NPS_MAJOR,
      target,
      unlocked: (s) => woodwinds.every(id => (s.owned?.[id] || 0) >= target),
      progress: (s) => {
        const minOwned = woodwinds.reduce((m,id)=>Math.min(m, s.owned?.[id] || 0), Number.POSITIVE_INFINITY);
        return progressLine(minOwned, target);
      }
    });
  });

  [1, 5, 15, 35, 75].forEach((target) => {
    add({
      id: `ach_brass_all_${target}`,
      name: `Brass Line ${target}`,
      desc: `Own ${target} of each brass instrument.`,
      kind: "nps",
      mult: NPS_MAJOR,
      target,
      unlocked: (s) => brass.every(id => (s.owned?.[id] || 0) >= target),
      progress: (s) => {
        const minOwned = brass.reduce((m,id)=>Math.min(m, s.owned?.[id] || 0), Number.POSITIVE_INFINITY);
        return progressLine(minOwned, target);
      }
    });
  });

  [1, 5, 15, 35, 75].forEach((target) => {
    add({
      id: `ach_strings_all_${target}`,
      name: `String Choir ${target}`,
      desc: `Own ${target} of each string instrument.`,
      kind: "nps",
      mult: NPS_MAJOR,
      target,
      unlocked: (s) => strings.every(id => (s.owned?.[id] || 0) >= target),
      progress: (s) => {
        const minOwned = strings.reduce((m,id)=>Math.min(m, s.owned?.[id] || 0), Number.POSITIVE_INFINITY);
        return progressLine(minOwned, target);
      }
    });
  });

  [1, 8, 20, 45, 90].forEach((target) => {
    add({
      id: `ach_perc_all_${target}`,
      name: `Percussion Core ${target}`,
      desc: `Own ${target} of each percussion instrument.`,
      kind: "nps",
      mult: NPS_MAJOR,
      target,
      unlocked: (s) => percussion.every(id => (s.owned?.[id] || 0) >= target),
      progress: (s) => {
        const minOwned = percussion.reduce((m,id)=>Math.min(m, s.owned?.[id] || 0), Number.POSITIVE_INFINITY);
        return progressLine(minOwned, target);
      }
    });
  });

  const allFamilies = [
    { ids: woodwinds, key: "Winds" },
    { ids: brass, key: "Brass" },
    { ids: strings, key: "Strings" },
    { ids: percussion, key: "Perc" },
  ];
  [5, 20, 60].forEach((target) => {
    add({
      id: `ach_sections_balanced_${target}`,
      name: `Balanced Sections ${target}`,
      desc: `Own ${target} total instruments in each section.`,
      kind: "nps",
      mult: NPS_MAJOR,
      target,
      unlocked: (s) => allFamilies.every(f => f.ids.reduce((a,id)=>a + (s.owned?.[id] || 0), 0) >= target),
      progress: (s) => {
        const minSection = allFamilies.reduce((m,f) => {
          const count = f.ids.reduce((a,id)=>a + (s.owned?.[id] || 0), 0);
          return Math.min(m, count);
        }, Number.POSITIVE_INFINITY);
        return progressLine(minSection, target);
      }
    });
  });

  return list;
}
const ACHIEVEMENTS = buildAchievements();

// ---------- Section Synergy Upgrades (Notes) ----------
function buildSynergyUpgrades(){
  const idsByFamily = (fam) => BUILDINGS.filter(b=>b.family===fam).map(b=>b.id);

  const WINDS = idsByFamily("Winds");
  const BRASS = idsByFamily("Brass");
  const STRINGS = idsByFamily("Strings");
  const PERC = idsByFamily("Perc");

  const groupCount = (s, ids) => ids.reduce((a,id)=>a+(s.owned[id]||0), 0);
  const groupBaseCostSum = (ids) => ids.reduce((a,id)=>a+(BUILDINGS.find(b=>b.id===id)?.baseCost||0), 0);

  const windsBase = groupBaseCostSum(WINDS);
  const brassBase = groupBaseCostSum(BRASS);
  const stringsBase = groupBaseCostSum(STRINGS);
  const percBase = groupBaseCostSum(PERC);

  const upgrades = [
    { id:"syn_winds_1", families:["Winds"], name:"Wind Consort", desc:"All Winds output +10%", costNotes: Math.floor(windsBase * 2.5),
      can: s => groupCount(s, WINDS) >= 25, apply: s => WINDS.forEach(id => s.buildingMult[id] *= 1.10) },
    { id:"syn_winds_2", families:["Winds"], name:"Woodwind Orchestra", desc:"All Winds output +25%", costNotes: Math.floor(windsBase * 10),
      can: s => groupCount(s, WINDS) >= 100, apply: s => WINDS.forEach(id => s.buildingMult[id] *= 1.25) },

    { id:"syn_brass_1", families:["Brass"], name:"Brass Choir", desc:"All Brass output +10%", costNotes: Math.floor(brassBase * 2.5),
      can: s => groupCount(s, BRASS) >= 25, apply: s => BRASS.forEach(id => s.buildingMult[id] *= 1.10) },
    { id:"syn_brass_2", families:["Brass"], name:"Symphonic Brass", desc:"All Brass output +25%", costNotes: Math.floor(brassBase * 10),
      can: s => groupCount(s, BRASS) >= 100, apply: s => BRASS.forEach(id => s.buildingMult[id] *= 1.25) },

    { id:"syn_strings_1", families:["Strings"], name:"String Section", desc:"All Strings output +10%", costNotes: Math.floor(stringsBase * 2.5),
      can: s => groupCount(s, STRINGS) >= 25, apply: s => STRINGS.forEach(id => s.buildingMult[id] *= 1.10) },
    { id:"syn_strings_2", families:["Strings"], name:"Philharmonic Strings", desc:"All Strings output +25%", costNotes: Math.floor(stringsBase * 10),
      can: s => groupCount(s, STRINGS) >= 100, apply: s => STRINGS.forEach(id => s.buildingMult[id] *= 1.25) },

    { id:"syn_perc_1", families:["Perc"], name:"Percussion Battery", desc:"All Percussion output +20%", costNotes: Math.floor(percBase * 3.5),
      can: s => groupCount(s, PERC) >= 10, apply: s => PERC.forEach(id => s.buildingMult[id] *= 1.20) },
    { id:"syn_perc_2", families:["Perc"], name:"Rhythmic Engine", desc:"All Percussion output +40%", costNotes: Math.floor(percBase * 14),
      can: s => groupCount(s, PERC) >= 50, apply: s => PERC.forEach(id => s.buildingMult[id] *= 1.40) },

    { id:"syn_doublereeds", families:["Winds"], name:"Double Reeds Studio",
      desc:"Oboe + English Horn + Bassoon + Contrabassoon output x2",
      costNotes: Math.floor((
        BUILDINGS.find(b=>b.id==="oboe").baseCost +
        BUILDINGS.find(b=>b.id==="enghorn").baseCost +
        BUILDINGS.find(b=>b.id==="bassoon").baseCost +
        BUILDINGS.find(b=>b.id==="contrabassoon").baseCost
      ) * 120),
      can: s => ((s.owned.oboe||0) >= 10 && (s.owned.enghorn||0) >= 5 && (s.owned.bassoon||0) >= 10 && (s.owned.contrabassoon||0) >= 5),
      apply: s => ["oboe","enghorn","bassoon","contrabassoon"].forEach(id => s.buildingMult[id] *= 2) },

    { id:"syn_lowbrass", families:["Brass"], name:"Low Brass Foundation",
      desc:"Trombone + Bass Trombone + Cimbasso + Tuba + Wagner Tuba output +60%",
      costNotes: Math.floor((
        BUILDINGS.find(b=>b.id==="trombone").baseCost +
        BUILDINGS.find(b=>b.id==="basstrombone").baseCost +
        BUILDINGS.find(b=>b.id==="cimbasso").baseCost +
        BUILDINGS.find(b=>b.id==="tuba").baseCost +
        BUILDINGS.find(b=>b.id==="wagnertuba").baseCost
      ) * 10),
      can: s => (
        (s.owned.trombone||0) >= 10 &&
        (s.owned.basstrombone||0) >= 5 &&
        (s.owned.cimbasso||0) >= 5 &&
        (s.owned.tuba||0) >= 10 &&
        (s.owned.wagnertuba||0) >= 5
      ),
      apply: s => ["trombone","basstrombone","cimbasso","tuba","wagnertuba"].forEach(id => s.buildingMult[id] *= 1.60) },
  ];

  upgrades.forEach(u => u._can = u.can);
  upgrades.forEach(u => u.can = (s)=>u._can(s));
  return upgrades;
}
const SYNERGY_UPGRADES = buildSynergyUpgrades();

// ---------- Ink (meta) Upgrades ----------
function buildInkUpgrades(){
  const ups = [];

  const npsSteps = [
    {cost:50,   mult:1.005, name:"Margin Notes",         desc:"+0.5% Notes/sec permanently"},
    {cost:100,  mult:1.006, name:"Clean Copy",           desc:"+0.6% Notes/sec permanently"},
    {cost:250,  mult:1.008, name:"Illuminated Initials", desc:"+0.8% Notes/sec permanently"},
    {cost:500,  mult:1.010, name:"Scribe Guild",         desc:"+1% Notes/sec permanently"},
    {cost:1000, mult:1.012, name:"Royal Archive",        desc:"+1.2% Notes/sec permanently"},
    {cost:2500, mult:1.015, name:"Endowment",            desc:"+1.5% Notes/sec permanently"},
    {cost:5000, mult:1.020, name:"Grand Conservatory",   desc:"+2% Notes/sec permanently"},
  ];
  npsSteps.forEach((s, idx)=>{
    ups.push({
      id:`iu_nps_${idx}`,
      group: "nps",
      name:s.name,
      desc:s.desc,
      costInk:s.cost,
      can: st => true,
      apply: st => { st.metaNpsMult *= s.mult; }
    });
  });

  const clickFromNpsSteps = [
    {cost:45,   rate:0.0020, name:"Quick Quill",          desc:"Each click gains +0.2% of your current Notes/sec"},
    {cost:90,   rate:0.0025, name:"Scribe Reflex",        desc:"Each click gains +0.25% of your current Notes/sec"},
    {cost:225,  rate:0.0030, name:"Ink & Tempo",          desc:"Each click gains +0.3% of your current Notes/sec"},
    {cost:450,  rate:0.0035, name:"Virtuoso Penmanship",  desc:"Each click gains +0.35% of your current Notes/sec"},
    {cost:900,  rate:0.0040, name:"Counterpoint Script",  desc:"Each click gains +0.4% of your current Notes/sec"},
    {cost:2250, rate:0.0045, name:"Orchestration Notes",  desc:"Each click gains +0.45% of your current Notes/sec"},
    {cost:4500, rate:0.0050, name:"Maestro Margin",       desc:"Each click gains +0.5% of your current Notes/sec"},
  ];
  clickFromNpsSteps.forEach((s, idx)=>{
    ups.push({
      id:`iu_clicknps_${idx}`,
      group: "clicknps",
      name:s.name,
      desc:s.desc,
      costInk:s.cost,
      can: st => true,
      apply: st => { st.clickFromNpsRate += s.rate; }
    });
  });

  const clickMultSteps = [
    {cost:75,   mult:1.013, name:"Sharper Quill",      desc:"+1.3% click power permanently"},
    {cost:150,  mult:1.017, name:"Steel Nib",          desc:"+1.7% click power permanently"},
    {cost:300,  mult:1.021, name:"Gold Nib",           desc:"+2.1% click power permanently"},
    {cost:600,  mult:1.027, name:"Ivory Baton Grip",   desc:"+2.7% click power permanently"},
    {cost:1200, mult:1.034, name:"Conductor Focus",    desc:"+3.4% click power permanently"},
    {cost:3000, mult:1.043, name:"Virtuoso Wrist",     desc:"+4.3% click power permanently"},
    {cost:7000, mult:1.052, name:"Mythic Pen",         desc:"+5.2% click power permanently"},
  ];
  clickMultSteps.forEach((s, idx)=>{
    ups.push({
      id:`iu_clickmult_${idx}`,
      group: "clickmult",
      name:s.name,
      desc:s.desc,
      costInk:s.cost,
      can: st => true,
      apply: st => { st.metaClickMult *= s.mult; }
    });
  });

  return ups;
}
const INK_UPGRADES = buildInkUpgrades();

// ---------- Facilities (Prestige Spending) ----------
const FACILITY_BASE = [
  { id:"shed",    name:"Mildewy Shed",  desc:"A cramped shed behind the school. The stands wobble if you breathe too hard.",            patronCostToUnlock: 0,    globalMult:{ nps:1.00, click:1.00 } },
  { id:"garage",  name:"One-Car Garage",desc:"Still echoey… but weatherproof, and you can fit a full section inside.",                  patronCostToUnlock: 100,  globalMult:{ nps:1.40, click:1.15 } },
  { id:"bandroom",name:"Band Room",     desc:"Lockers. Posters. A metronome that survived three directors. It feels like home.",         patronCostToUnlock: 250,  globalMult:{ nps:1.85, click:1.25 } },
  { id:"gym",     name:"Gymnasium",     desc:"Huge, loud, unforgiving… but you can finally hear the low brass.",                         patronCostToUnlock: 600,  globalMult:{ nps:1.40, click:1.35 } },
  { id:"pac",     name:"School PAC",    desc:"Real lights. Real stage. Real applause (and stagehands who judge setup time).",            patronCostToUnlock: 1200, globalMult:{ nps:3.25, click:1.55 } },
  { id:"church",  name:"Stone Church",  desc:"Natural reverb for days. Every chord sounds like it means something.",                      patronCostToUnlock: 2200, globalMult:{ nps:4.30, click:1.75 } },
  { id:"hall",    name:"Concert Hall",  desc:"Perfect sightlines. Perfect acoustics. Suddenly… you’re doing real work.",                 patronCostToUnlock: 4000, globalMult:{ nps:6.00, click:2.05 } },
  { id:"famous",  name:"Famous Venue",  desc:"This is where the legends played. The score practically writes itself.",               patronCostToUnlock: 8000, globalMult:{ nps:9.00, click:2.60 } },
];
const FACILITY_PREVIEW_IMAGE = {
  shed: "assets/venue-shed-mildewy.png",
  garage: "assets/venue-garage-car-1.png",
  bandroom: "assets/venue-room-band.png",
  gym: "assets/venue-gymnasium.png",
  pac: "assets/venue-pac-school.png",
  church: "assets/venue-church-stone.png",
  hall: "assets/venue-hall-concert.png",
  famous: "assets/venue-venue-famous.png",
};

const FACILITY_UPGRADE_TEMPLATES = [
  { key:"stands",     name:"Engraved Stands",         kind:"nps"  },
  { key:"podium",     name:"Carved Podium",           kind:"click"},
  { key:"lighting",   name:"Warm Stage Lighting",     kind:"nps"  },
  { key:"acoustics",  name:"Acoustic Treatment",      kind:"nps"  },
  { key:"library",    name:"Score Library Catalog",   kind:"both" },
  { key:"tech",       name:"Stage Tech Crew",         kind:"click"},
  { key:"rehearsal",  name:"Sectional Program",       kind:"nps"  },
  { key:"recording",  name:"Recording Rig",           kind:"both" },
  { key:"patrons",    name:"Patron Experience",       kind:"nps"  },
];

function buildFacilities(){
  const upgradesFor = (facId, nextCost) => {
    const percents = [0.05,0.06,0.07,0.08,0.09,0.10,0.11,0.13,0.15];
    const ups = [];
    for (let i=0;i<FACILITY_UPGRADE_TEMPLATES.length;i++){
      const t = FACILITY_UPGRADE_TEMPLATES[i];
      const pct = percents[i];
      const cost = Math.max(1, Math.round(nextCost * pct));
      const npsMult = 1 + pct * 2.2;
      const clickMult = 1 + pct * 1.6;

      let mult = {};
      let desc = "";
      if (t.kind === "nps"){
        mult = { nps: +(npsMult.toFixed(3)) };
        desc = `+${Math.round((npsMult-1)*100)}% Notes/sec`;
      } else if (t.kind === "click"){
        mult = { click: +(clickMult.toFixed(3)) };
        desc = `+${Math.round((clickMult-1)*100)}% Click power`;
      } else {
        mult = { nps: +( (1 + pct*1.5).toFixed(3) ), click: +( (1 + pct*1.1).toFixed(3) ) };
        desc = `+${Math.round((mult.nps-1)*100)}% Notes/sec & +${Math.round((mult.click-1)*100)}% Click`;
      }

      ups.push({
        id:`${facId}_${t.key}`,
        name:t.name,
        cost,
        desc,
        mult
      });
    }
    return ups;
  };

  const facilities = [];
  for (let i=0;i<FACILITY_BASE.length;i++){
    const f = FACILITY_BASE[i];
    const next = FACILITY_BASE[i+1];
    const nextCost = next ? next.patronCostToUnlock : Math.max(1000, Math.round(f.patronCostToUnlock * 1.5));
    facilities.push({
      ...f,
      upgrades: upgradesFor(f.id, nextCost)
    });
  }
  return facilities;
}
const FACILITIES = buildFacilities();
function getFacility(id){ return FACILITIES.find(f => f.id === id); }

window.ScoreData = {
  NOTE_STAGES,
  BATON_ITEM,
  MUSIC_LIBRARY_CONFIG,
  ENDGAME_LIBRARY_UNLOCK,
  MUSIC_LIBRARY_DEMO_XML,
  BATON_UPGRADES,
  hasBatonTechnique,
  batonUpgradeUnlockedInState,
  BUILDINGS,
  FAMILY_ORDER,
  NOTE_UPGRADES,
  countPurchased,
  ACHIEVEMENTS,
  SYNERGY_UPGRADES,
  INK_UPGRADES,
  FACILITY_PREVIEW_IMAGE,
  FACILITIES,
  getFacility
};
})();
