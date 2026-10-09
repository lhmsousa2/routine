// Persistence: localStorage on the device, plus JSON backup export/import.
import { newState, validateState, migrate } from './engine.js';

// Debug mode (?debug) uses its own key so time-travel testing never touches real data.
const KEY = new URLSearchParams(location.search).has('debug') ? 'routine.state.debug' : 'routine.state.v1';

// Returns { state, recovered } — recovered is true if unreadable data was found and set aside.
export function load(now) {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (e) {
    console.error('Could not read saved data', e);
  }
  if (raw) {
    try {
      const s = migrate(JSON.parse(raw));
      if (validateState(s)) return { state: s, recovered: false };
    } catch {
      /* fall through */
    }
    // Never silently overwrite data we couldn't read: keep the raw copy aside.
    try {
      localStorage.setItem(`${KEY}.unreadable.${Date.now()}`, raw);
    } catch {
      /* storage full: nothing more we can do */
    }
    return { state: newState(now), recovered: true };
  }
  return { state: newState(now), recovered: false };
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Could not save', e);
    return false;
  }
}

// Keep a copy of the current data before it gets replaced (import, erase).
export function keepSafetyCopy(state, label) {
  try {
    localStorage.setItem(`${KEY}.before-${label}`, JSON.stringify(state));
  } catch {
    /* best effort */
  }
}

// Ask the browser not to evict our data under storage pressure (best effort).
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}

export async function exportBackup(state, dateLabel) {
  const name = `routine-backup-${dateLabel}.json`;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  // On iPhone this opens the share sheet (Save to Files, AirDrop, etc.).
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
      throw new Error('Could not open the share sheet. Try again.');
    }
  }
  // Desktop browsers: plain download.
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

export async function readBackup(file) {
  const text = await file.text();
  let s;
  try {
    s = migrate(JSON.parse(text));
  } catch {
    throw new Error('That file is not a valid backup (not JSON).');
  }
  if (!validateState(s)) throw new Error('That file is not a routine backup, or it is damaged.');
  return s;
}
