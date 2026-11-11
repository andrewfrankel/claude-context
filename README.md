# Context usage indicator

A small ring and percentage in the prompt footer, right after the mode label (Auto), showing how full the current
session's context window is. Neutral under 60%, amber from 60 to 85%, red above 85%.

- Hover: used tokens / window size.
- Click the percentage: a card with used / max and the System, Tools and Messages buckets (the same breakdown /context
  uses, estimated locally, no extra API calls).

The percentage is the status line's figure: the last response's input tokens over the model's window. It refreshes
after every model response. It does not touch the plan-usage ring.

## Install

In a Claude Code session (terminal), run:

```
/plugin install context-usage-indicator --marketplace andrewfrankel/claude-context
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it apply everywhere, the desktop app included).
The repository is private: you need GitHub access to it on the machine you install from.

## Verify

1. Start a new session. A ring with `0%` appears after the mode label (Auto) in the prompt footer.
2. Send a prompt. After the reply, the percentage matches `/context`.
3. Hover for used / max tokens; click the percentage for the System, Tools and Messages breakdown.

## Limits

- Shown on the desktop app and the terminal only (not VS Code or mobile).
- The percentage updates after each model response, not mid-stream; it starts at 0% until the first reply.
- The bucket figures are local estimates against the compaction window, so they need not sum to "Used".
- Card colors are fixed to match the dark plan-usage tooltip, so the card stays dark in light mode.
