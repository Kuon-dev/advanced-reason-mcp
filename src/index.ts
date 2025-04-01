#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  GeminiSequentialThinkingServer,
  GEMINI_SEQUENTIAL_THINKING_TOOL,
} from "./modules/sequential/gemini";
import {
  OpenRouterSequentialThinkingServer,
  OPENROUTER_SEQUENTIAL_THINKING_TOOL,
} from "./modules/sequential/openrouter";
import {
  CombinedSequentialThinkingSchema,
  CombinedSequentialThinkingServer,
  GEMINI_DEEPSEEK_SEQUENTIAL_TOOL,
} from "./modules/sequential/gemini-openrouter";
import { SequentialThinkingSchema } from "./modules/sequential/utils";

// Initialize servers
const geminiServer = new GeminiSequentialThinkingServer();
const openrouterServer = new OpenRouterSequentialThinkingServer();
const combinedServer = new CombinedSequentialThinkingServer();

// Create MCP server
const server = new Server(
  {
    name: "advanced-reflection-reasoning-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // GEMINI_SEQUENTIAL_THINKING_TOOL,
    // OPENROUTER_SEQUENTIAL_THINKING_TOOL,
    GEMINI_DEEPSEEK_SEQUENTIAL_TOOL,
    // GEMINI_THINKER_TOOL
  ],
}));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "combined-sequential-thinking":
        const combinedArgs = CombinedSequentialThinkingSchema.parse(args);
        return combinedServer.processSequentialThinking(combinedArgs);

      // case "openrouter-sequential-thinking":
      //   const deepseekSequentialArgs = SequentialThinkingSchema.parse(args);
      //   return openrouterServer.processSequentialThinking(
      //     deepseekSequentialArgs,
      //   );

      // case "gemini-sequential-thinking":
      //   const geminiSequentialArgs = SequentialThinkingSchema.parse(args);
      //   return geminiServer.processSequentialThinking(geminiSequentialArgs);

      // case "gemini-thinker":
      //   const geminiArgs = GetGeminiThinkerSchema.parse(args);
      //   return geminiServer.processRequest(geminiArgs);

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text:
            error instanceof z.ZodError
              ? `Invalid arguments: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`
              : `Error processing request: ${error}`,
        },
      ],
      isError: true,
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
