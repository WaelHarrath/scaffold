<p align="center">
  <img src="assets/logo-scaffold.png" alt="SCAFFOLD" width="480">
</p>

# SCAFFOLD

**A lightweight execution and context-management runtime for small reasoning models.**

SCAFFOLD is a deterministic layer that sits between a reasoning model and a workspace. It makes small reasoning models more reliable for structured tasks by managing state, feedback, retrieval, action governance, and execution around the model — **without modifying model weights**.

> **What SCAFFOLD is not:** it does not change the model, does not increase intrinsic model reasoning capability, and does not claim universal or generic improvement across all small models. It is an experimental runtime whose configuration was validated on a specific model and task suite (see [Research](#research-findings) and [Limitations](#limitations)).

---

## How It Works

A single task is processed through a fixed pipeline. The reasoning model selects the next action; everything else — memory, retrieval, budget, governance, and execution — is deterministic runtime infrastructure:

```text
TASK
  ↓
STATE
  ↓
RETRIEVAL
  ↓
CONTEXT BUDGET
  ↓
REASONING MODEL
  ↓
ACTION
  ↓
GOVERNOR
  ↓
EXECUTOR
  ↓
FEEDBACK
  ↓
STATE UPDATE
  ↓
NEXT DECISION
```

The model only ever produces an action string. It never executes code or reads files directly — SCAFFOLD does that under deterministic control.

## Mechanisms

| Mechanism | Role |
|---|---|
| **Model adapter** | Thin adapter over a local reasoning model (`qwen3:4b-instruct` via Ollama) that returns a single action string. Swappable `ReasoningModel` boundary. |
| **Embedding / retrieval adapter** | Semantic embedding (`all-minilm:latest` via Ollama) used for content selection. Swappable `EmbeddingModel` boundary. |
| **State management** | Execution memory (task, goals, files, progress, history) formatted deterministically into context. |
| **Semantic retrieval** | Embed → cosine rank → top-K admission, under a token budget. |
| **Structured feedback** | Deterministic formatting of execution/governor results fed back to the model each step. |
| **Action governor** | Deterministic guard-rails (duplicate-action, noop-limit, failed-replay prevention). |
| **Deterministic executor** | Fixed file/command action execution, wrapped in a workspace-containment boundary. |
| **Workspace containment** | Path-containment (`../`, absolute-escape, symlink-escape) for action targets, so the model stays inside the workspace. |
| **Secret redaction** | Redacts secret-like values from tool output/errors before they reach context, feedback, or logs. |

## Runtime Capability vs. Research Evidence vs. Limitations

- **Runtime capability** — what the library provides today (the mechanisms above, the public API, config validation, structured errors, cancellation/timeout, security guards).
- **Research evidence** — the measured results on `qwen3:4b-instruct` and the SCAFFOLD task suite, documented in [Research](#research-findings) and consolidated in [`RESEARCH.md`](./RESEARCH.md). Evidence is **model-specific**, not a universal benchmark.
- **Known limitations** — the boundaries of the claims, in [`LIMITATIONS.md`](./LIMITATIONS.md).

---

## Tested Configuration

The runtime ships with validated defaults, measured only with these models:

| Role | Model |
|---|---|
| Reasoning | `qwen3:4b-instruct` |
| Retrieval / embedding | `all-minilm:latest` |

- **Context window:** 4096 tokens (3840 input / 256 reserved output)
- **Output tokens per call:** 256
- **Temperature:** 0.1
- **Max actions per task:** 20
- **Default retrieval budget:** `RETRIEVAL_75`

The adapter is pluggable, but only the configuration above has been validated;
no other model is claimed to be supported.

---

## Installation

Requires **Node.js 18+** and an **Ollama** server with the two models above for a
live run (`qwen3:4b-instruct`, `all-minilm:latest`).

```bash
npm install
npm run build
```

You can also consume the public API from `src/index.ts` in a TypeScript build.

## Quick Start

Point SCAFFOLD at a workspace and give it a task:

```bash
npx tsx examples/basic.ts
```

For a fully self-contained example that runs **without Ollama** (stub
reasoning/embedding models and no network calls):

```bash
npx tsx examples/basic-project/run.ts
```

## Basic Example

```ts
import { createScaffold } from "./src/index.js";

const scaffold = createScaffold({
  config: {
    model: "qwen3:4b-instruct",
    contextWindow: 4096,
    maxActions: 20,
  },
});

const result = await scaffold.run("Summarize the README.md in this workspace.");

console.log(result.success);
console.log(result.response);
```

## API

The public surface is the single entry point `src/index.ts`:

- `createScaffold({ config?, model?, embeddingModel?, logger? })` → `Scaffold`
  - `scaffold.run(task, options?)` / `scaffold.execute(task, options?)` — run a task
  - `scaffold.registerTool(tool)` / `registerTools(tools)` — host-supplied tools
  - `scaffold.config` — the resolved configuration
- `createScaffold` options are typed as `CreateScaffoldOptions`; the result is
  `ScaffoldResult`, with fields such as `success`, `response`, `actions`,
  `modelCalls`, `toolCalls`, `tokenEstimates`, `terminationReason`,
  `executionId`, and `durationMs`.
- `ScaffoldConfig` / `ResolvedScaffoldConfig` / `DEFAULT_CONFIG` — configuration
  and validated defaults.
- `ScaffoldTool` / `ToolRegistry` — host-supplied, domain-agnostic tools,
  dispatched through the model's generic `run` action.
- Error hierarchy: `ScaffoldError`, `ConfigurationError`, `ModelError`,
  `ToolError`, `ExecutionError`, `TimeoutError`, `CancelledError`,
  `ValidationError`, `RuntimeError`, with stable codes and a redacted
  `toSafeString()`.
- Security utilities:
  - `resolveWithinWorkspace(...)` / `isInside(...)` / `toWorkspaceRelative(...)`
    (`src/workspace.ts`) — workspace path containment.
  - `createSecureExecutor(base, workspaceDir, options)` (`src/secure-executor.ts`)
    — security wrapper: target containment, workspace-relative `filesChanged`
    re-basing, and output/error redaction.
  - `redactText(...)` / `redactWithFlag(...)` (`src/redact.ts`) — secret redaction.
- Model provider boundary types (`ReasoningModel`, `EmbeddingModel`,
  `ModelRequest`, `ModelResponse`, `TokenUsage`) for custom providers, plus
  `Qwen3Adapter` and `MiniLMAdapter`.

## Configuration

Key `config` options (validated, with defaults in parentheses):

| Option | Default | Description |
|---|---|---|
| `model` | `qwen3:4b-instruct` | Reasoning model id |
| `embeddingModel` | `all-minilm:latest` | Embedding model id |
| `contextWindow` | `4096` | Total context window (tokens) |
| `reservedOutputTokens` | `256` | Tokens reserved for model output |
| `temperature` | `0.1` | Sampling temperature |
| `maxOutputTokens` | `256` | Max output tokens per model call |
| `maxActions` | `20` | Max action steps per execution |
| `ollamaEndpoint` | `http://localhost:11434` | Ollama HTTP endpoint |
| `retrievalEnabled` | `true` | Enable semantic retrieval |
| `retrievalTopK` | `3` | Retrieval top-K |
| `retrievalBudget` | `RETRIEVAL_75` | Retrieval admission budget |
| `stateEnabled` | `true` | Enable state formatting |
| `feedbackEnabled` | `true` | Enable feedback formatting |
| `governorEnabled` | `true` | Enable the action governor |
| `executionTimeoutMs` | `120000` | Hard per-execution timeout (0 = none) |
| `workingDirectory` | `process.cwd()` | Working dir for the default executor |
| `workspaceContainment` | `true` | Enforce workspace path containment |
| `redactSecrets` | `true` | Redact secret-like tool output/errors |

Configuration is validated at creation time (`validateScaffoldConfig`), and the
runtime resolves/validated defaults via `resolveConfig`.

## Security

SCAFFOLD includes a layered security posture on the public runtime path:

- **Workspace containment** — action targets are resolved and confined to the
  workspace; `../`, absolute-escape, and symlink-escape are rejected.
- **Secret redaction** — secret-like values (API keys, tokens, passwords,
  private-key headers) are redacted from tool output and errors before they
  reach the model context, feedback, or logs.
- **Structured, safe errors** — errors expose stable codes and redacted text, not
  raw credentials.
- **No secrets in the repository** — the repo contains no `.env`, credentials,
  private keys, or API keys. Secret-like strings that appear in source are
  redaction-pattern definitions or runtime-assembled non-credential test
  placeholders.

If you publish or deploy SCAFFOLD, keep `workspaceContainment` and
`redactSecrets` enabled and do not ship your own credentials.

## Testing

```bash
npm test            # vitest run (18 files / 261 tests)
npm run test:watch
npm run test:coverage
npm run typecheck
npm run build
```

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the detailed reference
implementation, pipeline, and mechanism classification. Research findings are
in [`RESEARCH.md`](./RESEARCH.md).

## Research Findings

The research is summarized conservatively in [`RESEARCH.md`](./RESEARCH.md).
In short, experiments with `qwen3:4b-instruct` on the SCAFFOLD task suite found
substantial improvements in **effective task reliability** when deterministic
state, feedback, retrieval, and execution management were used (for example,
task completion rising from a ~10% raw-model baseline to the ~46–50% range).

The research does **not** establish:

- increased intrinsic model reasoning capability
- universal improvement across small language models
- generalization to arbitrary models
- that SCAFFOLD makes a 4B model equivalent to a larger model

## Limitations

See [`LIMITATIONS.md`](./LIMITATIONS.md). In short: results are **single-model,
single-hardware, single-benchmark**; small deltas are within stochastic noise;
and no universal-improvement or general-small-model claim is made.

## Reproducibility

See [`REPRODUCIBILITY.md`](./REPRODUCIBILITY.md) for the validated environment,
configuration, and the boundaries on reproducing the measured results.

## Contributing

Contributions and bug reports are welcome. Please:

1. Open an issue describing the change before opening a pull request.
2. Ensure `npm test`, `npm run typecheck`, and `npm run build` pass.
3. The runtime's validated configuration and stable implementation modules are
   intentionally conservative; changes there should be justified against the
   research evidence in [`RESEARCH.md`](./RESEARCH.md).

## License

MIT — see the [LICENSE](./LICENSE) file. Copyright (c) 2026 Wael Harrath.
