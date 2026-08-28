import { describe, it, expect } from "vitest";
import { redactText, redactWithFlag } from "../src/redact.js";

describe("redactText", () => {
  it("redacts an api_key = value assignment", () => {
    const out = redactText("the token is api_key=super_secret_value_here ok");
    expect(out).not.toContain("super_secret_value_here");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts a secret: value pattern", () => {
    const out = redactText("SECRET: abc123def456ghi");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("abc123def456ghi");
  });

  it("redacts an OpenAI-style key", () => {
    const out = redactText("key sk-9gZl4Bxn6xKpQ7vRtY1uWc2dAeF3hIj0abcdef");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sk-9gZl4Bxn6xKp");
  });

  it("redacts GitHub tokens", () => {
    const out = redactText("pat=ghp_1234567890abcdefghijklmnop");
    expect(out).not.toContain("ghp_1234567890");
  });

  it("redacts a PEM private-key header", () => {
    const out = redactText("-----BEGIN RSA PRIVATE KEY-----AAABBBB");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("PRIVATE KEY-----");
  });

  it("replaces provided secret strings verbatim", () => {
    const out = redactText("value is averylongsupersecret12345", {
      secretStrings: ["averylongsupersecret12345"],
    });
    expect(out).not.toContain("averylongsupersecret12345");
    expect(out).toContain("[REDACTED]");
  });

  it("supports a custom label", () => {
    const out = redactText("apiKey=foo_bar_baz", { label: "<hidden>" });
    expect(out).toContain("<hidden>");
    expect(out).not.toContain("foo_bar_baz");
  });

  it("leaves ordinary text unchanged", () => {
    const out = redactText("the quick brown fox jumps over the lazy dog");
    expect(out).toBe("the quick brown fox jumps over the lazy dog");
  });

  it("applies extra custom patterns", () => {
    const out = redactText("FOOBAR=zebra12345", { extraPatterns: [/FOOBAR=\w+/g] });
    expect(out).not.toContain("zebra12345");
    expect(out).toContain("[REDACTED]");
  });
});

describe("redactWithFlag", () => {
  it("flags when redaction occurred", () => {
    const r = redactWithFlag("password=abc123");
    expect(r.redacted).toBe(true);
    expect(r.text).not.toContain("abc123");
  });

  it("flags no redaction for plain text", () => {
    const r = redactWithFlag("just some words");
    expect(r.redacted).toBe(false);
    expect(r.text).toBe("just some words");
  });
});
