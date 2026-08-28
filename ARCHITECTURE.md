# SCAFFOLD Architecture

> **Research freeze:** This document reflects the frozen implementation. The consolidated, canonical pipeline and mechanism classification are in **[FINAL-ARCHITECTURE.md](./FINAL-ARCHITECTURE.md)**. Measured evidence and limitations are in **[FINAL-EVIDENCE.md](./benchmarks/FINAL-EVIDENCE.md)**, **[LIMITATIONS.md](./LIMITATIONS.md)**, and **[REPRODUCIBILITY.md](./REPRODUCIBILITY.md)**.

## System Overview

```
┌─────────────────────────────────────────────────────┐
│                  SCAFFOLD Runtime                     │
│                                                       │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐ │
│  │  Qwen3   │   │  MiniLM  │   │  Action Governor  │ │
│  │ (reason) │   │ (embed)  │   │  (guard rails)    │ │
│  └────┬─────┘   └────┬─────┘   └────────┬─────────┘ │
│       │              │                   │            │
│  ┌────▼──────────────▼───────────────────▼─────────┐ │
│  │              Scaffold Loop                       │ │
│  │  parse → govern → execute → feedback → state     │ │
│  └────────────────────┬────────────────────────────┘ │
│                       │                              │
│  ┌────────────────────▼────────────────────────────┐ │
│  │           Context Selector                       │ │
│  │  budget → candidates → select → prompt           │ │
│  └────────────────────┬────────────────────────────┘ │
│                       │                              │
│  ┌────────────────────▼────────────────────────────┐ │
│  │           Semantic Retriever                      │ │
│  │  query → embed → rank → top-K                    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │            Task State                            │ │
│  │  task, goal, files, progress, history            │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Model Roles

### Qwen3:4b-instruct (Reasoning Only)

- **Interface:** `ReasoningModel`
- **Adapter:** `Qwen3Adapter`
- **Endpoint:** Ollama local API (`http://localhost:11434/api/chat`)
- **Context size:** 4096 tokens (hardcoded)
- **Role:** Receives a system prompt + structured user prompt, returns a single action string. The model does not execute anything — it only selects the next action.
- **Parameters:** temperature (default 0.1), num_ctx (4096). The `runScaffoldLoop` default `maxTokens` is 512, but **every benchmark phase invoked the loop with `maxTokens: 256`**, which matches the 256-token reserved-output budget. 256 is the measured operating value.

### all-MiniLM (Embedding Only)

- **Interface:** `EmbeddingModel`
- **Adapter:** `MiniLMAdapter`
- **Endpoint:** Ollama local API (`http://localhost:11434/api/embed`)
- **Role:** Produces 384-dimensional embeddings for semantic similarity ranking. Used exclusively by the retrieval pipeline. Never interacts with the reasoning model.

**Key design decision:** The two models have zero overlap in function. Qwen3 reasons. MiniLM embeds. SCAFFOLD orchestrates.

## 4096-Token Context Budget

The system operates under a hard 4096-token context window:

- **Total budget:** 4096 tokens
- **Reserved for output:** 256 tokens (default)
- **Available for input:** 3840 tokens
- **Token estimation:** `ceil(text.length / 4)` (character-based heuristic)

The context selector allocates this budget across categories using priority-based selection. See "Context Selection Algorithm" below.

## Execution Loop Flow

The main loop (`runScaffoldLoop`) executes up to `maxActions` (default 20) iterations:

```
for each step:
  0. retrieve(state, observation) -> retrieved content (semantic top-K, budgeted admission)
  1. formatPrompt(state, feedback, retrieved)  -> build user prompt (formatter-driven)
  2. model.generate(system, prompt)    -> get raw model output
  3. parseAction(output)               -> extract structured action
  4. if action is "finish" → return success
  5. govern(governor, action, hasPriorObservation)   -> check if allowed
  6. if rejected → format rejection feedback, continue
  7. executor.execute(action)          -> perform file/command operation
  8. recordExecution(governor, ...)    -> update governor state
  9. formatFeedback(result)            -> truncate and format result
 10. updateState(state, action, ...)   -> update task state
```

> Note: In the benchmark wiring, `govern`'s third argument is `lastObservation !== null` (i.e., "was there a prior successful observation"), used as a coarse clean-slate heuristic for the noop/failed-replay guards. It is not a literal per-action changed-file flag.

### Loop Configuration

| Parameter | Default | Description |
|---|---|---|
| `maxActions` | 20 | Maximum iterations before forced stop |
| `temperature` | 0.1 | Model temperature |
| `maxTokens` | 512 (code default); **256 in all benchmark runs** | Max output tokens per model call |

### Loop Result

The loop returns a `LoopResult` containing:
- Final `TaskState`
- `success` boolean
- `reason` string
- Metrics: `modelCalls`, `toolCalls`, `rejectedActions`, `duplicateActions`, `noopActions`, `totalTokens`, `executionTime`

## Context Selection Algorithm

The context selector (`selectContext`) fits relevant information into the token budget:

### Categories and Priorities

| Category | Priority | Required? | Description |
|---|---|---|---|
| `task` | 100 | Yes | The original task description |
| `goal` | 90 | Yes | Current sub-goal (if different from task) |
| `error` | 85 | No | Error messages from recent operations |
| `observation` | 80 | No | Output from last successful action |
| `state` | 70 | No | Current file, last action, progress, file list |
| `constraint` | 60 | No | System constraints (defined bucket; `buildCandidates` currently emits no constraint candidates — inactive) |
| `retrieved` | 50 + score×10 | No | Semantically retrieved content |
| `history` | 30 | No | Prior action history |

### Selection Process

1. Separate candidates into required (`task`, `goal`) and optional
2. Always include required categories; their tokens are added to the running counter
3. Sort optional candidates by priority (descending)
4. Add each optional candidate if it fits within the remaining budget
5. Record dropped candidates by ID

## Semantic Retrieval Pipeline

```
query string
    │
    ▼
┌─────────────┐
│ MiniLM.embed │  → query embedding (384-d)
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ Retriever.retrieve │
│  - embed each item │
│  - check cache     │
│  - rank by cosine  │
│  - return top-K    │
└──────┬───────────┘
       │
       ▼
┌──────────────┐
│ top-K results │  → { id, score }[]
└──────────────┘
```

### Similarity

- Cosine similarity computed in pure TypeScript (no native dependencies)
- Ranking sorts by score descending, takes top-K

## Embedding Cache

The `EmbeddingCache` class provides an in-memory LRU cache for embeddings:

| Property | Value |
|---|---|
| Default max size | 1000 entries (class default); benchmark runs use `new EmbeddingCache(500)` |
| Key format | `{modelId}:{sha256(content)}` |
| Eviction | Least-recently-used |
| Operations | `get`, `set`, `has`, `invalidate`, `clear` |

The cache avoids redundant embedding calls for repeated or unchanged content. The cache is per-model — different models maintain separate entries.

## State Representation

The `TaskState` tracks the full execution state:

```typescript
interface TaskState {
  task: string;               // Original task description
  currentGoal: string;        // Current sub-goal
  currentFile: string | null; // Most recently accessed file
  lastAction: string;         // Serialized last action
  lastResult: string;         // Output from last action (truncated)
  progress: "YES" | "NO" | "UNKNOWN";
  relevantFiles: string[];    // All files touched during execution
  failedActions: string[];    // Actions that failed
  attemptedActions: string[]; // All attempted action keys
  completionStatus: "in_progress" | "completed" | "failed" | "stuck";
}
```

State is immutable-by-convention — `cloneState` creates a shallow copy with cloned arrays.

### State Transitions

- **Any action with success:** `progress = "YES"` (inspect/search/edit/run, not edit only)
- **Any action with failure:** `progress = "NO"`
- **changed files:** appended to `relevantFiles` (deduped); `currentFile` set to first changed file
- **finish with success:** `completionStatus = completed`
- **failed action:** appended to `failedActions`

## Action Governor Rules

The governor prevents wasteful or harmful execution:

| Rule | Condition | Result |
|---|---|---|
| **Duplicate prevention** | Same action as previous step | Rejected |
| **Noop limit** | 3+ identical inspect/search/run with no workspace change | Rejected |
| **Failed replay** | Re-executing a previously failed action with unchanged workspace | Rejected |
| **Finish always allowed** | Any finish action | Allowed |

The governor maintains:
- `executedActions`: full history of executed action serializations
- `failedActions`: actions that returned failure
- `noopCount`: per-action-key count of no-change executions

## Action Space

Five action types are supported:

| Action | Target | Content | Description |
|---|---|---|---|
| `inspect` | file path | — | Read file contents |
| `search` | pattern | — | Search for pattern in workspace files |
| `edit` | file path | file content | Write content to file (creates dirs) |
| `run` | shell command | — | Execute shell command with timeout |
| `finish` | summary | — | Signal task completion |

### Action Parsing

Two formats are accepted:

1. **Structured:** `ACTION: <type> TARGET: <target> CONTENT: <content>`
2. **Bare:** `<type> <target>` (single whitespace split)

## Feedback Format

Feedback returned to the model after each action:

```
RESULT: SUCCESS or FAILURE
PROGRESS: YES or NO
CHANGED: file1, file2
OUTPUT: (truncated to 200 chars)
ERROR: (truncated to 200 chars)
```

For governor rejections:

```
REJECTED: <reason>
```

Total feedback is truncated to 400 characters maximum.

## File/Module Map

```
src/
├── model/
│   ├── types.ts              # ModelRequest, ModelResponse, ReasoningModel, EmbeddingModel
│   ├── qwen3.ts              # Qwen3Adapter (Ollama chat API)
│   └── embedding.ts          # MiniLMAdapter (Ollama embed API)
├── cognition/
│   ├── action-parser.ts      # parseAction — structured + bare format parsing
│   └── action-space.ts       # VALID_ACTIONS, isValidAction
├── state/
│   ├── state.ts              # TaskState, createInitialState, cloneState
│   └── state-manager.ts      # updateStateOnAction, addFailedAction, isStuck
├── context/
│   ├── context-budget.ts     # ContextBudget, createBudget, estimateTokens, remainingBudget
│   └── context-selector.ts   # ContextCandidate, selectContext, buildCandidates
├── feedback/
│   └── feedback.ts           # FeedbackResult, formatFeedback, estimateFeedbackTokens
├── execution/
│   ├── system-prompt.ts        # frozen SYSTEM_PROMPT (fixed action grammar)
│   ├── format-prompt.ts        # condition formatters (MODEL_ONLY/MINIMAL/RETRIEVAL/FULL + ablations)
│   ├── format-compress.ts      # STATE/FEEDBACK compression levels; retrieval admission budgets
│   ├── governor.ts             # GovernorState, govern, recordExecution
│   ├── executor.ts             # Executor, createExecutor (inspect/search/edit/run/finish)
│   └── scaffold-loop.ts        # runScaffoldLoop — main orchestration loop
├── retrieval/
│   ├── similarity.ts           # cosineSimilarity, rankBySimilarity
│   ├── embedding-cache.ts      # EmbeddingCache (LRU, SHA-256 keyed)
│   ├── retriever.ts            # SemanticRetriever — query → embed → rank
│   └── adaptive-budget.ts      # adaptive admission (Phase 8; NOT SUPPORTED, retained)
└── benchmark/
    ├── types.ts                # TaskDefinition, TaskResult, WorkspaceFile
    ├── runner.ts               # runBenchmark — condition matrix runner with checkpointing
    └── tasks.ts                # 30 task definitions (10 easy/10 medium/10 hard, 10 categories)
```
