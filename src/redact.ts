/**
 * Secret redaction for the public SCAFFOLD runtime.
 *
 * Tool output (inspect/search/run stdout|stderr) and error text can carry
 * credentials, API keys, tokens, or other sensitive values that would otherwise
 * flow back into the model context, logs, or the host-facing result. This
 * module redacts a set of high-signal secret patterns (and, optionally,
 * provided environment values) before such text is admitted into feedback,
 * context, or errors.
 *
 * This layer NEVER executes code or reads files; it transforms strings.
 */

/** Default high-signal secret regexes. Conservative and broad. */
const DEFAULT_PATTERNS: readonly RegExp[] = [
  /(api[_-]?key|secret|token|password|passwd|bearer|authorization)\s*[=:]\s*["']?([A-Za-z0-9._\-+/]{4,})/gi,
  /\bAKIA[0-9A-Z]{16}\b/gi, // AWS access key id
  /\b(ghp|gho|github_pat)_[A-Za-z0-9_]{10,}\b/gi, // GitHub tokens
  /\bsk-[A-Za-z0-9]{16,}\b/gi, // OpenAI-style keys
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gi, // Slack tokens
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g, // PEM private key header
];

const REDACTED_LABEL = "[REDACTED]";

export interface RedactOptions {
  /** Additional regexes to apply on top of the defaults. */
  readonly extraPatterns?: readonly RegExp[];
  /** Exact string values (e.g. resolved env vars) to replace with the label. */
  readonly secretStrings?: readonly string[];
  /** Custom replacement label (default `[REDACTED]`). */
  readonly label?: string;
}

/**
 * Returns a redacted copy of `text`. Values matching secret patterns (and any
 * provided `secretStrings`) are replaced with the label.
 */
export function redactText(text: string, options: RedactOptions = {}): string {
  const label = options.label ?? REDACTED_LABEL;
  let out = text;

  for (const secret of options.secretStrings ?? []) {
    if (!secret) continue;
    out = out.split(secret).join(label);
  }

  for (const re of [...DEFAULT_PATTERNS, ...(options.extraPatterns ?? [])]) {
    // Recreate the regex each pass so `lastIndex` state cannot leak across calls.
    const flags = re.flags.includes("g") ? re.flags : re.flags + "g";
    const global = new RegExp(re.source, flags);
    out = out.replace(global, label);
  }

  return out;
}

/**
 * Convenience: redact a string and return a small boolean flag indicating
 * whether any redaction occurred (useful for observers/metrics).
 */
export function redactWithFlag(
  text: string,
  options: RedactOptions = {},
): { readonly text: string; readonly redacted: boolean } {
  const out = redactText(text, options);
  return { text: out, redacted: out !== text };
}
