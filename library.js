(() => {
const LIB_CFG = (window.ScoreData && window.ScoreData.MUSIC_LIBRARY_CONFIG) || {
  defaultBpm: 120,
  defaultPracticePerSecond: 1,
  unlockBaseCost: 10,
  unlockCostGrowth: 1.08,
  defaultVelocity: 0.6,
};
const MANIFEST_PATH = "assets/music/manifest.json";
const MUSIC_BASE_PATH = "assets/music/";

let audioCtx = null;
let activeNodes = [];
let playbackTimer = null;
let isPlaying = false;
let uiBound = false;
let catalogPromise = null;

function ensureLibraryState(state){
  if (!state.library || typeof state.library !== "object"){
    state.library = {
      works: {},
      order: [],
      activeWorkId: null,
      view: "list",
      unlocked: false,
      endowmentStage: 0,
      endowments: 0
    };
  }
  if (!state.library.works || typeof state.library.works !== "object") state.library.works = {};
  if (!Array.isArray(state.library.order)) state.library.order = Object.keys(state.library.works);
  state.library.order = state.library.order.filter((id) => !!state.library.works[id]);

  for (const id of Object.keys(state.library.works)){
    const work = state.library.works[id];
    if (!work || typeof work !== "object"){
      delete state.library.works[id];
      continue;
    }
    if (!work.id) work.id = id;
    if (!work.title) work.title = "Untitled Work";
    if (!work.composer) work.composer = "";
    if (work.createdAt === undefined) work.createdAt = Date.now();
    if (typeof work.xmlText !== "string") work.xmlText = "";
    if (!Array.isArray(work.events)) work.events = [];
    if (work.unlockedCount === undefined) work.unlockedCount = 0;
    work.unlockedCount = Math.max(0, Math.min(Math.floor(work.unlockedCount || 0), work.events.length));
    if (work.practice === undefined) work.practice = 0;
    if (work.practicePerSecond === undefined) work.practicePerSecond = LIB_CFG.defaultPracticePerSecond;
    if (work.bpm === undefined) work.bpm = LIB_CFG.defaultBpm;
    work.practice = Math.max(0, Number(work.practice) || 0);
    work.practicePerSecond = Math.max(0, Number(work.practicePerSecond) || 0);
    work.bpm = Math.max(20, Number(work.bpm) || LIB_CFG.defaultBpm);
    if (work.completed === undefined) work.completed = (work.events.length > 0 && work.unlockedCount >= work.events.length);
  }

  for (const id of Object.keys(state.library.works)){
    if (!state.library.order.includes(id)) state.library.order.push(id);
  }

  if (!state.library.activeWorkId || !state.library.works[state.library.activeWorkId]){
    state.library.activeWorkId = state.library.order[0] || null;
  }
  if (state.library.view !== "work" && state.library.view !== "list") state.library.view = "list";
  if (state.library.unlocked === undefined) state.library.unlocked = (state.library.order.length > 0);
  state.library.unlocked = !!state.library.unlocked;
  if (state.library.endowmentStage === undefined) state.library.endowmentStage = 0;
  state.library.endowmentStage = Math.max(0, Math.floor(Number(state.library.endowmentStage) || 0));
  if (state.library.endowments === undefined) state.library.endowments = 0;
  state.library.endowments = Math.max(0, Math.floor(Number(state.library.endowments) || 0));
}

function workList(state){
  ensureLibraryState(state);
  return state.library.order
    .map((id) => state.library.works[id])
    .filter(Boolean);
}

function activeWork(state){
  ensureLibraryState(state);
  const id = state.library.activeWorkId;
  return id ? state.library.works[id] || null : null;
}

function toNum(v, fallback = 0){
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function childText(el, tag){
  const n = el ? el.querySelector(tag) : null;
  return (n && n.textContent ? n.textContent : "").trim();
}

function stepToSemitone(step){
  const map = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  return map[step] !== undefined ? map[step] : 0;
}

function midiFromPitch(step, alter, octave){
  return ((octave + 1) * 12) + stepToSemitone(step) + alter;
}

function parseMusicXML(xmlText){
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")){
    throw new Error("Invalid MusicXML file.");
  }

  const title = childText(doc, "work > work-title") || childText(doc, "movement-title") || "Untitled Work";
  const composerNode = doc.querySelector('creator[type="composer"]') || doc.querySelector("identification creator");
  const composer = composerNode ? (composerNode.textContent || "").trim() : "";

  const part = doc.querySelector("score-partwise > part") || doc.querySelector("part");
  if (!part){
    throw new Error("No <part> found in MusicXML.");
  }

  let divisions = 1;
  let cursorBeats = 0;
  const events = [];

  const measures = Array.from(part.getElementsByTagName("measure"));
  for (const measure of measures){
    const measureNum = parseInt(measure.getAttribute("number") || `${events.length + 1}`, 10) || (events.length + 1);
    const measureStart = cursorBeats;

    const children = Array.from(measure.children || []);
    for (const node of children){
      const tag = (node.tagName || "").toLowerCase();
      if (tag === "attributes"){
        const d = parseInt(childText(node, "divisions") || "0", 10);
        if (d > 0) divisions = d;
        continue;
      }
      if (tag !== "note") continue;

      const isChord = !!node.querySelector("chord");
      const isRest = !!node.querySelector("rest");
      const durationDiv = Math.max(1, toNum(childText(node, "duration"), divisions));
      const durationBeats = durationDiv / Math.max(1, divisions);
      const velocity = LIB_CFG.defaultVelocity;

      let pitches = [];
      if (!isRest){
        const step = (childText(node, "pitch > step") || "C").toUpperCase();
        const alter = parseInt(childText(node, "pitch > alter") || "0", 10) || 0;
        const octave = parseInt(childText(node, "pitch > octave") || "4", 10) || 4;
        pitches = [midiFromPitch(step, alter, octave)];
      }

      if (isChord && events.length > 0){
        const prev = events[events.length - 1];
        if (prev.type !== "rest"){
          if (pitches.length > 0) prev.pitches.push(...pitches);
          prev.type = prev.pitches.length > 1 ? "chord" : "note";
          prev.durationBeats = Math.max(prev.durationBeats, durationBeats);
          continue;
        }
      }

      const startTimeBeats = cursorBeats;
      const beat = (startTimeBeats - measureStart) + 1;

      events.push({
        idx: events.length,
        type: isRest ? "rest" : "note",
        measureNumber: measureNum,
        beat,
        startTimeBeats,
        durationBeats,
        pitches: isRest ? [] : pitches,
        velocity,
      });

      cursorBeats += durationBeats;
    }
  }

  return { title, composer, events };
}

function newWorkId(state){
  const used = new Set(state.library.order);
  let tries = 0;
  while (tries < 2000){
    const id = `work_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    if (!used.has(id)) return id;
    tries++;
  }
  return `work_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function upsertMusicXML(state, xmlText, overrides = {}){
  ensureLibraryState(state);
  const parsed = parseMusicXML(xmlText);
  if (!parsed.events.length){
    throw new Error("This MusicXML has no note events in the first part.");
  }

  const preferredId = (overrides.id || "").trim();
  const id = preferredId || newWorkId(state);
  const existing = state.library.works[id] || null;
  const work = {
    id,
    title: overrides.title || parsed.title,
    composer: overrides.composer || parsed.composer,
    createdAt: existing?.createdAt || Date.now(),
    xmlText,
    events: parsed.events,
    unlockedCount: Math.max(0, Math.min(existing?.unlockedCount || 0, parsed.events.length)),
    practice: Math.max(0, Number(existing?.practice) || 0),
    practicePerSecond: Math.max(0, Number(overrides.practicePerSecond ?? existing?.practicePerSecond ?? LIB_CFG.defaultPracticePerSecond) || 0),
    bpm: Math.max(20, Number(overrides.bpm ?? existing?.bpm ?? LIB_CFG.defaultBpm) || LIB_CFG.defaultBpm),
    completed: false,
  };
  work.completed = (work.events.length > 0 && work.unlockedCount >= work.events.length);

  state.library.works[id] = work;
  if (!state.library.order.includes(id)) state.library.order.push(id);
  state.library.activeWorkId = id;
  state.library.view = "work";
  return work;
}

function importMusicXML(state, xmlText){
  return upsertMusicXML(state, xmlText);
}

function addDemoWork(state){
  throw new Error("Demo import is disabled. Use assets/music/manifest.json.");
}

function setLibraryView(state, view){
  ensureLibraryState(state);
  state.library.view = (view === "work") ? "work" : "list";
}

function openWork(state, workId){
  ensureLibraryState(state);
  if (!state.library.works[workId]) return false;
  state.library.activeWorkId = workId;
  state.library.view = "work";
  return true;
}

function unlockCost(work){
  return Math.floor(LIB_CFG.unlockBaseCost * Math.pow(LIB_CFG.unlockCostGrowth, work.unlockedCount || 0));
}

function unlockNext(state, workId){
  ensureLibraryState(state);
  const work = state.library.works[workId];
  if (!work) return { ok:false, reason:"missing" };
  if (!work.events || work.events.length === 0) return { ok:false, reason:"empty" };
  if ((work.unlockedCount || 0) >= work.events.length){
    work.completed = true;
    return { ok:false, reason:"complete" };
  }

  const cost = unlockCost(work);
  if ((work.practice || 0) < cost){
    return { ok:false, reason:"insufficient", cost };
  }

  work.practice -= cost;
  work.unlockedCount = Math.min(work.events.length, (work.unlockedCount || 0) + 1);
  work.completed = work.unlockedCount >= work.events.length;
  return { ok:true, cost, completed: work.completed };
}

async function loadManifest(state, options = {}){
  ensureLibraryState(state);
  const force = !!options.force;
  if (catalogPromise && !force) return catalogPromise;

  const task = (async () => {
    const stamp = force ? `?t=${Date.now()}` : "";
    const resp = await fetch(`${MANIFEST_PATH}${stamp}`, { cache: "no-store" });
    if (!resp.ok){
      throw new Error(`Unable to load music manifest (${resp.status}).`);
    }

    const manifest = await resp.json();
    const items = Array.isArray(manifest) ? manifest : [];
    let added = 0;
    let updated = 0;

    for (const entry of items){
      if (!entry || typeof entry !== "object") continue;
      const file = typeof entry.file === "string" ? entry.file.trim() : "";
      if (!file) continue;
      const id = typeof entry.id === "string" && entry.id.trim()
        ? entry.id.trim()
        : file.replace(/\.[^.]+$/, "");

      const xmlResp = await fetch(`${MUSIC_BASE_PATH}${file}${stamp}`, { cache: "no-store" });
      if (!xmlResp.ok){
        throw new Error(`Unable to load ${file} (${xmlResp.status}).`);
      }
      const xmlText = await xmlResp.text();
      const exists = !!state.library.works[id];
      upsertMusicXML(state, xmlText, {
        id,
        title: entry.title || "",
        composer: entry.composer || "",
        bpm: entry.bpm,
        practicePerSecond: entry.practicePerSecond
      });
      if (exists) updated++;
      else added++;
    }

    if (!state.library.activeWorkId && state.library.order.length){
      state.library.activeWorkId = state.library.order[0];
    }

    return { ok:true, count: items.length, added, updated };
  })();

  catalogPromise = task;
  try{
    return await task;
  }finally{
    if (catalogPromise === task) catalogPromise = null;
  }
}

function tickLibrary(state, dt){
  ensureLibraryState(state);
  if (!(dt > 0)) return;
  for (const id of state.library.order){
    const work = state.library.works[id];
    if (!work) continue;
    const pps = Math.max(0, Number(work.practicePerSecond) || 0);
    if (pps <= 0) continue;
    work.practice = Math.max(0, (work.practice || 0) + (pps * dt));
  }
}

function midiToName(midi){
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const m = Math.round(Number(midi) || 0);
  const name = names[((m % 12) + 12) % 12];
  const octave = Math.floor(m / 12) - 1;
  return `${name}${octave}`;
}

function esc(str){
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtNumber(n, helpers){
  if (helpers && typeof helpers.fmtExact === "function") return helpers.fmtExact(n, !!helpers.useSuffix);
  const v = Number(n) || 0;
  return (Math.round(v * 100) / 100).toLocaleString();
}

function progressPct(work){
  const total = (work && work.events ? work.events.length : 0) || 0;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, ((work.unlockedCount || 0) / total) * 100));
}

function eventSymbol(ev){
  if (ev.type === "rest") return "R";
  if ((ev.pitches || []).length > 1) return "♫";
  return "♪";
}

function eventTooltip(ev){
  const beat = Number(ev.beat || 1);
  const beatText = Number.isFinite(beat) ? beat.toFixed(2).replace(/\.00$/, "") : "1";
  const pitchText = ev.type === "rest"
    ? "Rest"
    : (ev.pitches || []).map(midiToName).join(", ");
  return `Measure ${ev.measureNumber} • Beat ${beatText} • ${pitchText}`;
}

function renderList(state, helpers = {}){
  ensureLibraryState(state);
  const listView = document.getElementById("libraryListView");
  const workView = document.getElementById("libraryWorkView");
  if (listView) listView.hidden = false;
  if (workView) workView.hidden = true;

  const meta = document.getElementById("libraryListMeta");
  const listEl = document.getElementById("libraryWorksList");
  if (!listEl) return;

  const works = workList(state);
  if (meta) meta.textContent = `${works.length} work(s) in library • Source: ${MANIFEST_PATH}`;

  if (works.length === 0){
    listEl.innerHTML = `<div class="emptyState">No works found. Add MusicXML entries to ${MANIFEST_PATH}.</div>`;
    return;
  }

  listEl.innerHTML = works.map((work) => {
    const total = work.events.length || 0;
    const pct = progressPct(work);
    return `
      <div class="libraryListRow">
        <div>
          <div class="libraryListName">${esc(work.title)}</div>
          <div class="libraryListMeta">${esc(work.composer || "Unknown composer")}</div>
          <div class="libraryListProgress">
            <span class="mono">${work.unlockedCount || 0} / ${total}</span>
            <span class="bar"><i style="width:${pct.toFixed(2)}%"></i></span>
          </div>
        </div>
        <div class="right">
          <button data-lib-open-work="${esc(work.id)}">Open</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderWork(state, helpers = {}){
  ensureLibraryState(state);
  const listView = document.getElementById("libraryListView");
  const workView = document.getElementById("libraryWorkView");
  if (listView) listView.hidden = true;
  if (workView) workView.hidden = false;

  const work = activeWork(state);
  const scoreMapEl = document.getElementById("libraryScoreMap");
  const titleEl = document.getElementById("libraryWorkTitle");
  const compEl = document.getElementById("libraryWorkComposer");
  const progTxtEl = document.getElementById("libraryWorkProgressText");
  const progFillEl = document.getElementById("libraryWorkProgressFill");
  const doneTag = document.getElementById("libraryWorkCompletedTag");
  const practiceEl = document.getElementById("libraryWorkPractice");
  const ppsEl = document.getElementById("libraryWorkPps");
  const bpmEl = document.getElementById("libraryWorkBpm");
  const unlockBtn = document.getElementById("libraryUnlockNextBtn");
  const playBtn = document.getElementById("libraryPlayBtn");

  if (!work){
    if (titleEl) titleEl.textContent = "No work selected";
    if (compEl) compEl.textContent = "";
    if (progTxtEl) progTxtEl.textContent = "0 / 0";
    if (progFillEl) progFillEl.style.width = "0%";
    if (practiceEl) practiceEl.textContent = "0";
    if (ppsEl) ppsEl.textContent = "0";
    if (bpmEl) bpmEl.textContent = "120";
    if (scoreMapEl) scoreMapEl.innerHTML = `<div class="emptyState">Choose a work from the Library List.</div>`;
    if (unlockBtn) unlockBtn.disabled = true;
    if (playBtn) playBtn.disabled = true;
    if (doneTag) doneTag.hidden = true;
    return;
  }

  const total = work.events.length || 0;
  const unlocked = Math.min(total, work.unlockedCount || 0);
  const pct = progressPct(work);
  const done = total > 0 && unlocked >= total;

  if (titleEl) titleEl.textContent = work.title || "Untitled Work";
  if (compEl) compEl.textContent = work.composer || "Unknown composer";
  if (progTxtEl) progTxtEl.textContent = `${unlocked} / ${total}`;
  if (progFillEl) progFillEl.style.width = `${pct.toFixed(2)}%`;
  if (doneTag) doneTag.hidden = !done;
  if (practiceEl) practiceEl.textContent = fmtNumber(work.practice || 0, helpers);
  if (ppsEl) ppsEl.textContent = fmtNumber(work.practicePerSecond || 0, helpers);
  if (bpmEl) bpmEl.textContent = `${Math.round(work.bpm || LIB_CFG.defaultBpm)}`;

  const cost = unlockCost(work);
  const canUnlock = !done && (work.practice || 0) >= cost;
  if (unlockBtn){
    unlockBtn.disabled = done || !canUnlock;
    unlockBtn.textContent = done ? "Completed" : `Unlock Next (${fmtNumber(cost, helpers)} Practice)`;
  }

  if (playBtn){
    playBtn.disabled = unlocked <= 0;
  }

  if (!scoreMapEl) return;
  if (total <= 0){
    scoreMapEl.innerHTML = `<div class="emptyState">No parsable events were found in this work.</div>`;
    return;
  }

  const byMeasure = new Map();
  for (const ev of work.events){
    const key = ev.measureNumber || 0;
    if (!byMeasure.has(key)) byMeasure.set(key, []);
    byMeasure.get(key).push(ev);
  }

  const measures = Array.from(byMeasure.keys()).sort((a, b) => a - b);
  scoreMapEl.innerHTML = measures.map((m) => {
    const events = byMeasure.get(m) || [];
    const cells = events.map((ev) => {
      const unlockedCls = ev.idx < unlocked ? " unlocked" : "";
      const typeCls = ev.type === "rest" ? " rest" : ((ev.pitches || []).length > 1 ? " chord" : "");
      return `<span class="libraryEventBox${unlockedCls}${typeCls}" title="${esc(eventTooltip(ev))}">${eventSymbol(ev)}</span>`;
    }).join("");
    return `
      <div class="libraryMeasureRow">
        <div class="libraryMeasureLabel">M${m}</div>
        <div class="libraryMeasureEvents">${cells}</div>
      </div>
    `;
  }).join("");
}

function renderLibrary(state, helpers = {}){
  ensureLibraryState(state);
  if (state.library.view === "work") renderWork(state, helpers);
  else renderList(state, helpers);
}

function ensureAudio(){
  if (!audioCtx){
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) throw new Error("WebAudio is not supported in this browser.");
    audioCtx = new Ctor();
  }
  return audioCtx;
}

function stopPlayback(){
  if (playbackTimer){
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  for (const n of activeNodes){
    try {
      if (typeof n.stop === "function") n.stop();
    } catch (_) {}
    try {
      if (typeof n.disconnect === "function") n.disconnect();
    } catch (_) {}
  }
  activeNodes = [];
  isPlaying = false;
}

function scheduleTone(ctx, freq, start, duration, velocity){
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, start);

  const attack = 0.005;
  const release = 0.03;
  const peak = Math.max(0.03, Math.min(0.35, velocity * 0.22));
  const end = start + Math.max(0.04, duration);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, Math.max(start + attack + 0.001, end - release));

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(end + 0.02);

  activeNodes.push(osc, gain);
  return end + 0.03;
}

function playUnlocked(state, workId){
  ensureLibraryState(state);
  const work = state.library.works[workId];
  if (!work) return { ok:false, reason:"missing" };

  const unlocked = Math.min(work.unlockedCount || 0, work.events.length || 0);
  if (unlocked <= 0) return { ok:false, reason:"none_unlocked" };

  stopPlayback();
  const ctx = ensureAudio();
  if (ctx.state === "suspended") ctx.resume();

  const bpm = Math.max(20, Number(work.bpm) || LIB_CFG.defaultBpm);
  const beatSec = 60 / bpm;
  const nowSec = ctx.currentTime + 0.05;
  let lastEnd = nowSec;

  for (let i = 0; i < unlocked; i++){
    const ev = work.events[i];
    if (!ev || ev.type === "rest" || !Array.isArray(ev.pitches) || ev.pitches.length === 0) continue;

    const start = nowSec + (toNum(ev.startTimeBeats, 0) * beatSec);
    const duration = Math.max(0.04, toNum(ev.durationBeats, 0.25) * beatSec);
    const velocity = Math.max(0.05, Math.min(1, toNum(ev.velocity, LIB_CFG.defaultVelocity)));

    for (const midi of ev.pitches){
      const freq = 440 * Math.pow(2, ((Number(midi) - 69) / 12));
      lastEnd = Math.max(lastEnd, scheduleTone(ctx, freq, start, duration, velocity));
    }
  }

  isPlaying = true;
  playbackTimer = setTimeout(() => {
    stopPlayback();
  }, Math.max(30, (lastEnd - ctx.currentTime) * 1000 + 20));

  return { ok:true };
}

function bindUI({ getState, save, renderAll, toast }){
  if (uiBound) return;
  uiBound = true;

  const safeToast = (msg) => {
    if (typeof toast === "function") toast(msg);
  };

  const syncCatalog = async (force = false, announce = false) => {
    try {
      const state = getState();
      const res = await loadManifest(state, { force });
      save();
      renderAll();
      if (announce) safeToast(`Catalog synced: ${res.count} work(s) (${res.added} added, ${res.updated} updated).`);
    } catch (err){
      const meta = document.getElementById("libraryListMeta");
      if (meta){
        meta.textContent = "No catalog loaded yet. Add assets/music/manifest.json and reload.";
      }
      if (announce) safeToast(err && err.message ? err.message : "Failed to load music catalog.");
    }
  };

  syncCatalog(false, false);

  const reloadBtn = document.getElementById("libraryReloadBtn");
  if (reloadBtn){
    reloadBtn.addEventListener("click", () => {
      syncCatalog(true, true);
    });
  }

  const backBtn = document.getElementById("libraryBackBtn");
  if (backBtn){
    backBtn.addEventListener("click", () => {
      const state = getState();
      setLibraryView(state, "list");
      stopPlayback();
      save();
      renderAll();
    });
  }

  const unlockBtn = document.getElementById("libraryUnlockNextBtn");
  if (unlockBtn){
    unlockBtn.addEventListener("click", () => {
      const state = getState();
      const work = activeWork(state);
      if (!work) return;
      const res = unlockNext(state, work.id);
      if (!res.ok){
        if (res.reason === "insufficient") safeToast("Not enough Practice.");
        return;
      }
      if (res.completed) safeToast("Work completed!");
      save();
      renderAll();
    });
  }

  const playBtn = document.getElementById("libraryPlayBtn");
  if (playBtn){
    playBtn.addEventListener("click", () => {
      const state = getState();
      const work = activeWork(state);
      if (!work) return;
      const res = playUnlocked(state, work.id);
      if (!res.ok) safeToast("Unlock events before playback.");
    });
  }

  const stopBtn = document.getElementById("libraryStopBtn");
  if (stopBtn){
    stopBtn.addEventListener("click", () => {
      stopPlayback();
    });
  }

  const listEl = document.getElementById("libraryWorksList");
  if (listEl){
    listEl.addEventListener("click", (e) => {
      const target = e.target && e.target.closest ? e.target.closest("[data-lib-open-work]") : null;
      if (!target) return;
      const id = target.getAttribute("data-lib-open-work");
      if (!id) return;

      const state = getState();
      if (!openWork(state, id)) return;
      save();
      renderAll();
    });
  }
}

window.ScoreLibrary = {
  ensureLibraryState,
  loadManifest,
  parseMusicXML,
  importMusicXML,
  addDemoWork,
  workList,
  activeWork,
  setLibraryView,
  openWork,
  unlockCost,
  unlockNext,
  tickLibrary,
  renderList,
  renderWork,
  renderLibrary,
  playUnlocked,
  stopPlayback,
  bindUI,
  midiToName,
  isPlaying: () => isPlaying,
};
})();
