# Shannon

Shannon is a CLI and SDK wrapper around the interactive Claude Code CLI. It starts a real `claude` session inside tmux, sends a prompt, tails Claude's on-disk transcript, emits stream JSON, and cleans up the tmux session on exit.

The first supported path is:

```sh
shannon -p "hi i'm tom" --output-format=stream-json --verbose
```

Shannon does not use `claude -p` internally.

## Requirements

- Bun
- `claude` on `PATH`
- `tmux` on `PATH`
- A working Claude Code login/configuration

## Install

```sh
bun install
bun link
```

After linking, `shannon` should resolve from your Bun bin directory:

```sh
which shannon
```

## CLI

```sh
shannon -p "Reply with exactly: hello" --output-format=stream-json --verbose
```

Stdin JSONL input is supported for the first user message:

```sh
printf '%s\n' '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Reply with exactly: hello"}]},"parent_tool_use_id":null,"session_id":""}' \
  | shannon --input-format=stream-json --output-format=stream-json --verbose --replay-user-messages
```

Current stream shape:

- `system` / `hook_response` when interactive transcript hook attachments are present
- `system` / `init`
- `assistant`
- synthesized `result` / `success`
- final `shannon_session` / `metadata`

The final metadata row includes the Claude session id, transcript path, project session folder, tmux session name, cwd, and cleanup status.

## SDK

```ts
import { query } from "@humanlayer/shannon";

for await (const message of query({
  prompt: "Reply with exactly: hello",
  options: {
    outputFormat: "stream-json",
    verbose: true,
  },
})) {
  console.log(JSON.stringify(message));
}
```

Async input is also accepted for the first user message:

```ts
import { query, type ShannonUserMessage } from "@humanlayer/shannon";

async function* messages(): AsyncIterable<ShannonUserMessage> {
  yield {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "text", text: "Reply with exactly: hello" }],
    },
    parent_tool_use_id: null,
    session_id: "",
  };
}

for await (const message of query({ prompt: messages() })) {
  console.log(JSON.stringify(message));
}
```

The SDK facade shells out to the `shannon` executable and parses JSONL stdout into an async iterable.

## Development

```sh
bun test
bun run typecheck
```

Run the CLI directly:

```sh
bun ./index.ts -p "hello" --output-format=stream-json --verbose
```
