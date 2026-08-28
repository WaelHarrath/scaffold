import { describe, it, expect } from "vitest";
import {
  ScaffoldError,
  ConfigurationError,
  ModelError,
  ToolError,
  ExecutionError,
  TimeoutError,
  CancelledError,
  ValidationError,
  RuntimeError,
} from "../src/errors.js";

describe("error hierarchy", () => {
  it("all subclasses are instances of ScaffoldError and Error", () => {
    const errors = [
      new ConfigurationError("a"),
      new ModelError("b"),
      new ToolError("c"),
      new ExecutionError("d"),
      new TimeoutError("e"),
      new CancelledError(),
      new ValidationError("f"),
      new RuntimeError("g"),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(ScaffoldError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it("assigns distinct stable codes", () => {
    expect(new ConfigurationError("a").code).toBe("CONFIGURATION_ERROR");
    expect(new ModelError("b").code).toBe("MODEL_ERROR");
    expect(new ToolError("c").code).toBe("TOOL_ERROR");
    expect(new ExecutionError("d").code).toBe("EXECUTION_ERROR");
    expect(new TimeoutError("e").code).toBe("TIMEOUT");
    expect(new CancelledError().code).toBe("CANCELLED");
    expect(new ValidationError("f").code).toBe("VALIDATION_ERROR");
    expect(new RuntimeError("g").code).toBe("RUNTIME_ERROR");
  });
});

describe("error safety", () => {
  it("toSafeString includes only code and message (no cause detail / secrets)", () => {
    const err = new ModelError("failed", { causeDetail: "SECRET ca:abc123" });
    const safe = err.toSafeString();
    expect(safe).toContain("[MODEL_ERROR]");
    expect(safe).toContain("failed");
    expect(safe).not.toContain("ca:abc123");
    expect(safe).not.toContain("SECRET");
  });

  it("carries a cause without serializing it into safe string", () => {
    const cause = new Error("inner");
    const err = new ModelError("outer", { cause });
    expect(err.cause).toBe(cause);
    expect(err.toSafeString()).not.toContain("inner");
  });

  it("timeout and cancellation carry their names", () => {
    expect(new TimeoutError("slow").name).toBe("TimeoutError");
    expect(new CancelledError().name).toBe("CancelledError");
  });
});
