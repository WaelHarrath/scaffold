import { describe, it, expect } from "vitest";
import { createInitialState, cloneState } from "../src/state/state.js";
import {
  updateStateOnAction,
  addFailedAction,
  isStuck,
} from "../src/state/state-manager.js";

describe("createInitialState", () => {
  it("creates state with given task", () => {
    const s = createInitialState("fix auth");
    expect(s.task).toBe("fix auth");
    expect(s.currentGoal).toBe("fix auth");
  });

  it("initializes defaults correctly", () => {
    const s = createInitialState("task");
    expect(s.currentFile).toBeNull();
    expect(s.lastAction).toBe("");
    expect(s.lastResult).toBe("");
    expect(s.progress).toBe("UNKNOWN");
    expect(s.completionStatus).toBe("in_progress");
  });

  it("initializes arrays as empty", () => {
    const s = createInitialState("task");
    expect(s.relevantFiles).toEqual([]);
    expect(s.failedActions).toEqual([]);
    expect(s.attemptedActions).toEqual([]);
  });
});

describe("cloneState", () => {
  it("creates a deep copy of arrays", () => {
    const s = createInitialState("task");
    s.relevantFiles.push("a.ts");
    s.failedActions.push("fail:1");
    s.attemptedActions.push("act:1");

    const cloned = cloneState(s);
    expect(cloned.relevantFiles).toEqual(["a.ts"]);
    expect(cloned.failedActions).toEqual(["fail:1"]);
    expect(cloned.attemptedActions).toEqual(["act:1"]);
  });

  it("modifying clone does not affect original", () => {
    const s = createInitialState("task");
    const cloned = cloneState(s);
    cloned.relevantFiles.push("new.ts");
    cloned.currentGoal = "changed";

    expect(s.relevantFiles).toEqual([]);
    expect(s.currentGoal).toBe("task");
  });
});

describe("updateStateOnAction", () => {
  it("records attempted action", () => {
    const s = createInitialState("task");
    const next = updateStateOnAction(s, { type: "inspect", target: "a.ts" }, true, "ok", []);
    expect(next.attemptedActions).toEqual(["inspect:a.ts"]);
    expect(next.lastAction).toBe("inspect:a.ts");
    expect(next.lastResult).toBe("ok");
  });

  it("records failed action in failedActions", () => {
    const s = createInitialState("task");
    const next = updateStateOnAction(s, { type: "edit", target: "a.ts" }, false, "err", []);
    expect(next.failedActions).toEqual(["edit:a.ts"]);
  });

  it("does not add to failedActions on success", () => {
    const s = createInitialState("task");
    const next = updateStateOnAction(s, { type: "edit", target: "a.ts" }, true, "ok", []);
    expect(next.failedActions).toEqual([]);
  });

  it("tracks relevant files from target and filesChanged", () => {
    const s = createInitialState("task");
    const next = updateStateOnAction(
      s,
      { type: "inspect", target: "a.ts" },
      true,
      "ok",
      ["b.ts", "c.ts"],
    );
    expect(next.relevantFiles).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("does not duplicate relevant files", () => {
    const s = createInitialState("task");
    const s2 = updateStateOnAction(s, { type: "inspect", target: "a.ts" }, true, "ok", ["a.ts"]);
    expect(s2.relevantFiles).toEqual(["a.ts"]);
  });

  it("updates currentFile for inspect action", () => {
    const s = createInitialState("task");
    const next = updateStateOnAction(s, { type: "inspect", target: "a.ts" }, true, "ok", []);
    expect(next.currentFile).toBe("a.ts");
  });

  it("updates currentFile for edit action", () => {
    const s = createInitialState("task");
    const next = updateStateOnAction(s, { type: "edit", target: "b.ts" }, true, "ok", []);
    expect(next.currentFile).toBe("b.ts");
  });

  it("does not update currentFile for run action", () => {
    const s = createInitialState("task");
    const next = updateStateOnAction(s, { type: "run", target: "cmd" }, true, "ok", []);
    expect(next.currentFile).toBeNull();
  });

  it("sets completionStatus to completed on successful finish", () => {
    const s = createInitialState("task");
    const next = updateStateOnAction(s, { type: "finish" }, true, "done", []);
    expect(next.completionStatus).toBe("completed");
    expect(next.progress).toBe("YES");
  });

  it("sets completionStatus to failed on failed finish", () => {
    const s = createInitialState("task");
    const next = updateStateOnAction(s, { type: "finish" }, false, "err", []);
    expect(next.completionStatus).toBe("failed");
    expect(next.progress).toBe("NO");
  });

  it("sets progress YES on successful edit", () => {
    const s = createInitialState("task");
    const next = updateStateOnAction(s, { type: "edit", target: "a.ts" }, true, "ok", []);
    expect(next.progress).toBe("YES");
  });

  it("sets progress NO on failed inspect", () => {
    const s = createInitialState("task");
    const next = updateStateOnAction(s, { type: "inspect", target: "a.ts" }, false, "err", []);
    expect(next.progress).toBe("NO");
  });
});

describe("addFailedAction", () => {
  it("adds action to failedActions", () => {
    const s = createInitialState("task");
    const next = addFailedAction(s, "edit:a.ts");
    expect(next.failedActions).toEqual(["edit:a.ts"]);
  });

  it("does not duplicate failure entries", () => {
    const s = createInitialState("task");
    const s2 = addFailedAction(s, "edit:a.ts");
    const s3 = addFailedAction(s2, "edit:a.ts");
    expect(s3.failedActions).toEqual(["edit:a.ts"]);
    expect(s3.attemptedActions).toEqual(["edit:a.ts", "edit:a.ts"]);
  });
});

describe("isStuck", () => {
  it("returns false when no attempts", () => {
    const s = createInitialState("task");
    expect(isStuck(s, 3)).toBe(false);
  });

  it("returns false when all actions under max", () => {
    const s = createInitialState("task");
    s.attemptedActions = ["edit:a.ts", "edit:b.ts", "inspect:a.ts"];
    expect(isStuck(s, 3)).toBe(false);
  });

  it("returns true when any action exceeds maxAttempts", () => {
    const s = createInitialState("task");
    s.attemptedActions = ["edit:a.ts", "edit:a.ts", "edit:a.ts", "edit:a.ts"];
    expect(isStuck(s, 3)).toBe(true);
  });

  it("returns true when exactly maxAttempts + 1", () => {
    const s = createInitialState("task");
    s.attemptedActions = ["run:cmd", "run:cmd", "run:cmd", "run:cmd"];
    expect(isStuck(s, 3)).toBe(true);
  });
});
