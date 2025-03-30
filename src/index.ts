#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GeminiServer, GEMINI_THINKER_TOOL, GetGeminiThinkerSchema } from "./modules/gemini/index";
// import { DEEPSEEK_THINKER_TOOL, DeepseekServer, GetDeepseekThinkerSchema } from "./modules/deepseek";
// import { ReflectionServer, REFLECTION_TOOL, ReflectionSchema } from "./modules/reflection";
import { GeminiSequentialThinkingServer, GEMINI_SEQUENTIAL_THINKING_TOOL, SequentialThinkingSchema } from "./modules/sequential";


// Initialize servers
// const deepseekServer = new DeepseekServer();
// const reflectionServer = new ReflectionServer();
const sequentialServer = new GeminiSequentialThinkingServer();
const geminiServer = new GeminiServer();

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
  },
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // DEEPSEEK_THINKER_TOOL,
    // REFLECTION_TOOL,
    GEMINI_SEQUENTIAL_THINKING_TOOL,
    GEMINI_THINKER_TOOL
  ],
}));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // case "deepseek-reasoner":
      //   const deepseekArgs = GetDeepseekThinkerSchema.parse(args);
      //   return await deepseekServer.processRequest(deepseekArgs);
      //
      // case "reflection":
      //   const reflectionArgs = ReflectionSchema.parse(args);
      //   return reflectionServer.processReflection(reflectionArgs);
      //
      case "gemini-sequential-thinking":
        const sequentialArgs = SequentialThinkingSchema.parse(args);
        return sequentialServer.processSequentialThinking(sequentialArgs);

      case "gemini-thinker":
        const geminiArgs = GetGeminiThinkerSchema.parse(args);
        return geminiServer.processRequest(geminiArgs);

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
