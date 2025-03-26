import { z } from "zod";
import type {
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
// Schema definitions
export const ReflectionSchema = z.object({
  content: z.string(),
  qualityScore: z.number().min(0).max(1).optional(),
  reflection: z.string().optional(),
});

export const REFLECTION_TOOL: Tool = {
  name: "reflection",
  description: `
    Must be used after each sequential thinking step. Begin by enclosing all thoughts with sequential thinking for this particular process to identify and explore and analyze the given problem
    Break down the solution into clear steps within <step> tags. Start with a 20-step budget, requesting more for complex problems if needed.
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
  `,
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "Content to reflect upon. Continuously adjust your reasoning based on intermediate results and reflections, adapting your strategy as you progress. Regularly evaluate progress using <reflection> tags. Be critical and honest about your reasoning process."
      },
      reflection: {
        type: "string",
        description:
          "The final reflection. Use the <reflection> tag to enclose the reflection.",
      },
      qualityScore: {
        type: "number",
        description: `Assign a quality score between 0.0 and 1.0 using <reward> tags after each reflection. Use this to guide your approach:
        0.8+: Continue current approach
        0.5-0.7: Consider minor adjustments
        Below 0.5: Seriously consider backtracking and trying a different approach
        `,
      },
      step: {
        type: "number",
        description: "Use a specific <count> tag after each step to show the remaining budget. Stop when reaching 0. Continuously adjust your reasoning based on intermediate results and reflections, adapting your strategy as you progress.",
      },
    },
    required: ["content"],
  },
};

// Reflection Server Implementation
export interface ReflectionData {
  content: string;
  qualityScore?: number;
  reflection?: string;
  timestamp: number;
}

export class ReflectionServer {
  private reflectionHistory: ReflectionData[] = [];
  private readonly backtrackThreshold = 0.5;

  private extractTags(content: string): {
    reflections: string[];
    rewards: number[];
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
        timestamp: Date.now(),
      };

      const { reflections, rewards } = this.extractTags(args.content);
      const averageScore = this.calculateAverageScore(rewards);
      const needsAdjustment = averageScore < this.backtrackThreshold;

      // Build formatted response
      const response = {
        extractedContent: {
          reflections: reflections,
          rewardScores: rewards,
        },
        analysis: {
          averageScore: averageScore,
          needsAdjustment: needsAdjustment,
          reflectionCount: reflections.length,
          scoreCount: rewards.length,
        },
        metadata: {
          timestamp: reflectionData.timestamp,
          totalReflections: this.reflectionHistory.length + 1,
        },
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
            text: `Error processing reflection: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
}

