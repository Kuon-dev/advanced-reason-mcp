import { GeminiSequentialThinkingServer } from "./gemini";
import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { OpenRouterSequentialThinkingServer } from "./openrouter";
import { SequentialThinkingSchema } from "./utils";

// Define an enum for model selection
export enum ModelType {
  GEMINI = "gemini",
  DEEPSEEK = "deepseek",
  BOTH = "both",
}

// Extend the schema to include model selection
export const CombinedSequentialThinkingSchema = SequentialThinkingSchema.extend(
  {
    modelType: z
      .nativeEnum(ModelType)
      .default(ModelType.BOTH)
      .describe(
        "Which model to use for generating thoughts: 'gemini', 'deepseek', or 'both'",
      ),
  },
);

export class CombinedSequentialThinkingServer {
  private geminiServer: GeminiSequentialThinkingServer;
  private deepseekServer: OpenRouterSequentialThinkingServer;

  constructor(
    geminiApiKey: string = process.env.GEMINI_API_KEY ?? "",
    openRouterApiKey: string = process.env.OPENROUTER_API_KEY ?? "",
    deepseekModel: string = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-r1:free",
  ) {
    this.geminiServer = new GeminiSequentialThinkingServer(geminiApiKey);
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
    A powerful tool for dynamic and reflective problem-solving through multi-model sequential thinking. This tool combines the abilities of both Gemini and DeepSeek models, allowing you to leverage their unique insights for complex problem analysis. Each thought can build on, question, or revise previous insights as understanding deepens. When to use this tool:
    - Breaking down complex problems into steps 
    - Planning and design with room for revision 
    - Analysis that might need course correction 
    - Problems where the full scope might not be clear initially 
    - Problems that require a multi-step solution 
    - Tasks that need to maintain context over multiple steps 
    - Comparative analysis where multiple perspectives are valuable
    
    Key features: 
    - Can use either Gemini, DeepSeek, or both models together for each thought
    - Models generate thoughts based on previous thinking history
    - You can adjust total_thoughts up or down as you progress 
    - Thoughts can be revised or branched into alternative directions
    - Multiple reasoning modes (analytical, creative, critical, reflective)
    - Automatically suggests when more thinking might be needed
    - Can detect when to use other tools and integrate their results
    - Can incorporate user-provided context like code snippets or documents
    
    Usage workflow:
    1. Start with an initial question/problem in the currentThinking parameter
    2. For subsequent calls, use the generated thought(s) as input for next currentThinking
    3. If a tool is suggested, use that tool and pass the results via externalToolResult
    4. Optionally revise previous thoughts or branch into new directions
    5. Continue until a satisfactory conclusion is reached
    
    Parameters explained:
    - currentThinking: MUST BE DIFFERENT for each thought - use previous output for next input
    - thoughtNumber: Current number in sequence (can go beyond initial total if needed)
    - totalThoughts: Current estimate of thoughts needed (can be adjusted up/down)
    - nextThoughtNeeded: True if you need more thinking, even if at what seemed like the end
    - modelType: Which model to use - "gemini", "deepseek", or "both" (default)
    - isRevision: A boolean indicating if this thought revises previous thinking
    - revisesThought: If isRevision is true, which thought number is being reconsidered
    - branchFromThought: If branching, which thought number is the branching point
    - branchId: Identifier for the current branch (if any)
    - needsMoreThoughts: If reaching end but realizing more thoughts needed
    - reasoningMode: The style of reasoning to apply (analytical, creative, critical, reflective)
    - externalToolResult: Optional results from another tool to incorporate into thinking
    - userContext: Optional context provided by the user, such as code snippets or relevant documents
    `,
  inputSchema: {
    type: "object",
    properties: {
      currentThinking: {
        type: "string",
        description:
          "The evolving thought process - MUST be different for each thought. Use previous generated thought as input for next thought.",
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
      modelType: {
        type: "string",
        enum: ["gemini", "deepseek", "both"],
        default: "both",
        description: "Which model to use for generating thoughts",
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
        description: "Additional context provided by the user, such as code snippets, relevant documents, or background information",
      },
    },
    required: [
      "currentThinking",
      "thoughtNumber",
      "totalThoughts",
      "nextThoughtNeeded",
    ],
  },
};
