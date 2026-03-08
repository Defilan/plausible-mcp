# plausible-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for [Plausible Analytics](https://plausible.io). Query your website stats directly from AI assistants like Claude.

## Features

- **Aggregate stats** — visitors, pageviews, bounce rate, visit duration
- **Time series** — traffic trends by day, week, or month
- **Breakdowns** — top pages, traffic sources, countries, devices, browsers, and more
- **Real-time visitors** — current visitor count
- **Site listing** — discover all your Plausible sites
- **Raw query** — full access to the Plausible Stats API v2 for advanced use cases

Works with both [Plausible Cloud](https://plausible.io) and self-hosted instances.

## Setup

### 1. Get a Plausible API key

Go to your [Plausible account settings](https://plausible.io/settings) and create an API key.

### 2. Configure your MCP client

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "plausible": {
      "command": "npx",
      "args": ["-y", "plausible-mcp"],
      "env": {
        "PLAUSIBLE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

#### Claude Code

```bash
claude mcp add plausible -- npx -y plausible-mcp
```

Then set the environment variable `PLAUSIBLE_API_KEY` in your shell.

#### Self-hosted Plausible

Add `PLAUSIBLE_BASE_URL` to point to your instance:

```json
{
  "env": {
    "PLAUSIBLE_API_KEY": "your-api-key-here",
    "PLAUSIBLE_BASE_URL": "https://plausible.example.com"
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `list-sites` | List all sites in your Plausible account |
| `get-current-visitors` | Real-time visitor count for a site |
| `get-aggregate-stats` | Summary metrics over a time period |
| `get-timeseries` | Traffic trends over time (by day/week/month) |
| `get-breakdown` | Break down stats by dimension (pages, sources, countries, etc.) |
| `query` | Raw Plausible Stats API v2 query for advanced use cases |

## Example prompts

- "How many visitors did example.com get this month?"
- "Show me traffic trends for the last 30 days"
- "What are my top 10 pages?"
- "Where is my traffic coming from?"
- "Compare this month's visitors to last month"
- "How many people are on my site right now?"

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PLAUSIBLE_API_KEY` | Yes | — | Your Plausible API key |
| `PLAUSIBLE_BASE_URL` | No | `https://plausible.io` | Base URL for self-hosted instances |

## Development

```bash
git clone https://github.com/Defilan/plausible-mcp.git
cd plausible-mcp
npm install
npm run build
```

To test locally:

```bash
PLAUSIBLE_API_KEY=your-key node dist/index.js
```

## License

MIT
