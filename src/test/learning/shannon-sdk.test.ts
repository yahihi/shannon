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
import {
  optionsToCliArgs,
  parseJsonlStream,
  query,
  shannonAssistantMessageSchema,
  shannonHookResponseSchema,
  shannonHookStartedSchema,
  shannonMessageSchema,
  shannonQueryOptionsSchema,
  shannonQueryParamsSchema,
  shannonRateLimitEventSchema,
  shannonResultMessageSchema,
  shannonStreamMessageSchema,
  shannonSystemInitSchema,
  shannonUserMessageSchema,
} from "../../sdk";

const streamFixturePath = new URL("../fixtures/claude-p-haiku-stream-json.fixture.jsonl", import.meta.url);

test("parses jsonl messages even when chunks split object boundaries", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode('{"type":"system","subtype":"init"}\n{"type"'),
      );
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
      model: "haiku",
      pathToClaudeCodeExecutable: "/tmp/claude",
      permissionMode: "plan",
      allowedTools: ["Read", "Grep"],
      agents: {
        reviewer: { description: "Reviews", prompt: "Review carefully" },
      },
      debug: "api",
      settings: { permissions: { defaultMode: "auto" } },
      continue: true,
      fromPr: "123",
      includeHookEvents: true,
      remoteControl: "handoff",
      remoteControlSessionNamePrefix: "shannon",
      replayUserMessages: true,
      tmux: "classic",
      worktree: "feature-a",
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
    "--from-pr",
    "123",
    "--include-hook-events",
    "--model",
    "haiku",
    "--path-to-claude-code-executable",
    "/tmp/claude",
    "--permission-mode",
    "plan",
    "--remote-control",
    "handoff",
    "--remote-control-session-name-prefix",
    "shannon",
    "--settings",
    '{"permissions":{"defaultMode":"auto"}}',
    "--tmux",
    "classic",
    "--worktree",
    "feature-a",
  ]);
});

test("honors an already-aborted SDK query before spawning Shannon", async () => {
  const abortController = new AbortController();
  abortController.abort();

  const iterator = query({
    prompt: "hello",
    options: { abortController },
  })[Symbol.asyncIterator]();

  await expect(iterator.next()).rejects.toThrow("Shannon query aborted before start");
});

test("exports zod schemas for the current SDK surface", () => {
  expect(
    shannonUserMessageSchema.parse({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
      parent_tool_use_id: null,
    }),
  ).toMatchObject({
    type: "user",
    message: { role: "user" },
  });

  expect(shannonMessageSchema.parse({ type: "result", session_id: "session-1" })).toEqual({
    type: "result",
    session_id: "session-1",
  });

  expect(
    shannonQueryOptionsSchema.parse({
      env: { SHANNON_TEST_ENV: "1", SHANNON_TEST_UNSET: undefined },
      outputFormat: "stream-json",
      permissionMode: "plan",
      model: "haiku",
      pathToClaudeCodeExecutable: "/tmp/claude",
      remoteControl: true,
      tmux: "classic",
    }),
  ).toEqual({
    env: { SHANNON_TEST_ENV: "1", SHANNON_TEST_UNSET: undefined },
    outputFormat: "stream-json",
    permissionMode: "plan",
    model: "haiku",
    pathToClaudeCodeExecutable: "/tmp/claude",
    remoteControl: true,
    tmux: "classic",
  });

  expect(
    shannonQueryParamsSchema.parse({
      prompt: "hello",
      options: { verbose: true },
    }),
  ).toEqual({
    prompt: "hello",
    options: { verbose: true },
  });
});

test("exports a schema for native rate limit events", async () => {
  const fixtureRows = (await Bun.file(streamFixturePath).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const rateLimitEvent = fixtureRows.find((row) => row.type === "rate_limit_event");

  expect(shannonRateLimitEventSchema.parse(rateLimitEvent)).toMatchObject({
    type: "rate_limit_event",
    rate_limit_info: {
      status: "allowed",
      rateLimitType: "five_hour",
      overageStatus: "rejected",
      isUsingOverage: false,
    },
    session_id: "session-1",
    uuid: "uuid-rate-limit",
  });
});

test("exports structured schemas for emitted stream rows", async () => {
  const fixtureRows = (await Bun.file(streamFixturePath).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  expect(shannonHookStartedSchema.parse(fixtureRows[0])).toMatchObject({
    type: "system",
    subtype: "hook_started",
  });
  expect(shannonHookResponseSchema.parse(fixtureRows[1])).toMatchObject({
    type: "system",
    subtype: "hook_response",
  });
  expect(shannonSystemInitSchema.parse(fixtureRows[2])).toMatchObject({
    type: "system",
    subtype: "init",
    session_id: "session-1",
  });

  const assistant = fixtureRows.find((row) => row.type === "assistant");
  expect(shannonAssistantMessageSchema.parse(assistant)).toMatchObject({
    type: "assistant",
    session_id: "session-1",
  });

  const result = fixtureRows.find((row) => row.type === "result");
  expect(shannonResultMessageSchema.parse(result)).toMatchObject({
    type: "result",
    subtype: "success",
    session_id: "session-1",
  });

  for (const row of fixtureRows) {
    expect(shannonStreamMessageSchema.parse(row)).toMatchObject({ type: row.type });
  }
});
