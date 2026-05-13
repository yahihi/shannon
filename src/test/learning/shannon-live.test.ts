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
      "--output-format=stream-json",
      "--verbose",
    ]);

    expect(exitCode, stderr).toBe(0);
    const messages = parseJsonl(stdout);
    expect(messages.map((message) => message.type)).toEqual([
      "system",
      "assistant",
      "result",
      "shannon_session",
    ]);

    const [init, assistant, result, metadata] = messages;
    expect(init).toBeDefined();
    expect(assistant).toBeDefined();
    expect(result).toBeDefined();
    expect(metadata).toBeDefined();

    expect(init!).toMatchObject({ type: "system", subtype: "init" });
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
  });

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
        "--output-format=stream-json",
        "--verbose",
        "--replay-user-messages",
      ],
      `${stdin}\n`,
    );

    expect(exitCode, stderr).toBe(0);
    const messages = parseJsonl(stdout);
    expect(messages.map((message) => message.type)).toEqual([
      "user",
      "system",
      "assistant",
      "result",
      "user",
      "assistant",
      "result",
      "shannon_session",
    ]);

    const assistants = messages.filter((message) => message.type === "assistant");
    const results = messages.filter((message) => message.type === "result");
    const metadata = messages.at(-1);

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
  });
});
