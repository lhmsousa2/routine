// UI: renders state and wires up events. All rules live in engine.js.
import * as E from './engine.js';
import * as Store from './store.js';

// ---------- clock (with a debug time-travel offset, only when the URL has ?debug) ----------

const DEBUG = new URLSearchParams(location.search).has('debug');
const OFFSET_KEY = 'routine.debugOffsetMs';
function debugOffset() {
  if (!DEBUG) return 0;
  try {
    return Number(localStorage.getItem(OFFSET_KEY)) || 0;
  } catch {
    return 0;
  }
}
const now = () => new Date(Date.now() + debugOffset());

// ---------- state ----------

let state = Store.load(now());
let tab = 'today';
let historyMonth = E.dateStr(now()).slice(0, 7); // 'YYYY-MM'
let historySelected = null;
let editingGid = null;
let lastToday = E.dateStr(now());

function commit() {
  if (!Store.save(state)) toast('⚠️ Could not save. Export a backup from Settings.');
  render();
}

function settleAndRender() {
  const settled = E.settle(state, now());
  lastToday = E.dateStr(now());
  if (settled.length) {
    Store.save(state);
    const results = settled.map((d) => state.history[d]).filter(Boolean);
    if (results.length) {
      const net = results.reduce((s, r) => s + r.net, 0);
      const label = results.length === 1 ? 'Yesterday' : `Last ${results.length} days`;
      toast(`${label}: ${net >= 0 ? '+' : ''}${net} coins`);
    }
  }
  render();
}

// ---------- helpers ----------

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const multLabel = (m) => `×${fmtNum(m)}`;

function fmtDate(s, opts) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

function goalMeta(g, target = g.target, carried = false) {
  const parts = [];
  if (target != null) parts.push(`${fmtNum(target)}${g.unit ? ' ' + esc(g.unit) : ''}`);
  if (carried) parts.push(`<span class="badge warn">+${fmtNum(g.carryOverExtra)} carried over</span>`);
  return parts.join(' ');
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ---------- render ----------

function render() {
  const n = now();
  $('#topbar-date').textContent = n.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  $('#topbar-title').textContent = { today: 'Today', history: 'History', goals: 'Goals', settings: 'Settings' }[tab];
  const bal = E.balance(state);
  $('#balance').innerHTML = `<span class="coin">●</span> ${bal}`;
  $('#balance').classList.toggle('negative', bal < 0);
  for (const b of document.querySelectorAll('.tabbar button')) b.classList.toggle('active', b.dataset.tab === tab);
  for (const v of ['today', 'history', 'goals', 'settings']) $(`#view-${v}`).hidden = v !== tab;
  ({ today: renderToday, history: renderHistory, goals: renderGoals, settings: renderSettings })[tab](n);
}

function renderToday(n) {
  const today = E.dateStr(n);
  const goals = E.activeGoals(state, today);
  const sum = E.todaySummary(state, n);
  const next = E.nextTier(state.streak);
  const el = $('#view-today');

  if (goals.length === 0) {
    const upcoming = E.activeGoals(state, E.addDays(today, 1)).length;
    el.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🌱</div>
        <h2>${upcoming ? 'Your goals start tomorrow' : 'No goals yet'}</h2>
        <p>${upcoming ? `${upcoming} goal${upcoming > 1 ? 's' : ''} scheduled from tomorrow.` : 'Add the things you want to do every day.'}</p>
        <button class="btn primary" data-action="go-goals">${upcoming ? 'View goals' : 'Add goals'}</button>
      </div>`;
    return;
  }

  const pct = Math.round((sum.doneCount / sum.total) * 100);
  const allDone = sum.doneCount === sum.total;
  el.innerHTML = `
    ${E.isSetupMode(state) ? `<div class="banner"><strong>Practice day.</strong> Set up your goals: changes apply right away and misses cost nothing today. Scoring starts tomorrow.</div>` : ''}
    <div class="card stats ${allDone ? 'perfect' : ''}">
      <div class="stats-top">
        <div>
          <div class="big">${sum.doneCount}<span class="of">/${sum.total}</span></div>
          <div class="muted">${allDone ? 'Perfect day 🎉' : 'goals done'}</div>
        </div>
        <div class="streak">
          <div class="big">🔥 ${state.streak}</div>
          <div class="muted">day streak · ${multLabel(sum.multiplier)}</div>
        </div>
      </div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="stats-bottom">
        <span class="pos">+${sum.earnedSoFar} earned</span>
        ${sum.penaltyIfEndedNow ? `<span class="neg">−${sum.penaltyIfEndedNow} if the day ended now</span>` : `<span class="muted">${sum.practice ? 'practice: no penalties' : 'nothing at risk'}</span>`}
      </div>
      ${next ? `<div class="muted small">${multLabel(next.mult)} coins after ${next.daysLeft} more perfect day${next.daysLeft > 1 ? 's' : ''}</div>` : `<div class="muted small">Max multiplier reached 💪</div>`}
    </div>
    <ul class="goal-list">
      ${goals
        .map((g) => {
          const done = E.isDone(state, today, g.id);
          const locked = E.isLocked(g, n);
          const { target, carried } = E.targetFor(state, g, today);
          const deadline = g.deadline
            ? locked
              ? `<span class="badge ${done ? 'ok' : 'bad'}">${done ? 'Done in time' : `Missed · locked ${g.deadline}`}</span>`
              : `<span class="badge">by ${g.deadline}</span>`
            : '';
          return `
          <li>
            <button class="goal ${done ? 'done' : ''} ${locked ? 'locked' : ''}" data-action="toggle" data-id="${g.id}" ${locked ? 'aria-disabled="true"' : ''}>
              <span class="check" aria-hidden="true">${done ? '✓' : locked ? '✕' : ''}</span>
              <span class="goal-body">
                <span class="goal-name">${esc(g.name)}</span>
                <span class="goal-meta">${goalMeta(g, target, carried)} ${deadline}</span>
              </span>
              <span class="goal-coins">${done ? `+${fmtNum(E.REWARD * sum.multiplier)}` : sum.practice ? '' : `−${E.PENALTY}`}</span>
            </button>
          </li>`;
        })
        .join('')}
    </ul>`;
}

function renderHistory(n) {
  const today = E.dateStr(n);
  const [y, m] = historyMonth.split('-').map(Number);
  const first = `${historyMonth}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday-first
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span></span>');
  for (let d = 1; d <= daysInMonth; d++) {
    const date = E.addDays(first, d - 1);
    const h = state.history[date];
    let cls = 'none';
    if (h) cls = h.perfect ? 'perfect' : h.goals.some((g) => g.done) ? 'partial' : 'missed';
    else if (date === today) cls = 'today';
    else if (date > today) cls = 'future';
    cells.push(
      `<button class="day ${cls} ${date === today ? 'is-today' : ''} ${date === historySelected ? 'selected' : ''}" data-action="pick-day" data-date="${date}" ${h ? '' : 'disabled'}>${d}</button>`,
    );
  }

  const sel = historySelected && state.history[historySelected];
  const perfectDays = Object.values(state.history).filter((h) => h.perfect).length;
  const best = Object.values(state.history).reduce((b, h) => Math.max(b, h.streakAfter), 0);

  $('#view-history').innerHTML = `
    <div class="card">
      <div class="month-nav">
        <button class="btn ghost" data-action="month" data-delta="-1" aria-label="Previous month">‹</button>
        <strong>${new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button class="btn ghost" data-action="month" data-delta="1" aria-label="Next month">›</button>
      </div>
      <div class="cal-head">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal">${cells.join('')}</div>
      <div class="legend"><span class="dot perfect"></span>Perfect <span class="dot partial"></span>Partial <span class="dot missed"></span>None done</div>
    </div>
    ${
      sel
        ? `<div class="card">
        <h3>${fmtDate(historySelected, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
        <ul class="detail-list">
          ${sel.goals
            .map((g) => `<li class="${g.done ? 'ok' : 'bad'}"><span>${g.done ? '✓' : '✕'} ${esc(g.name)}</span><span class="muted">${g.target != null ? fmtNum(g.target) + (g.unit ? ' ' + esc(g.unit) : '') : ''}</span></li>`)
            .join('')}
        </ul>
        <div class="detail-sum">
          <span class="pos">+${sel.earned}${sel.multiplier !== 1 ? ` (${multLabel(sel.multiplier)})` : ''}</span>
          <span class="neg">−${sel.penalty}</span>
          <strong class="${sel.net >= 0 ? 'pos' : 'neg'}">= ${signed(sel.net)}</strong>
        </div>
      </div>`
        : ''
    }
    <div class="card">
      <div class="stat-row"><span>Perfect days</span><strong>${perfectDays}</strong></div>
      <div class="stat-row"><span>Best streak</span><strong>${best}</strong></div>
      <h3>Recent coins</h3>
      <ul class="ledger">
        ${
          state.ledger
            .slice(-15)
            .reverse()
            .map((e) => `<li><span>${fmtDate(e.date, { day: 'numeric', month: 'short' })} · ${esc(e.note)}</span><strong class="${e.amount >= 0 ? 'pos' : 'neg'}">${signed(e.amount)}</strong></li>`)
            .join('') || '<li class="muted">Nothing yet. Days are settled at midnight.</li>'
        }
      </ul>
    </div>`;
}

const STATUS_LABEL = {
  'starts-tomorrow': '<span class="badge info">Starts tomorrow</span>',
  'ends-today': '<span class="badge bad">Removed from tomorrow</span>',
  'changes-tomorrow': '<span class="badge info">Changes tomorrow</span>',
  active: '',
};

function renderGoals(n) {
  const rows = E.goalRows(state, n);
  const setup = E.isSetupMode(state);
  $('#view-goals').innerHTML = `
    <div class="banner">${setup ? 'Setup day: changes apply right away.' : 'Changes apply from <strong>tomorrow</strong>, so today’s goals stay fixed.'}</div>
    <ul class="goal-rows">
      ${
        rows
          .map(({ gid, goal, status }) => {
            const extra = [];
            if (goal.carryOverExtra) extra.push(`carry-over +${fmtNum(goal.carryOverExtra)}`);
            if (goal.deadline) extra.push(`by ${goal.deadline}`);
            return `
            <li class="goal-row ${status === 'ends-today' ? 'ending' : ''}">
              <button class="goal-row-main" data-action="edit" data-gid="${gid}" ${status === 'ends-today' ? 'disabled' : ''}>
                <span class="goal-name">${esc(goal.name)}</span>
                <span class="goal-meta">${[goalMeta(goal), ...extra].filter(Boolean).join(' · ')}</span>
                ${STATUS_LABEL[status]}
              </button>
              ${status === 'ends-today' ? `<button class="btn ghost small" data-action="restore" data-gid="${gid}">Undo</button>` : ''}
            </li>`;
          })
          .join('') || '<li class="muted pad">No goals yet.</li>'
      }
    </ul>
    <button class="btn primary block" data-action="add">+ Add goal</button>
    <p class="muted small center">Every goal: +${E.REWARD} when done, −${E.PENALTY} when missed.</p>`;
}

function renderSettings() {
  const off = debugOffset();
  $('#view-settings').innerHTML = `
    <div class="card">
      <h3>How scoring works</h3>
      <ul class="rules">
        <li>Each goal done: <strong class="pos">+${E.REWARD}</strong>. Each goal missed: <strong class="neg">−${E.PENALTY}</strong>.</li>
        <li>The day closes at midnight. Days you don't open the app count as missed.</li>
        <li>Perfect-day streak boosts earnings: ${E.TIERS.slice().reverse().map((t) => `${t.streak} days ${multLabel(t.mult)}`).join(', ')}. One miss resets it.</li>
        <li>Carry-over: miss a goal that has one and tomorrow's target goes up once (it never stacks).</li>
        <li>Goals with a deadline lock at that time.</li>
        <li>Your first day (setup) is a practice day: misses cost nothing.</li>
      </ul>
    </div>
    <div class="card">
      <h3>Backup</h3>
      <p class="muted small">Your data lives only on this phone. Export a backup now and then (Save to Files / iCloud Drive).</p>
      <div class="btn-row">
        <button class="btn primary" data-action="export">Export backup</button>
        <label class="btn ghost">Import backup<input type="file" accept="application/json,.json" id="import-file" hidden></label>
      </div>
    </div>
    <div class="card">
      <h3>Danger zone</h3>
      <button class="btn danger" data-action="reset">Erase all data</button>
    </div>
    ${
      DEBUG
        ? `<div class="card debug">
      <h3>Debug clock</h3>
      <p class="muted small">Now: ${now().toLocaleString()} (offset ${Math.round(off / 3600000)}h)</p>
      <div class="btn-row">
        <button class="btn ghost" data-action="time" data-ms="3600000">+1 hour</button>
        <button class="btn ghost" data-action="time" data-ms="86400000">+1 day</button>
        <button class="btn ghost" data-action="time" data-ms="reset">Reset clock</button>
      </div>
    </div>`
        : ''
    }`;
}

// ---------- goal dialog ----------

const dialog = $('#goal-dialog');
const form = $('#goal-form');

function openGoalDialog(gid = null) {
  editingGid = gid;
  form.reset();
  const setup = E.isSetupMode(state);
  $('#goal-dialog-title').textContent = gid ? 'Edit goal' : 'New goal';
  $('#goal-dialog-hint').textContent = setup ? 'Applies right away (setup day).' : 'Applies from tomorrow.';
  $('#goal-remove').hidden = !gid;
  if (gid) {
    const g = E.latestVersion(state, gid);
    for (const k of ['name', 'target', 'unit', 'carryOverExtra', 'deadline']) form.elements[k].value = g[k] ?? '';
  }
  dialog.showModal();
  if (!gid) form.elements.name.focus();
}

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const fields = Object.fromEntries(new FormData(form));
  const res = editingGid ? E.editGoal(state, editingGid, fields, now()) : E.addGoal(state, fields, now());
  if (!res.ok) return toast(res.reason);
  dialog.close();
  toast(E.isSetupMode(state) ? 'Saved' : 'Saved · applies from tomorrow');
  commit();
});
$('#goal-cancel').addEventListener('click', () => dialog.close());
$('#goal-remove').addEventListener('click', () => {
  const g = E.latestVersion(state, editingGid);
  const setup = E.isSetupMode(state);
  if (!confirm(setup ? `Remove "${g.name}"?` : `Remove "${g.name}" from tomorrow? It still counts today.`)) return;
  E.removeGoal(state, editingGid, now());
  dialog.close();
  commit();
});
// Tap outside the dialog to close it
dialog.addEventListener('click', (ev) => {
  if (ev.target === dialog) dialog.close();
});

// ---------- events ----------

document.querySelector('.tabbar').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  window.scrollTo(0, 0);
  render();
});

document.querySelector('main').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action;

  if (a === 'toggle') {
    if (E.dateStr(now()) !== lastToday) return settleAndRender(); // midnight passed while open
    const wasAllDone = E.todaySummary(state, now());
    const res = E.toggleDone(state, b.dataset.id, now());
    if (!res.ok) return toast(res.reason);
    const sum = E.todaySummary(state, now());
    if (res.done && sum.doneCount === sum.total && wasAllDone.doneCount !== sum.total) toast(`🎉 All done! +${sum.maxToday} coins tonight`);
    commit();
  } else if (a === 'go-goals') {
    tab = 'goals';
    render();
  } else if (a === 'add') openGoalDialog();
  else if (a === 'edit') openGoalDialog(b.dataset.gid);
  else if (a === 'restore') {
    E.restoreGoal(state, b.dataset.gid, now());
    commit();
  } else if (a === 'month') {
    const [y, m] = historyMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + Number(b.dataset.delta), 1);
    historyMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    render();
  } else if (a === 'pick-day') {
    historySelected = historySelected === b.dataset.date ? null : b.dataset.date;
    render();
  } else if (a === 'export') {
    const r = await Store.exportBackup(state, E.dateStr(now()));
    if (r !== 'cancelled') toast('Backup exported');
  } else if (a === 'reset') {
    const answer = prompt('This erases all goals, history and coins. Type ERASE to confirm.');
    if (answer?.trim().toUpperCase() !== 'ERASE') return;
    state = E.newState(now());
    commit();
    toast('All data erased');
  } else if (a === 'time') {
    const ms = b.dataset.ms;
    try {
      localStorage.setItem(OFFSET_KEY, ms === 'reset' ? '0' : String(debugOffset() + Number(ms)));
    } catch {
      /* ignore */
    }
    settleAndRender();
  }
});

document.querySelector('main').addEventListener('change', async (ev) => {
  if (ev.target.id !== 'import-file') return;
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const imported = await Store.readBackup(file);
    if (!confirm('Replace everything on this phone with this backup?')) return;
    state = imported;
    E.settle(state, now());
    commit();
    toast('Backup restored');
  } catch (e) {
    toast(e.message);
  }
});

// Re-check for midnight and deadlines while the app stays open, and on return to the app.
setInterval(() => {
  if (E.dateStr(now()) !== lastToday) settleAndRender();
  else if (tab === 'today' && !dialog.open) render();
}, 30_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') settleAndRender();
});

// ---------- boot ----------

settleAndRender();
Store.requestPersistence();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
}
