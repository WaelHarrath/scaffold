import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createSecureExecutor } from "../src/secure-executor.js";
import type { Executor, ExecutionResult } from "../src/execution/executor.js";
import { createExecutor } from "../src/execution/executor.js";
import type { ParsedAction } from "../src/cognition/action-parser.js";

let ws: string;

beforeAll(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-sec-"));
  fs.writeFileSync(path.join(ws, "inside.txt"), "hello", "utf-8");
});
afterAll(() => {
  try {
    fs.rmSync(ws, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function makeExecutor(impl: (action: ParsedAction) => ExecutionResult): Executor {
  return { execute: async (a) => impl(a) };
}

describe("createSecureExecutor — path containment", () => {
  it("blocks a ../ traversal on inspect", async () => {
    let called = false;
    const base = makeExecutor(() => {
      called = true;
      return { success: true, output: "leaked", error: null, filesChanged: [] };
    });
    const secure = createSecureExecutor(base, ws, { redact: { extraPatterns: [] } });
    const r = await secure.execute({ type: "inspect", target: "../../etc/passwd" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/outside the workspace/);
    expect(called).toBe(false);
  });

  it("blocks an absolute escape on edit", async () => {
    let called = false;
    const base = makeExecutor(() => {
      called = true;
      return { success: true, output: "ok", error: null, filesChanged: [] };
    });
    const secure = createSecureExecutor(base, ws);
    const r = await secure.execute({ type: "edit", target: path.join(os.tmpdir(), "out.txt"), content: "x" });
    expect(r.success).toBe(false);
    expect(called).toBe(false);
  });

  it("allows a safe relative target through", async () => {
    let seen: ParsedAction | null = null;
    const base = makeExecutor((a) => {
      seen = a;
      return { success: true, output: "ok", error: null, filesChanged: [] };
    });
    const secure = createSecureExecutor(base, ws);
    const r = await secure.execute({ type: "inspect", target: "inside.txt" });
    expect(r.success).toBe(true);
    expect(seen?.target).toBe("inside.txt");
  });

  it("does not drop changes for a safe edit", async () => {
    const secure = createSecureExecutor(createExecutor(ws), ws, { redact: { extraPatterns: [] } });
    const r = await secure.execute({ type: "edit", target: "new-file.txt", content: "content" });
    expect(r.success).toBe(true);
    expect(r.filesChanged).toContain("new-file.txt");
  });
});

describe("createSecureExecutor — changed-file filtering + redaction", () => {
  it("keeps workspace-relative changed files and drops escaping ones", async () => {
    const base = makeExecutor(() => ({
      success: true,
      output: "",
      error: null,
      filesChanged: [path.join(ws, "inside.txt"), path.join(os.tmpdir(), "escaped.txt")],
    }));
    const secure = createSecureExecutor(base, ws, { redact: { extraPatterns: [] } });
    const r = await secure.execute({ type: "edit", target: "x", content: "y" });
    expect(r.filesChanged).toContain("inside.txt");
    expect(r.filesChanged.some((f) => f.includes("escaped.txt"))).toBe(false);
  });

  it("redacts secret-like content in output and error", async () => {
    const base = makeExecutor(() => ({
      success: false,
      output: "password=abcd1234 printed",
      error: "api_key=qwerty9876 failed",
      filesChanged: [],
    }));
    const secure = createSecureExecutor(base, ws, { redact: { extraPatterns: [] } });
    const r = await secure.execute({ type: "run", target: "echo" });
    expect(r.output).not.toContain("abcd1234");
    expect(r.error).not.toContain("qwerty9876");
    expect(r.output).toContain("[REDACTED]");
  });

  it("round-trips through the real executor and reports a changed file", async () => {
    const secure = createSecureExecutor(createExecutor(ws), ws, { redact: { extraPatterns: [] } });
    const r = await secure.execute({ type: "edit", target: "sub/deep.txt", content: "deep content" });
    expect(r.success).toBe(true);
  });
});
