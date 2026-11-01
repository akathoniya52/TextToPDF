#!/usr/bin/env node
'use strict';
/* ============================================================
   TextToPDF — doc link checker (plan 4.5: "validate links")
   Dependency-free. Scans every git-tracked .md file and checks
   each relative markdown link target:

     exists on disk + tracked by git  → ✅ ok
     exists, but NOT tracked          → ⚠️  warn (works locally,
                                          invisible in CI/Pages)
     NOT on disk, but tracked         → ❌ fail (deleted file still
                                          referenced)
     NOT on disk, not tracked         → ⚠️  skip (local-only file,
                                          e.g. gitignored plan.md)
   External URLs, mailto:, data:, and #anchors are ignored.

   Exits non-zero if any ❌.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let problems = 0;
let warnings = 0;
let checked = 0;

function git(args, fallback) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    return fallback;
  }
}

/* every .md file the repo tracks — in CI that's all there is */
const mdFiles = git(['ls-files', '--', '*.md'], '').split('\n').map(s => s.trim()).filter(Boolean);
const files = mdFiles.length ? mdFiles : ['Readme.md'];

/* every tracked path (for "is this in the repo?" membership tests) */
const tracked = new Set(
  git(['ls-files'], '').split('\n').map(s => s.trim()).filter(Boolean)
);

for (const file of files) {
  if (!fs.existsSync(file)) continue; // stale ls-files edge case
  const base = path.dirname(file);
  const text = fs.readFileSync(file, 'utf8');
  const links = text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);

  for (const m of links) {
    const raw = m[1].trim().split(/\s+/)[0]; // first token = URL
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue; // http:, mailto:, data: …
    const target = raw.split('#')[0];              // drop anchor
    if (!target || target.startsWith('#')) continue;

    checked++;
    const onDisk = fs.existsSync(path.join(base, target));
    const inRepo = tracked.has(target) || tracked.has(target.replace(/\/$/, ''));

    if (onDisk && inRepo) {
      console.log(`ok   ${file} → ${target}`);
    } else if (onDisk && !inRepo) {
      warnings++;
      console.log(`warn ${file} → ${target} (exists locally but is NOT tracked by git)`+
                  ` — invisible in CI/Pages`);
    } else if (!onDisk && inRepo) {
      problems++;
      console.log(`FAIL ${file} → ${target} (tracked but missing — deleted file still linked)`);
    } else {
      warnings++;
      console.log(`skip ${file} → ${target} (local-only/not tracked — fine outside the repo)`);
    }
  }
}

console.log(`\nLink audit: ${checked} checked · ${warnings} warnings · ${problems} failures`);
if (problems > 0) process.exitCode = 1;
