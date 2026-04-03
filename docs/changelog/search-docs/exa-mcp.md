
> ## Documentation Index
> Fetch the complete documentation index at: https://exa.ai/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Exa MCP - The Web Search MCP

> Complete setup guide for Exa MCP Server. Connect Claude Desktop, Cursor, VS Code, and 10+ AI assistants to Exa's web search and code search tools.

Exa MCP connects AI assistants to Exa's search capabilities, including web search and code search. It is open-source and available on [GitHub](https://github.com/exa-labs/exa-mcp-server).

<br />

## Installation

<Tabs>
  <Tab title="Cursor">
    [![Install with one click](https://img.shields.io/badge/Install_with_one_click-Cursor-000000?style=flat-square\&logoColor=white)](https://cursor.com/en/install-mcp?name=exa\&config=eyJuYW1lIjoiZXhhIiwidHlwZSI6Imh0dHAiLCJ1cmwiOiJodHRwczovL21jcC5leGEuYWkvbWNwIn0=)

    Or add to `~/.cursor/mcp.json`:

    ```json  theme={null}
    {
      "mcpServers": {
        "exa": {
          "url": "https://mcp.exa.ai/mcp"
        }
      }
    }
    ```
  </Tab>

  <Tab title="VS Code">
    [![Install with one click](https://img.shields.io/badge/Install_with_one_click-VS_Code-0098FF?style=flat-square\&logo=visualstudiocode\&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=exa\&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.exa.ai%2Fmcp%22%7D)

    Or add to `.vscode/mcp.json`:

    ```json  theme={null}
    {
      "servers": {
        "exa": {
          "type": "http",
          "url": "https://mcp.exa.ai/mcp"
        }
      }
    }
    ```
  </Tab>

  <Tab title="Claude Code">
    Run in terminal:

    ```bash  theme={null}
    claude mcp add --transport http exa https://mcp.exa.ai/mcp
    ```
  </Tab>

  <Tab title="Claude Desktop">
    Add to your Claude Desktop config file:

    **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

    **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

    ```json  theme={null}
    {
      "mcpServers": {
        "exa": {
          "command": "npx",
          "args": ["-y", "mcp-remote", "https://mcp.exa.ai/mcp"]
        }
      }
    }
    ```
  </Tab>

  <Tab title="Codex">
    Run in terminal:

    ```bash  theme={null}
    codex mcp add exa --url https://mcp.exa.ai/mcp
    ```
  </Tab>

  <Tab title="OpenCode">
    Add to your `opencode.json`:

    ```json  theme={null}
    {
      "mcp": {
        "exa": {
          "type": "remote",
          "url": "https://mcp.exa.ai/mcp",
          "enabled": true
        }
      }
    }
    ```
  </Tab>

  <Tab title="Windsurf">
    Add to `~/.codeium/windsurf/mcp_config.json`:

    ```json  theme={null}
    {
      "mcpServers": {
        "exa": {
          "serverUrl": "https://mcp.exa.ai/mcp"
        }
      }
    }
    ```
  </Tab>

  <Tab title="Zed">
    Add to your Zed settings:

    ```json  theme={null}
    {
      "context_servers": {
        "exa": {
          "url": "https://mcp.exa.ai/mcp"
        }
      }
    }
    ```
  </Tab>

  <Tab title="Gemini CLI">
    Add to `~/.gemini/settings.json`:

    ```json  theme={null}
    {
      "mcpServers": {
        "exa": {
          "httpUrl": "https://mcp.exa.ai/mcp"
        }
      }
    }
    ```
  </Tab>

  <Tab title="Google Antigravity">
    Go to the three-dot menu in the Agent panel, navigate to **Manage MCP Servers**, then **View Raw config** and add:

    ```json  theme={null}
    {
      "mcpServers": {
        "exa": {
          "serverUrl": "https://mcp.exa.ai/mcp"
        }
      }
    }
    ```
  </Tab>

  <Tab title="v0 by Vercel">
    In v0, select **Prompt Tools** > **Add MCP** and enter:

    ```
    https://mcp.exa.ai/mcp
    ```
  </Tab>

  <Tab title="Warp">
    Go to **Settings** > **MCP Servers** > **Add MCP Server** and add:

    ```json  theme={null}
    {
      "exa": {
        "url": "https://mcp.exa.ai/mcp"
      }
    }
    ```
  </Tab>

  <Tab title="Kiro">
    Add to `~/.kiro/settings/mcp.json`:

    ```json  theme={null}
    {
      "mcpServers": {
        "exa": {
          "url": "https://mcp.exa.ai/mcp"
        }
      }
    }
    ```
  </Tab>

  <Tab title="Roo Code">
    Add to your Roo Code MCP config:

    ```json  theme={null}
    {
      "mcpServers": {
        "exa": {
          "type": "streamable-http",
          "url": "https://mcp.exa.ai/mcp"
        }
      }
    }
    ```
  </Tab>

  <Tab title="Via npm Package">
    Standard `mcpServers` format with the npm package. [Get your Exa API key](https://dashboard.exa.ai/api-keys).

    ```json  theme={null}
    {
      "mcpServers": {
        "exa": {
          "command": "npx",
          "args": ["-y", "exa-mcp-server"],
          "env": {
            "EXA_API_KEY": "your_api_key"
          }
        }
      }
    }
    ```
  </Tab>

  <Tab title="Other">
    For other MCP clients that support remote MCP:

    ```json  theme={null}
    {
      "mcpServers": {
        "exa": {
          "url": "https://mcp.exa.ai/mcp"
        }
      }
    }
    ```

    If your client doesn't support remote MCP servers directly:

    ```json  theme={null}
    {
      "mcpServers": {
        "exa": {
          "command": "npx",
          "args": ["-y", "mcp-remote", "https://mcp.exa.ai/mcp"]
        }
      }
    }
    ```
  </Tab>
</Tabs>

## Available Tools

**Enabled by default:**

| Tool                   | Description                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `web_search_exa`       | Search the web for any topic and get clean, ready-to-use content                                   |
| `get_code_context_exa` | Find code examples, documentation, and programming solutions from GitHub, Stack Overflow, and docs |
| `crawling_exa`         | Get the full content of a specific webpage from a known URL                                        |

**Optional** (enable via `tools` parameter):

| Tool                      | Description                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `web_search_advanced_exa` | Advanced web search with full control over filters, domains, dates, and content options |

Enable specific tools:

```
https://mcp.exa.ai/mcp?tools=get_code_context_exa,web_search_advanced_exa
```

Enable all tools:

```
https://mcp.exa.ai/mcp?exaApiKey=YOUR_KEY&tools=web_search_exa,web_search_advanced_exa,get_code_context_exa,crawling_exa
```

<br />

## API Key

Exa MCP has a generous free plan. To overcome free plan rate limits and enable production use, add your own API key:

```
https://mcp.exa.ai/mcp?exaApiKey=YOUR_EXA_KEY
```

[Get your Exa API key](https://dashboard.exa.ai/api-keys)

<br />

## Resources

* [**GitHub**](https://github.com/exa-labs/exa-mcp-server) - View Exa MCP source code
* [**npm**](https://www.npmjs.com/package/exa-mcp-server) - Install Exa MCP npm package

<Accordion title="Usage Examples" icon="magnifying-glass">
  **Web Search**

  ```
  Search for recent developments in AI agents and summarize the key trends.
  ```

  **Code Search**

  ```
  Find Python examples for implementing OAuth 2.0 authentication.
  ```
</Accordion>

<Accordion title="Troubleshooting" icon="wrench">
  **Rate limit error (429)**

  You've hit the free plan rate limit. Add your own API key to continue:

  ```
  https://mcp.exa.ai/mcp?exaApiKey=YOUR_EXA_KEY
  ```

  [Get your API key](https://dashboard.exa.ai/api-keys)

  **Tools not appearing**

  Restart your MCP client after updating the config file. Some clients require a full restart to detect new MCP servers.

  **Claude Desktop not connecting**

  Claude Desktop doesn't support remote MCP directly. Use the `mcp-remote` wrapper:

  ```json  theme={null}
  {
    "command": "npx",
    "args": ["-y", "mcp-remote", "https://mcp.exa.ai/mcp"]
  }
  ```

  **Config file not found**

  Common config locations:

  * Cursor: `~/.cursor/mcp.json`
  * VS Code: `.vscode/mcp.json` (in project root)
  * Claude Desktop (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`
  * Claude Desktop (Windows): `%APPDATA%\Claude\claude_desktop_config.json`
</Accordion>