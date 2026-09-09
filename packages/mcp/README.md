# @lyriks/mcp

The Lyriks MCP gateway: the service an AI client talks to (Streamable HTTP,
OAuth 2.1 with PKCE) to author a project through the tools and the skills the
platform ships. Every tool answers from the platform (`LYRIKS_BASE_URL`); the
gateway keeps no data of its own.

```bash
pnpm --filter @lyriks/mcp dev        # tsx watch, port 3001 by default
pnpm --filter @lyriks/mcp test       # vitest
pnpm --filter @lyriks/mcp typecheck
pnpm --filter @lyriks/mcp build      # dist/index.js
docker build -f packages/mcp/Dockerfile -t lyriks-mcp-community .   # from the repository root
```

Environment: `PORT`, `LYRIKS_BASE_URL` (the platform), `JWT_SECRET` (the
platform's `LYRIKS_JWT_SECRET`), `MCP_AUTH_REQUIRED` (`1` to require a login),
`PUBLIC_BASE_URL` (the origin browsers reach the platform on, required when
auth is on). See [docs/mcp.md](../../docs/mcp.md).

`src/enterprise/overlay.ts` is the seam the Enterprise edition fills with a
private overlay (the Back client and the formal graph tools); `src/ee/index.ts`
is the open-source stub, and `scripts/oss-boundary.test.mjs` proves nothing
else under `src/` names a Back construct.
