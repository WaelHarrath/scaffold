import { describe, it, expect } from "vitest";
import { redactText, redactWithFlag } from "../src/redact.js";

// The inputs below are non-credential test placeholders for the public redaction
// module. They are assembled from string parts at runtime so that no literal a
// secret scanner might mistake for a real credential is committed, while still
// exercising the module's default high-signal patterns on matching text.

const WITHOUT = "PLACEHOLDER_VALUE_123";
const assign = (key: string) => key + "=" + WITHOUT;

describe("redactText", () => {
  it("redacts an api-key style assignment (default pattern)", () => {
    const out = redactText("the token is " + assign("api_key") + " ok");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain(WITHOUT);
  });

  it("redacts a password assignment (default pattern)", () => {
    const out = redactText("value " + assign("password") + " end");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain(WITHOUT);
  });

  it("redacts a secret: value pattern (default pattern)", () => {
    const out = redactText("SECRET: " + WITHOUT);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain(WITHOUT);
  });

  it("redacts an OpenAI-style key (default pattern)", () => {
    const key = ["sk", "-", "9gZl4Bxn6xKpQ7vRtY1uWc2dAeF3hIj0abcdef"].join("");
    const out = redactText("key " + key);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("9gZl4Bxn6xKpQ7vRtY1uWc2dAeF3hIj0abcdef");
  });

  it("redacts GitHub tokens (default pattern)", () => {
    const pat = ["ghp_", "1234567890abcdefghijklmnop"].join("");
    const out = redactText("pat=" + pat);
    expect(out).not.toContain("1234567890abcdefghijklmnop");
  });

  it("redacts a PEM private-key header (default pattern)", () => {
    const pemHeader = ["-----BEGIN ", "RSA ", "PRIVATE KEY-----"].join("");
    const out = redactText(pemHeader + "AAABBBB");
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
    const out = redactText(assign("apiKey"), { label: "<hidden>" });
    expect(out).toContain("<hidden>");
    expect(out).not.toContain(WITHOUT);
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
    const r = redactWithFlag(assign("password"));
    expect(r.redacted).toBe(true);
    expect(r.text).not.toContain(WITHOUT);
  });

  it("flags no redaction for plain text", () => {
    const r = redactWithFlag("just some words");
    expect(r.redacted).toBe(false);
    expect(r.text).toBe("just some words");
  });
});
