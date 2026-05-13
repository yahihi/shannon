import { query } from "@dexh/shannon";

for await (const message of query({
  prompt: "Reply with exactly: hello",
  options: { outputFormat: "stream-json", verbose: true },
})) {
  if (message.type === "assistant") {
    const content = (message as { message?: { content?: unknown } }).message
      ?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          block &&
          typeof block === "object" &&
          (block as { type?: string }).type === "text"
        ) {
          console.log((block as { text?: string }).text);
        }
      }
    }
  }
}
