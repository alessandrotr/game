# syntax=docker/dockerfile:1

# ---- Base ----
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo

# ---- Dependencies (cached on lockfile) ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/client/package.json apps/client/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- Build ----
FROM deps AS build
# Baked into the static bundle at build time.
ARG VITE_SERVER_URL=ws://localhost:2567
ENV VITE_SERVER_URL=$VITE_SERVER_URL
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/client apps/client
RUN pnpm --filter @arena/shared run build \
 && pnpm --filter @arena/client run build

# ---- Runtime (static files via nginx) ----
FROM nginx:1.27-alpine AS runtime
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/client/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
