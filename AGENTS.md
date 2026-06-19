# AGENTS.md

> Guidance for AI coding agents working on **this** repo (agents-md, the AGENTS.md generator).
> Read this first. Verify live state (read the code) before changing anything. Meta-note: this
> file is also a live example of what the tool produces.

<!-- agents-md:begin id=overview -->
## Overview
`agents-md` generates and safely maintains an `AGENTS.md` (the cross-tool standard for AI coding
agents) for any repository. It ships two ways from one repo: a **zero-dependency Node CLI**
(`bin/agents-md.js`, run via `npx`) and a **Claude Code skill** (`SKILL.md`). Both write the same
AGENTS.md and obey the same safe-marker contract. No runtime dependencies; Node >= 16.
<!-- agents-md:end id=overview -->

<!-- agents-md:begin id=commands -->
## Commands
- Run the CLI locally: `node bin/agents-md.js` (in any target repo)
- Try it end to end: `npx github:eugeniughelbur/agents-md`
- Help / dry run: `node bin/agents-md.js --help` · `--dry-run`
- No build, no install, no tests yet (_TBD: add a test harness with fixture repos_).
<!-- agents-md:end id=commands -->

<!-- agents-md:begin id=testing -->
## Testing
Manual for now: run the CLI against a throwaway repo (`git init` + a `package.json`) and verify
the three write modes (create, marker-update, no-clobber sidecar). _TBD: automate with fixtures._
<!-- agents-md:end id=testing -->

<!-- agents-md:begin id=structure -->
## Project structure
- `bin/agents-md.js` — the CLI (detect facts → build sections → safe write → symlink CLAUDE.md)
- `SKILL.md` — the Claude Code skill (LLM-powered variant; same contract)
- `templates/AGENTS.template.md` — the section skeleton with markers
- `README.md`, `llms.txt`, `docs/` — docs + discoverability surface
<!-- agents-md:end id=structure -->

<!-- agents-md:begin id=conventions -->
## Code style & conventions
- **Zero runtime dependencies.** Use only Node built-ins (`fs`, `path`, `child_process`). This is
  a trust + portability promise; do not add npm deps to the CLI.
- CommonJS, Node >= 16. Keep the CLI a single readable file.
- Keep the CLI (deterministic) and the SKILL.md (LLM) in sync on the **marker contract** and the
  section list.
<!-- agents-md:end id=conventions -->

<!-- agents-md:begin id=git -->
## Git & PR workflow
Default branch `master`. Public repo `eugeniughelbur/agents-md`. GitHub Pages serves `/docs`.
Conventional, descriptive commits.
<!-- agents-md:end id=git -->

<!-- agents-md:begin id=gotchas -->
## Gotchas & hard-won lessons
- The marker regex must escape the HTML-comment markers; a bad regex would corrupt user files.
- **Never** widen the write logic to overwrite a markerless `AGENTS.md` — the no-clobber sidecar
  is the product's core promise. Breaking it breaks trust.
- `CLAUDE.md` symlink is intentional: Claude Code does not read `AGENTS.md` natively (as of 2026).
<!-- agents-md:end id=gotchas -->

<!-- agents-md:begin id=security -->
## Security & secrets
The tool reads repo metadata only and `.env.example` (never real `.env` values), and never writes
secrets into the generated file. No network calls, no telemetry. Keep it that way.
<!-- agents-md:end id=security -->

<!-- agents-md:begin id=boundaries -->
## Boundaries
- ✅ **Always**: keep the CLI zero-dependency; keep CLI and skill in sync; test the three write modes before pushing.
- ⚠️ **Ask first**: changing the marker syntax (it is a compatibility contract with already-generated files); changing the default section set.
- 🚫 **Never**: overwrite a handwritten (markerless) AGENTS.md; add runtime npm dependencies; make network calls or add telemetry; commit secrets.
<!-- agents-md:end id=boundaries -->

## Notes
<!-- Human-owned. Never touched by re-runs of agents-md. -->
- This repo is both the tool and its own first user. Dogfood changes here before shipping.

---
<!-- Generated/maintained by agents-md (https://github.com/eugeniughelbur/agents-md).
     Content INSIDE agents-md:begin/end markers is regenerated on re-run; everything outside is preserved. -->
