# Advanced Reason MCP

A tool for advanced reasoning and reflection using the Gemini API.

![Usage](https://pub-41a509da80f94e838106bc730f8b3dbf.r2.dev/ee1c4d760bcc2fbcea3aca6ac2e42c2b88611e83cfe91d8e84eca803d12fcbb5.png)

## Requirements

- Node.js 20.17 or higher
- Gemini API key
- Open Router API key

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
    "args": ["/path/to/your/advanced-reason-mcp/dist/index.js"],
    "env": {
      "GEMINI_API_KEY": "your-api-key-here",
      "OPENROUTER_API_KEY": "your-api-key-here",
      "OPENROUTER_MODEL": "your-selected-model-here"
    }
  }
}
```

`OPENROUTER_MODEL` env variable is optional. Defaults to `deepseek/deepseek-r1:free` if left empty.

## Limitations

- AI models does not have access to your project context, do be aware
- If the task is too complex, it is possible for the content to get really long, in which the MCP will timeout and return no response

## License

This project is MIT licensed.

You can create your own project and modifying it freely without notifying me
