import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createExecutor } from "../src/execution/executor.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "executor-test-"));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("executor", () => {
  describe("executeEdit", () => {
    it("writes raw content to file", async () => {
      const dir = createTempDir();
      try {
        const executor = createExecutor(dir);
        const result = await executor.execute({
          type: "edit",
          target: "test.txt",
          content: "hello world",
        });
        expect(result.success).toBe(true);
        expect(fs.readFileSync(path.join(dir, "test.txt"), "utf-8")).toBe("hello world");
      } finally {
        cleanup(dir);
      }
    });

    it("decodes JSON-stringified content (model wraps in string quotes)", async () => {
      const dir = createTempDir();
      try {
        const executor = createExecutor(dir);
        const jsonEncoded = JSON.stringify('{"name":"myapp","debug":true}');
        const result = await executor.execute({
          type: "edit",
          target: "config.json",
          content: jsonEncoded,
        });
        expect(result.success).toBe(true);
        const written = fs.readFileSync(path.join(dir, "config.json"), "utf-8");
        expect(written).toBe('{"name":"myapp","debug":true}');
        expect(JSON.parse(written)).toEqual({"name":"myapp","debug":true});
      } finally {
        cleanup(dir);
      }
    });

    it("decodes plain string quotes to unquoted content", async () => {
      const dir = createTempDir();
      try {
        const executor = createExecutor(dir);
        const result = await executor.execute({
          type: "edit",
          target: "test.txt",
          content: '"hello"',
        });
        expect(result.success).toBe(true);
        const written = fs.readFileSync(path.join(dir, "test.txt"), "utf-8");
        expect(written).toBe("hello");
      } finally {
        cleanup(dir);
      }
    });

    it("preserves content that starts with quote but is not valid JSON", async () => {
      const dir = createTempDir();
      try {
        const executor = createExecutor(dir);
        const result = await executor.execute({
          type: "edit",
          target: "test.txt",
          content: '"not json at all',
        });
        expect(result.success).toBe(true);
        const written = fs.readFileSync(path.join(dir, "test.txt"), "utf-8");
        expect(written).toBe('"not json at all');
      } finally {
        cleanup(dir);
      }
    });

    it("handles JSON-encoded multiline content", async () => {
      const dir = createTempDir();
      try {
        const executor = createExecutor(dir);
        const multilineJson = JSON.stringify('{\n  "name": "myapp",\n  "version": "1.0.0"\n}');
        const result = await executor.execute({
          type: "edit",
          target: "config.json",
          content: multilineJson,
        });
        expect(result.success).toBe(true);
        const written = fs.readFileSync(path.join(dir, "config.json"), "utf-8");
        expect(written).toBe('{\n  "name": "myapp",\n  "version": "1.0.0"\n}');
        expect(JSON.parse(written)).toEqual({ name: "myapp", version: "1.0.0" });
      } finally {
        cleanup(dir);
      }
    });

    it("unescapes backslash-quotes in content (model emits \\\" instead of \")", async () => {
      const dir = createTempDir();
      try {
        const executor = createExecutor(dir);
        // Model outputs content with literal \" characters
        const result = await executor.execute({
          type: "edit",
          target: "config.json",
          content: '{\\"name\\":\\"myapp\\",\\"debug\\":true}',
        });
        expect(result.success).toBe(true);
        const written = fs.readFileSync(path.join(dir, "config.json"), "utf-8");
        expect(written).toBe('{"name":"myapp","debug":true}');
        expect(JSON.parse(written)).toEqual({ name: "myapp", debug: true });
      } finally {
        cleanup(dir);
      }
    });
  });

  describe("executeInspect", () => {
    it("reads file content", async () => {
      const dir = createTempDir();
      try {
        fs.writeFileSync(path.join(dir, "test.txt"), "content", "utf-8");
        const executor = createExecutor(dir);
        const result = await executor.execute({ type: "inspect", target: "test.txt" });
        expect(result.success).toBe(true);
        expect(result.output).toBe("content");
      } finally {
        cleanup(dir);
      }
    });

    it("returns error for missing file", async () => {
      const dir = createTempDir();
      try {
        const executor = createExecutor(dir);
        const result = await executor.execute({ type: "inspect", target: "missing.txt" });
        expect(result.success).toBe(false);
      } finally {
        cleanup(dir);
      }
    });
  });

  describe("executeFinish", () => {
    it("returns success", async () => {
      const dir = createTempDir();
      try {
        const executor = createExecutor(dir);
        const result = await executor.execute({ type: "finish", target: "done" });
        expect(result.success).toBe(true);
      } finally {
        cleanup(dir);
      }
    });
  });
});
