# Goal Progress

Date: 2026-05-13

## Objective

Keep working on `spec-01.md` and `GOAL_PROGRESS.md` until Shannon has full
parity with the requested CLI and SDK wrapper behavior.

Full parity means:

- `shannon -p "..." --output-format=stream-json --verbose` runs without using
  `claude -p` internally.
- Shannon launches interactive `claude` in tmux, sends prompts, discovers the
  Claude session id/transcript, emits Claude-like JSONL, and cleans up.
- The SDK exposes `query()` from the Shannon package with async iterable
  behavior similar to Claude Agent SDK.
- Added spec scope is tracked: dependency validation, Commander CLI parsing,
  npm package shape, GitHub/npm release work, SDK/schema support, and growing
  conformance tests.
- SDK runtime parity follows the new bidirectional bridge design:
  Shannon injects generated `--settings '{...json...}'` into interactive Claude
  to hard-code bridge MCP servers/hooks while preserving normal Claude settings
  source merging; the injected stdio MCP bridge communicates back to the
  Shannon host over a Unix socket using oRPC.
- after every meaningful change, ensure the tests pass and then add+commit your changes

## GUIDANCE - HOW TO BUILD PARITY TESTS

run the claude -p or claude-agent-sdk example once
generate a snapshot of all behavior - output on stdio, output from sdk stream, changes to file states on disk
capture this as a test case

create a shannon -p test case with identical input params/flags that tests the shape of all the output (no string-for-string matching on exact tool calls or final messages, as that's non-deterministic)


ALWAYS USE `--model haiku` and `model: haiku` for all test case generation and execution of both claude dataset generation and executing the shannon test set

## Current Status

Not full parity yet. The core CLI/SDK prototype is working and live-tested for
single-turn and finite multi-turn prompts, but exact `claude -p` and full Claude
Agent SDK parity still have documented gaps. The intended path for the remaining
SDK runtime features is now the generated `--settings` bridge design in
`spec-01.md`: inject a Shannon stdio MCP bridge plus required hooks into
interactive Claude, and use oRPC over a per-session Unix socket back to the
Shannon host.

## Evidence Checklist

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Use interactive `claude`, not `claude -p` | `index.ts` starts `tmux new-session ... claude ...`; no internal `claude -p` launch. | Implemented |
| Open a new tmux session | `runShannon()` creates `shannon-<uuid>` tmux session. | Implemented |
| Launch Claude CLI there | `tmux new-session -d -s ... -c <cwd> claude ...`. | Implemented |
| Discover session id | `waitForSessionWithPrompt()` finds the new transcript under `~/.claude/projects/<cwd-key>/<session>.jsonl` and derives the id from the filename. | Implemented |
| Stream JSONL events | `stream-json` emits optional hook lifecycle rows, `system/init`, `assistant`, `result`, and final Shannon metadata. | Partial parity |
| Kill tmux / print session info | `finally` kills tmux; `shannon_session/metadata` includes session id, transcript path, tmux session, cwd, and cleanup status. | Implemented |
| Conversation continuation | Incremental multi-turn stdin and resume by session id are live-tested; full Agent SDK control semantics remain partial. | Partial |
| Validate `claude` and `tmux` | `validateRuntime()` and tests. Local versions: Claude Code `2.1.140`, tmux `3.6a`. | Implemented |
| Surface login/setup errors | prompt/transcript timeouts include `tmux capture-pane` output. | Partial |
| Cleanup on interruption | SIGINT/SIGTERM handlers share the tmux cleanup path and use conventional exit codes. | Implemented |
| Use Commander | `parseArgs()` uses `commander`. | Implemented |
| Publish package | Current package metadata is `@dexh/shannon`; npm reports `@dexh/shannon@0.0.2`. Original spec named `@humanlayer/shannon`, so namespace parity depends on the chosen package target. | Partial |
| Publish agent SDK facade | Current package metadata is `@dexh/shannon-agent-sdk`; npm reports `@dexh/shannon-agent-sdk@0.0.1`. Full Agent SDK parity is still incomplete. | Partial |
| Push public GitHub repo | `git push origin main` succeeded on `git@github.com:dexhorthy/shannon.git`. Original spec named `humanlayer/shannon`, so repo namespace parity depends on the chosen target. | Partial |
| SDK `query()` | `src/sdk.ts` exports async iterable `query()`, JSONL parser, and option mapping for all currently forwarded Shannon CLI flags. | Partial |
| Full zod schemas | Zod schemas are exported for the current Shannon SDK messages/options/query params; full Claude Agent SDK schema parity is not complete. | Partial |
| Bidirectional SDK bridge | `spec-01.md` now defines generated `--settings` injection for bridge MCP servers/hooks plus oRPC over a Unix socket; implementation is not started. | Planned |
| Every `claude -p` / Agent SDK feature | Broad flags are accepted/forwarded and tests exist, but exact stream fields, callbacks, MCP server objects, session stores, warm queries, and full schemas are incomplete. | Partial |
| Extensive conformance tests | Unit/learning tests, native `claude -p` fixture shape tests, and env-gated live Shannon tests exist. More fixture cases are still needed. | Partial |

## Verification Performed

- `bun test`
  - Passes: 37 tests.
  - Skips: 11 live tests unless `SHANNON_LIVE=1`.
- `bun run typecheck`
  - Passes.
- `bun pm pack --dry-run`
  - Passes for `@dexh/shannon`.
- `cd packages/shannon-agent-sdk && bun pm pack --dry-run`
  - Passes for `@dexh/shannon-agent-sdk`.
- `bun run pack:check`
  - Passes package dry-runs for both packages.
- `bun test src/test/learning/shannon-sdk.test.ts`
  - Passes: 10 tests.
  - Covers SDK query parsing/options/cancellation, local transcript session
    reads/lists/forks, custom `SessionStore` reads/lists/forks/mutations,
    local subagent reads/lists, local rename/tag/delete mutation helpers, and
    exported schemas.
- `./bin/shannon.mjs -p "Reply with exactly: shannon bin wrapper" --model haiku --output-format=text`
  - Passes and prints `shannon bin wrapper`.
- `cd examples/hello-world && bun run start`
  - Passes and prints `hello`.
- `bun pm view @dexh/shannon version`
  - Reports `0.0.2`.
- `bun pm view @dexh/shannon-agent-sdk version`
  - Reports `0.0.1`.
- `git push origin main`
  - Succeeds for the current local `main` branch.
- CI:
  - `.github/workflows/ci.yml` runs install, tests, typecheck, and package
    dry-runs for both packages.
  - `.github/workflows/publish.yml` publishes both packages on GitHub release
    or manual dispatch when `NPM_TOKEN` is configured.
- `SHANNON_LIVE=1 bun test src/test/learning/shannon-live.test.ts`
  - Passes: 11 live tests.
  - Covers single-turn stream JSON and finite multi-turn stream JSON in one
    session, incremental stdin turns while stdin remains open, JSON array
    output, nonzero cost fields, reconstructed init tools, text-bearing
    assistant row selection, resume by session id, custom `--session-id`,
    `--continue`, `--fork-session` with a caller-provided fork session id,
    synthesized partial stream events, SDK `query()` custom session id, resume,
    continue, and fork, session consistency, result turns, metadata, and tmux
    cleanup.
- Native fixture:
  - `src/test/fixtures/claude-p-haiku-stream-json.fixture.jsonl`
  - `src/test/fixtures/claude-p-haiku-json.fixture.json`
  - `src/test/fixtures/claude-p-haiku-text.fixture.txt`
  - Generated once with `claude -p ... --model haiku` and the relevant
    `--output-format`.
  - Redacted to preserve shape without storing model thinking/signatures or
    machine-specific full tool/plugin inventories.
- Runtime availability:
  - `claude`: `/Users/dex/.local/bin/claude`
  - `tmux`: `/Users/dex/homebrew/bin/tmux`
  - `claude --version`: `2.1.140 (Claude Code)`
  - `tmux -V`: `tmux 3.6a`

## Implemented

- CLI entrypoint with `#!/usr/bin/env bun`.
- `shannon -p`, positional prompt, text stdin, and incremental
  `--input-format=stream-json`.
- `--output-format=stream-json`, `json`, and `text`.
- `--output-format=json` now emits one JSON array of supported message rows,
  matching native `claude -p` output framing.
- `--replay-user-messages`.
- Commander-based parsing and broad Claude flag forwarding, including current
  interactive session flags observed in `claude --help`.
- Custom Claude executable path support via `--path-to-claude-code-executable`
  and SDK `pathToClaudeCodeExecutable`.
- tmux lifecycle management and cleanup in `finally`.
- SIGINT/SIGTERM cleanup for the active tmux session.
- prompt-bound transcript discovery to avoid attaching to another concurrent
  Shannon run in the same cwd.
- timestamp-aware transcript discovery for resumed sessions that append to an
  existing transcript file.
- transcript row translation for assistant rows and hook success attachments.
- assistant reply discovery waits for text-bearing assistant rows so
  thinking-only transcript chunks do not produce empty synthesized results.
- `system/init.skills` and `system/init.slash_commands` reconstruction from
  durable interactive `skill_listing` attachments.
- `system/init.plugins` reconstruction from plugin source markers in durable
  interactive `skill_listing` attachments when present.
- `system/init.mcp_servers` reconstruction from durable interactive
  `mcp_instructions_delta` attachments when present.
- `system/init.model` uses the transcript assistant model when available, or
  the requested `--model` value before an assistant row has been observed.
- `system/init.permissionMode` uses the transcript user row value when
  available, durable `permission-mode` transcript rows, or the requested
  `--permission-mode` value before those rows expose it.
- synthesized `system/hook_started` rows before translated hook responses.
- synthesized `stream_event` partial assistant rows from the final assistant
  text when `--include-partial-messages` is requested; the flag is handled by
  Shannon instead of being forwarded to interactive Claude.
- synthesized init/result rows and Shannon metadata row.
- approximate model/token cost reconstruction for known Claude model families.
- `result.duration_ms` / `duration_api_ms` use durable transcript
  `system/turn_duration.durationMs` rows when available, with wall-clock
  fallback after a short grace wait.
- SDK facade with `query()`, async iterable stdout parsing, string prompts,
  async iterable user-message input, and option-to-flag mapping for every
  Shannon CLI flag currently forwarded to Claude.
- SDK `env` support for passing environment variables into the Shannon
  subprocess and inherited Claude process.
- SDK `AbortController` support for cancelling the Shannon subprocess.
- SDK `query()` returns an Agent SDK-like async iterable object with
  `interrupt()` and `close()` methods wired to subprocess cancellation.
- SDK local session helpers: `getSessionMessages()`, `getSessionInfo()`, and
  `listSessions()` read Claude transcript files for local session inspection.
- SDK local `forkSession()` copies a transcript to a new session id and rewrites
  persisted session id fields.
- SDK local `renameSession()`, `tagSession()`, and `deleteSession()` mutate
  local Claude transcript state using native-shaped `custom-title` and `tag`
  rows, and remove the transcript plus same-id sidecar directory for deletes.
- SDK local `listSubagents()` and `getSubagentMessages()` read persisted
  subagent transcripts from Claude's native
  `<project>/<session>/subagents/agent-<id>.jsonl` layout.
- SDK session inspection and mutation helpers accept custom `SessionStore`
  adapters for main session reads/lists/forks, subagent reads/lists, and
  rename/tag/delete operations.
- Zod schemas for current Shannon SDK message rows, native rate-limit event,
  selected additional Agent SDK stream/control variants, option, and query
  parameter validation.
- Native `claude -p` text, json, and stream-json fixture shape tests for Haiku.
- `packages/shannon-agent-sdk` thin package facade for the implemented Shannon
  SDK surface.
- Architecture spec for the remaining SDK runtime parity path:
  generated `--settings` injection, stdio `shannon-mcp-bridge`, command-hook
  fallback through the same bridge binary, and oRPC over a per-session Unix
  socket back to the Shannon host.
- `system/init.tools` reconstruction from observed Claude Code built-in tool
  names plus known MCP tools for reconstructed `context7` and `morph-mcp`
  servers.
- Native-shaped `system/init` defaults for `apiKeySource`, `output_style`,
  `agents`, and `plugins`.
- MIT license file and package license metadata.
- GitHub Actions CI workflow for non-live verification.
- Release metadata and npm publish workflow for both package manifests.
- Published package bin wrapper at `bin/shannon.mjs`, verified against the local
  CLI path.
- `examples/hello-world` SDK example that exercises `query()` through the
  published package entrypoint.
- Live conformance tests for single-turn and finite multi-turn execution.
- README usage for CLI and SDK.

## Known Gaps

- `system/init` is approximate:
  - `tools` includes observed built-in Claude Code tool names and known MCP
    tools for reconstructed `context7` and `morph-mcp` servers, but is not yet
    dynamically recovered from an exact native init row.
  - `mcp_servers` are reconstructed from durable MCP instruction deltas when
    present; exact native status values such as `needs-auth` are not fully
    reconstructed.
  - `model` uses a transcript assistant model when available and falls back to
    the requested `--model` value, but can still be `"unknown"` if neither
    source is present.
  - `permissionMode` uses the transcript user row value, durable
    `permission-mode` rows, or requested `--permission-mode`, but can still be
    `"unknown"` if none of those sources is present.
  - `plugins` are reconstructed from skill listing source markers when present,
    but path/source metadata is still less detailed than native plugin rows.
  - `apiKeySource`, `output_style`, and `agents` are emitted with native-shaped
    defaults, but are not fully reconstructed from the running session.
  - native fields such as memory paths are not fully reconstructed.
- `rate_limit_event` is schema-covered from native fixtures but is not
  reconstructed from interactive transcripts.
- Exact billing parity is not guaranteed:
  - `total_cost_usd` and `modelUsage.*.costUSD` are estimated from transcript
    token usage for known Claude model families.
  - Pricing is based on the native Haiku fixture and current Anthropic API
    pricing table, not a persisted exact bill row in interactive transcripts.
  - result durations use durable transcript `turn_duration` rows when present,
    but may still fall back to wall-clock timing if the row is not observed
    within the short post-assistant grace wait.
- `--include-partial-messages` emits synthesized full-text partial
  `stream_event` rows, but does not provide true token-by-token native deltas
  because interactive transcripts do not persist those chunks.
- Hook lifecycle parity is partial:
  - `hook_started` is synthesized from durable `hook_success` attachments.
  - `hook_response` is translated from durable `hook_success` attachments.
  - Other hook lifecycle variants have not been observed as durable interactive
    transcript rows.
- `--input-format=stream-json` supports incremental sequential stdin turns.
  It does not yet expose full Agent SDK control-channel semantics such as
  interrupting an in-flight turn.
- SDK callback/runtime features are missing:
  - permission callbacks / `canUseTool`
  - SDK MCP server instances
  - hook callback functions
  - warm query / prewarmed process behavior
  - custom process spawning
- The generated `--settings` bridge is specified but not implemented:
  - no `shannon-mcp-bridge` binary yet
  - no oRPC Unix-socket host server yet
  - no generated settings merge/injection tests yet
  - no bridge-based `canUseTool`, hooks, SDK MCP servers, elicitation,
    partial-message, or session-store mirroring yet
- SDK custom `SessionStore` support is limited to direct helper calls; Shannon
  `query()` does not yet mirror live subprocess transcript writes into a custom
  store.
- SDK session helpers do not implement file-history snapshots, subagent
  transcript chain reconstruction, or subagent fork semantics.
- full interruption API parity beyond SDK `interrupt()`/`close()` subprocess
  cancellation
- Full resume/fork semantics still need broader edge-case testing:
  - `--resume <session-id>` is live-tested.
  - `--continue` is live-tested.
  - `--session-id` is live-tested for a new caller-provided session id.
  - `--fork-session` is live-tested when resuming into a caller-provided fork
    session id.
  - SDK `query()` custom session id, resume, continue, and fork are live-tested.
- Zod schemas cover Shannon's current emitted message rows, selected additional
  Agent SDK stream/control variants, and SDK surface, but not the full Claude
  Agent SDK schema set yet.
- `@dexh/shannon-agent-sdk` exists and is published as a thin facade, but it
  does not implement missing Agent SDK runtime features.
- Publishing the current source package revisions is blocked on npm 2FA; an
  attempted publish of `@dexh/shannon@0.0.3` returned `EOTP` and requires an
  OTP before version bumps can be committed safely.
- Original spec names `@humanlayer/*` npm packages and `humanlayer/shannon` as
  the public repo. Current committed package metadata and pushed remote use
  `@dexh/*` and `dexhorthy/shannon`; if the original namespace is still required,
  those publish/push targets remain incomplete.

## Next Steps

1. Implement generated `--settings` construction and merge tests for bridge MCP
   servers/hooks while preserving normal Claude settings-source behavior.
2. Add `shannon-mcp-bridge` and the oRPC Unix-socket contract/server.
3. Implement bridge-backed `canUseTool` first, then hooks, SDK MCP server
   instances, elicitation, partial events, and session-store mirroring.
4. Expand native `claude -p` fixture conformance tests for replayed user
   messages and additional hook/tool cases.
5. Improve `system/init` reconstruction from transcript/config surfaces and add
   field-level tests.
6. Research whether interactive transcripts expose rate-limit or exact billing
   data; implement if available, otherwise keep the estimator documented as an
   approximation.
7. Add Agent SDK-style control-channel semantics for interrupting/controlling
   in-flight turns.
8. Add more resume/fork negative and cross-cwd edge-case live tests.
9. Expand zod schemas to full Agent SDK parity; perform and verify npm publish
   and GitHub push when credentials/remotes are available.
