/**
 * AustLII Scraper Daemon — runs scrape cycles forever.
 *
 * Each cycle:
 *   1. Spawn node src/index.js --once
 *   2. Wait INTERVAL hours
 *   3. Repeat
 *
 * Handles crashes with 5min backoff.
 * SIGUSR1 = restart immediately (triggered by the GUI restart button).
 *
 * Run: npm run daemon
 */
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeStatus, readStatus } from './status.js';

const __dir  = dirname(fileURLToPath(import.meta.url));
const NODE   = process.execPath;
const SCRIPT = join(__dir, 'index.js');

const INTERVAL_MS   = 6 * 60 * 60 * 1000;
const CRASH_BACKOFF = 5 * 60 * 1000;

let currentChild  = null;
let restartNow    = false; // set true by SIGUSR1
let sleepResolve  = null;  // lets us abort the inter-run sleep early

function log(msg) {
  console.log(`[daemon ${new Date().toISOString()}] ${msg}`);
}

// Write daemon PID so viewer can signal us
writeStatus({ daemonPid: process.pid });

// SIGUSR1 = "restart now" from the GUI button
process.on('SIGUSR1', () => {
  log('SIGUSR1 received — restarting scraper immediately.');
  restartNow = true;
  if (currentChild) {
    currentChild.kill('SIGTERM'); // abort current run → loop will restart
  }
  if (sleepResolve) {
    sleepResolve();               // abort inter-run sleep → loop will restart
    sleepResolve = null;
  }
});

function runScraper() {
  return new Promise((resolve, reject) => {
    log(`Starting scrape cycle #${(readStatus().runCount || 0) + 1}`);

    currentChild = spawn(NODE, [SCRIPT, '--once'], {
      cwd: join(__dir, '..'),
      stdio: 'inherit',
    });

    currentChild.on('close', (code, signal) => {
      currentChild = null;
      if (restartNow || code === 0) {
        restartNow = false;
        resolve();
      } else {
        reject(new Error(`Scraper exited with code ${code} signal ${signal}`));
      }
    });

    currentChild.on('error', err => { currentChild = null; reject(err); });
  });
}

function interruptibleDelay(ms) {
  return new Promise(resolve => {
    sleepResolve = resolve;
    setTimeout(() => { sleepResolve = null; resolve(); }, ms);
  });
}

function fmtMs(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

log(`AustLII daemon starting (PID ${process.pid}). Interval: 6h. Send SIGUSR1 to restart early.\n`);

while (true) {
  try {
    await runScraper();
    const nextAt = new Date(Date.now() + INTERVAL_MS);
    writeStatus({ running: false, phase: 'waiting', nextRunAt: nextAt.toISOString() });
    log(`Done. Next run at ${nextAt.toLocaleTimeString()} (${fmtMs(INTERVAL_MS)}). Sleeping…\n`);
    await interruptibleDelay(INTERVAL_MS);
  } catch (e) {
    log(`Scraper crashed: ${e.message}`);
    writeStatus({ running: false, phase: 'crashed', currentFeed: null, nextRunAt: new Date(Date.now() + CRASH_BACKOFF).toISOString() });
    log(`Retrying in ${fmtMs(CRASH_BACKOFF)}…\n`);
    await interruptibleDelay(CRASH_BACKOFF);
  }
}
