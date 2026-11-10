#!/usr/bin/env node
'use strict';

/**
 * agents-md — generate and safely maintain an AGENTS.md for the current repo.
 * Zero dependencies. Never fabricates (unknowns become stubs). Re-runs only touch
 * the regions it generated (HTML-comment markers) and never clobber human edits.
 */

const fs = require('fs');
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

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
if (flag('-h') || flag('--help')) {
  console.log(`agents-md — generate/maintain AGENTS.md (the cross-tool agent standard)

Usage: agents-md [options]
  --dry-run     print what would change, write nothing
  --no-symlink  do not create the CLAUDE.md -> AGENTS.md symlink
  -h, --help    this help

Safe by design: re-runs refresh only the marked regions; a handwritten AGENTS.md
with no markers is never overwritten (a AGENTS.generated.md is written instead).`);
  process.exit(0);
}
const DRY = flag('--dry-run');
const NO_SYMLINK = flag('--no-symlink');

// ---------- locate repo ----------
const root = sh('git rev-parse --show-toplevel') || process.cwd();
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

  // CLAUDE.md compatibility (Claude Code does not read AGENTS.md natively)
  if (!NO_SYMLINK && mode !== 'sidecar') {
    if (!f.claudeExists) {
      try { fs.symlinkSync('AGENTS.md', path.join(root, 'CLAUDE.md')); console.log('Linked CLAUDE.md -> AGENTS.md.'); }
      catch { fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'See [AGENTS.md](AGENTS.md).\n'); console.log('Wrote CLAUDE.md pointing to AGENTS.md.'); }
    } else {
      let linked = false;
      try { linked = fs.lstatSync(path.join(root, 'CLAUDE.md')).isSymbolicLink() && fs.readlinkSync(path.join(root, 'CLAUDE.md')) === 'AGENTS.md'; } catch {}
      console.log(linked ? 'CLAUDE.md already links to AGENTS.md.' : 'CLAUDE.md already exists (not our symlink) — left as-is. Point it at AGENTS.md yourself.');
    }
  }
  console.log('Done. Re-run any time; it is a safe refresh, not a reset.');
}

main();
