import * as fs from "node:fs";
import * as path from "node:path";
import type { TaskDefinition } from "./types.js";

function readFileSafe(dir: string, rel: string): string | null {
  try {
    return fs.readFileSync(path.join(dir, rel), "utf-8");
  } catch {
    return null;
  }
}

// ─── state_tracking ───────────────────────────────────────────────────────────

const ST1: TaskDefinition = {
  id: "ST1",
  category: "state_tracking",
  objective:
    "Read config.json and update the version field from '1.0.0' to '2.0.0', then write the result to result.txt",
  difficulty: 1,
  workspace: [
    {
      path: "config.json",
      content: '{\n  "name": "myapp",\n  "version": "1.0.0",\n  "author": "dev"\n}',
    },
  ],
  verify(dir) {
    const config = readFileSafe(dir, "config.json");
    if (config === null) return { success: false, reason: "config.json missing" };
    const result = readFileSafe(dir, "result.txt");
    if (result === null) return { success: false, reason: "result.txt not created" };
    const configObj = JSON.parse(config) as Record<string, unknown>;
    if (configObj["version"] !== "1.0.0")
      return { success: false, reason: "config.json version was modified" };
    if (!result.includes("2.0.0"))
      return { success: false, reason: "result.txt does not contain 2.0.0" };
    return { success: true, reason: "version extracted and config preserved" };
  },
};

const ST2: TaskDefinition = {
  id: "ST2",
  category: "state_tracking",
  objective:
    "Read data.json, extract all item names, and write them as a newline-separated list to names.txt",
  difficulty: 2,
  workspace: [
    {
      path: "data.json",
      content:
        '{\n  "items": [\n    { "name": "alpha", "value": 1 },\n    { "name": "beta", "value": 2 },\n    { "name": "gamma", "value": 3 }\n  ]\n}',
    },
  ],
  verify(dir) {
    const names = readFileSafe(dir, "names.txt");
    if (names === null) return { success: false, reason: "names.txt not created" };
    const has = (w: string) => names.includes(w);
    if (!has("alpha")) return { success: false, reason: "missing alpha" };
    if (!has("beta")) return { success: false, reason: "missing beta" };
    if (!has("gamma")) return { success: false, reason: "missing gamma" };
    const lines = names.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length !== 3)
      return { success: false, reason: `expected 3 lines, got ${lines.length}` };
    return { success: true, reason: "all names extracted" };
  },
};

const ST3: TaskDefinition = {
  id: "ST3",
  category: "state_tracking",
  objective:
    "Read counters.json, increment the 'views' counter by 1, and write the updated file back. Then append a log entry 'views incremented' to audit.log",
  difficulty: 3,
  workspace: [
    {
      path: "counters.json",
      content: '{\n  "views": 42,\n  "likes": 7\n}',
    },
  ],
  verify(dir) {
    const counters = readFileSafe(dir, "counters.json");
    if (counters === null)
      return { success: false, reason: "counters.json missing" };
    const obj = JSON.parse(counters) as Record<string, unknown>;
    if (obj["views"] !== 43)
      return { success: false, reason: `views is ${obj["views"]}, expected 43` };
    if (obj["likes"] !== 7)
      return { success: false, reason: `likes changed to ${obj["likes"]}` };
    const audit = readFileSafe(dir, "audit.log");
    if (audit === null)
      return { success: false, reason: "audit.log not created" };
    if (!audit.includes("views incremented"))
      return { success: false, reason: "audit.log missing increment entry" };
    return { success: true, reason: "counter incremented and logged" };
  },
};

// ─── multi_step_reasoning ─────────────────────────────────────────────────────

const MS1: TaskDefinition = {
  id: "MS1",
  category: "multi_step_reasoning",
  objective:
    "Read src/utils.ts, find the function name and its parameters, then write a summary to summary.txt in the format 'function: NAME(params)'",
  difficulty: 1,
  workspace: [
    {
      path: "src/utils.ts",
      content: "export function calculate(a: number, b: number): number {\n  return a + b;\n}\n",
    },
  ],
  verify(dir) {
    const summary = readFileSafe(dir, "summary.txt");
    if (summary === null) return { success: false, reason: "summary.txt not created" };
    if (!summary.includes("calculate"))
      return { success: false, reason: "missing function name calculate" };
    if (!summary.includes("a") || !summary.includes("b"))
      return { success: false, reason: "missing parameter names" };
    return { success: true, reason: "function signature extracted" };
  },
};

const MS2: TaskDefinition = {
  id: "MS2",
  category: "multi_step_reasoning",
  objective:
    "Read package.json to find the 'main' entry point, check if that file exists, then write a report to report.txt stating the filename and whether it exists",
  difficulty: 2,
  workspace: [
    {
      path: "package.json",
      content: '{\n  "name": "myapp",\n  "main": "index.js"\n}',
    },
    {
      path: "index.js",
      content: "module.exports = {};\n",
    },
  ],
  verify(dir) {
    const report = readFileSafe(dir, "report.txt");
    if (report === null) return { success: false, reason: "report.txt not created" };
    if (!report.includes("index.js"))
      return { success: false, reason: "report does not mention index.js" };
    const lower = report.toLowerCase();
    if (!lower.includes("exists") && !lower.includes("found"))
      return { success: false, reason: "report does not state existence" };
    return { success: true, reason: "entry point verified" };
  },
};

const MS3: TaskDefinition = {
  id: "MS3",
  category: "multi_step_reasoning",
  objective:
    "Search all .ts files for TODO comments, collect them, and write a todo-list.md with one TODO item per line",
  difficulty: 3,
  workspace: [
    { path: "src/a.ts", content: "// TODO: fix login handler\nexport const x = 1;\n" },
    { path: "src/b.ts", content: "// TODO: add logout endpoint\nexport const y = 2;\n" },
    { path: "src/c.ts", content: "export const z = 3;\n" },
  ],
  verify(dir) {
    const list = readFileSafe(dir, "todo-list.md");
    if (list === null) return { success: false, reason: "todo-list.md not created" };
    if (!list.includes("fix login"))
      return { success: false, reason: "missing TODO from a.ts" };
    if (!list.includes("add logout"))
      return { success: false, reason: "missing TODO from b.ts" };
    return { success: true, reason: "all TODOs collected" };
  },
};

// ─── error_recovery ───────────────────────────────────────────────────────────

const ER1: TaskDefinition = {
  id: "ER1",
  category: "error_recovery",
  objective:
    "Try to read missing.txt. When it fails, create fallback.txt with the content 'fallback content'",
  difficulty: 1,
  workspace: [],
  verify(dir) {
    const fb = readFileSafe(dir, "fallback.txt");
    if (fb === null) return { success: false, reason: "fallback.txt not created" };
    if (!fb.includes("fallback content"))
      return { success: false, reason: "fallback.txt has wrong content" };
    return { success: true, reason: "fallback created after missing file" };
  },
};

const ER2: TaskDefinition = {
  id: "ER2",
  category: "error_recovery",
  objective:
    "Run the command 'exit 1'. When it fails, write the error information to error.log",
  difficulty: 2,
  workspace: [
    { path: "script.sh", content: "exit 1\n" },
  ],
  verify(dir) {
    const log = readFileSafe(dir, "error.log");
    if (log === null) return { success: false, reason: "error.log not created" };
    if (log.trim().length === 0)
      return { success: false, reason: "error.log is empty" };
    return { success: true, reason: "error captured in log" };
  },
};

const ER3: TaskDefinition = {
  id: "ER3",
  category: "error_recovery",
  objective:
    "Try to write to nested/deep/file.txt. If the directory does not exist, create the directory structure first, then write 'deep file content' to the file",
  difficulty: 3,
  workspace: [],
  verify(dir) {
    const content = readFileSafe(dir, "nested/deep/file.txt");
    if (content === null)
      return { success: false, reason: "nested/deep/file.txt not created" };
    if (!content.includes("deep file content"))
      return { success: false, reason: "wrong content in deep file" };
    return { success: true, reason: "directory created and file written" };
  },
};

// ─── tool_output_interpretation ───────────────────────────────────────────────

const TO1: TaskDefinition = {
  id: "TO1",
  category: "tool_output_interpretation",
  objective:
    "Run check.sh, parse its JSON output, extract the 'status' field, and write it to status.txt",
  difficulty: 1,
  workspace: [
    { path: "check.sh", content: 'echo \'{"status": "ok", "code": 200}\'\n' },
  ],
  verify(dir) {
    const status = readFileSafe(dir, "status.txt");
    if (status === null) return { success: false, reason: "status.txt not created" };
    if (!status.includes("ok"))
      return { success: false, reason: "status.txt does not contain ok" };
    return { success: true, reason: "status extracted from JSON output" };
  },
};

const TO2: TaskDefinition = {
  id: "TO2",
  category: "tool_output_interpretation",
  objective:
    "List the files in the 'docs' directory, find the only .md file, and write its name to md-file.txt",
  difficulty: 2,
  workspace: [
    { path: "docs/readme.md", content: "# Readme\n" },
    { path: "docs/notes.txt", content: "notes\n" },
    { path: "docs/data.csv", content: "a,b\n" },
  ],
  verify(dir) {
    const md = readFileSafe(dir, "md-file.txt");
    if (md === null) return { success: false, reason: "md-file.txt not created" };
    if (!md.includes("readme.md"))
      return { success: false, reason: "md-file.txt does not contain readme.md" };
    return { success: true, reason: "md file identified" };
  },
};

const TO3: TaskDefinition = {
  id: "TO3",
  category: "tool_output_interpretation",
  objective:
    "Run 'dir files' to list files in the files/ directory, identify the file with the largest size from the output, and write its name to largest.txt",
  difficulty: 3,
  workspace: [
    { path: "files/small.txt", content: "ab" },
    { path: "files/medium.txt", content: "a".repeat(50) },
    { path: "files/large.txt", content: "a".repeat(200) },
  ],
  verify(dir) {
    const largest = readFileSafe(dir, "largest.txt");
    if (largest === null) return { success: false, reason: "largest.txt not created" };
    if (!largest.includes("large.txt"))
      return { success: false, reason: "largest.txt does not contain large.txt" };
    return { success: true, reason: "largest file identified" };
  },
};

// ─── constraint_preservation ──────────────────────────────────────────────────

const CP1: TaskDefinition = {
  id: "CP1",
  category: "constraint_preservation",
  objective:
    "Add a new field 'debug': true to config.json while preserving all existing fields and their values",
  difficulty: 1,
  workspace: [
    {
      path: "config.json",
      content: '{\n  "name": "myapp",\n  "version": "1.0.0"\n}',
    },
  ],
  verify(dir) {
    const raw = readFileSafe(dir, "config.json");
    if (raw === null) return { success: false, reason: "config.json missing" };
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj["name"] !== "myapp")
      return { success: false, reason: "name field lost" };
    if (obj["version"] !== "1.0.0")
      return { success: false, reason: "version field lost" };
    if (obj["debug"] !== true)
      return { success: false, reason: "debug field not added or not true" };
    return { success: true, reason: "field added, existing fields preserved" };
  },
};

const CP2: TaskDefinition = {
  id: "CP2",
  category: "constraint_preservation",
  objective:
    "Add the import statement 'import { helpers } from \"./helpers\";' to the top of app.ts without modifying any existing lines",
  difficulty: 2,
  workspace: [
    {
      path: "app.ts",
      content: "export const x = 1;\nexport const y = 2;\n",
    },
  ],
  verify(dir) {
    const content = readFileSafe(dir, "app.ts");
    if (content === null) return { success: false, reason: "app.ts missing" };
    if (!content.includes('from "./helpers"') && !content.includes("from './helpers'"))
      return { success: false, reason: "import not added" };
    if (!content.includes("export const x = 1"))
      return { success: false, reason: "original line 1 lost" };
    if (!content.includes("export const y = 2"))
      return { success: false, reason: "original line 2 lost" };
    return { success: true, reason: "import added, original lines preserved" };
  },
};

const CP3: TaskDefinition = {
  id: "CP3",
  category: "constraint_preservation",
  objective:
    "Update the timeout value in config.yaml from 30 to 60 while keeping all other settings exactly the same",
  difficulty: 3,
  workspace: [
    {
      path: "config.yaml",
      content: "timeout: 30\nretries: 3\nlogging: true\n",
    },
  ],
  verify(dir) {
    const raw = readFileSafe(dir, "config.yaml");
    if (raw === null) return { success: false, reason: "config.yaml missing" };
    if (!raw.includes("timeout: 60"))
      return { success: false, reason: "timeout not updated to 60" };
    if (!raw.includes("retries: 3"))
      return { success: false, reason: "retries changed" };
    if (!raw.includes("logging: true"))
      return { success: false, reason: "logging changed" };
    const timeoutMatches = raw.match(/timeout:\s*\d+/g);
    if (timeoutMatches && timeoutMatches.length > 1)
      return { success: false, reason: "duplicate timeout entries" };
    return { success: true, reason: "timeout updated, other settings preserved" };
  },
};

// ─── cross_file_reasoning ─────────────────────────────────────────────────────

const CF1: TaskDefinition = {
  id: "CF1",
  category: "cross_file_reasoning",
  objective:
    "Read types.ts to learn the type alias 'Status', then find all variables in main.ts that use the 'Status' type and write their names to typed-vars.txt",
  difficulty: 1,
  workspace: [
    {
      path: "types.ts",
      content: "export type Status = 'active' | 'inactive';\n",
    },
    {
      path: "main.ts",
      content: "const s: Status = 'active';\nconst n = 42;\nconst t: string = 'hello';\n",
    },
  ],
  verify(dir) {
    const vars = readFileSafe(dir, "typed-vars.txt");
    if (vars === null)
      return { success: false, reason: "typed-vars.txt not created" };
    if (!vars.includes("s"))
      return { success: false, reason: "missing variable s" };
    if (vars.includes("n"))
      return { success: false, reason: "n should not be listed (not Status type)" };
    return { success: true, reason: "typed variables identified" };
  },
};

const CF2: TaskDefinition = {
  id: "CF2",
  category: "cross_file_reasoning",
  objective:
    "Read constants.ts to get MAX_RETRIES, read config.json to get base_url, then write a merged.json containing both values as { max_retries: <value>, base_url: <value> }",
  difficulty: 2,
  workspace: [
    {
      path: "constants.ts",
      content: "export const MAX_RETRIES = 3;\n",
    },
    {
      path: "config.json",
      content: '{\n  "base_url": "https://api.example.com"\n}',
    },
  ],
  verify(dir) {
    const merged = readFileSafe(dir, "merged.json");
    if (merged === null)
      return { success: false, reason: "merged.json not created" };
    const obj = JSON.parse(merged) as Record<string, unknown>;
    if (obj["max_retries"] !== 3)
      return { success: false, reason: `max_retries is ${obj["max_retries"]}, expected 3` };
    if (obj["base_url"] !== "https://api.example.com")
      return { success: false, reason: "base_url mismatch" };
    return { success: true, reason: "values merged correctly" };
  },
};

const CF3: TaskDefinition = {
  id: "CF3",
  category: "cross_file_reasoning",
  objective:
    "Read interface.ts to understand the User interface, search all files for code that uses 'User', and write a report to interface-report.txt listing each file that references it",
  difficulty: 3,
  workspace: [
    {
      path: "interface.ts",
      content: "export interface User {\n  name: string;\n  age: number;\n}\n",
    },
    {
      path: "impl/a.ts",
      content: "import { User } from '../interface';\nconst user: User = { name: 'Alice', age: 30 };\n",
    },
    {
      path: "impl/b.ts",
      content: "import { User } from '../interface';\nconst admin: User = { name: 'Bob', age: 25 };\n",
    },
  ],
  verify(dir) {
    const report = readFileSafe(dir, "interface-report.txt");
    if (report === null)
      return { success: false, reason: "interface-report.txt not created" };
    if (!report.includes("a.ts"))
      return { success: false, reason: "missing reference to a.ts" };
    if (!report.includes("b.ts"))
      return { success: false, reason: "missing reference to b.ts" };
    return { success: true, reason: "all implementing files listed" };
  },
};

// ─── action_selection ─────────────────────────────────────────────────────────

const AS1: TaskDefinition = {
  id: "AS1",
  category: "action_selection",
  objective:
    "Find the line containing the string 'API_KEY' in any file under src/ and write the matching line to found.txt",
  difficulty: 1,
  workspace: [
    {
      path: "src/config.ts",
      content: "const API_KEY = 'sk-12345';\nexport default API_KEY;\n",
    },
  ],
  verify(dir, actions) {
    const found = readFileSafe(dir, "found.txt");
    if (found === null) return { success: false, reason: "found.txt not created" };
    const hasSearch = actions.some((a) => a.actionType === "search");
    if (!hasSearch)
      return { success: false, reason: "search action was not used" };
    return { success: true, reason: "search used and result captured" };
  },
};

const AS2: TaskDefinition = {
  id: "AS2",
  category: "action_selection",
  objective:
    "Read the file data.txt and write its exact contents to copy.txt",
  difficulty: 2,
  workspace: [
    { path: "data.txt", content: "line one\nline two\nline three\n" },
  ],
  verify(dir, actions) {
    const copy = readFileSafe(dir, "copy.txt");
    if (copy === null) return { success: false, reason: "copy.txt not created" };
    const orig = readFileSafe(dir, "data.txt");
    if (copy !== orig)
      return { success: false, reason: "copy.txt content does not match data.txt" };
    const hasInspect = actions.some((a) => a.actionType === "inspect");
    if (!hasInspect)
      return { success: false, reason: "inspect action was not used" };
    return { success: true, reason: "file read and copied" };
  },
};

const AS3: TaskDefinition = {
  id: "AS3",
  category: "action_selection",
  objective:
    "Create a new file output.txt containing the text 'task complete' and then signal that the task is finished",
  difficulty: 3,
  workspace: [],
  verify(dir, actions) {
    const content = readFileSafe(dir, "output.txt");
    if (content === null)
      return { success: false, reason: "output.txt not created" };
    if (!content.includes("task complete"))
      return { success: false, reason: "wrong content" };
    const hasEdit = actions.some((a) => a.actionType === "edit");
    const hasFinish = actions.some((a) => a.actionType === "finish");
    if (!hasEdit)
      return { success: false, reason: "edit action was not used to create file" };
    if (!hasFinish)
      return { success: false, reason: "finish action was not signaled" };
    return { success: true, reason: "file created and task finished" };
  },
};

// ─── completion_verification ──────────────────────────────────────────────────

const CV1: TaskDefinition = {
  id: "CV1",
  category: "completion_verification",
  objective:
    "Create a file greeting.txt containing 'Hello, World!' and then signal completion",
  difficulty: 1,
  workspace: [],
  verify(dir) {
    const content = readFileSafe(dir, "greeting.txt");
    if (content === null)
      return { success: false, reason: "greeting.txt not created" };
    if (!content.includes("Hello, World!"))
      return { success: false, reason: "greeting.txt has wrong content" };
    return { success: true, reason: "file created with correct content" };
  },
};

const CV2: TaskDefinition = {
  id: "CV2",
  category: "completion_verification",
  objective:
    "Edit file.txt to replace the text 'old content' with 'new content', then signal completion",
  difficulty: 2,
  workspace: [
    { path: "file.txt", content: "old content\n" },
  ],
  verify(dir) {
    const content = readFileSafe(dir, "file.txt");
    if (content === null) return { success: false, reason: "file.txt missing" };
    if (content.includes("old content"))
      return { success: false, reason: "old content still present" };
    if (!content.includes("new content"))
      return { success: false, reason: "new content not written" };
    return { success: true, reason: "file updated correctly" };
  },
};

const CV3: TaskDefinition = {
  id: "CV3",
  category: "completion_verification",
  objective:
    "Run the command 'echo verified > result.txt' and then signal completion",
  difficulty: 3,
  workspace: [],
  verify(dir) {
    const content = readFileSafe(dir, "result.txt");
    if (content === null) return { success: false, reason: "result.txt not created" };
    if (!content.includes("verified"))
      return { success: false, reason: "result.txt does not contain verified" };
    return { success: true, reason: "command output verified" };
  },
};

// ─── repeated_action_avoidance ────────────────────────────────────────────────

const RA1: TaskDefinition = {
  id: "RA1",
  category: "repeated_action_avoidance",
  objective:
    "Find the file containing the string 'NEEDLE' and write its path to found-path.txt. The file does not exist at the obvious location — if your first attempt fails, try a different approach",
  difficulty: 1,
  workspace: [
    { path: "hidden/data.ts", content: "export const NEEDLE = 42;\n" },
  ],
  verify(dir, actions) {
    const result = readFileSafe(dir, "found-path.txt");
    if (result === null)
      return { success: false, reason: "found-path.txt not created" };
    if (!result.includes("hidden/data.ts") && !result.includes("hidden\\data.ts"))
      return { success: false, reason: "did not identify correct file path" };
    const inspectCount = actions.filter((a) => a.actionType === "inspect").length;
    if (inspectCount > 2)
      return {
        success: false,
        reason: `used inspect ${inspectCount} times — should try search after failure`,
      };
    return { success: true, reason: "found needle without excessive retries" };
  },
};

const RA2: TaskDefinition = {
  id: "RA2",
  category: "repeated_action_avoidance",
  objective:
    "The file protected.txt exists but you cannot read it directly. Find an alternative way to determine its size and write the size (in bytes) to size.txt",
  difficulty: 2,
  workspace: [
    { path: "protected.txt", content: "a".repeat(100) },
  ],
  verify(dir, actions) {
    const size = readFileSafe(dir, "size.txt");
    if (size === null) return { success: false, reason: "size.txt not created" };
    if (!size.includes("100"))
      return { success: false, reason: "size.txt does not contain 100" };
    const searchCount = actions.filter((a) => a.actionType === "search").length;
    const runCount = actions.filter((a) => a.actionType === "run").length;
    if (searchCount + runCount === 0)
      return { success: false, reason: "did not use alternative approach" };
    return { success: true, reason: "alternative method used to get size" };
  },
};

const RA3: TaskDefinition = {
  id: "RA3",
  category: "repeated_action_avoidance",
  objective:
    "Run the command 'nonexistent-cmd'. When it fails, instead of retrying, write a fallback file fallback.txt with 'command unavailable'",
  difficulty: 3,
  workspace: [],
  verify(dir, actions) {
    const fb = readFileSafe(dir, "fallback.txt");
    if (fb === null)
      return { success: false, reason: "fallback.txt not created" };
    if (!fb.includes("command unavailable"))
      return { success: false, reason: "wrong fallback content" };
    const runCount = actions.filter((a) => a.actionType === "run").length;
    if (runCount > 1)
      return {
        success: false,
        reason: `ran commands ${runCount} times — should not retry failed command`,
      };
    return { success: true, reason: "fallback created without retry" };
  },
};

// ─── decomposition ────────────────────────────────────────────────────────────

const DC1: TaskDefinition = {
  id: "DC1",
  category: "decomposition",
  objective:
    "Break this into 3 steps: (1) Create data/a.txt with 'aaa', (2) Create data/b.txt with 'bbb', (3) Create data/summary.txt containing both contents",
  difficulty: 1,
  workspace: [],
  verify(dir) {
    const a = readFileSafe(dir, "data/a.txt");
    const b = readFileSafe(dir, "data/b.txt");
    const s = readFileSafe(dir, "data/summary.txt");
    if (a === null) return { success: false, reason: "data/a.txt not created" };
    if (b === null) return { success: false, reason: "data/b.txt not created" };
    if (s === null)
      return { success: false, reason: "data/summary.txt not created" };
    if (!a.includes("aaa")) return { success: false, reason: "a.txt wrong content" };
    if (!b.includes("bbb")) return { success: false, reason: "b.txt wrong content" };
    if (!s.includes("aaa") || !s.includes("bbb"))
      return { success: false, reason: "summary.txt missing contents" };
    return { success: true, reason: "all three files created correctly" };
  },
};

const DC2: TaskDefinition = {
  id: "DC2",
  category: "decomposition",
  objective:
    "First read schema.json to learn the required fields, then create a data.json that satisfies the schema, then create validation.txt confirming each required field is present",
  difficulty: 2,
  workspace: [
    {
      path: "schema.json",
      content: '{\n  "required_fields": ["id", "name", "email"]\n}',
    },
  ],
  verify(dir) {
    const data = readFileSafe(dir, "data.json");
    const validation = readFileSafe(dir, "validation.txt");
    if (data === null) return { success: false, reason: "data.json not created" };
    if (validation === null)
      return { success: false, reason: "validation.txt not created" };
    const obj = JSON.parse(data) as Record<string, unknown>;
    if (obj["id"] === undefined)
      return { success: false, reason: "data.json missing id" };
    if (obj["name"] === undefined)
      return { success: false, reason: "data.json missing name" };
    if (obj["email"] === undefined)
      return { success: false, reason: "data.json missing email" };
    if (!validation.includes("id") || !validation.includes("name") || !validation.includes("email"))
      return { success: false, reason: "validation.txt incomplete" };
    return { success: true, reason: "schema read, data created, validated" };
  },
};

const DC3: TaskDefinition = {
  id: "DC3",
  category: "decomposition",
  objective:
    "Create three independent files in parallel: log-a.txt with 'aaa', log-b.txt with 'bbb', log-c.txt with 'ccc'. Then create index.txt listing all three filenames",
  difficulty: 3,
  workspace: [],
  verify(dir) {
    const a = readFileSafe(dir, "log-a.txt");
    const b = readFileSafe(dir, "log-b.txt");
    const c = readFileSafe(dir, "log-c.txt");
    const idx = readFileSafe(dir, "index.txt");
    if (a === null) return { success: false, reason: "log-a.txt not created" };
    if (b === null) return { success: false, reason: "log-b.txt not created" };
    if (c === null) return { success: false, reason: "log-c.txt not created" };
    if (idx === null) return { success: false, reason: "index.txt not created" };
    if (!a.includes("aaa")) return { success: false, reason: "log-a.txt wrong content" };
    if (!b.includes("bbb")) return { success: false, reason: "log-b.txt wrong content" };
    if (!c.includes("ccc")) return { success: false, reason: "log-c.txt wrong content" };
    if (!idx.includes("log-a.txt") || !idx.includes("log-b.txt") || !idx.includes("log-c.txt"))
      return { success: false, reason: "index.txt missing filenames" };
    return { success: true, reason: "all files created and indexed" };
  },
};

// ─── export ───────────────────────────────────────────────────────────────────

export const TASKS: readonly TaskDefinition[] = [
  ST1, ST2, ST3,
  MS1, MS2, MS3,
  ER1, ER2, ER3,
  TO1, TO2, TO3,
  CP1, CP2, CP3,
  CF1, CF2, CF3,
  AS1, AS2, AS3,
  CV1, CV2, CV3,
  RA1, RA2, RA3,
  DC1, DC2, DC3,
];
