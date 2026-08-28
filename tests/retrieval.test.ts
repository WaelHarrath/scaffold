import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  rankBySimilarity,
} from "../src/retrieval/similarity.js";
import { EmbeddingCache } from "../src/retrieval/embedding-cache.js";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1);
  });

  it("returns 0 for zero vector", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it("returns 0 when both vectors are zero", () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("throws on different length vectors", () => {
    expect(() => cosineSimilarity([1, 2], [1])).toThrow("Vector length mismatch");
  });

  it("works with single-element vectors", () => {
    expect(cosineSimilarity([5], [5])).toBeCloseTo(1);
    expect(cosineSimilarity([5], [-5])).toBeCloseTo(-1);
  });

  it("computes correctly for known values", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    const expected =
      (1 * 4 + 2 * 5 + 3 * 6) /
      (Math.sqrt(14) * Math.sqrt(77));
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected);
  });
});

describe("rankBySimilarity", () => {
  const items = [
    { id: "a", embedding: [1, 0, 0] },
    { id: "b", embedding: [0, 1, 0] },
    { id: "c", embedding: [0, 0, 1] },
  ];

  it("ranks by similarity descending", () => {
    const results = rankBySimilarity([1, 0, 0], items, 3);
    expect(results[0]!.id).toBe("a");
    expect(results[0]!.score).toBeCloseTo(1);
  });

  it("limits to topK results", () => {
    const results = rankBySimilarity([1, 0, 0], items, 2);
    expect(results).toHaveLength(2);
  });

  it("returns empty array when topK is 0", () => {
    const results = rankBySimilarity([1, 0, 0], items, 0);
    expect(results).toHaveLength(0);
  });

  it("handles empty items list", () => {
    const results = rankBySimilarity([1, 0], [], 5);
    expect(results).toHaveLength(0);
  });

  it("ranks mixed similarity correctly", () => {
    const query = [1, 1, 0];
    const results = rankBySimilarity(query, items, 3);
    expect(results[0]!.id).toBe("a");
    expect(results[1]!.id).toBe("b");
    expect(results[2]!.id).toBe("c");
  });
});

describe("EmbeddingCache", () => {
  it("stores and retrieves embeddings", () => {
    const cache = new EmbeddingCache(10);
    cache.set("hello", [1, 2, 3], "model-a");
    expect(cache.get("hello", "model-a")).toEqual([1, 2, 3]);
  });

  it("returns null for cache miss", () => {
    const cache = new EmbeddingCache(10);
    expect(cache.get("missing", "model-a")).toBeNull();
  });

  it("has() returns true for cached content", () => {
    const cache = new EmbeddingCache(10);
    cache.set("key", [1], "m");
    expect(cache.has("key", "m")).toBe(true);
  });

  it("has() returns false for missing content", () => {
    const cache = new EmbeddingCache(10);
    expect(cache.has("key", "m")).toBe(false);
  });

  it("differentiates by modelId", () => {
    const cache = new EmbeddingCache(10);
    cache.set("hello", [1], "m1");
    cache.set("hello", [2], "m2");
    expect(cache.get("hello", "m1")).toEqual([1]);
    expect(cache.get("hello", "m2")).toEqual([2]);
  });

  it("invalidate removes entry", () => {
    const cache = new EmbeddingCache(10);
    cache.set("key", [1, 2], "m");
    cache.invalidate("key", "m");
    expect(cache.get("key", "m")).toBeNull();
    expect(cache.has("key", "m")).toBe(false);
  });

  it("clear removes all entries", () => {
    const cache = new EmbeddingCache(10);
    cache.set("a", [1], "m");
    cache.set("b", [2], "m");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has("a", "m")).toBe(false);
  });

  it("evicts LRU entry when full", () => {
    const cache = new EmbeddingCache(3);
    cache.set("a", [1], "m");
    cache.set("b", [2], "m");
    cache.set("c", [3], "m");
    // cache is full (size=3)
    cache.set("d", [4], "m");
    expect(cache.size).toBe(3);
    expect(cache.has("a", "m")).toBe(false); // "a" was least recently used
    expect(cache.has("d", "m")).toBe(true);
  });

  it("accessing an item refreshes its LRU position", () => {
    const cache = new EmbeddingCache(3);
    cache.set("a", [1], "m");
    cache.set("b", [2], "m");
    cache.set("c", [3], "m");
    // touch "a" to move it to end of access order
    cache.get("a", "m");
    cache.set("d", [4], "m"); // should evict "b" (now LRU)
    expect(cache.has("a", "m")).toBe(true);
    expect(cache.has("b", "m")).toBe(false);
  });

  it("reports correct size", () => {
    const cache = new EmbeddingCache(10);
    expect(cache.size).toBe(0);
    cache.set("x", [1], "m");
    expect(cache.size).toBe(1);
    cache.set("y", [2], "m");
    expect(cache.size).toBe(2);
  });

  it("uses content-based hashing for keys", () => {
    const cache = new EmbeddingCache(10);
    cache.set("hello", [1], "m");
    cache.set("world", [2], "m");
    // same content should hit same entry regardless of variable name
    expect(cache.get("hello", "m")).toEqual([1]);
    expect(cache.get("world", "m")).toEqual([2]);
  });

  it("overwrites existing entry on duplicate set", () => {
    const cache = new EmbeddingCache(10);
    cache.set("key", [1, 2], "m");
    cache.set("key", [3, 4], "m");
    expect(cache.get("key", "m")).toEqual([3, 4]);
    expect(cache.size).toBe(1);
  });
});
