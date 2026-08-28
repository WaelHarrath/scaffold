export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector length mismatch: ${a.length} vs ${b.length}`,
    );
  }
  if (a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function rankBySimilarity(
  query: number[],
  items: { id: string; embedding: number[] }[],
  topK: number,
): { id: string; score: number }[] {
  return items
    .map((item) => ({ id: item.id, score: cosineSimilarity(query, item.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
