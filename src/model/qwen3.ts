import type { ReasoningModel, ModelRequest, ModelResponse, TokenUsage } from "./types.js";

const OLLAMA_BASE = "http://localhost:11434";

export class Qwen3Adapter implements ReasoningModel {
  readonly modelId = "qwen3:4b-instruct";

  constructor(private readonly contextSize: number = 4096) {}

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.modelId,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
          num_ctx: this.contextSize,
        },
        stream: false,
      }),
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as {
      message?: { content: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    const usage: TokenUsage = {
      promptTokens: data.prompt_eval_count ?? 0,
      completionTokens: data.eval_count ?? 0,
      totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
    };
    return { content: data.message?.content ?? "", usage };
  }
}
