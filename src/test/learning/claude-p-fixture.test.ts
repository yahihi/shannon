import { expect, test } from "bun:test";

type JsonRecord = Record<string, unknown>;

const fixturePath = new URL("../fixtures/claude-p-haiku-stream-json.fixture.jsonl", import.meta.url);

async function readFixture() {
  const text = await Bun.file(fixturePath).text();
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JsonRecord);
}

function keyFor(message: JsonRecord) {
  return message.type === "system"
    ? `${message.type}/${message.subtype}`
    : String(message.type);
}

test("documents native claude -p stream-json verbose event shape", async () => {
  const messages = await readFixture();
  expect(messages.map(keyFor)).toEqual([
    "system/hook_started",
    "system/hook_response",
    "system/init",
    "assistant",
    "assistant",
    "rate_limit_event",
    "result",
  ]);

  const sessionIds = new Set(messages.map((message) => message.session_id));
  expect(sessionIds).toEqual(new Set(["session-1"]));

  const init = messages.find((message) => keyFor(message) === "system/init");
  expect(init).toMatchObject({
    tools: expect.arrayContaining(["Task", "Bash", "Read", "Write"]),
    mcp_servers: [{ name: "context7", status: "connected" }],
    model: "claude-haiku-4-5-20251001",
    permissionMode: "default",
    apiKeySource: "none",
    output_style: "default",
    analytics_disabled: false,
    fast_mode_state: "off",
  });

  const result = messages.find((message) => message.type === "result");
  expect(result).toMatchObject({
    subtype: "success",
    is_error: false,
    num_turns: 1,
    total_cost_usd: expect.any(Number),
    terminal_reason: "completed",
    modelUsage: {
      "claude-haiku-4-5-20251001": {
        costUSD: expect.any(Number),
        contextWindow: expect.any(Number),
        maxOutputTokens: expect.any(Number),
      },
    },
  });
});

test("tracks current Shannon gaps against the native fixture", async () => {
  const nativeKeys = new Set((await readFixture()).map(keyFor));
  const currentShannonKeys = new Set([
    "system/hook_response",
    "system/init",
    "assistant",
    "result",
    "shannon_session",
  ]);

  expect([...nativeKeys].filter((key) => !currentShannonKeys.has(key))).toEqual([
    "system/hook_started",
    "rate_limit_event",
  ]);
});
