const {
  NOTE_STAGES,
  BATON_ITEM,
  BATON_UPGRADES,
  ENDGAME_LIBRARY_UNLOCK,
  hasBatonTechnique,
  batonUpgradeUnlockedInState,
  BUILDINGS,
  FAMILY_ORDER,
  NOTE_UPGRADES,
  ACHIEVEMENTS,
  SYNERGY_UPGRADES,
  INK_UPGRADES,
  FACILITIES,
  FACILITY_PREVIEW_IMAGE,
  getFacility,
  countPurchased,
} = window.ScoreData || {};

const {
  fmtNotesHud,
  fmtExact,
  fmtPatronsHud,
  fmtPct,
  renderEmptyState,
  formatDeltaTip,
  upgradeTagState,
  setButtonState,
  setButtonEffectTip,
  instrumentBuyLabel,
  batonBuyLabel,
} = window.ScoreRender || {};

const {
  buildingCostAtOwned: buildingCostAtOwnedCore,
  sumCostForK: sumCostForKCore,
  buyCountForMode: buyCountForModeCore,
  batonBaseClickForState: batonBaseClickForStateCore,
  batonClickMultForState: batonClickMultForStateCore,
  globalNpsMultiplierForState: globalNpsMultiplierForStateCore,
  baseInstrumentNpsForState: baseInstrumentNpsForStateCore,
  totalNpsForState: totalNpsForStateCore,
  notesPerClickForState: notesPerClickForStateCore,
  previewDelta: previewDeltaCore,
} = window.ScoreEconomy || {};

const {
  SAVE_KEY,
  LEGACY_SAVE_KEYS,
  createDefaultState,
  loadState,
  saveState,
  clearSaveState,
} = window.ScoreState || {};

const {
  wireNoteButtonOnce: wireNoteButtonOnceCore,
} = window.ScoreUIEvents || {};

const {
  ensureLibraryState: ensureLibraryStateCore,
  tickLibrary: tickLibraryCore,
  renderLibrary: renderLibraryCore,
  stopPlayback: stopLibraryPlaybackCore,
  bindUI: bindLibraryUICore,
} = window.ScoreLibrary || {};

  // iOS Safari: prevent double-tap zoom on the main click target
  (() => {
    const btn = document.getElementById("noteBtn");
    if (!btn) return;

    let lastTouchEnd = 0;
    btn.addEventListener("touchend", (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });
  })();

  // Safari/WebKit compositing bug: force a one-time repaint after first paint
  (function repaintKick(){
    const kick = () => {
      document.body.classList.add("repaint-kick");
      void document.body.offsetHeight;
      requestAnimationFrame(() => document.body.classList.remove("repaint-kick"));
    };
    window.addEventListener("load", kick, { once: true });
  })();

  // Disable browser context menu on the game page.
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

(() => {
  // ---------- Utilities ----------
  const $ = (sel)=>document.querySelector(sel);
  const $$ = (sel)=>Array.from(document.querySelectorAll(sel));
  const now = ()=>Date.now();
  const fmtInt = (n) => Math.floor(Math.max(0, n || 0)).toLocaleString();

  const toastRegistry = new Map();
  function toast(msg, opts = {}){
    const wrap = $("#toast");
    if (!wrap) return;

    const key = opts.key || null;
    const ttl = Math.max(900, opts.ttl ?? 2200);
    const fadeMs = Math.max(180, Math.min(500, opts.fadeMs ?? 320));
    const maxStack = window.matchMedia("(max-width: 980px)").matches ? 2 : 4;

    let t = key ? toastRegistry.get(key)?.el : null;
    if (!t){
      t = document.createElement("div");
      t.className = "t";
      wrap.appendChild(t);
      if (key) toastRegistry.set(key, { el: t, fadeTimer: null, removeTimer: null });
    }

    t.textContent = msg;
    t.style.opacity = "1";
    t.style.transform = "translateY(0)";
    t.style.transition = "";

    const rec = key ? toastRegistry.get(key) : { el: t, fadeTimer: null, removeTimer: null };
    if (rec.fadeTimer) clearTimeout(rec.fadeTimer);
    if (rec.removeTimer) clearTimeout(rec.removeTimer);

    rec.fadeTimer = setTimeout(()=>{
      t.style.opacity = "0";
      t.style.transform = "translateY(4px)";
      t.style.transition = `all ${fadeMs}ms ease`;
    }, Math.max(200, ttl - fadeMs));

    rec.removeTimer = setTimeout(()=>{
      if (key && toastRegistry.get(key)?.el === t) toastRegistry.delete(key);
      if (t.parentNode) t.remove();
    }, ttl);

    if (key) toastRegistry.set(key, rec);

    while (wrap.children.length > maxStack){
      const first = wrap.firstElementChild;
      if (!first) break;
      for (const [k, v] of toastRegistry.entries()){
        if (v.el === first){
          if (v.fadeTimer) clearTimeout(v.fadeTimer);
          if (v.removeTimer) clearTimeout(v.removeTimer);
          toastRegistry.delete(k);
          break;
        }
      }
      first.remove();
    }
  }

  // ---------- Real Note Art (from /assets) ----------
  function currentStage(){
    const idx = Math.max(0, Math.min(NOTE_STAGES.length-1, S.noteStageIdx || 0));
    return NOTE_STAGES[idx];
  }

  function noteMarkup(stage){
    const src = stage?.img || "assets/note-whole.png";
    const alt = stage?.label || "Note";
    return `<img class="noteImg" src="${src}" alt="${alt}" draggable="false">`;
  }

  function batonBaseClick(){
    return batonBaseClickForState(S);
  }

  function batonClickMult(){
    return batonClickMultForState(S);
  }

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

  function canAffordPatrons(cost){ return (S.patrons || 0) >= cost; }
  function spendPatrons(cost){ S.patrons = Math.max(0, (S.patrons || 0) - cost); }

  function unlockFacility(id){
    const f = getFacility(id);
    if (!f) return;
    if (S.facility.unlocked[id]) return;
    if (!canAffordPatrons(f.patronCostToUnlock)) return;

    const carry = facilityCarryBonusFromCurrent(S, S.facility.currentId);
    if (!S.facility.baseBonus) S.facility.baseBonus = {};
    S.facility.baseBonus[id] = { nps: carry.nps, click: carry.click };

    spendPatrons(f.patronCostToUnlock);
    S.facility.unlocked[id] = true;
    S.facility.currentId = id;
    addRecentUnlock("Venue", f.name);
    toast(`Venue: ${f.name} (Mastery x${carry.nps.toFixed(2)} NPS • x${carry.click.toFixed(2)} Click)`);
    save(false);
    renderAll();
  }

  function buyFacilityUpgrade(upgradeId){
    const f = getFacility(S.facility.currentId);
    if (!f) return;
    const up = f.upgrades.find(u => u.id === upgradeId);
    if (!up) return;
    if (S.facility.purchasedUpgrades[upgradeId]) return;
    if (!canAffordPatrons(up.cost)) return;

    spendPatrons(up.cost);
    S.facility.purchasedUpgrades[upgradeId] = true;
    addRecentUnlock("Facility", up.name);
    toast(`Facility: ${up.name}`);
    save(false);
    renderAll();
  }

  function finishEndowmentAndReset(gain){
    const settingsKeep = {
      abbrevLarge: !!S.settings?.abbrevLarge,
      reduceMotion: !!S.settings?.reduceMotion,
      highContrast: !!S.settings?.highContrast,
      disableTooltips: !!S.settings?.disableTooltips
    };
    const totalEndowments = Math.max(0, (S.library?.endowments || 0)) + Math.max(0, Math.floor(gain || 0));

    S = stateDefault();
    if (ensureLibraryStateCore) ensureLibraryStateCore(S);
    S.settings = { ...S.settings, ...settingsKeep };
    S.library.unlocked = true;
    S.library.endowmentStage = 0;
    S.library.endowments = totalEndowments;
    S.ui.hasStarted = false;
    S.ui.libraryForeshadowShown = true;
    S.ui.endowmentReadyShown = true;

    if (stopLibraryPlaybackCore) stopLibraryPlaybackCore();

    setPrestigeTabVisibility();
    setLibraryTabVisibility();
    setTab("start");
    save(false);
    renderAll();
    toast(`Endowment gained: +${fmtInt(gain)}. The Music Library is now open.`);
  }

  function offerPatronsToEndowment(){
    if (isBlocked()) return;
    if (isLibraryUnlocked(S)) return;
    if (!canStartEndowment(S)){
      toast("The Endowment Rite is not ready yet.");
      return;
    }
    const gain = endowmentGainFromPatrons(S.patrons || 0);
    if (gain <= 0){
      toast(`Need ${fmtInt(ENDOWMENT_BASE_PATRONS)} held Patrons to gain an Endowment.`);
      return;
    }
    const ok = confirm(
      `Establishing an Endowment will reset Notes, Ink, Patrons, Facilities, and your current run.\n` +
      `You will gain +${fmtInt(gain)} Endowment.\n` +
      `Music Library access will remain unlocked.\n\nProceed?`
    );
    if (!ok) return;
    finishEndowmentAndReset(gain);
  }

  function renderEndowmentPanel(){
    const panel = $("#endowmentPanel");
    if (!panel) return;

    const titleEl = $("#endowmentTitle");
    const bodyEl = $("#endowmentBody");
    const progressEl = $("#endowmentProgress");
    const costEl = $("#endowmentCostLine");
    const offerBtn = $("#endowmentOfferBtn");

    const canSee = hasFinalVenueUnlocked(S) && !isLibraryUnlocked(S);
    panel.hidden = !canSee;
    if (!canSee) return;

    const fullUp = finalVenueFullyUpgraded(S);
    const hasPatrons = (S.patrons || 0) >= ENDOWMENT_REQUIRED_PATRONS;
    const unlocked = fullUp && hasPatrons;
    const gain = endowmentGainFromPatrons(S.patrons || 0);
    const nextGainPatrons = patronsForEndowmentGain(gain + 1);

    if (unlocked && !S.ui.endowmentReadyShown && !libraryMysteryOverlay.classList.contains("show")){
      showEndowmentReadyReveal();
    }

    panel.classList.toggle("locked", !unlocked);
    panel.classList.toggle("ready", unlocked);

    if (titleEl){
      titleEl.textContent = unlocked ? "Endowment" : "Unknown Patron Rite";
    }
    if (bodyEl){
      if (unlocked){
        bodyEl.innerHTML =
          `This is your double-prestige. Convert your <b>currently held Patrons</b> into Endowment, ` +
          `reset all the way to the start, and keep the Music Library unlocked forever.`;
      } else {
        bodyEl.innerHTML =
          `A hidden process is sealed here. Fully upgrade <b>${getFacility(FINAL_FACILITY_ID)?.name || "the final venue"}</b> and hold at least ` +
          `<b>${fmtInt(ENDOWMENT_REQUIRED_PATRONS)}</b> Patrons to reveal it.`;
      }
    }
    if (progressEl){
      progressEl.textContent = unlocked
        ? `Held Patrons: ${fmtInt(S.patrons || 0)} • Endowment gain: +${fmtInt(gain)} • Total Endowment: ${fmtInt(S.library?.endowments || 0)}`
        : `Held Patrons: ${fmtInt(S.patrons || 0)} / ${fmtInt(ENDOWMENT_REQUIRED_PATRONS)} • Total Endowment: ${fmtInt(S.library?.endowments || 0)}`;
    }
    if (costEl){
      costEl.textContent = unlocked
        ? `Next +1 Endowment at ${fmtInt(nextGainPatrons)} held Patrons`
        : `Need ${fmtInt(ENDOWMENT_REQUIRED_PATRONS)} held Patrons`;
    }
    if (offerBtn){
      offerBtn.textContent = "Establish Endowment";
      const enabled = unlocked && gain > 0 && !isBlocked();
      let reason = "";
      if (!unlocked) reason = "Reveal requirements not met yet.";
      else if (gain <= 0) reason = `Need ${fmtInt(ENDOWMENT_BASE_PATRONS)} held Patrons.`;
      setButtonState(offerBtn, enabled, reason);
    }
  }

  // ---------- Prestige (Patrons reset ladder each run) ----------
  const patronBonus = (patrons) => (1 + patrons * 0.05);
  const PATRON_NOTES_BASE = 200000;
  const PATRON_NOTES_EXP = 0.4;
  const PATRON_NOTES_INV_EXP = 1 / PATRON_NOTES_EXP;
  const FINAL_FACILITY_ID = FACILITIES?.[FACILITIES.length - 1]?.id || "famous";
  const ENDOWMENT_REQUIRED_PATRONS = Math.max(1, Math.floor(ENDGAME_LIBRARY_UNLOCK?.requiredPatrons || 10000));
  const ENDOWMENT_BASE_PATRONS = Math.max(1, Math.floor(ENDGAME_LIBRARY_UNLOCK?.gainBasePatrons || ENDOWMENT_REQUIRED_PATRONS));

  function isLibraryUnlocked(s = S){
    return !!(s?.library?.unlocked);
  }
  function hasFinalVenueUnlocked(s = S){
    return !!(s?.facility?.unlocked?.[FINAL_FACILITY_ID]);
  }
  function finalVenueFullyUpgraded(s = S){
    if (!hasFinalVenueUnlocked(s)) return false;
    const f = getFacility(FINAL_FACILITY_ID);
    if (!f || !Array.isArray(f.upgrades) || f.upgrades.length === 0) return false;
    const purchased = s?.facility?.purchasedUpgrades || {};
    return f.upgrades.every(up => !!purchased[up.id]);
  }
  function canStartEndowment(s = S){
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
    return Math.floor(Math.pow(scaled, PATRON_NOTES_EXP));
  }
  function runNotesForPatrons(p){
    const target = Math.max(0, Number(p) || 0);
    return Math.ceil(Math.pow(target, PATRON_NOTES_INV_EXP) * PATRON_NOTES_BASE);
  }
  function runNotesUntilNextPatron(s){
    const possibleNow = patronsFromRun(s.runNotes || 0);
    const nextP = possibleNow + 1;
    const need = runNotesForPatrons(nextP);
    return Math.max(0, need - (s.runNotes || 0));
  }

  function prestigePreview(){
    const wouldEarnThisRun = patronsFromRun(S.runNotes || 0);
    const gain = Math.max(0, wouldEarnThisRun);
    return { wouldEarnThisRun, gain };
  }

  function confirmPrestige(gain){
    const firstPrompt = !S.ui.firstPrestigePromptShown && (S.patronsEver || 0) === 0;
    if (firstPrompt){
      S.ui.firstPrestigePromptShown = true;
      if (gain < 10){
        return confirm(
          `I would wait until your Patrons can have a bigger impact before taking a bow.\n\n` +
          `You would gain +${gain} Patron(s) right now.\n` +
          `Ink, Archive upgrades, and Facilities persist.\n\n` +
          `Take a bow anyway?`
        );
      }
      return confirm(
        `First Take-a-bow check:\n\n` +
        `You will gain +${gain} Patron(s).\n` +
        `This resets Notes, instruments, NOTE-upgrades, Synergies, and Conducting Skills.\n` +
        `Ink, Archive upgrades, and Facilities persist.\n\n` +
        `Proceed?`
      );
    }

    return confirm(
      `“Take a bow” will reset your run (Notes, instruments, NOTE-upgrades, Synergies, Conducting Skills).\n` +
      `You keep Ink + Archive upgrades + Facilities.\n\n` +
      `You will gain +${gain} Patron(s).\n\nProceed?`
    );
  }

  function doPrestige(){
    if (isBlocked()) return;

    const { gain } = prestigePreview();
    if (gain <= 0){
      toast("No new Patrons yet. Keep composing.");
      return;
    }
    const ok = confirmPrestige(gain);
    if (!ok) return;

    S.patronsEver = (S.patronsEver || 0) + gain;
    S.patrons = (S.patrons || 0) + gain;

    S.notes = 0;
    S.runNotes = 0;

    S.owned = Object.fromEntries(BUILDINGS.map(b=>[b.id,0]));
    S.buildingMult = Object.fromEntries(BUILDINGS.map(b=>[b.id,1]));
    S.noteUpgrades = {};
    S.synergyUpgrades = {};

    S.runClickMult = 1;
    S.runNpsMult = 1;

    S.noteStageIdx = 0;
    S.batonUpgrades = {};
    S.batonOwned = 0;
    S.batonBaseExtra = 0;
    S.batonClickMult = 1;

    if (!S.ui) S.ui = {};
    S.ui.hasPrestiged = true;

    toast(`You gained ${gain} Patron(s).`);
    save(false);
    setPrestigeTabVisibility();
    setLibraryTabVisibility();
    setTab("prestige");
    renderAll();
    maybeShowLibraryMysteryAfterPrestige();
  }

  // ---------- State ----------
  const stateDefault = () => createDefaultState(BUILDINGS, now);

  function load(){
    return loadState(
      localStorage,
      SAVE_KEY,
      LEGACY_SAVE_KEYS,
      createDefaultState,
      BUILDINGS,
      (s) => batonClickMultForState(s),
      now
    );
  }

  let S = load();
  if (ensureLibraryStateCore) ensureLibraryStateCore(S);
  checkAchievements(false);

  function save(showToast=true){
    saveState(localStorage, SAVE_KEY, S, now);
    if (showToast) toast("Saved.");
  }

  // ---------- Tutorial / Overlays ----------
  const tutOverlay = $("#tutorialOverlay");
  const tutVeil = $("#tutorialVeil");
  const prestigeExplainOverlay = $("#prestigeExplainOverlay");
  const libraryMysteryOverlay = $("#libraryMysteryOverlay");
  const libraryMysteryTitle = $("#libraryMysteryTitle");
  const libraryMysteryMsg = $("#libraryMysteryMsg");
  const coachTip = $("#coachTip");
  const coachTipTitle = $("#coachTipTitle");
  const coachTipMsg = $("#coachTipMsg");
  const PICCOLO = BUILDINGS.find(b => b.id === "piccolo");
  function nextPiccoloCostForState(s){
    if (!PICCOLO) return 0;
    return buildingCostAtOwned(PICCOLO, s.owned?.piccolo || 0);
  }

  const COACH_STEPS = [
    {
      title: "Buy Your First Baton",
      msg: () => `Click the note until you can afford a Baton (${fmtExact(buildingCostAtOwned(BATON_ITEM, S.batonOwned || 0), !!S.settings.abbrevLarge)} Notes).`,
      target: "#noteBtn",
      completeWhen: (s) => (s.notes || 0) >= buildingCostAtOwned(BATON_ITEM, s.batonOwned || 0),
      advanceOnOk: false
    },
    {
      title: "Buy A Baton",
      msg: "Buy your first Baton to raise click power and gain Ink.",
      target: "#buyBatonBtn",
      completeWhen: (s) => (s.batonOwned || 0) >= 1,
      advanceOnOk: false
    },
    {
      title: "Save For Piccolo",
      msg: () => {
        const cost = nextPiccoloCostForState(S);
        if ((S.notes || 0) >= cost){
          return "Great, you can afford one now. Buy your first Piccolo.";
        }
        return `Click the note until you can afford your first Piccolo (${fmtExact(cost, !!S.settings.abbrevLarge)} Notes).`;
      },
      target: (s) => ((s.notes || 0) >= nextPiccoloCostForState(s) ? 'button[data-buy="piccolo"]' : "#noteBtn"),
      ensure: () => {
        S.ui.familyOpen.Winds = true;
        renderFamilies();
      },
      completeWhen: (s) => (s.owned?.piccolo || 0) >= 1,
      advanceOnOk: false
    },
    {
      title: "Choose Your Play Style",
      msg: "From here, spend notes how you want: focus on active clicking and baton growth, focus on idle instruments, or mix both styles. Keep going until you reach enough notes to prestige, then the next tooltip will appear.",
      target: "#noteBtn",
      completeWhen: () => false,
      advanceOnOk: true
    }
  ];

  let coachTargetSelector = null;
  function clearCoachHighlight(){
    $$(".tip-highlight").forEach(el => el.classList.remove("tip-highlight"));
  }
  function setCoachHighlight(selector){
    clearCoachHighlight();
    const el = selector ? $(selector) : null;
    if (!el) return null;
    el.classList.add("tip-highlight");
    return el;
  }
  function hideCoachTip(){
    if (coachTip) coachTip.hidden = true;
    coachTargetSelector = null;
    clearCoachHighlight();
  }
  function coachTooltipsEnabled(){
    return !!S.ui.hasStarted &&
      !!S.ui.tutorialCompleted &&
      !S.settings.disableTooltips &&
      !S.ui.tooltipsDone &&
      S.ui.tab === "main" &&
      !tutOverlay.classList.contains("show") &&
      !prestigeExplainOverlay.classList.contains("show");
  }
  function maybeShowCoachTip(){
    if (!coachTooltipsEnabled()){
      hideCoachTip();
      return;
    }

    let idx = S.ui.tooltipStep || 0;
    while (idx < COACH_STEPS.length && COACH_STEPS[idx].completeWhen(S)){
      idx++;
      S.ui.tooltipStep = idx;
      S.ui.tooltipAckStep = -1;
    }
    if (idx >= COACH_STEPS.length){
      S.ui.tooltipsDone = true;
      hideCoachTip();
      save(false);
      return;
    }
    const step = COACH_STEPS[idx];
    if (!step) return;

    if (S.ui.tooltipAckStep === idx){
      hideCoachTip();
      return;
    }

    if (step.ensure) step.ensure();
    const stepTarget = (typeof step.target === "function") ? step.target(S) : step.target;
    coachTargetSelector = stepTarget;
    const targetEl = setCoachHighlight(stepTarget);
    if (targetEl?.scrollIntoView){
      targetEl.scrollIntoView({ behavior: S.settings.reduceMotion ? "auto" : "smooth", block:"center", inline:"center" });
    }

    coachTipTitle.textContent = step.title;
    coachTipMsg.textContent = (typeof step.msg === "function") ? step.msg() : step.msg;
    coachTip.hidden = false;
  }

  function isBlocked(){
    // IMPORTANT: while on start screen, game is blocked
    if (!S.ui.hasStarted) return true;
    return !!S.ui.blocked ||
      tutOverlay.classList.contains("show") ||
      prestigeExplainOverlay.classList.contains("show") ||
      libraryMysteryOverlay.classList.contains("show");
  }

  function clearHighlight(){
    // IMPORTANT: ONLY remove tutorial-highlight
    // Never remove any base classes like "noteBtn" (that caused the square button bug).
    $$(".tutorial-highlight").forEach(el => el.classList.remove("tutorial-highlight"));
  }

  function setSpotlightRect(x, y, w, h, r){
    tutVeil.style.setProperty("--tx", `${Math.round(x)}px`);
    tutVeil.style.setProperty("--ty", `${Math.round(y)}px`);
    tutVeil.style.setProperty("--tw", `${Math.round(w)}px`);
    tutVeil.style.setProperty("--th", `${Math.round(h)}px`);
    tutVeil.style.setProperty("--tr", `${Math.round(r)}px`);
  }

  function setSpotlightToElement(el){
    if (!tutVeil) return;
    if (!el){
      const w = 240;
      const h = 140;
      const x = (window.innerWidth - w) / 2;
      const y = (window.innerHeight - h) / 2;
      setSpotlightRect(x, y, w, h, 28);
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 12;

    let x = r.left - pad;
    let y = r.top - pad;
    let w = r.width + pad * 2;
    let h = r.height + pad * 2;

    x = Math.max(8, x);
    y = Math.max(8, y);
    w = Math.max(24, Math.min(w, window.innerWidth - x - 8));
    h = Math.max(24, Math.min(h, window.innerHeight - y - 8));

    const cs = getComputedStyle(el);
    const rawRadius = parseFloat(cs.borderTopLeftRadius) || 14;
    const rad = Math.min(Math.max(rawRadius + 12, 24), Math.min(w, h) / 2);

    setSpotlightRect(x, y, w, h, rad);
  }

  function highlight(selector){
    clearHighlight();
    const el = $(selector);
    if (!el) return null;
    el.classList.add("tutorial-highlight");
    setSpotlightToElement(el);
    return el;
  }

  // Keep spotlight aligned on scroll/resize while tutorial is visible
  let spotlightTargetSelector = null;
  function updateSpotlightFromSelector(){
    if (!spotlightTargetSelector) return;
    const el = $(spotlightTargetSelector);
    if (!el) return;
    setSpotlightToElement(el);
  }
  window.addEventListener("resize", ()=> {
    if (!tutOverlay.classList.contains("show")) return;
    updateSpotlightFromSelector();
  }, { passive:true });
  window.addEventListener("scroll", ()=> {
    if (!tutOverlay.classList.contains("show")) return;
    updateSpotlightFromSelector();
  }, { passive:true });

  const TUTORIAL_STEPS = [
    {
      title: "Click the large note",
      msg: "Click the large whole note to gain Notes.",
      target: "#noteBtn",
      ensure: () => {}
    },
    {
      title: "Buy Batons",
      msg: "Batons increase your base click power and each Baton also grants +1 Ink.",
      target: "[data-baton-row='true']",
      ensure: () => {}
    },
    {
      title: "Upgrade your conducting",
      msg: "Conducting Skills unlock in order as you buy more Batons. They multiply click power and change the note symbol.",
      target: "#batonDropdown summary",
      ensure: () => { $("#batonDropdown").open = true; }
    },
    {
      title: "Start automatic production",
      msg: "Purchase instruments (start with Piccolo) to begin producing Notes every second.",
      target: "[data-inst-row='piccolo']",
      ensure: () => {
        const pic = BUILDINGS.find(b => b.id === "piccolo");
        if (!pic) return;
        S.ui.familyOpen[pic.family] = true;
        renderFamilies();
      }
    },
    {
      title: "Ink is permanent",
      msg: "Every instrument you purchase gives Ink. Use Ink to buy permanent Archive Upgrades.",
      target: "#inkDropdown summary",
      ensure: () => { $("#inkDropdown").open = true; }
    }
  ];

  function setTutorialScrollLock(locked){
    document.documentElement.classList.toggle("tutorial-lock", !!locked);
    document.body.classList.toggle("tutorial-lock", !!locked);
  }
  function setTutorialRepositioning(isRepositioning){
    if (!tutVeil) return;
    tutVeil.classList.toggle("repositioning", !!isRepositioning);
  }

  function showTutorial(){
    // FORCE tutorial to run on Main screen
    setTab("main");
    setTutorialScrollLock(true);
    tutOverlay.classList.add("show");
    tutOverlay.setAttribute("aria-hidden","false");
    advanceTutorial(0, true);
  }
  function hideTutorial(){
    tutOverlay.classList.remove("show");
    tutOverlay.setAttribute("aria-hidden","true");
    setTutorialScrollLock(false);
    setTutorialRepositioning(false);
    clearHighlight();
    spotlightTargetSelector = null;
    setSpotlightToElement(null);
  }

  function advanceTutorial(stepDelta=1, absolute=false){
    const max = TUTORIAL_STEPS.length;
    if (absolute) S.ui.tutorialStep = stepDelta;
    else S.ui.tutorialStep = (S.ui.tutorialStep || 0) + stepDelta;

    if (S.ui.tutorialStep >= max){
      S.ui.tutorialCompleted = true;
      S.ui.tutorialStep = 0;
      hideTutorial();
      save(false);
      renderAll();
      return;
    }

    const step = TUTORIAL_STEPS[S.ui.tutorialStep];
    if (!step) return;

    // Ensure main is visible for targets
    setTab("main");
    renderAll();
    step.ensure();

    $("#tutTitle").textContent = step.title;
    $("#tutMsg").textContent = step.msg;

    spotlightTargetSelector = step.target;
    setTutorialRepositioning(true);

    requestAnimationFrame(() => {
      step.ensure();
      clearHighlight();

      const targetEl = $(step.target);
      if (!targetEl){
        setTutorialRepositioning(false);
        setSpotlightToElement(null);
        return;
      }

      const behavior = S.settings.reduceMotion ? "auto" : "smooth";

      // Scroll first, then reveal the spotlight to avoid a visible "snap" from stale coordinates.
      if (targetEl.scrollIntoView){
        targetEl.scrollIntoView({ behavior, block:"center", inline:"center" });
      }

      const finalizeSpotlight = () => {
        highlight(step.target);
        updateSpotlightFromSelector();
        setTutorialRepositioning(false);
      };

      if (behavior === "smooth"){
        setTimeout(finalizeSpotlight, 260);
      } else {
        requestAnimationFrame(finalizeSpotlight);
      }
    });

    save(false);
  }

  function showPrestigeExplain(){
    S.ui.blocked = true;
    prestigeExplainOverlay.classList.add("show");
    prestigeExplainOverlay.setAttribute("aria-hidden","false");
    save(false);
  }
  function hidePrestigeExplain(){
    prestigeExplainOverlay.classList.remove("show");
    prestigeExplainOverlay.setAttribute("aria-hidden","true");
    S.ui.blocked = false;
    save(false);
  }

  function showLibraryOverlay(title, htmlMessage){
    if (!libraryMysteryOverlay) return;
    if (libraryMysteryTitle) libraryMysteryTitle.textContent = title;
    if (libraryMysteryMsg) libraryMysteryMsg.innerHTML = htmlMessage;
    S.ui.blocked = true;
    libraryMysteryOverlay.classList.add("show");
    libraryMysteryOverlay.setAttribute("aria-hidden","false");
    save(false);
  }

  function showLibraryMystery(){
    showLibraryOverlay(
      "A Whispered Opportunity",
      `Patrons are looking for a way to secure the orchestra forever.<br/><br/>` +
      `When the <b>${getFacility(FINAL_FACILITY_ID)?.name || "final venue"}</b> is fully upgraded and you hold at least <b>${fmtInt(ENDOWMENT_REQUIRED_PATRONS)}</b> Patrons, ` +
      `a hidden Endowment Rite can begin.<br/><br/>` +
      `Current progress: ${fmtInt(S.patrons || 0)} / ${fmtInt(ENDOWMENT_REQUIRED_PATRONS)} held Patrons`
    );
    S.ui.libraryForeshadowShown = true;
    save(false);
  }

  function showEndowmentReadyReveal(){
    const gain = endowmentGainFromPatrons(S.patrons || 0);
    showLibraryOverlay(
      "The Endowment Awakes",
      `Your patrons are ready.<br/><br/>` +
      `You can now perform a double-prestige in the Prestige Hall and convert held Patrons into Endowment.<br/><br/>` +
      `Current result: <b>+${fmtInt(gain)}</b> Endowment.`
    );
    S.ui.endowmentReadyShown = true;
    save(false);
  }

  function hideLibraryMystery(){
    if (!libraryMysteryOverlay) return;
    libraryMysteryOverlay.classList.remove("show");
    libraryMysteryOverlay.setAttribute("aria-hidden","true");
    S.ui.blocked = false;
    save(false);
  }

  function maybeShowLibraryMysteryAfterPrestige(){
    if (isLibraryUnlocked(S)) return;
    if (!hasFinalVenueUnlocked(S)) return;
    if (S.ui.libraryForeshadowShown) return;
    showLibraryMystery();
  }

  $("#startBtn").addEventListener("click", ()=>{
    S.ui.hasStarted = true;
    const resumeTab = (S.ui.lastTab && S.ui.lastTab !== "start") ? S.ui.lastTab : "main";
    if (!S.ui.tutorialCompleted){
      showTutorial();
    } else {
      setTab(resumeTab);
      hideTutorial();
    }
    save(false);
    renderAll();
  });

  $("#tutNextBtn").addEventListener("click", ()=> advanceTutorial(1,false));
  $("#tutSkipBtn").addEventListener("click", ()=>{
    S.ui.tutorialCompleted = true;
    S.ui.tutorialStep = 0;
    hideTutorial();
    save(false);
    renderAll();
  });
  $("#coachTipOkBtn").addEventListener("click", ()=>{
    const idx = S.ui.tooltipStep || 0;
    const step = COACH_STEPS[idx];
    if (step?.advanceOnOk){
      S.ui.tooltipStep = idx + 1;
      S.ui.tooltipAckStep = -1;
    } else {
      S.ui.tooltipAckStep = idx;
    }
    save(false);
    renderAll();
  });
  $("#coachTipDisableBtn").addEventListener("click", ()=>{
    S.ui.tooltipStep = (S.ui.tooltipStep || 0) + 1;
    S.ui.tooltipAckStep = -1;
    if ((S.ui.tooltipStep || 0) >= COACH_STEPS.length){
      S.ui.tooltipsDone = true;
    }
    save(false);
    renderAll();
  });

  $("#prestigeExplainOkBtn").addEventListener("click", ()=>{
    S.ui.prestigeExplained = true;
    hidePrestigeExplain();
    save(false);
    renderAll();
  });
  $("#prestigeExplainGoHallBtn").addEventListener("click", ()=>{
    S.ui.prestigeExplained = true;
    hidePrestigeExplain();
    S.ui.hasPrestiged = true;
    setPrestigeTabVisibility();
    setTab("prestige");
    renderAll();
  });
  $("#libraryMysteryOkBtn").addEventListener("click", ()=>{
    hideLibraryMystery();
    renderAll();
  });

  function setPrestigeTabVisibility(){
    const show = !!S.ui.hasPrestiged || (S.patronsEver || 0) > 0;
    const btn = $("#prestigeTabBtn");
    btn.hidden = !show;
  }

  function setLibraryTabVisibility(){
    const btn = $("#libraryTabBtn");
    if (!btn) return;

    if (isLibraryUnlocked(S)){
      btn.hidden = false;
      btn.disabled = false;
      btn.classList.remove("mysteryTab");
      btn.textContent = "Music Library";
      btn.title = "";
      return;
    }

    if (hasFinalVenueUnlocked(S)){
      btn.hidden = false;
      btn.disabled = true;
      btn.classList.add("mysteryTab");
      btn.textContent = "?";
      btn.title = `??? Reach ${fmtInt(ENDOWMENT_REQUIRED_PATRONS)} Patrons and fully upgrade ${getFacility(FINAL_FACILITY_ID)?.name || "the final venue"}.`;
      return;
    }

    btn.hidden = true;
    btn.disabled = true;
    btn.classList.remove("mysteryTab");
    btn.textContent = "Music Library";
    btn.title = "";
  }

  // ---------- Economy ----------
  function buildingCostAtOwned(b, owned){
    return buildingCostAtOwnedCore(b, owned);
  }

  function sumCostForK(b, k){
    return sumCostForKCore(S, b, k, BATON_ITEM);
  }

  // For x10/x100 modes, buy as many as affordable up to the mode cap.
  function buyCountForMode(b, mode){
    return buyCountForModeCore(S, b, mode, BATON_ITEM, NOTE_UPGRADES, BATON_UPGRADES);
  }

  function facilityNpsMultOnly(){
    return facilityMults(S).nps;
  }

  function batonBaseClickForState(s){
    return batonBaseClickForStateCore(s);
  }

  function batonClickMultForState(s){
    return batonClickMultForStateCore(s, BATON_UPGRADES, hasBatonTechnique);
  }

  function globalNpsMultiplierForState(s){
    return globalNpsMultiplierForStateCore(s, facilityMults, patronBonus);
  }

  function baseInstrumentNpsForState(s, b){
    return baseInstrumentNpsForStateCore(s, b);
  }

  function totalNpsForState(s){
    return totalNpsForStateCore(s, BUILDINGS, facilityMults, patronBonus);
  }

  function notesPerClickForState(s){
    return notesPerClickForStateCore(s, {
      buildings: BUILDINGS,
      batonUpgrades: BATON_UPGRADES,
      hasBatonTechnique,
      facilityMults,
      patronBonus,
    });
  }

  function previewDelta(mutator){
    return previewDeltaForState(S, mutator);
  }

  function previewDeltaForState(state, mutator){
    return previewDeltaCore(state, mutator, {
      buildings: BUILDINGS,
      batonUpgrades: BATON_UPGRADES,
      hasBatonTechnique,
      facilityMults,
      patronBonus,
    });
  }

  function totalNps(){
    return totalNpsForState(S);
  }

  function effectiveInstrumentNps(b){
    return baseInstrumentNpsForState(S, b) * globalNpsMultiplierForState(S);
  }

  function effectiveFamilyNps(familyId){
    let sum = 0;
    for (const b of BUILDINGS){
      if (b.family !== familyId) continue;
      sum += baseInstrumentNpsForState(S, b);
    }
    return sum * globalNpsMultiplierForState(S);
  }

  function notesPerClick(){
    return notesPerClickForState(S);
  }

  function buyBuilding(id, mode){
    if (isBlocked()) return false;

    const b = BUILDINGS.find(x=>x.id===id);
    if (!b) return false;

    const k = buyCountForMode(b, mode);

    if (k <= 0) return false;

    const cost = sumCostForK(b, k);
    if (S.notes < cost) return false;

    S.notes -= cost;
    S.owned[id] = (S.owned[id]||0) + k;

    S.ink += k;
    S.stats.buildingsBought += k;
    S.stats.inkEarned += k;

    toast(`Bought ${k} × ${b.name} (+${k} Ink).`, { key:`buy:${b.id}`, ttl: 2100 });
    return true;
  }

  function buyBaton(mode){
    if (isBlocked()) return false;

    const k = buyCountForMode(BATON_ITEM, mode);
    if (k <= 0) return false;

    const cost = sumCostForK(BATON_ITEM, k);
    if (S.notes < cost) return false;

    S.notes -= cost;
    S.batonOwned = (S.batonOwned || 0) + k;
    S.batonBaseExtra = +(((S.batonBaseExtra || 0) + (k * BATON_ITEM.basePer)).toFixed(4));
    S.ink += k;
    S.stats.inkEarned += k;

    addRecentUnlock("Baton", `Bought ${k} baton${k===1?"":"s"}`);
    toast(`Bought ${k} × Baton (+${fmtExact(k * BATON_ITEM.basePer, false)} base click, +${k} Ink).`, { key:"buy:baton", ttl: 2100 });
    return true;
  }

  function buyNoteUpgrade(id, silent=false){
    if (isBlocked()) return;

    const u = NOTE_UPGRADES.find(x=>x.id===id);
    if (!u) return;
    if (S.noteUpgrades[id]) return;
    if ((S.owned[u.buildingId]||0) < u.requireOwned) return;
    if (S.notes < u.costNotes) return;

    S.notes -= u.costNotes;
    S.noteUpgrades[id] = true;
    u.apply(S);
    addRecentUnlock("Upgrade", u.name);
    if (!silent) toast(`Upgrade: ${u.name}`);
    return true;
  }

  function buySynergyUpgrade(id, silent=false){
    if (isBlocked()) return;

    const u = SYNERGY_UPGRADES.find(x=>x.id===id);
    if (!u) return;
    if (S.synergyUpgrades[id]) return;
    if (!u.can(S)) return;
    if (S.notes < u.costNotes) return;

    S.notes -= u.costNotes;
    S.synergyUpgrades[id] = true;
    u.apply(S);
    addRecentUnlock("Synergy", u.name);
    if (!silent) toast(`Synergy: ${u.name}`);
    return true;
  }

  function buyInkUpgrade(id, silent=false){
    if (isBlocked()) return;

    const u = INK_UPGRADES.find(x=>x.id===id);
    if (!u) return;
    if (S.inkUpgrades[id]) return;
    if (S.ink < u.costInk) return;

    S.ink -= u.costInk;
    S.inkUpgrades[id] = true;
    u.apply(S);
    addRecentUnlock("Archive", u.name);
    if (!silent) toast(`Archive: ${u.name}`);
    return true;
  }

  function buyBatonUpgrade(id, silent=false){
    if (isBlocked()) return;

    const u = BATON_UPGRADES.find(x=>x.id===id);
    if (!u) return;
    if (hasBatonTechnique(S, id)) return;

    if (!batonUpgradeUnlockedInState(S, u)) return;
    if (S.notes < u.costNotes) return;

    S.notes -= u.costNotes;
    S.batonUpgrades[id] = 1;

    if (u.setStage !== undefined && u.setStage > (S.noteStageIdx || 0)){
      S.noteStageIdx = u.setStage;
    }

    S.batonClickMult = batonClickMultForState(S);

    addRecentUnlock("Technique", u.name);
    if (!silent) toast(`Baton: ${u.name}`);
    return true;
  }

  function availableUpgradeOptions(state = S){
    const options = [];

    for (const u of NOTE_UPGRADES){
      if (state.noteUpgrades[u.id]) continue;
      if ((state.owned[u.buildingId] || 0) < u.requireOwned) continue;
      if ((state.notes || 0) < u.costNotes) continue;
      const delta = previewDeltaForState(state, (s) => {
        s.noteUpgrades[u.id] = true;
        u.apply(s);
      });
      options.push({
        key: `note:${u.id}`,
        label: u.name,
        kind: "note",
        delta,
        apply: () => buyNoteUpgrade(u.id, true)
      });
    }

    for (const u of BATON_UPGRADES){
      if (hasBatonTechnique(state, u.id)) continue;
      if (!batonUpgradeUnlockedInState(state, u)) continue;
      if ((state.notes || 0) < u.costNotes) continue;
      const delta = previewDeltaForState(state, (s) => {
        s.batonUpgrades[u.id] = 1;
        if (u.setStage !== undefined && u.setStage > (s.noteStageIdx || 0)){
          s.noteStageIdx = u.setStage;
        }
        s.batonClickMult = batonClickMultForState(s);
      });
      options.push({
        key: `baton:${u.id}`,
        label: u.name,
        kind: "baton",
        delta,
        apply: () => buyBatonUpgrade(u.id, true)
      });
    }

    for (const u of SYNERGY_UPGRADES){
      if (state.synergyUpgrades[u.id]) continue;
      if (!u.can(state)) continue;
      if ((state.notes || 0) < u.costNotes) continue;
      const delta = previewDeltaForState(state, (s) => {
        s.synergyUpgrades[u.id] = true;
        u.apply(s);
      });
      options.push({
        key: `syn:${u.id}`,
        label: u.name,
        kind: "synergy",
        delta,
        apply: () => buySynergyUpgrade(u.id, true)
      });
    }

    options.sort((a, b) => {
      if (Math.abs((b.delta?.nps || 0) - (a.delta?.nps || 0)) > 1e-9){
        return (b.delta?.nps || 0) - (a.delta?.nps || 0);
      }
      if (Math.abs((b.delta?.click || 0) - (a.delta?.click || 0)) > 1e-9){
        return (b.delta?.click || 0) - (a.delta?.click || 0);
      }
      return a.label.localeCompare(b.label);
    });

    return options;
  }

  function buyAllAvailableUpgrades(){
    if (isBlocked()) return;

    let purchased = 0;
    let firstName = "";

    while (true){
      const options = availableUpgradeOptions(S);
      if (options.length === 0) break;
      const best = options[0];
      if (!best) break;
      const ok = best.apply();
      if (!ok) break;
      if (!firstName) firstName = best.label;
      purchased++;
    }

    if (purchased <= 0){
      toast("No unlocked upgrades are currently affordable.");
      return;
    }

    toast(`Bought ${purchased} upgrade${purchased === 1 ? "" : "s"}${firstName ? ` • Started with ${firstName}` : ""}.`);
    renderAll();
  }

  // ✅ Global “manual click” debounce (prevents double-fire from touch/click overlap)
  let lastManualClickAt = 0;

  function clickNote(){
    if (isBlocked()) return;

    const t = now();
    if (t - lastManualClickAt < 35) return;
    lastManualClickAt = t;

    const gain = notesPerClick();
    S.notes += gain;
    S.lifetimeNotes += gain;
    S.runNotes += gain;
    S.stats.clicks += 1;
  }

  // ✅ FAST TAP (mobile) + click (desktop) wiring — bound ONCE
  function wireNoteButtonOnce(){
    const btn = document.getElementById("noteBtn");
    wireNoteButtonOnceCore(btn, now, () => {
      clickNote();
      renderHUD();
    });
  }

  // ---------- Offline Progress ----------
  function applyOffline(){
    const t = now();
    const dt = (t - S.lastTick) / 1000;
    if (dt <= 2) return;

    const cap = 6 * 60 * 60;
    const used = Math.min(dt, cap);

    const gained = totalNps() * used;
    S.notes += gained;
    S.lifetimeNotes += gained;
    S.runNotes += gained;

    toast(`Welcome back! +${fmtExact(gained, S.settings.abbrevLarge)} Notes from ${Math.floor(used/60)}m offline.`);
  }

  // ---------- Tabs ----------
  let statsLiveTimer = null;

  function startStatsLive(){
    stopStatsLive();
    renderStats();
    statsLiveTimer = setInterval(() => {
      if (S.ui.tab !== "stats") return;
      renderStats();
      const timeStr = new Date().toLocaleString();
      $("#statsClock").textContent = timeStr;
    }, 250);
  }
  function stopStatsLive(){
    if (statsLiveTimer){
      clearInterval(statsLiveTimer);
      statsLiveTimer = null;
    }
  }

  function setTab(tab){
    if (tab === "library" && !isLibraryUnlocked(S)){
      toast("The library remains sealed for now.");
      tab = ((S.patronsEver || 0) > 0 || S.ui.hasPrestiged) ? "prestige" : "main";
    }
    const prevTab = S.ui.tab;
    S.ui.tab = tab;
    if (tab !== "start") S.ui.lastTab = tab;
    document.body.classList.toggle("start-screen", tab === "start");

    $("#tab-start").hidden = tab !== "start";
    $("#tab-main").hidden = tab !== "main";
    $("#tab-stats").hidden = tab !== "stats";
    $("#tab-achievements").hidden = tab !== "achievements";
    $("#tab-prestige").hidden = tab !== "prestige";
    $("#tab-library").hidden = tab !== "library" || !isLibraryUnlocked(S);
    $("#tab-settings").hidden = tab !== "settings";

    // Only highlight actual nav buttons (no start button)
    $$("button[data-tab]").forEach(b => b.classList.toggle("active", b.getAttribute("data-tab") === tab));

    if (tab === "stats") startStatsLive();
    else stopStatsLive();
    if (tab === "achievements"){
      renderAchievements();
      renderRecentUnlocks();
    }
    if (tab === "library" && renderLibraryCore){
      renderLibraryCore(S, { fmtExact, useSuffix: !!S.settings.abbrevLarge });
    }
    if (prevTab === "library" && tab !== "library" && stopLibraryPlaybackCore){
      stopLibraryPlaybackCore();
    }
    updateFloatingControls();
    maybeShowCoachTip();

    save(false);
  }
  $$("button[data-tab]").forEach(btn=>{
    btn.addEventListener("click", ()=> {
      // if not started, prevent navigating away from start
      if (!S.ui.hasStarted) return;
      if (btn.disabled) return;
      setTab(btn.getAttribute("data-tab"));
    });
  });

  // ---------- UI Helpers ----------
  function setBuyMode(mode){
    S.buyMode = mode;
    ["buy1","buy10","buy100","buyMax"].forEach(id=>{
      const btn = $("#"+id);
      if (!btn) return;
      const m = btn.getAttribute("data-buymode");
      btn.classList.toggle("active", m === mode);
    });
    [["mBuy1","1"],["mBuy10","10"],["mBuy100","100"],["mBuyMax","max"]].forEach(([id,m])=>{
      const btn = $("#"+id);
      if (btn) btn.classList.toggle("active", m === mode);
    });
    [["dBuy1","1"],["dBuy10","10"],["dBuy100","100"],["dBuyMax","max"]].forEach(([id,m])=>{
      const btn = $("#"+id);
      if (btn) btn.classList.toggle("active", m === mode);
    });
    save(false);
    renderFamilies();
    refreshDynamicShopStates();
    updateFloatingControls();
  }

  const INK_TAB_LABELS = {
    nps: "Notes/sec",
    clicknps: "Click % of NPS",
    clickmult: "Click Power",
  };
  function inkUpgradeCategory(u){
    if (u.group) return u.group;
    if (u.id.startsWith("iu_clicknps_")) return "clicknps";
    if (u.id.startsWith("iu_clickmult_")) return "clickmult";
    return "nps";
  }
  function normalizeInkTab(tab){
    return INK_TAB_LABELS[tab] ? tab : "nps";
  }
  function syncInkTabButtons(){
    const active = normalizeInkTab(S.ui.inkTab);
    $$("button[data-inktab]").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-inktab") === active);
    });
  }
  function setInkTab(tab){
    const next = normalizeInkTab(tab);
    if (S.ui.inkTab === next){
      syncInkTabButtons();
      return;
    }
    S.ui.inkTab = next;
    syncInkTabButtons();
    renderInkUpgrades();
    refreshDynamicShopStates();
    save(false);
  }

  function updateFloatingControls(){
    const mainActive = (S.ui.tab === "main") && !!S.ui.hasStarted && !!S.ui.tutorialCompleted && !tutOverlay.classList.contains("show");
    const mobile = $("#mobileActionBar");
    const desktopDock = $("#desktopBuyDock");
    const isMobile = window.matchMedia("(max-width: 980px)").matches;

    const noteBtn = $("#noteBtn");
    let noteVisible = true;
    if (noteBtn){
      const r = noteBtn.getBoundingClientRect();
      noteVisible = (r.bottom > 80) && (r.top < (window.innerHeight - 80));
    }

    const seg = $("#buyModeSeg");
    const headerBottom = $("header")?.getBoundingClientRect().bottom || 0;
    let segVisible = true;
    if (seg){
      const r = seg.getBoundingClientRect();
      segVisible = (r.bottom > headerBottom + 4) && (r.top < (window.innerHeight - 12));
    }

    if (mobile) mobile.hidden = !mainActive || !isMobile || noteVisible;
    if (desktopDock) desktopDock.hidden = !mainActive || isMobile || segVisible;
  }

  function instrumentLabelFamily(familyId){
    const f = FAMILY_ORDER.find(x=>x.id===familyId);
    return f ? f.label : familyId;
  }

  const achievementBanner = $("#achievementBanner");
  const achievementBannerName = $("#achievementBannerName");
  const achievementBannerDesc = $("#achievementBannerDesc");
  const achievementBannerBonus = $("#achievementBannerBonus");
  let achievementBannerActive = false;
  const achievementBannerQueue = [];

  function achievementCategory(a){
    const id = a?.id || "";
    if (id.startsWith("ach_woodwind_all_") || id.startsWith("ach_brass_all_") || id.startsWith("ach_strings_all_") || id.startsWith("ach_perc_all_") || id.startsWith("ach_sections_balanced_")){
      return "Section Sets";
    }
    if (id.startsWith("ach_baton") || id.startsWith("ach_batons_owned") || id.startsWith("ach_note_stage")){
      return "Baton Progression";
    }
    if (id.startsWith("ach_ink") || id.startsWith("ach_archive")){
      return "Ink & Archive";
    }
    if (id.startsWith("ach_patrons") || id.startsWith("ach_facility_up")){
      return "Prestige & Venue";
    }
    if (id.startsWith("ach_synergy")){
      return "Synergies";
    }
    return "Core Milestones";
  }

  function achievementBonusText(a){
    const pct = ((a.mult - 1) * 100).toFixed(2);
    return a.kind === "click" ? `+${pct}% click power` : `+${pct}% Notes/sec`;
  }

  function playNextAchievementBanner(){
    if (achievementBannerActive) return;
    if (!achievementBanner || achievementBannerQueue.length === 0) return;
    const a = achievementBannerQueue.shift();
    if (!a) return;

    achievementBannerActive = true;
    achievementBannerName.textContent = a.name;
    achievementBannerDesc.textContent = a.desc || achievementCategory(a);
    achievementBannerBonus.textContent = achievementBonusText(a);

    achievementBanner.hidden = false;
    achievementBanner.classList.remove("show");
    void achievementBanner.offsetWidth;
    achievementBanner.classList.add("show");

    const liveMs = S.settings.reduceMotion ? 2160 : 3900;
    const outMs = S.settings.reduceMotion ? 108 : 290;
    setTimeout(()=>{
      achievementBanner.classList.remove("show");
      setTimeout(()=>{
        if (!achievementBanner.classList.contains("show")) achievementBanner.hidden = true;
        achievementBannerActive = false;
        playNextAchievementBanner();
      }, outMs);
    }, liveMs);
  }

  function queueAchievementBanner(a){
    if (!a) return;
    achievementBannerQueue.push(a);
    playNextAchievementBanner();
  }

  function applyAchievementReward(a){
    if (a.kind === "click"){
      S.achClickMult = (S.achClickMult || 1) * a.mult;
    } else {
      S.achNpsMult = (S.achNpsMult || 1) * a.mult;
    }
  }

  function checkAchievements(showToast=true){
    if (!S.achievements) S.achievements = {};
    let unlockedNow = [];

    for (const a of ACHIEVEMENTS){
      if (S.achievements[a.id]) continue;
      if (!a.unlocked(S)) continue;
      S.achievements[a.id] = true;
      applyAchievementReward(a);
      if (showToast) addRecentUnlock("Achievement", a.name);
      unlockedNow.push(a);
    }

    if (unlockedNow.length > 0){
      if (showToast){
        unlockedNow.forEach(a => queueAchievementBanner(a));
      }
      save(false);
    }
    return unlockedNow.length;
  }

  function addRecentUnlock(type, name){
    if (!S.recentUnlocks) S.recentUnlocks = [];
    S.recentUnlocks.unshift({
      type,
      name,
      at: new Date().toLocaleString()
    });
    if (S.recentUnlocks.length > 30) S.recentUnlocks.length = 30;
  }

  function applyVisualSettings(){
    document.body.classList.toggle("reduce-motion", !!S.settings.reduceMotion);
    document.body.classList.toggle("high-contrast", !!S.settings.highContrast);
  }

  function clickDeltaFromNpsDelta(deltaNps){
    if (deltaNps <= 0 || S.clickFromNpsRate <= 0) return 0;
    const fac = facilityMults(S);
    return (S.clickFromNpsRate * deltaNps) * batonClickMult() * S.metaClickMult * (S.achClickMult || 1) * patronBonus(S.patrons) * fac.click;
  }

  function refreshDynamicShopStates(){
    const blocked = isBlocked();
    const useSuffix = !!S.settings.abbrevLarge;
    const globalNps = globalNpsMultiplierForState(S);

    const mobileModeIds = [["mBuy1","1"],["mBuy10","10"],["mBuy100","100"],["mBuyMax","max"]];
    mobileModeIds.forEach(([id, mode])=>{
      const b = $("#"+id);
      if (b) b.classList.toggle("active", S.buyMode === mode);
    });
    const upgradeOptions = availableUpgradeOptions(S);

    const batonBtn = $("#buyBatonBtn");
    if (batonBtn){
      const owned = S.batonOwned || 0;
      const k = buyCountForMode(BATON_ITEM, S.buyMode);
      const qty = (k > 0) ? k : 1;
      const cost = (k > 0) ? sumCostForK(BATON_ITEM, k) : buildingCostAtOwned(BATON_ITEM, owned);
      const gain = previewDelta((s)=>{
        s.batonOwned = (s.batonOwned || 0) + qty;
        s.batonBaseExtra = +(((s.batonBaseExtra || 0) + (qty * BATON_ITEM.basePer)).toFixed(4));
      }).click;
      const deltaClick = gain;
      const tip = `${formatDeltaTip(0, deltaClick)} • +${qty} Ink`;

      batonBtn.textContent = batonBuyLabel(S.buyMode, k);

      const enabled = !blocked && k > 0;
      let reason = "";
      if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (k <= 0) reason = `Need ${fmtExact(cost, useSuffix)} Notes for next Baton (${fmtExact(S.notes, useSuffix)}/${fmtExact(cost, useSuffix)}).`;
      setButtonState(batonBtn, enabled, reason);
      setButtonEffectTip(batonBtn, tip);

      const ownedEl = document.querySelector("[data-baton-owned]");
      if (ownedEl) ownedEl.textContent = `${owned}`;
      const costEl = $("#batonCostLine");
      if (costEl) costEl.textContent = `Cost: ${fmtExact(cost, useSuffix)} Notes`;
      const gainEl = $("#batonGainLine");
      if (gainEl) gainEl.textContent = `+${fmtExact(gain, useSuffix)} Notes/click`;
      const inkEl = $("#batonInkLine");
      if (inkEl) inkEl.textContent = `+${qty} Ink`;
    }

    const mQuickNote = $("#mQuickNoteBtn");
    if (mQuickNote){
      const enabled = !blocked;
      let reason = "";
      if (blocked) reason = "Unavailable while tutorial or modal is open.";
      setButtonState(mQuickNote, enabled, reason);
      if (!blocked) mQuickNote.title = `Tap note (+${fmtExact(notesPerClick(), useSuffix)}).`;
    }
    ["mBuyUpgrades", "dBuyUpgrades"].forEach((id) => {
      const btn = $("#"+id);
      if (!btn) return;
      const best = upgradeOptions[0] || null;
      const enabled = !blocked && !!best;
      let reason = "";
      if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (!best) reason = "No unlocked affordable upgrades right now.";
      setButtonState(btn, enabled, reason);
      if (best){
        btn.title = `Starts with ${best.label} (${formatDeltaTip(best.delta.nps, best.delta.click)}).`;
      }
    });

    BUILDINGS.forEach(b=>{
      const buyBtn = document.querySelector(`button[data-buy="${b.id}"]`);
      if (!buyBtn) return;

      const owned = S.owned[b.id] || 0;
      const k = buyCountForMode(b, S.buyMode);
      const cost = (k > 0) ? sumCostForK(b, k) : buildingCostAtOwned(b, owned);
      const qty = (k > 0) ? k : 1;
      const deltaNps = qty * b.nps * (S.buildingMult[b.id] || 1) * globalNps;
      const deltaClick = clickDeltaFromNpsDelta(deltaNps);
      const tip = `${formatDeltaTip(deltaNps, deltaClick)} • +${qty} Ink`;

      buyBtn.textContent = instrumentBuyLabel(S.buyMode, k);

      const enabled = !blocked && k > 0;
      let reason = "";
      if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (k <= 0) reason = `Need ${fmtExact(cost, useSuffix)} Notes for next ${b.name} (${fmtExact(S.notes, useSuffix)}/${fmtExact(cost, useSuffix)}).`;
      setButtonState(buyBtn, enabled, reason);
      setButtonEffectTip(buyBtn, tip);

      const costEl = document.querySelector(`[data-buy-cost="${b.id}"]`);
      if (costEl) costEl.textContent = `Cost: ${fmtExact(cost, useSuffix)} Notes`;
      const inkEl = document.querySelector(`[data-buy-ink="${b.id}"]`);
      if (inkEl) inkEl.textContent = (k > 0) ? `+${k} Ink` : "+1 Ink";
    });

    document.querySelectorAll("button[data-bt]").forEach(btn=>{
      const u = BATON_UPGRADES.find(x => x.id === btn.getAttribute("data-bt"));
      if (!u) return;
      const owned = hasBatonTechnique(S, u.id);
      const unlocked = batonUpgradeUnlockedInState(S, u);
      const afford = S.notes >= u.costNotes;
      const enabled = !blocked && !owned && unlocked && afford;
      const deltaClick = notesPerClick() * ((u.clickMult || 1) - 1);
      const tip = formatDeltaTip(0, deltaClick);
      let reason = "";
      if (owned) reason = "Already purchased.";
      else if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (!unlocked){
        const idx = BATON_UPGRADES.findIndex(x => x.id === u.id);
        const prevId = idx > 0 ? BATON_UPGRADES[idx - 1].id : null;
        if (prevId && !hasBatonTechnique(S, prevId)) reason = "Buy the previous Conducting Skill first.";
        else reason = `Need ${u.requireBatons || 0} Batons (${fmtInt(S.batonOwned || 0)}/${fmtInt(u.requireBatons || 0)}).`;
      }
      else if (!afford) reason = `Need ${fmtExact(u.costNotes, useSuffix)} Notes (${fmtExact(S.notes, useSuffix)}/${fmtExact(u.costNotes, useSuffix)}).`;
      setButtonState(btn, enabled, reason);
      setButtonEffectTip(btn, tip);
    });

    document.querySelectorAll("button[data-nu]").forEach(btn=>{
      const u = NOTE_UPGRADES.find(x => x.id === btn.getAttribute("data-nu"));
      if (!u) return;
      const owned = !!S.noteUpgrades[u.id];
      const have = S.owned[u.buildingId] || 0;
      const unlocked = have >= u.requireOwned;
      const afford = S.notes >= u.costNotes;
      const enabled = !blocked && !owned && unlocked && afford;
      const b = BUILDINGS.find(x=>x.id===u.buildingId);
      const deltaNps = b ? ((S.owned[b.id] || 0) * b.nps * (S.buildingMult[b.id] || 1) * globalNps) : 0;
      const deltaClick = clickDeltaFromNpsDelta(deltaNps);
      const tip = formatDeltaTip(deltaNps, deltaClick);
      let reason = "";
      if (owned) reason = "Already purchased.";
      else if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (!unlocked) reason = `Need ${u.requireOwned} owned (${have}/${u.requireOwned}).`;
      else if (!afford) reason = `Need ${fmtExact(u.costNotes, useSuffix)} Notes (${fmtExact(S.notes, useSuffix)}/${fmtExact(u.costNotes, useSuffix)}).`;
      setButtonState(btn, enabled, reason);
      setButtonEffectTip(btn, tip);
    });

    document.querySelectorAll("button[data-syn]").forEach(btn=>{
      const u = SYNERGY_UPGRADES.find(x => x.id === btn.getAttribute("data-syn"));
      if (!u) return;
      const owned = !!S.synergyUpgrades[u.id];
      const can = u.can(S);
      const afford = S.notes >= u.costNotes;
      const enabled = !blocked && !owned && can && afford;
      const delta = previewDelta(s => u.apply(s));
      const tip = formatDeltaTip(delta.nps, delta.click);
      let reason = "";
      if (owned) reason = "Already purchased.";
      else if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (!can) reason = "Requirement not met yet.";
      else if (!afford) reason = `Need ${fmtExact(u.costNotes, useSuffix)} Notes (${fmtExact(S.notes, useSuffix)}/${fmtExact(u.costNotes, useSuffix)}).`;
      setButtonState(btn, enabled, reason);
      setButtonEffectTip(btn, tip);
    });

    document.querySelectorAll("button[data-iu]").forEach(btn=>{
      const u = INK_UPGRADES.find(x => x.id === btn.getAttribute("data-iu"));
      if (!u) return;
      const owned = !!S.inkUpgrades[u.id];
      const afford = S.ink >= u.costInk;
      const enabled = !blocked && !owned && afford;
      const delta = previewDelta(s => u.apply(s));
      const tip = formatDeltaTip(delta.nps, delta.click);
      let reason = "";
      if (owned) reason = "Already purchased.";
      else if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (!afford) reason = `Need ${u.costInk} Ink (${fmtInt(S.ink || 0)}/${fmtInt(u.costInk)}).`;
      setButtonState(btn, enabled, reason);
      setButtonEffectTip(btn, tip);
    });

    document.querySelectorAll("button[data-fup]").forEach(btn=>{
      const id = btn.getAttribute("data-fup");
      const f = getFacility(S.facility.currentId);
      const up = f?.upgrades?.find(x => x.id === id);
      if (!up) return;
      const owned = !!S.facility.purchasedUpgrades[id];
      const afford = canAffordPatrons(up.cost);
      const enabled = !blocked && !owned && afford;
      const delta = previewDelta(s => { s.facility.purchasedUpgrades[id] = true; });
      const tip = formatDeltaTip(delta.nps, delta.click);
      let reason = "";
      if (owned) reason = "Already purchased.";
      else if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (!afford) reason = `Need ${up.cost} Patron(s) (${fmtInt(S.patrons || 0)}/${fmtInt(up.cost)}).`;
      setButtonState(btn, enabled, reason);
      setButtonEffectTip(btn, tip);
    });

    document.querySelectorAll("button[data-fac]").forEach(btn=>{
      const id = btn.getAttribute("data-fac");
      const f = getFacility(id);
      if (!f) return;
      const afford = canAffordPatrons(f.patronCostToUnlock);
      const enabled = !blocked && afford;
      const delta = previewDelta(s => {
        const carry = facilityCarryBonusFromCurrent(s, s.facility.currentId);
        if (!s.facility.baseBonus) s.facility.baseBonus = {};
        s.facility.baseBonus[id] = { nps: carry.nps, click: carry.click };
        s.facility.unlocked[id] = true;
        s.facility.currentId = id;
      });
      const tip = formatDeltaTip(delta.nps, delta.click);
      let reason = "";
      if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (!afford) reason = `Need ${f.patronCostToUnlock} Patron(s) (${fmtInt(S.patrons || 0)}/${fmtInt(f.patronCostToUnlock)}).`;
      setButtonState(btn, enabled, reason);
      setButtonEffectTip(btn, tip);
    });
  }

  // ---------- Render ----------
  function renderHUD(){
    const nps = totalNps();
    const npc = notesPerClick();
    const useSuffix = !!S.settings.abbrevLarge;

    $("#notesHud").textContent = fmtNotesHud(S.notes, useSuffix);
    $("#npsHud").textContent = fmtExact(nps, useSuffix);
    $("#npcHud").textContent = fmtExact(npc, useSuffix);
    $("#inkHud").textContent = fmtNotesHud(S.ink, useSuffix);
    $("#patronsHud").textContent = fmtPatronsHud(S.patrons);

    $("#bigNotes").textContent = `${fmtNotesHud(S.notes, useSuffix)} Notes`;
    $("#npsMini").textContent = fmtExact(nps, useSuffix);

    $("#inkBonusMini").textContent = `x${S.metaNpsMult.toFixed(3)}`;
    $("#patronBonusMini").textContent = `x${(1 + (S.patrons||0) * 0.05).toFixed(2)}`;

    $("#runNotesLine").textContent = `Run Notes: ${fmtNotesHud(S.runNotes || 0, useSuffix)}`;
    $("#lifetimeNotesLine").textContent = `Lifetime Notes: ${fmtNotesHud(S.lifetimeNotes, useSuffix)}`;

    const p = prestigePreview();
    $("#patronLine").textContent = `You have: ${S.patrons} Patron(s) • Take-a-bow Gain: +${p.gain}`;

    const rem = runNotesUntilNextPatron(S);
    $("#nextPatronInfo").textContent = `Next Patron in: ${fmtExact(rem, useSuffix)} Notes`;

    const st = currentStage();
    $("#noteBtn").innerHTML = noteMarkup(st);
    $("#batonTag").textContent = st.label;
    const mQuickNote = $("#mQuickNoteBtn");
    if (mQuickNote) mQuickNote.innerHTML = noteMarkup(st);

    const timeStr = new Date().toLocaleString();
    $("#clock").textContent = timeStr;
    $("#statsClock").textContent = timeStr;
    const ac = $("#achClock");
    if (ac) ac.textContent = timeStr;
    $("#settingsClock").textContent = timeStr;
    const pc = $("#prestigeClock");
    if (pc) pc.textContent = timeStr;
  }

  function renderBatonShop(){
    const el = $("#batonShopList");
    if (!el) return;

    const useSuffix = !!S.settings.abbrevLarge;
    const owned = S.batonOwned || 0;
    const k = buyCountForMode(BATON_ITEM, S.buyMode);
    const qty = (k > 0) ? k : 1;
    const cost = (k > 0) ? sumCostForK(BATON_ITEM, k) : buildingCostAtOwned(BATON_ITEM, owned);
    const afford = (k > 0) && !isBlocked();
    const gain = previewDelta((s)=>{
      s.batonOwned = (s.batonOwned || 0) + qty;
      s.batonBaseExtra = +(((s.batonBaseExtra || 0) + (qty * BATON_ITEM.basePer)).toFixed(4));
    }).click;

    const row = document.createElement("div");
    row.className = "mini";
    row.setAttribute("data-baton-row", "true");
    row.innerHTML = `
      <div class="name">
        <div class="top">
          <b>${BATON_ITEM.name}</b>
          <span class="tag good">Owned: <span class="mono" data-baton-owned>${owned}</span></span>
          <span class="tag">Base click: <span class="mono">${fmtExact(batonBaseClick(), false)}</span></span>
        </div>
        <div class="muted smallSans">Each baton improves click power and grants Ink.</div>
        <div class="cost" id="batonGainLine" style="margin-top:4px;">+${fmtExact(gain, useSuffix)} Notes/click</div>
        <div class="muted smallSans mono" id="batonInkLine">+${qty} Ink</div>
      </div>
      <div class="right">
        <button class="primary" id="buyBatonBtn" ${afford ? "" : "disabled"}>${batonBuyLabel(S.buyMode, k)}</button>
        <div class="cost mono" id="batonCostLine">Cost: ${fmtExact(cost, useSuffix)} Notes</div>
      </div>
    `;

    el.innerHTML = "";
    el.appendChild(row);

    const btn = $("#buyBatonBtn");
    if (btn){
      btn.addEventListener("click", ()=>{
        const ok = buyBaton(S.buyMode);
        if (ok) renderAll();
      });
    }
  }

  function renderBatonUpgrades(){
    const el = $("#batonUpgradeList");
    el.innerHTML = "";
    const useSuffix = !!S.settings.abbrevLarge;

    const bd = $("#batonDropdown");
    bd.open = !!S.ui.batonOpen;
    if (!bd._bound){
      bd.addEventListener("toggle", ()=>{
        S.ui.batonOpen = bd.open;
        save(false);
      });
      bd._bound = true;
    }

    const ordered = BATON_UPGRADES.slice();
    const next = ordered.find(u => !hasBatonTechnique(S, u.id)) || null;
    const relevant = ordered.filter(u => hasBatonTechnique(S, u.id) || (next && u.id === next.id));

    for (const u of relevant){
      const owned = hasBatonTechnique(S, u.id);
      const unlocked = batonUpgradeUnlockedInState(S, u);
      const afford = S.notes >= u.costNotes;
      const tag = upgradeTagState({
        owned,
        unlocked,
        afford,
        ownedText: "Purchased",
        unlockedText: "Available",
        lockedText: "Locked"
      });

      const div = document.createElement("div");
      div.className = "mini" + (owned ? " purchased" : "");
      div.innerHTML = `
        <div class="name">
          <div class="top">
            <b>${u.name}${owned ? " ✅" : ""}</b>
            <span class="tag ${tag.cls}">${tag.text}</span>
          </div>
          <div class="muted smallSans">${u.desc}</div>
          ${
            owned ? "" : `<div class="muted smallSans mono" style="margin-top:4px;">Requires ${fmtInt(u.requireBatons || 0)} Batons</div>`
          }
          ${
            owned ? "" : `
            <div class="muted smallSans mono afterPurchase" style="margin-top:4px;">
              After purchase: Baton click multiplier <b>x${((batonClickMult() || 1) * (u.clickMult || 1)).toFixed(2)}</b>
            </div>`
          }
        </div>
        <div class="right">
          <button data-bt="${u.id}" ${(!owned && unlocked && afford && !isBlocked()) ? "" : "disabled"}>Buy</button>
          <div class="cost mono">${fmtExact(u.costNotes, useSuffix)} Notes</div>
        </div>
      `;
      el.appendChild(div);
    }

    el.querySelectorAll("button[data-bt]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        buyBatonUpgrade(btn.getAttribute("data-bt"));
        renderAll();
      });
    });
  }

  function renderFamilies(){
    const stack = $("#familyStack");
    stack.innerHTML = "";
    const useSuffix = !!S.settings.abbrevLarge;

    const total = totalNps();

    for (const fam of FAMILY_ORDER){
      const famBuildings = BUILDINGS.filter(b => b.family === fam.id);
      if (famBuildings.length === 0) continue;

      const isOpen = (S.ui.familyOpen[fam.id] !== undefined) ? S.ui.familyOpen[fam.id] : fam.defaultOpen;

      const d = document.createElement("details");
      d.open = !!isOpen;

      d.addEventListener("toggle", ()=>{
        S.ui.familyOpen[fam.id] = d.open;
        save(false);
      });

      const ownedCount = famBuildings.reduce((a,b)=>a+(S.owned[b.id]||0),0);

      const famNps = effectiveFamilyNps(fam.id);
      const famPct = total > 0 ? (famNps / total) : 0;

      const ownedTag = `<span class="tag good">Owned: <span class="mono">${ownedCount}</span></span>`;
      const npsTag   = `<span class="tag">NPS: <span class="mono">${fmtExact(famNps, useSuffix)}</span> • <span class="mono">${fmtPct(famPct)}</span></span>`;

      d.innerHTML = `
        <summary>
          <span class="familyHeader">
            <span>${instrumentLabelFamily(fam.id)}</span>
            ${ownedTag}
            ${npsTag}
          </span>
          <span class="tag">${famBuildings.length} instruments</span>
        </summary>
        <div class="detailsBody">
          <div class="table" id="instList-${fam.id}"></div>
          <details class="dropdown" data-synfam="${fam.id}" ${(S.ui.synergyOpen[fam.id] ? "open" : "")}>
            <summary>
              <span>Section Synergies (Notes)</span>
              <span class="tag">${instrumentLabelFamily(fam.id)}</span>
            </summary>
            <div class="detailsBody">
              <div class="table" id="synList-${fam.id}"></div>
            </div>
          </details>
        </div>
      `;

      stack.appendChild(d);

      const synDetails = d.querySelector(`details[data-synfam="${fam.id}"]`);
      synDetails.addEventListener("toggle", ()=>{
        S.ui.synergyOpen[fam.id] = synDetails.open;
        save(false);
      });

      renderInstrumentsForFamily(fam.id);
      renderSynergyForFamily(fam.id);
    }
  }

  function renderInstrumentsForFamily(familyId){
    const el = document.getElementById(`instList-${familyId}`);
    if (!el) return;
    el.innerHTML = "";

    const useSuffix = !!S.settings.abbrevLarge;
    const buildings = BUILDINGS.filter(b=>b.family===familyId);

    const total = totalNps();

    for (const b of buildings){
      const owned = S.owned[b.id] || 0;
      const k = buyCountForMode(b, S.buyMode);
      const cost = (k > 0) ? sumCostForK(b, k) : buildingCostAtOwned(b, owned);
      const afford = (k > 0) && !isBlocked();

      let perEachBase = b.nps * (S.buildingMult[b.id]||1);
      const gainPerBuy = perEachBase * globalNpsMultiplierForState(S);
      const instNps = effectiveInstrumentNps(b);
      const instPct = total > 0 ? (instNps / total) : 0;

      const label = instrumentBuyLabel(S.buyMode, k);
      const perEachHover = `Produces ${fmtExact(perEachBase, useSuffix)} Notes/sec each (before multipliers)`;

      const instOpen = (S.ui.instrumentUpOpen[b.id] !== undefined) ? S.ui.instrumentUpOpen[b.id] : false;

      const row = document.createElement("div");
      row.className = "mini instrumentRow";
      row.setAttribute("data-inst-row", b.id);
      row.style.setProperty("--inst-art", `url("assets/instrument-${b.id}.png")`);
      row.innerHTML = `
        <div class="name">
          <div class="top">
            <b title="${perEachHover}">${b.name}</b>
            <span class="tag good">Owned: <span class="mono">${owned}</span></span>
            <span class="tag">NPS: <span class="mono">${fmtExact(instNps, useSuffix)}</span> • <span class="mono">${fmtPct(instPct)}</span></span>
          </div>
          <div class="muted smallSans mono">+${fmtExact(gainPerBuy, useSuffix)} Notes/sec per instrument</div>
          <div class="muted smallSans mono" data-buy-ink="${b.id}">${k>0 ? `+${k} Ink` : "+1 Ink"}</div>

          <details class="dropdown instrumentUpgrades" data-inst="${b.id}" ${instOpen ? "open" : ""} style="margin-top:10px;">
            <summary>
              <span>Upgrades (Notes)</span>
              <span class="tag">${b.name}</span>
            </summary>
            <div class="detailsBody">
              <div class="table" id="instUp-${b.id}"></div>
            </div>
          </details>
        </div>

        <div class="right">
          <button class="primary" data-buy="${b.id}" ${afford ? "" : "disabled"}>${label}</button>
          <div class="cost mono" data-buy-cost="${b.id}">Cost: ${fmtExact(cost, useSuffix)} Notes</div>
        </div>
      `;

      el.appendChild(row);

      row.querySelector(`button[data-buy="${b.id}"]`).addEventListener("click", ()=>{
        const ok = buyBuilding(b.id, S.buyMode);
        if (ok) renderAll();
      });

      const det = row.querySelector(`details[data-inst="${b.id}"]`);
      det.addEventListener("toggle", ()=>{
        S.ui.instrumentUpOpen[b.id] = det.open;
        save(false);
      });

      renderInstrumentUpgrades(b.id);
    }
  }

  function renderInstrumentUpgrades(buildingId){
    const el = document.getElementById(`instUp-${buildingId}`);
    if (!el) return;
    el.innerHTML = "";

    const useSuffix = !!S.settings.abbrevLarge;
    const ordered = NOTE_UPGRADES
      .filter(u => u.buildingId === buildingId)
      .sort((a,b)=>a.requireOwned - b.requireOwned);
    const next = ordered.find(u => !S.noteUpgrades[u.id]) || null;
    const relevant = ordered.filter(u => S.noteUpgrades[u.id] || (next && u.id === next.id));

    if (relevant.length === 0){
      el.innerHTML = renderEmptyState("Full Upgraded!");
      return;
    }

    for (const u of relevant){
      const owned = !!S.noteUpgrades[u.id];
      const have = S.owned[u.buildingId] || 0;
      const unlocked = have >= u.requireOwned;
      const afford = S.notes >= u.costNotes;
      const enabled = (!owned && unlocked && afford && !isBlocked());
      const tag = upgradeTagState({
        owned,
        unlocked,
        afford,
        ownedText: "Purchased",
        unlockedText: "Available",
        lockedText: "Locked"
      });

      const div = document.createElement("div");
      if (owned){
        div.className = "mini purchased compactPurchased";
        div.innerHTML = `
          <div class="name">
            <div class="top">
              <b>${u.name} ✅</b>
            </div>
          </div>
        `;
      } else {
        div.className = "mini";
        div.innerHTML = `
          <div class="name">
            <div class="top">
              <b>${u.name}</b>
              <span class="tag ${tag.cls}">${tag.text}</span>
            </div>
            <div class="muted smallSans">${u.desc}</div>
          </div>
          <div class="right">
            <button data-nu="${u.id}" ${enabled ? "" : "disabled"}>Buy</button>
            <div class="cost mono">${fmtExact(u.costNotes, useSuffix)} Notes</div>
          </div>
        `;
      }
      el.appendChild(div);
    }

    el.querySelectorAll("button[data-nu]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        buyNoteUpgrade(btn.getAttribute("data-nu"));
        renderAll();
      });
    });
  }

  function renderSynergyForFamily(familyId){
    const el = document.getElementById(`synList-${familyId}`);
    if (!el) return;
    el.innerHTML = "";

    const useSuffix = !!S.settings.abbrevLarge;
    const list = SYNERGY_UPGRADES.filter(u => (u.families || []).includes(familyId));
    if (list.length === 0){
      el.innerHTML = renderEmptyState("No synergies for this family yet.");
      return;
    }

    for (const u of list){
      const owned = !!S.synergyUpgrades[u.id];
      const can = u.can(S);
      const afford = S.notes >= u.costNotes;
      const enabled = (!owned && can && afford && !isBlocked());
      const tag = upgradeTagState({
        owned,
        unlocked: can,
        afford,
        ownedText: "Purchased",
        unlockedText: "Available",
        lockedText: "Locked"
      });

      const div = document.createElement("div");
      div.className = "mini" + (owned ? " purchased" : "");
      div.innerHTML = `
        <div class="name">
          <div class="top">
            <b>${u.name}${owned ? " ✅" : ""}</b>
            <span class="tag ${tag.cls}">${tag.text}</span>
          </div>
          <div class="muted smallSans">${u.desc}</div>
        </div>
        <div class="right">
          <button data-syn="${u.id}" ${enabled ? "" : "disabled"}>Buy</button>
          <div class="cost mono">${fmtExact(u.costNotes, useSuffix)} Notes</div>
        </div>
      `;
      el.appendChild(div);
    }

    el.querySelectorAll("button[data-syn]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        buySynergyUpgrade(btn.getAttribute("data-syn"));
        renderAll();
      });
    });
  }

  function renderInkUpgrades(){
    const el = $("#inkUpgradeList");
    el.innerHTML = "";
    S.ui.inkTab = normalizeInkTab(S.ui.inkTab);
    syncInkTabButtons();
    const activeTab = S.ui.inkTab;
    const filtered = INK_UPGRADES.filter(u => inkUpgradeCategory(u) === activeTab);
    const unlockedInTab = filtered.reduce((n, u) => n + (S.inkUpgrades?.[u.id] ? 1 : 0), 0);

    const meta = document.createElement("div");
    meta.className = "muted smallSans";
    meta.style.margin = "0 2px 6px";
    meta.textContent = `${INK_TAB_LABELS[activeTab]} • ${unlockedInTab} / ${filtered.length} purchased`;
    el.appendChild(meta);

    for (const u of filtered){
      const owned = !!S.inkUpgrades[u.id];
      const afford = S.ink >= u.costInk;
      const enabled = (!owned && afford && !isBlocked());
      const tag = upgradeTagState({
        owned,
        unlocked: afford,
        afford,
        ownedText: "Purchased",
        unlockedText: "Available",
        lockedText: "Locked",
        lockedClass: ""
      });

      const div = document.createElement("div");
      div.className = "mini" + (owned ? " purchased" : "");
      div.innerHTML = `
        <div class="name">
          <div class="top">
            <b>${u.name}${owned ? " ✅" : ""}</b>
            <span class="tag ${tag.cls}">${tag.text}</span>
          </div>
          <div class="muted smallSans">${u.desc}</div>
        </div>
        <div class="right">
          <button data-iu="${u.id}" ${enabled ? "" : "disabled"}>Buy</button>
          <div class="cost mono">${u.costInk} Ink</div>
        </div>
      `;
      el.appendChild(div);
    }

    el.querySelectorAll("button[data-iu]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        buyInkUpgrade(btn.getAttribute("data-iu"));
        renderAll();
      });
    });
  }

  function renderFacility(){
    const current = getFacility(S.facility.currentId);
    $("#facilityName").textContent = current ? current.name : "—";
    $("#facilityDesc").textContent = current ? current.desc : "—";
    const preview = $("#facilityPreview");
    if (preview){
      const img = FACILITY_PREVIEW_IMAGE[S.facility.currentId] || FACILITY_PREVIEW_IMAGE.shed;
      preview.style.backgroundImage = `url("${img}")`;
      preview.setAttribute("aria-label", current ? `${current.name} venue preview` : "Current venue");
    }

    const fac = facilityMults(S);
    $("#facilityBonus").textContent = `Global: x${fac.nps.toFixed(2)} NPS • x${fac.click.toFixed(2)} Click`;

    $("#facilityPatrons").textContent = `Patrons (available): ${S.patrons}`;
    $("#facilityEarned").textContent = `Patrons (earned): ${S.patronsEver}`;

    $("#facilityUpgradesTag").textContent = current ? current.name : "—";
    const carry = facilityCarryBonusFromCurrent(S, S.facility.currentId);
    const masteryPct = Math.round(carry.ratio * 100);
    $("#facilityNextTag").textContent = `Venues • Mastery ${masteryPct}%`;

    const fud = $("#facilityUpgradesDetails");
    fud.open = !!S.ui.facilityUpOpen;
    if (!fud._bound){
      fud.addEventListener("toggle", ()=>{ S.ui.facilityUpOpen = fud.open; save(false); });
      fud._bound = true;
    }

    const fnd = $("#facilityNextDetails");
    fnd.open = !!S.ui.facilityNextOpen;
    if (!fnd._bound){
      fnd.addEventListener("toggle", ()=>{ S.ui.facilityNextOpen = fnd.open; save(false); });
      fnd._bound = true;
    }

    const upEl = $("#facilityUpgradesList");
    upEl.innerHTML = "";
    if (!current){
      upEl.innerHTML = renderEmptyState("No facility.");
    } else {
      for (const up of current.upgrades){
        const owned = !!S.facility.purchasedUpgrades[up.id];
        const afford = canAffordPatrons(up.cost);
        const enabled = (!owned && afford && !isBlocked());
        const tag = upgradeTagState({
          owned,
          unlocked: afford,
          afford,
          ownedText: "Purchased",
          unlockedText: "Available",
          lockedText: "Locked",
          lockedClass: ""
        });

        const div = document.createElement("div");
        div.className = "mini" + (owned ? " purchased" : "");
        div.innerHTML = `
          <div class="name">
          <div class="top">
              <b>${up.name}${owned ? " ✅" : ""}</b>
              <span class="tag ${tag.cls}">${tag.text}</span>
            </div>
          <div class="muted smallSans">${up.desc}</div>
        </div>
        <div class="right">
          <button data-fup="${up.id}" ${enabled ? "" : "disabled"}>Buy</button>
          <div class="cost mono">${up.cost} Patron(s)</div>
        </div>
      `;
        upEl.appendChild(div);
      }
      upEl.querySelectorAll("button[data-fup]").forEach(btn=>{
        btn.addEventListener("click", ()=> buyFacilityUpgrade(btn.getAttribute("data-fup")));
      });
    }

    const nextEl = $("#facilityNextList");
    nextEl.innerHTML = "";

    const currentIdx = FACILITIES.findIndex(f => f.id === S.facility.currentId);
    for (let i=0;i<FACILITIES.length;i++){
      const f = FACILITIES[i];
      if (S.facility.unlocked[f.id]) continue;
      if (currentIdx !== -1 && i < currentIdx) continue;

      const afford = canAffordPatrons(f.patronCostToUnlock);
      const enabled = afford && !isBlocked();
      const boosted = {
        nps: f.globalMult.nps * carry.nps,
        click: f.globalMult.click * carry.click
      };
      const div = document.createElement("div");
      div.className = "mini";
      div.innerHTML = `
        <div class="name">
          <div class="top">
            <b>${f.name}</b>
            <span class="tag ${afford ? "warn" : ""}">${afford ? "Available" : "Locked"}</span>
          </div>
          <div class="muted smallSans">${f.desc}</div>
          <div class="muted smallSans mono" style="margin-top:4px;">
            Base: x${f.globalMult.nps.toFixed(2)} NPS • x${f.globalMult.click.toFixed(2)} Click
          </div>
          <div class="muted smallSans mono" style="margin-top:4px;">
            With current mastery (${carry.owned}/${carry.total}): x${boosted.nps.toFixed(2)} NPS • x${boosted.click.toFixed(2)} Click
          </div>
        </div>
        <div class="right">
          <button data-fac="${f.id}" ${enabled ? "" : "disabled"}>Buy Venue</button>
          <div class="cost mono">${f.patronCostToUnlock} Patron(s)</div>
        </div>
      `;
      nextEl.appendChild(div);
    }

    if (nextEl.children.length === 0){
      nextEl.innerHTML = renderEmptyState("All venues unlocked (for now).");
    } else {
      nextEl.querySelectorAll("button[data-fac]").forEach(btn=>{
        btn.addEventListener("click", ()=> unlockFacility(btn.getAttribute("data-fac")));
      });
    }

    renderEndowmentPanel();
  }

  function renderStats(){
    const el = $("#statsList");
    el.innerHTML = "";
    const useSuffix = !!S.settings.abbrevLarge;

    const nps = totalNps();
    const npc = notesPerClick();

    const totalOwned = BUILDINGS.reduce((a,b)=>a+(S.owned[b.id]||0),0);
    const byFam = {};
    for (const fam of FAMILY_ORDER){
      byFam[fam.id] = BUILDINGS.filter(b=>b.family===fam.id).reduce((a,b)=>a+(S.owned[b.id]||0),0);
    }

    const p = prestigePreview();
    const fac = facilityMults(S);
    const currentFac = getFacility(S.facility.currentId);
    const st = currentStage();

    const rows = [
      { k:"Notes", v: fmtExact(S.notes, useSuffix) },
      { k:"Notes/sec", v: fmtExact(nps, useSuffix) },
      { k:"Notes/click", v: fmtExact(npc, useSuffix) },
      { k:"Run Notes", v: fmtExact(S.runNotes || 0, useSuffix) },
      { k:"Lifetime Notes", v: fmtExact(S.lifetimeNotes, useSuffix) },
      { k:"Ink (current)", v: fmtExact(S.ink, false) },
      { k:"Patrons (available)", v: fmtExact(S.patrons, false) },
      { k:"Patrons (earned)", v: fmtExact(S.patronsEver, false) },
      { k:"Take-a-bow preview", v: `Gain +${p.gain} (based on this run)` },
      { k:"Next Patron (run notes remaining)", v: fmtExact(runNotesUntilNextPatron(S), useSuffix) },
      { k:"Clicks (lifetime)", v: fmtExact(S.stats.clicks || 0, false) },
      { k:"Instruments owned (total)", v: fmtExact(totalOwned, false) },
      { k:"Owned: Woodwinds", v: fmtExact(byFam.Winds || 0, false) },
      { k:"Owned: Brass", v: fmtExact(byFam.Brass || 0, false) },
      { k:"Owned: Percussion", v: fmtExact(byFam.Perc || 0, false) },
      { k:"Owned: Strings", v: fmtExact(byFam.Strings || 0, false) },
      { k:"Owned: Other", v: fmtExact(byFam.Other || 0, false) },
      { k:"Facility", v: currentFac ? currentFac.name : "—" },
      { k:"Facility mults", v: `x${fac.nps.toFixed(2)} NPS • x${fac.click.toFixed(2)} Click` },
      { k:"Baton stage (visual)", v: `${st.label}` },
      { k:"Batons owned", v: `${fmtInt(S.batonOwned || 0)}` },
      { k:"Baton base click", v: `${batonBaseClick()}` },
      { k:"Baton click multiplier", v: `x${batonClickMult().toFixed(2)}` },
      { k:"Achievements", v: `${countPurchased(S.achievements)} / ${ACHIEVEMENTS.length}` },
      { k:"Achievement mults", v: `x${(S.achNpsMult || 1).toFixed(3)} NPS • x${(S.achClickMult || 1).toFixed(3)} Click` },
    ];

    for (const r of rows){
      const div = document.createElement("div");
      div.className = "mini";
      div.innerHTML = `
        <div class="name">
          <div class="top"><b>${r.k}</b></div>
          <div class="muted smallSans mono">${r.v}</div>
        </div>
        <div class="right">
          <span class="tag">Stats</span>
        </div>
      `;
      el.appendChild(div);
    }
  }

  function renderAchievements(){
    const el = $("#achievementsList");
    if (!el) return;
    el.innerHTML = "";

    const unlockedCount = ACHIEVEMENTS.reduce((n, a)=> n + (S.achievements?.[a.id] ? 1 : 0), 0);
    $("#achCountTag").textContent = `${unlockedCount} / ${ACHIEVEMENTS.length}`;
    $("#achBonusLine").textContent =
      `Bonuses: x${(S.achNpsMult || 1).toFixed(3)} Notes/sec • x${(S.achClickMult || 1).toFixed(3)} Click`;

    const categoryOrder = {
      "Core Milestones": 0,
      "Baton Progression": 1,
      "Ink & Archive": 2,
      "Synergies": 3,
      "Prestige & Venue": 4,
      "Section Sets": 5
    };
    const ordered = ACHIEVEMENTS.slice().sort((a, b) => {
      const ca = achievementCategory(a);
      const cb = achievementCategory(b);
      const oa = categoryOrder[ca] ?? 99;
      const ob = categoryOrder[cb] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name);
    });

    const catTotals = {};
    const catUnlocked = {};
    for (const a of ACHIEVEMENTS){
      const cat = achievementCategory(a);
      catTotals[cat] = (catTotals[cat] || 0) + 1;
      if (S.achievements?.[a.id]) catUnlocked[cat] = (catUnlocked[cat] || 0) + 1;
    }

    let currentCat = "";
    for (const a of ordered){
      const cat = achievementCategory(a);
      if (cat !== currentCat){
        currentCat = cat;
        const h = document.createElement("div");
        h.className = "achGroupLabel";
        h.innerHTML = `<span>${cat}</span><span class="tag">${catUnlocked[cat] || 0} / ${catTotals[cat] || 0}</span>`;
        el.appendChild(h);
      }

      const owned = !!S.achievements?.[a.id];
      const unlocked = !!a.unlocked(S);
      const status = upgradeTagState({
        owned,
        unlocked,
        afford: unlocked,
        ownedText: "Unlocked",
        unlockedText: "Available",
        lockedText: "Locked"
      });
      const div = document.createElement("div");
      div.className = "mini" + (owned ? " purchased" : "");
      div.innerHTML = `
        <div class="name">
          <div class="top">
            <b>${a.name}${owned ? " ✅" : ""}</b>
            <span class="tag ${status.cls}">${status.text}</span>
          </div>
          <div class="muted smallSans">${a.desc}</div>
          <div class="muted smallSans mono" style="margin-top:4px;">Bonus: ${achievementBonusText(a)}</div>
          ${owned ? "" : `<div class="muted smallSans mono" style="margin-top:2px;">Progress: ${a.progress(S)}</div>`}
        </div>
        <div class="right">
          <span class="tag">${a.kind === "click" ? "Click Bonus" : "NPS Bonus"}</span>
        </div>
      `;
      el.appendChild(div);
    }
  }

  function renderRecentUnlocks(){
    const el = $("#recentUnlocksList");
    if (!el) return;
    el.innerHTML = "";

    const list = S.recentUnlocks || [];
    if (list.length === 0){
      el.innerHTML = renderEmptyState("No unlocks yet.", "Achievements and upgrades will appear here.");
      return;
    }

    list.slice(0, 10).forEach(r=>{
      const div = document.createElement("div");
      div.className = "mini";
      div.innerHTML = `
        <div class="name">
          <div class="top">
            <b>${r.type}</b>
            <span class="tag good">Unlocked</span>
          </div>
          <div class="muted smallSans">${r.name}</div>
        </div>
        <div class="right">
          <div class="cost mono">${r.at || "—"}</div>
        </div>
      `;
      el.appendChild(div);
    });
  }

  function renderSettings(){
    $("#settingSuffix").checked = !!S.settings.abbrevLarge;
    const rm = $("#settingReduceMotion");
    const hc = $("#settingHighContrast");
    const dt = $("#settingDisableTooltips");
    if (rm) rm.checked = !!S.settings.reduceMotion;
    if (hc) hc.checked = !!S.settings.highContrast;
    if (dt) dt.checked = !!S.settings.disableTooltips;
    applyVisualSettings();
  }

  function renderAll(){
    setPrestigeTabVisibility();
    setLibraryTabVisibility();
    renderHUD();
    renderBatonShop();
    renderBatonUpgrades();
    renderFamilies();
    renderInkUpgrades();
    renderFacility();
    if (S.ui.tab === "stats") renderStats();
    if (S.ui.tab === "achievements"){
      renderAchievements();
      renderRecentUnlocks();
    }
    if (S.ui.tab === "library" && renderLibraryCore){
      renderLibraryCore(S, { fmtExact, useSuffix: !!S.settings.abbrevLarge });
    }
    renderSettings();
    refreshDynamicShopStates();
    maybeShowCoachTip();
    updateFloatingControls();
    // keep spotlight aligned if tutorial is open
    if (tutOverlay.classList.contains("show")) updateSpotlightFromSelector();
  }

  let lastHeavy = 0;
  function tick(){
    const t = now();

    if (isBlocked()){
      S.lastTick = t;
      if (S.ui.tab !== "start") renderHUD();
      return;
    }

    let dt = (t - S.lastTick) / 1000;
    S.lastTick = t;
    dt = Math.min(dt, 0.25);

    const gained = totalNps() * dt;
    if (gained > 0){
      S.notes += gained;
      S.lifetimeNotes += gained;
      S.runNotes += gained;
    }
    if (tickLibraryCore){
      tickLibraryCore(S, dt);
    }

    if (!S.settings.disableTooltips && !S.ui.prestigeExplained && (S.patronsEver || 0) === 0 && (S.runNotes || 0) >= runNotesForPatrons(1)){
      showPrestigeExplain();
      renderHUD();
      return;
    }

    if (t - S.lastSave > 30000){
      S.lastSave = t;
      localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    }

    renderHUD();

    if (t - lastHeavy > 350){
      lastHeavy = t;
      const newAchievements = checkAchievements(true);
      if (newAchievements > 0){
        renderHUD();
        if (S.ui.tab === "stats") renderStats();
      }
      if (S.ui.tab === "achievements"){
        renderAchievements();
        renderRecentUnlocks();
      }
      refreshDynamicShopStates();
      maybeShowCoachTip();
      updateFloatingControls();
      if (tutOverlay.classList.contains("show")) updateSpotlightFromSelector();
    }
  }

  // ---------- Wire Buttons (ONCE) ----------
  wireNoteButtonOnce();
  if (bindLibraryUICore){
    bindLibraryUICore({
      getState: () => S,
      save: () => save(false),
      renderAll,
      toast
    });
  }

  $("#prestigeBtn").addEventListener("click", ()=>{
    doPrestige();
  });
  $("#endowmentOfferBtn").addEventListener("click", ()=>{
    offerPatronsToEndowment();
  });

  $("#saveBtn").addEventListener("click", ()=> save(true));

  // ✅ Hard Reset: always land on START SCREEN
  $("#resetBtn").addEventListener("click", ()=>{
    const ok = confirm("Hard reset will erase your save completely (including Ink, Patrons, Facilities). Are you sure?");
    if (!ok) return;

    // remove current + prior save keys
    clearSaveState(localStorage, SAVE_KEY, LEGACY_SAVE_KEYS);

    S = stateDefault();
    if (ensureLibraryStateCore) ensureLibraryStateCore(S);
    if (stopLibraryPlaybackCore) stopLibraryPlaybackCore();
    if (libraryMysteryOverlay.classList.contains("show")) hideLibraryMystery();
    if (prestigeExplainOverlay.classList.contains("show")) hidePrestigeExplain();

    // replace the note button node to guarantee only one set of listeners
    const oldBtn = document.getElementById("noteBtn");
    if (oldBtn && oldBtn.parentNode){
      const fresh = oldBtn.cloneNode(true);
      oldBtn.parentNode.replaceChild(fresh, oldBtn);
    }

    lastManualClickAt = 0;
    wireNoteButtonOnce();

    stopStatsLive();
    toast("Reset complete.");

    // force START screen
    S.ui.tab = "start";
    setTab("start");
    save(false);
    renderAll();
  });

  document.querySelectorAll("button[data-buymode]").forEach(btn=>{
    btn.addEventListener("click", ()=> setBuyMode(btn.getAttribute("data-buymode")));
  });
  document.querySelectorAll("button[data-mbuymode]").forEach(btn=>{
    btn.addEventListener("click", ()=> setBuyMode(btn.getAttribute("data-mbuymode")));
  });
  document.querySelectorAll("button[data-dbuymode]").forEach(btn=>{
    btn.addEventListener("click", ()=> setBuyMode(btn.getAttribute("data-dbuymode")));
  });
  document.querySelectorAll("button[data-inktab]").forEach(btn=>{
    btn.addEventListener("click", ()=> setInkTab(btn.getAttribute("data-inktab")));
  });
  const mQuickNote = $("#mQuickNoteBtn");
  if (mQuickNote){
    mQuickNote.addEventListener("click", ()=>{
      clickNote();
      renderHUD();
      refreshDynamicShopStates();
    });
  }
  ["mBuyUpgrades", "dBuyUpgrades"].forEach((id) => {
    const btn = $("#"+id);
    if (!btn) return;
    btn.addEventListener("click", ()=> {
      buyAllAvailableUpgrades();
    });
  });

  $("#settingSuffix").addEventListener("change", (e)=>{
    S.settings.abbrevLarge = !!e.target.checked;
    save(false);
    renderAll();
  });
  $("#settingReduceMotion").addEventListener("change", (e)=>{
    S.settings.reduceMotion = !!e.target.checked;
    applyVisualSettings();
    save(false);
    renderAll();
  });
  $("#settingHighContrast").addEventListener("change", (e)=>{
    S.settings.highContrast = !!e.target.checked;
    applyVisualSettings();
    save(false);
    renderAll();
  });
  $("#settingDisableTooltips").addEventListener("change", (e)=>{
    S.settings.disableTooltips = !!e.target.checked;
    if (S.settings.disableTooltips){
      S.ui.tooltipsDone = true;
      hideCoachTip();
      if (prestigeExplainOverlay.classList.contains("show")){
        hidePrestigeExplain();
      }
    } else if (S.ui.hasStarted && S.ui.tutorialCompleted && (S.ui.tooltipStep || 0) < COACH_STEPS.length){
      S.ui.tooltipsDone = false;
      S.ui.tooltipAckStep = -1;
    }
    save(false);
    renderAll();
  });
  window.addEventListener("scroll", updateFloatingControls, { passive:true });
  window.addEventListener("resize", updateFloatingControls, { passive:true });

  // ---------- Boot ----------
  applyOffline();
  setBuyMode(S.buyMode);
  setPrestigeTabVisibility();
  setLibraryTabVisibility();

  // If not started, ALWAYS show start screen (real screen)
  if (!S.ui.hasStarted){
    setTab("start");
  } else {
    // otherwise restore last tab (but never "start")
    const last = (S.ui.tab && S.ui.tab !== "start") ? S.ui.tab : "main";
    setTab(last);
  }

  renderAll();
  setInterval(tick, 100);

  // Small toast only if already started
  if (S.ui.hasStarted && S.lifetimeNotes === 0 && S.notes === 0){
    toast("Click the note to start conducting!");
  }
})();
