import { z } from "zod";

export type ShannonMessage = Record<string, unknown> & {
  type: string;
  session_id?: string;
  uuid?: string;
};

export type ShannonUserMessage = {
  type: "user";
  message: {
    role: "user";
    content: string | Array<{ type: "text"; text: string }>;
  };
  parent_tool_use_id?: string | null;
  session_id?: string;
  uuid?: string;
};

export type QueryOptions = {
  command?: string;
  cwd?: string;
  verbose?: boolean;
  outputFormat?: "stream-json" | "json" | "text";
  replayUserMessages?: boolean;
  additionalDirectories?: string[];
  agent?: string;
  agents?: Record<string, unknown>;
  allowedTools?: string[];
  appendSystemPrompt?: string;
  betas?: string[];
  continue?: boolean;
  debug?: boolean | string;
  debugFile?: string;
  disallowedTools?: string[];
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  fallbackModel?: string;
  forkSession?: boolean;
  fromPr?: string | boolean;
  includeHookEvents?: boolean;
  includePartialMessages?: boolean;
  maxBudgetUsd?: number;
  mcpConfig?: string[];
  model?: string;
  name?: string;
  pathToClaudeCodeExecutable?: string;
  permissionMode?: "acceptEdits" | "auto" | "bypassPermissions" | "default" | "dontAsk" | "plan";
  remoteControl?: string | boolean;
  remoteControlSessionNamePrefix?: string;
  resume?: string | boolean;
  sessionId?: string;
  settings?: string | Record<string, unknown>;
  systemPrompt?: string;
  tools?: string[];
  tmux?: string | boolean;
  worktree?: string | boolean;
  dangerouslySkipPermissions?: boolean;
  allowDangerouslySkipPermissions?: boolean;
  abortController?: AbortController;
};

export type QueryParams = {
  prompt: string | AsyncIterable<ShannonUserMessage>;
  options?: QueryOptions;
};

export const shannonTextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
}).catchall(z.unknown());

export const shannonUserMessageSchema = z.object({
  type: z.literal("user"),
  message: z.object({
    role: z.literal("user"),
    content: z.union([z.string(), z.array(shannonTextBlockSchema)]),
  }).catchall(z.unknown()),
  parent_tool_use_id: z.string().nullable().optional(),
  session_id: z.string().optional(),
  uuid: z.string().optional(),
}).catchall(z.unknown());

export const shannonMessageSchema = z.object({
  type: z.string(),
  session_id: z.string().optional(),
  uuid: z.string().optional(),
}).catchall(z.unknown());

export const shannonSystemInitSchema = z.object({
  type: z.literal("system"),
  subtype: z.literal("init"),
  cwd: z.string(),
  session_id: z.string(),
  tools: z.array(z.string()),
  mcp_servers: z.array(z.object({
    name: z.string(),
    status: z.string(),
  }).catchall(z.unknown())),
  model: z.string(),
  permissionMode: z.string(),
  apiKeySource: z.string().optional(),
  claude_code_version: z.string().optional(),
  output_style: z.string().optional(),
  agents: z.array(z.string()).optional(),
  slash_commands: z.array(z.string()),
  skills: z.array(z.string()),
  plugins: z.array(z.object({
    name: z.string().optional(),
    path: z.string().optional(),
    source: z.string().optional(),
  }).catchall(z.unknown())).optional(),
  uuid: z.string(),
}).catchall(z.unknown());

export const shannonHookStartedSchema = z.object({
  type: z.literal("system"),
  subtype: z.literal("hook_started"),
  hook_id: z.string(),
  hook_name: z.string(),
  hook_event: z.string(),
  session_id: z.string().optional(),
  uuid: z.string(),
}).catchall(z.unknown());

export const shannonHookResponseSchema = z.object({
  type: z.literal("system"),
  subtype: z.literal("hook_response"),
  hook_id: z.string(),
  hook_name: z.string(),
  hook_event: z.string(),
  output: z.string(),
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.number().optional(),
  outcome: z.string(),
  session_id: z.string().optional(),
  uuid: z.string(),
}).catchall(z.unknown());

export const shannonAssistantMessageSchema = z.object({
  type: z.literal("assistant"),
  message: z.object({
    role: z.literal("assistant"),
    model: z.string().optional(),
    content: z.array(z.object({ type: z.string() }).catchall(z.unknown())),
    usage: z.record(z.string(), z.unknown()).optional(),
  }).catchall(z.unknown()),
  parent_tool_use_id: z.string().nullable().optional(),
  session_id: z.string(),
  uuid: z.string(),
}).catchall(z.unknown());

export const shannonResultMessageSchema = z.object({
  type: z.literal("result"),
  subtype: z.string(),
  is_error: z.boolean(),
  duration_ms: z.number(),
  duration_api_ms: z.number(),
  num_turns: z.number(),
  result: z.string(),
  stop_reason: z.string().nullable().optional(),
  session_id: z.string(),
  total_cost_usd: z.number(),
  usage: z.record(z.string(), z.unknown()),
  modelUsage: z.record(z.string(), z.unknown()),
  permission_denials: z.array(z.unknown()),
  terminal_reason: z.string(),
  uuid: z.string(),
}).catchall(z.unknown());

export const shannonSessionMetadataSchema = z.object({
  type: z.literal("shannon_session"),
  subtype: z.literal("metadata"),
  session_id: z.string(),
  session_folder: z.string(),
  transcript_path: z.string(),
  tmux_session: z.string(),
  cwd: z.string(),
  cleanup: z.record(z.string(), z.unknown()),
  uuid: z.string(),
}).catchall(z.unknown());

export const shannonRateLimitInfoSchema = z.object({
  status: z.enum(["allowed", "allowed_warning", "rejected"]),
  resetsAt: z.number().optional(),
  rateLimitType: z.enum(["five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet", "overage"]).optional(),
  utilization: z.number().optional(),
  overageStatus: z.enum(["allowed", "allowed_warning", "rejected"]).optional(),
  overageResetsAt: z.number().optional(),
  overageDisabledReason: z.enum([
    "overage_not_provisioned",
    "org_level_disabled",
    "org_level_disabled_until",
    "out_of_credits",
    "seat_tier_level_disabled",
    "member_level_disabled",
    "seat_tier_zero_credit_limit",
    "group_zero_credit_limit",
    "member_zero_credit_limit",
    "org_service_level_disabled",
    "no_limits_configured",
    "fetch_error",
    "unknown",
  ]).optional(),
  isUsingOverage: z.boolean().optional(),
  surpassedThreshold: z.number().optional(),
}).catchall(z.unknown());

export const shannonRateLimitEventSchema = z.object({
  type: z.literal("rate_limit_event"),
  rate_limit_info: shannonRateLimitInfoSchema,
  session_id: z.string(),
  uuid: z.string(),
}).catchall(z.unknown());

export const shannonStreamMessageSchema = z.union([
  shannonUserMessageSchema,
  shannonSystemInitSchema,
  shannonHookStartedSchema,
  shannonHookResponseSchema,
  shannonAssistantMessageSchema,
  shannonResultMessageSchema,
  shannonSessionMetadataSchema,
  shannonRateLimitEventSchema,
]);

export const shannonOutputFormatSchema = z.enum(["stream-json", "json", "text"]);

export const shannonQueryOptionsSchema = z.object({
  command: z.string().optional(),
  cwd: z.string().optional(),
  verbose: z.boolean().optional(),
  outputFormat: shannonOutputFormatSchema.optional(),
  replayUserMessages: z.boolean().optional(),
  additionalDirectories: z.array(z.string()).optional(),
  agent: z.string().optional(),
  agents: z.record(z.string(), z.unknown()).optional(),
  allowedTools: z.array(z.string()).optional(),
  appendSystemPrompt: z.string().optional(),
  betas: z.array(z.string()).optional(),
  continue: z.boolean().optional(),
  debug: z.union([z.boolean(), z.string()]).optional(),
  debugFile: z.string().optional(),
  disallowedTools: z.array(z.string()).optional(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  fallbackModel: z.string().optional(),
  forkSession: z.boolean().optional(),
  fromPr: z.union([z.string(), z.boolean()]).optional(),
  includeHookEvents: z.boolean().optional(),
  includePartialMessages: z.boolean().optional(),
  maxBudgetUsd: z.number().optional(),
  mcpConfig: z.array(z.string()).optional(),
  model: z.string().optional(),
  name: z.string().optional(),
  pathToClaudeCodeExecutable: z.string().optional(),
  permissionMode: z.enum(["acceptEdits", "auto", "bypassPermissions", "default", "dontAsk", "plan"]).optional(),
  remoteControl: z.union([z.string(), z.boolean()]).optional(),
  remoteControlSessionNamePrefix: z.string().optional(),
  resume: z.union([z.string(), z.boolean()]).optional(),
  sessionId: z.string().optional(),
  settings: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  systemPrompt: z.string().optional(),
  tools: z.array(z.string()).optional(),
  tmux: z.union([z.string(), z.boolean()]).optional(),
  worktree: z.union([z.string(), z.boolean()]).optional(),
  dangerouslySkipPermissions: z.boolean().optional(),
  allowDangerouslySkipPermissions: z.boolean().optional(),
  abortController: z.instanceof(AbortController).optional(),
}).strict();

export const shannonQueryParamsSchema = z.object({
  prompt: z.union([
    z.string(),
    z.custom<AsyncIterable<ShannonUserMessage>>(
      (value) => Boolean(value && typeof value === "object" && Symbol.asyncIterator in value),
      "Expected an async iterable of Shannon user messages",
    ),
  ]),
  options: shannonQueryOptionsSchema.optional(),
}).strict();

export function query({ prompt, options = {} }: QueryParams): AsyncIterable<ShannonMessage> {
  return runQuery(prompt, options);
}

export async function* parseJsonlStream(stream: ReadableStream<Uint8Array>): AsyncIterable<ShannonMessage> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as ShannonMessage;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    yield JSON.parse(buffer) as ShannonMessage;
  }
}

async function* runQuery(
  prompt: string | AsyncIterable<ShannonUserMessage>,
  options: QueryOptions,
): AsyncIterable<ShannonMessage> {
  const command = options.command ?? "shannon";
  const outputFormat = options.outputFormat ?? "stream-json";
  const isStreamingInput = typeof prompt !== "string";
  const args = [
    command,
    ...(typeof prompt === "string" ? ["-p", prompt] : ["--input-format=stream-json"]),
    `--output-format=${outputFormat}`,
    ...(options.verbose ?? true ? ["--verbose"] : []),
    ...(options.replayUserMessages ? ["--replay-user-messages"] : []),
    ...optionsToCliArgs(options),
  ];
  const signal = options.abortController?.signal;

  if (signal?.aborted) {
    throw new Error("Shannon query aborted before start");
  }

  const proc = Bun.spawn(args, {
    cwd: options.cwd,
    stdin: isStreamingInput ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const abortHandler = () => {
    proc.kill("SIGTERM");
  };
  signal?.addEventListener("abort", abortHandler, { once: true });
  const stderrPromise = new Response(proc.stderr).text();
  const stdinPromise = isStreamingInput
    ? writeStreamingInput(proc.stdin, prompt)
    : Promise.resolve();

  try {
    for await (const message of parseJsonlStream(proc.stdout)) {
      yield message;
    }

    const [exitCode, stderr] = await Promise.all([proc.exited, stderrPromise, stdinPromise]);
    if (signal?.aborted) {
      throw new Error("Shannon query aborted");
    }
    if (exitCode !== 0) {
      throw new Error(`shannon exited with ${exitCode}${stderr.trim() ? `: ${stderr.trim()}` : ""}`);
    }
  } finally {
    signal?.removeEventListener("abort", abortHandler);
  }
}

export function optionsToCliArgs(options: QueryOptions): string[] {
  const args: string[] = [];

  addRepeated(args, "--add-dir", options.additionalDirectories);
  addString(args, "--agent", options.agent);
  addJson(args, "--agents", options.agents);
  addBoolean(args, "--allow-dangerously-skip-permissions", options.allowDangerouslySkipPermissions);
  addRepeated(args, "--allowed-tools", options.allowedTools);
  addString(args, "--append-system-prompt", options.appendSystemPrompt);
  addRepeated(args, "--betas", options.betas);
  addBoolean(args, "--continue", options.continue);
  addOptionalString(args, "--debug", options.debug);
  addString(args, "--debug-file", options.debugFile);
  addRepeated(args, "--disallowed-tools", options.disallowedTools);
  addString(args, "--effort", options.effort);
  addString(args, "--fallback-model", options.fallbackModel);
  addBoolean(args, "--fork-session", options.forkSession);
  addOptionalString(args, "--from-pr", options.fromPr);
  addBoolean(args, "--include-hook-events", options.includeHookEvents);
  addBoolean(args, "--include-partial-messages", options.includePartialMessages);
  addString(args, "--max-budget-usd", options.maxBudgetUsd);
  addRepeated(args, "--mcp-config", options.mcpConfig);
  addString(args, "--model", options.model);
  addString(args, "--name", options.name);
  addString(args, "--path-to-claude-code-executable", options.pathToClaudeCodeExecutable);
  addString(args, "--permission-mode", options.permissionMode);
  addOptionalString(args, "--remote-control", options.remoteControl);
  addString(args, "--remote-control-session-name-prefix", options.remoteControlSessionNamePrefix);
  addOptionalString(args, "--resume", options.resume);
  addString(args, "--session-id", options.sessionId);
  addSettings(args, options.settings);
  addString(args, "--system-prompt", options.systemPrompt);
  addRepeated(args, "--tools", options.tools);
  addOptionalString(args, "--tmux", options.tmux);
  addOptionalString(args, "--worktree", options.worktree);
  addBoolean(args, "--dangerously-skip-permissions", options.dangerouslySkipPermissions);

  return args;
}

async function writeStreamingInput(
  stdin: { write: (chunk: string | Uint8Array) => unknown; end: () => unknown } | undefined,
  prompt: AsyncIterable<ShannonUserMessage>,
) {
  if (!stdin) throw new Error("shannon subprocess stdin was not available");

  try {
    for await (const message of prompt) {
      await stdin.write(`${JSON.stringify(message)}\n`);
    }
  } finally {
    await stdin.end();
  }
}

function addString(args: string[], flag: string, value: unknown) {
  if (typeof value === "string" && value.length > 0) args.push(flag, value);
  else if (typeof value === "number") args.push(flag, String(value));
}

function addOptionalString(args: string[], flag: string, value: unknown) {
  if (value === true) args.push(flag);
  else addString(args, flag, value);
}

function addBoolean(args: string[], flag: string, value: unknown) {
  if (value === true) args.push(flag);
}

function addRepeated(args: string[], flag: string, value: unknown) {
  if (Array.isArray(value) && value.length > 0) args.push(flag, ...value.map(String));
}

function addJson(args: string[], flag: string, value: unknown) {
  if (value && typeof value === "object") args.push(flag, JSON.stringify(value));
}

function addSettings(args: string[], value: unknown) {
  if (typeof value === "string") args.push("--settings", value);
  else if (value && typeof value === "object") args.push("--settings", JSON.stringify(value));
}
