/* ============================================================
   TextToPDF — headless test runner (plan 4.1, dependency-free)
   Run:  node test/run-tests.js
   What it does, in order:
   1) Static file checks: CDN scripts present, inline blocks compile,
      every JS-referenced element id exists in the HTML, both theme
      CSS blocks define the full custom-property set, vendor/ files
      are intact.
   2) Theme head-script checks: system-preference resolution and
      saved-theme override, evaluated against the real head block.
   3) Evaluates the REAL app script against a faithful DOM stub
      (captured listeners, clicks, storage) and runs the app's own
      engine + UI suites (runSelfTests).
   Exits non-zero if any test fails.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const results = [];
let pass = 0, fail = 0, skip = 0;
const ok = (c, m) => { if (!c) throw new Error(m || 'assert failed'); };
const eq = (a, b, m) => ok(a === b, `${m || ''} (${JSON.stringify(a)} !== ${JSON.stringify(b)})`);
const record = async (name, fn) => {
  try {
    const r = await fn();
    if (r === 'skip') { skip++; results.push(`⏭️  ${name}`); }
    else { pass++; results.push(`✅ ${name}`); }
  } catch (e) { fail++; results.push(`❌ ${name} — ${e && e.message ? e.message : e}`); }
};

(async () => {
  /* ---------- 1. static checks ---------- */
  await record('static: five CDN scripts wired', async () => {
    const srcs = [...html.matchAll(/<script src="([^"]+)"[^>]*>/g)].map(m => m[1]);
    const cdn = srcs.filter(s => s.startsWith('https://cdnjs.cloudflare.com'));
    eq(cdn.length, 5, `expected 5 cdnjs scripts, got ${cdn.length}: ${cdn.join(' | ')}`);
    ok(cdn.some(s => s.includes('pdfmake.min.js')), 'pdfmake missing');
    ok(cdn.some(s => s.includes('vfs_fonts.min.js')), 'vfs_fonts missing');
    eq(cdn.filter(s => s.includes('standard-fonts/')).length, 3, 'standard-14 bundles missing');
  });

  await record('static: inline blocks compile', async () => {
    const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    eq(blocks.length, 3, `expected head-theme + loader + app, got ${blocks.length}`);
    this.blocks = blocks; // shared with step 3
    for (const b of blocks) new vm.Script(b); // throws on syntax error
    ok(blocks[2].includes('buildDocDefinition'), 'app block not where expected');
  });

  await record('static: every statically referenced element id exists', async () => {
    const idsInHtml = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    const app = this.blocks[2];
    const referenced = new Set();
    for (const m of app.matchAll(/\$\('([A-Za-z][\w]*)'\)/g)) referenced.add(m[1]);
    for (const m of app.matchAll(/\['(\w+)', '(?:change|input)'\]/g)) referenced.add(m[1]);
    for (const m of app.matchAll(/\(\$\(`cleanup\$\{[^`]+\}'?/g)) referenced.add('cleanupDashes'); // dynamic ids: spot-structure
    const missing = [...referenced].filter(id => !idsInHtml.has(id));
    eq(missing.join(','), '', 'missing ids in HTML');
    ok(referenced.size > 25, `suspiciously few ids matched (${referenced.size})`);
  });

  await record('static: dark theme CSS defines the full variable set', async () => {
    const root = html.match(/:root\{([\s\S]*?)\n  \}/)[1];
    const dark = html.match(/\[data-theme="dark"\]\{([\s\S]*?)\n  \}/)[1];
    const needed = ['--bg', '--panel', '--panel2', '--text', '--muted', '--accent', '--accent-ink',
      '--ok', '--warn-ink', '--warn-bg', '--border', '--shadow'];
    const rootVars = new Set([...root.matchAll(/--[\w-]+/g)].map(m => m[0]));
    const darkVars = new Set([...dark.matchAll(/--[\w-]+/g)].map(m => m[0]));
    const missingDark = needed.filter(v => !darkVars.has(v));
    eq(missingDark.join(','), '', 'dark theme missing variables');
    for (const v of needed) ok(rootVars.has(v), `:root missing ${v}`);
  });

  await record('static: offline vendor files intact', async () => {
    const read = (f) => fs.readFileSync(path.join(ROOT, 'vendor', f), 'utf8').slice(0, 200);
    ok(read('pdfmake.min.js').includes('pdfmake v0.3.3'), 'pdfmake build mismatch');
    ok(read('vfs_fonts.min.js').includes('var vfs='), 'vfs_fonts shape changed');
    for (const f of ['Helvetica.min.js', 'Times.min.js', 'Courier.min.js'])
      ok(read(f).includes('var fontContainer='), `${f} shape changed`);
  });

  /* ---------- 2. head theme script (real block, mocked env) ---------- */
  const headBlock = this.blocks[0];
  const stub = getStubEnvironment();
  await record('theme head-script: system dark → dark on first paint', () => {
    stub.store.clear();
    stub.setPrefersDark(true);
    document.documentElement.removeAttribute('data-theme');
    vm.runInThisContext(headBlock);
    eq(document.documentElement.getAttribute('data-theme'), 'dark');
  });
  await record('theme head-script: saved light beats system dark', () => {
    stub.store.set('textTopdf.v1', JSON.stringify({ opts: { theme: 'light' }, text: '' }));
    stub.setPrefersDark(true);
    document.documentElement.removeAttribute('data-theme');
    vm.runInThisContext(headBlock);
    eq(document.documentElement.getAttribute('data-theme'), 'light');
  });
  await record('theme head-script: garbage storage falls back to system', () => {
    stub.store.set('textTopdf.v1', 'not-json-{{{');
    stub.setPrefersDark(false);
    document.documentElement.removeAttribute('data-theme');
    vm.runInThisContext(headBlock);
    eq(document.documentElement.getAttribute('data-theme'), 'light');
  });

  /* ---------- 3. run the real app + its own suites ---------- */
  // stub pdfmake so the loader block would be skipped and generation paths work
  globalThis.pdfMake = {
    fonts: { Roboto: {}, Times: {}, Courier: {}, Helvetica: {} },
    vfs: {},
    createPdf: () => ({
      // shape-compatible with what producePdf()/handlePreview() need (no native Blob → Node-version-safe)
      getBlob: async () => ({ size: 2048, type: 'application/pdf' }),
      download: async () => {}, open: (w) => w, getDataUrl: async () => 'data:'
    })
  };
  // offline loader is intentionally NOT executed (it calls document.write); assert it statically
  await record('loader: references vendored fallbacks', async () => {
    ok(this.blocks[1].includes('vendor/pdfmake.min.js'), 'loader missing vendored pdfmake');
    ok(this.blocks[1].includes('vendor/vfs_fonts.min.js'), 'loader missing vendored vfs');
  });

  vm.runInThisContext(this.blocks[2]); // boots the real app against the stub DOM
  // Expose the app's own engine+UI suite results to this runner (runSelfTests is async).
  vm.runInThisContext('globalThis.__APP_RESULTS_PROMISE = runSelfTests();');
  const appResults = await globalThis.__APP_RESULTS_PROMISE;
  if (!appResults) throw new Error('app self-tests produced no results');
  results.push(...appResults.text.split('\n').map(l => l));
  pass += appResults.pass; fail += appResults.fail; skip += appResults.skip;

  results.push('', `TOTAL: ${pass} passed · ${skip} skipped · ${fail} failed`);
  process.exitCode = fail > 0 ? 1 : 0;
  console.log(results.join('\n'));
})().catch(e => {
  console.error('Test runner crashed:', e);
  process.exitCode = 1;
});

/* ---------- faithful DOM/browser stub ---------- */
function getStubEnvironment() {
  const { TextEncoder } = require('util');

  function El(tag) {
    this.tag = tag || 'el';
    this.value = ''; this.checked = false; this.hidden = false; this.disabled = false;
    this.dataset = {}; this.attrs = {}; this.listeners = {};
    this.textContent = ''; this.innerHTML = ''; this.className = '';
    this.files = null;
    this.classList = {
      add: (c) => this.attrs['class:' + c] = true,
      remove: (c) => delete this.attrs['class:' + c],
      toggle: (c, f) => {
        if (f === undefined) { this.attrs['class:' + c] ? delete this.attrs['class:' + c] : (this.attrs['class:' + c] = true); }
        else { f ? (this.attrs['class:' + c] = true) : delete this.attrs['class:' + c]; }
      },
      contains: (c) => !!this.attrs['class:' + c]
    };
  }
  El.prototype.addEventListener = function (ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); };
  El.prototype.removeEventListener = function (ev, fn) {
    const a = this.listeners[ev] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  };
  El.prototype.fire = function (ev, props) {
    const e = Object.assign({ preventDefault() {}, stopPropagation() {}, type: ev, target: this }, props || {});
    for (const fn of this.listeners[ev] || []) fn(e);
  };
  El.prototype.click = function () { this.fire('click'); };
  El.prototype.dispatchEvent = function (e) { this.fire(e.type, e); }; // node lacks native Event; UI tests use new Event()
  const attr = (self, key, val) => self.attrs[key] = val;
  El.prototype.setAttribute = function (k, v) { attr(this, k, String(v)); };
  El.prototype.getAttribute = function (k) { const v = this.attrs[k]; return v === undefined ? null : v; };
  El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
  El.prototype.focus = function () {};
  El.prototype.removeChild = function () {};
  El.prototype.appendChild = function () {};
  El.prototype.remove = function () {};

  const els = new Map();
  const presetEls = ['document', 'log', 'code', 'compact'].map(p => {
    const b = new El('button'); b.dataset.preset = p; return b;
  });

  const store = new Map();
  let prefersDark = false;
  globalThis.window = globalThis;   // alias early: the app mixes bare and window. references
  window.__T2P_HARNESS = true;
  globalThis.matchMedia = (q) => ({ matches: q.includes('prefers-color-scheme: dark') ? prefersDark : false });

  globalThis.Event = class Event { constructor(type) { this.type = type; } };

  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(f) {
      const bytes = new TextEncoder().encode(f.__text || '');
      // simulate a successful read: fire onload on the next macrotask (app assigns onload/onerror before calling)
      setTimeout(() => { this.result = bytes; if (this.onload) this.onload(); }, 0);
    }
  };

  globalThis.document = {
    __els: els,
    getElementById(id) { if (!els.has(id)) els.set(id, new El()); return els.get(id); },
    createElement: () => new El(),
    documentElement: new El('html'),
    body: new El('body'),
    addEventListener() {},
    querySelectorAll(sel) { return sel.includes('data-preset') ? presetEls : []; }
  };

  globalThis.localStorage = {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };

  globalThis.URL = globalThis.URL || {};
  let blobUrlSeq = 0;
  URL.createObjectURL = () => `blob:stub-${++blobUrlSeq}`;
  URL.revokeObjectURL = () => {};

  globalThis.location = { search: '' };
  if (!globalThis.navigator || !globalThis.navigator.userAgent) {
    try { Object.defineProperty(globalThis, 'navigator', { value: { canShare: null }, configurable: true, writable: true }); } catch (e) {}
  }

  // expose the store + controller to the runner
  return {
    store,
    setPrefersDark(v) { prefersDark = v; }
  };
}
