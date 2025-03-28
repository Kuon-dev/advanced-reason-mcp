# DeepSeek Reasoner MCP

A tool for advanced reasoning and reflection using the Gemini API.

## Requirements

- Node.js 20.17 or higher
- Gemini API key

## Installation

1. Clone the repository:
```bash
git clone git@github.com:Kuon-dev/advanced-reason-mcp.git
cd advanced-reason-mcp
```

2. Install dependencies
```bash
npm install
```

## Building

Build the project using:

```bash
node ./bin/build.mjs
```

This will create the necessary files in the `dist` directory.

## Configuration

The tool can be configured through the `claude_desktop_config.json` settings in your project configuration:

```json
{
  "advanced-reflection-reason": {
    "command": "node",
    "args": [
      "/path/to/your/advanced-reason-mcp/dist/index.js"
    ],
    "env": {
      "GEMINI_API_KEY": "your-api-key-here"
    }
  }
}
```

## License

This project is MIT licensed.

You can create your own project and modifying it freely without notifying me
