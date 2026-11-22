---
name: agents-md
description: >
  Generate and safely maintain an AGENTS.md file (the cross-tool standard for guiding
  AI coding agents, backed by the Linux Foundation's Agentic AI Foundation and read
  natively by Codex, Cursor, Copilot, Gemini CLI, Aider, Windsurf, Zed, and more).
  Use this skill when the user wants to document a repo for AI agents, create or refresh
  an AGENTS.md / CLAUDE.md, add agent onboarding/context to a project, set up "read this
  before building" rules, or establish do-not-touch boundaries so an agent does not break
  things. Also use it to check whether Claude Code reads a repo's AGENTS.md (it skips the
  file whenever a CLAUDE.md exists). Re-runnable and non-destructive: it never clobbers
  handwritten docs. Triggers on "agents.md", "document this repo for AI", "AGENTS file",
  "AI context file", "agent instructions", "prime this repo", "Claude ignores my
  AGENTS.md", "check my AGENTS.md", "/agents-md".
---

# agents-md

Generate and maintain a high-quality **AGENTS.md** for the current repository, then wire
the other agent tools to it. AGENTS.md is the converging cross-tool standard (OpenAI 2025,
now Linux Foundation / Agentic AI Foundation governance, 60k+ repos). One AGENTS.md is read
by most coding agents. Claude Code reads it too (v2.1.277+), but only while no `CLAUDE.md`,
`.claude/CLAUDE.md` or `CLAUDE.local.md` exists in the folder or above, so `CLAUDE.md` is
pointed at it via symlink or an `@AGENTS.md` import.

**Check-only requests** ("does Claude read my AGENTS.md?", "check my repos"): skip steps 2 to 4.
Run the bundled CLI from this skill's folder: `node <skill folder>/bin/agents-md.js --check` for
the current repo, or `--scan <dir>` for every folder under a directory. Show the user the result.
Offer `--fix-claude --dry-run` for `SKIPS` lines, and run `--fix-claude` only after a yes.

This skill is **safe to re-run**. It only rewrites the regions it generated (marked with
HTML comments) and never overwrites content a human wrote. That guarantee is the whole point.

---

## When invoked, do this in order

### 1. Locate the repo and take stock
- Repo root: `git rev-parse --show-toplevel` (fall back to the current directory).
- Detect existing agent files: `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/` or `.cursorrules`,
  `.github/copilot-instructions.md`, `.windsurfrules`, `GEMINI.md`.
- If `AGENTS.md` exists, check whether it contains this skill's markers
  (`<!-- agents-md:begin ... -->`). That decides the write mode in step 4.

### 2. Gather facts from the repo (never guess — read)
Read, don't assume. Pull real values from these sources:

| Need | Read |
|---|---|
| Language / framework | `Cargo.toml`, `pyproject.toml` / `pixi.toml` / `requirements.txt`, `go.mod`, `package.json`, `Gemfile`, `composer.json`, `pom.xml`, `*.csproj`. A `package.json` next to another manifest is often tooling only (prettier, commit hooks), so check the other manifests first |
| Build / test / run / lint commands | `package.json` `scripts`, `pixi.toml` `[tasks]`, `Makefile`, `Taskfile`, `justfile`, `tox.ini`, `pyproject` `[tool.*]` |
| Project / file structure | top-level dirs + the main source dir (`src/`, `app/`, `lib/`, `cmd/`) |
| Git workflow | default branch (`git symbolic-ref refs/remotes/origin/HEAD`), last ~15 commits for message/branch conventions, `CONTRIBUTING.md` |
| Deploy / runtime | `Dockerfile`, `.github/workflows/`, `railway.json`/`railway.toml`, `vercel.json`, `fly.toml`, `Procfile` |
| Env / secrets | `.env.example` (NEVER read or copy real `.env` values) |
| Overview | `README.md` (summarize, do not duplicate it wholesale) |

For a monorepo, generate one root AGENTS.md and offer per-package AGENTS.md in each
workspace (agents read the nearest one).

### 3. Write the AGENTS.md content
Use the template in `templates/AGENTS.template.md`. Rules for the content:
- **Lean.** Aim under ~200 lines. Short, scannable, imperative. A bloated file hurts agents
  (research shows context files can *reduce* task success when overstuffed).
- **Never fabricate.** If you cannot find a fact, write a clearly-marked stub:
  `_TBD: <what's missing and where to find it>_`. Do not invent commands, ports, or rules.
- **Commands must be real** — copy them verbatim from `scripts`/`Makefile`. If none exist, stub.
- **Boundaries is the most important section** (GitHub's analysis of 2,500+ files: it
  "prevents destructive mistakes"). Always include the three tiers, even if partly stubbed:
  - ✅ **Always**: safe, expected actions (run tests before committing, write to `src/`/`tests/`).
  - ⚠️ **Ask first**: risky changes (schema changes, adding dependencies, touching deploy/CI, rebuilding/redeploying).
  - 🚫 **Never**: destructive/forbidden (commit secrets, edit `node_modules/` or generated dirs, force-push `main`).
  Seed it from real repo signals and from anything the user tells you about past incidents.
- **Top preamble**: include a one-line "Before building or debugging, verify live state
  (read the actual code/schema/deployed branch), do not act on stale assumptions."
- Use emphasis markers (IMPORTANT, YOU MUST, NEVER) **sparingly** — only on load-bearing rules.
- **Always include the `communication` section verbatim from the template.** It is fixed boilerplate (the human's reply-format preferences), not project-derived — copy it as-is, never stub, vary, or omit it. Regenerate it unchanged on re-run.

### 4. Write safely (the three modes — this is the core guarantee)
- **No AGENTS.md** → create it from the template, every generated section wrapped in markers.
- **AGENTS.md with our markers** → re-generate only the content *inside* each
  `<!-- agents-md:begin id=X -->` … `<!-- agents-md:end id=X -->` block. Preserve byte-for-byte
  everything outside the markers (that is the human-owned zone, including the `## Notes` section).
  **Never replace a block a human edited.** If a stub was filled in, a line was added, or a line
  was removed, keep that block exactly as it is and list it in the report. A block emptied on
  purpose (markers kept, no content) may be regenerated. The CLI writes a `sha=` fingerprint in
  the begin marker to tell these apart; when you rewrite a block yourself, write its begin marker
  without `sha=` (the CLI then judges by content).
- **AGENTS.md without our markers** (handwritten) → DO NOT touch it. Write
  `AGENTS.generated.md` beside it and tell the user to merge or adopt. Never clobber.

When updating, if a previously-detected fact is now missing, keep the prior generated value
but flag it (`_TBD: was '<old>', not detected this run — verify_`) rather than deleting silently.

### 5. Wire the other tools to AGENTS.md (compatibility)
- `CLAUDE.md`: if absent, create a symlink `CLAUDE.md -> AGENTS.md`. Claude Code would read
  AGENTS.md alone too, but the symlink also covers versions before v2.1.277. If it already
  symlinks to AGENTS.md, leave it. If it is a real handwritten file, Claude Code is skipping
  AGENTS.md. ASK before changing it, and offer the smallest fix first: add `@AGENTS.md` as its
  first line (the CLI's `--fix-claude` does exactly this). A markdown link such as
  `See [AGENTS.md](AGENTS.md)` does NOT load the file; only the `@AGENTS.md` import does.
- Do not add the import when CLAUDE.md already holds the same text (it would load twice), or
  when AGENTS.md is written for Codex only (title names Codex). Those splits tend to be on
  purpose. Say so in the report instead.
- Offer (don't force) the same pointer for `.cursor/rules/agents.md`,
  `.github/copilot-instructions.md`, `GEMINI.md`: a symlink or a one-line include.
- On Windows or where symlinks fail, write a CLAUDE.md whose only line is `@AGENTS.md`.

### 6. Check and report
Run `node <skill folder>/bin/agents-md.js --check` and include its result. Then list: file
created/updated and in which mode; which sections were filled vs left as stubs (so the user
knows what to fill in); symlinks/imports created; whether Claude Code reads the file; and a
reminder to keep the Boundaries section current after any incident.

---

## Hard rules
1. **Never fabricate.** Stub unknowns. A wrong command is worse than a missing one.
2. **Never clobber human content.** Outside-marker content and unmarked files are sacred.
3. **Lean over complete.** Under ~200 lines. Cut the "Architecture essay" — agents value commands, conventions, and boundaries far more.
4. **Boundaries section is mandatory**, with the three tiers.
5. **Secrets**: read `.env.example` only. Never read, copy, or echo real secret values into the file.
6. **Re-runnable**: running this skill again must be a safe refresh, never a reset.

## The marker contract (document this in the generated file's footer)
```
<!-- agents-md:begin id=commands -->     ← refreshed on re-run while nobody has edited it
...generated content...
<!-- agents-md:end id=commands -->
```
An edited block is kept as the human left it. Anything outside these markers is yours and is never modified. Put durable custom notes in the
`## Notes` section (no markers) so they survive every re-run.
