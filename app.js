const STORAGE_KEY = "personal_lsw_tracker_v2";
const OLD_STORAGE_KEY = "personal_lsw_tracker_v1";

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function todayKey() { return localDateKey(); }
function monthKey(dateStr) { return dateStr.slice(0, 7); }
function readableMonth(key = monthKey(todayKey())) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function makeId() { return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()); }

const defaultState = {
  settings: { appName: "LSW Tracker", accent: "#2563eb", dark: false },
  habits: [
    { id: makeId(), name: "Sleep 7+ hours", active: true },
    { id: makeId(), name: "Workout / movement", active: true },
    { id: makeId(), name: "Nutrition on plan", active: true },
    { id: makeId(), name: "Learning / school", active: true },
    { id: makeId(), name: "Budget / money check", active: true },
    { id: makeId(), name: "Clean space", active: true },
    { id: makeId(), name: "Reflection completed", active: true }
  ],
  entries: {},
  monthlyGoals: {},
  goals: [
    { id: makeId(), name: "Build a stronger routine", target: 100, current: 0 },
    { id: makeId(), name: "Long-term financial progress", target: 1000, current: 0 }
  ]
};

let state = loadState();
let currentScreen = "today";
let saveTimer = null;

function loadState() {
  try {
    const savedV2 = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (savedV2 && savedV2.settings && savedV2.habits && savedV2.entries) return normalizeState(savedV2);
  } catch {}
  try {
    const savedV1 = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY));
    if (savedV1 && savedV1.settings && savedV1.habits && savedV1.entries) {
      const migrated = normalizeState(savedV1);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {}
  return structuredClone(defaultState);
}

function normalizeState(input) {
  const s = { ...structuredClone(defaultState), ...input };
  s.settings = { ...defaultState.settings, ...(input.settings || {}) };
  s.habits = (input.habits || defaultState.habits).map(h => ({ id: h.id || makeId(), name: h.name || "New habit", active: h.active !== false }));
  s.entries = input.entries || {};
  s.monthlyGoals = input.monthlyGoals || {};
  s.goals = (input.goals || defaultState.goals).map(g => ({ id: g.id || makeId(), name: g.name || "Goal", target: Number(g.target || 1), current: Number(g.current || 0) }));
  return s;
}

function saveState(immediate = false) {
  const write = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (immediate) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    write();
    return;
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { write(); saveTimer = null; }, 180);
}
function flushSave() { saveState(true); }
function getEntry(date = todayKey()) {
  if (!state.entries[date]) state.entries[date] = { habits: {}, win: "", improve: "", notes: "" };
  return state.entries[date];
}
function getMonthlyGoals(month = monthKey(todayKey())) {
  if (!state.monthlyGoals) state.monthlyGoals = {};
  if (!state.monthlyGoals[month]) state.monthlyGoals[month] = [];
  return state.monthlyGoals[month];
}
function activeHabits() { return state.habits.filter(h => h.active); }
function scoreForEntry(entry) {
  const habits = activeHabits();
  const total = habits.length;
  const complete = habits.filter(h => entry.habits?.[h.id]).length;
  return total ? Math.round((complete / total) * 100) : 0;
}
function completionText(entry) {
  const habits = activeHabits();
  const complete = habits.filter(h => entry.habits?.[h.id]).length;
  return `${complete}/${habits.length} habits complete`;
}
function applySettings() {
  document.documentElement.style.setProperty("--accent", state.settings.accent || "#2563eb");
  document.body.classList.toggle("dark", !!state.settings.dark);
  document.getElementById("appTitle").textContent = state.settings.appName || "LSW Tracker";
  document.title = state.settings.appName || "LSW Tracker";
}
function render() {
  applySettings();
  renderCurrentScreen();
}
function renderCurrentScreen() {
  if (currentScreen === "today") renderToday();
  else if (currentScreen === "trends") renderTrends();
  else if (currentScreen === "goals") renderGoals();
  else if (currentScreen === "history") renderHistory();
  else if (currentScreen === "settings") renderSettings();
}
function updateTodaySummary(entry = getEntry()) {
  const score = scoreForEntry(entry);
  document.getElementById("todayScore").textContent = `${score}%`;
  const ring = document.querySelector(".score-ring");
  if (ring) ring.style.setProperty("--score-deg", `${score * 3.6}deg`);
}
function renderToday() {
  const date = todayKey();
  const entry = getEntry(date);
  document.getElementById("todayDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  updateTodaySummary(entry);
  const list = document.getElementById("habitList");
  list.innerHTML = "";
  activeHabits().forEach(habit => {
    const row = document.createElement("label");
    row.className = "habit-item";
    row.innerHTML = `
      <input type="checkbox" ${entry.habits[habit.id] ? "checked" : ""} data-habit="${habit.id}">
      <div class="habit-main"><div class="habit-name"></div><div class="habit-meta">Daily habit</div></div>`;
    row.querySelector(".habit-name").textContent = habit.name;
    row.querySelector("input").addEventListener("change", e => {
      entry.habits[habit.id] = e.target.checked;
      saveState();
      updateTodaySummary(entry);
    });
    list.appendChild(row);
  });
  ["win", "improve", "notes"].forEach(name => {
    const el = document.getElementById(`${name}Input`);
    el.value = entry[name] || "";
    el.oninput = () => { entry[name] = el.value; saveState(); };
  });
}
function monthlyData(habitId = "overall") {
  const months = [...new Set(Object.keys(state.entries).sort().map(monthKey))];
  const nowMonth = monthKey(todayKey());
  if (!months.includes(nowMonth)) months.push(nowMonth);
  return months.slice(-12).map(month => {
    const dates = Object.keys(state.entries).filter(d => monthKey(d) === month);
    if (dates.length === 0) return { month, score: 0, days: 0 };
    let score;
    if (habitId === "overall") {
      score = Math.round(dates.reduce((sum, d) => sum + scoreForEntry(state.entries[d]), 0) / dates.length);
    } else {
      const done = dates.filter(d => state.entries[d].habits?.[habitId]).length;
      score = Math.round((done / dates.length) * 100);
    }
    return { month, score, days: dates.length };
  });
}
function renderTrends() {
  const select = document.getElementById("trendSelect");
  const selected = select.value || "overall";
  select.innerHTML = `<option value="overall">Overall completion</option>` + activeHabits().map(h => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join("");
  select.value = selected;
  select.onchange = renderTrends;
  const data = monthlyData(select.value || "overall");
  drawChart(data);
  const latest = data[data.length - 1]?.score ?? 0;
  const previous = data[data.length - 2]?.score ?? 0;
  const change = latest - previous;
  document.getElementById("trendSummary").innerHTML = `
    <div class="stat"><span class="muted">Latest month</span><strong>${latest}%</strong></div>
    <div class="stat"><span class="muted">Change vs last month</span><strong>${change >= 0 ? "+" : ""}${change}%</strong></div>
    <div class="stat"><span class="muted">Tracked days</span><strong>${data.reduce((s, m) => s + m.days, 0)}</strong></div>`;
  const breakdown = document.getElementById("monthBreakdown");
  const currentMonth = monthKey(todayKey());
  const dates = Object.keys(state.entries).filter(d => monthKey(d) === currentMonth);
  breakdown.innerHTML = "";
  activeHabits().forEach(h => {
    const pct = dates.length ? Math.round(dates.filter(d => state.entries[d].habits?.[h.id]).length / dates.length * 100) : 0;
    const div = document.createElement("div");
    div.className = "breakdown-item";
    div.innerHTML = `<strong></strong><p class="muted">${pct}% complete this month across ${dates.length} tracked day${dates.length === 1 ? "" : "s"}</p>`;
    div.querySelector("strong").textContent = h.name;
    breakdown.appendChild(div);
  });
}
function drawChart(data) {
  const canvas = document.getElementById("trendChart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const pad = 58;
  ctx.strokeStyle = getCss("--border"); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, h - pad); ctx.lineTo(w - pad, h - pad); ctx.stroke();
  ctx.fillStyle = getCss("--muted"); ctx.font = "24px -apple-system, BlinkMacSystemFont, Segoe UI";
  [0, 25, 50, 75, 100].forEach(v => {
    const y = h - pad - (v / 100) * (h - 2 * pad);
    ctx.fillText(`${v}%`, 10, y + 8);
    ctx.strokeStyle = getCss("--border"); ctx.globalAlpha = .35; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke(); ctx.globalAlpha = 1;
  });
  if (data.length === 0) return;
  const xFor = i => pad + (data.length === 1 ? .5 : i / (data.length - 1)) * (w - 2 * pad);
  const yFor = s => h - pad - (s / 100) * (h - 2 * pad);
  ctx.strokeStyle = getCss("--accent"); ctx.lineWidth = 5; ctx.beginPath();
  data.forEach((d, i) => { const x = xFor(i), y = yFor(d.score); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  data.forEach((d, i) => {
    const x = xFor(i), y = yFor(d.score);
    ctx.fillStyle = getCss("--accent"); ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = getCss("--muted"); ctx.font = "20px -apple-system, BlinkMacSystemFont, Segoe UI"; ctx.textAlign = "center";
    ctx.fillText(d.month.slice(5), x, h - 18);
  });
  ctx.textAlign = "left";
}
function getCss(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function renderGoalList(containerId, goals, onDelete, goalTypeLabel = "goal") {
  const list = document.getElementById(containerId); list.innerHTML = "";
  if (!goals.length) {
    const empty = document.createElement("div");
    empty.className = "history-item";
    empty.innerHTML = `<strong>No goals yet</strong><p class="muted">Tap add to create one.</p>`;
    list.appendChild(empty);
    return;
  }
  goals.forEach(goal => {
    const pct = goal.target ? Math.min(100, Math.round(goal.current / goal.target * 100)) : 0;
    const div = document.createElement("div"); div.className = "goal-item";
    div.innerHTML = `<div class="goal-top"><strong></strong><button class="small-btn danger">Delete</button></div>
      <div class="setting-grid"><label><span class="field-label">Current</span><input type="number" value="${goal.current}"></label><label><span class="field-label">Target</span><input type="number" value="${goal.target}"></label><span>${pct}%</span></div>
      <div class="goal-progress"><div style="width:${pct}%"></div></div>`;
    div.querySelector("strong").textContent = goal.name;
    const inputs = div.querySelectorAll("input");
    inputs[0].onchange = e => { goal.current = Number(e.target.value); saveState(true); renderGoals(); };
    inputs[1].onchange = e => { goal.target = Number(e.target.value); saveState(true); renderGoals(); };
    div.querySelector("button").onclick = () => {
      const ok = confirm(`Are you sure you want to delete this ${goalTypeLabel}: "${goal.name}"?`);
      if (ok) onDelete(goal.id);
    };
    list.appendChild(div);
  });
}
function renderGoals() {
  const currentMonth = monthKey(todayKey());
  document.getElementById("monthlyGoalMonth").textContent = readableMonth(currentMonth);
  const monthGoals = getMonthlyGoals(currentMonth);
  renderGoalList("monthlyGoalList", monthGoals, id => {
    state.monthlyGoals[currentMonth] = monthGoals.filter(g => g.id !== id);
    saveState(true); renderGoals();
  }, "monthly goal");
  renderGoalList("goalList", state.goals, id => {
    state.goals = state.goals.filter(g => g.id !== id);
    saveState(true); renderGoals();
  }, "overall goal");
}
function renderHistory() {
  const list = document.getElementById("historyList"); list.innerHTML = "";
  Object.keys(state.entries).sort().reverse().slice(0, 60).forEach(date => {
    const entry = state.entries[date];
    const div = document.createElement("div"); div.className = "history-item";
    div.innerHTML = `<strong>${date} — ${scoreForEntry(entry)}%</strong><p class="muted"></p><p class="muted small-note"></p>`;
    div.querySelectorAll("p")[0].textContent = entry.win || entry.improve || entry.notes || "No notes";
    div.querySelectorAll("p")[1].textContent = completionText(entry);
    list.appendChild(div);
  });
}
function renderSettings() {
  document.getElementById("appNameInput").value = state.settings.appName;
  document.getElementById("colorInput").value = state.settings.accent;
  const box = document.getElementById("habitSettings"); box.innerHTML = "";
  activeHabits().forEach(habit => {
    const div = document.createElement("div"); div.className = "setting-item setting-grid habit-setting-grid";
    div.innerHTML = `<label><span class="field-label">Habit</span><input type="text"></label><button class="small-btn danger">Remove</button>`;
    const input = div.querySelector("input"); input.value = habit.name;
    input.oninput = e => { habit.name = e.target.value; saveState(); };
    div.querySelector("button").onclick = () => {
      const ok = confirm(`Are you sure you want to remove this daily habit: "${habit.name}"? It will no longer appear in Today, Trends, Settings, or future exports.`);
      if (!ok) return;
      habit.active = false;
      saveState(true);
      renderCurrentScreen();
    };
    box.appendChild(div);
  });
}
function escapeHtml(str) { return String(str).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function downloadFile(name, content, type) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
function entriesCsv() {
  const habitNames = activeHabits().map(h => h.name);
  const headers = ["date", "completion_percent", "habits_complete", "habits_total", ...habitNames, "win", "improve", "notes"];
  const rows = Object.keys(state.entries).sort().map(date => {
    const e = state.entries[date];
    const habits = activeHabits();
    const complete = habits.filter(h => e.habits?.[h.id]).length;
    return [date, scoreForEntry(e), complete, habits.length, ...habits.map(h => e.habits?.[h.id] ? 1 : 0), e.win || "", e.improve || "", e.notes || ""];
  });
  return [headers, ...rows].map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}

document.querySelectorAll(".nav-btn").forEach(btn => btn.addEventListener("click", () => {
  currentScreen = btn.dataset.screen;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b === btn));
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === `screen-${currentScreen}`));
  renderCurrentScreen();
}));
document.getElementById("themeToggle").onclick = () => { state.settings.dark = !state.settings.dark; saveState(); render(); };
document.getElementById("clearToday").onclick = () => {
  if (confirm("Clear today’s habit checks? Your reflection notes will stay.")) {
    getEntry().habits = {};
    saveState(true); renderCurrentScreen();
  }
};
document.getElementById("addHabit").onclick = () => {
  const name = prompt("Habit name");
  if (name) { state.habits.push({ id: makeId(), name, active: true }); saveState(true); renderCurrentScreen(); }
};
document.getElementById("addGoal").onclick = () => {
  const name = prompt("Overall goal name");
  if (name) { state.goals.push({ id: makeId(), name, target: 1, current: 0 }); saveState(true); renderGoals(); }
};
document.getElementById("addMonthlyGoal").onclick = () => {
  const name = prompt(`Monthly goal for ${readableMonth()}`);
  if (name) {
    getMonthlyGoals().push({ id: makeId(), name, target: 1, current: 0 });
    saveState(true); renderGoals();
  }
};
document.getElementById("appNameInput").oninput = e => { state.settings.appName = e.target.value; saveState(); applySettings(); };
document.getElementById("colorInput").oninput = e => { state.settings.accent = e.target.value; saveState(); applySettings(); if (currentScreen === "trends") renderTrends(); };
document.getElementById("exportBackup").onclick = () => downloadFile("lsw-tracker-backup.json", JSON.stringify(state, null, 2), "application/json");
document.getElementById("exportCsv").onclick = () => downloadFile("lsw-tracker-history.csv", entriesCsv(), "text/csv");
document.getElementById("importBackup").onchange = e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { state = normalizeState(JSON.parse(reader.result)); saveState(true); render(); alert("Backup imported."); }
    catch { alert("That backup file did not work."); }
  };
  reader.readAsText(file);
};
document.getElementById("resetApp").onclick = () => {
  if (confirm("Reset everything? Export a backup first if you care about the data.")) {
    localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(OLD_STORAGE_KEY);
    state = structuredClone(defaultState); render();
  }
};
window.addEventListener("pagehide", flushSave);
window.addEventListener("beforeunload", flushSave);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
render();
