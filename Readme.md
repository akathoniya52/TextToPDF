# ✦ TextToPDF

A fast, private web app that converts pasted text or `.txt` / `.md` / `.log` files into a **styled PDF** — with full control over page size, orientation, margins, fonts, line spacing, lists, headings, page numbers, watermarks and more.

Built with plain **HTML, CSS, and JavaScript** + [pdfmake](https://pdfmake.github.io) (MIT) loaded from CDN with a vendored offline copy. No backend, no accounts, no uploads — **the PDF is generated entirely inside your browser tab.**

## ✨ Features

**Text in (all optional, all local)**
- Paste directly or **drag & drop / open a file** (`.txt`, `.md`, `.log`, `.csv`), with an encoding override (UTF-8, Latin-1, Windows-125x, Shift_JIS, GBK, Big5, EUC-KR, UTF-16) for legacy files
- Live **line / word / char counters** and a one-click sample document
- Optional **cleanup pass** (off by default; your characters are never rewritten silently) with per-rule counts: smart quotes → straight, em/en dashes → `-`, `…` → `...`, NBSP → space, strip trailing whitespace, collapse 3+ blank lines

**Page setup (the features OS "print to PDF" lacks)**
- Paper sizes **A4 / Letter / Legal / A3 / A5 / Custom (mm)**, portrait or landscape
- **Margins 0–60 mm** (slider + number), **line spacing** 1.0 / 1.15 / 1.5 / 2.0
- **1–3 column layouts** (balanced column chunking via an invisible pdfmake table)
- Fonts: **Sans (Roboto)** / **Serif (Times)** / **Mono (Courier)**, size 8–28 pt
- **Mono "keep columns as printed"** mode — preserves space-aligned log/code tables by auto-shrinking the font instead of wrapping (tabs normalised to 8-column stops)

**Formatting (opt-in)**
- **Light Markdown pass**: `#` headings, `-` / `1.` lists, inline `**bold**`, `*italic*`, `` `code` ``
- **Heading detection** without Markdown: ALL-CAPS lines, and lines underlined by `===` / `---`

**Output & workflow**
- **Download PDF**, **in-page preview** (embedded viewer), **open in a new tab**, and **Share PDF** (`navigator.share` with files, falls back to download)
- **Page numbers** ("Page X of Y" footer), **line numbers**, optional repeated **header text**
- **Watermark** (e.g. `DRAFT`) baked into every page
- **PDF metadata** — title & author written into the file so readers show a proper document name
- Output **file name** picker with sanitising; auto-filled from the loaded file's name
- Presets: **📄 Document · 🧾 Log file · 💻 Code listing · ↧ Compact**
- Dark / light theme (follows system, switchable), **session autosave** in `localStorage`, "Start over" reset
- Keyboard shortcut: `Ctrl/⌘ + Enter` downloads the PDF

**Honest-engine safety net**
- Detects characters the chosen font can't draw (Arabic, Devanagari, CJK, emoji, box-drawing art…) **before** you download and offers a **system "Print → Save as PDF" fallback** that uses your browser's own fonts (still 100% offline) — no silent `□□□` mojibake
- Privacy-safe **self-tests**: 26 engine + 12 UI-integration assertions, runnable from the footer link (or `?selftest` in the URL), plus a permanent headless runner: `node test/run-tests.js` (47 checks across file/theme/app suites)

- Responsive layout for desktop and mobile, accessible labels, focus states and live regions

## 🔒 Privacy model

- No server component at all: text → PDF conversion happens **in your browser** via JavaScript
- No analytics, no tracking, no accounts, no cookies
- Everything you type is saved only in your browser's `localStorage` (and only until you hit *Start over*)
- The PDF library (pdfmake + Roboto + standard-14 fonts) loads from cdnjs once; if you're offline, the app transparently falls back to the vendored copies in `vendor/`

## 🛠️ Tech Stack

- **HTML5** — single-page app, no build step
- **CSS3** — custom properties theming, responsive grid
- **Vanilla JavaScript** — layout engine built on **pdfmake 0.3.3** (MIT), promise-based `createPdf(...).getBlob()` / `.download()` APIs
- **Fonts** — Roboto (VFS) + standard-14 Times/Courier/Helvetica (auto-registering bundles)

## 📁 Project Structure

```text
TextToPDF/
│
├── index.html                 — the complete app (UI, styles, layout engine, self-tests)
├── plan.md                    — researched feature roadmap & status board
├── Readme.md
├── test/
│   └── run-tests.js           — headless test runner: node test/run-tests.js (no dependencies)
└── vendor/                    — offline fallback copies of pdfmake + fonts (plan 4.4)
    ├── pdfmake.min.js
    ├── vfs_fonts.min.js
    ├── Helvetica.min.js
    ├── Times.min.js
    └── Courier.min.js
```

## 🧪 Testing

Three layers, all dependency-free (plain Node ≥ 18):

1. **Run everything headless:** `node test/run-tests.js` — 47 checks: static file contracts (5 CDN scripts, 3 inline blocks compile, every referenced element id exists, dark-theme CSS variable completeness, vendor integrity), the theme head-script against system/saved/garbage storage, and the real app bootstrapped against a DOM stub running the app's own engine + UI suites (theme toggle flip + persistence, counters, cleanup chip, presets, generation, preview, file-drop, reset).
2. **In the browser:** footer → *Run self-tests* (or open with `?selftest`). 26 engine + 12 UI assertions; harness-only tests self-skip in real browsers. Chrome headless verified: 37 passed · 0 failed with the theme applied before first paint.
3. **Engine + real PDF smoke:** vendored pdfmake was exercised in Node to confirm real PDF output (std-14 fonts 2.6 KB; Roboto with embedded TTF `/FontFile`).

## 🚀 Getting Started

1. Open `index.html` in any modern browser (double-click it — everything runs locally)
2. Paste text or drop a file
3. Tweak Page setup → Font → Formatting → Output as needed
4. Hit **Download PDF** (`Ctrl/⌘+Enter`) or **Preview PDF** first

To refresh or verify the vendored library:

```bash
cd vendor
curl -O https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.3.3/pdfmake.min.js
curl -O https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.3.3/vfs_fonts.min.js
curl -o Helvetica.min.js https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.3.3/standard-fonts/Helvetica.min.js
curl -o Times.min.js     https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.3.3/standard-fonts/Times.min.js
curl -o Courier.min.js   https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.3.3/standard-fonts/Courier.min.js
```

**Known limitation (honest engine):** the bundled fonts cover Latin/Greek/Cyrillic (Roboto) or ~ANSI (Times/Courier/Helvetica). For Arabic, Hindi, CJK, emoji etc. use the built-in system "Save as PDF" fallback — pdfmake needs per-script TTF subsets and (for Arabic) a shaping fork; see `plan.md` P3 ideas.

## 🗺️ Roadmap

See [`plan.md`](plan.md) — the researched, phased feature backlog with status. Next ideas: PWA install, batch conversion (folder → many PDFs / one merged PDF), PDF merge & password protection, custom font uploads, script-specific font loaders.

*Written: 2026-11-01.*
