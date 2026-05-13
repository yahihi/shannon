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
Agent SDK parity still have documented gaps.

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
| Publish package as `@humanlayer/shannon` | `package.json` name is `@humanlayer/shannon`, bin/export metadata exists. Not published. | Partial |
| Publish `@humanlayer/shannon-agent-sdk` | `packages/shannon-agent-sdk` exists and packs as a thin facade. Not published and not full Agent SDK parity. | Partial |
| Push public GitHub repo | repository metadata points at `humanlayer/shannon`; no release/push evidence in this checkout. | Missing |
| SDK `query()` | `src/sdk.ts` exports async iterable `query()`, JSONL parser, and option mapping. | Partial |
| Full zod schemas | Zod schemas are exported for the current Shannon SDK messages/options/query params; full Claude Agent SDK schema parity is not complete. | Partial |
| Every `claude -p` / Agent SDK feature | Broad flags are accepted/forwarded and tests exist, but exact stream fields, callbacks, MCP server objects, session stores, warm queries, and full schemas are incomplete. | Partial |
| Extensive conformance tests | Unit/learning tests, native `claude -p` fixture shape tests, and env-gated live Shannon tests exist. More fixture cases are still needed. | Partial |

## Verification Performed

- `bun test`
  - Passes: 29 tests.
  - Skips: 8 live tests unless `SHANNON_LIVE=1`.
- `bun run typecheck`
  - Passes.
- `bun pm pack --dry-run`
  - Passes for `@humanlayer/shannon`.
- `cd packages/shannon-agent-sdk && bun pm pack --dry-run`
  - Passes for `@humanlayer/shannon-agent-sdk`.
- `bun run pack:check`
  - Passes package dry-runs for both packages.
- CI:
  - `.github/workflows/ci.yml` runs install, tests, typecheck, and package
    dry-runs for both packages.
  - `.github/workflows/publish.yml` publishes both packages on GitHub release
    or manual dispatch when `NPM_TOKEN` is configured.
- `SHANNON_LIVE=1 bun test src/test/learning/shannon-live.test.ts`
  - Passes: 8 live tests.
  - Covers single-turn stream JSON and finite multi-turn stream JSON in one
    session, incremental stdin turns while stdin remains open, JSON array
    output, nonzero cost fields, reconstructed init tools, text-bearing
    assistant row selection, resume by session id, custom `--session-id`,
    `--continue`, `--fork-session` with a caller-provided fork session id,
    session consistency, result turns, metadata, and tmux cleanup.
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
- Commander-based parsing and broad Claude flag forwarding.
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
- `system/init.mcp_servers` reconstruction from durable interactive
  `mcp_instructions_delta` attachments when present.
- synthesized `system/hook_started` rows before translated hook responses.
- synthesized init/result rows and Shannon metadata row.
- approximate model/token cost reconstruction for known Claude model families.
- SDK facade with `query()`, async iterable stdout parsing, string prompts,
  async iterable user-message input, and option-to-flag mapping.
- SDK `AbortController` support for cancelling the Shannon subprocess.
- Zod schemas for current Shannon SDK message rows, native rate-limit event,
  option, and query parameter validation.
- Native `claude -p` text, json, and stream-json fixture shape tests for Haiku.
- `packages/shannon-agent-sdk` thin package facade for the implemented Shannon
  SDK surface.
- `system/init.tools` reconstruction from observed Claude Code built-in tool
  names plus known MCP tools for reconstructed `context7` and `morph-mcp`
  servers.
- Native-shaped `system/init` defaults for `apiKeySource`, `output_style`,
  `agents`, and `plugins`.
- MIT license file and package license metadata.
- GitHub Actions CI workflow for non-live verification.
- Release metadata and npm publish workflow for both package manifests.
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
  - `model` uses a transcript assistant model only when one is already
    available during session discovery; otherwise it is `"unknown"`.
  - `apiKeySource`, `output_style`, `agents`, and `plugins` are emitted with
    native-shaped defaults, but are not fully reconstructed from the running
    session.
  - native fields such as memory paths are not fully reconstructed.
- `rate_limit_event` is schema-covered from native fixtures but is not
  reconstructed from interactive transcripts.
- Exact billing parity is not guaranteed:
  - `total_cost_usd` and `modelUsage.*.costUSD` are estimated from transcript
    token usage for known Claude model families.
  - Pricing is based on the native Haiku fixture and current Anthropic API
    pricing table, not a persisted exact bill row in interactive transcripts.
- `--include-partial-messages` is accepted/forwarded but partial message stream
  rows are not synthesized from interactive transcripts.
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
  - custom session stores
  - warm query / prewarmed process behavior
  - custom process spawning
- full interruption API parity beyond subprocess cancellation
- Full resume/fork semantics need more live testing:
  - `--resume <session-id>` is live-tested.
  - `--continue` is live-tested.
  - `--session-id` is live-tested for a new caller-provided session id.
  - `--fork-session` is live-tested when resuming into a caller-provided fork
    session id.
- Zod schemas cover Shannon's current emitted message rows and SDK surface, but
  not the full Claude Agent SDK schema set yet.
- `@humanlayer/shannon-agent-sdk` exists as a thin facade, but it is not
  published and does not implement missing Agent SDK runtime features.
- No actual npm publish evidence or confirmed GitHub push from this checkout.

## Next Steps

1. Expand native `claude -p` fixture conformance tests for replayed user
   messages and additional hook/tool cases.
2. Improve `system/init` reconstruction from transcript/config surfaces and add
   field-level tests.
3. Research whether interactive transcripts expose rate-limit or exact billing
   data; implement if available, otherwise keep the estimator documented as an
   approximation.
4. Add Agent SDK-style control-channel semantics for interrupting/controlling
   in-flight turns.
5. Add SDK continue/fork/session live tests.
6. Decide whether unsupported Claude Agent SDK runtime features require a
   separate package/runtime, then document or implement that path.
7. Expand zod schemas to full Agent SDK parity; perform and verify npm publish
   and GitHub push when credentials/remotes are available.
