import type { EmbeddingModel } from "../model/types.js";
import { EmbeddingCache } from "./embedding-cache.js";
import { rankBySimilarity } from "./similarity.js";

export interface RetrievalItem {
  readonly id: string;
  readonly content: string;
  embedding?: number[];
}

export interface RetrievalResult {
  readonly id: string;
  readonly score: number;
}

export class SemanticRetriever {
  constructor(
    private readonly model: EmbeddingModel,
    private readonly cache: EmbeddingCache,
  ) {}

  async retrieve(
    query: string,
    items: RetrievalItem[],
    topK: number,
  ): Promise<RetrievalResult[]> {
    const queryEmbedding = await this.model.embed(query);
    const embedded = await Promise.all(
      items.map(async (item) => ({
        id: item.id,
        embedding: await this.embedItem(item),
      })),
    );
    return rankBySimilarity(queryEmbedding, embedded, topK);
  }

  async embedItem(item: RetrievalItem): Promise<number[]> {
    if (item.embedding) return item.embedding;

    const cached = this.cache.get(item.content, this.model.modelId);
    if (cached) {
      item.embedding = cached;
      return cached;
    }

    const embedding = await this.model.embed(item.content);
    this.cache.set(item.content, embedding, this.model.modelId);
    item.embedding = embedding;
    return embedding;
  }
}
