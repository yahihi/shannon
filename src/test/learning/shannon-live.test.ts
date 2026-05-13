import { afterEach, describe, expect, test } from "bun:test";

type JsonRecord = Record<string, unknown>;

const runLive = Bun.env.SHANNON_LIVE === "1" ? describe : describe.skip;

async function runShannonLive(args: string[], stdin?: string) {
  const proc = Bun.spawn(["bun", "./index.ts", ...args], {
    cwd: process.cwd(),
    stdin: stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (stdin !== undefined) {
    proc.stdin?.write(stdin);
    proc.stdin?.end();
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

async function runShannonLiveInteractiveInput(args: string[], messages: JsonRecord[]) {
  const proc = Bun.spawn(["bun", "./index.ts", ...args], {
    cwd: process.cwd(),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  const seen: JsonRecord[] = [];
  let buffer = "";
  let wroteSecond = false;

  proc.stdin?.write(`${JSON.stringify(messages[0])}\n`);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line) as JsonRecord;
      seen.push(message);

      if (!wroteSecond && message.type === "result") {
        wroteSecond = true;
        proc.stdin?.write(`${JSON.stringify(messages[1])}\n`);
        proc.stdin?.end();
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) seen.push(JSON.parse(buffer) as JsonRecord);

  const [stderr, exitCode] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { messages: seen, stderr, exitCode };
}

function parseJsonl(stdout: string): JsonRecord[] {
  return stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JsonRecord);
}

async function shannonTmuxSessions() {
  const proc = Bun.spawn(["tmux", "ls"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) return [];
  return stdout
    .split("\n")
    .map((line) => line.split(":")[0] ?? "")
    .filter((name) => name.startsWith("shannon-"));
}

afterEach(async () => {
  expect(await shannonTmuxSessions()).toEqual([]);
});

runLive("live Shannon conformance", () => {
  test("streams one prompt and cleans up tmux", async () => {
    const { stdout, stderr, exitCode } = await runShannonLive([
      "-p",
      "Reply with exactly: shannon live one",
      "--model",
      "haiku",
      "--output-format=stream-json",
      "--verbose",
    ]);

    expect(exitCode, stderr).toBe(0);
    const messages = parseJsonl(stdout);
    expect(messages.at(-1)?.type).toBe("shannon_session");

    const init = messages.find((message) => (
      message.type === "system" && message.subtype === "init"
    ));
    const assistant = messages.find((message) => message.type === "assistant");
    const result = messages.find((message) => message.type === "result");
    const metadata = messages.at(-1);
    expect(init).toBeDefined();
    expect(assistant).toBeDefined();
    expect(result).toBeDefined();
    expect(metadata).toBeDefined();

    expect(init!).toMatchObject({ type: "system", subtype: "init" });
    expect(init!.tools).toEqual(expect.arrayContaining(["Task", "Read", "Write"]));
    expect(Array.isArray(init!.mcp_servers)).toBe(true);
    expect(Array.isArray(init!.skills)).toBe(true);
    expect(Array.isArray(init!.slash_commands)).toBe(true);
    expect(assistant!).toMatchObject({ type: "assistant" });
    expect(result!).toMatchObject({ type: "result", subtype: "success", num_turns: 1 });
    expect(metadata!).toMatchObject({
      type: "shannon_session",
      subtype: "metadata",
      cleanup: { tmux_killed: true },
    });

    expect(init!.session_id).toBe(assistant!.session_id);
    expect(result!.session_id).toBe(assistant!.session_id);
    expect(metadata!.session_id).toBe(assistant!.session_id);
  }, 60_000);

  test("handles finite stream-json multi-turn input in one session", async () => {
    const stdin = [
      {
        type: "user",
        message: {
          role: "user",
          content: "Reply with exactly: shannon live turn one",
        },
      },
      {
        type: "user",
        message: {
          role: "user",
          content: "Reply with exactly: shannon live turn two",
        },
      },
    ].map((message) => JSON.stringify(message)).join("\n");

    const { stdout, stderr, exitCode } = await runShannonLive(
      [
        "--input-format=stream-json",
        "--model",
        "haiku",
        "--output-format=stream-json",
        "--verbose",
        "--replay-user-messages",
      ],
      `${stdin}\n`,
    );

    expect(exitCode, stderr).toBe(0);
    const messages = parseJsonl(stdout);
    expect(messages.at(-1)?.type).toBe("shannon_session");

    const users = messages.filter((message) => message.type === "user");
    const init = messages.find((message) => (
      message.type === "system" && message.subtype === "init"
    ));
    const assistants = messages.filter((message) => message.type === "assistant");
    const results = messages.filter((message) => message.type === "result");
    const metadata = messages.at(-1);

    expect(users).toHaveLength(2);
    expect(init).toBeDefined();
    expect(assistants).toHaveLength(2);
    expect(results).toHaveLength(2);
    expect(results.map((message) => message.num_turns)).toEqual([1, 2]);
    expect(new Set(assistants.map((message) => message.session_id)).size).toBe(1);
    const [firstAssistant] = assistants;
    expect(firstAssistant).toBeDefined();
    expect(metadata?.session_id).toBe(firstAssistant!.session_id);
    expect(metadata).toMatchObject({
      type: "shannon_session",
      subtype: "metadata",
      cleanup: { tmux_killed: true },
    });
  }, 120_000);

  test("streams stdin turns while stdin remains open", async () => {
    const stdinMessages = [
      {
        type: "user",
        message: {
          role: "user",
          content: "Reply with exactly: shannon live bidi one",
        },
      },
      {
        type: "user",
        message: {
          role: "user",
          content: "Reply with exactly: shannon live bidi two",
        },
      },
    ];

    const { messages, stderr, exitCode } = await runShannonLiveInteractiveInput(
      [
        "--input-format=stream-json",
        "--model",
        "haiku",
        "--output-format=stream-json",
        "--verbose",
        "--replay-user-messages",
      ],
      stdinMessages,
    );

    expect(exitCode, stderr).toBe(0);
    expect(messages.at(-1)?.type).toBe("shannon_session");
    expect(messages.filter((message) => message.type === "user")).toHaveLength(2);
    expect(messages.filter((message) => message.type === "assistant")).toHaveLength(2);
    expect(messages.filter((message) => message.type === "result").map((message) => message.num_turns)).toEqual([1, 2]);
  }, 120_000);

  test("emits json output as one message array", async () => {
    const { stdout, stderr, exitCode } = await runShannonLive([
      "-p",
      "Reply with exactly: shannon live json",
      "--model",
      "haiku",
      "--output-format=json",
    ]);

    expect(exitCode, stderr).toBe(0);
    const messages = JSON.parse(stdout) as JsonRecord[];
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.map((message) => message.type)).toContain("system");
    expect(messages.map((message) => message.type)).toContain("assistant");
    expect(messages.at(-1)).toMatchObject({
      type: "result",
      subtype: "success",
      num_turns: 1,
    });
    const result = messages.at(-1);
    expect(typeof result?.total_cost_usd).toBe("number");
    expect(result!.total_cost_usd as number).toBeGreaterThan(0);
    expect(Object.values(result!.modelUsage as JsonRecord)[0]).toMatchObject({
      costUSD: expect.any(Number),
    });
  }, 60_000);

  test("resumes an existing session by id", async () => {
    const first = await runShannonLive([
      "-p",
      "Reply with exactly: shannon live resume one",
      "--model",
      "haiku",
      "--output-format=stream-json",
      "--verbose",
    ]);

    expect(first.exitCode, first.stderr).toBe(0);
    const firstMessages = parseJsonl(first.stdout);
    const metadata = firstMessages.at(-1);
    expect(metadata).toMatchObject({ type: "shannon_session", subtype: "metadata" });
    const sessionId = metadata?.session_id;
    expect(typeof sessionId).toBe("string");

    const second = await runShannonLive([
      "--resume",
      sessionId as string,
      "-p",
      "Reply with exactly: shannon live resume two",
      "--model",
      "haiku",
      "--output-format=stream-json",
      "--verbose",
    ]);

    expect(second.exitCode, second.stderr).toBe(0);
    const secondMessages = parseJsonl(second.stdout);
    expect(secondMessages.at(-1)).toMatchObject({
      type: "shannon_session",
      subtype: "metadata",
      session_id: sessionId,
    });
    expect(secondMessages.find((message) => message.type === "assistant")).toMatchObject({
      type: "assistant",
      session_id: sessionId,
    });
  }, 120_000);
});
