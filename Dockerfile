# Lyriks v3 — production image (SvelteKit adapter-node).
# Multi-stage build; every runtime edition uses PostgreSQL and runs `node build`.
# Source is compiled/bundled into
# build/ (server source is not shipped raw).
#
# The base is pinned by DIGEST, not just by tag: `node:22-bookworm-slim` moves at
# every upstream patch, so a tag alone lets two builds of the same commit produce
# different images — unacceptable for an appliance a customer audits. The digest
# is the multi-arch index, so pinning it keeps amd64/arm64 working.
#
# A pin without a bump process rots into an image full of unpatched CVEs, which is
# worse than not pinning. Dependabot's `docker` ecosystem (.github/dependabot.yml)
# therefore raises the digest on a schedule, and the publish-image `test` job —
# including the Trivy scan — gates every one of those PRs.

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS build
WORKDIR /app
# Pin pnpm to the repository package-manager version.
RUN corepack enable && corepack prepare pnpm@10.6.3 --activate
# pnpm-workspace.yaml carries the explicit native-build allowlist.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/mcp/package.json packages/mcp/
RUN pnpm install --frozen-lockfile
COPY . .
# Skill-catalog guard: the build context must contain a SKILL.md for every id
# in PUBLISHED_SKILL_IDS (a missed `!.claude/skills/<id>` re-include in
# .dockerignore drops it and the image silently ships a short catalog). Fail
# the image build here; the running server never throws for this.
RUN node scripts/check-skill-catalog.mjs
RUN pnpm build \
 && rm -rf node_modules \
 && pnpm install --prod --frozen-lockfile
# On-prem opacity guard: the build is already minified with sourcemaps disabled
# (vite.config.ts), but strip any stray *.map so no source is ever reconstructable
# from the shipped image, whatever a tool or future config emits.
RUN find build -name '*.map' -type f -delete

# Match the PostgreSQL 16 server shipped by the compose stack. Debian Bookworm
# defaults to client 15, whose pg_dump refuses to back up a version 16 server.
FROM postgres:16-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825 AS postgres-client

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS run
WORKDIR /app
# Build provenance, stamped automatically by the publish workflow (and by any
# `docker build --build-arg`). Settings → Versions reads these, so a running
# container can always name the source it was built from. Empty in a plain local
# build: the screen then reports the release only, never a placeholder.
ARG LYRIKS_BUILD_SHA=""
ARG LYRIKS_BUILD_DATE=""
# BODY_SIZE_LIMIT: adapter-node caps every request body at 512K unless told
# otherwise, and the cap does not answer 413 at the door; it errors the body
# stream inside the route, mid-parse. Project bundles (POST /api/projects/import)
# pass 512K as soon as a project has a few dozen features, so match the runtime
# cap to that route's own MAX_UPLOAD_BYTES (src/lib/server/import-upload.server.ts).
# `vite dev` applies no cap, which is why this only ever bit the shipped image.
ENV NODE_ENV=production \
    PORT=3000 \
    BODY_SIZE_LIMIT=256M \
    LYRIKS_BUILD_SHA=${LYRIKS_BUILD_SHA} \
    LYRIKS_BUILD_DATE=${LYRIKS_BUILD_DATE}
# Built server + pruned production dependencies. server.mjs wraps the built
# handler to add WebSocket upgrade proxying (behavior dashboard sync + yjs);
# see its header comment.
COPY --from=build /app/build ./build
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/scripts/lib/socket-origin.mjs ./scripts/lib/socket-origin.mjs
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts/backup.mjs ./scripts/backup.mjs
COPY --from=build /app/scripts/restore.mjs ./scripts/restore.mjs
# Ship the tools used by the documented PostgreSQL + behavior backup workflow.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq5 liblz4-1 libzstd1 tar \
 && rm -rf /var/lib/apt/lists/*
COPY --from=postgres-client /usr/lib/postgresql/16/bin/pg_dump /usr/local/bin/pg_dump
COPY --from=postgres-client /usr/lib/postgresql/16/bin/pg_restore /usr/local/bin/pg_restore
# Fail the image build if either executable is missing a runtime library.
RUN pg_dump --version && pg_restore --version
# Package managers are build tools; the running service only needs Node.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg
# Run unprivileged: the base image's `node` user (uid 1000) owns the behavior
# data directory. Drop root to shrink the runtime attack surface.
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
# Container-level liveness: hit the app's /healthz (Node 22 has global fetch).
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
