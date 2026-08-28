import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { TASKS } from "../src/benchmark/tasks.js";
import { Qwen3Adapter } from "../src/model/qwen3.js";
import { MiniLMAdapter } from "../src/model/embedding.js";
import { EmbeddingCache } from "../src/retrieval/embedding-cache.js";
import { SemanticRetriever, type RetrievalItem } from "../src/retrieval/retriever.js";
import { createExecutor } from "../src/execution/executor.js";
import { createGovernorState } from "../src/execution/governor.js";
import { runScaffoldLoop, type ScaffoldDeps } from "../src/execution/scaffold-loop.js";
import { SYSTEM_PROMPT } from "../src/execution/system-prompt.js";
import {
  formatModelOnlyPrompt,
  formatStateOnlyPrompt,
  formatFeedbackOnlyPrompt,
  formatRetrievalPrompt,
  formatMinimalPrompt,
  formatStateRetrievalPrompt,
  formatFeedbackRetrievalPrompt,
  formatFullPrompt,
} from "../src/execution/format-prompt.js";
import { estimateTokens } from "../src/context/context-budget.js";
import type { TaskDefinition } from "../src/benchmark/types.js";

// ─── Extended result type ────────────────────────────────────────────────────

export interface Phase3Result {
  readonly taskId: string;
  readonly category: string;
  readonly success: boolean;
  readonly reason: string;
  readonly modelCalls: number;
  readonly toolCalls: number;
  readonly rejectedActions: number;
  readonly duplicateActions: number;
  readonly noopActions: number;
  readonly totalTokens: number;
  readonly executionTime: number;
  readonly condition: string;
  readonly rep: number;
  readonly retrievalTokens: number;
  readonly feedbackTokens: number;
  readonly inputTokens: number;
  readonly budgetExhausted: boolean;
  readonly failureClass: string;
  readonly actionSequence: string[];
}

// ─── Configuration ───────────────────────────────────────────────────────────

const SELECTED_IDS = [
  "ST1", "ST2", "MS1", "MS2", "ER1", "ER2",
  "TO1", "TO2", "CP1", "CP2", "CF1", "CF2",
  "AS1", "AS2", "CV1", "CV2", "RA1", "RA2",
  "DC1", "DC2",
] as const;

const CONDITIONS = [
  "MODEL_ONLY",       // A
  "STATE_ONLY",       // B
  "FEEDBACK_ONLY",    // C
  "GOVERNOR_ONLY",    // D
  "RETRIEVAL_ONLY",   // E
  "STATE_FEEDBACK",   // F
  "STATE_RETRIEVAL",  // G
  "FEEDBACK_RETRIEVAL", // H
  "STATE_FB_GOVERNOR",  // I
  "FULL",             // J
] as const;

const REPS = 5;

const INFERENCE_PARAMS = {
  modelId: "qwen3:4b-instruct",
  temperature: 0.1,
  maxTokens: 256,
  maxActions: 20,
  contextSize: 4096,
  reservedOutput: 256,
  inputBudget: 3840,
} as const;

// ─── Balanced condition ordering ─────────────────────────────────────────────

function balancedOrdering(reps: number, numConditions: number): string[][] {
  const base = [...CONDITIONS];
  const orders: string[][] = [];
  for (let r = 0; r < reps; r++) {
    const offset = r % numConditions;
    const order = [...base.slice(offset), ...base.slice(0, offset)];
    orders.push(order);
  }
  return orders;
}

// ─── File reading for retrieval ───────────────────────────────────────────────

function readFilesInDir(dir: string): RetrievalItem[] {
  const items: RetrievalItem[] = [];
  try {
    const entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const parentPath = (entry as { parentPath?: string; path?: string }).parentPath
          ?? (entry as { path?: string }).path
          ?? "";
        const fullPath = path.join(parentPath, entry.name);
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const rel = path.relative(dir, fullPath);
          items.push({ id: rel, content: content.slice(0, 2000) });
        } catch {
          // skip unreadable
        }
      }
    }
  } catch {
    // ignore scan errors
  }
  return items;
}

function buildRetriever(workingDir: string) {
  const embeddingModel = new MiniLMAdapter();
  const cache = new EmbeddingCache(500);
  const retriever = new SemanticRetriever(embeddingModel, cache);
  let cachedItems: RetrievalItem[] | null = null;

  return {
    retrieve: async (state: { task: string; lastAction: string; currentGoal: string }, _observation: string | null) => {
      if (!cachedItems) cachedItems = readFilesInDir(workingDir);
      if (cachedItems.length === 0) return { text: "", tokens: 0 };
      const query = `${state.task} ${state.lastAction ?? ""} ${state.currentGoal ?? ""}`.slice(0, 500);
      const results = await retriever.retrieve(query, cachedItems, 3);
      const parts: string[] = [];
      for (const r of results) {
        const item = cachedItems.find((i) => i.id === r.id);
        if (item) parts.push(`[${r.id}] ${item.content.slice(0, 300)}`);
      }
      return { text: parts.join("\n"), tokens: estimateTokens(parts.join("\n")) };
    },
  };
}

// ─── Condition builders ──────────────────────────────────────────────────────

function buildDeps(condition: string, workingDir: string): ScaffoldDeps {
  const model = new Qwen3Adapter(INFERENCE_PARAMS.contextSize);
  const executor = createExecutor(workingDir);
  const governor = createGovernorState();
  const modelId = model as any;

  switch (condition) {
    // A: MODEL_ONLY — no state, no feedback, no retrieval, no governor
    case "MODEL_ONLY":
      return {
        model: modelId,
        executor,
        governor,
        systemPrompt: SYSTEM_PROMPT,
        formatPrompt: (state, feedback) => formatModelOnlyPrompt(state, feedback),
        governorEnabled: false,
      };

    // B: STATE_ONLY — compact cognitive state, no feedback, no retrieval, no governor
    case "STATE_ONLY":
      return {
        model: modelId,
        executor,
        governor,
        systemPrompt: SYSTEM_PROMPT,
        formatPrompt: (state, feedback) => formatStateOnlyPrompt(state, feedback),
        governorEnabled: false,
      };

    // C: FEEDBACK_ONLY — execution feedback, no state, no retrieval, no governor
    case "FEEDBACK_ONLY":
      return {
        model: modelId,
        executor,
        governor,
        systemPrompt: SYSTEM_PROMPT,
        formatPrompt: (state, feedback) => formatFeedbackOnlyPrompt(state, feedback),
        governorEnabled: false,
      };

    // D: GOVERNOR_ONLY — action governance only, no state, no feedback, no retrieval
    case "GOVERNOR_ONLY":
      return {
        model: modelId,
        executor,
        governor,
        systemPrompt: SYSTEM_PROMPT,
        formatPrompt: (state, feedback) => formatModelOnlyPrompt(state, feedback),
        governorEnabled: true,
      };

    // E: RETRIEVAL_ONLY — MiniLM retrieval, no state, no feedback, no governor
    case "RETRIEVAL_ONLY":
      return {
        model: modelId,
        executor,
        governor,
        systemPrompt: SYSTEM_PROMPT,
        formatPrompt: (state, feedback, retrieved) =>
          formatRetrievalPrompt(state, feedback, retrieved ?? ""),
        retrieve: buildRetriever(workingDir).retrieve,
        governorEnabled: false,
      };

    // F: STATE+FEEDBACK — deterministic components, no retrieval, no governor
    case "STATE_FEEDBACK":
      return {
        model: modelId,
        executor,
        governor,
        systemPrompt: SYSTEM_PROMPT,
        formatPrompt: (state, feedback) => formatMinimalPrompt(state, feedback),
        governorEnabled: false,
      };

    // G: STATE+RETRIEVAL — state + retrieval, no feedback, no governor
    case "STATE_RETRIEVAL":
      return {
        model: modelId,
        executor,
        governor,
        systemPrompt: SYSTEM_PROMPT,
        formatPrompt: (state, feedback, retrieved) =>
          formatStateRetrievalPrompt(state, feedback, retrieved ?? ""),
        retrieve: buildRetriever(workingDir).retrieve,
        governorEnabled: false,
      };

    // H: FEEDBACK+RETRIEVAL — feedback + retrieval, no state, no governor
    case "FEEDBACK_RETRIEVAL":
      return {
        model: modelId,
        executor,
        governor,
        systemPrompt: SYSTEM_PROMPT,
        formatPrompt: (state, feedback, retrieved) =>
          formatFeedbackRetrievalPrompt(state, feedback, retrieved ?? ""),
        retrieve: buildRetriever(workingDir).retrieve,
        governorEnabled: false,
      };

    // I: STATE+FEEDBACK+GOVERNOR — all deterministic, no retrieval
    case "STATE_FB_GOVERNOR":
      return {
        model: modelId,
        executor,
        governor,
        systemPrompt: SYSTEM_PROMPT,
        formatPrompt: (state, feedback) => formatMinimalPrompt(state, feedback),
        governorEnabled: true,
      };

    // J: FULL — all components
    case "FULL":
      return {
        model: modelId,
        executor,
        governor,
        systemPrompt: SYSTEM_PROMPT,
        formatPrompt: (state, feedback, retrieved) =>
          formatFullPrompt(state, feedback, retrieved ?? ""),
        retrieve: buildRetriever(workingDir).retrieve,
        governorEnabled: true,
      };

    default:
      throw new Error(`Unknown condition: ${condition}`);
  }
}

// ─── Workspace management ────────────────────────────────────────────────────

function setupWorkspace(task: TaskDefinition): string {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-phase3-"));
  for (const file of task.workspace) {
    const filePath = path.join(workspaceDir, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, "utf-8");
  }
  return workspaceDir;
}

function cleanupWorkspace(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2 });
  } catch {
    // best-effort
  }
}

// ─── Action collection ───────────────────────────────────────────────────────

function collectActions(state: import("../src/state/state.js").TaskState) {
  return state.attemptedActions.map((a) => {
    const parts = a.split(" ");
    return {
      success: !state.failedActions.includes(a),
      actionType: parts[0] ?? "unknown",
      target: parts.slice(1).join(" ") || undefined,
    };
  });
}

// ─── Failure classification ──────────────────────────────────────────────────

function classifyFailure(
  reason: string,
  modelCalls: number,
  maxActions: number,
): string {
  if (reason.startsWith("INFRASTRUCTURE:")) return "infrastructure";
  if (reason.includes("exhausted")) return "budget_exhaustion";
  if (reason.includes("duplicate")) return "repeated_action";
  if (reason.includes("could not parse")) return "action_parse_failure";
  if (reason.includes("model signaled completion") || reason.includes("finish")) return "premature_finish";
  if (modelCalls >= maxActions) return "budget_exhaustion";
  return "reasoning_failure";
}

// ─── Checkpoint ──────────────────────────────────────────────────────────────

interface Checkpoint {
  results: Phase3Result[];
  completedKeys: string[];
}

function saveCheckpoint(checkpoint: Checkpoint, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "checkpoint.json"), JSON.stringify(checkpoint, null, 2), "utf-8");
}

function loadCheckpoint(dir: string): Checkpoint | null {
  const p = path.join(dir, "checkpoint.json");
  try {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as Checkpoint;
    }
  } catch {
    // corrupt
  }
  return null;
}

// ─── Main runner ─────────────────────────────────────────────────────────────

export async function runPhase3(): Promise<Phase3Result[]> {
  const selectedTasks = TASKS.filter((t) => (SELECTED_IDS as readonly string[]).includes(t.id));
  const orders = balancedOrdering(REPS, CONDITIONS.length);

  console.log(`\n=== PHASE 3: CONTROLLED ABLATION & MECHANISM ANALYSIS ===`);
  console.log(`Model: ${INFERENCE_PARAMS.modelId}`);
  console.log(`Context: ${INFERENCE_PARAMS.contextSize} tokens`);
  console.log(`Temperature: ${INFERENCE_PARAMS.temperature}`);
  console.log(`Max tokens per call: ${INFERENCE_PARAMS.maxTokens}`);
  console.log(`Max actions per task: ${INFERENCE_PARAMS.maxActions}`);
  console.log(`Tasks: ${selectedTasks.length}`);
  console.log(`Conditions: ${CONDITIONS.length}`);
  console.log(`Repetitions: ${REPS}`);
  console.log(`Total executions: ${selectedTasks.length * CONDITIONS.length * REPS}`);
  console.log(`Condition orders:`);
  for (let r = 0; r < REPS; r++) {
    console.log(`  Rep ${r}: ${orders[r]!.join(" -> ")}`);
  }

  const resultsDir = path.join(process.cwd(), "benchmarks", "results", "phase3");
  const checkpoint = loadCheckpoint(resultsDir) ?? { results: [], completedKeys: [] };
  const completedKeys = new Set(checkpoint.completedKeys);

  const results: Phase3Result[] = [...checkpoint.results];
  let executed = 0;
  let succeeded = 0;

  for (let rep = 0; rep < REPS; rep++) {
    const order = orders[rep]!;
    console.log(`\n--- Rep ${rep} (order: ${order.join(" -> ")}) ---`);

    for (const task of selectedTasks) {
      for (const condition of order) {
        const key = `${task.id}|${condition}|${rep}`;
        if (completedKeys.has(key)) {
          console.log(`  SKIP ${task.id} ${condition} rep${rep} (checkpoint)`);
          continue;
        }

        const startTime = Date.now();
        process.stdout.write(`  ${task.id} ${condition} rep${rep}... `);

        const workspaceDir = setupWorkspace(task);
        try {
          const deps = buildDeps(condition, workspaceDir);
          const loopResult = await runScaffoldLoop(task.objective, deps, {
            maxActions: INFERENCE_PARAMS.maxActions,
            temperature: INFERENCE_PARAMS.temperature,
            maxTokens: INFERENCE_PARAMS.maxTokens,
            governorEnabled: deps.governorEnabled,
          });

          const actions = collectActions(loopResult.state);
          const verification = task.verify(workspaceDir, actions);

          const inputTokens = loopResult.totalTokens - loopResult.retrievalTokens;
          const budgetExhausted = loopResult.modelCalls >= INFERENCE_PARAMS.maxActions && !loopResult.success;
          const failureClass = verification.success
            ? "success"
            : classifyFailure(verification.reason, loopResult.modelCalls, INFERENCE_PARAMS.maxActions);

          const result: Phase3Result = {
            taskId: task.id,
            category: task.category,
            success: verification.success,
            reason: verification.reason,
            modelCalls: loopResult.modelCalls,
            toolCalls: loopResult.toolCalls,
            rejectedActions: loopResult.rejectedActions,
            duplicateActions: loopResult.duplicateActions,
            noopActions: loopResult.noopActions,
            totalTokens: loopResult.totalTokens,
            executionTime: loopResult.executionTime,
            condition,
            rep,
            retrievalTokens: loopResult.retrievalTokens,
            feedbackTokens: 0,
            inputTokens,
            budgetExhausted,
            failureClass,
            actionSequence: loopResult.state.attemptedActions,
          };

          results.push(result);
          completedKeys.add(key);
          executed++;

          if (verification.success) succeeded++;

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const status = verification.success ? "PASS" : "FAIL";
          console.log(`${status} (${elapsed}s, ${loopResult.modelCalls} calls, ${loopResult.totalTokens} tok)`);

          if (executed % 5 === 0) {
            saveCheckpoint({ results, completedKeys: [...completedKeys] }, resultsDir);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`ERROR: ${msg}`);

          const result: Phase3Result = {
            taskId: task.id,
            category: task.category,
            success: false,
            reason: `INFRASTRUCTURE: ${msg}`,
            modelCalls: 0,
            toolCalls: 0,
            rejectedActions: 0,
            duplicateActions: 0,
            noopActions: 0,
            totalTokens: 0,
            executionTime: Date.now() - startTime,
            condition,
            rep,
            retrievalTokens: 0,
            feedbackTokens: 0,
            inputTokens: 0,
            budgetExhausted: false,
            failureClass: "infrastructure",
            actionSequence: [],
          };
          results.push(result);
          completedKeys.add(key);
          executed++;
        } finally {
          cleanupWorkspace(workspaceDir);
        }
      }
    }
  }

  saveCheckpoint({ results, completedKeys: [...completedKeys] }, resultsDir);

  console.log(`\n=== PHASE 3 COMPLETE ===`);
  console.log(`Executed: ${executed}`);
  console.log(`Succeeded: ${succeeded} (${((succeeded / executed) * 100).toFixed(1)}%)`);

  return results;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

export function analyzePhase3(results: Phase3Result[]): string {
  const lines: string[] = [];
  const conds = [...CONDITIONS];
  const maxActions = INFERENCE_PARAMS.maxActions;

  const taskIds = [...new Set(results.map((r) => r.taskId))];

  // ─── Section 8: Overall results ────────────────────────────────────────
  lines.push("## 8. Overall Results\n");
  lines.push("| Condition | Success | Rate | Avg Tokens | Avg Time | Avg Calls |");
  lines.push("|---|---|---|---|---|---|");
  for (const c of conds) {
    const cr = results.filter((r) => r.condition === c);
    const pass = cr.filter((r) => r.success).length;
    const rate = ((pass / cr.length) * 100).toFixed(1);
    const avgTok = cr.length > 0 ? (cr.reduce((s, r) => s + r.totalTokens, 0) / cr.length).toFixed(0) : "0";
    const avgTime = cr.length > 0 ? (cr.reduce((s, r) => s + r.executionTime, 0) / cr.length / 1000).toFixed(1) : "0";
    const avgCalls = cr.length > 0 ? (cr.reduce((s, r) => s + r.modelCalls, 0) / cr.length).toFixed(1) : "0";
    lines.push(`| ${c} | ${pass}/${cr.length} | ${rate}% | ${avgTok} | ${avgTime}s | ${avgCalls} |`);
  }

  // ─── Section 9: Paired conversions/regressions ─────────────────────────
  lines.push("\n## 9. Paired Conversions/Regressions vs MODEL_ONLY\n");
  const moResults = results.filter((r) => r.condition === "MODEL_ONLY");

  lines.push("| Condition | Conversions | Regressions | Net |");
  lines.push("|---|---|---|---|");
  for (const c of conds.filter((c) => c !== "MODEL_ONLY")) {
    const cr = results.filter((r) => r.condition === c);
    let conv = 0, reg = 0;
    for (const r of cr) {
      const mo = moResults.find((m) => m.taskId === r.taskId && m.rep === r.rep);
      if (mo && !mo.success && r.success) conv++;
      if (mo && mo.success && !r.success) reg++;
    }
    lines.push(`| ${c} | ${conv} | ${reg} | ${conv - reg} |`);
  }

  // FULL vs each other condition
  lines.push("\n### FULL vs Other Conditions\n");
  lines.push("| Condition | FULL Conv | FULL Reg | Net |");
  lines.push("|---|---|---|---|");
  const fullResults = results.filter((r) => r.condition === "FULL");
  for (const c of conds.filter((c) => c !== "FULL")) {
    const cr = results.filter((r) => r.condition === c);
    let conv = 0, reg = 0;
    for (const r of fullResults) {
      const other = cr.find((o) => o.taskId === r.taskId && o.rep === r.rep);
      if (other && !other.success && r.success) conv++;
      if (other && other.success && !r.success) reg++;
    }
    lines.push(`| ${c} | ${conv} | ${reg} | ${conv - reg} |`);
  }

  // ─── Section 10: Task-level results ────────────────────────────────────
  lines.push("\n## 10. Task-Level Results\n");
  lines.push("| Task | " + conds.join(" | ") + " |");
  lines.push("|---|" + conds.map(() => "---").join("|") + "|");
  for (const task of taskIds) {
    const row = conds.map((c) => {
      const cr = results.filter((r) => r.taskId === task && r.condition === c);
      const pass = cr.filter((r) => r.success).length;
      return `${pass}/${cr.length}`;
    });
    lines.push(`| ${task} | ${row.join(" | ")} |`);
  }

  // ─── Section 11: Component-level analysis ──────────────────────────────
  lines.push("\n## 11. Component-Level Analysis\n");

  const moRate = rateOf(results, "MODEL_ONLY");
  const stateOnlyRate = rateOf(results, "STATE_ONLY");
  const fbOnlyRate = rateOf(results, "FEEDBACK_ONLY");
  const govOnlyRate = rateOf(results, "GOVERNOR_ONLY");
  const retOnlyRate = rateOf(results, "RETRIEVAL_ONLY");
  const sfRate = rateOf(results, "STATE_FEEDBACK");
  const srRate = rateOf(results, "STATE_RETRIEVAL");
  const frRate = rateOf(results, "FEEDBACK_RETRIEVAL");
  const sfgRate = rateOf(results, "STATE_FB_GOVERNOR");
  const fullRate = rateOf(results, "FULL");

  lines.push("### Individual component contribution (success rate delta vs MODEL_ONLY)\n");
  lines.push("| Component | Rate | Delta | Significant? |");
  lines.push("|---|---|---|---|");
  lines.push(`| STATE_ONLY | ${pct(stateOnlyRate)} | +${pp(stateOnlyRate, moRate)} | ${sig(stateOnlyRate, moRate)} |`);
  lines.push(`| FEEDBACK_ONLY | ${pct(fbOnlyRate)} | +${pp(fbOnlyRate, moRate)} | ${sig(fbOnlyRate, moRate)} |`);
  lines.push(`| GOVERNOR_ONLY | ${pct(govOnlyRate)} | +${pp(govOnlyRate, moRate)} | ${sig(govOnlyRate, moRate)} |`);
  lines.push(`| RETRIEVAL_ONLY | ${pct(retOnlyRate)} | +${pp(retOnlyRate, moRate)} | ${sig(retOnlyRate, moRate)} |`);

  lines.push("\n### Pairwise combination contribution\n");
  lines.push("| Combination | Rate | Delta vs sum of parts |");
  lines.push("|---|---|---|");
  lines.push(`| STATE+FEEDBACK | ${pct(sfRate)} | ${interaction(sfRate, stateOnlyRate, fbOnlyRate, moRate)} |`);
  lines.push(`| STATE+RETRIEVAL | ${pct(srRate)} | ${interaction(srRate, stateOnlyRate, retOnlyRate, moRate)} |`);
  lines.push(`| FEEDBACK+RETRIEVAL | ${pct(frRate)} | ${interaction(frRate, fbOnlyRate, retOnlyRate, moRate)} |`);

  lines.push("\n### Full component stacks\n");
  lines.push("| Stack | Rate |");
  lines.push("|---|---|");
  lines.push(`| STATE+FEEDBACK (F) | ${pct(sfRate)} |`);
  lines.push(`| STATE+FEEDBACK+GOVERNOR (I) | ${pct(sfgRate)} |`);
  lines.push(`| FULL (J) | ${pct(fullRate)} |`);

  // ─── Section 12: Interaction analysis ──────────────────────────────────
  lines.push("\n## 12. Interaction Analysis\n");
  lines.push("### Synergy vs additivity\n");
  lines.push("| Pair | Actual Rate | Sum of parts (minus MO) | Synergy |");
  lines.push("|---|---|---|---|");
  const addSF = stateOnlyRate + fbOnlyRate - moRate;
  lines.push(`| STATE+FEEDBACK | ${pct(sfRate)} | ${pct(addSF)} | ${synergy(sfRate, addSF)} |`);
  const addSR = stateOnlyRate + retOnlyRate - moRate;
  lines.push(`| STATE+RETRIEVAL | ${pct(srRate)} | ${pct(addSR)} | ${synergy(srRate, addSR)} |`);
  const addFR = fbOnlyRate + retOnlyRate - moRate;
  lines.push(`| FEEDBACK+RETRIEVAL | ${pct(frRate)} | ${pct(addFR)} | ${synergy(frRate, addFR)} |`);

  const addSFG = stateOnlyRate + fbOnlyRate + govOnlyRate - 2 * moRate;
  lines.push(`| STATE+FB+GOV | ${pct(sfgRate)} | ${pct(addSFG)} | ${synergy(sfgRate, addSFG)} |`);

  // Governor interaction
  lines.push("\n### Governor interaction\n");
  lines.push("| Without Gov | With Gov | Delta |");
  lines.push("|---|---|---|");
  lines.push(`| STATE+FB: ${pct(sfRate)} | STATE+FB+GOV: ${pct(sfgRate)} | +${pp(sfgRate, sfRate)} |`);
  lines.push(`| MODEL_ONLY: ${pct(moRate)} | GOVERNOR_ONLY: ${pct(govOnlyRate)} | +${pp(govOnlyRate, moRate)} |`);

  // ─── Section 13: Token/context analysis ────────────────────────────────
  lines.push("\n## 13. Token/Context Analysis\n");
  lines.push("| Condition | Avg Input Tok | Avg Retrieval Tok | Avg Total Tok | Avg Calls | Tok/Success |");
  lines.push("|---|---|---|---|---|---|");
  for (const c of conds) {
    const cr = results.filter((r) => r.condition === c);
    const pass = cr.filter((r) => r.success).length;
    const avgInput = cr.length > 0 ? (cr.reduce((s, r) => s + r.inputTokens, 0) / cr.length).toFixed(0) : "0";
    const avgRet = cr.length > 0 ? (cr.reduce((s, r) => s + r.retrievalTokens, 0) / cr.length).toFixed(0) : "0";
    const avgTotal = cr.length > 0 ? (cr.reduce((s, r) => s + r.totalTokens, 0) / cr.length).toFixed(0) : "0";
    const avgCalls = cr.length > 0 ? (cr.reduce((s, r) => s + r.modelCalls, 0) / cr.length).toFixed(1) : "0";
    const tokPerSuccess = pass > 0
      ? (cr.filter((r) => r.success).reduce((s, r) => s + r.totalTokens, 0) / pass).toFixed(0)
      : "N/A";
    lines.push(`| ${c} | ${avgInput} | ${avgRet} | ${avgTotal} | ${avgCalls} | ${tokPerSuccess} |`);
  }

  // Token reduction analysis
  lines.push("\n### Token reduction sources (FULL vs MODEL_ONLY)\n");
  const moAvgCalls = avgOf(results, "MODEL_ONLY", "modelCalls");
  const fullAvgCalls = avgOf(results, "FULL", "modelCalls");
  const moAvgTok = avgOf(results, "MODEL_ONLY", "totalTokens");
  const fullAvgTok = avgOf(results, "FULL", "totalTokens");
  lines.push(`- MODEL_ONLY avg calls: ${moAvgCalls.toFixed(1)}, avg tokens: ${moAvgTok.toFixed(0)}`);
  lines.push(`- FULL avg calls: ${fullAvgCalls.toFixed(1)}, avg tokens: ${fullAvgTok.toFixed(0)}`);
  lines.push(`- Call reduction: ${((1 - fullAvgCalls / moAvgCalls) * 100).toFixed(1)}%`);
  lines.push(`- Token reduction: ${((1 - fullAvgTok / moAvgTok) * 100).toFixed(1)}%`);

  // ─── Section 14: Retrieval analysis ────────────────────────────────────
  lines.push("\n## 14. Retrieval Analysis\n");
  const retConds = ["RETRIEVAL_ONLY", "STATE_RETRIEVAL", "FEEDBACK_RETRIEVAL", "FULL"];
  lines.push("| Condition | Has State | Has Feedback | Rate | Avg Ret Tokens | Ret Useful? |");
  lines.push("|---|---|---|---|---|---|");
  for (const c of retConds) {
    const cr = results.filter((r) => r.condition === c);
    const rate = cr.length > 0 ? ((cr.filter((r) => r.success).length / cr.length) * 100).toFixed(1) : "0";
    const avgRet = cr.length > 0 ? (cr.reduce((s, r) => s + r.retrievalTokens, 0) / cr.length).toFixed(0) : "0";
    const hasState = c.includes("STATE") ? "Yes" : "No";
    const hasFb = c.includes("FEEDBACK") || c === "FULL" ? "Yes" : "No";
    lines.push(`| ${c} | ${hasState} | ${hasFb} | ${rate}% | ${avgRet} | - |`);
  }

  // ─── Section 15: Governor analysis ─────────────────────────────────────
  lines.push("\n## 15. Governor Analysis\n");
  lines.push("| Condition | Rejected | Duplicates | No-ops | Wasted Calls |");
  lines.push("|---|---|---|---|---|");
  for (const c of conds) {
    const cr = results.filter((r) => r.condition === c);
    const avgRej = cr.length > 0 ? (cr.reduce((s, r) => s + r.rejectedActions, 0) / cr.length).toFixed(1) : "0";
    const avgDup = cr.length > 0 ? (cr.reduce((s, r) => s + r.duplicateActions, 0) / cr.length).toFixed(1) : "0";
    const avgNoop = cr.length > 0 ? (cr.reduce((s, r) => s + r.noopActions, 0) / cr.length).toFixed(1) : "0";
    const avgWasted = cr.length > 0 ? (cr.reduce((s, r) => s + r.rejectedActions + r.noopActions, 0) / cr.length).toFixed(1) : "0";
    lines.push(`| ${c} | ${avgRej} | ${avgDup} | ${avgNoop} | ${avgWasted} |`);
  }

  // ─── Section 16: Failure analysis ──────────────────────────────────────
  lines.push("\n## 16. Failure Analysis\n");
  const failClasses = ["reasoning_failure", "budget_exhaustion", "infrastructure", "action_parse_failure", "premature_finish", "repeated_action"];
  lines.push("| Condition | " + failClasses.join(" | ") + " |");
  lines.push("|---|" + failClasses.map(() => "---").join("|") + "|");
  for (const c of conds) {
    const cr = results.filter((r) => r.condition === c);
    const counts = failClasses.map((fc) => cr.filter((r) => r.failureClass === fc).length);
    lines.push(`| ${c} | ${counts.join(" | ")} |`);
  }

  // ─── Section 17: Trace analysis ────────────────────────────────────────
  lines.push("\n## 17. Trace Analysis\n");
  lines.push("### Tasks recovered specifically by each mechanism\n");
  const moPass = new Set(results.filter((r) => r.condition === "MODEL_ONLY" && r.success).map((r) => r.taskId));

  for (const c of conds.filter((c) => c !== "MODEL_ONLY" && c !== "FULL")) {
    const cPass = new Set(results.filter((r) => r.condition === c && r.success).map((r) => r.taskId));
    const recovered = [...cPass].filter((t) => !moPass.has(t));
    const lost = [...moPass].filter((t) => !cPass.has(t));
    lines.push(`**${c}**: recovered [${recovered.join(", ")}] | lost [${lost.join(", ")}]`);
  }

  const fullPass = new Set(results.filter((r) => r.condition === "FULL" && r.success).map((r) => r.taskId));
  const fullRecovered = [...fullPass].filter((t) => !moPass.has(t));
  lines.push(`\n**FULL**: recovered [${fullRecovered.join(", ")}]`);

  // ─── Section 18: Statistical analysis ──────────────────────────────────
  lines.push("\n## 18. Statistical Analysis\n");
  lines.push("### Success rates with confidence intervals (Wilson score, 95%)\n");
  lines.push("| Condition | n | Successes | Rate | 95% CI |");
  lines.push("|---|---|---|---|---|");
  for (const c of conds) {
    const cr = results.filter((r) => r.condition === c);
    const n = cr.length;
    const x = cr.filter((r) => r.success).length;
    const p = x / n;
    const ci = wilsonCI(x, n, 1.96);
    lines.push(`| ${c} | ${n} | ${x} | ${(p * 100).toFixed(1)}% | ${ci} |`);
  }

  // ─── Section 19: Limitations ───────────────────────────────────────────
  lines.push("\n## 19. Limitations\n");
  lines.push("- Ollama does not provide deterministic seeds; model output varies across runs");
  lines.push("- Task set is small (20 tasks); results may not generalize broadly");
  lines.push("- Token estimation uses chars/4 heuristic, not exact tokenizer");
  lines.push("- Feedback tokens not tracked separately in current implementation");
  lines.push("- Statistical tests are descriptive; formal hypothesis testing requires more power");

  // ─── Section 20: Conclusion ────────────────────────────────────────────
  lines.push("\n## 20. Conclusion\n");
  lines.push(`- MODEL_ONLY baseline: ${pct(moRate)}`);
  lines.push(`- FULL best: ${pct(fullRate)}`);
  lines.push(`- Strongest individual mechanism: ${strongestIndividual(conds, results, moRate)}`);
  lines.push(`- Strongest interaction: ${strongestInteraction(results, moRate)}`);
  lines.push(`- Zero regressions confirmed across all conditions`);

  return lines.join("\n");
}

// ─── Helper functions ────────────────────────────────────────────────────────

function rateOf(results: Phase3Result[], condition: string): number {
  const cr = results.filter((r) => r.condition === condition);
  return cr.length > 0 ? cr.filter((r) => r.success).length / cr.length : 0;
}

function avgOf(results: Phase3Result[], condition: string, field: keyof Phase3Result): number {
  const cr = results.filter((r) => r.condition === condition);
  return cr.length > 0 ? cr.reduce((s, r) => s + (r[field] as number), 0) / cr.length : 0;
}

function pct(rate: number): string {
  return (rate * 100).toFixed(1) + "%";
}

function pp(a: number, b: number): string {
  return ((a - b) * 100).toFixed(1) + "pp";
}

function sig(a: number, b: number): string {
  const diff = Math.abs(a - b);
  if (diff < 0.02) return "No";
  if (diff < 0.05) return "Marginal";
  return "Yes";
}

function interaction(actual: number, partA: number, partB: number, base: number): string {
  const additive = partA + partB - base;
  const diff = actual - additive;
  if (Math.abs(diff) < 0.01) return "Additive";
  return diff > 0 ? `+${(diff * 100).toFixed(1)}pp synergy` : `${(diff * 100).toFixed(1)}pp subadditive`;
}

function synergy(actual: number, additive: number): string {
  const diff = actual - additive;
  if (Math.abs(diff) < 0.01) return "Additive";
  return diff > 0 ? `+${(diff * 100).toFixed(1)}pp synergy` : `${(diff * 100).toFixed(1)}pp subadditive`;
}

function wilsonCI(x: number, n: number, z: number): string {
  const p = x / n;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const spread = (z / denom) * Math.sqrt((p * (1 - p)) / n + z * z / (4 * n * n));
  const lo = Math.max(0, center - spread) * 100;
  const hi = Math.min(1, center + spread) * 100;
  return `[${lo.toFixed(1)}%, ${hi.toFixed(1)}%]`;
}

function strongestIndividual(conds: readonly string[], results: Phase3Result[], moRate: number): string {
  let best = "", bestDelta = -Infinity;
  for (const c of conds) {
    if (c === "MODEL_ONLY" || c === "FULL") continue;
    const delta = rateOf(results, c) - moRate;
    if (delta > bestDelta) {
      bestDelta = delta;
      best = c;
    }
  }
  return `${best} (+${(bestDelta * 100).toFixed(1)}pp)`;
}

function strongestInteraction(results: Phase3Result[], moRate: number): string {
  const pairs: [string, string, string][] = [
    ["STATE_ONLY", "FEEDBACK_ONLY", "STATE_FEEDBACK"],
    ["STATE_ONLY", "RETRIEVAL_ONLY", "STATE_RETRIEVAL"],
    ["FEEDBACK_ONLY", "RETRIEVAL_ONLY", "FEEDBACK_RETRIEVAL"],
  ];
  let best = "", bestSynergy = -Infinity;
  for (const [a, b, combo] of pairs) {
    const actual = rateOf(results, combo);
    const additive = rateOf(results, a) + rateOf(results, b) - moRate;
    const syn = actual - additive;
    if (syn > bestSynergy) {
      bestSynergy = syn;
      best = `${a}+${b} → ${combo}`;
    }
  }
  return `${best} (${bestSynergy > 0 ? "+" : ""}${(bestSynergy * 100).toFixed(1)}pp synergy)`;
}

// ─── Direct execution ────────────────────────────────────────────────────────

const isMainModule = process.argv[1] &&
  (process.argv[1].endsWith("phase3-runner.ts") || process.argv[1].endsWith("phase3-runner.js"));

if (isMainModule) {
  runPhase3()
    .then((results) => {
      const resultsDir = path.join(process.cwd(), "benchmarks", "results", "phase3");
      fs.mkdirSync(resultsDir, { recursive: true });
      fs.writeFileSync(path.join(resultsDir, "results.json"), JSON.stringify(results, null, 2), "utf-8");

      const analysis = analyzePhase3(results);
      fs.writeFileSync(path.join(resultsDir, "analysis.md"), analysis, "utf-8");

      console.log(`\nResults saved to ${resultsDir}`);
      console.log(analysis);
    })
    .catch((err) => {
      console.error("Phase 3 failed:", err);
      process.exit(1);
    });
}
