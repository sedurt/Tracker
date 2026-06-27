const STORAGE_KEY = "personal_lsw_tracker_v1";
const todayKey = () => new Date().toISOString().slice(0, 10);
const monthKey = (dateStr) => dateStr.slice(0, 7);

const defaultState = {
  settings: { appName: "LSW Tracker", accent: "#2563eb", dark: false },
  habits: [
    { id: crypto.randomUUID(), name: "Sleep 7+ hours", points: 2, active: true },
    { id: crypto.randomUUID(), name: "Workout / movement", points: 3, active: true },
    { id: crypto.randomUUID(), name: "Nutrition on plan", points: 3, active: true },
    { id: crypto.randomUUID(), name: "Learning / school", points: 2, active: true },
    { id: crypto.randomUUID(), name: "Budget / money check", points: 1, active: true },
    { id: crypto.randomUUID(), name: "Clean space", points: 1, active: true },
    { id: crypto.randomUUID(), name: "Reflection completed", points: 1, active: true }
  ],
  entries: {},
  goals: [
    { id: crypto.randomUUID(), name: "Lift 4 days this week", target: 4, current: 0 },
    { id: crypto.randomUUID(), name: "Save money this month", target: 500, current: 0 }
  ]
};

let state = loadState();
let currentScreen = "today";

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.settings && saved.habits && saved.entries) return saved;
  } catch {}
  return structuredClone(defaultState);
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function getEntry(date = todayKey()) {
  if (!state.entries[date]) state.entries[date] = { habits: {}, win: "", improve: "", notes: "" };
  return state.entries[date];
}
function activeHabits() { return state.habits.filter(h => h.active); }
function scoreForEntry(entry) {
  const habits = activeHabits();
  const total = habits.reduce((sum, h) => sum + Number(h.points || 1), 0);
  const complete = habits.reduce((sum, h) => sum + (entry.habits[h.id] ? Number(h.points || 1) : 0), 0);
  return total ? Math.round((complete / total) * 100) : 0;
}
function applySettings() {
  document.documentElement.style.setProperty("--accent", state.settings.accent || "#2563eb");
  document.body.classList.toggle("dark", !!state.settings.dark);
  document.getElementById("appTitle").textContent = state.settings.appName || "LSW Tracker";
  document.title = state.settings.appName || "LSW Tracker";
}
function render() {
  applySettings();
  renderToday();
  renderTrends();
  renderGoals();
  renderHistory();
  renderSettings();
}
function renderToday() {
  const date = todayKey();
  const entry = getEntry(date);
  document.getElementById("todayDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const score = scoreForEntry(entry);
  document.getElementById("todayScore").textContent = `${score}%`;
  document.querySelector(".score-ring").style.setProperty("--score-deg", `${score * 3.6}deg`);
  const list = document.getElementById("habitList");
  list.innerHTML = "";
  activeHabits().forEach(habit => {
    const row = document.createElement("label");
    row.className = "habit-item";
    row.innerHTML = `
      <input type="checkbox" ${entry.habits[habit.id] ? "checked" : ""} data-habit="${habit.id}">
      <div class="habit-main"><div class="habit-name"></div><div class="habit-meta">${habit.points} point${habit.points == 1 ? "" : "s"}</div></div>`;
    row.querySelector(".habit-name").textContent = habit.name;
    row.querySelector("input").addEventListener("change", e => {
      entry.habits[habit.id] = e.target.checked;
      saveState(); renderToday(); renderTrends(); renderHistory();
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
  select.innerHTML = `<option value="overall">Overall score</option>` + activeHabits().map(h => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join("");
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
function renderGoals() {
  const list = document.getElementById("goalList"); list.innerHTML = "";
  state.goals.forEach(goal => {
    const pct = goal.target ? Math.min(100, Math.round(goal.current / goal.target * 100)) : 0;
    const div = document.createElement("div"); div.className = "goal-item";
    div.innerHTML = `<div class="goal-top"><strong></strong><button class="small-btn danger">Delete</button></div>
      <div class="setting-grid"><label><span class="field-label">Current</span><input type="number" value="${goal.current}"></label><label><span class="field-label">Target</span><input type="number" value="${goal.target}"></label><span>${pct}%</span></div>
      <div class="goal-progress"><div style="width:${pct}%"></div></div>`;
    div.querySelector("strong").textContent = goal.name;
    const inputs = div.querySelectorAll("input");
    inputs[0].oninput = e => { goal.current = Number(e.target.value); saveState(); renderGoals(); };
    inputs[1].oninput = e => { goal.target = Number(e.target.value); saveState(); renderGoals(); };
    div.querySelector("button").onclick = () => { state.goals = state.goals.filter(g => g.id !== goal.id); saveState(); renderGoals(); };
    list.appendChild(div);
  });
}
function renderHistory() {
  const list = document.getElementById("historyList"); list.innerHTML = "";
  Object.keys(state.entries).sort().reverse().slice(0, 60).forEach(date => {
    const entry = state.entries[date];
    const div = document.createElement("div"); div.className = "history-item";
    div.innerHTML = `<strong>${date} — ${scoreForEntry(entry)}%</strong><p class="muted"></p>`;
    div.querySelector("p").textContent = entry.win || entry.improve || entry.notes || "No notes";
    list.appendChild(div);
  });
}
function renderSettings() {
  document.getElementById("appNameInput").value = state.settings.appName;
  document.getElementById("colorInput").value = state.settings.accent;
  const box = document.getElementById("habitSettings"); box.innerHTML = "";
  state.habits.forEach(habit => {
    const div = document.createElement("div"); div.className = "setting-item setting-grid";
    div.innerHTML = `<label><span class="field-label">Habit</span><input type="text"></label><label><span class="field-label">Points</span><input type="number" min="1"></label><button class="small-btn danger">Remove</button>`;
    const inputs = div.querySelectorAll("input"); inputs[0].value = habit.name; inputs[1].value = habit.points;
    inputs[0].oninput = e => { habit.name = e.target.value; saveState(); renderToday(); renderTrends(); };
    inputs[1].oninput = e => { habit.points = Number(e.target.value || 1); saveState(); renderToday(); renderTrends(); };
    div.querySelector("button").onclick = () => { habit.active = false; saveState(); render(); };
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
  const headers = ["date", "score", ...habitNames, "win", "improve", "notes"];
  const rows = Object.keys(state.entries).sort().map(date => {
    const e = state.entries[date];
    return [date, scoreForEntry(e), ...activeHabits().map(h => e.habits?.[h.id] ? 1 : 0), e.win || "", e.improve || "", e.notes || ""];
  });
  return [headers, ...rows].map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}

document.querySelectorAll(".nav-btn").forEach(btn => btn.addEventListener("click", () => {
  currentScreen = btn.dataset.screen;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b === btn));
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === `screen-${currentScreen}`));
  render();
}));
document.getElementById("themeToggle").onclick = () => { state.settings.dark = !state.settings.dark; saveState(); render(); };
document.getElementById("clearToday").onclick = () => { if (confirm("Clear today’s habit checks?")) { getEntry().habits = {}; saveState(); render(); } };
document.getElementById("addHabit").onclick = () => { const name = prompt("Habit name"); if (name) { state.habits.push({ id: crypto.randomUUID(), name, points: 1, active: true }); saveState(); render(); } };
document.getElementById("addGoal").onclick = () => { const name = prompt("Goal name"); if (name) { state.goals.push({ id: crypto.randomUUID(), name, target: 1, current: 0 }); saveState(); renderGoals(); } };
document.getElementById("appNameInput").oninput = e => { state.settings.appName = e.target.value; saveState(); applySettings(); };
document.getElementById("colorInput").oninput = e => { state.settings.accent = e.target.value; saveState(); applySettings(); renderTrends(); };
document.getElementById("exportBackup").onclick = () => downloadFile("lsw-tracker-backup.json", JSON.stringify(state, null, 2), "application/json");
document.getElementById("exportCsv").onclick = () => downloadFile("lsw-tracker-history.csv", entriesCsv(), "text/csv");
document.getElementById("importBackup").onchange = e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { try { state = JSON.parse(reader.result); saveState(); render(); alert("Backup imported."); } catch { alert("That backup file did not work."); } };
  reader.readAsText(file);
};
document.getElementById("resetApp").onclick = () => { if (confirm("Reset everything? Export a backup first if you care about the data.")) { localStorage.removeItem(STORAGE_KEY); state = structuredClone(defaultState); render(); } };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
render();
