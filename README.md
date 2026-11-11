# Context usage indicator

A small ring and percentage in the prompt footer (the desktop app puts it left of the model name), showing how full the current
session's context window is. Neutral under 60%, amber from 60 to 85%, red above 85%.

- At rest: a glyph ring (○ ◔ ◑ ◕ ●) and the percentage.
- Click: a toast with used / max and the System, Tools and Messages buckets (the same breakdown /context uses,
  estimated locally, no extra API calls).
- `/context-indicator`: prints the same figures and breakdown in the conversation, plus where the mod draws. This is
  the only view in cloud sessions, which attach no drawing surface for the footer chip.

The percentage is the status line's figure: the last response's input tokens over the model's window. It refreshes
after every model response. It does not touch the plan-usage ring.

## Install

In a Claude Code session (terminal), run:

```
/plugin install context-usage-indicator --marketplace andrewfrankel/claude-context
```

Answer `y` to add the marketplace, then pick user scope so local desktop app sessions load it too. Restart the app
after installing or updating.

## Verify

1. Start a new local session. A chip with `○ 0%` appears in the prompt footer.
2. Send a prompt. After the reply, the percentage matches `/context`.
3. Click the percentage for a toast with used / max, free space and the System, Tools and Messages breakdown.

## Limits

- The footer chip shows in local sessions on the desktop app and the terminal only (not VS Code or mobile).
- Cloud sessions in the desktop app attach no drawing surface, so there is no chip there; use `/context-indicator`.
- The percentage updates after each model response, not mid-stream; it starts at 0% until the first reply.
- The bucket figures are local estimates against the compaction window, so they need not sum to "Used".
- The ring is a text glyph (○ ◔ ◑ ◕ ●): the desktop footer slot does not draw SVG.
- Cloud sessions do not read your local plugins. Install it in each cloud environment's setup script. The environment
  caches the setup, so after a release edit the version note to force a fresh install:

```
# Context usage indicator mod (github.com/andrewfrankel/claude-context)
# Edit the version note below after a release to force a fresh install: v0.5.0
claude plugin marketplace add andrewfrankel/claude-context || true
claude plugin marketplace update claude-context || true
claude plugin install context-usage-indicator@claude-context || true
claude plugin update context-usage-indicator@claude-context || true
```
