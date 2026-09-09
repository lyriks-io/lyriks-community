# Lyriks Community: the MCP gateway image (`lyriks-mcp-community`).
#
# Built from the repository ROOT (`docker build -f packages/mcp/Dockerfile .`)
# so the workspace lockfile resolves the package exactly as `pnpm install`
# does for a contributor. The base is pinned by digest for the same reason as
# the platform image: two builds of one commit must produce one image.

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.6.3 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/mcp/package.json packages/mcp/
RUN pnpm install --frozen-lockfile --filter @lyriks/mcp...
COPY packages/mcp packages/mcp
# One bundle (dist/index.js); the npm dependencies stay external and travel
# with the deployed node_modules below.
RUN pnpm --filter @lyriks/mcp run build
RUN pnpm --filter @lyriks/mcp deploy --legacy --prod /deploy \
 && cp -r packages/mcp/dist /deploy/dist

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS run
WORKDIR /app
ARG LYRIKS_BUILD_SHA=""
ARG LYRIKS_BUILD_DATE=""
# The appliance serves the gateway at <app origin>/mcp and reaches it on 3055.
ENV NODE_ENV=production \
    PORT=3055 \
    LYRIKS_BUILD_SHA=${LYRIKS_BUILD_SHA} \
    LYRIKS_BUILD_DATE=${LYRIKS_BUILD_DATE}
COPY --from=build --chown=node:node /deploy .
# Package managers are build tools; the running service only needs Node.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg
USER node
EXPOSE 3055
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3055)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
