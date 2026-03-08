/**
 * HTTP client for the Plausible Analytics API v2.
 * https://plausible.io/docs/stats-api
 */

export interface PlausibleQueryParams {
  site_id: string;
  metrics: string[];
  date_range: string | [string, string];
  dimensions?: string[];
  filters?: unknown[];
  order_by?: unknown[];
  pagination?: {
    limit?: number;
    offset?: number;
  };
  include?: {
    imports?: boolean;
    time_labels?: boolean;
    total_rows?: boolean;
    comparisons?: {
      mode: string;
      date_range?: string | [string, string];
    };
  };
}

export interface PlausibleQueryResult {
  results: Array<{
    dimensions: unknown[];
    metrics: unknown[];
    comparison?: {
      dimensions: unknown[];
      metrics: unknown[];
      change: unknown[];
    };
  }>;
  meta: {
    time_labels?: string[];
    total_rows?: number;
    metric_warnings?: Record<string, string>;
    imports_included?: boolean;
  };
  query: Record<string, unknown>;
}

export interface PlausibleSite {
  domain: string;
  timezone: string;
}

export class PlausibleClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl: string = "https://plausible.io") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async query(params: PlausibleQueryParams): Promise<PlausibleQueryResult> {
    const response = await fetch(`${this.baseUrl}/api/v2/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Plausible API error (${response.status}): ${body}`
      );
    }

    return response.json() as Promise<PlausibleQueryResult>;
  }

  async getCurrentVisitors(siteId: string): Promise<number> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/stats/realtime/visitors?site_id=${encodeURIComponent(siteId)}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Plausible API error (${response.status}): ${body}`
      );
    }

    return response.json() as Promise<number>;
  }

  async listSites(): Promise<PlausibleSite[]> {
    const sites: PlausibleSite[] = [];
    let hasMore = true;
    let page = 1;

    while (hasMore) {
      const response = await fetch(
        `${this.baseUrl}/api/v1/sites?page=${page}&limit=100`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Plausible API error (${response.status}): ${body}`
        );
      }

      const data = (await response.json()) as { sites: PlausibleSite[] };
      sites.push(...data.sites);
      hasMore = data.sites.length === 100;
      page++;
    }

    return sites;
  }
}
