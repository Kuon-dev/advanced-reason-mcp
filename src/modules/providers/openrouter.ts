// openrouter-sequential-thinking.ts

import OpenAI from "openai";
import { z } from "zod";
import { formatCodeContext } from "../code/context";
import { ThoughtData, SequentialThinkingSchema, detectToolRequest } from "../sequential/utils";
import {
  API_CONFIG,
  RATE_LIMIT,
  SYSTEM_PROMPTS,
  USER_PROMPT_SECTIONS,
  ERROR_MESSAGES,
  RESPONSE_HINTS,
  STATUS,
  isValidReasoningMode,
  ReasoningMode
} from './constants';

export class OpenRouterSequentialThinkingServer {
  private openai: OpenAI;
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, number[]> = {};
  private originalQuery: string = "";
  private lastThoughtTimestamp: number | null = null;
  private model: string;

  constructor(
    apiKey: string = process.env.OPENROUTER_API_KEY ?? "",
    model: string = process.env.OPENROUTER_MODEL ?? API_CONFIG.DEFAULT_MODEL,
  ) {
    this.openai = new OpenAI({
      baseURL: API_CONFIG.BASE_URL,
      apiKey: apiKey,
    });
    this.model = model;
  }

  private isThinkingTooSimilar(currentThinking: string): boolean {
    if (this.thoughtHistory.length === 0) return false;
    return (
      currentThinking ===
      this.thoughtHistory[this.thoughtHistory.length - 1].currentThinking
    );
  }

  /**
   * Generates a completion using the specified reasoning mode and user prompt.
   * @param reasoningMode - The reasoning mode to use for response generation.
   *                       Valid options (case insensitive): "analytical", "creative", "critical", "reflective"
   * @param userPrompt - The user's input prompt to process
   * @returns Promise<string> - The generated completion
   * @throws {Error} If mode is invalid or if API request fails
   * @example
   * // Case insensitive mode
   * getCompletionWithReasoning("CrEaTiVe", "My prompt")  // Valid
   * getCompletionWithReasoning(undefined, "My prompt")    // Uses 'analytical' mode
   * getCompletionWithReasoning("invalid", "My prompt")    // Throws Error
   */
  private async getCompletionWithReasoning(
    reasoningMode: ReasoningMode | undefined,
    userPrompt: string
  ): Promise<string> {
    try {
      // Normalize and validate input
      const inputMode = reasoningMode?.toLowerCase();
      const mode = inputMode || 'analytical';
      
      if (!isValidReasoningMode(mode)) {
        throw new Error(ERROR_MESSAGES.INVALID_REASONING_MODE(mode));
      }

      const systemPrompt = SYSTEM_PROMPTS[mode as ReasoningMode];

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
        temperature: API_CONFIG.DEFAULT_TEMPERATURE,
        max_tokens: API_CONFIG.MAX_TOKENS,
      });
      
      let reasoningContent = '';
      let finalContent = '';
      
      for await (const chunk of completion) {
        if (chunk.choices) {
          // @ts-ignore - DeepSeek-specific field
          if (chunk.choices[0]?.delta?.reasoning) {
            // @ts-ignore
            reasoningContent += chunk.choices[0].delta.reasoning;
          }
          
          if (chunk.choices[0]?.delta?.content) {
            finalContent += chunk.choices[0].delta.content;
          }
        }
      }
      
      const combinedOutput = reasoningContent + 
        (finalContent ? `\n\n=== CONTENT ===\n${finalContent}` : '');
      
      if (combinedOutput.trim().length > 0) {
        return combinedOutput;
      }
      
      throw new Error(ERROR_MESSAGES.NO_CONTENT);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(ERROR_MESSAGES.GENERATE_THOUGHT(String(error)));
    }
  }

  public async processSequentialThinking(
    args: z.infer<typeof SequentialThinkingSchema>,
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    try {
      if (this.isThinkingTooSimilar(args.currentThinking)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: ERROR_MESSAGES.SIMILAR_THINKING,
                  status: STATUS.FAILED,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      if (this.lastThoughtTimestamp) {
        const timeSinceLastThought = Date.now() - this.lastThoughtTimestamp;
        if (timeSinceLastThought < RATE_LIMIT.MIN_THINKING_TIME_MS) {
          await new Promise((resolve) =>
            setTimeout(resolve, RATE_LIMIT.MIN_THINKING_TIME_MS - timeSinceLastThought),
          );
        }
      }

      const generatedThought = await this.getCompletionWithReasoning(
        args.reasoningMode as ReasoningMode,
        this.buildUserPrompt(args)
      );
      
      const toolRequest = detectToolRequest(generatedThought);

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
        userContext: args.userContext,
        suggestedToolUse: toolRequest
          ? {
              toolType: toolRequest.toolType,
              query: toolRequest.query,
            }
          : undefined,
      };

      this.thoughtHistory.push(thoughtData);
      this.lastThoughtTimestamp = Date.now();

      if (args.branchFromThought && args.branchId) {
        if (!this.branches[args.branchId]) {
          this.branches[args.branchId] = [];
        }
        this.branches[args.branchId].push(args.thoughtNumber);
      }

      const response = {
        thought: generatedThought,
        thoughtNumber: args.thoughtNumber,
        totalThoughts: args.totalThoughts,
        nextThoughtNeeded: args.nextThoughtNeeded,
        suggestedToolUse: toolRequest
          ? {
              toolType: toolRequest.toolType,
              query: toolRequest.query,
              message: RESPONSE_HINTS.USE_TOOL(toolRequest.toolType, toolRequest.query),
            }
          : undefined,
        hint: toolRequest
          ? "Consider using the suggested tool before continuing with sequential thinking"
          : RESPONSE_HINTS.NEXT_THOUGHT,
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
            text: ERROR_MESSAGES.GENERATE_THOUGHT(String(error)),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Builds the user prompt by combining various sections based on the provided arguments
   * @param args - The sequential thinking arguments
   * @returns The formatted user prompt string
   */
  private buildUserPrompt(args: z.infer<typeof SequentialThinkingSchema>): string {
    if (args.thoughtNumber === 1 || this.originalQuery === "") {
      this.originalQuery = args.currentThinking;
    }

    let previousThoughts = "";
    if (args.thoughtNumber > 1) {
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
        userContextSection = USER_PROMPT_SECTIONS.USER_CONTEXT(args.userContext);
      } else if (args.userContext.type === "codeContext") {
        userContextSection = formatCodeContext(args.userContext);
      }
    }

    let intro = args.thoughtNumber === 1 
      ? STATUS.FIRST_THOUGHT
      : STATUS.THOUGHT_NUMBER(args.thoughtNumber);

    if (args.isRevision) {
      intro += STATUS.REVISION(args.revisesThought!);
    }

    const isLastThought = args.thoughtNumber >= args.totalThoughts;
    const ending = isLastThought ? STATUS.FINAL_THOUGHT : "";

    const constraints = args.reasoningMode
      ? `Apply ${args.reasoningMode} reasoning to this thought.`
      : "";

    let externalToolInfo = "";
    if (args.externalToolResult) {
      externalToolInfo = USER_PROMPT_SECTIONS.EXTERNAL_TOOL_RESULTS(
        args.externalToolResult.toolType,
        args.externalToolResult.query,
        args.externalToolResult.result
      );
    }

    return `
${USER_PROMPT_SECTIONS.HEADER(args.thoughtNumber, args.totalThoughts)}

${USER_PROMPT_SECTIONS.ORIGINAL_REQUEST(this.originalQuery)}${userContextSection}${USER_PROMPT_SECTIONS.CURRENT_THINKING(args.currentThinking)}

${intro}${previousThoughts}${externalToolInfo}${ending}

${USER_PROMPT_SECTIONS.TASK_INSTRUCTIONS(args.thoughtNumber)}

Consider the user context (if provided), previous thoughts, and current thinking to provide valuable feedback.

${constraints ? constraints : "Ensure all feedback is specific, actionable, and presented with a constructive tone."}

Your response should be a cohesive critique that helps improve and refine the subject matter.
`;
  }
}
