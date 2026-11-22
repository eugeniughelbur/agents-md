#!/usr/bin/env node
'use strict';

/**
 * agents-md — generate and safely maintain an AGENTS.md for the current repo.
 * Zero dependencies. Never fabricates (unknowns become stubs). Re-runs only touch
 * the regions it generated (HTML-comment markers) and never clobber human edits.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const SECTIONS = [
  'overview', 'commands', 'testing', 'structure',
  'conventions', 'git', 'gotchas', 'security', 'boundaries',
];
const TITLES = {
  overview: 'Overview', commands: 'Commands', testing: 'Testing', structure: 'Project structure',
  conventions: 'Code style & conventions', git: 'Git & PR workflow', gotchas: 'Gotchas & hard-won lessons',
  security: 'Security & secrets', boundaries: 'Boundaries',
};
// The begin marker carries a fingerprint of what this tool wrote, so a re-run can
// tell an untouched region (refresh it) from one a human edited (keep it).
const begin = (id, sha) => `<!-- agents-md:begin id=${id}${sha ? ` sha=${sha}` : ''} -->`;
const end = (id) => `<!-- agents-md:end id=${id} -->`;
const STUB = (what) => `_TBD: ${what}_`;
const norm = (text) => text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trim();
const fingerprint = (text) => crypto.createHash('sha256').update(norm(text)).digest('hex').slice(0, 12);

// ---------- tiny helpers ----------
function sh(cmd) {
  try { return cp.execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return ''; }
}
function readIf(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function jsonIf(p) { const t = readIf(p); if (!t) return null; try { return JSON.parse(t); } catch { return null; } }
function has(root, f) { return fs.existsSync(path.join(root, f)); }
function tomlString(text, key) {
  const m = text && text.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'));
  return m ? m[1] : '';
}
// Task names from a pixi [tasks] / [tool.pixi.tasks] table or [tasks.<name>] subtables.
function pixiTasks(text) {
  const names = [];
  let inTasks = false;
  for (const line of (text || '').split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) {
      const sub = line.match(/^\s*\[(?:tool\.pixi\.)?tasks\.([A-Za-z0-9_-]+)\]\s*$/);
      if (sub) names.push(sub[1]);
      inTasks = /^\s*\[(?:tool\.pixi\.)?tasks\]\s*$/.test(line);
      continue;
    }
    const m = inTasks && line.match(/^\s*"?([A-Za-z0-9_-]+)"?\s*=/);
    if (m) names.push(m[1]);
  }
  return names;
}

// ---------- does Claude Code read this AGENTS.md? ----------
// Claude Code (v2.1.277+) reads AGENTS.md only when no CLAUDE.md, .claude/CLAUDE.md or
// CLAUDE.local.md exists in the folder or any folder above it (~/.claude/CLAUDE.md does
// not count). Any of those files wins silently. A CLAUDE.md -> AGENTS.md symlink or an
// `@AGENTS.md` import line brings it back.
// Source: https://code.claude.com/docs/en/memory (AGENTS.md section).
const CLAUDE_FILES = ['CLAUDE.md', path.join('.claude', 'CLAUDE.md'), 'CLAUDE.local.md'];
const CODEX_LIMIT = 32 * 1024; // Codex default project_doc_max_bytes
// The six areas GitHub's study of 2,500+ AGENTS.md files found in the files that work.
const AREAS = [
  ['commands', /command|build|install|setup|run|script/i],
  ['testing', /test/i],
  ['project structure', /structure|layout|architecture|director|map of/i],
  ['code style', /style|convention|lint|format/i],
  ['git workflow', /git|commit|pull request|\bprs?\b|branch|release/i],
  ['boundaries', /boundar|never|do not|don't|ask first|always|guardrail|safety/i],
];
const withoutFences = (t) => t.replace(/```[\s\S]*?```/g, '');
const importsIn = (text, ref) => text !== null && new RegExp(`^[ \\t]*@${ref}[ \\t]*$`, 'm').test(withoutFences(text));
const lineSet = (t) => new Set(t.split('\n').map((l) => l.trim()).filter(Boolean));

function claudeCheck(dir) {
  const r = { dir, agents: readIf(path.join(dir, 'AGENTS.md')), blockers: [], link: null };
  const claudePath = path.join(dir, 'CLAUDE.md');
  try { if (fs.lstatSync(claudePath).isSymbolicLink()) r.link = fs.readlinkSync(claudePath); } catch {}
  if (r.link && path.basename(r.link) === 'AGENTS.md') return Object.assign(r, { state: 'read', how: 'CLAUDE.md links to AGENTS.md' });

  const homeClaude = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    for (const f of CLAUDE_FILES) {
      const p = path.join(d, f);
      if (p !== homeClaude && fs.existsSync(p)) r.blockers.push(p);
    }
    if (path.dirname(d) === d) break;
  }
  if (!r.blockers.length) return Object.assign(r, { state: 'read', how: 'no CLAUDE.md' });

  const claude = readIf(claudePath);
  const here = '(?:\\./)?AGENTS\\.md';
  if (importsIn(claude, here) || importsIn(readIf(path.join(dir, 'CLAUDE.local.md')), here)
    || importsIn(readIf(path.join(dir, '.claude', 'CLAUDE.md')), '\\.\\./AGENTS\\.md')) {
    return Object.assign(r, { state: 'read', how: 'imported with @AGENTS.md' });
  }
  if (claude && r.agents) {
    const have = lineSet(claude);
    const want = [...lineSet(r.agents)];
    if (want.length && want.filter((l) => have.has(l)).length / want.length >= 0.9) return Object.assign(r, { state: 'same' });
  }
  const title = (r.agents || '').split('\n').find((l) => /^#\s/.test(l)) || '';
  if (/\bcodex\b/i.test(title) && !/claude/i.test(title)) return Object.assign(r, { state: 'codex' });
  return Object.assign(r, { state: 'skipped' });
}

function areaCheck(text) {
  const heads = text.split('\n').filter((l) => /^#{1,4}\s/.test(l));
  return AREAS.filter(([, re]) => !heads.some((h) => re.test(h))).map(([name]) => name);
}

function describe(r) {
  const rel = (p) => path.relative(r.dir, p) || p;
  if (r.state === 'read') return `reads AGENTS.md (${r.how})`;
  if (r.state === 'same') return 'skips AGENTS.md, but CLAUDE.md already holds the same text';
  if (r.state === 'codex') return 'skips AGENTS.md, which is titled for Codex only (likely on purpose)';
  return `SKIPS AGENTS.md: ${r.blockers.map(rel).join(', ')} wins`;
}

// Add `@AGENTS.md` to the top of CLAUDE.md (or create a CLAUDE.md holding only that line).
function fixClaude(r, dry) {
  if (r.state !== 'skipped') return null;
  const p = path.join(r.dir, 'CLAUDE.md');
  if (r.link) return `left CLAUDE.md alone: it links to ${r.link}, not AGENTS.md`;
  const old = readIf(p);
  if (!dry) fs.writeFileSync(p, old === null ? '@AGENTS.md\n' : `@AGENTS.md\n\n${old}`);
  return `${dry ? '[dry-run] would add' : 'added'} @AGENTS.md to the top of ${old === null ? 'a new ' : ''}CLAUDE.md`;
}

function findAgentDirs(start, depth = 4) {
  const skip = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'venv', '__pycache__', 'coverage']);
  const found = [];
  (function walk(d, left) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.name === 'AGENTS.md' && !e.isDirectory())) found.push(d);
    if (!left) return;
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && !skip.has(e.name)) walk(path.join(d, e.name), left - 1);
    }
  })(start, depth);
  return found.sort();
}

// --check / --scan / --fix-claude. Returns the exit code: 1 while Claude Code skips an AGENTS.md.
function audit({ dirs, scan, fix, dry, base }) {
  if (!dirs.length) { console.log(`agents-md: no AGENTS.md found under ${base}.`); return 0; }
  let skipping = 0;
  if (!scan) {
    let r = claudeCheck(dirs[0]);
    if (r.agents === null) { console.log(`agents-md: no AGENTS.md in ${dirs[0]}. Run agents-md to create one.`); return 0; }
    console.log(`agents-md check: ${dirs[0]}`);
    console.log(`- Claude Code: ${describe(r)}`);
    if (fix) {
      const did = fixClaude(r, dry);
      if (did) console.log(`  ${did}`);
      if (!dry) r = claudeCheck(dirs[0]);
    } else if (r.state === 'skipped') {
      console.log('  Fix: npx @eugeniughelbur/agents-md --fix-claude (adds @AGENTS.md to the top of CLAUDE.md)');
    }
    if (r.state === 'skipped') skipping++;
    const missing = areaCheck(r.agents);
    console.log(`- GitHub's 6 areas (judged by headings): ${6 - missing.length} of 6${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
    const stubs = (r.agents.match(/_TBD:/g) || []).length;
    if (stubs) console.log(`- Stubs left to fill: ${stubs}`);
    const kib = Buffer.byteLength(r.agents) / 1024;
    console.log(`- Size: ${kib.toFixed(1)} KiB${kib * 1024 > CODEX_LIMIT ? ' (over the 32 KiB Codex reads by default; it cuts the rest)' : ' (Codex reads up to 32 KiB by default)'}`);
    return skipping ? 1 : 0;
  }
  const label = { read: 'ok    ', same: 'same  ', codex: 'codex ', skipped: 'SKIPS ' };
  for (const dir of dirs) {
    let r = claudeCheck(dir);
    const missing = areaCheck(r.agents);
    console.log(`${label[r.state]} ${path.relative(base, dir) || '.'}  ${describe(r)}; areas ${6 - missing.length}/6`);
    if (fix) {
      const did = fixClaude(r, dry);
      if (did) console.log(`       ${did}`);
      if (!dry) r = claudeCheck(dir);
    }
    if (r.state === 'skipped') skipping++;
  }
  const fixedNote = fix && !dry ? ' after the fix' : '';
  console.log(`\nClaude Code skips AGENTS.md in ${skipping} of ${dirs.length} folders${fixedNote}.`);
  if (skipping && !fix) console.log('Fix them: add --fix-claude. Folders marked "same" or "codex" are left alone.');
  return skipping ? 1 : 0;
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
if (flag('-h') || flag('--help')) {
  console.log(`agents-md — generate/maintain AGENTS.md (the cross-tool agent standard)

Usage: agents-md [options]
  --dry-run       print what would change, write nothing
  --no-symlink    do not create the CLAUDE.md -> AGENTS.md symlink
  --check         check this repo: does Claude Code read AGENTS.md, which of
                  GitHub's 6 areas it covers, stubs left, size vs the Codex limit
  --scan [dir]    run the Claude Code check on every folder with an AGENTS.md
                  under dir (default: current folder, 4 levels deep)
  --fix-claude    where Claude Code skips AGENTS.md, add @AGENTS.md to the top
                  of CLAUDE.md (works with --check or --scan; try --dry-run first)
  -h, --help      this help

--check and --scan exit with 1 while Claude Code skips an AGENTS.md, so CI can catch it.

Safe by design: re-runs refresh only the marked regions; a handwritten AGENTS.md
with no markers is never overwritten (a AGENTS.generated.md is written instead).`);
  process.exit(0);
}
const DRY = flag('--dry-run');
const NO_SYMLINK = flag('--no-symlink');
const SCAN = flag('--scan');
const FIX = flag('--fix-claude');
const CHECK = flag('--check') || SCAN || FIX;
const startDir = process.cwd();

// ---------- locate repo ----------
const root = sh('git rev-parse --show-toplevel') || process.cwd();

if (CHECK) {
  const i = args.indexOf('--scan');
  const arg = SCAN && args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : '.';
  const base = SCAN ? path.resolve(startDir, arg) : root;
  process.exit(audit({ dirs: SCAN ? findAgentDirs(base) : [root], scan: SCAN, fix: FIX, dry: DRY, base }));
}
process.chdir(root);

// ---------- detect facts ----------
function detect() {
  const f = { root, name: path.basename(root) };
  const pkg = jsonIf(path.join(root, 'package.json'));
  f.pkg = pkg;
  const cargo = readIf(path.join(root, 'Cargo.toml'));
  const pyproject = readIf(path.join(root, 'pyproject.toml'));
  const pixi = readIf(path.join(root, 'pixi.toml'));

  // language / ecosystem. Other manifests win over package.json: Rust and Python
  // repos often keep a package.json for tooling only (prettier, commit hooks).
  if (cargo !== null) f.lang = 'rust';
  else if (pyproject !== null || pixi !== null || has(root, 'requirements.txt') || has(root, 'setup.py')) f.lang = 'python';
  else if (has(root, 'go.mod')) f.lang = 'go';
  else if (pkg) f.lang = 'node';
  else if (has(root, 'Gemfile')) f.lang = 'ruby';
  else if (has(root, 'composer.json')) f.lang = 'php';
  else f.lang = null;

  // package manager (node)
  f.pm = has(root, 'pnpm-lock.yaml') ? 'pnpm'
    : has(root, 'yarn.lock') ? 'yarn'
    : has(root, 'package-lock.json') ? 'npm'
    : pkg ? 'npm' : null;

  // pixi (conda-based environments and tasks)
  f.pixi = pixi !== null || /^\[tool\.pixi/m.test(pyproject || '');
  f.pixiTasks = pixiTasks(pixi).concat(pixiTasks(pyproject));
  if (f.lang === 'rust') f.desc = tomlString(cargo, 'description');
  if (f.lang === 'python') f.desc = tomlString(pyproject, 'description') || tomlString(pixi, 'description');

  // framework guess (node)
  if (pkg && f.lang === 'node') {
    const d = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    const guesses = ['next', 'react', 'vue', 'svelte', '@angular/core', 'express', 'fastify', 'nestjs', '@nestjs/core', 'vite', 'typescript'];
    f.frameworks = guesses.filter((g) => d[g]);
    f.scripts = pkg.scripts || {};
    f.desc = pkg.description || '';
  }

  // structure (top-level dirs, minus noise)
  const noise = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'out', 'target', 'vendor', '__pycache__', '.venv', 'venv', 'coverage', '.turbo', '.cache']);
  f.dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !noise.has(e.name) && !e.name.startsWith('.'))
    .map((e) => e.name).slice(0, 12);

  // git
  let def = sh('git symbolic-ref --short refs/remotes/origin/HEAD').replace(/^origin\//, '');
  if (!def) def = sh('git branch --show-current');
  f.branch = def || null;
  f.remote = sh('git remote get-url origin') || null;

  // signals
  f.envExample = has(root, '.env.example') || has(root, '.env.sample');
  f.docker = has(root, 'Dockerfile');
  f.ci = fs.existsSync(path.join(root, '.github', 'workflows'));
  f.hasTests = has(root, 'tests') || has(root, 'test') || has(root, '__tests__');

  // existing agent files
  f.agentsExisting = readIf(path.join(root, 'AGENTS.md'));
  f.claudeExists = fs.existsSync(path.join(root, 'CLAUDE.md'));

  return f;
}

// ---------- build section content ----------
function pmCmd(f, script) {
  if (f.pm === 'npm') return `npm run ${script}`;
  if (f.pm === 'yarn') return `yarn ${script}`;
  if (f.pm === 'pnpm') return `pnpm ${script}`;
  return null;
}
function build(f) {
  const s = {};

  // overview
  let ov = (f.desc || (f.pkg && f.pkg.name) || '').replace(/\s*\.\s*$/, '');
  if (f.lang) ov += (ov ? '. ' : '') + `Stack: ${f.lang}${f.frameworks && f.frameworks.length ? ' (' + f.frameworks.join(', ') + ')' : ''}.`;
  s.overview = ov.trim() || STUB('one or two lines on what this project is and how it runs');

  // commands
  const lines = [];
  if (f.lang === 'node') {
    lines.push(`- Install: \`${f.pm} install\``);
    const sc = f.scripts || {};
    const pick = (label, ...keys) => { const k = keys.find((x) => sc[x]); if (k) lines.push(`- ${label}: \`${pmCmd(f, k)}\``); };
    pick('Dev / run', 'dev', 'start', 'serve');
    pick('Build', 'build');
    pick('Test', 'test');
    pick('Lint', 'lint');
    pick('Typecheck', 'typecheck', 'tsc', 'check');
    pick('Format', 'format', 'fmt');
  } else if (f.lang === 'python' && f.pixi) {
    lines.push('- Install: `pixi install`');
    const t = f.pixiTasks;
    const pick = (label, ...keys) => { const k = keys.find((x) => t.includes(x)); if (k) lines.push(`- ${label}: \`pixi run ${k}\``); return k; };
    if (!pick('Test', 'test', 'tests')) lines.push(`- Test: ${STUB('test command (no pixi test task found)')}`);
    pick('Lint', 'lint');
    pick('Typecheck', 'typecheck', 'type-check', 'mypy');
    pick('Format', 'format', 'fmt');
    pick('Build', 'build');
  } else if (f.lang === 'python') {
    lines.push(`- Install: ${STUB('e.g. pip install -r requirements.txt or pip install -e .')}`);
    lines.push(`- Test: \`pytest\`  ${has(f.root, 'pytest.ini') || has(f.root, 'tox.ini') ? '' : STUB('confirm test runner')}`);
    lines.push(`- Lint: ${STUB('e.g. ruff check . / flake8')}`);
  } else if (f.lang === 'go') {
    lines.push('- Build: `go build ./...`'); lines.push('- Test: `go test ./...`');
  } else if (f.lang === 'rust') {
    lines.push('- Build: `cargo build`'); lines.push('- Test: `cargo test`');
  } else {
    lines.push(STUB('install / build / test / lint commands (none auto-detected)'));
  }
  s.commands = lines.join('\n');

  // testing
  s.testing = f.hasTests
    ? `Tests live in \`${['tests', 'test', '__tests__'].find((d) => has(f.root, d))}/\`. ${STUB('what must pass before a change is done; verify against real behavior, not just unit tests')}`
    : STUB('how tests are run and what must pass before a change is considered done');

  // structure
  s.structure = f.dirs.length
    ? 'Top-level: ' + f.dirs.map((d) => `\`${d}/\``).join(', ') + '. ' + STUB('note where the important code lives')
    : STUB('top-level layout and where the important code lives');

  // conventions
  const conv = [];
  if (f.frameworks && f.frameworks.includes('typescript')) conv.push('TypeScript.');
  conv.push(STUB('formatter/linter, naming, import patterns, anything an agent should match'));
  s.conventions = conv.join(' ');

  // git
  s.git = (f.branch ? `Default branch \`${f.branch}\`. ` : '') +
    (f.remote ? `Remote: ${f.remote.replace(/\.git$/, '')}. ` : '') +
    STUB('commit/PR conventions, how changes ship (CI? auto-deploy?)');

  // gotchas
  s.gotchas = STUB('framework quirks and things that have broken before + how they were fixed — add to this after every incident');

  // security
  s.security = (f.envExample ? 'Config/secrets via `.env` (see `.env.example`), never committed. ' : '') +
    STUB('where secrets live and what an agent must never expose') +
    ' Never commit real secrets.';

  // boundaries (always present, partly stubbed)
  s.boundaries = [
    `- ✅ **Always**: run tests/typecheck before committing; ${STUB('safe zones to edit, e.g. src/ and tests/')}`,
    `- ⚠️ **Ask first**: ${STUB('risky changes — schema/migrations, adding dependencies, touching deploy/CI, rebuilding or redeploying production')}`,
    `- 🚫 **Never**: commit secrets or API keys; edit generated/build output${f.lang === 'node' ? ' or `node_modules/`' : ''}; force-push ${f.branch ? '`' + f.branch + '`' : 'the default branch'}`,
  ].join('\n');

  return s;
}

// ---------- render full file ----------
function section(id, body) {
  const inner = `## ${TITLES[id]}\n${body}`;
  return `${begin(id, fingerprint(inner))}\n${inner}\n${end(id)}`;
}
function render(s) {
  const head = `# AGENTS.md

> Guidance for AI coding agents working in this repo. Read this first.
> **Before building, changing, or debugging anything: verify live state** (read the actual
> code, config, and deployed branch). Do not act on stale assumptions.
`;
  const body = SECTIONS.map((id) => section(id, s[id])).join('\n\n');
  const tail = `## Notes
<!-- Human-owned. Anything here is never touched by re-runs of agents-md. -->

---
<!-- Generated and maintained by agents-md (https://github.com/eugeniughelbur/agents-md).
     Content INSIDE agents-md:begin/end markers is refreshed on re-run, unless you edited it:
     an edited section is kept as you left it. Empty a section (keep its markers) to regenerate it.
     Everything OUTSIDE the markers (including ## Notes) is yours and is preserved. -->`;
  return `${head}\n${body}\n\n${tail}\n`;
}

// ---------- safe write ----------
// Did a human change this region since agents-md last wrote it?
function edited(sha, oldInner, newInner) {
  const content = norm(oldInner).split('\n').filter((l) => !/^## /.test(l)).join('\n').trim();
  if (!content) return false; // emptied on purpose: regenerate it
  if (sha) return fingerprint(oldInner) !== sha;
  // No fingerprint (written by agents-md 0.1.0 or the skill): judge by content.
  // Fewer stubs than a fresh run, or a real line a fresh run would not write,
  // means someone filled it in.
  const stubs = (t) => (t.match(/_TBD:/g) || []).length;
  if (stubs(oldInner) < stubs(newInner)) return true;
  const fresh = new Set(norm(newInner).split('\n'));
  return norm(oldInner).split('\n').some((l) => l.trim() && !fresh.has(l) && !l.includes('_TBD:'));
}

function updateMarked(existing, s) {
  let out = existing;
  let touched = 0;
  const kept = [];
  for (const id of SECTIONS) {
    const re = new RegExp(`<!-- agents-md:begin id=${id}(?: sha=([0-9a-f]+))? -->\\n?([\\s\\S]*?)\\n?<!-- agents-md:end id=${id} -->`);
    const m = out.match(re);
    if (!m) continue;
    if (edited(m[1], m[2], `## ${TITLES[id]}\n${s[id]}`)) { kept.push(id); continue; }
    out = out.replace(re, () => section(id, s[id]));
    touched++;
  }
  return { out, touched, kept };
}

function main() {
  const f = detect();
  const s = build(f);
  const stubCount = Object.values(s).filter((v) => v.includes('_TBD:')).length;
  const target = path.join(root, 'AGENTS.md');

  let mode, writePath = target, content, kept = [];
  if (!f.agentsExisting) {
    mode = 'create'; content = render(s);
  } else if (f.agentsExisting.includes('agents-md:begin')) {
    mode = 'update'; const r = updateMarked(f.agentsExisting, s); content = r.out; kept = r.kept;
  } else {
    mode = 'sidecar'; writePath = path.join(root, 'AGENTS.generated.md'); content = render(s);
  }

  console.log(`agents-md: repo "${f.name}" (${f.lang || 'unknown'}) at ${root}`);
  if (DRY) {
    console.log(`[dry-run] would ${mode} ${path.relative(root, writePath)} (${stubCount} section(s) need filling)`);
    if (mode === 'sidecar') console.log('[dry-run] existing AGENTS.md has no markers — it would be left untouched.');
    if (kept.length) console.log(`[dry-run] would keep ${kept.length} section(s) you edited: ${kept.join(', ')}.`);
    return;
  }

  fs.writeFileSync(writePath, content);
  if (mode === 'create') console.log(`Created ${path.relative(root, writePath)} (${stubCount} section(s) marked TBD — fill those in).`);
  if (mode === 'update') console.log(`Refreshed marked sections in AGENTS.md (preserved your edits outside the markers).`);
  if (kept.length) console.log(`Kept ${kept.length} section(s) you edited: ${kept.join(', ')}. To regenerate one, empty it and keep its markers.`);
  if (mode === 'sidecar') console.log(`AGENTS.md exists without markers — left it untouched and wrote AGENTS.generated.md. Merge or adopt it.`);

  // CLAUDE.md compatibility. Claude Code reads AGENTS.md only while no CLAUDE.md exists
  // (v2.1.277+), and older versions never read it. The symlink covers both cases. A plain
  // markdown link would not load the file; the `@AGENTS.md` import line does.
  if (!NO_SYMLINK && mode !== 'sidecar') {
    if (!f.claudeExists) {
      try { fs.symlinkSync('AGENTS.md', path.join(root, 'CLAUDE.md')); console.log('Linked CLAUDE.md -> AGENTS.md.'); }
      catch { fs.writeFileSync(path.join(root, 'CLAUDE.md'), '@AGENTS.md\n'); console.log('Wrote CLAUDE.md that imports AGENTS.md (@AGENTS.md).'); }
    } else {
      const r = claudeCheck(root);
      if (r.state === 'read') console.log(`Claude Code reads AGENTS.md here (${r.how}).`);
      else console.log('CLAUDE.md exists, so Claude Code skips AGENTS.md here. Left CLAUDE.md as-is.\n'
        + 'Fix: npx @eugeniughelbur/agents-md --fix-claude (adds @AGENTS.md to the top of CLAUDE.md).');
    }
  }
  console.log('Done. Re-run any time; it is a safe refresh, not a reset.');
}

main();
