/**
 * Learning notes for Shannon's transcript adapter:
 *
 * - Interactive Claude transcript files store the durable session id as
 *   `sessionId`, while SDK/`claude -p` stream JSON uses `session_id`.
 * - Interactive mode persists assistant responses but not terminal `result`
 *   events, so Shannon synthesizes the `result` row from the assistant row.
 * - The extra Shannon metadata row is deliberately not pretending to be a
 *   Claude SDK event; it uses `type: "shannon_session"`.
 */
import { expect, test } from "bun:test";
import {
  claudeProjectFolder,
  estimateCostUSD,
  mcpServersFromRows,
  parseArgs,
  promptFromUserMessage,
  projectKeyForCwd,
  rowContainsPromptAfter,
  signalExitCode,
  skillNamesFromListing,
  textFromContent,
  toSdkAssistant,
  toSdkHookResponse,
  toSdkHookStarted,
  toSdkInit,
  toSdkResult,
  toShannonMetadata,
  toUserReplay,
  validateRuntime,
} from "../../../index";

test("parses the target CLI invocation shape", () => {
  expect(
    parseArgs(
      ["-p", "hello", "--output-format=stream-json", "--verbose"],
      "/Users/dex/repos/dexhorthy/shannon",
    ),
  ).toEqual({
    prompt: "hello",
    inputFormat: "text",
    outputFormat: "stream-json",
    verbose: true,
    replayUserMessages: false,
    cwd: "/Users/dex/repos/dexhorthy/shannon",
    claudeArgs: [],
  });
});

test("parses positional prompt and forwards common Claude flags", () => {
  expect(
    parseArgs([
      "hello positional",
      "--model",
      "sonnet",
      "--permission-mode",
      "plan",
      "--add-dir",
      "/tmp",
    ]),
  ).toMatchObject({
    prompt: "hello positional",
    outputFormat: "stream-json",
    claudeArgs: [
      "--add-dir",
      "/tmp",
      "--model",
      "sonnet",
      "--permission-mode",
      "plan",
    ],
  });
});

test("accepts Claude print output formats", () => {
  expect(parseArgs(["-p", "hello", "--output-format=json"]).outputFormat).toBe("json");
  expect(parseArgs(["-p", "hello", "--output-format=text"]).outputFormat).toBe("text");
});

test("accepts stream-json input without a CLI prompt", () => {
  expect(parseArgs(["--input-format=stream-json", "--output-format=stream-json"])).toMatchObject({
    inputFormat: "stream-json",
    prompt: undefined,
  });
});

test("extracts prompt text from stream-json user messages and can replay them", () => {
  expect(
    promptFromUserMessage({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "hello stdin" }] },
    }),
  ).toBe("hello stdin");

  expect(toUserReplay("hello stdin")).toMatchObject({
    type: "user",
    message: { role: "user", content: "hello stdin" },
    parent_tool_use_id: null,
    session_id: "",
  });
});

test("finds required local executables before launching Claude", async () => {
  await expect(validateRuntime()).resolves.toMatchObject({
    claude: expect.stringContaining("claude"),
    tmux: expect.stringContaining("tmux"),
  });
});

test("maps termination signals to conventional shell exit codes", () => {
  expect(signalExitCode("SIGINT")).toBe(130);
  expect(signalExitCode("SIGTERM")).toBe(143);
});

test("maps cwd to Claude's project transcript folder", () => {
  expect(projectKeyForCwd("/Users/dex/repos/dexhorthy/shannon")).toBe(
    "-Users-dex-repos-dexhorthy-shannon",
  );
  expect(claudeProjectFolder("/repo", "/home/test")).toBe(
    "/home/test/.claude/projects/-repo",
  );
});

test("matches resumed transcript prompts by timestamp", () => {
  const promptSentAt = Date.parse("2026-05-13T20:00:00.000Z");

  expect(
    rowContainsPromptAfter(
      {
        type: "user",
        timestamp: "2026-05-13T20:00:00.500Z",
        message: { role: "user", content: "resume prompt" },
      },
      "resume prompt",
      promptSentAt,
    ),
  ).toBe(true);

  expect(
    rowContainsPromptAfter(
      {
        type: "user",
        timestamp: "2026-05-13T19:59:00.000Z",
        message: { role: "user", content: "resume prompt" },
      },
      "resume prompt",
      promptSentAt,
    ),
  ).toBe(false);

  expect(
    rowContainsPromptAfter(
      {
        type: "user",
        message: { role: "user", content: "resume prompt" },
      },
      "resume prompt",
      promptSentAt,
      true,
    ),
  ).toBe(true);
});

test("extracts text from Anthropic content blocks", () => {
  expect(textFromContent([{ type: "text", text: "hello" }, { type: "tool_use" }])).toBe(
    "hello",
  );
});

test("extracts skill names from interactive skill listings", () => {
  expect(
    skillNamesFromListing([
      "- pair-agent",
      "- design-shotgun: Design shotgun: generate variants.",
      "continuation line that should be ignored",
      "- riptide-rpi:rpi-setup-humanlayer",
      "- clean-coder:say-hello: Say hello world",
    ].join("\n")),
  ).toEqual([
    "pair-agent",
    "design-shotgun",
    "riptide-rpi:rpi-setup-humanlayer",
    "clean-coder:say-hello",
  ]);
});

test("extracts MCP server names from interactive MCP instruction deltas", () => {
  expect(
    mcpServersFromRows([
      {
        type: "attachment",
        attachment: {
          type: "mcp_instructions_delta",
          addedNames: ["context7", "morph-mcp"],
          removedNames: [],
        },
      },
      {
        type: "attachment",
        attachment: {
          type: "mcp_instructions_delta",
          addedNames: ["github"],
          removedNames: ["morph-mcp"],
        },
      },
    ]),
  ).toEqual([
    { name: "context7", status: "connected" },
    { name: "github", status: "connected" },
  ]);
});

test("translates an interactive assistant row into SDK-ish assistant and result rows", () => {
  const row = {
    type: "assistant",
    parentUuid: "parent-1",
    uuid: "assistant-1",
    sessionId: "session-1",
    message: {
      role: "assistant",
      model: "claude-haiku-4-5-20251001",
      content: [{ type: "text", text: "hello from transcript" }],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 3,
        output_tokens: 4,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 6,
        server_tool_use: { web_search_requests: 0 },
      },
    },
  };

  expect(toSdkAssistant(row)).toMatchObject({
    type: "assistant",
    parent_tool_use_id: null,
    session_id: "session-1",
    uuid: "assistant-1",
  });

  expect(toSdkResult(row, Date.now())).toMatchObject({
    type: "result",
    subtype: "success",
    is_error: false,
    num_turns: 1,
    result: "hello from transcript",
    session_id: "session-1",
    total_cost_usd: 0.000031,
    terminal_reason: "completed",
    modelUsage: {
      "claude-haiku-4-5-20251001": {
        inputTokens: 3,
        outputTokens: 4,
        cacheReadInputTokens: 5,
        cacheCreationInputTokens: 6,
        costUSD: 0.000031,
      },
    },
  });
});

test("estimates native-style cost from transcript usage", () => {
  expect(
    estimateCostUSD("claude-haiku-4-5-20251001", {
      input_tokens: 10,
      cache_creation_input_tokens: 35735,
      cache_read_input_tokens: 0,
      output_tokens: 48,
      server_tool_use: { web_search_requests: 0 },
    }),
  ).toBe(0.04491875);

  expect(
    estimateCostUSD("claude-sonnet-4-5", {
      input_tokens: 1000,
      output_tokens: 100,
      server_tool_use: { web_search_requests: 1 },
    }),
  ).toBeCloseTo(0.0145);
});

test("translates interactive hook success attachments into hook response stream rows", () => {
  const row = {
    type: "attachment",
    uuid: "hook-row-1",
    sessionId: "session-1",
    attachment: {
      type: "hook_success",
      hookName: "SessionStart:startup",
      hookEvent: "SessionStart",
      toolUseID: "hook-1",
      stdout: "ok\n",
      stderr: "",
      exitCode: 0,
    },
  };

  expect(toSdkHookStarted(row)).toEqual({
    type: "system",
    subtype: "hook_started",
    hook_id: "hook-1",
    hook_name: "SessionStart:startup",
    hook_event: "SessionStart",
    uuid: "hook-row-1",
    session_id: "session-1",
  });

  expect(toSdkHookResponse(row)).toEqual({
    type: "system",
    subtype: "hook_response",
    hook_id: "hook-1",
    hook_name: "SessionStart:startup",
    hook_event: "SessionStart",
    output: "ok\n",
    stdout: "ok\n",
    stderr: "",
    exit_code: 0,
    outcome: "success",
    uuid: "hook-row-1",
    session_id: "session-1",
  });
});

test("synthesizes init from transcript metadata when available", () => {
  expect(
    toSdkInit(
      {
        sessionId: "session-1",
        projectFolder: "/home/test/.claude/projects/-repo",
        transcriptPath: "/home/test/.claude/projects/-repo/session-1.jsonl",
        tmuxSession: "shannon-test",
        cwd: "/repo",
      },
      [
        { type: "attachment", version: "2.1.140" },
        { type: "user", permissionMode: "auto" },
        {
          type: "attachment",
          attachment: {
            type: "skill_listing",
            content: "- pair-agent\n- design-shotgun: Design shotgun\n",
          },
        },
        {
          type: "attachment",
          attachment: {
            type: "mcp_instructions_delta",
            addedNames: ["context7"],
            removedNames: [],
          },
        },
        { type: "assistant", message: { role: "assistant", model: "claude-test" } },
      ],
    ),
  ).toMatchObject({
    type: "system",
    subtype: "init",
    cwd: "/repo",
    session_id: "session-1",
    model: "claude-test",
    permissionMode: "auto",
    claude_code_version: "2.1.140",
    mcp_servers: [{ name: "context7", status: "connected" }],
    slash_commands: ["pair-agent", "design-shotgun"],
    skills: ["pair-agent", "design-shotgun"],
  });
});

test("emits a final Shannon metadata row with session location and cleanup status", () => {
  expect(
    toShannonMetadata(
      {
        sessionId: "session-1",
        projectFolder: "/home/test/.claude/projects/-repo",
        transcriptPath: "/home/test/.claude/projects/-repo/session-1.jsonl",
        tmuxSession: "shannon-test",
        cwd: "/repo",
      },
      { tmux_killed: true, exit_code: 0 },
    ),
  ).toMatchObject({
    type: "shannon_session",
    subtype: "metadata",
    session_id: "session-1",
    session_folder: "/home/test/.claude/projects/-repo",
    transcript_path: "/home/test/.claude/projects/-repo/session-1.jsonl",
    tmux_session: "shannon-test",
    cleanup: { tmux_killed: true, exit_code: 0 },
  });
});
