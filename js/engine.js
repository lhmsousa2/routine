// Pure game logic: no DOM, no storage. Everything here is unit-tested.
import { newHouse, validateHouse } from './house/state.js';
// Dates are local calendar days as 'YYYY-MM-DD' strings.

export const SCHEMA_VERSION = 2;
export const REWARD = 5;
export const PENALTY = 15;
// Multiplier applies to earnings only, based on the perfect-day streak *before* the day.
export const TIERS = [
  { streak: 30, mult: 2 },
  { streak: 14, mult: 1.5 },
  { streak: 7, mult: 1.25 },
];

// ---------- dates ----------

const pad = (n) => String(n).padStart(2, '0');

export function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timeStr(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Calendar arithmetic in UTC so DST changes can't skip or repeat a day.
export function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// ---------- state ----------

export function newState(now) {
  return {
    schemaVersion: SCHEMA_VERSION,
    goals: [],           // goal versions: {id, gid, name, target, unit, carryOverExtra, deadline, activeFrom, activeUntil}
    days: {},            // unsettled days: {date: {done: [goalVersionId]}}
    history: {},         // settled days: {date: {goals: [...], earned, penalty, net, multiplier, perfect, streakAfter}}
    ledger: [],          // {date, type: 'day'|'purchase', amount, note}
    streak: 0,
    lastSettledDate: addDays(dateStr(now), -1),
    house: newHouse(makeId),
  };
}

let idCounter = 0;
export function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  idCounter += 1;
  return `id-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function balance(state) {
  return state.ledger.reduce((sum, e) => sum + e.amount, 0);
}

export function multiplierFor(streak) {
  for (const t of TIERS) if (streak >= t.streak) return t.mult;
  return 1;
}

// Next tier the streak is working towards, or null if already at the top.
export function nextTier(streak) {
  const upcoming = [...TIERS].reverse().find((t) => streak < t.streak);
  return upcoming ? { ...upcoming, daysLeft: upcoming.streak - streak } : null;
}

// Setup mode: until the first day with goals has been settled, goal changes apply today.
export function isSetupMode(state) {
  return !state.ledger.some((e) => e.type === 'day');
}

export function isActiveOn(goal, date) {
  return goal.activeFrom <= date && (!goal.activeUntil || date <= goal.activeUntil);
}

export function activeGoals(state, date) {
  return state.goals.filter((g) => isActiveOn(g, date));
}

// Today's target = base target, plus the carry-over extra if this goal was missed yesterday.
// Uses the base (not yesterday's boosted target), so extras never stack.
export function targetFor(state, goal, date) {
  if (goal.target == null) return { target: null, carried: false };
  const prev = state.history[addDays(date, -1)];
  const prevEntry = prev?.goals.find((e) => e.gid === goal.gid);
  if (goal.carryOverExtra && prevEntry && !prevEntry.done && !prev.practice) {
    return { target: round2(goal.target + goal.carryOverExtra), carried: true };
  }
  return { target: goal.target, carried: false };
}

const round2 = (x) => Math.round(x * 100) / 100;

export function isDone(state, date, goalId) {
  return !!state.days[date]?.done.includes(goalId);
}

// A deadline goal locks once the clock passes its deadline (HH:MM), done or not.
export function isLocked(goal, now) {
  return !!goal.deadline && timeStr(now) >= goal.deadline;
}

// ---------- settlement ----------

function settleDay(state, date) {
  const goals = activeGoals(state, date);
  const done = state.days[date]?.done ?? [];
  if (goals.length === 0) {
    delete state.days[date];
    state.lastSettledDate = date;
    return;
  }
  const entries = goals.map((g) => ({
    gid: g.gid,
    id: g.id,
    name: g.name,
    unit: g.unit ?? null,
    target: targetFor(state, g, date).target,
    done: done.includes(g.id),
  }));
  const doneCount = entries.filter((e) => e.done).length;
  const missCount = entries.length - doneCount;
  // The very first scored day (the setup day) is practice: misses cost nothing and cause no carry-over.
  const practice = isSetupMode(state);
  const multiplier = multiplierFor(state.streak);
  const earned = Math.round(doneCount * REWARD * multiplier);
  const penalty = practice ? 0 : missCount * PENALTY;
  const perfect = missCount === 0;
  state.streak = perfect ? state.streak + 1 : 0;
  const net = earned - penalty;
  state.history[date] = { goals: entries, earned, penalty, net, multiplier, perfect, practice, streakAfter: state.streak };
  state.ledger.push({
    date,
    type: 'day',
    amount: net,
    note: `${doneCount}/${entries.length} goals${practice ? ' (practice day)' : ''}`,
  });
  delete state.days[date];
  state.lastSettledDate = date;
}

// Settle every day strictly before today that hasn't been settled. Returns the dates settled.
export function settle(state, now) {
  const today = dateStr(now);
  const settled = [];
  let d = addDays(state.lastSettledDate, 1);
  while (d < today) {
    settleDay(state, d);
    settled.push(d);
    d = addDays(d, 1);
  }
  // Drop stray entries for future dates (e.g. phone clock was moved back).
  for (const k of Object.keys(state.days)) if (k > today) delete state.days[k];
  return settled;
}

// Live preview of today's coins if the day ended right now.
export function todaySummary(state, now) {
  const today = dateStr(now);
  const goals = activeGoals(state, today);
  const doneCount = goals.filter((g) => isDone(state, today, g.id)).length;
  const multiplier = multiplierFor(state.streak);
  const practice = isSetupMode(state);
  return {
    total: goals.length,
    doneCount,
    multiplier,
    practice,
    earnedSoFar: Math.round(doneCount * REWARD * multiplier),
    penaltyIfEndedNow: practice ? 0 : (goals.length - doneCount) * PENALTY,
    maxToday: Math.round(goals.length * REWARD * multiplier),
  };
}

// ---------- actions ----------

export function toggleDone(state, goalId, now) {
  const today = dateStr(now);
  if (isDayClosed(state, now)) return { ok: false, reason: 'This day is already closed.' };
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal || !isActiveOn(goal, today)) return { ok: false, reason: 'Goal is not active today.' };
  if (isLocked(goal, now)) return { ok: false, reason: `Locked since ${goal.deadline}.` };
  const day = (state.days[today] ??= { done: [] });
  const i = day.done.indexOf(goalId);
  if (i >= 0) day.done.splice(i, 1);
  else day.done.push(goalId);
  return { ok: true, done: i < 0 };
}

// True if today was already settled (phone clock/time zone moved backwards). Nothing can be ticked.
export function isDayClosed(state, now) {
  return dateStr(now) <= state.lastSettledDate;
}

function checkFields(clean, raw) {
  if (!clean.name) return 'Name is required.';
  // 00:00 would lock the goal for the whole day (guaranteed miss).
  if (raw.deadline === '00:00') return 'A deadline of 00:00 locks the goal all day. Pick a later time.';
  return null;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanFields(f) {
  const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
  const target = num(f.target);
  const extra = num(f.carryOverExtra);
  return {
    name: String(f.name ?? '').trim(),
    target: target != null && target > 0 ? target : null,
    unit: target != null && f.unit ? String(f.unit).trim() || null : null,
    carryOverExtra: target != null && extra != null && extra > 0 ? extra : null,
    deadline: TIME_RE.test(f.deadline ?? '') ? f.deadline : null,
  };
}

// Changes made today take effect tomorrow, except in setup mode (effective today).
function effectiveDate(state, now) {
  const today = dateStr(now);
  return isSetupMode(state) ? today : addDays(today, 1);
}

export function addGoal(state, fields, now) {
  const clean = cleanFields(fields);
  const err = checkFields(clean, fields);
  if (err) return { ok: false, reason: err };
  const goal = { id: makeId(), gid: makeId(), ...clean, activeFrom: effectiveDate(state, now), activeUntil: null };
  state.goals.push(goal);
  return { ok: true, goal };
}

// Latest version of a goal (the one that is or will be active furthest into the future).
export function latestVersion(state, gid) {
  return state.goals
    .filter((g) => g.gid === gid)
    .sort((a, b) => (a.activeFrom < b.activeFrom ? 1 : -1))[0];
}

export function editGoal(state, gid, fields, now) {
  const clean = cleanFields(fields);
  const err = checkFields(clean, fields);
  if (err) return { ok: false, reason: err };
  const today = dateStr(now);
  const from = effectiveDate(state, now);
  const latest = latestVersion(state, gid);
  if (!latest) return { ok: false, reason: 'Goal not found.' };
  if (latest.activeUntil && latest.activeUntil <= today) return { ok: false, reason: 'This goal was removed. Undo the removal first.' };
  if (latest.activeFrom >= from) {
    // Not live yet (pending since today, or setup mode): change it in place.
    Object.assign(latest, clean);
    return { ok: true, goal: latest };
  }
  // Live today: today's version ends today, new version starts tomorrow.
  latest.activeUntil = today;
  const goal = { id: makeId(), gid, ...clean, activeFrom: from, activeUntil: null };
  state.goals.push(goal);
  return { ok: true, goal };
}

export function removeGoal(state, gid, now) {
  const today = dateStr(now);
  const from = effectiveDate(state, now);
  const versions = state.goals.filter((g) => g.gid === gid);
  if (versions.length === 0) return { ok: false, reason: 'Goal not found.' };
  // Delete versions that haven't started yet; end the live one today.
  const pendingIds = new Set(versions.filter((g) => g.activeFrom >= from).map((g) => g.id));
  state.goals = state.goals.filter((g) => !pendingIds.has(g.id));
  for (const g of versions) {
    if (!pendingIds.has(g.id) && (!g.activeUntil || g.activeUntil > today)) g.activeUntil = today;
  }
  // In setup mode the goal disappears immediately, including today's tick.
  if (from === today) {
    const day = state.days[today];
    if (day) day.done = day.done.filter((id) => !pendingIds.has(id));
  }
  return { ok: true };
}

// Undo a removal made today: the goal continues tomorrow as if nothing happened.
export function restoreGoal(state, gid, now) {
  const today = dateStr(now);
  const latest = latestVersion(state, gid);
  if (!latest || latest.activeUntil !== today) return { ok: false, reason: 'Nothing to restore.' };
  latest.activeUntil = null;
  return { ok: true };
}

// Goals for the Goals screen: one row per goal identity, with its status.
export function goalRows(state, now) {
  const today = dateStr(now);
  const tomorrow = addDays(today, 1);
  const gids = [...new Set(state.goals.map((g) => g.gid))];
  return gids
    .map((gid) => {
      const latest = latestVersion(state, gid);
      const todayVersion = state.goals.find((g) => g.gid === gid && isActiveOn(g, today));
      const tomorrowVersion = state.goals.find((g) => g.gid === gid && isActiveOn(g, tomorrow));
      let status = 'active';
      if (!todayVersion && tomorrowVersion) status = 'starts-tomorrow';
      else if (todayVersion && !tomorrowVersion) status = 'ends-today';
      else if (todayVersion && tomorrowVersion && todayVersion.id !== tomorrowVersion.id) status = 'changes-tomorrow';
      else if (!todayVersion && !tomorrowVersion) status = 'ended';
      return { gid, goal: latest, todayVersion, tomorrowVersion, status };
    })
    .filter((r) => r.status !== 'ended');
}

// ---------- validation ----------
// Deep check so a corrupt or hand-edited backup can't break the app or inject markup.

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const orNull = (check) => (v) => v === null || v === undefined || check(v);
const isTime = (v) => typeof v === 'string' && TIME_RE.test(v);

// day = daily settlement, purchase = house shop (negative), sale = selling from storage (positive)
const LEDGER_TYPES = ['day', 'purchase', 'sale'];

function validGoal(g) {
  return (
    isObj(g) && isStr(g.id) && isStr(g.gid) && isStr(g.name) &&
    orNull(isNum)(g.target) && orNull(isStr)(g.unit) && orNull(isNum)(g.carryOverExtra) &&
    orNull(isTime)(g.deadline) && isDate(g.activeFrom) && orNull(isDate)(g.activeUntil)
  );
}

function validHistoryDay(h) {
  return (
    isObj(h) && Array.isArray(h.goals) &&
    h.goals.every((e) => isObj(e) && isStr(e.gid) && isStr(e.id) && isStr(e.name) && typeof e.done === 'boolean' && orNull(isNum)(e.target) && orNull(isStr)(e.unit)) &&
    [h.earned, h.penalty, h.net, h.multiplier, h.streakAfter].every(isNum) &&
    typeof h.perfect === 'boolean'
  );
}

export function validateState(s) {
  return !!(
    isObj(s) &&
    s.schemaVersion === SCHEMA_VERSION &&
    validateHouse(s.house) &&
    Array.isArray(s.goals) && s.goals.every(validGoal) &&
    Array.isArray(s.ledger) && s.ledger.every((e) => isObj(e) && isDate(e.date) && LEDGER_TYPES.includes(e.type) && isNum(e.amount) && isStr(e.note)) &&
    isObj(s.days) && Object.entries(s.days).every(([k, d]) => isDate(k) && isObj(d) && Array.isArray(d.done) && d.done.every(isStr)) &&
    isObj(s.history) && Object.entries(s.history).every(([k, h]) => isDate(k) && validHistoryDay(h)) &&
    Number.isInteger(s.streak) && s.streak >= 0 &&
    isDate(s.lastSettledDate) &&
    // Settled days must not be ahead of lastSettledDate, open days must be after it.
    Object.keys(s.history).every((k) => k <= s.lastSettledDate) &&
    Object.keys(s.days).every((k) => k > s.lastSettledDate)
  );
}

// Upgrade older saved data to the current schema. Add a step here whenever SCHEMA_VERSION goes up.
export function migrate(s) {
  if (!isObj(s)) return s;
  if (s.schemaVersion === 1) {
    // v2: house game. Existing goals, history and coins are untouched.
    s.house = newHouse(makeId);
    s.schemaVersion = 2;
  }
  return s;
}
