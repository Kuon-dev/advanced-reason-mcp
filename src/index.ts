#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  CombinedSequentialThinkingSchema,
  CombinedSequentialThinkingServer,
  GEMINI_DEEPSEEK_SEQUENTIAL_TOOL,
} from "./modules/sequential/index";

// Initialize servers
const combinedServer = new CombinedSequentialThinkingServer();

// Create MCP server
const server = new Server(
  {
    name: "advanced-reflection-reasoning-server",
    version: "0.1.1",
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
