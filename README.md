# agents-md

**Generate and safely maintain an [AGENTS.md](https://agents.md) for any repo, the cross-tool standard that AI coding agents read.**

One `AGENTS.md` works across Codex, Cursor, GitHub Copilot, Gemini CLI, Aider, Windsurf, Zed, Devin, and more. `CLAUDE.md` is pointed at it via symlink. This skill writes a great one for you by reading your repo, and it is **safe to re-run**: it only updates the regions it generated and never clobbers anything you wrote by hand.

> Backed by the standard: AGENTS.md started at OpenAI (2025) and is now under the Linux Foundation's Agentic AI Foundation, used in 60,000+ repositories.

## Why this one

- **Aligned with the standard.** Targets `AGENTS.md`, not a private format only one tool reads.
- **Safe, non-destructive re-runs.** Generated sections are wrapped in HTML-comment markers. Re-running refreshes only those zones. Your hand-written content (and the `## Notes` section) is never touched. If a hand-written `AGENTS.md` already exists with no markers, it is left alone and a `AGENTS.generated.md` is written beside it instead.
- **Never fabricates.** Facts are read from your repo (manifests, scripts, Makefile, git history, CI, `.env.example`). Anything it cannot find is left as a clearly-marked stub for you to fill, never invented.
- **Boundaries-first.** Every file gets the three-tier guardrail (✅ Always / ⚠️ Ask first / 🚫 Never), the section GitHub's analysis of 2,500+ repos found most prevents destructive mistakes.
- **One source, every tool.** Symlinks `CLAUDE.md` (and optionally Cursor / Copilot configs) to the same `AGENTS.md`.

## What it generates

A lean (~200 line) `AGENTS.md` with: Overview, Commands, Testing, Project structure, Code style & conventions, Git workflow, Gotchas, Security & secrets, and a three-tier **Boundaries** section. See [`templates/AGENTS.template.md`](templates/AGENTS.template.md).

## Install (Claude Code skill)

```bash
npx skills add eugeniughelbur/agents-md
```

Or clone and symlink into `~/.claude/skills/agents-md`.

## Use

In any repo, run:

```
/agents-md
```

It reads the repo, writes or refreshes `AGENTS.md`, wires `CLAUDE.md` to it, and reports which sections it filled vs left as stubs. Run it again any time, it is a safe refresh, never a reset.

## The marker contract

```
<!-- agents-md:begin id=commands -->     content here is regenerated on re-run
...
<!-- agents-md:end id=commands -->
```

Everything outside the markers is yours and is preserved forever. Put durable custom notes in `## Notes`.

## License

MIT
