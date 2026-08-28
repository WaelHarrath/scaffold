import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveWithinWorkspace, isInside, toWorkspaceRelative } from "../src/workspace.js";
import { ExecutionError } from "../src/errors.js";

let ws: string;

function createWs(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-ws-"));
  fs.mkdirSync(path.join(dir, "sub"), { recursive: true });
  fs.writeFileSync(path.join(dir, "sub", "a.txt"), "a", "utf-8");
  fs.writeFileSync(path.join(dir, "root.txt"), "r", "utf-8");
  return dir;
}

beforeAll(() => {
  ws = createWs();
});
afterAll(() => {
  try {
    fs.rmSync(ws, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("resolveWithinWorkspace", () => {
  it("resolves a plain relative target inside the workspace", () => {
    const p = resolveWithinWorkspace(ws, "sub/a.txt");
    expect(p).toBe(path.resolve(ws, "sub", "a.txt"));
  });

  it("resolves a nested / dotted relative target", () => {
    const p = resolveWithinWorkspace(ws, "./sub/../root.txt");
    expect(path.relative(ws, p)).toBe("root.txt");
    expect(fs.readFileSync(p, "utf-8")).toBe("r");
  });

  it("rejects a parent-directory traversal (../)", () => {
    expect(() => resolveWithinWorkspace(ws, "../escape.txt")).toThrow(ExecutionError);
    expect(() => resolveWithinWorkspace(ws, "sub/../../escape.txt")).toThrow(ExecutionError);
  });

  it("rejects an absolute path that escapes the workspace", () => {
    expect(() => resolveWithinWorkspace(ws, path.join(ws, "..", "x"))).toThrow(ExecutionError);
  });

  it("rejects an absolute path outside the workspace entirely", () => {
    expect(() => resolveWithinWorkspace(ws, os.tmpdir())).toThrow(ExecutionError);
  });

  it("rejects an empty target", () => {
    expect(() => resolveWithinWorkspace(ws, "")).toThrow(ExecutionError);
  });

  it("rejects absolute target when requireRelative is set", () => {
    expect(() =>
      resolveWithinWorkspace(ws, path.join(ws, "root.txt"), { requireRelative: true }),
    ).toThrow(ExecutionError);
  });

  it("throws on a symlink escaping the workspace", () => {
    const link = path.join(ws, "sub", "evil-link");
    const outside = path.join(os.tmpdir(), "scaffold-outside-" + Date.now());
    fs.mkdirSync(outside, { recursive: true });
    try {
      fs.symlinkSync(outside, link, "junction");
      expect(() => resolveWithinWorkspace(ws, "sub/evil-link/file.txt")).toThrow(ExecutionError);
    } finally {
      try {
        fs.rmSync(outside, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
});

describe("isInside", () => {
  it("returns true for a child of the root", () => {
    expect(isInside(ws, path.join(ws, "sub", "a.txt"))).toBe(true);
  });
  it("returns false for the root itself", () => {
    expect(isInside(ws, ws)).toBe(false);
  });
  it("returns false for a sibling / parent", () => {
    expect(isInside(ws, path.join(ws, "..", "x"))).toBe(false);
  });
});

describe("toWorkspaceRelative", () => {
  it("re-bases an inside path onto the workspace", () => {
    const abs = path.join(ws, "sub", "a.txt");
    expect(toWorkspaceRelative(ws, abs)).toBe(path.join("sub", "a.txt"));
  });
  it("returns the absolute path unchanged when outside the workspace", () => {
    const outside = path.join(os.tmpdir(), "elsewhere.txt");
    expect(toWorkspaceRelative(ws, outside)).toBe(path.resolve(outside));
  });
});
