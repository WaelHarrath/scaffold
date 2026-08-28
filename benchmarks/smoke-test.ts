import { Qwen3Adapter } from "../src/model/qwen3.js";
import { createExecutor } from "../src/execution/executor.js";
import { createGovernorState } from "../src/execution/governor.js";
import { runScaffoldLoop } from "../src/execution/scaffold-loop.js";
import { SYSTEM_PROMPT } from "../src/execution/system-prompt.js";
import { formatMinimalPrompt } from "../src/execution/format-prompt.js";
import { TASKS } from "../src/benchmark/tasks.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

async function smokeTest() {
  const task = TASKS.find((t) => t.id === "CV1")!;
  console.log(`Smoke test: ${task.id} - ${task.objective}`);

  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-smoke-"));
  for (const file of task.workspace) {
    const filePath = path.join(workspaceDir, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, "utf-8");
  }

  try {
    const deps = {
      model: new Qwen3Adapter(4096),
      executor: createExecutor(workspaceDir),
      governor: createGovernorState(),
      systemPrompt: SYSTEM_PROMPT,
      formatPrompt: (state: any, feedback: any) => formatMinimalPrompt(state, feedback),
    };

    const result = await runScaffoldLoop(task.objective, deps, {
      maxActions: 10,
      temperature: 0.1,
      maxTokens: 256,
    });

    const actions = stateToActions(result.state);
    const verification = task.verify(workspaceDir, actions);

    console.log(`Result: ${verification.success ? "PASS" : "FAIL"}`);
    console.log(`Reason: ${verification.reason}`);
    console.log(`Model calls: ${result.modelCalls}`);
    console.log(`Tool calls: ${result.toolCalls}`);
    console.log(`Tokens: ${result.totalTokens}`);
    console.log(`Time: ${(result.executionTime / 1000).toFixed(1)}s`);
    console.log(`Loop reason: ${result.reason}`);
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
}

function stateToActions(state: any) {
  return state.attemptedActions.map((a: string) => {
    const parts = a.split(" ");
    return {
      success: !state.failedActions.includes(a),
      actionType: parts[0] ?? "unknown",
      target: parts.slice(1).join(" ") || undefined,
    };
  });
}

smokeTest().catch(console.error);
