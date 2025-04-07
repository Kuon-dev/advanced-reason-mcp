import OpenAI from "openai";
import { z } from "zod";
import { formatCodeContext } from "../code/context";
import { ThoughtData, SequentialThinkingSchema, detectToolRequest } from "../sequential/utils";

export class OpenRouterSequentialThinkingServer {
  private openai: OpenAI;
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, number[]> = {};
  private originalQuery: string = "";
  private lastThoughtTimestamp: number | null = null;
  private model: string;

  constructor(
    apiKey: string = process.env.OPENROUTER_API_KEY ?? "",
    model: string = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-r1:free",
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

  // Add this new private method to the OpenRouterSequentialThinkingServer class
  private async getCompletionWithReasoning(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
        temperature: 1,
        max_tokens: 64000,
      });

      let reasoningContent = "";

      // Handle streaming response
      for await (const chunk of completion) {
        if (chunk.choices) {
          // Collect reasoning content from delta
          // @ts-ignore - DeepSeek-specific field
          if (chunk.choices[0]?.delta?.reasoning) {
            // @ts-ignore
            reasoningContent += chunk.choices[0].delta.reasoning;
          }
        }
      }

      // If we collected reasoning content, return it
      if (reasoningContent) {
        return reasoningContent;
      }

      // Fallback in case streaming didn't work as expected
      return "Error: No reasoning content generated";
    } catch (error) {
      return `Error generating thought: ${error}`;
    }
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
      const systemPrompt = `You are an AI assistant providing constructive criticism through sequential thinking. 
Your task is to evaluate the subject matter and offer balanced feedback with specific, actionable suggestions.
You should identify both strengths and areas for improvement while maintaining a supportive, solution-oriented approach.`;

      const userPrompt = `
**Sequential Constructive Criticism - Thought #${args.thoughtNumber} of ${args.totalThoughts}**

**Original Request:** ${this.originalQuery}${userContextSection}**Current Thinking:** ${args.currentThinking}

${intro}${previousThoughts}${externalToolInfo}${ending}

**Your Task for This Thought:**
Provide constructive criticism for this ${args.thoughtNumber == 1 ? "initial" : "next"} stage. Follow these steps:

1. **Demonstrate Understanding:** Briefly summarize your understanding of the key elements presented.
2. **Identify Strengths:** Point out specific positive aspects of the subject matter.
3. **Identify Areas for Improvement:** Highlight specific elements that could be enhanced or refined.
4. **Provide Actionable Suggestions:** For each area of improvement, offer concrete, practical recommendations.
5. **Maintain Balance:** Ensure your critique is balanced, focusing on the work itself and maintaining a supportive tone.

Consider the user context (if provided), previous thoughts, and current thinking to provide valuable feedback.

${constraints ? constraints : "Ensure all feedback is specific, actionable, and presented with a constructive tone."}

Your response should be a cohesive critique that helps improve and refine the subject matter.
`;

      // Call OpenRouter API
      return await this.getCompletionWithReasoning(systemPrompt, userPrompt);
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
