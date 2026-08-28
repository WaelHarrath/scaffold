import { createHash } from "node:crypto";

export interface CacheEntry {
  readonly hash: string;
  readonly embedding: number[];
  readonly modelId: string;
  readonly timestamp: number;
}

export class EmbeddingCache {
  private readonly cache: Map<string, CacheEntry>;
  private readonly maxSize: number;
  private accessOrder: string[];

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = [];
  }

  get(content: string, modelId: string): number[] | null {
    const key = this.makeKey(content, modelId);
    const entry = this.cache.get(key);
    if (!entry) return null;
    this.touch(key);
    return entry.embedding;
  }

  set(content: string, embedding: number[], modelId: string): void {
    const key = this.makeKey(content, modelId);
    if (this.cache.has(key)) {
      this.touch(key);
      this.cache.set(key, {
        hash: this.hashContent(content),
        embedding,
        modelId,
        timestamp: Date.now(),
      });
      return;
    }
    while (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
      const lruKey = this.accessOrder.shift()!;
      this.cache.delete(lruKey);
    }
    this.cache.set(key, {
      hash: this.hashContent(content),
      embedding,
      modelId,
      timestamp: Date.now(),
    });
    this.accessOrder.push(key);
  }

  has(content: string, modelId: string): boolean {
    return this.cache.has(this.makeKey(content, modelId));
  }

  invalidate(content: string, modelId: string): void {
    const key = this.makeKey(content, modelId);
    this.cache.delete(key);
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) this.accessOrder.splice(idx, 1);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  get size(): number {
    return this.cache.size;
  }

  private hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  private makeKey(content: string, modelId: string): string {
    return `${modelId}:${this.hashContent(content)}`;
  }

  private touch(key: string): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) this.accessOrder.splice(idx, 1);
    this.accessOrder.push(key);
  }
}
