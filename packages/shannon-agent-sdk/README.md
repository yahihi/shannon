# @dexh/shannon-agent-sdk

Claude Agent SDK-compatible facade for [Shannon](https://github.com/humanlayer/shannon). It
re-exports Shannon's implemented SDK surface from [`@dexh/shannon`](https://www.npmjs.com/package/@dexh/shannon).
Full Claude Agent SDK parity is a work in progress (see the repo's
`GOAL_PROGRESS.md`).

## Requirements

- [Bun](https://bun.sh)
- `claude` on `PATH`
- `tmux` on `PATH`
- A working Claude Code login/configuration

## Install

```sh
npm install @dexh/shannon-agent-sdk
```

The Shannon CLI is also available via `npx`:

```sh
npx @dexh/shannon -p "Reply with exactly: hello" --output-format=stream-json --verbose
```

## SDK usage

```ts
import { query } from "@dexh/shannon-agent-sdk";

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

Async input is also accepted for finite user-message streams:

```ts
import { query, type ShannonUserMessage } from "@dexh/shannon-agent-sdk";

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

Zod schemas for the current Shannon message, options, and query parameter
surface are also re-exported:

```ts
import { shannonMessageSchema, shannonQueryOptionsSchema } from "@dexh/shannon-agent-sdk";
```
