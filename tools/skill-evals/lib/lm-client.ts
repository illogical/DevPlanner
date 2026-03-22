/**
 * LM API client — wraps POST /v1/chat/completions (OpenAI-compatible).
 *
 * Uses OLLAMA_BASE_URL from env (the LM API pool, not native Ollama /api/chat).
 * temperature: 0, stream: false for deterministic eval runs.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  stream?: boolean;
}

export interface CompletionResponse {
  content: string;
  durationMs: number;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export class LmClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly delayMs: number;

  constructor(opts?: {
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
    delayMs?: number;
  }) {
    this.baseUrl = (opts?.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:17100").replace(/\/$/, "");
    this.model = opts?.model ?? process.env.OLLAMA_MODEL ?? "qwen2.5-coder:14b";
    this.timeoutMs = opts?.timeoutMs ?? parseInt(process.env.OLLAMA_CALL_TIMEOUT_MS ?? "60000", 10);
    this.delayMs = opts?.delayMs ?? parseInt(process.env.OLLAMA_CALL_DELAY_MS ?? "500", 10);
  }

  /** Wait the configured inter-call delay. Call between scenario requests. */
  async delay(): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
  }

  /** Send a single completion request. Returns the assistant message content. */
  async complete(messages: ChatMessage[], modelOverride?: string): Promise<CompletionResponse> {
    const model = modelOverride ?? this.model;
    const url = `${this.baseUrl}/v1/chat/completions`;

    const body = JSON.stringify({
      model,
      messages,
      temperature: 0,
      stream: false,
    });

    const start = Date.now();
    const response = await this.fetchWithRetry(url, body);
    const durationMs = Date.now() - start;

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: unknown;
    };

    if (!data.choices?.[0]?.message?.content) {
      throw new Error(`Unexpected response shape: ${JSON.stringify(data).slice(0, 200)}`);
    }

    return {
      content: data.choices[0].message.content,
      durationMs,
      model,
    };
  }

  /** One retry on network error only; throws immediately on 4xx/5xx. */
  private async fetchWithRetry(url: string, body: string): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        if (attempt === 0) {
          // Network/timeout error — retry once
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw new Error(`Network error calling LM API: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`LM API returned ${response.status}: ${text.slice(0, 300)}`);
      }

      return response;
    }
    // Should never reach here (loop always throws or returns)
    throw new Error("Unreachable");
  }

  get modelName(): string {
    return this.model;
  }

  get baseUrlValue(): string {
    return this.baseUrl;
  }
}
