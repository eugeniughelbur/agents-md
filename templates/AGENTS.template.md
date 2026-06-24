# AGENTS.md

> Guidance for AI coding agents working in this repo. Read this first.
> **Before building, changing, or debugging anything: verify live state** (read the actual
> code, schema, config, and deployed branch). Do not act on stale assumptions.

<!-- agents-md:begin id=communication -->
## Talking to the human

How to format replies. The reader works in a terminal and finds dense walls of text hard to parse.

- Lead with the answer in one sentence. Put the detail after it.
- Short paragraphs, 2 to 3 sentences max, with a blank line between them.
- Bold at most one thing per message. If everything is bold, nothing stands out.
- Three or more items become a list, not a packed paragraph.
- No em-dashes. Use a period or a comma.
- No emojis in replies unless the human asks for them.
- Plain language over jargon. Explain as if the reader is smart but not deep in this stack.
- Keep replies short. If a reply would run long, give the headline and ask before expanding.
- End with at most one question.
<!-- agents-md:end id=communication -->

<!-- agents-md:begin id=overview -->
## Overview
{{one or two sentences: what this project is, its stack, and how it runs. From README + manifest. Stub if unknown.}}
<!-- agents-md:end id=overview -->

<!-- agents-md:begin id=commands -->
## Commands
Real commands, copied verbatim from package scripts / Makefile. Stub any that don't exist.

- Install: `{{...}}`
- Dev / run: `{{...}}`
- Build: `{{...}}`
- Test: `{{...}}`
- Lint / format / typecheck: `{{...}}`
<!-- agents-md:end id=commands -->

<!-- agents-md:begin id=testing -->
## Testing
{{How tests are run and where they live; what must pass before a change is "done". Stub if unknown.}}
<!-- agents-md:end id=testing -->

<!-- agents-md:begin id=structure -->
## Project structure
{{Top-level layout and where the important code lives. A short list, not an essay.}}
<!-- agents-md:end id=structure -->

<!-- agents-md:begin id=conventions -->
## Code style & conventions
{{Language, formatter/linter, naming, import patterns, anything detectable from config. Stub if unknown.}}
<!-- agents-md:end id=conventions -->

<!-- agents-md:begin id=git -->
## Git & PR workflow
{{Default branch, commit message style, branch naming, how changes ship. From git history + CONTRIBUTING.}}
<!-- agents-md:end id=git -->

<!-- agents-md:begin id=gotchas -->
## Gotchas & hard-won lessons
{{Framework quirks, footguns, things that have broken before and how they were fixed. Add to this after every incident.}}
<!-- agents-md:end id=gotchas -->

<!-- agents-md:begin id=security -->
## Security & secrets
{{Where config/secrets live (e.g. .env, never committed), what an agent must never expose. From .env.example only.}}
<!-- agents-md:end id=security -->

<!-- agents-md:begin id=boundaries -->
## Boundaries
The most important section. Keep it current.

- ✅ **Always**: {{run tests before committing; write new code to src/ and tests/; ...}}
- ⚠️ **Ask first**: {{database/schema changes; adding dependencies; touching deploy/CI; rebuilding or redeploying production; ...}}
- 🚫 **Never**: {{commit secrets or API keys; edit node_modules/ or generated files; force-push the default branch; ...}}
<!-- agents-md:end id=boundaries -->

## Notes
<!-- Human-owned. Anything you write here is never touched by re-runs of agents-md. -->

---
<!-- Generated and maintained by agents-md (https://github.com/eugeniughelbur/agents-md).
     Content INSIDE `agents-md:begin/end` markers is regenerated on re-run.
     Everything OUTSIDE the markers (including ## Notes) is yours and is preserved. -->
