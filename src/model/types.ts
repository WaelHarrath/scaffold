export interface ModelRequest {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly maxTokens: number;
  readonly temperature: number;
}

export interface ModelResponse {
  readonly content: string;
  readonly usage: TokenUsage;
}

export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface ReasoningModel {
  readonly modelId: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
}

export interface EmbeddingModel {
  readonly modelId: string;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
