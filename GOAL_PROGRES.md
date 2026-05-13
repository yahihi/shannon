# Goal Progress

Date: 2026-05-13

## Goal

Build Shannon into a CLI and SDK wrapper around the interactive `claude` CLI
that can match `claude -p` and Claude Agent SDK behavior without using
`claude -p` or `@anthropic-ai/claude-agent-sdk` internally.

## Current Status

Not done. Shannon has a working CLI and SDK prototype with several important
parity slices implemented, but full parity with `claude -p` and Claude Agent SDK
still has known gaps.

## Implemented

- `shannon -p "PROMPT" --output-format=stream-json --verbose`
  - Launches interactive `claude` in a detached tmux session.
  - Sends the prompt through tmux.
  - Finds the Claude transcript under `~/.claude/projects/<project-key>/`.
  - Emits stream JSON rows.
  - Kills the tmux session in `finally`.
  - Emits final `shannon_session` metadata with session id, transcript path,
    project folder, tmux session name, cwd, and cleanup status.

- Output formats:
  - `--output-format=stream-json`
  - `--output-format=json`
  - `--output-format=text`

- Input formats:
  - `-p` / `--print`
  - positional prompt
  - `--input-format=stream-json` for finite stdin user messages
  - `--replay-user-messages`

- CLI parsing:
  - Uses `commander`.
  - Accepts and forwards a broad set of Claude-compatible flags to the
    underlying interactive `claude` launch.

- Runtime checks:
  - Validates that `claude` and `tmux` are on `PATH`.
  - Startup/transcript timeout errors include `tmux capture-pane` output so
    login/setup screens are visible.

- Transcript translation:
  - Translates interactive `hook_success` attachment rows into
    `system/hook_response`.
  - Synthesizes `system/init`.
  - Translates assistant transcript rows into SDK-ish `assistant` rows.
  - Synthesizes `result/success`.
  - Extracts text from Anthropic content blocks.

- Concurrency hardening:
  - Transcript discovery binds by the submitted prompt, not just newest file.
    This fixed cross-session confusion when two Shannon runs happen in the same
    cwd.
  - Prompt submission uses `tmux send-keys C-m`, which was more reliable than
    `Enter` after `paste-buffer`.

- SDK facade:
  - `src/sdk.ts` exports `query()`.
  - `query()` returns an async iterable of parsed JSONL messages.
  - Supports string prompt input.
  - Supports async iterable user-message input for finite multi-message runs.
  - Maps common SDK-like options to Shannon CLI flags.

- Packaging:
  - Package renamed to `@dexhorthy/shannon`.
  - Exports:
    - `.` -> `src/sdk.ts`
    - `./cli` -> `index.ts`
  - Bin:
    - `shannon` -> `index.ts`
  - `bun pm pack --dry-run` packages only:
    - `package.json`
    - `README.md`
    - `index.ts`
    - `src/sdk.ts`

## Research Files

- `spec-01.md`
  - Main product/spec document.
  - Updated SDK snippet to use `@dexhorthy/shannon`.

- `docs/research/2026-05-13-claude-cli-learning.md`
  - Captures black-box observations from `claude -p`.
  - Captures interactive tmux transcript behavior.
  - Documents transcript location and session id discovery.
  - Documents SDK internals observed from installed
    `@anthropic-ai/claude-agent-sdk`.

- `docs/research/2026-05-13-parity-matrix.md`
  - Current parity matrix.
  - Lists implemented CLI surface.
  - Lists implemented stream rows.
  - Lists known gaps.
  - Captures live findings from conformance work.

## Relevant Source Files

- `index.ts`
  - CLI entrypoint.
  - Commander parser.
  - tmux lifecycle.
  - transcript discovery.
  - transcript-to-stream translation.
  - output formatting.

- `src/sdk.ts`
  - Public SDK facade.
  - `query()` async iterable.
  - JSONL parser.
  - SDK option-to-CLI flag mapping.
  - async iterable user input writer.

- `src/test/learning/shannon-transcript.test.ts`
  - Learning/conformance tests for CLI parsing, transcript mapping, metadata,
    runtime validation, stream-json input extraction, and user replay.

- `src/test/learning/shannon-sdk.test.ts`
  - Learning/conformance tests for JSONL parsing and SDK option mapping.

- `src/test/learning/claude-sdk.ts`
  - Learning test for the real Claude Agent SDK.
  - Skips without `ANTHROPIC_API_KEY`.

- `README.md`
  - User-facing CLI and SDK usage.
  - Includes stdin JSONL and async iterable examples.

- `package.json`
  - Package metadata, bin, exports, scripts, publish file list.

## Verification Performed

- `bun test`
  - Passing: 14 tests.

- `bun run typecheck`
  - Passing.

- `bun pm pack --dry-run`
  - Passing.
  - Packs 4 files.

- Live CLI smoke tests performed during the session:
  - `shannon -p ... --output-format=stream-json --verbose`
  - `shannon -p ... --output-format=json --verbose`
  - `shannon -p ... --output-format=text --verbose`
  - `shannon --input-format=stream-json --output-format=stream-json --verbose --replay-user-messages`
  - SDK `query()` with string prompt.
  - SDK `query()` with async iterable prompt.

- Cleanup checks:
  - `tmux ls` shows no leftover Shannon tmux session at this checkpoint.

## Important Debugging Notes

- Interactive Claude does not create the transcript immediately at process
  launch. It creates it after the first prompt is submitted.

- Transcript discovery by newest file is unsafe. Concurrent runs in the same cwd
  can produce cross-session attachment. Discovery now scans new transcripts for
  the submitted prompt.

- A multi-turn finite stdin test exposed a cursor bug: by the time transcript
  discovery returned, the first assistant response was already present. The code
  now starts the first-turn assistant search from row `0` instead of after the
  discovery row count.

- The previous long-running multi-turn smoke process was manually killed after
  diagnosing the cursor issue. The code fix is in place, but the multi-turn live
  smoke should be rerun next.

## Known Gaps

### `claude -p` Stream Parity

- `system/init` is still incomplete:
  - `tools` is placeholder `[]`.
  - `mcp_servers` is placeholder `[]`.
  - `model` is placeholder `"unknown"`.
  - missing native fields like slash commands, agents, skills, plugins,
    `apiKeySource`, output style, analytics disabled, memory paths, etc.

- Shannon does not yet emit `rate_limit_event`.

- Shannon does not yet reconstruct real cost:
  - `total_cost_usd` is `0`.
  - `modelUsage.*.costUSD` is `0`.

- `include-partial-messages` is accepted/forwarded but Shannon does not
  synthesize partial assistant stream events from interactive transcripts.

- Hook lifecycle parity is partial:
  - `hook_response` can be translated from durable `hook_success` attachments.
  - `hook_started` is not reconstructed because it has not been observed as a
    durable interactive transcript row.
  - `include-hook-events` is forwarded, but Shannon does not yet fully emulate
    native stream hook lifecycle behavior.

### Input/Bidi Parity

- `--input-format=stream-json` is finite-input, not live bidirectional yet.
  Current behavior reads stdin up front, sends messages sequentially through one
  interactive Claude session, and emits results.

- Need to rerun the multi-turn live smoke after the cursor fix:
  - two stdin user messages
  - one tmux session
  - two assistant/result pairs
  - one final metadata row
  - tmux cleanup

- True live bidi requires reading stdin incrementally while the tmux session is
  active and emitting results as each turn completes, rather than reading all
  stdin before launching.

### Claude Agent SDK Parity

- Programmatic permission callbacks are not implemented:
  - `canUseTool`
  - permission prompt tool callbacks

- MCP SDK server instances are not implemented.

- Hook callback functions are not implemented.

- `sessionStore`, transcript mirroring, and custom stores are not implemented.

- Warm query / prewarmed subprocess behavior is not implemented.

- Custom process spawning is not implemented.

- Abort/cancel/interruption behavior is not implemented.

- Full resume/fork semantics need deeper testing:
  - `--resume`
  - `--continue`
  - `--fork-session`
  - `--session-id`

### Packaging / Repo / Release

- There is no git remote configured in this checkout.
- `package.json` includes repository metadata for
  `https://github.com/humanlayer/shannon.git`, but nothing has been pushed.
- Not published to npm.
- Version is still `0.0.0`.

## All Next Steps

1. Rerun the multi-turn finite stdin live smoke after the row cursor fix.
   - Verify two user inputs yield two assistant/result pairs.
   - Verify both turns use the same `session_id`.
   - Verify final metadata appears once.
   - Verify `tmux ls` has no leftover Shannon sessions.

2. Add an automated live conformance test harness.
   - Put live tests behind an env flag like `SHANNON_LIVE=1`.
   - Parse JSONL output from real `shannon`.
   - Assert event sequence, session consistency, and cleanup.

3. Add fixture-based native `claude -p` conformance tests.
   - Save small native output fixtures for:
     - text
     - json
     - stream-json
     - stream-json + verbose
     - replay user messages
     - hook events
   - Compare Shannon row shape against fixtures.

4. Improve `system/init` parity.
   - Research whether interactive transcript attachments contain tools,
     MCP servers, agents, skills, plugins, memory paths, etc.
   - If not, inspect safe local Claude config surfaces to reconstruct them.
   - Add tests for each field that can be reconstructed.

5. Research and reconstruct `rate_limit_event`.
   - Check whether interactive transcripts contain rate limit rows.
   - If unavailable, document as impossible without API/CLI stream support.

6. Research cost reconstruction.
   - Determine whether model usage plus public pricing can approximate costs.
   - Prefer exact persisted cost if available.
   - Add result cost tests.

7. Implement true live bidi stdin.
   - Do not read all stdin before launch.
   - Launch tmux first.
   - Stream user messages from stdin as they arrive.
   - Send each to Claude after the previous turn completes.
   - Emit each turn as soon as complete.
   - Preserve cleanup on stdin close, process error, timeout, and signals.

8. Add signal handling.
   - On SIGINT/SIGTERM, kill the tmux session.
   - Emit final metadata if stream-json and session metadata is known.

9. Add abort support in SDK.
   - Support `AbortController` in `QueryOptions`.
   - Kill subprocess and rely on CLI cleanup.

10. Add SDK resume/continue/session options.
    - Ensure option-to-flag mapping covers all currently supported CLI flags.
    - Add tests for `resume`, `continue`, `forkSession`, `sessionId`.
    - Run live resume smoke tests.

11. Decide what to do with SDK features that cannot be represented through a
    CLI/tmux wrapper.
    - `canUseTool`
    - SDK MCP server instances
    - hook callback functions
    - sessionStore
    - spawnClaudeCodeProcess
    - warm query
    - These may require a richer local control protocol or must be documented as
      intentionally unsupported.

12. Consider an internal Query object instead of bare async iterable.
    - Claude Agent SDK Query supports methods like interrupt/close/control.
    - Shannon currently returns only an async iterable.

13. Improve output format parity.
    - Confirm native `claude -p --output-format=json` exact fields.
    - Confirm native `--output-format=text` stderr/stdout behavior.
    - Match field names and error rows.

14. Add error path conformance.
    - Missing `claude`.
    - Missing `tmux`.
    - Login/setup screen.
    - Timeout waiting for prompt.
    - Timeout waiting for transcript.
    - Timeout waiting for assistant.
    - Invalid JSONL input.
    - Unsupported message type.

15. Add docs for limitations and parity status.
    - Keep `docs/research/2026-05-13-parity-matrix.md` current.
    - Add a README parity table.

16. Prepare repo/release.
    - Configure git remote for `humanlayer/shannon`.
    - Decide initial semver version.
    - Add license.
    - Add CI.
    - Publish to npm as `@dexhorthy/shannon`.

## Current Good Stopping Point

This checkpoint is good because:

- The code compiles.
- Unit/learning tests pass.
- No Shannon tmux session is left running.
- The latest implementation includes the cursor fix needed before rerunning
  multi-turn finite stdin live smoke.
