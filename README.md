<p align="center">
  <img src="media/banner.png" alt="agents-md: generate and safely maintain an AGENTS.md, the cross-tool standard read by Cursor, GitHub Copilot, Codex, Gemini CLI, Aider, Windsurf, Zed, and Claude Code." width="100%" />
</p>

<h1 align="center">agents-md</h1>

<p align="center">
  <strong>Generate and safely maintain an <a href="https://agents.md">AGENTS.md</a> for any repo. The cross-tool standard that AI coding agents read.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Cursor-000?style=for-the-badge&logo=cursor&logoColor=white" alt="Cursor" />
  <img src="https://img.shields.io/badge/GitHub_Copilot-000?style=for-the-badge&logo=githubcopilot&logoColor=white" alt="GitHub Copilot" />
  <img src="https://img.shields.io/badge/Codex-412991?style=for-the-badge&logo=openai&logoColor=white" alt="OpenAI Codex" />
  <img src="https://img.shields.io/badge/Claude_Code-D97757?style=for-the-badge&logo=anthropic&logoColor=white" alt="Claude Code" />
  <img src="https://img.shields.io/badge/Gemini_CLI-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white" alt="Gemini CLI" />
  <img src="https://img.shields.io/badge/Aider-14B8A6?style=for-the-badge" alt="Aider" />
</p>

<p align="center">
  <a href="https://agents.md"><img src="https://img.shields.io/badge/standard-AGENTS.md-111?style=for-the-badge" alt="AGENTS.md standard" /></a>
  <img src="https://img.shields.io/github/stars/eugeniughelbur/agents-md?style=for-the-badge&color=yellow" alt="Stars" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License: MIT" />
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen?style=for-the-badge" alt="Zero dependencies" />
  <a href="https://eugeniughelbur.github.io/agents-md/"><img src="https://img.shields.io/badge/website-live-111?style=for-the-badge" alt="Website" /></a>
</p>

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

## AGENTS.md vs CLAUDE.md vs .cursorrules vs llms.txt

| File | Read by | What it is |
|---|---|---|
| **AGENTS.md** | Codex, Cursor, Copilot, Gemini CLI, Aider, Windsurf, Zed, Devin, and more | The cross-tool standard for agent instructions (Linux Foundation / Agentic AI Foundation) |
| CLAUDE.md | Claude Code | Tool-specific; symlink it to AGENTS.md |
| .cursorrules / .cursor/rules | Cursor | Tool-specific (Cursor also reads AGENTS.md) |
| .github/copilot-instructions.md | GitHub Copilot | Tool-specific (Copilot also reads AGENTS.md) |
| llms.txt | LLMs / AI search engines | For documentation websites, not repo agent instructions |

The convergence: write one **AGENTS.md** and symlink the rest. `agents-md` does exactly that.

## Use it

**As a CLI (any repo, no API key, zero dependencies):**

```bash
cd your-repo
npx github:eugeniughelbur/agents-md
```

It scans the repo, writes or refreshes `AGENTS.md`, symlinks `CLAUDE.md` to it, and reports which sections it filled vs left as stubs for you to complete. Flags: `--dry-run`, `--no-symlink`. Run it again any time, it is a safe refresh, never a reset.

**As a Claude Code skill (LLM-powered, richer):**

```bash
npx skills add eugeniughelbur/agents-md
```

Then run `/agents-md` in any repo. The skill reads your code intelligently and writes deeper content (real gotchas, real boundaries); the CLI is the fast, deterministic, zero-setup option. Both honor the same safe-marker contract.

## The marker contract

```
<!-- agents-md:begin id=commands -->     content here is regenerated on re-run
...
<!-- agents-md:end id=commands -->
```

Everything outside the markers is yours and is preserved forever. Put durable custom notes in `## Notes`.

## FAQ

**What is AGENTS.md?**
AGENTS.md is an open, cross-tool standard file that tells AI coding agents how to work in your repository: its build and test commands, code conventions, gotchas, and do-not-touch boundaries. It originated at OpenAI in 2025 and is now governed by the Linux Foundation's Agentic AI Foundation. Think of it as a README for agents.

**AGENTS.md vs CLAUDE.md, which should I use?**
Use AGENTS.md as the single source, then symlink CLAUDE.md to it. Most agents read AGENTS.md natively; Claude Code reads CLAUDE.md, so the symlink covers both. agents-md sets this up for you automatically.

**How do I generate an AGENTS.md?**
Run `npx github:eugeniughelbur/agents-md` in your repo. It detects your stack, commands, and structure, writes AGENTS.md, and symlinks CLAUDE.md. Anything it cannot detect is left as a clearly marked stub for you to fill in.

**Is it safe to re-run? Will it overwrite my edits?**
Yes, it is safe. Re-runs refresh only the regions wrapped in HTML-comment markers; everything outside the markers is preserved. A handwritten AGENTS.md with no markers is never overwritten, agents-md writes AGENTS.generated.md instead.

**Does it need an API key or send my code anywhere?**
No. The CLI has zero dependencies, makes no network calls, and reads only repo metadata (and `.env.example`, never real secret values).

## License

MIT

---

<p align="center"><strong>Built by Eugeniu Ghelbur.</strong> If agents-md kept an AI agent from breaking your repo, a ⭐ helps others find it.</p>

<p align="center">
<a href="https://x.com/eugeniu_ghelbur"><img src="https://img.shields.io/badge/Follow_on_X-000?style=for-the-badge&logo=x&logoColor=white" alt="Follow on X" /></a>
<a href="https://www.linkedin.com/in/eugeniu-ghelbur/"><img src="https://img.shields.io/badge/Connect_on_LinkedIn-0A66C2?style=for-the-badge&logo=data:image/svg%2Bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0yMC40NDcgMjAuNDUyaC0zLjU1NHYtNS41NjljMC0xLjMyOC0uMDI3LTMuMDM3LTEuODUyLTMuMDM3LTEuODUzIDAtMi4xMzYgMS40NDUtMi4xMzYgMi45Mzl2NS42NjdIOS4zNTFWOWgzLjQxNHYxLjU2MWguMDQ2Yy40NzctLjkgMS42MzctMS44NSAzLjM3LTEuODUgMy42MDEgMCA0LjI2NyAyLjM3IDQuMjY3IDUuNDU1djYuMjg2ek01LjMzNyA3LjQzM2MtMS4xNDQgMC0yLjA2My0uOTI2LTIuMDYzLTIuMDY1IDAtMS4xMzguOTItMi4wNjMgMi4wNjMtMi4wNjMgMS4xNCAwIDIuMDY0LjkyNSAyLjA2NCAyLjA2MyAwIDEuMTM5LS45MjUgMi4wNjUtMi4wNjQgMi4wNjV6bTEuNzgyIDEzLjAxOUgzLjU1NVY5aDMuNTY0djExLjQ1MnpNMjIuMjI1IDBIMS43NzFDLjc5MiAwIDAgLjc3NCAwIDEuNzI5djIwLjU0MkMwIDIzLjIyNy43OTIgMjQgMS43NzEgMjRoMjAuNDUxQzIzLjIgMjQgMjQgMjMuMjI3IDI0IDIyLjI3MVYxLjcyOUMyNCAuNzc0IDIzLjIgMCAyMi4yMjIgMGguMDAzeiIvPjwvc3ZnPg%3D%3D" alt="Connect on LinkedIn" /></a>
<a href="https://theaioperator.io"><img src="https://img.shields.io/badge/Subscribe_on_Substack-FF6719?style=for-the-badge&logo=substack&logoColor=white" alt="Subscribe on Substack" /></a>
<a href="https://github.com/eugeniughelbur"><img src="https://img.shields.io/badge/Follow_on_GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="Follow on GitHub" /></a>
</p>

