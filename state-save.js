(() => {
// Save/load helpers with backward compatibility for Score Order Idle.
const SAVE_KEY = "score_order_idle_v10";
const LEGACY_SAVE_KEYS = [
  "score_order_idle_v9",
  "score_order_idle_v8",
  "score_order_idle_v7",
  "score_order_idle_v6",
  "score_order_idle_v5",
  "score_order_idle_v4",
  "score_order_idle_v3",
];
function createDefaultState(buildings, nowFn){
  return {
    version: 10,
    notes: 0,
    lifetimeNotes: 0,
    runNotes: 0,
    ink: 0,
    patrons: 0,
    patronsEver: 0,
    owned: Object.fromEntries(buildings.map(b=>[b.id,0])),
    buildingMult: Object.fromEntries(buildings.map(b=>[b.id,1])),
    noteUpgrades: {},
    synergyUpgrades: {},
    runClickMult: 1,
    runNpsMult: 1,
    inkUpgrades: {},
    metaNpsMult: 1,
    metaClickMult: 1,
    clickFromNpsRate: 0,
    noteStageIdx: 0,
    batonUpgrades: {},
    batonOwned: 0,
    batonBaseExtra: 0,
    batonClickMult: 1,
    achievements: {},
    achNpsMult: 1,
    achClickMult: 1,
    facility: {
      currentId: "shed",
      unlocked: { shed: true },
      purchasedUpgrades: {},
      baseBonus: {
        shed: { nps: 1, click: 1 }
      }
    },
    buyMode: "1",
    ui: {
      tab: "main",
      lastTab: "main",
      familyOpen: {},
      instrumentUpOpen: {},
      synergyOpen: {},
      facilityUpOpen: false,
      facilityNextOpen: false,
      batonOpen: false,
      hasStarted: false,
      tutorialCompleted: false,
      tutorialStep: 0,
      tooltipStep: 0,
      tooltipAckStep: -1,
      tooltipsDone: false,
      prestigeExplained: false,
      blocked: false,
      hasPrestiged: false
    },
    settings: {
      abbrevLarge: true,
      reduceMotion: false,
      highContrast: false,
      disableTooltips: false
    },
    stats: {
      clicks: 0,
      buildingsBought: 0,
      inkEarned: 0
    },
    recentUnlocks: [],
    lastTick: nowFn(),
    lastSave: nowFn(),
  };
}
function normalizeLoadedState(s, defaults, buildings, batonClickMultForState){
  for (const k of Object.keys(defaults)){
    if (s[k] === undefined) s[k] = defaults[k];
  }

  if (!s.owned) s.owned = {};
  if (!s.buildingMult) s.buildingMult = {};
  for (const b of buildings){
    if (s.owned[b.id] === undefined) s.owned[b.id] = 0;
    if (s.buildingMult[b.id] === undefined) s.buildingMult[b.id] = 1;
  }

  if (!s.noteUpgrades) s.noteUpgrades = {};
  if (!s.synergyUpgrades) s.synergyUpgrades = {};
  if (!s.inkUpgrades) s.inkUpgrades = {};
  if (!s.achievements) s.achievements = {};

  if (s.metaNpsMult === undefined) s.metaNpsMult = 1;
  if (s.metaClickMult === undefined) s.metaClickMult = 1;
  if (s.clickFromNpsRate === undefined) s.clickFromNpsRate = 0;
  if (s.achNpsMult === undefined) s.achNpsMult = 1;
  if (s.achClickMult === undefined) s.achClickMult = 1;

  if (!s.buyMode) s.buyMode = "1";

  if (!s.ui) s.ui = defaults.ui;
  if (!s.ui.familyOpen) s.ui.familyOpen = {};
  if (!s.ui.instrumentUpOpen) s.ui.instrumentUpOpen = {};
  if (!s.ui.synergyOpen) s.ui.synergyOpen = {};
  if (!s.ui.tab) s.ui.tab = "main";
  if (!s.ui.lastTab) s.ui.lastTab = (s.ui.tab && s.ui.tab !== "start") ? s.ui.tab : "main";

  if (s.ui.hasStarted === undefined) s.ui.hasStarted = false;
  if (s.ui.tutorialCompleted === undefined) s.ui.tutorialCompleted = false;
  if (s.ui.tutorialStep === undefined) s.ui.tutorialStep = 0;
  if (s.ui.tooltipStep === undefined) s.ui.tooltipStep = 0;
  if (s.ui.tooltipAckStep === undefined) s.ui.tooltipAckStep = -1;
  if (s.ui.tooltipsDone === undefined) s.ui.tooltipsDone = !!s.ui.hasStarted;
  if (s.ui.prestigeExplained === undefined) s.ui.prestigeExplained = false;
  if (s.ui.blocked === undefined) s.ui.blocked = false;
  if (s.ui.hasPrestiged === undefined) s.ui.hasPrestiged = (s.patronsEver || 0) > 0;

  if (!s.settings) s.settings = defaults.settings;
  if (s.settings.abbrevLarge === undefined) s.settings.abbrevLarge = true;
  if (s.settings.reduceMotion === undefined) s.settings.reduceMotion = false;
  if (s.settings.highContrast === undefined) s.settings.highContrast = false;
  if (s.settings.disableTooltips === undefined) s.settings.disableTooltips = false;

  if (!s.stats) s.stats = defaults.stats;
  if (s.stats.clicks === undefined) s.stats.clicks = 0;
  if (s.stats.buildingsBought === undefined) s.stats.buildingsBought = 0;
  if (s.stats.inkEarned === undefined) s.stats.inkEarned = s.ink || 0;
  if (!s.recentUnlocks) s.recentUnlocks = [];

  if (!s.facility) s.facility = defaults.facility;
  if (!s.facility.currentId) s.facility.currentId = "shed";
  if (!s.facility.unlocked) s.facility.unlocked = { shed: true };
  if (!s.facility.purchasedUpgrades) s.facility.purchasedUpgrades = {};
  if (!s.facility.baseBonus) s.facility.baseBonus = {};
  if (!s.facility.baseBonus.shed) s.facility.baseBonus.shed = { nps: 1, click: 1 };

  if (s.patronsEver === undefined) s.patronsEver = s.patrons || 0;
  if (s.patrons === undefined) s.patrons = s.patronsEver;

  if (s.noteStageIdx === undefined) s.noteStageIdx = 0;
  if (!s.batonUpgrades) s.batonUpgrades = {};
  for (const k of Object.keys(s.batonUpgrades)){
    const raw = s.batonUpgrades[k];
    s.batonUpgrades[k] = (raw && raw > 0) ? 1 : 0;
  }
  if (s.batonOwned === undefined) s.batonOwned = 0;
  if (s.batonBaseExtra === undefined) s.batonBaseExtra = 0;
  s.batonClickMult = batonClickMultForState(s);

  if (s.runNotes === undefined) s.runNotes = 0;

  return s;
}
function loadState(storage, key, legacyKeys, defaultsFactory, buildings, batonClickMultForState, nowFn, logger = console){
  try{
    const raw = storage.getItem(key) || legacyKeys.map(k => storage.getItem(k)).find(Boolean);
    if (!raw) return defaultsFactory(buildings, nowFn);

    const parsed = JSON.parse(raw);
    const defaults = defaultsFactory(buildings, nowFn);
    const normalized = normalizeLoadedState(parsed, defaults, buildings, batonClickMultForState);

    storage.setItem(key, JSON.stringify(normalized));
    return normalized;
  }catch(e){
    logger.warn("Load failed", e);
    return defaultsFactory(buildings, nowFn);
  }
}
function saveState(storage, key, state, nowFn){
  state.lastSave = nowFn();
  storage.setItem(key, JSON.stringify(state));
}
function clearSaveState(storage, key, legacyKeys){
  storage.removeItem(key);
  for (const legacyKey of legacyKeys){
    storage.removeItem(legacyKey);
  }
}

window.ScoreState = {
  SAVE_KEY,
  LEGACY_SAVE_KEYS,
  createDefaultState,
  normalizeLoadedState,
  loadState,
  saveState,
  clearSaveState
};
})();
