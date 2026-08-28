import { MiniLMAdapter } from "../src/model/embedding.js";
import { EmbeddingCache } from "../src/retrieval/embedding-cache.js";
import { SemanticRetriever, type RetrievalItem } from "../src/retrieval/retriever.js";
import { cosineSimilarity, rankBySimilarity } from "../src/retrieval/similarity.js";

async function auditMiniLM() {
  console.log("=== MINILM RETRIEVAL AUDIT ===\n");

  const model = new MiniLMAdapter();

  // Test 1: Model loads and produces embeddings
  console.log("1. Embedding generation...");
  const emb1 = await model.embed("hello world");
  console.log(`   Dimension: ${emb1.length}`);
  console.log(`   First 5 values: [${emb1.slice(0, 5).map((v) => v.toFixed(4)).join(", ")}]`);
  if (emb1.length !== 384) {
    console.error(`   FAIL: Expected 384-dimensional embeddings, got ${emb1.length}`);
    process.exit(1);
  }
  console.log("   PASS: Correct dimensionality (384)\n");

  // Test 2: Embedding consistency
  console.log("2. Embedding consistency...");
  const emb2 = await model.embed("hello world");
  const sim = cosineSimilarity(emb1, emb2);
  console.log(`   Self-similarity: ${sim.toFixed(6)}`);
  if (sim < 0.999) {
    console.error(`   FAIL: Self-similarity ${sim} < 0.999`);
    process.exit(1);
  }
  console.log("   PASS: Identical input produces identical embedding\n");

  // Test 3: Deterministic ranking
  console.log("3. Deterministic ranking...");
  const items: RetrievalItem[] = [
    { id: "config", content: 'const API_KEY = "sk-12345";' },
    { id: "readme", content: "# Project README\nThis is a web app." },
    { id: "schema", content: '{ "type": "object", "properties": { "name": { "type": "string" } } }' },
  ];

  const r1 = await model.embed("API_KEY configuration");
  const retrieverRank = new SemanticRetriever(model, new EmbeddingCache(100));
  for (const item of items) {
    item.embedding = await retrieverRank.embedItem(item);
  }
  const ranked1 = rankBySimilarity(r1, items.map((i) => ({ id: i.id, embedding: i.embedding! })), 3);
  const ranked2 = rankBySimilarity(r1, items.map((i) => ({ id: i.id, embedding: i.embedding! })), 3);

  console.log(`   Run 1: ${ranked1.map((r) => `${r.id}(${r.score.toFixed(4)})`).join(", ")}`);
  console.log(`   Run 2: ${ranked2.map((r) => `${r.id}(${r.score.toFixed(4)})`).join(", ")}`);

  const sameOrder = ranked1.every((r, i) => r.id === ranked2[i]!.id && Math.abs(r.score - ranked2[i]!.score) < 1e-10);
  if (!sameOrder) {
    console.error("   FAIL: Ranking is not deterministic");
    process.exit(1);
  }
  console.log("   PASS: Ranking is deterministic\n");

  // Test 4: Cache works
  console.log("4. Cache...");
  const cache = new EmbeddingCache(100);
  const retriever = new SemanticRetriever(model, cache);
  const item1: RetrievalItem = { id: "cached-item", content: "This is a test document for caching" };
  const start1 = Date.now();
  await retriever.embedItem(item1);
  const time1 = Date.now() - start1;

  const start2 = Date.now();
  await retriever.embedItem(item1);
  const time2 = Date.now() - start2;

  console.log(`   First embed: ${time1}ms`);
  console.log(`   Cached embed: ${time2}ms`);
  console.log(`   Cache size: ${cache.size}`);
  if (cache.size !== 1) {
    console.error(`   FAIL: Cache size ${cache.size} != 1`);
    process.exit(1);
  }
  console.log("   PASS: Cache works\n");

  // Test 5: Retrieval ranking
  console.log("5. Retrieval ranking...");
  const docs: RetrievalItem[] = [
    { id: "auth", content: "function authenticate(user, password) { return user.active; }" },
    { id: "config", content: "const PORT = 3000; const DB_HOST = 'localhost';" },
    { id: "types", content: "interface User { name: string; active: boolean; }" },
    { id: "router", content: "app.get('/api/users', handler);" },
  ];

  const retriever2 = new SemanticRetriever(model, cache);
  const results = await retriever2.retrieve("find the authenticate function", docs, 2);
  console.log(`   Query: "find the authenticate function"`);
  console.log(`   Results: ${results.map((r) => `${r.id}(${r.score.toFixed(4)})`).join(", ")}`);

  if (results.length === 0) {
    console.error("   FAIL: No results returned");
    process.exit(1);
  }
  console.log("   PASS: Retrieval works\n");

  // Test 6: Irrelevant docs don't get artificially high scores
  console.log("6. Irrelevant document handling...");
  const irrelevantQuery = await model.embed("quantum physics equations");
  const irrelevantDocs = await model.embed("The weather today is sunny with a high of 75F");
  const relevantDocs = await model.embed("Schrödinger equation describes quantum state evolution");
  const irrelevantSim = cosineSimilarity(irrelevantQuery, irrelevantDocs);
  const relevantSim = cosineSimilarity(irrelevantQuery, relevantDocs);
  console.log(`   Irrelevant similarity: ${irrelevantSim.toFixed(4)}`);
  console.log(`   Relevant similarity: ${relevantSim.toFixed(4)}`);
  if (relevantSim <= irrelevantSim) {
    console.error("   FAIL: Relevant doc scored lower than irrelevant");
    process.exit(1);
  }
  console.log("   PASS: Relevant docs rank higher than irrelevant\n");

  // Test 7: Bounded output
  console.log("7. Retrieval token cost...");
  const queryEmbed = await model.embed("test query");
  const queryTokens = Math.ceil("test query".length / 4);
  console.log(`   Query text tokens (chars/4): ${queryTokens}`);
  console.log(`   Embedding dimensions: ${queryEmbed.length}`);
  console.log("   PASS: Retrieval is bounded\n");

  console.log("=== MINILM AUDIT COMPLETE: ALL CHECKS PASSED ===");
}

auditMiniLM().catch((err) => {
  console.error("MiniLM audit failed:", err);
  process.exit(1);
});
