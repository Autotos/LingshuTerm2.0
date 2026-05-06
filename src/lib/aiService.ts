/**
 * OpenAI-compatible AI service client.
 * Supports: 百炼(DashScope), 火山方舟(Ark), 智谱(GLM), MiniMax, Kimi(Moonshot),
 *           ollama, lm studio, llama.cpp server, and any OpenAI-compatible endpoint.
 */

export interface AiConfig {
  /** API base URL, e.g. "https://api.openai.com/v1" */
  baseUrl: string;
  /** API key (empty for local models) */
  apiKey: string;
  /** Model name, e.g. "gpt-4o", "qwen-turbo", "deepseek-chat" */
  model: string;
  /** Max tokens for completion */
  maxTokens: number;
  /** Temperature (0-2) */
  temperature: number;
}

export const defaultAiConfig: AiConfig = {
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: '',
  model: 'qwen-turbo',
  maxTokens: 2048,
  temperature: 0.3,
};

/** Well-known provider presets */
export const AI_PRESETS: Record<string, { label: string; baseUrl: string; defaultModel: string }> = {
  dashscope:  { label: '百炼 (DashScope)',   baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-turbo' },
  ark:        { label: '火山方舟 (Ark)',      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',         defaultModel: 'doubao-pro-32k' },
  zhipu:      { label: '智谱 (GLM)',          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',             defaultModel: 'glm-4-flash' },
  minimax:    { label: 'MiniMax',             baseUrl: 'https://api.minimax.chat/v1',                      defaultModel: 'abab6.5s-chat' },
  moonshot:   { label: 'Kimi (Moonshot)',     baseUrl: 'https://api.moonshot.cn/v1',                       defaultModel: 'moonshot-v1-8k' },
  openai:     { label: 'OpenAI',              baseUrl: 'https://api.openai.com/v1',                        defaultModel: 'gpt-4o-mini' },
  ollama:     { label: 'Ollama (本地)',        baseUrl: 'http://localhost:11434/v1',                        defaultModel: 'qwen2.5:7b' },
  lmstudio:   { label: 'LM Studio (本地)',    baseUrl: 'http://localhost:1234/v1',                         defaultModel: 'default' },
  llamacpp:   { label: 'llama.cpp (本地)',     baseUrl: 'http://localhost:8080/v1',                         defaultModel: 'default' },
};

/** Single step returned by AI */
export interface AiTaskStep {
  description: string;
  command: string;
}

/** System prompt: Chinese ops expert that converts NL → JSON task list */
const SYSTEM_PROMPT = `你是一位专业的 Linux/macOS/Windows 运维专家，用户会用自然语言描述他们想要完成的操作任务。
你的职责是将用户的自然语言描述转换为可以在终端中执行的 Shell 命令序列。

输出规则：
1. 返回一个 JSON 数组，每个元素包含 "description"（中文描述）和 "command"（Shell 命令）。
2. 命令应该是可以直接执行的完整命令，不要使用占位符。
3. 如果任务需要多个步骤，按照执行顺序排列。
4. 只返回 JSON 数组，不要包含任何其他文字、解释或 Markdown 标记。
5. 如果用户的描述不明确或无法转换为命令，返回空数组 []。

示例输入: "查看当前目录下最大的5个文件"
示例输出: [{"description":"按文件大小排序并显示前5个","command":"du -sh * | sort -rh | head -5"}]

示例输入: "创建一个名为 myapp 的 Node.js 项目并安装 express"
示例输出: [{"description":"创建项目目录","command":"mkdir myapp"},{"description":"进入项目目录","command":"cd myapp"},{"description":"初始化 Node.js 项目","command":"npm init -y"},{"description":"安装 express","command":"npm install express"}]`;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionChoice {
  message: { content: string };
}

interface ChatCompletionResponse {
  choices: ChatCompletionChoice[];
}

/**
 * Call the OpenAI-compatible chat completions API.
 */
async function chatCompletion(
  config: AiConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const body = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`AI API error ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data: ChatCompletionResponse = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI returned empty response');
  }
  return content;
}

/**
 * Convert natural language to a list of executable task steps.
 * Throws on network/parse errors.
 */
export async function nlToTasks(
  config: AiConfig,
  query: string,
  signal?: AbortSignal,
): Promise<AiTaskStep[]> {
  const raw = await chatCompletion(
    config,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query },
    ],
    signal,
  );

  // Extract JSON array from response (handle potential markdown wrapping)
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(`AI response is not a valid JSON array: ${raw.slice(0, 100)}`);
  }

  const parsed: unknown = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) {
    throw new Error('AI response is not an array');
  }

  return parsed.map((item: { description?: string; command?: string }) => ({
    description: String(item.description ?? ''),
    command: String(item.command ?? ''),
  })).filter((step) => step.command.length > 0);
}

/**
 * Test API connectivity by sending a simple ping message.
 * Returns the model's response on success, throws on error.
 */
export async function testConnection(config: AiConfig): Promise<string> {
  const content = await chatCompletion(config, [
    { role: 'user', content: 'Reply "ok" if you can read this.' },
  ]);
  return content;
}
