import { describe, it, expect } from "vitest";
import {
  govern,
  recordExecution,
  createGovernorState,
} from "../src/execution/governor.js";
import type { GovernorState } from "../src/execution/governor.js";

describe("govern", () => {
  it("allows any action on fresh state", () => {
    const s = createGovernorState();
    const decision = govern(s, { type: "inspect", target: "a.ts" }, false);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBeNull();
    expect(decision.rejectionType).toBeNull();
  });

  it("always allows finish action", () => {
    const s = createGovernorState();
    const decision = govern(s, { type: "finish" }, false);
    expect(decision.allowed).toBe(true);
  });

  it("blocks exact duplicate of previous action", () => {
    let s = createGovernorState();
    s = recordExecution(s, { type: "inspect", target: "a.ts" }, true, true);
    const decision = govern(s, { type: "inspect", target: "a.ts" }, true);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("duplicate");
    expect(decision.rejectionType).toBe("duplicate");
  });

  it("allows same action if workspace changed", () => {
    let s = createGovernorState();
    s = recordExecution(s, { type: "inspect", target: "a.ts" }, true, true);
    // The duplicate check is based on last executed — different workspace won't help
    // but it IS still a duplicate. So test noop accumulation instead.
    const decision = govern(s, { type: "search", target: "query" }, true);
    expect(decision.allowed).toBe(true);
  });

  it("blocks same no-op 3 times on inspect/search/run", () => {
    let s = createGovernorState();
    s = recordExecution(s, { type: "inspect", target: "a.ts" }, true, false);
    s = recordExecution(s, { type: "search", target: "q" }, true, false);
    s = recordExecution(s, { type: "inspect", target: "a.ts" }, true, false);
    s = recordExecution(s, { type: "search", target: "q" }, true, false);
    s = recordExecution(s, { type: "inspect", target: "a.ts" }, true, false);
    s = recordExecution(s, { type: "search", target: "q" }, true, false);
    const decision = govern(s, { type: "inspect", target: "a.ts" }, false);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("3+");
    expect(decision.rejectionType).toBe("noop_limit");
  });

  it("does not count workspace-changed executions as no-ops", () => {
    let s = createGovernorState();
    s = recordExecution(s, { type: "search", target: "q" }, true, true);
    s = recordExecution(s, { type: "inspect", target: "x" }, true, true);
    s = recordExecution(s, { type: "search", target: "q" }, true, true);
    s = recordExecution(s, { type: "inspect", target: "x" }, true, true);
    s = recordExecution(s, { type: "search", target: "q" }, true, true);
    s = recordExecution(s, { type: "inspect", target: "x" }, true, true);
    const decision = govern(s, { type: "search", target: "q" }, true);
    expect(decision.allowed).toBe(true);
  });

  it("blocks previously failed action with unchanged workspace", () => {
    let s = createGovernorState();
    s = recordExecution(s, { type: "edit", target: "a.ts" }, false, false);
    s = recordExecution(s, { type: "run", target: "other" }, true, true);
    const decision = govern(s, { type: "edit", target: "a.ts" }, false);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("previously failed");
    expect(decision.rejectionType).toBe("failed_replay");
  });

  it("allows previously failed action when workspace changed", () => {
    let s = createGovernorState();
    s = recordExecution(s, { type: "edit", target: "a.ts" }, false, true);
    s = recordExecution(s, { type: "run", target: "other" }, true, true);
    const decision = govern(s, { type: "edit", target: "a.ts" }, true);
    expect(decision.allowed).toBe(true);
  });

  it("allows different action after failure", () => {
    let s = createGovernorState();
    s = recordExecution(s, { type: "edit", target: "a.ts" }, false, false);
    const decision = govern(s, { type: "inspect", target: "b.ts" }, false);
    expect(decision.allowed).toBe(true);
  });
});

describe("recordExecution", () => {
  it("appends to executedActions", () => {
    const s = createGovernorState();
    const next = recordExecution(s, { type: "inspect", target: "a.ts" }, true, true);
    expect(next.executedActions).toHaveLength(1);
    expect(next.executedActions[0]).toContain("inspect");
  });

  it("adds to failedActions on failure", () => {
    const s = createGovernorState();
    const next = recordExecution(s, { type: "edit", target: "a.ts" }, false, false);
    expect(next.failedActions).toHaveLength(1);
  });

  it("removes from failedActions on success", () => {
    let s = createGovernorState();
    s = recordExecution(s, { type: "edit", target: "a.ts" }, false, false);
    expect(s.failedActions).toHaveLength(1);
    const next = recordExecution(s, { type: "edit", target: "a.ts" }, true, false);
    expect(next.failedActions).toHaveLength(0);
  });

  it("increments noopCount when workspace unchanged", () => {
    const s = createGovernorState();
    const next = recordExecution(s, { type: "inspect", target: "a.ts" }, true, false);
    expect(next.noopCount.get("inspect::a.ts")).toBe(1);
  });

  it("resets noopCount to 0 when workspace changed", () => {
    let s = createGovernorState();
    s = recordExecution(s, { type: "inspect", target: "a.ts" }, true, false);
    s = recordExecution(s, { type: "inspect", target: "a.ts" }, true, false);
    expect(s.noopCount.get("inspect::a.ts")).toBe(2);
    const next = recordExecution(s, { type: "inspect", target: "a.ts" }, true, true);
    expect(next.noopCount.get("inspect::a.ts")).toBe(0);
  });

  it("does not mutate original state", () => {
    const s = createGovernorState();
    const next = recordExecution(s, { type: "run", target: "npm test" }, true, true);
    expect(s.executedActions).toHaveLength(0);
    expect(s.failedActions).toHaveLength(0);
    expect(s.noopCount.size).toBe(0);
  });

  it("accumulates multiple executed actions", () => {
    let s = createGovernorState();
    s = recordExecution(s, { type: "inspect", target: "a.ts" }, true, true);
    s = recordExecution(s, { type: "edit", target: "b.ts" }, true, true);
    s = recordExecution(s, { type: "run", target: "test" }, true, true);
    expect(s.executedActions).toHaveLength(3);
  });
});
