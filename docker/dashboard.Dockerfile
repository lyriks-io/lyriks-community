# Lyriks Community: the behaviour dashboard image (`lyriks-behavior-community`).
#
# The dashboard IS the published `unspaghettit` npm package, which ships its
# prebuilt SvelteKit build plus the `unspa dashboard` launcher and its runtime
# dependencies: there is no separate source tree to build here. The image
# installs one version and runs it.
#
# UNSPA_VERSION: the publish workflow reads the installed version from the
# frozen workspace lockfile, keeping the viewer aligned with the tested engine.
# The default also supports a standalone build; override it with an exact version:
#   docker build -f docker/dashboard.Dockerfile --build-arg UNSPA_VERSION=0.22.0 .
#
# The dashboard is a WRITER to the shared kernel store the platform's pinned
# engine also reads and writes; the wire format is stable across versions, and
# the platform's Settings > Versions screen reports the engine actually running
# against the version the build declares.

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS run
ARG UNSPA_VERSION=0.22.0
WORKDIR /app

RUN npm install -g "unspaghettit@${UNSPA_VERSION}" \
 && npm cache clean --force

# Package managers are build tools; the running service only needs Node.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Snapshots live on the shared data volume (mounted at /app/data by the
# appliance) so the dashboard reads the very behaviour models the platform
# authors. PUBLIC_UNSPA_HOST_PRODUCT declares that this dashboard is part of
# Lyriks, so it never offers its standalone users an upgrade to Lyriks.
ENV PORT=3000 \
    UNSPA_SNAPSHOTS=/app/data/unspa \
    PUBLIC_UNSPA_HOST_PRODUCT=Lyriks
RUN mkdir -p /app/data/unspa && chown -R node:node /app/data
USER node
EXPOSE 3000

CMD ["sh", "-c", "mkdir -p \"$UNSPA_SNAPSHOTS\" && exec unspa dashboard --host 0.0.0.0 --port \"$PORT\" --snapshots \"$UNSPA_SNAPSHOTS\""]
