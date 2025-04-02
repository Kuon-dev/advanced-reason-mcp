import OpenAI from "openai";
import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { SequentialThinkingSchema, type ThoughtData } from "./utils";

export class OpenRouterSequentialThinkingServer {
  private openai: OpenAI;
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, number[]> = {};
  private originalQuery: string = "";
  private lastThoughtTimestamp: number | null = null;
  private model: string;

  constructor(
    apiKey: string = process.env.OPENROUTER_API_KEY ?? "",
    model: string = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-r1-distill-qwen-32b:free",
  ) {
    this.openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: apiKey,
    });
    this.model = model;
  }

  // Simple check if current thinking matches previous
  private isThinkingTooSimilar(currentThinking: string): boolean {
    if (this.thoughtHistory.length === 0) return false;
    return (
      currentThinking ===
      this.thoughtHistory[this.thoughtHistory.length - 1].currentThinking
    );
  }

  // Detect if the thought is requesting to use a tool
  private detectToolRequest(
    generatedThought: string,
  ): { needsTool: boolean; toolType: string; query: string } | null {
    // Check for code retrieval request patterns (can be expanded for your specific needs)
    const codeMatch = generatedThought.match(
      /(?:need|should|must|require)s?\s+(?:to\s+)?(?:see|check|review|examine|analyze|retrieve|get|find|look\s+at)\s+(?:the\s+)?code(?:\s+for)?(?:\s+in)?:?\s+["']?([^"'\n.!?]+)["']?/i,
    );
    if (codeMatch) {
      return {
        needsTool: true,
        toolType: "code_retrieval",
        query: codeMatch[1].trim(),
      };
    }

    // Check for documentation lookup patterns
    const docMatch = generatedThought.match(
      /(?:need|should|must|require)s?\s+(?:to\s+)?(?:see|check|review|read|consult|examine|reference)\s+(?:the\s+)?documentation(?:\s+for|about)?:?\s+["']?([^"'\n.!?]+)["']?/i,
    );
    if (docMatch) {
      return {
        needsTool: true,
        toolType: "documentation",
        query: docMatch[1].trim(),
      };
    }

    // Check for file search patterns
    const fileMatch = generatedThought.match(
      /(?:need|should|must|require)s?\s+(?:to\s+)?(?:search|find|locate|list)\s+(?:all\s+)?files?(?:\s+that)?(?:\s+contain)?:?\s+["']?([^"'\n.!?]+)["']?/i,
    );
    if (fileMatch) {
      return {
        needsTool: true,
        toolType: "file_search",
        query: fileMatch[1].trim(),
      };
    }

    // Look for explicit tool usage indicators
    if (
      generatedThought.includes("I should use the file search tool") ||
      generatedThought.includes("we need to examine the code") ||
      generatedThought.includes("using the code retrieval tool") ||
      generatedThought.includes("need to look up the API")
    ) {
      const lines = generatedThought.split("\n");
      for (const line of lines) {
        if (
          line.toLowerCase().includes("search for") ||
          line.toLowerCase().includes("look for") ||
          line.toLowerCase().includes("find files") ||
          line.toLowerCase().includes("retrieve code")
        ) {
          return {
            needsTool: true,
            toolType: line.toLowerCase().includes("search")
              ? "file_search"
              : "code_retrieval",
            query: line.split(":").pop()?.trim() || "relevant code",
          };
        }
      }
    }

    return null;
  }

  private async generateThoughtWithOpenRouter(
    args: z.infer<typeof SequentialThinkingSchema>,
  ): Promise<string> {
    try {
      // Store original query if this is the first thought
      if (args.thoughtNumber === 1 || this.originalQuery === "") {
        this.originalQuery = args.currentThinking;
      }

      // Build previous thoughts context
      let previousThoughts = "";
      if (args.thoughtNumber > 1) {
        // Get previous thoughts - simple version that just gets the last 2 thoughts
        const prevThoughts = this.thoughtHistory
          .filter((t) => t.thoughtNumber < args.thoughtNumber)
          .sort((a, b) => b.thoughtNumber - a.thoughtNumber)
          .slice(0, 2);

        if (prevThoughts.length > 0) {
          previousThoughts = prevThoughts
            .sort((a, b) => a.thoughtNumber - b.thoughtNumber)
            .map((t) => `Previous Thought #${t.thoughtNumber}:\n${t.thought}`)
            .join("\n\n");

          previousThoughts = `\n\nPrevious thinking:\n${previousThoughts}\n\n`;
        }
      }

      // Add user context if provided
      const userContextSection = args.userContext 
        ? `\n\n**User-Provided Context:**\n${args.userContext}\n\n`
        : "";

      // Simplified context info
      let intro =
        args.thoughtNumber === 1
          ? "This is the first thought in our analysis."
          : `This is Thought #${args.thoughtNumber} in our sequential analysis.`;

      if (args.isRevision) {
        intro += ` This revises Thought #${args.revisesThought}.`;
      }

      const isLastThought = args.thoughtNumber >= args.totalThoughts;
      const ending = isLastThought
        ? "\n\nThis is the final thought in our sequence. Consider providing a conclusion."
        : "";

      const constraints = args.reasoningMode
        ? `Apply ${args.reasoningMode} reasoning to this thought.`
        : "";

      // Add external tool results if available
      let externalToolInfo = "";
      if (args.externalToolResult) {
        externalToolInfo = `
\n\n**External Tool Results:**
Tool Used: ${args.externalToolResult.toolType}
Query: ${args.externalToolResult.query}
Result: 
${args.externalToolResult.result}

Please incorporate this information into your thinking.
`;
      }

      // Build the prompt
      const systemPrompt = `You are an AI assistant analyzing a complex problem through sequential thinking. 
Your task is to provide a coherent thought that represents the next logical step in the reasoning process.
You should consider all previous thoughts and current thinking to advance the understanding.`;

      const userPrompt = `
**Sequential Thinking Process - Thought #${args.thoughtNumber} of ${args.totalThoughts}**

**Original Request:** ${this.originalQuery}${userContextSection}**Current Thinking:** ${args.currentThinking}

${intro}${previousThoughts}${externalToolInfo}${ending}

**Your Task for This Thought:**
Provide the next logical step in our reasoning process. Consider the user context (if provided), previous thoughts, and current thinking to advance our understanding.

${constraints}

Your response should be a cohesive thought that moves our analysis forward.
`;

      // Call OpenRouter API
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 1,
        max_tokens: 64000,
      });

      return (
        (completion.choices[0]?.message as any).reasoning ||
        "Error: No response generated"
      );
    } catch (error) {
      return `Error generating thought: ${error}`;
    }
  }

  // Process the sequential thinking
  public async processSequentialThinking(
    args: z.infer<typeof SequentialThinkingSchema>,
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    try {
      // Check if current thinking is too similar to previous
      if (this.isThinkingTooSimilar(args.currentThinking)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error:
                    "ERROR: The currentThinking parameter must be different for each thought.",
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

      // Add rate limiting between thoughts to prevent too rapid sequential processing
      if (this.lastThoughtTimestamp) {
        const timeSinceLastThought = Date.now() - this.lastThoughtTimestamp;
        const minThinkingTime = 2000; // 2 seconds minimum between thoughts

        if (timeSinceLastThought < minThinkingTime) {
          await new Promise((resolve) =>
            setTimeout(resolve, minThinkingTime - timeSinceLastThought),
          );
        }
      }

      // Generate the thought content using OpenRouter
      const generatedThought = await this.generateThoughtWithOpenRouter(args);

      // Check if the thought suggests using another tool
      const toolRequest = this.detectToolRequest(generatedThought);

      // Create thought data object
      const thoughtData: ThoughtData = {
        originalQuery: this.originalQuery || args.currentThinking,
        currentThinking: args.currentThinking,
        thoughtNumber: args.thoughtNumber,
        totalThoughts: args.totalThoughts,
        nextThoughtNeeded: args.nextThoughtNeeded,
        thought: generatedThought,
        isRevision: args.isRevision,
        revisesThought: args.revisesThought,
        branchFromThought: args.branchFromThought,
        branchId: args.branchId,
        reasoningMode: args.reasoningMode,
        userContext: args.userContext, // Store userContext in thought data
        suggestedToolUse: toolRequest
          ? {
              toolType: toolRequest.toolType,
              query: toolRequest.query,
            }
          : undefined,
      };

      // Store thought data
      this.thoughtHistory.push(thoughtData);

      // Update timestamp after processing this thought
      this.lastThoughtTimestamp = Date.now();

      // Handle branching
      if (args.branchFromThought && args.branchId) {
        if (!this.branches[args.branchId]) {
          this.branches[args.branchId] = [];
        }
        this.branches[args.branchId].push(args.thoughtNumber);
      }

      // Prepare simplified response
      const response = {
        thought: generatedThought,
        thoughtNumber: args.thoughtNumber,
        totalThoughts: args.totalThoughts,
        nextThoughtNeeded: args.nextThoughtNeeded,
        suggestedToolUse: toolRequest
          ? {
              toolType: toolRequest.toolType,
              query: toolRequest.query,
              message: `Consider using the ${toolRequest.toolType} tool with query: "${toolRequest.query}" before continuing with sequential thinking`,
            }
          : undefined,
        hint: toolRequest
          ? "Consider using the suggested tool before continuing with sequential thinking"
          : "Use this thought as input for next call",
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
}

// Tool definition
export const OPENROUTER_SEQUENTIAL_THINKING_TOOL: Tool = {
  name: "openrouter-sequential-thinking",
  description: `
    A powerful tool for dynamic and reflective problem-solving through OpenRouter-powered sequential thinking. This tool helps analyze problems through a flexible thinking process that can adapt and evolve. Each thought is generated by a selected OpenRouter model and can build on, question, or revise previous insights as understanding deepens. When to use this tool:
    - Breaking down complex problems into steps 
    - Planning and design with room for revision 
    - Analysis that might need course correction 
    - Problems where the full scope might not be clear initially 
    - Problems that require a multi-step solution 
    - Tasks that need to maintain context over multiple steps 
    
    Key features: 
    - OpenRouter models generate each thought based on previous thinking history
    - You can adjust total_thoughts up or down as you progress 
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
    - currentThinking: MUST BE DIFFERENT for each thought - use previous output for next input
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
