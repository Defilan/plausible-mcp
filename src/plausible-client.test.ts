import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PlausibleClient } from "./plausible-client.js";

interface CapturedCall {
  url: string;
  options?: RequestInit;
}

describe("PlausibleClient", () => {
  let originalFetch: typeof globalThis.fetch;
  let calls: CapturedCall[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    calls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(status: number, body: unknown) {
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push({ url, options: init });
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
        json: async () => body,
      };
    }) as unknown as typeof fetch;
  }

  describe("query", () => {
    it("sends correct request to /api/v2/query", async () => {
      const responseBody = {
        results: [{ dimensions: [], metrics: [100, 200] }],
        meta: {},
        query: {},
      };
      mockFetch(200, responseBody);

      const client = new PlausibleClient("test-key", "https://plausible.io");
      const result = await client.query({
        site_id: "example.com",
        metrics: ["visitors", "pageviews"],
        date_range: "30d",
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://plausible.io/api/v2/query");

      const opts = calls[0].options!;
      assert.equal(opts.method, "POST");

      const headers = opts.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer test-key");
      assert.equal(headers["Content-Type"], "application/json");

      const body = JSON.parse(opts.body as string);
      assert.equal(body.site_id, "example.com");
      assert.deepEqual(body.metrics, ["visitors", "pageviews"]);
      assert.equal(body.date_range, "30d");

      assert.deepEqual(result, responseBody);
    });

    it("uses custom base URL", async () => {
      mockFetch(200, { results: [], meta: {}, query: {} });

      const client = new PlausibleClient(
        "key",
        "https://analytics.example.com"
      );
      await client.query({
        site_id: "test.com",
        metrics: ["visitors"],
        date_range: "7d",
      });

      assert.equal(calls[0].url, "https://analytics.example.com/api/v2/query");
    });

    it("strips trailing slash from base URL", async () => {
      mockFetch(200, { results: [], meta: {}, query: {} });

      const client = new PlausibleClient(
        "key",
        "https://analytics.example.com/"
      );
      await client.query({
        site_id: "test.com",
        metrics: ["visitors"],
        date_range: "7d",
      });

      assert.equal(calls[0].url, "https://analytics.example.com/api/v2/query");
    });

    it("throws on API error", async () => {
      mockFetch(403, { error: "Forbidden" });

      const client = new PlausibleClient("bad-key");
      await assert.rejects(
        () =>
          client.query({
            site_id: "example.com",
            metrics: ["visitors"],
            date_range: "30d",
          }),
        { message: /Plausible API error \(403\)/ }
      );
    });

    it("sends filters and pagination when provided", async () => {
      mockFetch(200, { results: [], meta: {}, query: {} });

      const client = new PlausibleClient("key");
      await client.query({
        site_id: "example.com",
        metrics: ["visitors"],
        date_range: "30d",
        dimensions: ["event:page"],
        filters: [["is", "event:page", ["/blog*"]]],
        pagination: { limit: 5, offset: 10 },
      });

      const body = JSON.parse(calls[0].options!.body as string);
      assert.deepEqual(body.dimensions, ["event:page"]);
      assert.deepEqual(body.filters, [["is", "event:page", ["/blog*"]]]);
      assert.deepEqual(body.pagination, { limit: 5, offset: 10 });
    });
  });

  describe("getCurrentVisitors", () => {
    it("calls realtime endpoint with correct site_id", async () => {
      mockFetch(200, 42);

      const client = new PlausibleClient("test-key");
      const result = await client.getCurrentVisitors("example.com");

      assert.equal(result, 42);
      assert.equal(
        calls[0].url,
        "https://plausible.io/api/v1/stats/realtime/visitors?site_id=example.com"
      );

      const headers = calls[0].options!.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer test-key");
    });

    it("URL-encodes site_id", async () => {
      mockFetch(200, 0);

      const client = new PlausibleClient("key");
      await client.getCurrentVisitors("my site.com");

      assert.ok(calls[0].url.includes("site_id=my%20site.com"));
    });

    it("throws on API error", async () => {
      mockFetch(401, "Unauthorized");

      const client = new PlausibleClient("bad-key");
      await assert.rejects(
        () => client.getCurrentVisitors("example.com"),
        { message: /Plausible API error \(401\)/ }
      );
    });
  });

  describe("listSites", () => {
    it("fetches paginated sites", async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        domain: `site${i}.com`,
        timezone: "UTC",
      }));
      const page2 = [{ domain: "last.com", timezone: "US/Eastern" }];

      globalThis.fetch = (async (
        input: string | URL | Request,
        init?: RequestInit
      ) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push({ url, options: init });
        const body = url.includes("page=1")
          ? { sites: page1 }
          : { sites: page2 };
        return {
          ok: true,
          status: 200,
          json: async () => body,
          text: async () => JSON.stringify(body),
        };
      }) as unknown as typeof fetch;

      const client = new PlausibleClient("key");
      const sites = await client.listSites();

      assert.equal(sites.length, 101);
      assert.equal(sites[100].domain, "last.com");
      assert.equal(calls.length, 2);
    });

    it("handles single page of results", async () => {
      const sites = [
        { domain: "a.com", timezone: "UTC" },
        { domain: "b.com", timezone: "UTC" },
      ];
      mockFetch(200, { sites });

      const client = new PlausibleClient("key");
      const result = await client.listSites();

      assert.equal(result.length, 2);
    });

    it("throws on API error", async () => {
      mockFetch(500, "Internal Server Error");

      const client = new PlausibleClient("key");
      await assert.rejects(() => client.listSites(), {
        message: /Plausible API error \(500\)/,
      });
    });
  });
});
