We are building shannon, a CLI wrapper around the claude cli that enables behavior matching claude-agent-sdk and claude -p, without needing to use those


basic use case:

```
shannon -p "hi i'm tom" --output-format=stream-json --verbose
```

outputs

```
{...json lines... same as from agent sdk}
```


sdk version:

```
import { query } from "@humanlayer/shannon"

for await (const message of query({
  prompt: "hi i'm tom",
  options: {
    outputFormat: "stream-json",
    verbose: true,
  },
})) {
  console.log(JSON.stringify(message))
}
```


### design

we must do this without claude -p, so under the hood, shannon launches a full `claude` interative cli session.

1. open new tmux session
2. launch claude cli sesison there
3. get the session id, either
      a. use tmux capture-pane to get the session id
      b. ls ~/.claude/... in the projects path for the working directory before and after launch and find the new directory
      c. something else clever
4. stream out JSONL events in the claude -p json lines output format
5. kill the tmux pane or leave it open, print the session id etc at the end
6. eventually, will want do use tmux send-keys to allow conversation continuation

### things to research with codebash/node_modules analysis

how does claude agent sdk invoke / pass flags to the claude -p binary and handle bidi stdio streaming

### things to research with learning tests

how does claude -p emit json lines w/ the above stream/verbose flags, whats the format and full lexicon of event types (can inspect the tools list)

how does data get written to disk for new claude -p sessions and how does it differ from the stdio output/input channels

how does data get writte to disk when launching interactive (claude w/o -p) sessions in a separate tmux process


### other things to consider (added after initial /goal invocation, but should be included in scope)

1. validating claude and tmux are installed
2. handling errors from claude like "needs login" or "first time use, walkthing you through setup steps - can probably use capture-pane or more cleanly, check the internal claude config surface like ~/.claude.json or ~/.claude/ directory full of metatdata
3. use commander for CLI flags and command tree parsing
4. publish to npm under @humanlayer/shannon and @humanlayer/shannon-agent-sdk
5. push to github public repo humanlayer/shannon
6. shannon agent-sdk support with full zod schemas etc
7. support for every claude -p and claude-agent-sdk feature - via an extensive and growing set of conformance tests that can be run (use haiku model to save $$ please)


### bidirectional control: canUseTool / hooks proxy

Goal: let SDK consumers register a `canUseTool` callback (and arbitrary
`hooks: { PreToolUse: […] }` entries) the same way the official
`@anthropic-ai/claude-agent-sdk` does, while Shannon keeps driving an
interactive `claude` inside tmux.

How the official Agent SDK does `canUseTool` (background, not what we copy):

- It runs `claude --input-format=stream-json --output-format=stream-json` and
  speaks a bidirectional control plane on top of stdin/stdout.
- When the CLI needs permission for a tool it emits
  `{ type: "control_request", request: { subtype: "can_use_tool",
   tool_name, input, tool_use_id, … } }` on stdout.
- The host writes a matching `{ type: "control_response", … }` back on stdin
  with allow / deny / updatedInput.
- `--permission-prompt-tool` is the MCP-tool variant of the same idea.

Why Shannon can't reuse that: it requires `--input-format=stream-json`, which
means giving up the real interactive `claude` session inside tmux — the whole
point of Shannon. So we proxy via the **hook** mechanism instead, since hooks
fire inside a normal interactive session and already feed Shannon's transcript
tailer.

PreToolUse hook protocol (from
https://code.claude.com/docs/en/hooks):

- Loaded from `settings.json` files: user `~/.claude/settings.json`,
  project `.claude/settings.json`, project-local
  `.claude/settings.local.json`, managed policy, plugin, or active
  skill/agent frontmatter.
- The public docs imply settings files are the only entry point, but the
  `claude` CLI also accepts `--settings <file-or-json>` (works in
  interactive mode, not gated to `--print`) which is documented as "Path
  to a settings JSON file or a JSON string to load additional settings
  from", plus `--setting-sources <sources>` ("Comma-separated list of
  setting sources to load (user, project, local)") for scoping which of
  the on-disk sources also load. **This is the entry point Shannon uses**
  — no settings-file mutation needed.
- Hook entry shape (PreToolUse, command type):
  ```json
  {
    "hooks": {
      "PreToolUse": [
        {
          "matcher": "Bash|Edit|Write",
          "hooks": [
            {
              "type": "command",
              "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/bridge",
              "args": ["--session", "<id>"],
              "timeout": 600
            }
          ]
        }
      ]
    }
  }
  ```
- Command hook gets JSON on stdin (`session_id`, `transcript_path`, `cwd`,
  `permission_mode`, `hook_event_name`, `tool_name`, `tool_input`, …).
- Decision channel on stdout / exit code:
  - exit 0 silent → allow
  - exit 0 with JSON
    `{"hookSpecificOutput":{"hookEventName":"PreToolUse",
    "permissionDecision":"allow|deny|ask|defer",
    "permissionDecisionReason":"…","updatedInput":{…},
    "additionalContext":"…"}}`
  - exit 2 → block, stderr surfaced to user
- HTTP-type hooks are also supported (POST body = stdin JSON, response JSON
  body parsed the same way), which is useful when we don't want a separate
  binary on PATH.

Shannon design — a hook bridge that proxies decisions back to the SDK
consumer:

1. New bin in `@dexh/shannon`: `shannon-hook-bridge`. Reads hook input JSON
   on stdin, connects to `/tmp/shannon-<session>.sock` (or a Bun-served
   localhost HTTP endpoint), forwards the JSON, waits for the parent's
   response, writes it on stdout, exits 0. Synchronous and tiny.
2. `query()` gains optional `canUseTool?: CanUseTool` and
   `hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>` (same shape
   as the official Agent SDK) in `QueryOptions`.
3. Before launching the tmux session, when either of the above is set,
   Shannon:
   a. opens an AF_UNIX socket (or `Bun.serve` localhost HTTP listener)
      keyed by the Shannon session id;
   b. builds a settings JSON object containing the PreToolUse (and any
      other requested event) entry whose `command` is
      `shannon-hook-bridge --session <id>` (with the matcher derived from
      registered consumer hooks);
   c. passes it to `claude` via `--settings '<json-string>'` (or writes a
      session-scoped temp file under e.g. `~/.shannon/sessions/<id>.json`
      and passes the path). The existing on-disk settings cascade is
      untouched — no backup / restore / lockfile needed. Use
      `--setting-sources` if the consumer wants to scope which on-disk
      sources also load alongside the injected hooks.
4. On each bridge connect, Shannon parses the hook input, calls the
   consumer's `canUseTool(toolName, input, { signal, suggestions, … })`
   (or fans out to user hooks), translates the return into the
   `hookSpecificOutput` shape, and sends it back.
5. On session cleanup: close the socket / listener and remove the temp
   settings file if one was written. Nothing on the user's
   `.claude/settings*.json` ever changed.

Observability piggybacks on what already works: `hook_started` /
`hook_response` rows in the transcript continue to be emitted by Shannon,
and `--include-hook-events` already routes them out of stream-json.

Open issues to nail down during implementation:

- `canUseTool` vs explicit `hooks` precedence — the official SDK says
  PreToolUse hook denies bypass `canUseTool` entirely; Shannon's bridge
  collapses both into the same code path, so document a deterministic
  merge rule.
- Concurrency: no longer a settings-file contention problem since each
  Shannon session passes its own `--settings` value. Just need
  per-session unique socket paths and bridge `--session <id>` args.
- Hook `timeout` (default 60s) caps how long the consumer's `canUseTool`
  can take. Pass through a Shannon option so consumers can extend it.
- `permissionDecision: "ask"` requires Shannon to round-trip to the user.
  Either drop "ask" support initially, or surface it as an
  `permission_request` event in the Shannon stream that the consumer is
  expected to answer.
- HTTP-hook variant might be a better default than a binary on PATH —
  Shannon already lives in the same process tree as `claude`, so a
  `localhost` URL it owns is easier to set up and tear down than wiring a
  bin script.

Conformance test plan: extend the haiku conformance tests with
`canUseTool` and `hooks` cases that mirror the Agent SDK examples
(`PreToolUse` matcher patterns, `updatedInput` mutation, `deny` short-
circuit, `--include-hook-events` round-trip).
