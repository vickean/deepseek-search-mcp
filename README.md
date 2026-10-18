# DeepSeek Search MCP server

A local [MCP](https://modelcontextprotocol.io/) server that exposes
DeepSeek's in-house **Search** and **Fetch** APIs as agent tools over stdio.

- `web_search` → `POST https://api.deepseek.com/v1/tools/search`
- `web_fetch` → `POST https://api.deepseek.com/v1/tools/fetch`

It uses only the official `@modelcontextprotocol/sdk` and `zod`. The API key is
read from the environment and is never written into any file in this directory.

---

## Tools

### `web_search`

Search the web with DeepSeek's in-house search engine. Returns ranked results
with title, URL, publication date, authority tier, a relevance score, a short
snippet, a long model-ready summary, and (optionally) full page content.

| Arg | Type | Required | Notes |
| --- | --- | --- | --- |
| `query` | string | yes | 1–128 chars. Operators supported (see below). |
| `count` | integer | no | 1–50, default 10. **Does not affect the price.** |
| `need_content` | boolean | no | Include full page text per result. Default `false`. |
| `ori_question` | string | no | The user's original question, to improve query understanding. |
| `localization` | string | no | An IP address used to localize results. |

Query operators (combine freely):

```text
site:github.com            restrict to a site (join several with OR)
-site:example.com          exclude a site
"exact phrase"             match an exact phrase
-term                      exclude pages containing a term
-"exact phrase"            exclude an exact phrase
lang:zh,en                 restrict to language codes
after:2025-01-01           published after a date
before:2026-06-01          published before a date
```

Example:

```text
DeepSeek site:github.com OR site:huggingface.co lang:en after:2025
```

### `web_fetch`

Fetch a single web page and return its title and content as Markdown.

| Arg | Type | Required | Notes |
| --- | --- | --- | --- |
| `url` | string | yes | HTTP or HTTPS URL. |

---

## Setup

### 1. API key

Get a key at <https://platform.deepseek.com> and make sure the account has a
positive balance.

Export it where OpenCode's background **service** starts, not just an
interactive shell — the service reads the environment at startup:

```bash
export DEEPSEEK_API_KEY=sk-your-key
```

If the service autostarts from a context that does not inherit your shell
profile, add the export there too (shell profile, launcher, or service unit).

Optional override of the API base URL:

```bash
export DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### 2. OpenCode configuration

The server is registered in `~/.config/opencode/opencode.json` under
`mcp.servers`:

```jsonc
{
  "mcp": {
    "servers": {
      "deepseek-search": {
        "type": "local",
        "command": ["node", "/absolute/path/to/deepseek-search/index.js"],
        "environment": {
          "DEEPSEEK_API_KEY": "{env:DEEPSEEK_API_KEY}"
        },
        "disabled": false
      }
    }
  }
}
```

`{env:DEEPSEEK_API_KEY}` is substituted from OpenCode's process environment at
launch; the secret is never stored in the config file.

### 3. Dependencies and restart

```bash
cd ~/.config/opencode/mcp/deepseek-search
npm install
opencode service restart
```

Verify the connection:

```bash
opencode mcp list
# ✓ deepseek-search  connected
```

---

## Usage in OpenCode

Ask in plain language ("search the web for…", "fetch and summarize this URL")
and the agent picks the tools automatically. The tools appear to the model as:

```text
deepseek_search_web_search
deepseek_search_web_fetch
```

Under Code Mode they are grouped by server name:

```js
const out = await tools.deepseek_search.web_search({ query: "latest Rust release", count: 5 })
```

---

## Cost and limits

| API | Price | Rate limit |
| --- | --- | --- |
| Search | $0.75 / 1,000 **successful** requests | 5 QPS per account |
| Fetch | $0.75 / 1,000 **successful** requests | 5 QPS per account |

- Billed per successful request, **not** per result or per token. Failed
  requests, empty result sets, and timeouts are free.
- `count` is free: request up to 50 results — with `need_content: true` you get
  up to 50 full pages for the price of one request.
- Search and Fetch have independent quotas.

> Direct API calls are billed from the start. The "free until Nov 1, 2026"
> promotion applies only to server-side tool calls made through DeepSeek
> Harness, Claude Code, or Codex.

---

## Troubleshooting

**`DEEPSEEK_API_KEY is not set`** — the variable is not visible to the server
process. Export it in the environment that starts OpenCode's service, then
`opencode service restart`.

**`DeepSeek API error (401 …)`** — invalid or revoked key.

**`DeepSeek API error (402 …)`** — insufficient balance; top up the account.

**`DeepSeek API error (429 …)`** — the 5 QPS account limit was exceeded; retry
after a short wait.

**Fetch returns escaped punctuation** (e.g. `\,` `\.`) — DeepSeek returns page
text as-is; this is a property of the source page, not the server.

**Server not connected** — run `opencode mcp list`; check the config path in
`opencode.json` is absolute and that `npm install` was run here.

---

## Files

| File | Purpose |
| --- | --- |
| `index.js` | The MCP server (stdio transport, two tools). |
| `package.json` | Declares the SDK and zod dependencies. |
| `node_modules/` | Installed dependencies. |

## Reference

- Search & Fetch guide: <https://api-docs.deepseek.com/guides/search>
- Search API reference: <https://api-docs.deepseek.com/api/search>
- OpenCode MCP config: <https://opencode.ai/v2/docs/mcp-servers>
