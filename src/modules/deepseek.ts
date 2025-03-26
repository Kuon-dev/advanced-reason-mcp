import ollama from "ollama";
import { z } from "zod";
import type {
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

export const GetDeepseekThinkerSchema = z.object({
  originPrompt: z.string(),
});

// Deepseek reasoning agent implementation
export class DeepseekServer {
  async getOllamaCompletion(prompt: string): Promise<string> {
    let reasoningContent = "";
    try {
      const response = await ollama.generate({
        model: "openthinker",
        prompt: prompt,
        stream: true,
      });

      for await (const part of response) {
        reasoningContent = reasoningContent + part.response;

        // Look for complete think blocks
        const regex = /<|begin_of_thought|>([\s\S]*?)<|\/end_of_thought|>/i;
        const thinkContent = reasoningContent.match(regex)?.[1];

        if (thinkContent) {
          ollama.abort();
          return "Answer with given reasoning process: " + thinkContent;
        }
      }

      return "Answer with given reasoning process: " + reasoningContent;
    } catch (error) {
      return `Error: ${error}`;
    }
  }

  async processRequest(
    args: z.infer<typeof GetDeepseekThinkerSchema>,
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    try {
      const { originPrompt } = args;
      if (!originPrompt) {
        throw new Error("Please provide a prompt");
      }

      const result = await this.getOllamaCompletion(originPrompt);

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error processing request: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
}

// Tool definitions
export const DEEPSEEK_THINKER_TOOL: Tool = {
  name: "deepseek-reasoner",
  description:
    `
# Deepseek-Reasoner: Transparent Cognitive Process Simulator

A specialized reasoning tool that reveals its complete cognitive journey through technical problems. This tool simulates human-like problem-solving by exposing its full thought process, including false starts, hypothesis formation, self-correction, and solution verification.

## When to use this tool:
- Understanding complex technical concepts that benefit from step-by-step explanation
- Breaking down systems design problems (like database schemas, architecture planning)
- Learning problem-solving approaches you can apply to similar challenges
- Observing how an expert might think through ambiguous technical requirements
- Getting both a solution and the rationale behind design choices
- Seeing multiple considerations and trade-offs evaluated transparently

## Key features:
- Stream-of-consciousness thinking that shows work-in-progress reasoning
- Self-questioning approach that identifies potential weaknesses in its own logic
- Consideration of alternative designs or solutions
- Balance between technical correctness and practical implementation
- Progressive refinement of ideas as understanding develops
- Non-linear exploration that considers multiple aspects before finalizing
- Explicit uncertainty markers when confidence is lower
- Integration of both technical requirements and business logic concerns

## Output characteristics:
- Conversational rather than formally structured
- Shows interim thinking, not just polished conclusions
- Reveals assumption-making and validation processes
- Demonstrates expert-like reasoning patterns
- Provides both specific technical details and high-level design considerations

For optimal results, phrase questions as open-ended design or explanation challenges rather than requests for simple facts or pre-structured outputs.
`,
  inputSchema: {
    type: "object",
    properties: {
      originPrompt: {
        type: "string",
        description: "Problem or question for analysis",
      },
    },
    required: ["originPrompt"],
  },
};


