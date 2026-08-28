import type { EmbeddingModel } from "./types.js";

const OLLAMA_BASE = "http://localhost:11434";

export class MiniLMAdapter implements EmbeddingModel {
  readonly modelId = "all-minilm:latest";

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.modelId, input: text }),
    });
    if (!res.ok) throw new Error(`MiniLM embed error: ${res.status}`);
    const data = (await res.json()) as { embeddings?: number[][] };
    return data.embeddings?.[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.modelId, input: texts }),
    });
    if (!res.ok) throw new Error(`MiniLM embed error: ${res.status}`);
    const data = (await res.json()) as { embeddings?: number[][] };
    return data.embeddings ?? [];
  }
}
