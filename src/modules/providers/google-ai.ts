import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { formatCodeContext } from "../code/context";
import { ThoughtData, SequentialThinkingSchema, detectToolRequest } from "../sequential/utils";

// Interface for thought data
export class GeminiSequentialThinkingServer {
  private ai: GoogleGenAI;
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, number[]> = {};
  private originalQuery: string = "";
  private lastThoughtTimestamp: number | null = null;

  constructor(apiKey: string = process.env.GEMINI_API_KEY ?? "") {
    this.ai = new GoogleGenAI({ apiKey });
  }

  // Simple check if current thinking matches previous
  private isThinkingTooSimilar(currentThinking: string): boolean {
    if (this.thoughtHistory.length === 0) return false;
    return (
      currentThinking ===
      this.thoughtHistory[this.thoughtHistory.length - 1].currentThinking
    );
  }

  private async generateThoughtWithGemini(
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

      let userContextSection = "";
      if (args.userContext) {
        if (typeof args.userContext === "string") {
          userContextSection = `\n\n**User-Provided Context:**\n${args.userContext}\n\n`;
        } else if (args.userContext.type === "codeContext") {
          // Format structured code context
          userContextSection = formatCodeContext(args.userContext);
        }
      }

      // Simplified context info
      let intro =
        args.thoughtNumber === 1
          ? "This is the first thought in our analysis."
          : `This is Thought #${args.thoughtNumber} in our sequential analysis.`;

      if (args.isRevision) {
        intro += ` This revises Thought #${args.revisesThought}.`;
      } else if (args.branchFromThought) {
        intro += ` This branches from Thought #${args.branchFromThought}.`;
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

      // Build the prompt with all context - adding the userContextSection
      const prompt = `
**Your Role:** You are an AI assistant analyzing a complex problem through sequential thinking. This is Thought #${args.thoughtNumber} of ${args.totalThoughts}.

**Original Request:** ${this.originalQuery}${userContextSection}**Current Thinking:** ${args.currentThinking}

${intro}${previousThoughts}${externalToolInfo}${ending}

**Your Task for This Thought:**
Provide the next logical step in our reasoning process. Consider the user context (if provided), previous thoughts, and current thinking to advance our understanding.

${constraints}

Your response should be a cohesive thought that moves our analysis forward.
`;

      // Call Gemini API
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-pro-exp-03-25",
        contents: prompt,
      });

      return response.text ?? "Error: No response generated";
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

      // Generate the thought content using Gemini
      const generatedThought = await this.generateThoughtWithGemini(args);

      // Check if the thought suggests using another tool
      const toolRequest = detectToolRequest(generatedThought);

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
