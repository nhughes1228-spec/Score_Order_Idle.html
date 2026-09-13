(() => {
// Core economy calculations for Score Order Idle.
function buildingCostAtOwned(b, owned){
  return Math.floor(b.baseCost * Math.pow(b.costMult, owned));
}
function ownedCountForEconomy(state, b, batonItem){
  if (b.id === batonItem.id) return state.batonOwned || 0;
  return state.owned[b.id] || 0;
}
function sumCostForK(state, b, k, batonItem){
  const owned = ownedCountForEconomy(state, b, batonItem);
  const r = b.costMult;
  const base = b.baseCost * Math.pow(r, owned);
  if (k <= 0) return 0;
  if (Math.abs(r - 1) < 1e-9) return Math.floor(base * k);
  const total = base * (Math.pow(r, k) - 1) / (r - 1);
  return Math.floor(total);
}
function maxAffordableCount(state, b, batonItem){
  const owned = ownedCountForEconomy(state, b, batonItem);
  const r = b.costMult;
  const budget = state.notes;

  const first = buildingCostAtOwned(b, owned);
  if (budget < first) return 0;

  const base = b.baseCost * Math.pow(r, owned);
  let kEst;
  if (Math.abs(r - 1) < 1e-9){
    kEst = Math.floor(budget / base);
  } else {
    const rhs = 1 + (budget * (r - 1) / base);
    kEst = Math.floor(Math.log(rhs) / Math.log(r));
  }
  kEst = Math.max(0, Math.min(1000000, kEst));

  while (kEst > 0 && sumCostForK(state, b, kEst, batonItem) > budget) kEst--;
  while (sumCostForK(state, b, kEst + 1, batonItem) <= budget) kEst++;

  return kEst;
}
function nextInstrumentUpgradeOwnedTarget(noteUpgrades, buildingId, owned){
  let next = Infinity;
  for (const u of noteUpgrades){
    if (u.buildingId !== buildingId) continue;
    if (u.requireOwned > owned && u.requireOwned < next) next = u.requireOwned;
  }
  return Number.isFinite(next) ? next : null;
}
function nextBatonTechniqueOwnedTarget(batonUpgrades, owned){
  let next = Infinity;
  for (const u of batonUpgrades){
    const req = u.requireBatons || 0;
    if (req > owned && req < next) next = req;
  }
  return Number.isFinite(next) ? next : null;
}
function buyCountForNextMode(state, b, affordable, batonItem, noteUpgrades, batonUpgrades){
  const owned = ownedCountForEconomy(state, b, batonItem);
  if (b.id === batonItem.id){
    const target = nextBatonTechniqueOwnedTarget(batonUpgrades, owned);
    if (target === null) return affordable;
    return Math.min(Math.max(0, target - owned), affordable);
  }
  const target = nextInstrumentUpgradeOwnedTarget(noteUpgrades, b.id, owned);
  if (target === null) return affordable;
  return Math.min(Math.max(0, target - owned), affordable);
}
function buyCountForMode(state, b, mode, batonItem, noteUpgrades, batonUpgrades){
  const affordable = maxAffordableCount(state, b, batonItem);
  if (mode === "max") return buyCountForNextMode(state, b, affordable, batonItem, noteUpgrades, batonUpgrades);
  if (mode === "100") return Math.min(100, affordable);
  if (mode === "10") return Math.min(10, affordable);
  return Math.min(1, affordable);
}
function batonBaseClickForState(s){
  return +((1 + (s.batonBaseExtra || 0)).toFixed(4));
}
function batonClickMultForState(s, batonUpgrades, hasBatonTechnique){
  let mult = 1;
  for (const u of batonUpgrades){
    if (hasBatonTechnique(s, u.id)) mult *= (u.clickMult || 1);
  }
  return +mult.toFixed(6);
}
function globalNpsMultiplierForState(s, facilityMults, patronBonus){
  return (s.runNpsMult * s.metaNpsMult * (s.achNpsMult || 1) * patronBonus(s.patrons) * facilityMults(s).nps);
}
function baseInstrumentNpsForState(s, b){
  const owned = s.owned[b.id] || 0;
  if (owned <= 0) return 0;
  const mult = (s.buildingMult[b.id] || 1);
  return owned * b.nps * mult;
}
function totalNpsForState(s, buildings, facilityMults, patronBonus){
  let sum = 0;
  for (const b of buildings){
    sum += baseInstrumentNpsForState(s, b);
  }
  return sum * globalNpsMultiplierForState(s, facilityMults, patronBonus);
}
function notesPerClickForState(s, deps){
  const {
    buildings,
    batonUpgrades,
    hasBatonTechnique,
    facilityMults,
    patronBonus,
  } = deps;

  const nps = totalNpsForState(s, buildings, facilityMults, patronBonus);
  const fromNps = s.clickFromNpsRate > 0 ? (s.clickFromNpsRate * nps) : 0;
  const fac = facilityMults(s);
  const baseClick = batonBaseClickForState(s);
  const batonMult = batonClickMultForState(s, batonUpgrades, hasBatonTechnique);
  const clickMeta = s.metaClickMult * (s.achClickMult || 1);
  const patron = patronBonus(s.patrons);

  const manualBase = (((baseClick * s.runClickMult) * batonMult) * clickMeta * patron) * fac.click;
  const assistedClick = fromNps * (1 + ((clickMeta - 1) * 0.35)) * (1 + ((patron - 1) * 0.25)) * (1 + ((fac.click - 1) * 0.25));

  return manualBase + assistedClick;
}
function previewDelta(state, mutator, deps){
  const beforeNps = totalNpsForState(state, deps.buildings, deps.facilityMults, deps.patronBonus);
  const beforeClick = notesPerClickForState(state, deps);
  const clone = JSON.parse(JSON.stringify(state));
  mutator(clone);
  const afterNps = totalNpsForState(clone, deps.buildings, deps.facilityMults, deps.patronBonus);
  const afterClick = notesPerClickForState(clone, deps);
  return { nps: afterNps - beforeNps, click: afterClick - beforeClick };
}

function createProgressionRules(data){
  const { FACILITIES, ENDGAME_LIBRARY_UNLOCK, getFacility } = data;
  function facilityUpgradeProgress(s, facilityId){
    const f = getFacility(facilityId);
    if (!f || !f.upgrades || f.upgrades.length === 0){
      return { owned: 0, total: 0, ratio: 0 };
    }
    const purchased = s.facility?.purchasedUpgrades || {};
    let owned = 0;
    for (const up of f.upgrades){
      if (purchased[up.id]) owned++;
    }
    return { owned, total: f.upgrades.length, ratio: owned / f.upgrades.length };
  }

  // Mastering the current venue makes your next move stronger.
  function facilityCarryBonusFromCurrent(s, currentFacilityId){
    const prog = facilityUpgradeProgress(s, currentFacilityId);
    const r = prog.ratio;
    const nps = 1 + (r * 0.45) + (r * r * 0.75);   // max 2.20x at full completion
    const click = 1 + (r * 0.30) + (r * r * 0.55); // max 1.85x at full completion
    return {
      nps: +nps.toFixed(3),
      click: +click.toFixed(3),
      owned: prog.owned,
      total: prog.total,
      ratio: r
    };
  }

  const FACILITY_CHAIN_CARRY_EXP = 0.35;

  function nextLockedFacilityForState(s){
    const currentIdx = FACILITIES.findIndex(f => f.id === s?.facility?.currentId);
    if (currentIdx < 0) return FACILITIES.find(f => !s?.facility?.unlocked?.[f.id]) || null;
    for (let i = currentIdx + 1; i < FACILITIES.length; i++){
      const f = FACILITIES[i];
      if (!s?.facility?.unlocked?.[f.id]) return f;
    }
    return null;
  }

  function facilityEntryBonusFromCurrent(s, nextFacilityId){
    const currentId = s?.facility?.currentId;
    const next = nextLockedFacilityForState(s);
    if (!currentId || !next || next.id !== nextFacilityId){
      return {
        nps: 1,
        click: 1,
        stepNps: 1,
        stepClick: 1,
        source: { owned: 0, total: 0, ratio: 0 }
      };
    }

    const carry = facilityCarryBonusFromCurrent(s, currentId);
    const inherited = s?.facility?.baseBonus?.[currentId] || { nps: 1, click: 1 };
    const stepNps = Math.pow(Math.max(1, carry.nps || 1), FACILITY_CHAIN_CARRY_EXP);
    const stepClick = Math.pow(Math.max(1, carry.click || 1), FACILITY_CHAIN_CARRY_EXP);

    return {
      nps: +((inherited.nps || 1) * stepNps).toFixed(3),
      click: +((inherited.click || 1) * stepClick).toFixed(3),
      stepNps: +stepNps.toFixed(3),
      stepClick: +stepClick.toFixed(3),
      source: carry
    };
  }

  function facilityBaseMultForState(s, facilityId){
    const f = getFacility(facilityId);
    if (!f) return { nps: 1, click: 1 };

    const bonus = s.facility?.baseBonus?.[facilityId] || { nps: 1, click: 1 };
    return {
      nps: +(f.globalMult.nps * (bonus.nps || 1)).toFixed(6),
      click: +(f.globalMult.click * (bonus.click || 1)).toFixed(6)
    };
  }

  function facilityMults(s){
    const f = getFacility(s.facility.currentId);
    const base = facilityBaseMultForState(s, s.facility.currentId);
    let nps = base.nps;
    let click = base.click;

    const purchased = s.facility.purchasedUpgrades || {};
    if (f){
      for (const up of f.upgrades){
        if (!purchased[up.id]) continue;
        if (up.mult?.nps) nps *= up.mult.nps;
        if (up.mult?.click) click *= up.mult.click;
      }
    }
    return { nps, click };
  }

  const patronBonus = (patrons) => (1 + patrons * 0.05);
  const PATRON_NOTES_BASE = 500000;
  const PATRON_NOTES_EXP = 0.4;
  const PATRON_NOTES_INV_EXP = 1 / PATRON_NOTES_EXP;
  const PATRON_REWARD_SOFT_CAP = 1000;
  const FINAL_FACILITY_ID = FACILITIES?.[FACILITIES.length - 1]?.id || "famous";
  const ENDOWMENT_REQUIRED_PATRONS = Math.max(1, Math.floor(ENDGAME_LIBRARY_UNLOCK?.requiredPatrons || 10000));
  const ENDOWMENT_BASE_PATRONS = Math.max(1, Math.floor(ENDGAME_LIBRARY_UNLOCK?.gainBasePatrons || ENDOWMENT_REQUIRED_PATRONS));

  function isLibraryUnlocked(s){
    return !!(s?.library?.unlocked);
  }
  function hasFinalVenueUnlocked(s){
    return !!(s?.facility?.unlocked?.[FINAL_FACILITY_ID]);
  }
  function finalVenueFullyUpgraded(s){
    if (!hasFinalVenueUnlocked(s)) return false;
    const f = getFacility(FINAL_FACILITY_ID);
    if (!f || !Array.isArray(f.upgrades) || f.upgrades.length === 0) return false;
    const purchased = s?.facility?.purchasedUpgrades || {};
    return f.upgrades.every(up => !!purchased[up.id]);
  }
  function canStartEndowment(s){
    return !isLibraryUnlocked(s) &&
      hasFinalVenueUnlocked(s) &&
      finalVenueFullyUpgraded(s) &&
      (s.patrons || 0) >= ENDOWMENT_REQUIRED_PATRONS;
  }
  function endowmentGainFromPatrons(patrons){
    const scaled = Math.max(0, Number(patrons || 0) / ENDOWMENT_BASE_PATRONS);
    return Math.floor(Math.sqrt(scaled));
  }
  function patronsForEndowmentGain(target){
    const t = Math.max(0, Number(target) || 0);
    return Math.ceil(t * t * ENDOWMENT_BASE_PATRONS);
  }

  function patronsFromRun(runNotes){
    const scaled = Math.max(0, (runNotes || 0) / PATRON_NOTES_BASE);
    const originalReward = Math.pow(scaled, PATRON_NOTES_EXP);
    const reward = originalReward <= PATRON_REWARD_SOFT_CAP
      ? originalReward
      : PATRON_REWARD_SOFT_CAP * Math.sqrt(originalReward / PATRON_REWARD_SOFT_CAP);
    return Math.floor(reward);
  }
  function runNotesForPatrons(p){
    const target = Math.max(0, Math.ceil(Number(p) || 0));
    const originalReward = target <= PATRON_REWARD_SOFT_CAP
      ? target
      : PATRON_REWARD_SOFT_CAP * Math.pow(target / PATRON_REWARD_SOFT_CAP, 2);
    let notes = Math.ceil(Math.pow(originalReward, PATRON_NOTES_INV_EXP) * PATRON_NOTES_BASE);
    // Inverting powers can round just below a reward boundary. At large values,
    // adding one Note may do nothing, so advance by at least a representable step.
    while (Number.isFinite(notes) && patronsFromRun(notes) < target){
      notes += Math.max(1, notes * Number.EPSILON);
    }
    return notes;
  }
  function runNotesUntilNextPatron(s){
    const possibleNow = patronsFromRun(s.runNotes || 0);
    const nextP = possibleNow + 1;
    const need = runNotesForPatrons(nextP);
    return Math.max(0, need - (s.runNotes || 0));
  }


  return { facilityUpgradeProgress, facilityCarryBonusFromCurrent, nextLockedFacilityForState,
    facilityEntryBonusFromCurrent, facilityBaseMultForState, facilityMults, patronBonus,
    FINAL_FACILITY_ID, ENDOWMENT_REQUIRED_PATRONS, ENDOWMENT_BASE_PATRONS,
    isLibraryUnlocked, hasFinalVenueUnlocked, finalVenueFullyUpgraded, canStartEndowment,
    endowmentGainFromPatrons, patronsForEndowmentGain, patronsFromRun, runNotesForPatrons, runNotesUntilNextPatron };
}
globalThis.ScoreEconomy = {
  createProgressionRules,
  buildingCostAtOwned,
  ownedCountForEconomy,
  sumCostForK,
  maxAffordableCount,
  nextInstrumentUpgradeOwnedTarget,
  nextBatonTechniqueOwnedTarget,
  buyCountForNextMode,
  buyCountForMode,
  batonBaseClickForState,
  batonClickMultForState,
  globalNpsMultiplierForState,
  baseInstrumentNpsForState,
  totalNpsForState,
  notesPerClickForState,
  previewDelta
};
})();
