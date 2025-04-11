// import { GeminiSequentialThinkingServer } from "./gemini";
import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { SequentialThinkingSchema } from "./utils";
import { OpenRouterSequentialThinkingServer } from "../providers/openrouter";

// Define an enum for model selection
export enum ModelType {
  GEMINI = "gemini",
  DEEPSEEK = "deepseek",
  ALL = "all",
}

// Extend the schema to include model selection
export const CombinedSequentialThinkingSchema = SequentialThinkingSchema.extend(
  {
    modelType: z
      .nativeEnum(ModelType)
      .default(ModelType.ALL)
      .describe(
        "Which model to use for generating thoughts: 'gemini', 'deepseek', or 'all'",
      ),
  },
);

export class CombinedSequentialThinkingServer {
  // private geminiServer: GeminiSequentialThinkingServer;
  private geminiServer: OpenRouterSequentialThinkingServer;
  private deepseekServer: OpenRouterSequentialThinkingServer;

  constructor(
    // geminiApiKey: string = process.env.GEMINI_API_KEY ?? "",
    openRouterApiKey: string = process.env.OPENROUTER_API_KEY ?? "",
    deepseekModel: string = process.env.OPENROUTER_MODEL ??
      "deepseek/deepseek-r1:free",
  ) {
    // this.geminiServer = new GeminiSequentialThinkingServer(geminiApiKey);
    this.geminiServer = new OpenRouterSequentialThinkingServer(
      openRouterApiKey,
      "google/gemini-2.5-pro-exp-03-25:free"
    )
    this.deepseekServer = new OpenRouterSequentialThinkingServer(
      openRouterApiKey,
      deepseekModel,
    );
  }

  // Process sequential thinking using both or selected models
  public async processSequentialThinking(
    args: z.infer<typeof CombinedSequentialThinkingSchema>,
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    // Extract modelType and prepare args for individual servers
    const { modelType, ...commonArgs } = args;

    try {
      // Process with selected model(s)
      if (modelType === ModelType.GEMINI) {
        // Use only Gemini
        return await this.geminiServer.processSequentialThinking(commonArgs);
      } else if (modelType === ModelType.DEEPSEEK) {
        // Use only DeepSeek
        return await this.deepseekServer.processSequentialThinking(commonArgs);
      } else {
        // Use both models and combine results
        const [geminiResult, deepseekResult] = await Promise.all([
          this.geminiServer.processSequentialThinking(commonArgs),
          this.deepseekServer.processSequentialThinking(commonArgs),
        ]);

        // Check for errors
        if (geminiResult.isError && deepseekResult.isError) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: "Both models returned errors",
                    geminiError: geminiResult.content[0].text,
                    deepseekError: deepseekResult.content[0].text,
                    status: "failed",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        // Parse results
        let geminiData, deepseekData;

        try {
          if (!geminiResult.isError) {
            geminiData = JSON.parse(geminiResult.content[0].text);
          }

          if (!deepseekResult.isError) {
            deepseekData = JSON.parse(deepseekResult.content[0].text);
          }

          // Format Gemini thought
          const geminiThought =
            geminiData?.thought || "Gemini processing failed";

          // Format DeepSeek thought
          const deepseekThought =
            deepseekData?.thought || "DeepSeek processing failed";

          // Format Gemini response text
          const geminiResponseText = `
=== GEMINI (THOUGHT #${args.thoughtNumber}) ===

${geminiThought}

META:
- Thought Number: ${args.thoughtNumber}
- Total Thoughts: ${args.totalThoughts}
- Next Thought Needed: ${args.nextThoughtNeeded}
- Suggested Tool: ${geminiData?.suggestedToolUse ? JSON.stringify(geminiData.suggestedToolUse) : "None"}
`.trim();

          // Format DeepSeek response text
          const deepseekResponseText = `
=== DEEPSEEK (THOUGHT #${args.thoughtNumber}) ===

${deepseekThought}

META:
- Thought Number: ${args.thoughtNumber}
- Total Thoughts: ${args.totalThoughts}
- Next Thought Needed: ${args.nextThoughtNeeded}
- Suggested Tool: ${deepseekData?.suggestedToolUse ? JSON.stringify(deepseekData.suggestedToolUse) : "None"}
`.trim();

          return {
            content: [
              {
                type: "text",
                text: geminiResponseText,
              },
              {
                type: "text",
                text: deepseekResponseText,
              },
            ],
          };
        } catch (parseError) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: "Error parsing model results",
                    details: String(parseError),
                    status: "failed",
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: `Error processing sequential thinking: ${error}`,
                status: "failed",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
  }
}

// Tool definition
export const GEMINI_DEEPSEEK_SEQUENTIAL_TOOL: Tool = {
  name: "combined-sequential-thinking",
  description: `
    A powerful tool for structured, methodical problem-solving through OpenRouter-powered sequential thinking. This tool generates thoughts following a specific 5-step reasoning structure:

    1. Identify the user's question: Clarify what's being asked and the core problem to solve
    2. Recall internal knowledge: Access relevant information and context needed for the solution
    3. Formulate the answer: Develop an initial response based on the identified question and recalled knowledge
    4. Refine the answer: Improve clarity, accuracy, and relevance of the initial response
    5. Self-Correction/Refinement: Review for errors or improvements before finalizing

    When to use this tool:
    - Breaking down complex problems into structured steps 
    - Planning and design with room for revision 
    - Analysis that might need course correction 
    - Problems where the full scope might not be clear initially 
    - Problems that require a methodical solution approach
    - Tasks that need to maintain context over multiple steps 
    
    Key features: 
    - OpenRouter models generate each thought using the structured 5-step reasoning process
    - Thoughts can be revised or branched into alternative directions
    - Multiple reasoning modes (analytical, creative, critical, reflective)
    - Automatically suggests when more thinking might be needed
    - Can detect when to use other tools and integrate their results
    - Can incorporate user-provided context like code snippets or documents
    
    Usage workflow:
    1. Start with an initial question/problem in the currentThinking parameter
    2. For subsequent calls, use the generated thought as the currentThinking parameter
    3. If a tool is suggested, use that tool and pass the results via externalToolResult
    4. Optionally revise previous thoughts or branch into new directions
    5. Continue until a satisfactory conclusion is reached
    
    Parameters explained:
    - currentThinking: A structured representation of the evolving thought process. MUST be different than other thoughts, and incorporate previous thinking and explicitly follow the 5-step reasoning structure. For each thought, include:
        * Original question/problem statement
        * Current step number (1-n) and its purpose
        * Summary of previous step's conclusions
        * Current analysis formatted with clear section headers for each step
        * Key findings and insights accumulated so far
        * Any open questions or uncertainties remaining
        * Transition to the next logical step
        Format each thought with markdown headers (###) to clearly delineate sections. Ensure each new thought builds upon previous thinking rather than simply repeating it.
    - thoughtNumber: Current number in sequence (can go beyond initial total if needed)
    - totalThoughts: Current estimate of thoughts needed (can be adjusted up/down)
    - nextThoughtNeeded: True if you need more thinking, even if at what seemed like the end
    - isRevision: A boolean indicating if this thought revises previous thinking
    - revisesThought: If isRevision is true, which thought number is being reconsidered
    - branchFromThought: If branching, which thought number is the branching point
    - branchId: Identifier for the current branch (if any)
    - needsMoreThoughts: If reaching end but realizing more thoughts needed
    - reasoningMode: The style of reasoning to apply (analytical, creative, critical, reflective)
    - externalToolResult: Optional results from another tool to incorporate into thinking
    - userContext: Optional context provided by the user, such as code snippets or relevant documents. Highly encouraged to utilize this field
    `,
  inputSchema: {
    type: "object",
    properties: {
      currentThinking: {
        type: "string",
        description: `A structured representation of the evolving thought process. MUST incorporate previous thinking and explicitly follow the 5-step reasoning structure. For each thought, include:
        * Original question/problem statement
        * Current step number (1-n) and its purpose
        * Summary of previous step's conclusions
        * Current analysis formatted with clear section headers for each step
        * Key findings and insights accumulated so far
        * Any open questions or uncertainties remaining
        * Transition to the next logical step
        Format each thought with markdown headers (###) to clearly delineate sections. Ensure each new thought builds upon previous thinking rather than simply repeating it.`,
      },
      thoughtNumber: {
        type: "integer",
        minimum: 1,
        description: "Current thought number",
      },
      totalThoughts: {
        type: "integer",
        minimum: 1,
        description: "Total thoughts needed",
      },
      nextThoughtNeeded: {
        type: "boolean",
        description: "Whether another thought is needed",
      },
      isRevision: {
        type: "boolean",
        description: "Whether this thought revises a previous one",
      },
      revisesThought: {
        type: "integer",
        minimum: 1,
        description: "Which thought is being revised",
      },
      branchFromThought: {
        type: "integer",
        minimum: 1,
        description: "Which thought is the branching point",
      },
      branchId: {
        type: "string",
        description: "Identifier for the current branch",
      },
      needsMoreThoughts: {
        type: "boolean",
        description: "If more thoughts are needed",
      },
      reasoningMode: {
        type: "string",
        enum: ["analytical", "creative", "critical", "reflective"],
        default: "analytical",
        description: "The style of reasoning to apply",
      },
      externalToolResult: {
        type: "object",
        properties: {
          toolType: {
            type: "string",
            description: "The type of tool that was used",
          },
          query: {
            type: "string",
            description: "The query that was used with the tool",
          },
          result: {
            type: "string",
            description: "The result returned by the tool",
          },
        },
        required: ["toolType", "query", "result"],
        description:
          "Results from an external tool to incorporate into thinking",
      },
      userContext: {
        type: "string",
        description:
          "Additional context provided by the user, such as code snippets, relevant documents, or background information",
      },
      // userContext: {
      //   type: "codeContext",
      //   version: "1.0",
      //   query: "The original user question about code",
      //   files: [
      //     {
      //       path: "path/to/file.ts",
      //       language: "typescript",
      //       snippet: "// Relevant code snippet here",
      //       startLine: 10,
      //       endLine: 25,
      //       symbols: [
      //         {
      //           name: "functionName",
      //           type: "function",
      //           line: 12,
      //         },
      //       ],
      //     },
      //   ],
      //   error: {
      //     message: "Error message if debugging",
      //     stack: "Stack trace if available",
      //   },
      //   projectInfo: {
      //     structure: "Brief description of relevant project structure",
      //     dependencies: ["relevant", "dependencies"],
      //   },
      // },
    },
    required: [
      "currentThinking",
      "thoughtNumber",
      "totalThoughts",
      "nextThoughtNeeded",
    ],
  },
};
