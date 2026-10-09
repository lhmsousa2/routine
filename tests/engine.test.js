import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';

// Local-time Date helper: at('2026-10-10', '14:00')
const at = (date, time = '12:00') => new Date(`${date}T${time}:00`);

// Fresh install on `date`, goals added during setup (applies same day).
function fresh(goalFields, date = '2026-10-10') {
  const s = E.newState(at(date));
  for (const f of goalFields) E.addGoal(s, f, at(date));
  return s;
}
// Past the practice day: goals set up on the 9th, practice day settled; scored days start on `date`.
function setup(goalFields, date = '2026-10-10') {
  const s = fresh(goalFields, E.addDays(date, -1));
  E.settle(s, at(date));
  return s;
}
const ids = (s, date) => E.activeGoals(s, date).map((g) => g.id);
const doAll = (s, date, time = '12:00') => ids(s, date).forEach((id) => E.toggleDone(s, id, at(date, time)));

const THREE = [{ name: 'Push-ups', target: 50, unit: 'reps', carryOverExtra: 25 }, { name: 'Read' }, { name: 'Water', target: 1.5, unit: 'L' }];

test('date math crosses month/year and DST', () => {
  assert.equal(E.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(E.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(E.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(E.addDays('2026-10-25', 1), '2026-10-26'); // EU DST end
  assert.equal(E.addDays('2026-03-08', 1), '2026-03-09'); // US DST start
});

test('setup mode: goals apply today', () => {
  const s = fresh(THREE);
  assert.equal(E.activeGoals(s, '2026-10-10').length, 3);
});

test('perfect day: +5 each, streak 1', () => {
  const s = setup(THREE);
  doAll(s, '2026-10-10');
  E.settle(s, at('2026-10-11'));
  assert.equal(E.balance(s), 15);
  assert.equal(s.streak, 1);
  assert.equal(s.history['2026-10-10'].perfect, true);
});

test('one miss of 7: +30 −15 = +15, streak resets', () => {
  const seven = Array.from({ length: 7 }, (_, i) => ({ name: `G${i}` }));
  const s = setup(seven);
  s.streak = 3;
  ids(s, '2026-10-10').slice(0, 6).forEach((id) => E.toggleDone(s, id, at('2026-10-10')));
  E.settle(s, at('2026-10-11'));
  assert.equal(E.balance(s), 15);
  assert.equal(s.streak, 0);
});

test('all missed: −15 each', () => {
  const s = setup(THREE);
  E.settle(s, at('2026-10-11'));
  assert.equal(E.balance(s), -45);
});

test('app closed for several days: each day fully missed', () => {
  const s = setup(THREE);
  doAll(s, '2026-10-10');
  E.settle(s, at('2026-10-14', '08:00'));
  // 10th perfect +15, 11th-13th missed −45 each
  assert.equal(E.balance(s), 15 - 45 * 3);
  assert.equal(s.lastSettledDate, '2026-10-13');
  assert.equal(s.streak, 0);
});

test('today is never settled early', () => {
  const s = fresh(THREE);
  E.settle(s, at('2026-10-10', '23:59'));
  assert.equal(s.ledger.length, 0);
});

test('setup day is a practice day: earnings count, misses free, no carry-over', () => {
  const s = fresh(THREE);
  const read = E.activeGoals(s, '2026-10-10').find((g) => g.name === 'Read');
  E.toggleDone(s, read.id, at('2026-10-10'));
  assert.equal(E.todaySummary(s, at('2026-10-10')).penaltyIfEndedNow, 0);
  E.settle(s, at('2026-10-11'));
  assert.equal(E.balance(s), 5);
  assert.equal(s.history['2026-10-10'].practice, true);
  const push = E.activeGoals(s, '2026-10-11').find((g) => g.name === 'Push-ups');
  assert.equal(E.targetFor(s, push, '2026-10-11').target, 50);
  // Next day is scored normally
  E.settle(s, at('2026-10-12'));
  assert.equal(s.ledger.at(-1).amount, -45);
  assert.equal(s.history['2026-10-11'].practice, false);
});

test('multiplier tiers: 1.25 after 7, 1.5 after 14, 2 after 30', () => {
  assert.equal(E.multiplierFor(6), 1);
  assert.equal(E.multiplierFor(7), 1.25);
  assert.equal(E.multiplierFor(13), 1.25);
  assert.equal(E.multiplierFor(14), 1.5);
  assert.equal(E.multiplierFor(30), 2);
  assert.deepEqual(E.nextTier(5), { streak: 7, mult: 1.25, daysLeft: 2 });
  assert.equal(E.nextTier(30), null);
});

test('streak multiplier applies to earnings, not penalties', () => {
  const seven = Array.from({ length: 7 }, (_, i) => ({ name: `G${i}` }));
  const s = setup(seven);
  let d = '2026-10-10';
  for (let i = 0; i < 7; i++) {
    doAll(s, d);
    d = E.addDays(d, 1);
    E.settle(s, at(d));
  }
  assert.equal(s.streak, 7);
  assert.equal(E.balance(s), 7 * 35);
  // Day 8: x1.25 -> 7*5*1.25 = 43.75 -> 44
  doAll(s, d);
  d = E.addDays(d, 1);
  E.settle(s, at(d));
  assert.equal(s.ledger.at(-1).amount, 44);
  // Day 9: miss one at x1.25: 6*5*1.25=37.5 -> 38, minus 15 = 23
  ids(s, d).slice(0, 6).forEach((id) => E.toggleDone(s, id, at(d)));
  d = E.addDays(d, 1);
  E.settle(s, at(d));
  assert.equal(s.ledger.at(-1).amount, 23);
  assert.equal(s.streak, 0);
});

test('carry-over: applies after a miss, does not stack, clears after done', () => {
  const s = setup(THREE);
  const push = () => E.activeGoals(s, d).find((g) => g.name === 'Push-ups');
  let d = '2026-10-10';
  E.settle(s, at((d = E.addDays(d, 1)))); // missed 10th
  assert.deepEqual(E.targetFor(s, push(), d), { target: 75, carried: true });
  E.settle(s, at((d = E.addDays(d, 1)))); // missed 11th too
  assert.deepEqual(E.targetFor(s, push(), d), { target: 75, carried: true }, 'no stacking');
  assert.equal(s.history['2026-10-11'].goals.find((g) => g.name === 'Push-ups').target, 75);
  E.toggleDone(s, push().id, at(d));
  E.settle(s, at((d = E.addDays(d, 1))));
  assert.deepEqual(E.targetFor(s, push(), d), { target: 50, carried: false });
  // Goals without carry-over keep base target
  const water = E.activeGoals(s, d).find((g) => g.name === 'Water');
  assert.equal(E.targetFor(s, water, '2026-10-11').target, 1.5);
});

test('deadline goal locks after deadline, stays done if ticked before', () => {
  const s = setup([{ name: 'Wake up', deadline: '09:30' }, { name: 'Wake2', deadline: '09:30' }]);
  const [a, b] = ids(s, '2026-10-10');
  assert.equal(E.toggleDone(s, a, at('2026-10-10', '09:29')).ok, true);
  assert.equal(E.toggleDone(s, b, at('2026-10-10', '09:30')).ok, false);
  assert.equal(E.toggleDone(s, a, at('2026-10-10', '10:00')).ok, false, 'cannot untick after lock');
  E.settle(s, at('2026-10-11'));
  assert.equal(E.balance(s), 5 - 15);
});

test('after setup, add/edit/remove only affect tomorrow', () => {
  const s = setup(THREE);
  doAll(s, '2026-10-10');
  E.settle(s, at('2026-10-11'));
  const now = at('2026-10-11', '20:00');
  assert.equal(E.isSetupMode(s), false);

  E.addGoal(s, { name: 'Organize room' }, now);
  assert.equal(E.activeGoals(s, '2026-10-11').length, 3);
  assert.equal(E.activeGoals(s, '2026-10-12').length, 4);

  const read = E.activeGoals(s, '2026-10-11').find((g) => g.name === 'Read');
  E.removeGoal(s, read.gid, now);
  assert.ok(E.activeGoals(s, '2026-10-11').some((g) => g.name === 'Read'), 'still due today');
  assert.ok(!E.activeGoals(s, '2026-10-12').some((g) => g.name === 'Read'));

  const push = E.activeGoals(s, '2026-10-11').find((g) => g.name === 'Push-ups');
  E.editGoal(s, push.gid, { name: 'Push-ups', target: 60, carryOverExtra: 25 }, now);
  assert.equal(E.activeGoals(s, '2026-10-11').find((g) => g.gid === push.gid).target, 50);
  assert.equal(E.activeGoals(s, '2026-10-12').find((g) => g.gid === push.gid).target, 60);
  // Second edit the same day modifies the pending version, no extra versions
  E.editGoal(s, push.gid, { name: 'Push-ups', target: 70 }, now);
  assert.equal(s.goals.filter((g) => g.gid === push.gid).length, 2);
  assert.equal(E.activeGoals(s, '2026-10-12').find((g) => g.gid === push.gid).target, 70);

  // Removing today doesn't dodge today's penalty
  E.settle(s, at('2026-10-12'));
  assert.equal(s.history['2026-10-11'].goals.length, 3);
  assert.equal(s.history['2026-10-11'].penalty, 45);
});

test('carry-over survives an edit (tracked by goal identity)', () => {
  const s = setup(THREE);
  E.settle(s, at('2026-10-11')); // all missed
  const push = E.activeGoals(s, '2026-10-11').find((g) => g.name === 'Push-ups');
  E.editGoal(s, push.gid, { name: 'Push-ups', target: 60, carryOverExtra: 20 }, at('2026-10-11'));
  E.settle(s, at('2026-10-12')); // missed again
  const v2 = E.activeGoals(s, '2026-10-12').find((g) => g.gid === push.gid);
  assert.deepEqual(E.targetFor(s, v2, '2026-10-12'), { target: 80, carried: true });
});

test('setup mode remove deletes immediately; pending goal removal; restore', () => {
  const s = fresh(THREE);
  const read = E.activeGoals(s, '2026-10-10').find((g) => g.name === 'Read');
  E.toggleDone(s, read.id, at('2026-10-10'));
  E.removeGoal(s, read.gid, at('2026-10-10'));
  assert.equal(E.activeGoals(s, '2026-10-10').length, 2);
  assert.deepEqual(s.days['2026-10-10'].done, []);

  E.settle(s, at('2026-10-11'));
  const now = at('2026-10-11');
  const { goal } = E.addGoal(s, { name: 'New' }, now);
  E.removeGoal(s, goal.gid, now);
  assert.ok(!s.goals.some((g) => g.gid === goal.gid), 'pending goal fully deleted');

  const water = E.activeGoals(s, '2026-10-11').find((g) => g.name === 'Water');
  E.removeGoal(s, water.gid, now);
  assert.equal(E.goalRows(s, now).find((r) => r.gid === water.gid).status, 'ends-today');
  E.restoreGoal(s, water.gid, now);
  assert.ok(E.activeGoals(s, '2026-10-12').some((g) => g.gid === water.gid));
});

test('days with no goals are skipped (no coins, streak kept)', () => {
  const s = E.newState(at('2026-10-10'));
  s.streak = 4;
  E.settle(s, at('2026-10-15'));
  assert.equal(s.ledger.length, 0);
  assert.equal(s.streak, 4);
  assert.equal(E.isSetupMode(s), true);
});

test('toggle rejects goals not active today', () => {
  const s = setup(THREE);
  E.settle(s, at('2026-10-11'));
  const { goal } = E.addGoal(s, { name: 'Later' }, at('2026-10-11'));
  assert.equal(E.toggleDone(s, goal.id, at('2026-10-11')).ok, false);
});

test('field cleaning: carry-over requires a target; bad values dropped', () => {
  const s = setup([{ name: '  Tidy  ', carryOverExtra: 5, unit: 'x', deadline: '9:30' }]);
  const g = s.goals[0];
  assert.equal(g.name, 'Tidy');
  assert.equal(g.carryOverExtra, null);
  assert.equal(g.unit, null);
  assert.equal(g.deadline, null);
  assert.equal(E.addGoal(s, { name: '   ' }, at('2026-10-10')).ok, false);
});

test('validateState', () => {
  assert.equal(E.validateState(E.newState(at('2026-10-10'))), true);
  assert.equal(E.validateState({}), false);
  assert.equal(E.validateState(null), false);
});
