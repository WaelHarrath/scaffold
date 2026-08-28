import { describe, it, expect } from "vitest";
import { parseAction } from "../src/cognition/action-parser.js";

describe("parseAction", () => {
  describe("structured format", () => {
    it("parses ACTION: inspect TARGET: src/auth.ts", () => {
      const result = parseAction("ACTION: inspect TARGET: src/auth.ts");
      expect(result).toEqual({ type: "inspect", target: "src/auth.ts", content: undefined });
    });

    it("parses structured with CONTENT", () => {
      const result = parseAction("ACTION: edit TARGET: src/auth.ts CONTENT: new code here");
      expect(result).toEqual({ type: "edit", target: "src/auth.ts", content: "new code here" });
    });

    it("returns null for structured with ACTION but no trailing content", () => {
      const result = parseAction("ACTION: finish");
      expect(result).toBeNull();
    });

    it("parses case-insensitive structured format", () => {
      const result = parseAction("ACTION: Inspect TARGET: file.ts");
      expect(result).toEqual({ type: "inspect", target: "file.ts", content: undefined });
    });

    it("handles extra whitespace in structured format", () => {
      const result = parseAction("ACTION:   edit   TARGET:   src/f.ts   CONTENT:   hello   ");
      expect(result).toEqual({ type: "edit", target: "src/f.ts", content: "hello" });
    });
  });

  describe("bare format", () => {
    it("parses bare 'inspect src/auth.ts'", () => {
      const result = parseAction("inspect src/auth.ts");
      expect(result).toEqual({ type: "inspect", target: "src/auth.ts" });
    });

    it("parses bare 'search query here'", () => {
      const result = parseAction("search query here");
      expect(result).toEqual({ type: "search", target: "query here" });
    });

    it("parses bare 'run npm test'", () => {
      const result = parseAction("run npm test");
      expect(result).toEqual({ type: "run", target: "npm test" });
    });

    it("parses bare 'edit src/file.ts with extra words'", () => {
      const result = parseAction("edit src/file.ts with extra words");
      expect(result).toEqual({ type: "edit", target: "src/file.ts with extra words" });
    });
  });

  describe("single keyword", () => {
    it("parses bare 'finish'", () => {
      const result = parseAction("finish");
      expect(result).toEqual({ type: "finish" });
    });

    it("parses 'finish done' with target", () => {
      const result = parseAction("finish done");
      expect(result).toEqual({ type: "finish", target: "done" });
    });

    it("parses single keyword 'inspect' with no target", () => {
      const result = parseAction("inspect");
      expect(result).toEqual({ type: "inspect" });
    });
  });

  describe("edge cases", () => {
    it("returns null for empty string", () => {
      expect(parseAction("")).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      expect(parseAction("   ")).toBeNull();
    });

    it("returns null for null-like empty", () => {
      expect(parseAction("")).toBeNull();
    });

    it("returns null for unrecognized action", () => {
      expect(parseAction("deploy staging")).toBeNull();
    });

    it("returns null for gibberish", () => {
      expect(parseAction("???###")).toBeNull();
    });

    it("trims whitespace from input", () => {
      const result = parseAction("  finish  ");
      expect(result).toEqual({ type: "finish" });
    });

    it("handles structured format with unrecognised action type", () => {
      const result = parseAction("ACTION: deploy TARGET: server");
      expect(result).toBeNull();
    });
  });
});
