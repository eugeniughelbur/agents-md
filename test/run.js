#!/usr/bin/env node
'use strict';

// Zero-dependency test runner: builds throwaway fixture repos, runs the CLI in
// each, and checks the AGENTS.md it writes. Run with `node test/run.js`.

const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', 'bin', 'agents-md.js');
let failed = 0;

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-'));
  cp.execSync('git init -q', { cwd: dir });
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

function run(dir) {
  return cp.execFileSync(process.execPath, [CLI, '--no-symlink'], { cwd: dir }).toString();
}

function agents(dir) {
  return fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
}

function region(text, id) {
  const m = text.match(new RegExp(`<!-- agents-md:begin id=${id}(?: sha=[0-9a-f]+)? -->\\n([\\s\\S]*?)\\n<!-- agents-md:end id=${id} -->`));
  return m ? m[1] : null;
}

function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); }
  catch (err) { failed++; console.log(`FAIL ${name}\n     ${err.message.split('\n').join('\n     ')}`); }
}

// A package.json that only carries tooling (prettier, commit hooks).
const TOOLING_PKG = JSON.stringify({ private: true, devDependencies: { prettier: '^3.0.0', typescript: '^5.0.0' } });

// ---------- stack detection ----------

test('a Rust repo with a tooling package.json is detected as Rust', () => {
  const dir = fixture({
    'package.json': TOOLING_PKG,
    'Cargo.toml': '[package]\nname = "clitool"\ndescription = "A small CLI"\n',
  });
  const out = run(dir);
  assert.match(out, /\(rust\)/);
  const text = agents(dir);
  assert.match(region(text, 'commands'), /cargo test/);
  assert.doesNotMatch(region(text, 'overview'), /typescript/);
  assert.match(region(text, 'overview'), /A small CLI/);
});

test('a Python repo with a tooling package.json is detected as Python', () => {
  const dir = fixture({
    'package.json': TOOLING_PKG,
    'pyproject.toml': '[project]\nname = "sdk"\ndescription = "Python SDK"\n',
  });
  assert.match(run(dir), /\(python\)/);
  assert.match(region(agents(dir), 'overview'), /Python SDK/);
});

test('a pixi repo is Python and lists its pixi tasks', () => {
  const dir = fixture({
    'package.json': TOOLING_PKG,
    'pixi.toml': '[workspace]\nname = "sdk"\n\n[tasks]\ntest = "pytest"\nlint = { cmd = "ruff check ." }\n\n[dependencies]\npython = "3.12.*"\n',
  });
  assert.match(run(dir), /\(python\)/);
  const commands = region(agents(dir), 'commands');
  assert.match(commands, /`pixi install`/);
  assert.match(commands, /`pixi run test`/);
  assert.match(commands, /`pixi run lint`/);
});

test('guard: a plain Node repo is still Node', () => {
  const dir = fixture({
    'package.json': JSON.stringify({ name: 'web', description: 'Web app', scripts: { test: 'vitest' }, dependencies: { react: '^18.0.0' } }),
  });
  assert.match(run(dir), /\(node\)/);
  const text = agents(dir);
  assert.match(region(text, 'commands'), /npm run test/);
  assert.match(region(text, 'overview'), /react/);
});

// ---------- re-runs keep filled regions ----------

test('a re-run keeps a region the human filled in', () => {
  const dir = fixture({ 'go.mod': 'module example.com/x\n' });
  run(dir);
  const filled = agents(dir).replace(
    /(<!-- agents-md:begin id=gotchas(?: sha=[0-9a-f]+)? -->\n## Gotchas & hard-won lessons\n)[^\n]*/,
    '$1- The cache dir must exist before `go test` runs.',
  );
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), filled);
  run(dir);
  const after = agents(dir);
  assert.match(region(after, 'gotchas'), /The cache dir must exist/);
  assert.doesNotMatch(region(after, 'gotchas'), /_TBD:/);
});

test('a re-run keeps a line the human added to a fully detected region', () => {
  const dir = fixture({ 'go.mod': 'module example.com/x\n' });
  run(dir);
  const added = agents(dir).replace('- Test: `go test ./...`', '- Test: `go test ./...`\n- Lint: `golangci-lint run`');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), added);
  run(dir);
  assert.match(region(agents(dir), 'commands'), /golangci-lint run/);
});

test('a re-run keeps a region where the human deleted a stub line', () => {
  const dir = fixture({ 'requirements.txt': 'requests\n' });
  run(dir);
  const trimmed = agents(dir).replace(/\n- Lint: _TBD:[^\n]*/, '');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), trimmed);
  run(dir);
  assert.doesNotMatch(region(agents(dir), 'commands'), /Lint:/);
});

test('guard: a re-run still refreshes a region nobody edited', () => {
  const dir = fixture({ 'package.json': JSON.stringify({ name: 'web', description: 'Old text' }) });
  run(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'web', description: 'New text' }));
  run(dir);
  const overview = region(agents(dir), 'overview');
  assert.match(overview, /New text/);
  assert.doesNotMatch(overview, /Old text/);
});

test('a file from 0.1.0 (no fingerprints) keeps filled regions and refreshes the rest', () => {
  const dir = fixture({ 'go.mod': 'module example.com/x\n' });
  run(dir);
  const old = agents(dir)
    .replace(/ sha=[0-9a-f]+ -->/g, ' -->')
    .replace(/(id=gotchas -->\n## Gotchas & hard-won lessons\n)[^\n]*/, '$1- Run `go generate` first.');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), old);
  run(dir);
  const after = agents(dir);
  assert.match(region(after, 'gotchas'), /go generate/);
  assert.match(after, /<!-- agents-md:begin id=commands sha=[0-9a-f]+ -->/);
});

test('guard: an emptied region is regenerated', () => {
  const dir = fixture({ 'go.mod': 'module example.com/x\n' });
  run(dir);
  const emptied = agents(dir).replace(/(id=commands sha=[0-9a-f]+ -->\n)[\s\S]*?(\n<!-- agents-md:end id=commands -->)/, '$1$2');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), emptied);
  run(dir);
  assert.match(region(agents(dir), 'commands'), /go test/);
});

test('a re-run writes a $ in detected text literally', () => {
  const dir = fixture({ 'package.json': JSON.stringify({ name: 'web', description: 'Old' }) });
  run(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'web', description: 'Saves $& and $1' }));
  run(dir);
  assert.match(region(agents(dir), 'overview'), /Saves \$& and \$1/);
});

// ---------- Claude Code check (--check / --scan / --fix-claude) ----------

function cli(dir, ...flags) {
  const r = cp.spawnSync(process.execPath, [CLI, ...flags], { cwd: dir });
  return { out: r.stdout.toString(), code: r.status };
}
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const RULES = '# AGENTS.md\n\n## Commands\n- Test: `npm test`\n\n## Boundaries\n- Never commit secrets.\n';

test('--check: a CLAUDE.md next to AGENTS.md makes Claude Code skip it (exit 1)', () => {
  const dir = fixture({ 'AGENTS.md': RULES, 'CLAUDE.md': '# Claude tips\n- Use plan mode.\n' });
  const r = cli(dir, '--check');
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /SKIPS AGENTS\.md: CLAUDE\.md wins/);
});

test('--check: a private CLAUDE.local.md also makes Claude Code skip it', () => {
  const dir = fixture({ 'AGENTS.md': RULES, 'CLAUDE.local.md': 'my notes\n' });
  const r = cli(dir, '--check');
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /CLAUDE\.local\.md wins/);
});

test('--check: AGENTS.md alone is read (exit 0)', () => {
  const dir = fixture({ 'AGENTS.md': RULES });
  const r = cli(dir, '--check');
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /reads AGENTS\.md \(no CLAUDE\.md\)/);
});

test('--check: an @AGENTS.md import line counts as read', () => {
  const dir = fixture({ 'AGENTS.md': RULES, 'CLAUDE.md': '@AGENTS.md\n\n# Claude tips\n' });
  const r = cli(dir, '--check');
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /imported with @AGENTS\.md/);
});

test('--check: an @AGENTS.md inside a code block does not count', () => {
  const dir = fixture({ 'AGENTS.md': RULES, 'CLAUDE.md': '# Tips\n```\n@AGENTS.md\n```\n' });
  assert.strictEqual(cli(dir, '--check').code, 1);
});

test('--check: a CLAUDE.md symlink to AGENTS.md counts as read', () => {
  const dir = fixture({ 'AGENTS.md': RULES });
  fs.symlinkSync('AGENTS.md', path.join(dir, 'CLAUDE.md'));
  const r = cli(dir, '--check');
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /CLAUDE\.md links to AGENTS\.md/);
});

test('--check: reports which of GitHub\'s 6 areas are missing', () => {
  const dir = fixture({ 'AGENTS.md': RULES });
  const r = cli(dir, '--check');
  assert.match(r.out, /2 of 6 \(missing: testing, project structure, code style, git workflow\)/);
});

test('--fix-claude: adds @AGENTS.md to the top and keeps the rest of CLAUDE.md', () => {
  const dir = fixture({ 'AGENTS.md': RULES, 'CLAUDE.md': '# Claude tips\n- Use plan mode.\n' });
  const r = cli(dir, '--fix-claude');
  assert.strictEqual(r.code, 0);
  assert.strictEqual(read(dir, 'CLAUDE.md'), '@AGENTS.md\n\n# Claude tips\n- Use plan mode.\n');
  cli(dir, '--fix-claude');
  assert.strictEqual(read(dir, 'CLAUDE.md').match(/@AGENTS\.md/g).length, 1);
});

test('--fix-claude: with only CLAUDE.local.md, creates a CLAUDE.md that imports AGENTS.md', () => {
  const dir = fixture({ 'AGENTS.md': RULES, 'CLAUDE.local.md': 'my notes\n' });
  assert.strictEqual(cli(dir, '--fix-claude').code, 0);
  assert.strictEqual(read(dir, 'CLAUDE.md'), '@AGENTS.md\n');
  assert.strictEqual(read(dir, 'CLAUDE.local.md'), 'my notes\n');
});

test('--fix-claude --dry-run changes nothing', () => {
  const dir = fixture({ 'AGENTS.md': RULES, 'CLAUDE.md': '# Tips\n' });
  const r = cli(dir, '--fix-claude', '--dry-run');
  assert.match(r.out, /\[dry-run\] would add/);
  assert.strictEqual(read(dir, 'CLAUDE.md'), '# Tips\n');
});

test('--fix-claude: leaves a CLAUDE.md that already holds the same text', () => {
  const dir = fixture({ 'AGENTS.md': RULES, 'CLAUDE.md': RULES });
  const r = cli(dir, '--fix-claude');
  assert.match(r.out, /already holds the same text/);
  assert.strictEqual(read(dir, 'CLAUDE.md'), RULES);
});

test('--fix-claude: leaves an AGENTS.md titled for Codex only', () => {
  const codex = '# Project instructions for Codex\n\nRead HANDOFF-CODEX.md first.\n';
  const dir = fixture({ 'AGENTS.md': codex, 'CLAUDE.md': '# Project instructions for Claude\n' });
  const r = cli(dir, '--fix-claude');
  assert.match(r.out, /titled for Codex only/);
  assert.strictEqual(read(dir, 'CLAUDE.md'), '# Project instructions for Claude\n');
});

test('--scan: counts the folders where Claude Code skips AGENTS.md', () => {
  const dir = fixture({
    'a/AGENTS.md': RULES, 'a/CLAUDE.md': '# tips\n',
    'b/AGENTS.md': RULES,
    'c/AGENTS.md': RULES, 'c/CLAUDE.md': '@AGENTS.md\n',
  });
  const r = cli(dir, '--scan', '.');
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /SKIPS  a /);
  assert.match(r.out, /skips AGENTS\.md in 1 of 3 folders/);
  const fixed = cli(dir, '--scan', '.', '--fix-claude');
  assert.strictEqual(fixed.code, 0);
  assert.match(fixed.out, /skips AGENTS\.md in 0 of 3 folders after the fix/);
});

test('generate: an existing CLAUDE.md gets a skip warning, not a silent pass', () => {
  const dir = fixture({ 'go.mod': 'module example.com/x\n', 'CLAUDE.md': '# tips\n' });
  const out = cp.execFileSync(process.execPath, [CLI], { cwd: dir }).toString();
  assert.match(out, /Claude Code skips AGENTS\.md here/);
  assert.strictEqual(read(dir, 'CLAUDE.md'), '# tips\n');
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
