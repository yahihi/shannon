# Claude CLI Learning Notes

Date: 2026-05-13

## Goal

Build the first `shannon -p "PROMPT" --output-format=stream-json --verbose`
prototype without using `claude -p` internally.

## `claude -p` Stream Shape

Probe:

```sh
claude -p "Reply with exactly: shannon probe" --output-format=stream-json --verbose
```

Observed JSONL event types:

- `system` / `hook_started`
- `system` / `hook_response`
- `system` / `init`
- `assistant`
- `rate_limit_event`
- `result` / `success`

Every emitted line included the same `session_id`.

The final native `result` row contains:

- `type: "result"`
- `subtype: "success"`
- `is_error: false`
- `duration_ms`
- `duration_api_ms`
- `num_turns`
- `result`
- `session_id`
- `total_cost_usd`
- `usage`
- `modelUsage`
- `terminal_reason`
- `uuid`

## Transcript Location

For cwd `/Users/dex/repos/dexhorthy/shannon`, Claude writes transcripts under:

```text
~/.claude/projects/-Users-dex-repos-dexhorthy-shannon/
```

The transcript filename is:

```text
<session-id>.jsonl
```

## Interactive Tmux Probe

Commands:

```sh
tmux new-session -d -s shannon-probe-1 -c /Users/dex/repos/dexhorthy/shannon claude
tmux send-keys -t shannon-probe-1 "Reply with exactly: shannon tmux probe" Enter
tmux kill-session -t shannon-probe-1
```

Observed:

- A new transcript appeared as
  `~/.claude/projects/-Users-dex-repos-dexhorthy-shannon/a5588398-a4bc-402d-a2b4-3f1707abf9e7.jsonl`.
- Interactive transcript rows use `entrypoint: "cli"`.
- The assistant response is persisted as a row with `type: "assistant"` and a nested Anthropic message.
- Interactive mode writes a `system` / `turn_duration` row after the assistant message.
- Interactive mode does not write a `result` row, so Shannon must synthesize one for `-p` compatibility.
- Interactive hook execution is persisted as an `attachment` row with
  `attachment.type: "hook_success"`, `hookName`, `hookEvent`, `toolUseID`,
  `stdout`, `stderr`, and `exitCode`. Shannon can translate this to a
  `system` / `hook_response` stream row. There is no observed durable
  `hook_started` row in the interactive transcript, so Shannon does not
  synthesize one yet.

## SDK Internals

The installed `@anthropic-ai/claude-agent-sdk@0.2.140` `query()` implementation spawns the Claude Code executable and writes SDK user messages to the subprocess transport. It sets:

- `CLAUDE_AGENT_SDK_VERSION`
- `CLAUDE_CODE_ENTRYPOINT=sdk-ts`

The SDK exposes `query({ prompt, options })` as an async iterable of SDK messages.

## Prototype Direction

First working implementation:

1. Start `claude` in a new detached tmux session.
2. Wait until the Claude input prompt is visible in tmux.
3. Paste the prompt into the tmux pane and press Enter.
4. Wait until a new transcript file appears for the current cwd.
5. Tail the transcript until the assistant response for that prompt appears.
6. Emit approximate SDK-compatible JSONL:
   - `system/hook_response` translated from interactive hook success attachments.
   - `system/init` synthesized from transcript metadata.
   - `assistant` translated from the transcript row.
   - `result/success` synthesized from the assistant text and usage.
   - `shannon/session` extra final metadata row with session id, transcript path, project folder, tmux session, and cleanup status.
7. Kill the tmux session in `finally`.

Important correction from the first implementation: interactive Claude does not
create the project transcript immediately on process launch. In observed runs,
the transcript appears after the first prompt is submitted.

## Startup Validation

Spec follow-up items added after the initial goal called out dependency and
setup validation. Current local probes:

```sh
claude --version
# 2.1.140 (Claude Code)

tmux -V
# tmux 3.6a
```

Local auth/config surface exists:

- `~/.claude.json`
- `~/.claude/settings.json`
- `~/.claude/projects/`

Prototype behavior:

- Check `claude` and `tmux` are on `PATH` before launching.
- If Claude does not reach an input prompt or does not create a transcript,
  include `tmux capture-pane` output in the thrown error. This should surface
  login/setup screens without needing special-case parsing yet.

## CLI Parsing

The spec asks to use Commander for CLI flags and command tree parsing. Shannon
now uses `commander` while preserving the target invocation:

```sh
shannon -p "hi" --output-format=stream-json --verbose
```

## SDK Facade

The first SDK-facing API mirrors Claude Agent SDK's async-iterable shape:

```ts
import { query } from "@humanlayer/shannon";

for await (const message of query({
  prompt: "hi",
  options: { outputFormat: "stream-json", verbose: true },
})) {
  console.log(JSON.stringify(message));
}
```

Implementation note: this SDK facade shells out to the `shannon` executable and
parses JSONL from stdout. That keeps SDK behavior aligned with the CLI wrapper
and avoids using `claude -p` or `@anthropic-ai/claude-agent-sdk` internally.
