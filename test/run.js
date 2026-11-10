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

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
