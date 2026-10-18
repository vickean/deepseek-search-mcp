#!/usr/bin/env node
/**
 * DeepSeek Search MCP server
 *
 * Exposes DeepSeek's Search and Fetch APIs as MCP tools over stdio:
 *   - web_search : POST https://api.deepseek.com/v1/tools/search
 *   - web_fetch  : POST https://api.deepseek.com/v1/tools/fetch
 *
 * Auth: reads the API key from the DEEPSEEK_API_KEY environment variable.
 * Optional: DEEPSEEK_BASE_URL overrides the API base (default https://api.deepseek.com).
 *
 * Billing note: Search and Fetch cost $0.75 per 1,000 successful requests each.
 * `count` does not affect the price, so ask for the results you need.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "")
const API_KEY = process.env.DEEPSEEK_API_KEY || ""
const SEARCH_URL = `${BASE_URL}/v1/tools/search`
const FETCH_URL = `${BASE_URL}/v1/tools/fetch`

async function callApi(url, body) {
  if (!API_KEY) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. Export it (or add it to your shell profile) and restart OpenCode.",
    )
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }

  if (!res.ok) {
    const message = data?.error?.message || data?.raw || text || `HTTP ${res.status}`
    throw new Error(`DeepSeek API error (${res.status}): ${message}`)
  }
  return data
}

function formatResults(results) {
  return results
    .map((r, i) => {
      const lines = [`${i + 1}. ${r.title || "(untitled)"}`]
      if (r.url) lines.push(`   URL: ${r.url}`)
      if (r.date) lines.push(`   Date: ${r.date}`)
      if (typeof r.authority === "number" && r.authority >= 0) lines.push(`   Authority: ${r.authority}`)
      if (typeof r.rerank_score === "number") lines.push(`   Score: ${r.rerank_score}`)
      if (r.snippet) lines.push(`   Snippet: ${r.snippet}`)
      if (r.summary) lines.push(`   Summary: ${r.summary}`)
      if (r.content) lines.push(`   Content:\n${r.content}`)
      return lines.join("\n")
    })
    .join("\n\n")
}

const server = new McpServer({ name: "deepseek-search", version: "1.0.0" })

server.registerTool(
  "web_search",
  {
    title: "DeepSeek Web Search",
    description:
      "Search the web with DeepSeek's in-house search engine. Returns ranked results with title, URL, " +
      "snippet, a model-ready summary, and (optionally) full page content. Query operators are supported: " +
      'site:github.com, -site:example.com, "exact phrase", -term, lang:zh,en, after:2025-01-01, before:2026-06-01.',
    inputSchema: {
      query: z
        .string()
        .min(1)
        .max(128)
        .describe('Search query (1-128 chars). Supports operators like site:github.com, lang:en, after:2025-01-01.'),
      count: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of results to return (1-50). Default 10. Does not affect the per-request price."),
      need_content: z
        .boolean()
        .optional()
        .describe("Include full page text in each result. Default false (snippet + summary only)."),
      ori_question: z
        .string()
        .min(1)
        .max(128)
        .optional()
        .describe("The user's original question that triggered the search, to improve query understanding."),
      localization: z.string().optional().describe("Optional IP address used to localize search results."),
    },
  },
  async ({ query, count, need_content, ori_question, localization }) => {
    const body = { query }
    if (count !== undefined) body.count = count
    if (need_content !== undefined) body.need_content = need_content
    if (ori_question) body.ori_question = ori_question
    if (localization) body.localization = localization

    const data = await callApi(SEARCH_URL, body)
    const results = Array.isArray(data.results) ? data.results : []
    if (results.length === 0) {
      return { content: [{ type: "text", text: `No results for "${query}".` }] }
    }
    return { content: [{ type: "text", text: formatResults(results) }] }
  },
)

server.registerTool(
  "web_fetch",
  {
    title: "DeepSeek Web Fetch",
    description: "Fetch a single web page by URL and return its title and content as Markdown.",
    inputSchema: {
      url: z.string().url().describe("HTTP or HTTPS URL to fetch."),
    },
  },
  async ({ url }) => {
    const data = await callApi(FETCH_URL, { url })
    const title = data.title || ""
    const content = data.content || ""
    const text = `${title}\n\n${content}`.trim() || "(no content returned)"
    return { content: [{ type: "text", text }] }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
