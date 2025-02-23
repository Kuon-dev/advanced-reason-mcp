#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import ollama from 'ollama';

// Schema definitions
const GetDeepseekThinkerSchema = z.object({
  originPrompt: z.string(),
});

const ReflectionSchema = z.object({
  content: z.string(),
  qualityScore: z.number().min(0).max(1).optional(),
  reflection: z.string().optional(),
});

const SequentialThinkingSchema = z.object({
  thought: z.string(),
  thoughtNumber: z.number().int().positive(),
  totalThoughts: z.number().int().positive(),
  nextThoughtNeeded: z.boolean(),
  isRevision: z.boolean().optional(),
  revisesThought: z.number().int().positive().optional(),
  branchFromThought: z.number().int().positive().optional(),
  branchId: z.string().optional(),
  needsMoreThoughts: z.boolean().optional()
});

// Deepseek reasoning agent implementation
class DeepseekServer {
  async getOllamaCompletion(prompt: string): Promise<string> {
    let reasoningContent = '';
    try {
      const response = await ollama.generate({
        model: 'deepseek-r1',
        prompt: prompt,
        stream: true,
      });

      for await (const part of response) {
        reasoningContent = reasoningContent + part.response;
        
        // Look for complete think blocks
        const regex = /<think>([\s\S]*?)<\/think>/i;
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

  async processRequest(args: z.infer<typeof GetDeepseekThinkerSchema>): Promise<{
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
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error processing request: ${error}`
        }],
        isError: true
      };
    }
  }
}

// Tool definitions
const DEEPSEEK_THINKER_TOOL: Tool = {
  name: "deepseek-reasoner",
  description: "Advanced AI reasoning agent that specializes in deep analytical thinking and complex problem decomposition. Uses the deepseek-r1 model to provide structured analysis and insights that can feed into reflection and sequential thinking processes.",
  inputSchema: {
    type: "object",
    properties: {
      originPrompt: {
        type: "string",
        description: "Problem or question for analysis",
      },
    },
    required: ["originPrompt"],
  }
};

const REFLECTION_TOOL: Tool = {
  name: "reflection",
  description: `
Reflective thinking tool that evaluates reasoning processes and solutions.

Key features:
- Evaluates progress through reflections
- Uses quality scoring (0.0-1.0) to guide approach
- Adjusts strategy based on reward scores:
  * 0.8+ : Continue current approach
  * 0.5-0.7: Consider minor adjustments
  * Below 0.5: Consider alternative approach

Process:
1. Analyze current understanding
2. Evaluate effectiveness using <reflection> tags
3. Assign quality scores with <reward> tags
4. Adjust approach based on scores
5. Continue until satisfactory solution found

Tool provides structure for:
- Critical evaluation of approaches
- Quality-based decision making
- Strategy adjustment
- Solution synthesis
`,
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "Content to reflect upon"
      },
      qualityScore: {
        type: "number",
        description: "Quality score between 0.0 and 1.0"
      },
      reflection: {
        type: "string",
        description: `
Reflective thinking tool that evaluates reasoning processes and solutions.

Begin by enclosing all thoughts with sequential thinking for this particular process to identify and explore and analyze the given problem

Break down the solution into clear steps within <step> tags. Start with a 20-step budget, requesting more for complex problems if needed.

Use a specific <count> tag after each step to show the remaining budget. Stop when reaching 0.

Continuously adjust your reasoning based on intermediate results and reflections, adapting your strategy as you progress.

Regularly evaluate progress using <reflection> tags. Be critical and honest about your reasoning process.

Assign a quality score between 0.0 and 1.0 using <reward> tags after each reflection. Use this to guide your approach:

0.8+: Continue current approach
0.5-0.7: Consider minor adjustments
Below 0.5: Seriously consider backtracking and trying a different approach

If unsure or if reward score is low, backtrack and try a different approach, explaining your decision within <thinking> tags.

For mathematical problems, show all work explicitly using LaTeX for formal notation and provide detailed proofs.

Explore multiple solutions individually if possible, comparing approaches in reflections.

Use thoughts as a scratchpad, writing out all calculations and reasoning explicitly.

Synthesize the final answer within <answer> tags, providing a clear, concise summary.

Conclude with a final reflection on the overall solution, discussing effectiveness, challenges, and solutions. Assign a final reward score
`
      }
    },
    required: ["content"]
  }
};

const SEQUENTIAL_THINKING_TOOL: Tool = {
  name: "sequentialthinking",
  description: `
A detailed tool for dynamic and reflective problem-solving through thoughts. This tool helps analyze problems through a flexible thinking process that can adapt and evolve. Each thought can build on, question, or revise previous insights as understanding deepens. When to use this tool:
- Breaking down complex problems into steps 
- Planning and design with room for revision 
- Analysis that might need course correction 
- Problems where the full scope might not be clear initially 
- Problems that require a multi-step solution 
- Tasks that need to maintain context over multiple steps 
- Situations where irrelevant information needs to be filtered out Key features: 
- You can adjust total_thoughts up or down as you progress 
- You can question or revise previous thoughts 
- You can add more thoughts even after reaching what seemed like the end 
- You can express uncertainty and explore alternative approaches 
- Not every thought needs to build linearly 
- you can branch or backtrack 
- Generates a solution hypothesis 
- Verifies the hypothesis based on the Chain of Thought steps 
- Repeats the process until satisfied 
- Provides a correct answer Parameters explained: 
- thought: Your current thinking step, which can include: * Regular analytical steps * Revisions of previous thoughts * Questions about previous decisions * Realizations about needing more analysis * Changes in approach * Hypothesis generation * Hypothesis verification - next_thought_needed: True if you need more thinking, even if at what seemed like the end - thought_number: Current number in sequence (can go beyond initial total if needed) - total_thoughts: Current estimate of thoughts needed (can be adjusted up/down) - is_revision: A boolean indicating if this thought revises previous thinking - revises_thought: If is_revision is true, which thought number is being reconsidered - branch_from_thought: If branching, which thought number is the branching point - branch_id: Identifier for the current branch (if any) - needs_more_thoughts: If reaching end but realizing more thoughts needed You should: 1. Start with an initial estimate of needed thoughts, but be ready to adjust 2. Feel free to question or revise previous thoughts 3. Don't hesitate to add more thoughts if needed, even at the "end" 4. Express uncertainty when present 5. Mark thoughts that revise previous thinking or branch into new paths 6. Ignore information that is irrelevant to the current step 7. Generate a solution hypothesis when appropriate 8. Verify the hypothesis based on the Chain of Thought steps 9. Repeat the process until satisfied with the solution 10. Provide a single, ideally correct answer as the final output 11. Only set next_thought_needed to false when truly done and a satisfactory answer is reached
`,
  inputSchema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Current thinking step"
      },
      thoughtNumber: {
        type: "integer",
        description: "Current thought number"
      },
      totalThoughts: {
        type: "integer",
        description: "Total thoughts needed"
      },
      nextThoughtNeeded: {
        type: "boolean",
        description: "Whether another thought is needed"
      }
    },
    required: ["thought", "thoughtNumber", "totalThoughts", "nextThoughtNeeded"]
  }
};

// Reflection Server Implementation
interface ReflectionData {
  content: string;
  qualityScore?: number;
  reflection?: string;
  timestamp: number;
}

class ReflectionServer {
  private reflectionHistory: ReflectionData[] = [];
  private readonly backtrackThreshold = 0.5;

  private extractTags(content: string): { 
    reflections: string[],
    rewards: number[] 
  } {
    const reflections: string[] = [];
    const rewards: number[] = [];

    // Extract reflection tags
    const reflectionRegex = /<reflection>([\s\S]*?)<\/reflection>/g;
    let match: RegExpExecArray | null;
    
    while ((match = reflectionRegex.exec(content)) !== null) {
      reflections.push(match[1].trim());
    }

    // Extract reward tags
    const rewardRegex = /<reward>(0\.\d+|1\.0)<\/reward>/g;
    while ((match = rewardRegex.exec(content)) !== null) {
      rewards.push(parseFloat(match[1]));
    }

    return { reflections, rewards };
  }

  private calculateAverageScore(scores: number[]): number {
    if (scores.length === 0) return 0;
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  public processReflection(args: z.infer<typeof ReflectionSchema>): {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  } {
    try {
      const reflectionData: ReflectionData = {
        ...args,
        timestamp: Date.now()
      };

      const { reflections, rewards } = this.extractTags(args.content);
      const averageScore = this.calculateAverageScore(rewards);
      const needsAdjustment = averageScore < this.backtrackThreshold;

      // Build formatted response
      const response = {
        extractedContent: {
          reflections: reflections,
          rewardScores: rewards
        },
        analysis: {
          averageScore: averageScore,
          needsAdjustment: needsAdjustment,
          reflectionCount: reflections.length,
          scoreCount: rewards.length
        },
        metadata: {
          timestamp: reflectionData.timestamp,
          totalReflections: this.reflectionHistory.length + 1
        }
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(response, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error processing reflection: ${error}`
        }],
        isError: true
      };
    }
  }
}

// Sequential Thinking Server Implementation
interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
}

class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};

  private validateAndProcessThought(input: unknown): ThoughtData {
    const data = input as Record<string, unknown>;

    if (!data.thought || typeof data.thought !== 'string') {
      throw new Error('Invalid thought: must be a string');
    }
    if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
      throw new Error('Invalid thoughtNumber: must be a number');
    }
    if (!data.totalThoughts || typeof data.totalThoughts !== 'number') {
      throw new Error('Invalid totalThoughts: must be a number');
    }
    if (typeof data.nextThoughtNeeded !== 'boolean') {
      throw new Error('Invalid nextThoughtNeeded: must be a boolean');
    }

    return {
      thought: data.thought,
      thoughtNumber: data.thoughtNumber,
      totalThoughts: data.totalThoughts,
      nextThoughtNeeded: data.nextThoughtNeeded,
      isRevision: data.isRevision as boolean | undefined,
      revisesThought: data.revisesThought as number | undefined,
      branchFromThought: data.branchFromThought as number | undefined,
      branchId: data.branchId as string | undefined,
      needsMoreThoughts: data.needsMoreThoughts as boolean | undefined,
    };
  }

  public processThought(input: unknown): {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  } {
    try {
      const thoughtData = this.validateAndProcessThought(input);

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

      // Prepare response
      const response = {
        thoughtNumber: thoughtData.thoughtNumber,
        totalThoughts: thoughtData.totalThoughts,
        nextThoughtNeeded: thoughtData.nextThoughtNeeded,
        branches: Object.keys(this.branches),
        thoughtHistoryLength: this.thoughtHistory.length,
        branchCount: Object.keys(this.branches).length
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error processing thought: ${error}`
        }],
        isError: true
      };
    }
  }
}

// Initialize servers
const deepseekServer = new DeepseekServer();
const reflectionServer = new ReflectionServer();
const sequentialServer = new SequentialThinkingServer();

// Create MCP server
const server = new Server(
  {
    name: "advanced-reflection-reasoning-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    DEEPSEEK_THINKER_TOOL,
    REFLECTION_TOOL,
    SEQUENTIAL_THINKING_TOOL
  ],
}));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "deepseek-reasoner":
        const deepseekArgs = GetDeepseekThinkerSchema.parse(args);
        return await deepseekServer.processRequest(deepseekArgs);

      case "reflection":
        const reflectionArgs = ReflectionSchema.parse(args);
        return reflectionServer.processReflection(reflectionArgs);

      case "sequentialthinking":
        const sequentialArgs = SequentialThinkingSchema.parse(args);
        return sequentialServer.processThought(sequentialArgs);

      default:
        return {
          content: [{
            type: "text",
            text: `Unknown tool: ${name}`
          }],
          isError: true
        };
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: error instanceof z.ZodError
          ? `Invalid arguments: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          : `Error processing request: ${error}`
      }],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Thinking & Reasoning MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
