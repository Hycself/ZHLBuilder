export type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type RunContext = {
  argv: string[];
  stderr: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
};

export type GlobalLocale = "auto" | "en-US" | "zh-CN";
export type GlobalDetectedLocale = Exclude<GlobalLocale, "auto">;

/**
 * How a headless run reports itself.
 *
 * `text` prints the answer only. `json` prints one summary document after the
 * turn. `stream-json` additionally writes each session event as its own line
 * (NDJSON) while the turn runs, for callers that drive the CLI as a subprocess
 * and need progress — a bridge rendering a chat UI, for instance — rather than
 * only the finished answer.
 */
export type GlobalOutputFormat = "text" | "json" | "stream-json";

export type GlobalOptions = {
  browserExecutable?: string;
  browserUse?: "headless";
  detectedLocale?: GlobalDetectedLocale;
  enableWorkflow?: boolean;
  force: boolean;
  json: boolean;
  locale?: GlobalLocale;
  /**
   * 本次运行的模型选择，字符串边界为 "providerId/modelId[$reasoningLevel]"。
   * 只影响本次运行（runtimeConfig.modelSelection），不写回配置文件的默认值。
   */
  model?: string;
  memoryBench?: boolean;
  noColor: boolean;
  outputFormat?: GlobalOutputFormat;
  /** 中枢地址覆盖（device 子命令用）。之前 arguments.ts 认识 --server，但这里没有对应字段，globalOptions 也不填，于是 device 的 --server 恒为 undefined，帮助里承诺的参数是假的。 */
  server?: string;
  verbose: boolean;
};

export type RuntimeInfo = {
  arch: NodeJS.Architecture;
  cwd: string;
  execPath: string;
  node: string;
  platform: NodeJS.Platform;
  sea: boolean;
  versions: NodeJS.ProcessVersions;
};
