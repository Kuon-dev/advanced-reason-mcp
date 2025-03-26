import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type {
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Define the schema for sequential thinking
export const SequentialThinkingSchema = z.object({
  query: z.string().describe("The original problem or question to analyze"),
  thoughtNumber: z.number().int().positive().describe("Current thought number"),
  totalThoughts: z.number().int().positive().describe("Total thoughts needed"),
  nextThoughtNeeded: z.boolean().describe("Whether another thought is needed"),
  isRevision: z.boolean().optional().describe("Whether this thought revises a previous one"),
  revisesThought: z.number().int().positive().optional().describe("Which thought is being revised"),
  branchFromThought: z.number().int().positive().optional().describe("Which thought is the branching point"),
  branchId: z.string().optional().describe("Identifier for the current branch"),
  needsMoreThoughts: z.boolean().optional().describe("If reaching end but realizing more thoughts needed"),
  reasoningMode: z.enum([
    "analytical", 
    "creative", 
    "critical",
    "reflective"
  ]).default("analytical").describe("The style of reasoning to apply")
});

// Interface for thought data
interface ThoughtData {
  thought: string;
  query: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  reasoningMode?: string;
}

export class GeminiSequentialThinkingServer {
  private ai: GoogleGenAI;
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  
  constructor(apiKey: string = process.env.GEMINI_API_KEY ?? '') {
    this.ai = new GoogleGenAI({ apiKey });
  }

  private async generateThoughtWithGemini(args: z.infer<typeof SequentialThinkingSchema>): Promise<string> {
    try {
      // Create a history representation that includes previous thoughts
      const historyContext = this.thoughtHistory
        .map(t => `Thought ${t.thoughtNumber}: ${t.thought}`)
        .join('\n\n');
      
      // Build the prompt for Gemini
      let prompt = '';
      
      if (this.thoughtHistory.length === 0) {
        // Initial thought
        prompt = `I'm using you as a reasoning engine to solve a problem through sequential thinking.
        
Problem to analyze: ${args.query}

This is Thought #1 of an estimated ${args.totalThoughts} thoughts.
Please provide a thoughtful initial analysis of this problem.
Apply ${args.reasoningMode || 'analytical'} reasoning to break down the key aspects of this problem.`;
      } else if (args.isRevision && args.revisesThought) {
        // Revision of a previous thought
        const thoughtToRevise = this.thoughtHistory.find(t => t.thoughtNumber === args.revisesThought);
        prompt = `I'm using you as a reasoning engine to solve a problem through sequential thinking.

Problem to analyze: ${args.query}

Previous thinking:
${historyContext}

This is Thought #${args.thoughtNumber} of an estimated ${args.totalThoughts} thoughts.
This thought should REVISE Thought #${args.revisesThought}: "${thoughtToRevise?.thought || 'Unknown thought'}"

Please reconsider the previous thinking and provide a revised perspective.
Apply ${args.reasoningMode || 'analytical'} reasoning in your revision.`;
      } else if (args.branchFromThought) {
        // Branching from a previous thought
        prompt = `I'm using you as a reasoning engine to solve a problem through sequential thinking.

Problem to analyze: ${args.query}

Previous thinking:
${historyContext}

This is Thought #${args.thoughtNumber} of an estimated ${args.totalThoughts} thoughts.
This thought should BRANCH from Thought #${args.branchFromThought} to explore an alternative direction.

Please explore a different angle or approach from the specified branching point.
Apply ${args.reasoningMode || 'analytical'} reasoning in this new branch of thinking.`;
      } else {
        // Regular next thought
        prompt = `I'm using you as a reasoning engine to solve a problem through sequential thinking.

Problem to analyze: ${args.query}

Previous thinking:
${historyContext}

This is Thought #${args.thoughtNumber} of an estimated ${args.totalThoughts} thoughts.
Please continue the reasoning process building on the previous thoughts.
Apply ${args.reasoningMode || 'analytical'} reasoning to advance our understanding of this problem.`;
      }
      
      // If it's potentially the final thought
      if (args.thoughtNumber >= args.totalThoughts - 1) {
        prompt += `\n\nAs this may be one of the final thoughts, consider whether a conclusion can be reached or if more thinking is needed.`;
      }

      // Call Gemini API
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-pro-exp-03-25",
        contents: prompt,
      });
      
      // Get the text response
      const thoughtContent = response.text ?? '';
      
      // If there's no content, return an error
      if (!thoughtContent) {
        return "Error: No response generated for this thought";
      }
      
      return thoughtContent;
    } catch (error) {
      return `Error generating thought: ${error}`;
    }
  }

  // Process the input and integrate with Gemini
  public async processSequentialThinking(
    args: z.infer<typeof SequentialThinkingSchema>,
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    try {
      // Generate the thought content using Gemini
      const generatedThought = await this.generateThoughtWithGemini(args);
      
      // Create the thought data object
      const thoughtData: ThoughtData = {
        thought: generatedThought,
        query: args.query,
        thoughtNumber: args.thoughtNumber,
        totalThoughts: args.totalThoughts,
        nextThoughtNeeded: args.nextThoughtNeeded,
        isRevision: args.isRevision,
        revisesThought: args.revisesThought,
        branchFromThought: args.branchFromThought,
        branchId: args.branchId,
        needsMoreThoughts: args.needsMoreThoughts,
        reasoningMode: args.reasoningMode,
      };
      
      // Adjust total thoughts if needed
      if (thoughtData.thoughtNumber > thoughtData.totalThoughts) {
        thoughtData.totalThoughts = thoughtData.thoughtNumber;
      }

      // Store thought data
      this.thoughtHistory.push(thoughtData);

      // Handle branching
      if (thoughtData.branchFromThought && thoughtData.branchId) {
        if (!this.branches[thoughtData.branchId]) {
          this.branches[thoughtData.branchId] = [];
        }
        this.branches[thoughtData.branchId].push(thoughtData);
      }

      // Analyze the generated thought to suggest if more thoughts are needed
      // This is a simple heuristic - Gemini might indicate in its response
      const suggestMoreThoughts = 
        generatedThought.includes("more analysis is needed") || 
        generatedThought.includes("further exploration") ||
        generatedThought.includes("requires additional thought");
      
      // Prepare response
      const response = {
        thought: generatedThought,
        thoughtNumber: thoughtData.thoughtNumber,
        totalThoughts: thoughtData.totalThoughts,
        nextThoughtNeeded: suggestMoreThoughts || args.nextThoughtNeeded,
        branches: Object.keys(this.branches),
        thoughtHistoryLength: this.thoughtHistory.length,
        branchCount: Object.keys(this.branches).length,
        suggestedReasoningMode: this.suggestNextReasoningMode(thoughtData.reasoningMode),
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
            text: `Error processing sequential thinking: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
  
  // Helper method to suggest different reasoning modes as the thinking progresses
  private suggestNextReasoningMode(currentMode?: string): string {
    const modes = ["analytical", "creative", "critical", "reflective"];
    const currentModeIndex = modes.indexOf(currentMode || "analytical");
    
    // Simply cycle through modes as thinking progresses
    // This is a simple approach; could be made more sophisticated
    const nextIndex = (currentModeIndex + 1) % modes.length;
    return modes[nextIndex];
  }
  
  // Get a summary of the thinking so far
  public getThinkingSummary(): string {
    if (this.thoughtHistory.length === 0) {
      return "No thoughts recorded yet.";
    }
    
    const summary = this.thoughtHistory.map(t => {
      let prefix = `Thought ${t.thoughtNumber}`;
      if (t.isRevision) prefix += ` (revises #${t.revisesThought})`;
      if (t.branchId) prefix += ` (branch ${t.branchId})`;
      return `${prefix}: ${t.thought.substring(0, 100)}...`;
    }).join('\n\n');
    
    return summary;
  }
}

// Tool definition
export const GEMINI_SEQUENTIAL_THINKING_TOOL: Tool = {
  name: "gemini_sequential_thinking",
  description: `
    A powerful tool for dynamic and reflective problem-solving through Gemini-powered sequential thinking. This tool helps analyze problems through a flexible thinking process that can adapt and evolve. Each thought is generated by Gemini and can build on, question, or revise previous insights as understanding deepens. When to use this tool:
    - Breaking down complex problems into steps 
    - Planning and design with room for revision 
    - Analysis that might need course correction 
    - Problems where the full scope might not be clear initially 
    - Problems that require a multi-step solution 
    - Tasks that need to maintain context over multiple steps 
    
    Key features: 
    - Gemini generates each thought based on previous thinking
    - You can adjust total_thoughts up or down as you progress 
    - Thoughts can be revised or branched into alternative directions
    - Multiple reasoning modes (analytical, creative, critical, reflective)
    - Automatically suggests when more thinking might be needed
    
    Usage workflow:
    1. Start with an initial query and estimated number of thoughts
    2. Each thought builds on previous thinking history
    3. Optionally revise previous thoughts or branch into new directions
    4. Continue until a satisfactory conclusion is reached
    `,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The original problem or question to analyze",
      },
      thoughtNumber: {
        type: "integer",
        description: "Current thought number",
      },
      totalThoughts: {
        type: "integer",
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
        description: "Which thought is being revised",
      },
      branchFromThought: {
        type: "integer",
        description: "Which thought is the branching point",
      },
      branchId: {
        type: "string",
        description: "Identifier for the current branch",
      },
      reasoningMode: {
        type: "string",
        enum: ["analytical", "creative", "critical", "reflective"],
        description: "The style of reasoning to apply",
        default: "analytical"
      }
    },
    required: [
      "query",
      "thoughtNumber",
      "totalThoughts",
      "nextThoughtNeeded",
    ],
  },
};
