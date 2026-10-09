// Persistence: localStorage on the device, plus JSON backup export/import.
import { newState, validateState } from './engine.js';

const KEY = 'routine.state.v1';

export function load(now) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (validateState(s)) return s;
      console.warn('Stored state invalid; starting fresh');
    }
  } catch (e) {
    console.error('Could not read saved data', e);
  }
  return newState(now);
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
    }
  }
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
    s = JSON.parse(text);
  } catch {
    throw new Error('That file is not a valid backup (not JSON).');
  }
  if (!validateState(s)) throw new Error('That file is not a routine backup, or it is from an incompatible version.');
  return s;
}
