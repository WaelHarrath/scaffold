import { TASKS } from "../src/benchmark/tasks.js";
import { retrievalBudgetSpec, formatRetrievalBudgeted } from "../src/execution/format-compress.js";

// Audit: for every task file, is its content long enough that RETRIEVAL_75
// (225 chars) or FULL (300 chars) would actually TRUNCATE it?
// If no file exceeds the smaller limit, the two levels ship identical payloads
// and an adaptive truncation-based policy has no signal to act on.

let maxLen = 0;
let longestId = "";
let filesOver225 = 0;
let filesOver300 = 0;
const fileCounts: Record<string, { len: number; over75: boolean; overFull: boolean }> = {};

for (const t of TASKS) {
  for (const f of t.workspace) {
    const len = f.content.length;
    if (len > maxLen) { maxLen = len; longestId = `${t.id}:${f.path}`; }
    if (len > 225) filesOver225++;
    if (len > 300) filesOver300++;
    fileCounts[`${t.id}:${f.path}`] = { len, over75: len > 225, overFull: len > 300 };
  }
}

console.log("=== RETRIEVAL TRUNCATION AUDIT ===");
console.log(`Total task files scanned: ${Object.keys(fileCounts).length}`);
console.log(`Longest file: ${longestId} = ${maxLen} chars`);
console.log(`Files over RETRIEVAL_75 limit (225): ${filesOver225}`);
console.log(`Files over FULL limit (300): ${filesOver300}`);

const spec75 = retrievalBudgetSpec("RETRIEVAL_75");
const specFull = retrievalBudgetSpec("FULL");
console.log(`\nRETRIEVAL_75 spec: topK=${spec75.topK} itemLimit=${spec75.itemCharLimit} maxTotal=${spec75.maxTotalChars}`);
console.log(`FULL spec: topK=${specFull.topK} itemLimit=${specFull.itemCharLimit} maxTotal=${specFull.maxTotalChars}`);

// Hypothetical: would the two levels ever produce different text for a task?
// Only if some item.content.length > 225 (slice point). Compare for each file.
let differing = 0;
for (const [id, info] of Object.entries(fileCounts)) {
  const text75 = "X".repeat(Math.min(info.len, spec75.itemCharLimit));
  const textFull = "X".repeat(Math.min(info.len, specFull.itemCharLimit));
  if (text75 !== textFull) { differing++; console.log(`  DIFF for ${id} (len=${info.len})`); }
}
console.log(`\nFiles where 225-slice != 300-slice: ${differing}`);
console.log(`\nCONCLUSION: adaptive truncation-retrieval signal fires on ${differing} of ${Object.keys(fileCounts).length} files.`);
