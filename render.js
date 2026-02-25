(() => {
// Rendering and UI formatting helpers for Score Order Idle.
function fmtSig4Suffix(n){
  if (!isFinite(n)) return "∞";
  const abs = Math.abs(n);
  if (abs < 1_000_000) {
    return n.toLocaleString(undefined,{maximumFractionDigits:2});
  }
  if (abs >= 1e36){
    const exp = Math.floor(Math.log10(abs));
    const mant = n / Math.pow(10, exp);
    return `${mant.toFixed(3)}e${exp}`;
  }
  const suffixes = [
    { v: 1e33, s: "D" },
    { v: 1e30, s: "N" },
    { v: 1e27, s: "O" },
    { v: 1e24, s: "S" },
    { v: 1e21, s: "s" },
    { v: 1e18, s: "Q" },
    { v: 1e15, s: "q" },
    { v: 1e12, s: "T" },
    { v: 1e9,  s: "B" },
    { v: 1e6,  s: "M" },
  ];
  const pick = suffixes.find(x => abs >= x.v) || suffixes[suffixes.length-1];
  const scaled = n / pick.v;

  const digits = Math.floor(Math.log10(Math.abs(scaled))) + 1;
  const decimals = Math.max(0, 4 - digits);
  return `${scaled.toFixed(decimals)}${pick.s}`;
}
function fmtNotesHud(n, useSuffix){
  if (!isFinite(n)) return "∞";
  if (useSuffix) return fmtSig4Suffix(n);
  const abs = Math.abs(n);
  if (abs < 1000) return Math.floor(n).toString();
  const units = ["K","M","B","T","Qa","Qi","Sx","Sp","Oc","No"];
  let u = -1, x = abs;
  while (x >= 1000 && u < units.length-1) { x/=1000; u++; }
  const val = (n/Math.pow(1000,u+1));
  return (val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)) + units[u];
}
function fmtExact(n, useSuffix){
  if (!isFinite(n)) return "∞";
  return useSuffix ? fmtSig4Suffix(n) : n.toLocaleString(undefined,{maximumFractionDigits:2});
}
function fmtPatronsHud(n){
  if (!isFinite(n)) return "∞";
  const abs = Math.abs(n);
  if (abs < 100000) return Math.floor(n).toLocaleString();
  return `${(n / 1000).toFixed(2)}k`;
}
function fmtPct(p){
  if (!isFinite(p)) return "—";
  return `${(p*100).toFixed(p >= 0.1 ? 1 : 2)}%`;
}
function renderEmptyState(text, subText=""){
  return `<div class="emptyState">${text}${subText ? `<div class="smallSans" style="margin-top:4px;">${subText}</div>` : ""}</div>`;
}
function formatDeltaTip(deltaNps, deltaClick){
  const npsTxt = (deltaNps > 0) ? `+${fmtExact(deltaNps, true)} NPS` : "No NPS change";
  const clickTxt = (deltaClick > 0) ? `+${fmtExact(deltaClick, true)} Click` : "No Click change";
  return `Effect: ${npsTxt} • ${clickTxt}`;
}
function upgradeTagState({
  owned,
  unlocked,
  afford,
  ownedText="Purchased",
  unlockedText="Available",
  lockedText="Locked",
  lockedClass="bad"
}){
  if (owned) return { cls: "good", text: ownedText };
  if (unlocked) return { cls: afford ? "warn" : "", text: unlockedText };
  return { cls: lockedClass, text: lockedText };
}
function setButtonState(btn, enabled, reason=""){
  if (!btn) return;
  btn.disabled = !enabled;
  if (!enabled && reason){
    btn.title = reason;
    btn.setAttribute("data-base-title", reason);
    return;
  }
  btn.removeAttribute("data-base-title");
  btn.removeAttribute("title");
}
function setButtonEffectTip(btn, tip){
  if (!btn || !tip) return;
  const base = btn.getAttribute("data-base-title");
  if (base) btn.title = `${base}\n${tip}`;
  else btn.title = tip;
}
function buyModeTarget(mode){
  if (mode === "100") return 100;
  if (mode === "10") return 10;
  return 1;
}
function instrumentBuyLabel(mode, k){
  if (mode === "max"){
    return (k > 0) ? `Buy Next (${k})` : "Buy Next";
  }
  const target = buyModeTarget(mode);
  if (k > 0 && k < target) return `Buy x${k}`;
  return `Buy x${target}`;
}
function batonBuyLabel(mode, k){
  if (mode === "max"){
    return (k > 0) ? `Buy Baton Next (${k})` : "Buy Baton Next";
  }
  const target = buyModeTarget(mode);
  if (k > 0 && k < target) return `Buy Baton x${k}`;
  return `Buy Baton x${target}`;
}

window.ScoreRender = {
  fmtSig4Suffix,
  fmtNotesHud,
  fmtExact,
  fmtPatronsHud,
  fmtPct,
  renderEmptyState,
  formatDeltaTip,
  upgradeTagState,
  setButtonState,
  setButtonEffectTip,
  buyModeTarget,
  instrumentBuyLabel,
  batonBuyLabel
};
})();
