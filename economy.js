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

  return ((((baseClick * s.runClickMult) + fromNps) * batonMult) * s.metaClickMult * (s.achClickMult || 1) * patronBonus(s.patrons)) * fac.click;
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

window.ScoreEconomy = {
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
