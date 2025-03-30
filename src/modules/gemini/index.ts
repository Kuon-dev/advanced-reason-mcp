import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const GetGeminiThinkerSchema = z.object({
  originPrompt: z
    .string()
    .describe("The user's request that requires reasoning analysis"),
  mode: z
    .enum([
      "reasoning_partner",
      "generate_perspectives",
      "brainstorm_options",
      "analyze_pros_cons",
      "compare_contrast",
      "simulate_debate",
    ])
    .default("reasoning_partner")
    .describe("The thinking mode to use"),
  output_count: z
    .number()
    .optional()
    .default(3)
    .describe("Number of distinct perspectives or options to generate"),
  constraints: z
    .string()
    .optional()
    .describe(
      "Specific requirements or focus areas to guide the thinking process",
    ),
});

// Gemini reasoning agent implementation
export class GeminiServer {
  private ai: GoogleGenAI;

  constructor(apiKey: string = process.env.GEMINI_API_KEY ?? "") {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async getGeminiCompletion(
    args: z.infer<typeof GetGeminiThinkerSchema>,
  ): Promise<string> {
    const { originPrompt, mode, constraints } = args;
    let reasoningContent = "";

    try {
      // Format the prompt based on selected mode
      let formattedPrompt = "";

      if (mode === "reasoning_partner") {
        formattedPrompt = `
**Your Role:** You are an AI assistant acting as a "Secondary Brain" or Reasoning Partner. Your primary function is **not** to provide a final, polished answer to the user's request, but to **demonstrate and articulate your step-by-step thought process** for how you would *approach* fulfilling that request.

**User's Input:** ${originPrompt}

**Your Task: Reveal Your Reasoning Process**
Based on the **User's Input** above, provide a detailed breakdown of your thought process. This breakdown should illuminate *how* you would go about tackling the user's request if you were to generate a full response. Your output **is** this reasoning process. Focus on elements like:

1. **Deconstructing the Request:**
   * How do you interpret the core objective(s) of the user's input?
   * What are the key terms, concepts, constraints, or desired outcomes you identify?
   * Who is the likely implied audience, and how does that influence your thinking?

2. **Initial Approach & Strategy:**
   * What is your high-level plan or strategy to address the request?
   * What major knowledge domains or types of information are relevant?

3. **Structuring the Thinking/Potential Output:**
   * What logical steps or sections would you use to organize your thinking?
   * Why choose this particular structure?

4. **Identifying Key Points/Information Needed:**
   * What specific questions would you need to answer internally?
   * What specific pieces of information would be crucial to include?
   * How would you ensure balance, accuracy, or comprehensiveness?

5. **Considering Nuances & Potential Challenges:**
   * Are there ambiguities in the request that need clarification?
   * Are there common misconceptions or complexities to be mindful of?
   * What alternative approaches did you consider?

6. **Refinement & Formatting Thoughts:**
   * How would formatting enhance the clarity of a potential final output?

${constraints ? `Additional constraints: ${constraints}` : ""}
`;
      } else {
        // Maintain your original modes
        formattedPrompt = `Analyze this prompt in ${mode} mode with ${args.output_count} perspectives: ${originPrompt}`;
        if (constraints) {
          formattedPrompt += `\nAdditional constraints: ${constraints}`;
        }
      }

      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-pro-exp-03-25",
        contents: formattedPrompt,
      });

      // Get the text response
      reasoningContent = response.text ?? "";

      // If there's no content, return an error
      if (!reasoningContent) {
        return "Error: No response from Gemini";
      }

      return reasoningContent;
    } catch (error) {
      return `Error: ${error}`;
    }
  }

  async processRequest(args: z.infer<typeof GetGeminiThinkerSchema>): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    try {
      const { originPrompt } = args;
      if (!originPrompt) {
        throw new Error("Please provide a prompt");
      }
      const result = await this.getGeminiCompletion(args);
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

// Tool definition
export const GEMINI_THINKER_TOOL: Tool = {
  name: "gemini-thinker",
  description:
    "A cognitive exploration tool that leverages Gemini's reasoning capabilities to analyze problems from multiple perspectives and generate structured thinking outputs. This tool is particularly valuable for complex reasoning tasks, comparing viewpoints, or performing structured analysis that reveals step-by-step thought processes.",
  inputSchema: {
    type: "object",
    properties: {
      originPrompt: {
        type: "string",
        description:
          "The user's original prompt or question that requires deep analysis. For best results, pass the complete prompt context without modification.",
      },
      mode: {
        type: "string",
        enum: [
          "reasoning_partner",
          "generate_perspectives",
          "brainstorm_options",
          "analyze_pros_cons",
          "compare_contrast",
          "simulate_debate",
        ],
        description:
          "Optional mode specifying the type of thinking desired. Use 'reasoning_partner' for detailed step-by-step thought processes.",
        default: "reasoning_partner",
      },
      output_count: {
        type: "integer",
        description:
          "Optional number of distinct perspectives or options to generate. Defaults to 3.",
        default: 3,
      },
      constraints: {
        type: "string",
        description:
          "Optional specific requirements or focus areas to guide the thinking process.",
      },
    },
    required: ["originPrompt"],
  },
};
