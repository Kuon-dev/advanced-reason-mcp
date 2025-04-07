// src/modules/code/context.ts
import { z } from "zod";

export const CodeContextSchema = z.object({
  type: z.literal("codeContext"),
  version: z.string().default("1.0"),
  query: z
    .string()
    .optional()
    .describe("The original user question about code"),
  files: z
    .array(
      z.object({
        path: z.string().describe("Path to the file"),
        language: z.string().optional().describe("Programming language"),
        snippet: z.string().optional().describe("Relevant code snippet"),
        startLine: z.number().int().optional().describe("Starting line number"),
        endLine: z.number().int().optional().describe("Ending line number"),
        symbols: z
          .array(
            z.object({
              name: z.string().describe("Symbol name"),
              type: z
                .string()
                .describe("Symbol type (function, class, variable, etc.)"),
              line: z
                .number()
                .int()
                .optional()
                .describe("Line number where symbol is defined"),
            }),
          )
          .optional()
          .describe("Relevant symbols in the file"),
      }),
    )
    .optional()
    .describe("Files related to the code question"),
  error: z
    .object({
      message: z.string().optional().describe("Error message if debugging"),
      stack: z.string().optional().describe("Stack trace if available"),
    })
    .optional()
    .describe("Error information for debugging contexts"),
  projectInfo: z
    .object({
      structure: z
        .string()
        .optional()
        .describe("Brief description of relevant project structure"),
      dependencies: z
        .array(z.string())
        .optional()
        .describe("Relevant dependencies"),
    })
    .optional()
    .describe("Project-level information"),
});

export type CodeContext = z.infer<typeof CodeContextSchema>;

// Helper function to format code context for model prompts
export function formatCodeContext(codeContext: CodeContext): string {
  let formattedContext = `\n\n**Code Context:**\n`;

  // Include query focus
  if (codeContext.query) {
    formattedContext += `Question about: ${codeContext.query}\n\n`;
  }

  // Include file information
  for (const file of codeContext.files || []) {
    formattedContext += `**File:** ${file.path}`;
    if (file.language) formattedContext += ` (${file.language})`;
    formattedContext += `\n`;

    // Add line number info if available
    if (file.startLine !== undefined && file.endLine !== undefined) {
      formattedContext += `Lines ${file.startLine}-${file.endLine}\n`;
    }

    // Add code snippet with proper formatting
    if (file.snippet) {
      formattedContext += `\`\`\`${file.language || ""}\n${file.snippet}\n\`\`\`\n`;
    }

    // Add relevant symbols
    if (file.symbols && file.symbols.length > 0) {
      formattedContext += `\n**Relevant Symbols:**\n`;
      for (const symbol of file.symbols) {
        formattedContext += `- ${symbol.name} (${symbol.type})`;
        if (symbol.line !== undefined)
          formattedContext += ` at line ${symbol.line}`;
        formattedContext += `\n`;
      }
      formattedContext += "\n";
    }
  }

  // Add error information if present
  if (
    codeContext.error &&
    (codeContext.error.message || codeContext.error.stack)
  ) {
    formattedContext += `\n**Error Information:**\n`;
    if (codeContext.error.message) {
      formattedContext += `Error: ${codeContext.error.message}\n`;
    }
    if (codeContext.error.stack) {
      formattedContext += `\`\`\`\n${codeContext.error.stack}\n\`\`\`\n`;
    }
  }

  // Add project information if present
  if (codeContext.projectInfo) {
    formattedContext += `\n**Project Information:**\n`;
    if (codeContext.projectInfo.structure) {
      formattedContext += `Structure: ${codeContext.projectInfo.structure}\n`;
    }
    if (
      codeContext.projectInfo.dependencies &&
      codeContext.projectInfo.dependencies.length > 0
    ) {
      formattedContext += `Dependencies: ${codeContext.projectInfo.dependencies.join(", ")}\n`;
    }
  }

  return formattedContext;
}
