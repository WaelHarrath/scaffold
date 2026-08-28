# SCAFFOLD — Basic Project Example

This directory is a generic, self-contained integration example for the
**SCAFFOLD** runtime's public API. It is deliberately **domain-agnostic**: it
processes a small set of plain text files in `sample-workspace/`, contains **no
secrets**, and is **not** a benchmark/experiment task. It is a demonstration of
how a host application embeds `createScaffold` and runs a task against a
workspace.

## What it shows

- Constructing a SCAFFOLD runtime with an explicit config (workspace directory,
  retrieval disabled, small action budget).
- Injecting a **stub reasoning model** and a **stub embedding model** so the
  example runs **without Ollama** or any network/model dependency.
- Running a task with `scaffold.run(...)` (the primary alias of `execute`).
- Reading the structured `ScaffoldResult` (success, response, actions, tokens,
  retrieval stats, termination reason).

## Files

| Path                         | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| `package.json`               | Example-local manifest (not published).              |
| `tsconfig.json`              | Minimal TypeScript config for the example.           |
| `sample-workspace/`          | A tiny generic text workspace the task operates on.  |
| `run.ts`                     | The integration entry point (`scaffold.run`).        |

## Running it

From the repository root:

```powershell
npx tsx examples/basic-project/run.ts
```

No environment variables, API keys, or model servers are required. The stub
model "executes" a small fixed action sequence against the sample workspace and
then signals completion.

## Using the real model instead

To run against the actual `qwen3:4b-instruct` model through Ollama, comment out
the `model`/`embeddingModel` overrides in `run.ts` and start Ollama with the
model loaded first. The runtime defaults to `http://localhost:11434` and the
validated settings (context window 4096, temperature 0.1, etc).
