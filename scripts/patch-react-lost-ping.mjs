#!/usr/bin/env node
/**
 * Fixes a React bug in the React DOM that Next.js 15.5.x vendors
 * (19.2.0-canary-0bdb9206-20250818): a "ping" that fires *during* a render is
 * dropped, leaving a transition suspended forever.
 *
 * Symptom in this app (production builds only, intermittent): client
 * navigations — e.g. /contacts/[id]/edit → /contacts/[id], server-action
 * redirects, router.refresh() after form actions — never finish. The RSC
 * response arrives, but React never commits it.
 *
 * Mechanism: React suspends on an RSC row that hasn't streamed in yet. When it
 * resumes, the row's data has arrived but isn't parsed (status
 * "resolved_model"), so React attaches a ping listener via thenable.then().
 * The Flight chunk parses synchronously inside .then() and calls the ping
 * immediately — during the render. pingSuspendedRoot() only handled that case
 * outside a render, so the ping is lost and markRootSuspended() parks the
 * transition lanes with nothing left to wake them.
 *
 * Upstream React (react-dom ≥ 19.3, vendored by Next.js ≥ 16) records the ping:
 *   ? 0 === (executionContext & 2)
 *     ? prepareFreshStack(root, 0)
 *     : (workInProgressRootPingedLanes |= pingedLanes)
 * This script applies exactly that change to Next's vendored copies.
 * Delete it (and the "postinstall" entry) when upgrading to Next.js 16.
 *
 * webpack caches node_modules by package version, so an existing .next/cache
 * would keep serving the old code. next.config.ts bumps webpack's cache
 * version ("react-lost-ping-v1") to invalidate it once, locally and on Vercel.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const nextDir = dirname(require.resolve('next/package.json'));
const nextVersion = JSON.parse(readFileSync(join(nextDir, 'package.json'), 'utf8')).version;

const BUGGY = /\?\s*0 === \(executionContext & 2\) && prepareFreshStack\(root, 0\)(\s*):(\s*)\(workInProgressRootPingedLanes \|= pingedLanes\)/g;
const FIXED_MARKER = '/* patched: keep pings that happen during render */';

let patched = 0;
let alreadyFixed = 0;
for (const pkg of ['react-dom', 'react-dom-experimental']) {
  const cjs = join(nextDir, 'dist', 'compiled', pkg, 'cjs');
  if (!existsSync(cjs)) continue;
  for (const file of readdirSync(cjs).filter((f) => f.endsWith('.js'))) {
    const path = join(cjs, file);
    const src = readFileSync(path, 'utf8');
    if (src.includes(FIXED_MARKER)) {
      alreadyFixed++;
      continue;
    }
    const matches = src.match(BUGGY);
    if (!matches) continue;
    const out = src.replace(
      BUGGY,
      (_m, ws1, ws2) =>
        `? 0 === (executionContext & 2)${ws1}? prepareFreshStack(root, 0)${ws1}: (workInProgressRootPingedLanes |= pingedLanes) ${FIXED_MARKER}${ws1}:${ws2}(workInProgressRootPingedLanes |= pingedLanes)`,
    );
    writeFileSync(path, out);
    patched += matches.length;
    console.log(`[patch-react-lost-ping] patched ${pkg}/cjs/${file}`);
  }
}

if (patched > 0) {
  console.log(`[patch-react-lost-ping] applied ${patched} fix(es) to next@${nextVersion}.`);
} else if (alreadyFixed > 0) {
  console.log(`[patch-react-lost-ping] next@${nextVersion} already patched.`);
} else if (/^1[6-9]\./.test(nextVersion) || /^[2-9]\d\./.test(nextVersion)) {
  console.log(`[patch-react-lost-ping] next@${nextVersion} ships the upstream fix — remove this script and its postinstall entry.`);
} else {
  console.error(
    `[patch-react-lost-ping] could not find the code to patch in next@${nextVersion}. ` +
      'Check whether this version still has the lost-ping bug (see the header of this script).',
  );
  process.exit(1);
}
