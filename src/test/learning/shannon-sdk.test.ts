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
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  getSessionInfo,
  getSessionMessages,
  listSessions,
  optionsToCliArgs,
  parseJsonlStream,
  query,
  shannonAssistantMessageSchema,
  shannonControlRequestSchema,
  shannonControlResponseSchema,
  shannonHookResponseSchema,
  shannonHookStartedSchema,
  shannonMessageSchema,
  shannonNotificationMessageSchema,
  shannonPartialAssistantMessageSchema,
  shannonQueryOptionsSchema,
  shannonQueryParamsSchema,
  shannonRateLimitEventSchema,
  shannonResultMessageSchema,
  shannonStatusMessageSchema,
  shannonStreamMessageSchema,
  shannonSystemInitSchema,
  shannonUserMessageSchema,
} from "../../sdk";

const streamFixturePath = new URL("../fixtures/claude-p-haiku-stream-json.fixture.jsonl", import.meta.url);

function projectKeyForDir(dir: string): string {
  return resolve(dir).normalize("NFC").replace(/[^a-zA-Z0-9._-]/g, "-");
}

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
      bare: true,
      betas: ["beta-a", "beta-b"],
      brief: true,
      chrome: false,
      debug: "api",
      debugFile: "/tmp/debug.log",
      disableSlashCommands: true,
      disallowedTools: ["Bash"],
      effort: "high",
      excludeDynamicSystemPromptSections: true,
      fallbackModel: "sonnet",
      file: ["spec-01.md"],
      forkSession: true,
      settings: { permissions: { defaultMode: "auto" } },
      continue: true,
      fromPr: "123",
      ide: true,
      includeHookEvents: true,
      includePartialMessages: true,
      jsonSchema: { type: "object" },
      maxBudgetUsd: 1.5,
      mcpConfig: ["mcp.json"],
      mcpDebug: true,
      name: "session-name",
      pluginDir: ["/tmp/plugin-a", "/tmp/plugin-b"],
      pluginUrl: ["https://example.com/plugin.zip"],
      remoteControl: "handoff",
      remoteControlSessionNamePrefix: "shannon",
      resume: "resume-session",
      replayUserMessages: true,
      sessionId: "session-1",
      sessionPersistence: false,
      settingSources: "user,project",
      strictMcpConfig: true,
      systemPrompt: "system",
      tools: ["Read"],
      tmux: "classic",
      worktree: "feature-a",
      allowDangerouslySkipPermissions: true,
      dangerouslySkipPermissions: true,
    }),
  ).toEqual([
    "--add-dir",
    "/tmp/a",
    "/tmp/b",
    "--agents",
    '{"reviewer":{"description":"Reviews","prompt":"Review carefully"}}',
    "--allow-dangerously-skip-permissions",
    "--allowed-tools",
    "Read",
    "Grep",
    "--bare",
    "--betas",
    "beta-a",
    "beta-b",
    "--brief",
    "--no-chrome",
    "--continue",
    "--debug",
    "api",
    "--debug-file",
    "/tmp/debug.log",
    "--disable-slash-commands",
    "--disallowed-tools",
    "Bash",
    "--effort",
    "high",
    "--exclude-dynamic-system-prompt-sections",
    "--fallback-model",
    "sonnet",
    "--file",
    "spec-01.md",
    "--fork-session",
    "--from-pr",
    "123",
    "--ide",
    "--include-hook-events",
    "--include-partial-messages",
    "--json-schema",
    '{"type":"object"}',
    "--max-budget-usd",
    "1.5",
    "--mcp-config",
    "mcp.json",
    "--mcp-debug",
    "--model",
    "haiku",
    "--name",
    "session-name",
    "--path-to-claude-code-executable",
    "/tmp/claude",
    "--permission-mode",
    "plan",
    "--plugin-dir",
    "/tmp/plugin-a",
    "--plugin-dir",
    "/tmp/plugin-b",
    "--plugin-url",
    "https://example.com/plugin.zip",
    "--remote-control",
    "handoff",
    "--remote-control-session-name-prefix",
    "shannon",
    "--resume",
    "resume-session",
    "--session-id",
    "session-1",
    "--no-session-persistence",
    "--setting-sources",
    "user,project",
    "--settings",
    '{"permissions":{"defaultMode":"auto"}}',
    "--strict-mcp-config",
    "--system-prompt",
    "system",
    "--tools",
    "Read",
    "--tmux",
    "classic",
    "--worktree",
    "feature-a",
    "--dangerously-skip-permissions",
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

test("returns a controllable SDK query object", async () => {
  const sdkQuery = query({
    prompt: "hello",
    options: { command: "shannon-does-not-run" },
  });

  expect(typeof sdkQuery[Symbol.asyncIterator]).toBe("function");
  expect(typeof sdkQuery.interrupt).toBe("function");
  expect(typeof sdkQuery.close).toBe("function");

  await sdkQuery.interrupt();
  await expect(sdkQuery[Symbol.asyncIterator]().next()).rejects.toThrow(
    "Shannon query aborted before start",
  );
});

test("reads local Claude session transcripts through SDK helpers", async () => {
  const home = await mkdtemp(join(tmpdir(), "shannon-sdk-home-"));
  const dir = "/repo";
  const sessionId = "session-1";
  const projectFolder = join(home, ".claude", "projects", projectKeyForDir(dir));
  const transcriptPath = join(projectFolder, `${sessionId}.jsonl`);

  try {
    await mkdir(projectFolder, { recursive: true });
    await Bun.write(
      transcriptPath,
      [
        JSON.stringify({
          type: "user",
          timestamp: "2026-05-13T20:00:00.000Z",
          cwd: dir,
          sessionId,
          message: { role: "user", content: "hello" },
        }),
        JSON.stringify({
          type: "assistant",
          timestamp: "2026-05-13T20:00:01.000Z",
          cwd: dir,
          sessionId,
          message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
        }),
      ].join("\n"),
    );

    await Bun.write(
      join(projectFolder, "session-2.jsonl"),
      `${JSON.stringify({
        type: "user",
        timestamp: "2026-05-13T19:00:00.000Z",
        cwd: dir,
        sessionId: "session-2",
        message: { role: "user", content: "older" },
      })}\n`,
    );

    await expect(getSessionMessages(sessionId, { dir, home })).resolves.toHaveLength(2);
    await expect(getSessionInfo(sessionId, { dir, home })).resolves.toMatchObject({
      sessionId,
      transcriptPath,
      cwd: dir,
      createdAt: "2026-05-13T20:00:00.000Z",
      updatedAt: "2026-05-13T20:00:01.000Z",
      messageCount: 2,
    });
    await expect(listSessions({ dir, home, limit: 1 })).resolves.toMatchObject([
      { sessionId },
    ]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
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
      bare: true,
      chrome: false,
      jsonSchema: { type: "object" },
      pluginDir: ["/tmp/plugin"],
      remoteControl: true,
      sessionPersistence: false,
      strictMcpConfig: true,
      tmux: "classic",
    }),
  ).toEqual({
    env: { SHANNON_TEST_ENV: "1", SHANNON_TEST_UNSET: undefined },
    outputFormat: "stream-json",
    permissionMode: "plan",
    model: "haiku",
    pathToClaudeCodeExecutable: "/tmp/claude",
    bare: true,
    chrome: false,
    jsonSchema: { type: "object" },
    pluginDir: ["/tmp/plugin"],
    remoteControl: true,
    sessionPersistence: false,
    strictMcpConfig: true,
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

test("exports schemas for additional Agent SDK stream message variants", () => {
  expect(
    shannonPartialAssistantMessageSchema.parse({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } },
      parent_tool_use_id: null,
      session_id: "session-1",
      uuid: "uuid-partial",
      ttft_ms: 42,
    }),
  ).toMatchObject({
    type: "stream_event",
    session_id: "session-1",
  });

  expect(
    shannonStatusMessageSchema.parse({
      type: "system",
      subtype: "status",
      status: "ready",
      permissionMode: "default",
      session_id: "session-1",
      uuid: "uuid-status",
    }),
  ).toMatchObject({
    type: "system",
    subtype: "status",
  });

  expect(
    shannonNotificationMessageSchema.parse({
      type: "system",
      subtype: "notification",
      key: "notice",
      text: "Ready",
      priority: "low",
      session_id: "session-1",
      uuid: "uuid-notification",
    }),
  ).toMatchObject({
    type: "system",
    subtype: "notification",
  });

  expect(
    shannonControlRequestSchema.parse({
      type: "control_request",
      request_id: "request-1",
      request: { subtype: "interrupt" },
    }),
  ).toMatchObject({
    type: "control_request",
    request: { subtype: "interrupt" },
  });

  expect(
    shannonControlResponseSchema.parse({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: "request-1",
        response: { ok: true },
      },
    }),
  ).toMatchObject({
    type: "control_response",
    response: { subtype: "success" },
  });

  expect(
    shannonControlResponseSchema.parse({
      type: "control_response",
      response: {
        subtype: "error",
        request_id: "request-2",
        error: "denied",
        pending_permission_requests: [
          {
            type: "control_request",
            request_id: "request-3",
            request: { subtype: "can_use_tool", tool_name: "Read" },
          },
        ],
      },
    }),
  ).toMatchObject({
    type: "control_response",
    response: { subtype: "error" },
  });
});
