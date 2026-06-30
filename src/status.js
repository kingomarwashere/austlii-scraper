// Shared scraper status — written by index.js, read by viewer.js
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const STATUS_FILE = join(dirname(fileURLToPath(import.meta.url)), '../data/scrape-status.json');

const DEFAULT = {
  running:         false,
  phase:           'idle',
  currentFeed:     null,
  feedsDone:       0,
  feedsTotal:      0,
  newThisRun:      0,
  foundThisRun:    0,
  failedThisRun:   0,
  runCount:        0,
  lastStartedAt:   null,
  lastCompletedAt: null,
  nextRunAt:       null,
  daemonPid:       null,
};

export function writeStatus(patch) {
  try {
    const current = readStatus();
    writeFileSync(STATUS_FILE, JSON.stringify({ ...current, ...patch }, null, 2));
  } catch {}
}

export function readStatus() {
  try {
    return { ...DEFAULT, ...JSON.parse(readFileSync(STATUS_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULT };
  }
}
