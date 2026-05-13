# Shannon Parity Matrix

Date: 2026-05-13

## Target Surfaces

Shannon has two parity targets:

1. `claude -p` CLI behavior for non-interactive prompt execution.
2. Claude Agent SDK `query()` ergonomics: async iterable message stream plus options mapping.

## Implemented CLI Surface

Core:

- `-p, --print <prompt>`
- positional prompt
- `--output-format=stream-json`
- `--output-format=json` as one JSON message array
- `--output-format=text`
- `--input-format=stream-json` for incremental user messages from stdin
- `--verbose`
- `--replay-user-messages`

Session/control flags accepted and forwarded to the underlying interactive
`claude` process:

- `--add-dir`
- `--agent`
- `--agents`
- `--allow-dangerously-skip-permissions`
- `--allowed-tools` / `--allowedTools`
- `--append-system-prompt`
- `--bare`
- `--betas`
- `--brief`
- `--chrome` / `--no-chrome`
- `--continue`
- `--dangerously-skip-permissions`
- `--debug`
- `--debug-file`
- `--disable-slash-commands`
- `--disallowed-tools` / `--disallowedTools`
- `--effort`
- `--exclude-dynamic-system-prompt-sections`
- `--fallback-model`
- `--file`
- `--fork-session`
- `--from-pr`
- `--ide`
- `--include-hook-events`
- `--include-partial-messages`
- `--json-schema`
- `--max-budget-usd`
- `--mcp-config`
- `--mcp-debug`
- `--model`
- `--name`
- `--no-session-persistence`
- `--path-to-claude-code-executable`
- `--permission-mode`
- `--plugin-dir`
- `--plugin-url`
- `--remote-control`
- `--remote-control-session-name-prefix`
- `--replay-user-messages`
- `--resume`
- `--session-id`
- `--setting-sources`
- `--settings`
- `--strict-mcp-config`
- `--system-prompt`
- `--tmux`
- `--tools`
- `--worktree`

## Implemented Stream Rows

- `system/hook_response` from interactive `hook_success` attachments.
- `system/hook_started` synthesized from interactive `hook_success`
  attachments.
- `system/init`, synthesized from transcript metadata.
  - `skills` and `slash_commands` are reconstructed from durable
    `skill_listing` attachments when present.
  - `mcp_servers` are reconstructed from durable `mcp_instructions_delta`
    attachments when present.
- `assistant`, translated from transcript assistant rows.
- `result/success`, synthesized from the assistant row.
- `shannon_session/metadata`, extra Shannon final row with transcript and cleanup data.

## Live Findings Added During Conformance Work

- Transcript discovery must bind by submitted prompt, not just newest transcript
  file. Concurrent Shannon runs in the same cwd can otherwise attach to each
  other's sessions.
- `tmux send-keys C-m` is more reliable than `Enter` after paste-buffer for
  submitting the prompt in Claude's input box.
- `--output-format=json` and `--output-format=text` should not emit the extra
  stream rows or final Shannon metadata row; those are stream-json-only.
- The current `--input-format=stream-json` implementation supports incremental
  sequential stdin user messages and `--replay-user-messages`.
- Native `--output-format=json` returns a JSON array of message rows, not only
  the terminal result; Shannon now buffers supported rows and emits one array.
- Resume by explicit session id appends to an existing transcript, so transcript
  discovery must scan existing project transcripts for the submitted prompt row
  with a timestamp after prompt submission.
- `--continue` also appends to the most recent cwd transcript and uses the same
  timestamp-bound discovery path. A caller-provided `--session-id` creates a
  transcript with that id.
- `--fork-session` with `--resume` and a caller-provided `--session-id` creates
  a new fork transcript with the requested child id.
- Interactive transcripts can persist thinking-only assistant rows immediately
  before text rows for the same model response. Shannon waits for a text-bearing
  assistant row before synthesizing `result` to avoid empty results.

## Known Gaps

- Native `claude -p` emits exact `system/init` tools, MCP server, model, agents,
  skills, slash commands, plugins, memory paths, and API key source.
  Interactive transcripts provide skill listings, MCP instruction deltas, and
  later assistant model data. Shannon reconstructs observed built-in tool names
  and known MCP tool names for `context7` and `morph-mcp`, and emits
  native-shaped defaults for `apiKeySource`, `output_style`, `agents`, and
  `plugins`. Interactive transcripts do not currently provide all fields in one
  durable row, so some init fields remain approximate.
- Native `claude -p` emits `rate_limit_event`; Shannon does not yet reconstruct
  this from transcript data.
- Native exact billed costs are not persisted in a directly equivalent
  interactive transcript row. Shannon estimates `result.total_cost_usd` and
  `modelUsage.*.costUSD` from transcript token usage for known Claude model
  families using Anthropic API pricing. This is closer to native output but is
  still documented as an estimate.
- Full Agent SDK control-channel bidi is not implemented yet. Shannon's current
  CLI and SDK support incremental stdin/async user messages, sent sequentially
  through one interactive session.
- Programmatic permission callbacks, MCP SDK server instances, hook callback
  functions, custom process spawning, warm query sessions, and session stores
  require an in-process SDK runtime, not just CLI flag forwarding.

## Conformance Strategy

- Unit-level conformance tests cover argument parsing, SDK option-to-flag
  mapping, transcript row translation, JSONL parsing, native rate-limit event
  schema validation, structured schemas for emitted stream rows, and metadata
  shape.
- Live smoke tests compare the real `shannon -p ... --output-format=stream-json
  --verbose` path, incremental multi-turn stdin path, JSON array output, and
  `--resume <session-id>` against the expected contract and verify tmux cleanup.
- Unit tests cover signal exit-code mapping and pre-start SDK abort behavior.
- Redacted native `claude -p --model haiku` fixtures cover `text`, `json`, and
  `stream-json --verbose`. The stream fixture captures the current native event
  family: `hook_started`, `hook_response`, rich `init`, assistant chunks,
  `rate_limit_event`, and `result`.
- Future parity work should add fixtures from native `claude -p` for each flag
  family and assert Shannon either matches the row shape or documents the
  transcript limitation.
