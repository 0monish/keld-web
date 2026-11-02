const MAX_LINES = 800;

interface RuleContext {
  filename: string;
  sourceCode: { lines: readonly unknown[] };
  report(descriptor: { node: unknown; messageId: string; data?: Record<string, string> }): void;
}

// AGENTS.md lists "file-size" as a blocking gate, but nothing previously enforced it — see
// CODEBASE_REVIEW.md STD-03. Large files here are a maintainability smell (mixed responsibilities,
// hard to review) rather than a hard technical limit, so this stays a single flat threshold with
// Keep domain schema files under the line budget; do not grow a single kitchen-sink schema.
const maxFileLinesRule = {
  meta: {
    type: "problem",
    docs: {
      description: `Flag source files over ${MAX_LINES} lines so they get split before they grow further.`,
    },
    schema: [],
    messages: {
      tooManyLines:
        "This file has {{lineCount}} lines, over the {{maxLines}}-line guideline. Extract one responsibility at a time into a colocated module instead of growing this file further.",
    },
  },
  create(context: RuleContext) {
    const filename = context.filename;

    if (!filename || filename === "<input>") {
      return {};
    }

    return {
      Program(node: unknown) {
        const lineCount = context.sourceCode.lines.length;

        if (lineCount > MAX_LINES) {
          context.report({
            node,
            messageId: "tooManyLines",
            data: { lineCount: String(lineCount), maxLines: String(MAX_LINES) },
          });
        }
      },
    };
  },
};

export default maxFileLinesRule;
