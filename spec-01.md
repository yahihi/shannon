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


### bidirectional control: stdio MCP server + injected SDK bridge

Goal: follow the Claude Agent SDK architecture as closely as possible while
still running a real interactive `claude` session inside tmux.

The official Agent SDK gets bidirectional control by owning the
`claude --input-format=stream-json --output-format=stream-json` stdio channel.
Shannon cannot use `claude -p` internally, so it needs an injected bridge inside
interactive Claude Code that recreates that control channel.

The new design:

1. Shannon remains the host process. It owns the caller's `query()` invocation,
   stdout JSONL emission, session bookkeeping, transcript tailing, and SDK
   callbacks such as `canUseTool`, `hooks`, SDK MCP servers, elicitation, and
   custom session stores.
2. Shannon starts an oRPC server on a per-session Unix domain socket such as
   `/tmp/shannon-<pid>-<session>.sock`.
3. Shannon launches interactive Claude in tmux and injects a generated
   `--settings '{...json...}'` object. That settings JSON hard-codes:
   - a stdio MCP server entry for `shannon-mcp-bridge`;
   - hook entries that must be present for the requested SDK features;
   - any bridge-specific environment, socket path, and session id;
   - merged/overridden MCP and hook configuration derived from SDK options.
4. Claude still loads normal settings sources (`user`, `project`, `local`, and
   managed sources) according to Claude Code's regular merge rules. Shannon's
   generated `--settings` value is an additional injected layer, not a mutation
   of `~/.claude/settings.json`, `.claude/settings.json`, or
   `.claude/settings.local.json`.
5. Claude starts `shannon-mcp-bridge` as the generated stdio MCP server. The
   bridge connects back to Shannon over the Unix socket and speaks the typed
   oRPC protocol.
6. Shannon translates bridge events into Agent-SDK-shaped stdout rows and routes
   bridge requests to the caller's callbacks. Responses flow back over oRPC to
   the MCP bridge, then back into interactive Claude.

Process topology:

```text
SDK caller / shell
  |
  | shannon -p ... / query(...)
  v
Shannon host process
  |-- emits Claude Agent SDK compatible JSONL
  |-- tails ~/.claude/projects/<cwd>/<session>.jsonl
  |-- owns callbacks: canUseTool, hooks, MCP SDK servers, elicitation, sessionStore
  |-- owns Unix socket: /tmp/shannon-<pid>-<session>.sock
  |
  | tmux new-session ... claude --settings '{...generated bridge settings...}'
  v
interactive Claude Code
  |
  | starts generated stdio MCP server
  v
shannon-mcp-bridge
  |
  | oRPC over Unix socket
  v
Shannon host process
```

Generated `--settings` shape:

```json
{
  "mcpServers": {
    "shannon-sdk-bridge": {
      "type": "stdio",
      "command": "shannon-mcp-bridge",
      "args": [
        "--socket",
        "/tmp/shannon-<pid>-<session>.sock",
        "--session",
        "<shannon-session-id>"
      ],
      "env": {
        "SHANNON_BRIDGE_PROTOCOL": "orpc"
      }
    }
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "shannon-mcp-bridge",
            "args": [
              "hook",
              "--socket",
              "/tmp/shannon-<pid>-<session>.sock",
              "--session",
              "<shannon-session-id>"
            ],
            "timeout": 600
          }
        ]
      }
    ]
  }
}
```

The hook command path is intentionally the same bridge binary. For features
that Claude Code exposes only through hooks, the short-lived hook invocation
connects to the same Shannon oRPC socket and forwards the hook input. For
features Claude exposes through MCP, the long-lived stdio MCP server handles
the traffic.

oRPC contract:

```ts
type ShannonBridgeRpc = {
  hello(input: {
    sessionId: string
    cwd: string
    bridgeVersion: string
    claudeVersion?: string
  }): Promise<{ ok: true; protocolVersion: 1 }>

  emit(input: BridgeEvent): Promise<void>

  request(input: BridgeRequest): Promise<BridgeResponse>
}
```

Initial event/request families:

- `tool_call`: MCP tool invocation from Claude to a Shannon-hosted SDK tool or
  SDK MCP server instance.
- `can_use_tool`: permission decision request mapped to SDK `canUseTool`.
- `hook_event`: hook lifecycle event mapped to SDK `hooks`.
- `elicitation`: user/host elicitation request.
- `partial_message`: partial assistant text/thinking/tool block event.
- `status` / `notification`: progress, idle, rate-limit, and background-task
  notifications.
- `session_event`: session start/end, title/tag/mirror metadata, subagent
  events, and transcript location.

Shannon host responsibilities:

- start/stop the Unix socket and oRPC server;
- build the generated `--settings` JSON, merging SDK-requested hooks/MCP
  servers with normal Claude settings-source behavior;
- launch interactive Claude in tmux with that `--settings` value;
- translate bridge events into Agent-SDK-shaped stdout rows;
- route bridge requests to user callbacks and SDK MCP server instances;
- keep transcript-tailing fallback behavior for durable rows;
- clean up socket and tmux session.

Injected bridge responsibilities:

- run as a stdio MCP server under Claude Code;
- run as a command hook target when Claude invokes generated hooks;
- connect to Shannon's Unix socket during initialization or hook execution;
- expose the bridge tools/resources/prompts needed to route SDK features;
- forward Claude-originated control events to Shannon;
- wait for Shannon responses where Claude needs synchronous decisions;
- degrade with a clear error if the socket is unavailable.

Why this is closer to Claude Agent SDK:

- the host process owns SDK callbacks and emits SDK-compatible JSONL;
- interactive Claude still runs in tmux;
- injected MCP/hook settings provide a live bidirectional channel back to the
  host;
- transcript tailing remains the durability/compatibility layer rather than the
  only source of truth.

Implementation steps:

1. Add `shannon-mcp-bridge` binary.
2. Add `src/bridge/rpc.ts` with the oRPC contract and schemas.
3. Add a Shannon host-side Unix socket oRPC server tied to `runShannon()`.
4. Generate a per-session `--settings` JSON object for bridge MCP servers,
   hooks, env, socket path, and session id.
5. Merge caller-provided MCP/hook settings into that generated object without
   mutating user settings files.
6. Make `query()` pass SDK callbacks/options into the host process instead of
   trying to serialize functions into CLI flags.
7. Implement `canUseTool` over the bridge first, then explicit `hooks`, SDK MCP
   server instances, elicitation, partial messages, and session-store mirroring.
8. Keep the existing transcript tailer as fallback and for result/init
   reconstruction until bridge events cover those fields directly.

Conformance test plan:

- Unit-test the generated `--settings` JSON and its merge behavior.
- Unit-test the oRPC contract with an in-process fake bridge.
- Add fake-bridge integration tests that simulate:
  - `canUseTool` allow/deny/updatedInput;
  - hook events and hook responses;
  - SDK MCP server tool invocation;
  - partial message events;
  - elicitation request/response;
  - session store transcript mirroring.
- Add env-gated live Haiku tests that launch interactive Claude with the bridge
  enabled and assert Agent-SDK-shaped stdout rows match native fixture shape.

Open issues:

- Determine the exact MCP surface the bridge should expose so Claude Code routes
  SDK tool calls and SDK MCP server instances predictably.
- Determine which SDK features require generated hooks even with the MCP bridge.
- Define failure behavior if the bridge disconnects mid-turn.
- Define ordering between transcript-derived rows and bridge-derived rows so
  stdout remains stable and deduplicated.
