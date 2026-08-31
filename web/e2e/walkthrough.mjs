// Auto-recorded product walkthrough — drives the running app through the demo beats headlessly and
// records a video (no flaky manual capture). Convert the .webm to a GIF with ffmpeg for the README.
//
// Prereq: all four services up (DB :5432, ML :8899, API :8787, web :5173).
// Run:    cd web && node e2e/walkthrough.mjs   →   e2e/videos/*.webm
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5173';
const DIR = 'e2e/videos';
const SESSION = JSON.stringify({ name: 'Demo Reviewer', email: 'teamcipher04@gmail.com', provider: 'email' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: DIR, size: { width: 1440, height: 900 } },
  deviceScaleFactor: 1,
});
// Seed the session BEFORE the app loads so the dashboard is reachable on first paint.
await ctx.addInitScript((s) => { try { localStorage.setItem('sentinel.session', s); } catch (e) {} }, SESSION);
const page = await ctx.newPage();

async function beat(path, { dwell = 2600, scrolls = [] } = {}) {
  await page.goto(BASE + path, { waitUntil: 'load' });
  await sleep(1100); // let panels fetch + charts settle
  for (const y of scrolls) {
    await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'smooth' }), y);
    await sleep(1000);
  }
  await sleep(dwell);
}

await beat('/', { dwell: 2600 });                                  // landing — brand + thesis
await beat('/app', { dwell: 2200, scrolls: [380, 860] });          // overview — measured impact + ROI
await beat('/app/model', { dwell: 2400, scrolls: [0, 480] });      // causal uplift + external validity
await beat('/app/compliance', { dwell: 2600, scrolls: [0, 520] }); // red-team + message fact-check
await beat('/app/evidence', { dwell: 2600, scrolls: [0, 560] });   // real capture + tamper forensics
await beat('/app/rigor', { dwell: 2600 });                         // 15/15 rigor scorecard

await sleep(500);
await ctx.close(); // flushes the video to disk
await browser.close();

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.webm')).sort();
console.log('WROTE', files.map((f) => `${DIR}/${f}`).join(', '));
