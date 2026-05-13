/**
 * Learning notes for the Shannon SDK facade:
 *
 * - The public SDK can match Claude Agent SDK's most important ergonomics by
 *   returning an async iterable of JSONL messages.
 * - Keeping the parser chunk-aware matters because process stdout can split
 *   JSON objects across arbitrary boundaries.
 * - The first SDK cut intentionally shells out to the `shannon` CLI instead of
 *   importing CLI internals, preserving the same black-box behavior users get
 *   from the executable.
 */
import { expect, test } from "bun:test";
import { optionsToCliArgs, parseJsonlStream } from "../../sdk";

test("parses jsonl messages even when chunks split object boundaries", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('{"type":"system","subtype":"init"}\n{"type"'));
      controller.enqueue(encoder.encode(':"result","subtype":"success"}\n'));
      controller.close();
    },
  });

  const messages = [];
  for await (const message of parseJsonlStream(stream)) {
    messages.push(message);
  }

  expect(messages).toEqual([
    { type: "system", subtype: "init" },
    { type: "result", subtype: "success" },
  ]);
});

test("maps SDK options onto Shannon CLI flags", () => {
  expect(
    optionsToCliArgs({
      additionalDirectories: ["/tmp/a", "/tmp/b"],
      model: "sonnet",
      permissionMode: "plan",
      allowedTools: ["Read", "Grep"],
      agents: { reviewer: { description: "Reviews", prompt: "Review carefully" } },
      debug: "api",
      settings: { permissions: { defaultMode: "auto" } },
      continue: true,
      includeHookEvents: true,
      replayUserMessages: true,
    }),
  ).toEqual([
    "--add-dir",
    "/tmp/a",
    "/tmp/b",
    "--agents",
    '{"reviewer":{"description":"Reviews","prompt":"Review carefully"}}',
    "--allowed-tools",
    "Read",
    "Grep",
    "--continue",
    "--debug",
    "api",
    "--include-hook-events",
    "--model",
    "sonnet",
    "--permission-mode",
    "plan",
    "--settings",
    '{"permissions":{"defaultMode":"auto"}}',
  ]);
});
