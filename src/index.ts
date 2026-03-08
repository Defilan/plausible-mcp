#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PlausibleClient } from "./plausible-client.js";

const API_KEY = process.env.PLAUSIBLE_API_KEY;
const BASE_URL = process.env.PLAUSIBLE_BASE_URL || "https://plausible.io";

if (!API_KEY) {
  console.error("Error: PLAUSIBLE_API_KEY environment variable is required");
  process.exit(1);
}

const client = new PlausibleClient(API_KEY, BASE_URL);

const server = new McpServer({
  name: "plausible-mcp",
  version: "0.1.0",
});

// --- Tool: list-sites ---

server.tool(
  "list-sites",
  "List all sites you have access to in Plausible Analytics",
  {},
  async () => {
    const sites = await client.listSites();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(sites, null, 2),
        },
      ],
    };
  }
);

// --- Tool: get-current-visitors ---

server.tool(
  "get-current-visitors",
  "Get the number of people currently on a site (real-time)",
  {
    site_id: z.string().describe("Domain of the site (e.g. 'example.com')"),
  },
  async ({ site_id }) => {
    const visitors = await client.getCurrentVisitors(site_id);
    return {
      content: [
        {
          type: "text",
          text: `Current visitors on ${site_id}: ${visitors}`,
        },
      ],
    };
  }
);

// Shared schema fragments
const dateRangeSchema = z
  .union([
    z.enum(["day", "7d", "30d", "month", "6mo", "12mo", "year", "all"]),
    z.tuple([z.string(), z.string()]).describe("Custom range: [start, end] in YYYY-MM-DD format"),
  ])
  .describe("Time period. Use a preset like '30d' or a custom range ['2024-01-01', '2024-01-31']")
  .default("30d");

const metricsSchema = z
  .array(
    z.enum([
      "visitors",
      "visits",
      "pageviews",
      "views_per_visit",
      "bounce_rate",
      "visit_duration",
      "events",
      "scroll_depth",
      "percentage",
      "conversion_rate",
      "group_conversion_rate",
      "average_revenue",
      "total_revenue",
      "time_on_page",
    ])
  )
  .describe("Metrics to retrieve")
  .default(["visitors", "pageviews", "bounce_rate", "visit_duration"]);

const filtersSchema = z
  .array(z.any())
  .optional()
  .describe(
    "Filters array using Plausible v2 syntax, e.g. [['is', 'event:page', ['/blog*']]]"
  );

// --- Tool: get-aggregate-stats ---

server.tool(
  "get-aggregate-stats",
  "Get aggregate stats for a site over a time period (visitors, pageviews, bounce rate, etc.). Use this for summary/overview questions.",
  {
    site_id: z.string().describe("Domain of the site (e.g. 'example.com')"),
    metrics: metricsSchema,
    date_range: dateRangeSchema,
    filters: filtersSchema,
  },
  async ({ site_id, metrics, date_range, filters }) => {
    const result = await client.query({
      site_id,
      metrics,
      date_range,
      filters: filters ?? undefined,
    });

    // Format the aggregate result readably
    const row = result.results[0];
    const formatted: Record<string, unknown> = {};
    metrics.forEach((m, i) => {
      formatted[m] = row?.metrics[i];
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { site_id, date_range, metrics: formatted },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- Tool: get-timeseries ---

server.tool(
  "get-timeseries",
  "Get traffic trends over time. Returns data points broken down by time interval (day, week, or month). Use this for trend analysis and charts.",
  {
    site_id: z.string().describe("Domain of the site (e.g. 'example.com')"),
    metrics: metricsSchema,
    date_range: dateRangeSchema,
    interval: z
      .enum(["date", "week", "month"])
      .describe("Time granularity for the series")
      .default("date"),
    filters: filtersSchema,
  },
  async ({ site_id, metrics, date_range, interval, filters }) => {
    const dimensionKey =
      interval === "date"
        ? "time:day"
        : interval === "week"
          ? "time:week"
          : "time:month";

    const result = await client.query({
      site_id,
      metrics,
      date_range,
      dimensions: [dimensionKey],
      filters: filters ?? undefined,
    });

    // Format as an array of { date, ...metrics }
    const rows = result.results.map((r) => {
      const row: Record<string, unknown> = { date: r.dimensions[0] };
      metrics.forEach((m, i) => {
        row[m] = r.metrics[i];
      });
      return row;
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ site_id, date_range, interval, data: rows }, null, 2),
        },
      ],
    };
  }
);

// --- Tool: get-breakdown ---

server.tool(
  "get-breakdown",
  "Break down stats by a dimension (e.g. page, source, country, device, browser, OS, UTM tags). Use this for 'top pages', 'traffic sources', 'visitor countries', etc.",
  {
    site_id: z.string().describe("Domain of the site (e.g. 'example.com')"),
    metrics: metricsSchema,
    date_range: dateRangeSchema,
    dimensions: z
      .array(
        z.enum([
          "event:page",
          "event:hostname",
          "event:goal",
          "visit:source",
          "visit:referrer",
          "visit:utm_source",
          "visit:utm_medium",
          "visit:utm_campaign",
          "visit:utm_content",
          "visit:utm_term",
          "visit:device",
          "visit:browser",
          "visit:browser_version",
          "visit:os",
          "visit:os_version",
          "visit:country",
          "visit:country_name",
          "visit:region",
          "visit:city",
          "visit:entry_page",
          "visit:exit_page",
        ])
      )
      .describe(
        "Dimensions to group by. Common: 'event:page' for top pages, 'visit:source' for traffic sources, 'visit:country_name' for geography"
      ),
    filters: filtersSchema,
    limit: z
      .number()
      .optional()
      .describe("Max number of results to return (default 10)")
      .default(10),
  },
  async ({ site_id, metrics, date_range, dimensions, filters, limit }) => {
    const result = await client.query({
      site_id,
      metrics,
      date_range,
      dimensions,
      filters: filters ?? undefined,
      pagination: { limit },
    });

    // Format as rows with dimension labels + metrics
    const rows = result.results.map((r) => {
      const row: Record<string, unknown> = {};
      dimensions.forEach((d, i) => {
        row[d] = r.dimensions[i];
      });
      metrics.forEach((m, i) => {
        row[m] = r.metrics[i];
      });
      return row;
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { site_id, date_range, dimensions, data: rows },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- Tool: query (raw/advanced) ---

server.tool(
  "query",
  "Execute a raw Plausible Stats API v2 query. Use this for advanced queries that the other tools don't cover, such as custom property breakdowns, behavioral filters, or combining multiple dimensions with time series.",
  {
    site_id: z.string().describe("Domain of the site (e.g. 'example.com')"),
    metrics: z.array(z.string()).describe("Metrics to retrieve"),
    date_range: z
      .union([z.string(), z.tuple([z.string(), z.string()])])
      .describe("Date range preset or custom [start, end]"),
    dimensions: z.array(z.string()).optional().describe("Dimensions to group by"),
    filters: z.array(z.any()).optional().describe("Filters in Plausible v2 syntax"),
    order_by: z
      .array(z.any())
      .optional()
      .describe("Order by, e.g. [['visitors', 'desc']]"),
    pagination: z
      .object({
        limit: z.number().optional(),
        offset: z.number().optional(),
      })
      .optional()
      .describe("Pagination options"),
    include: z
      .object({
        imports: z.boolean().optional(),
        time_labels: z.boolean().optional(),
        total_rows: z.boolean().optional(),
        comparisons: z
          .object({
            mode: z.string(),
            date_range: z
              .union([z.string(), z.tuple([z.string(), z.string()])])
              .optional(),
          })
          .optional(),
      })
      .optional()
      .describe("Include options (imports, time_labels, comparisons)"),
  },
  async ({ site_id, metrics, date_range, dimensions, filters, order_by, pagination, include }) => {
    const result = await client.query({
      site_id,
      metrics,
      date_range,
      dimensions: dimensions ?? undefined,
      filters: filters ?? undefined,
      order_by: order_by ?? undefined,
      pagination: pagination ?? undefined,
      include: include ?? undefined,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Plausible MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
