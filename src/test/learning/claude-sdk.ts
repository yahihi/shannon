/**
 * Learning notes for @anthropic-ai/claude-agent-sdk:
 *
 * - The TypeScript SDK's `query()` API returns an async iterable stream of SDK
 *   messages rather than a single Promise.
 * - A successful single-turn prompt eventually emits a terminal
 *   `{ type: "result", subtype: "success" }` message with the final text in
 *   `result`.
 * - Passing `tools: []` keeps this black-box probe focused on model response
 *   streaming and avoids granting built-in Claude Code tools for a hello test.
 */
import { expect, test } from "bun:test";
import { query, type SDKMessage, type SDKResultSuccess } from "@anthropic-ai/claude-agent-sdk";

const hasClaudeAuth = Boolean(Bun.env.ANTHROPIC_API_KEY);

(hasClaudeAuth ? test : test.skip)("sends a hello message and receives a successful result", async () => {
  const messages: SDKMessage[] = [];

  for await (const message of query({
    prompt: "Reply with exactly: hello from claude",
    options: {
      maxTurns: 1,
      persistSession: false,
      tools: [],
    },
  })) {
    messages.push(message);
  }

  const result = messages.find(
    (message): message is SDKResultSuccess =>
      message.type === "result" && message.subtype === "success",
  );

  expect(result).toBeDefined();
  expect(result?.subtype).toBe("success");
  expect(result?.is_error).toBe(false);
  expect(result?.num_turns).toBe(1);
  expect(result?.result.trim().toLowerCase()).toBe("hello from claude");
});
