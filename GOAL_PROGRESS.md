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
- The SDK exposes `query()` from `@humanlayer/shannon` with async iterable
  behavior similar to Claude Agent SDK.
- Added spec scope is tracked: dependency validation, Commander CLI parsing,
  npm package shape, GitHub/npm release work, SDK/schema support, and growing
  conformance tests.

## GUIDANCE - HOW TO BUILD PARITY TESTS

run the claude -p or claude-agent-sdk example once
generate a snapshot of all behavior - output on stdio, output from sdk stream, changes to file states on disk
capture this as a test case

create a shannon -p test case with identical input params/flags that tests the shape of all the output (no string-for-string matching on exact tool calls or final messages, as that's non-deterministic)


ALWAYS USE `--model haiku` and `model: haiku` for all test case generation and execution of both claude dataset generation and executing the shannon test set

## Current Status

Not full parity yet. The core CLI/SDK prototype is working and live-tested for
single-turn and finite multi-turn prompts, but exact `claude -p` and full Claude
Agent SDK parity still have documented gaps.

## Evidence Checklist

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Use interactive `claude`, not `claude -p` | `index.ts` starts `tmux new-session ... claude ...`; no internal `claude -p` launch. | Implemented |
| Open a new tmux session | `runShannon()` creates `shannon-<uuid>` tmux session. | Implemented |
| Launch Claude CLI there | `tmux new-session -d -s ... -c <cwd> claude ...`. | Implemented |
| Discover session id | `waitForSessionWithPrompt()` finds the new transcript under `~/.claude/projects/<cwd-key>/<session>.jsonl` and derives the id from the filename. | Implemented |
| Stream JSONL events | `stream-json` emits optional hook responses, `system/init`, `assistant`, `result`, and final Shannon metadata. | Partial parity |
| Kill tmux / print session info | `finally` kills tmux; `shannon_session/metadata` includes session id, transcript path, tmux session, cwd, and cleanup status. | Implemented |
| Conversation continuation | Finite multi-turn stdin is live-tested in one session; true live bidi and full resume semantics remain. | Partial |
| Validate `claude` and `tmux` | `validateRuntime()` and tests. Local versions: Claude Code `2.1.140`, tmux `3.6a`. | Implemented |
| Surface login/setup errors | prompt/transcript timeouts include `tmux capture-pane` output. | Partial |
| Cleanup on interruption | SIGINT/SIGTERM handlers share the tmux cleanup path and use conventional exit codes. | Implemented |
| Use Commander | `parseArgs()` uses `commander`. | Implemented |
| Publish package as `@humanlayer/shannon` | `package.json` name is `@humanlayer/shannon`, bin/export metadata exists. Not published. | Partial |
| Publish `@humanlayer/shannon-agent-sdk` | Not present. | Missing |
| Push public GitHub repo | repository metadata points at `humanlayer/shannon`; no release/push evidence in this checkout. | Missing |
| SDK `query()` | `src/sdk.ts` exports async iterable `query()`, JSONL parser, and option mapping. | Partial |
| Full zod schemas | Zod schemas are exported for the current Shannon SDK messages/options/query params; full Claude Agent SDK schema parity is not complete. | Partial |
| Every `claude -p` / Agent SDK feature | Broad flags are accepted/forwarded and tests exist, but exact stream fields, callbacks, MCP server objects, session stores, warm queries, and full schemas are incomplete. | Partial |
| Extensive conformance tests | Unit/learning tests, a native `claude -p` fixture shape test, and env-gated live Shannon tests exist. More fixture cases are still needed. | Partial |

## Verification Performed

- `bun test`
  - Passes: 19 tests.
  - Skips: 2 live tests unless `SHANNON_LIVE=1`.
- `bun run typecheck`
  - Passes.
- `SHANNON_LIVE=1 bun test src/test/learning/shannon-live.test.ts`
  - Passes: 2 live tests.
  - Covers single-turn stream JSON and finite multi-turn stream JSON in one
    session, session consistency, result turns, metadata, and tmux cleanup.
- Native fixture:
  - `src/test/fixtures/claude-p-haiku-stream-json.fixture.jsonl`
  - Generated once with `claude -p ... --model haiku --output-format=stream-json --verbose`.
  - Redacted to preserve shape without storing model thinking/signatures or
    machine-specific full tool/plugin inventories.
- Runtime availability:
  - `claude`: `/Users/dex/.local/bin/claude`
  - `tmux`: `/Users/dex/homebrew/bin/tmux`
  - `claude --version`: `2.1.140 (Claude Code)`
  - `tmux -V`: `tmux 3.6a`

## Implemented

- CLI entrypoint with `#!/usr/bin/env bun`.
- `shannon -p`, positional prompt, text stdin, and finite
  `--input-format=stream-json`.
- `--output-format=stream-json`, `json`, and `text`.
- `--replay-user-messages`.
- Commander-based parsing and broad Claude flag forwarding.
- tmux lifecycle management and cleanup in `finally`.
- SIGINT/SIGTERM cleanup for the active tmux session.
- prompt-bound transcript discovery to avoid attaching to another concurrent
  Shannon run in the same cwd.
- transcript row translation for assistant rows and hook success attachments.
- synthesized init/result rows and Shannon metadata row.
- SDK facade with `query()`, async iterable stdout parsing, string prompts,
  async iterable user-message input, and option-to-flag mapping.
- SDK `AbortController` support for cancelling the Shannon subprocess.
- Zod schemas for current Shannon SDK message, option, and query parameter
  validation.
- Native `claude -p` stream-json fixture shape test for Haiku.
- Live conformance tests for single-turn and finite multi-turn execution.
- README usage for CLI and SDK.

## Known Gaps

- `system/init` is approximate:
  - `tools` is `[]`.
  - `mcp_servers` is `[]`.
  - `model` uses a transcript assistant model only when one is already
    available during session discovery; otherwise it is `"unknown"`.
  - native fields such as slash commands, agents, skills, plugins,
    `apiKeySource`, memory paths, and output style are not fully reconstructed.
- `rate_limit_event` is not reconstructed.
- Exact cost parity is missing:
  - `total_cost_usd` is `0`.
  - `modelUsage.*.costUSD` is `0`.
- `--include-partial-messages` is accepted/forwarded but partial message stream
  rows are not synthesized from interactive transcripts.
- Hook lifecycle parity is partial:
  - `hook_response` is translated from durable `hook_success` attachments.
  - `hook_started` has not been observed as a durable interactive transcript row.
- `--input-format=stream-json` supports finite multi-turn input, not open-ended
  live bidirectional stdin.
- SDK callback/runtime features are missing:
  - permission callbacks / `canUseTool`
  - SDK MCP server instances
  - hook callback functions
  - custom session stores
  - warm query / prewarmed process behavior
  - custom process spawning
- full interruption API parity beyond subprocess cancellation
- Full resume/fork semantics need live testing:
  - `--resume`
  - `--continue`
  - `--fork-session`
  - `--session-id`
- Zod schemas cover Shannon's current SDK surface, but not the full Claude
  Agent SDK schema set yet.
- No `@humanlayer/shannon-agent-sdk` package yet.
- No CI, license, npm publish evidence, or confirmed GitHub push from this
  checkout.

## Next Steps

1. Expand native `claude -p` fixture conformance tests for `text`, `json`,
   replayed user messages, and additional hook/tool cases.
2. Improve `system/init` reconstruction from transcript/config surfaces and add
   field-level tests.
3. Research whether interactive transcripts expose rate-limit or exact cost
   data; implement if available, otherwise document the hard limitation.
4. Add true live bidi stdin instead of finite stdin sequencing.
5. Add SDK resume/continue/session live tests.
6. Decide whether unsupported Claude Agent SDK runtime features require a
   separate package/runtime, then document or implement that path.
7. Expand zod schemas to full Agent SDK parity; add CI, license, release
   metadata, and npm publishing workflow.
