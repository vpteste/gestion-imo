# ─── Stage 1 : build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Workspace root manifests
COPY package.json package-lock.json tsconfig.base.json ./

# Packages nécessaires à l'API
COPY packages/shared/  ./packages/shared/
COPY packages/database/ ./packages/database/

# Code source API
COPY apps/api/ ./apps/api/

# Installer uniquement les workspaces requis par l'API
RUN npm ci --ignore-scripts --workspace @gestion/shared --workspace @gestion/database --workspace api
RUN npx prisma generate --schema packages/database/prisma/schema.prisma

# Compiler shared puis api
RUN npm run build -w packages/shared
RUN npm run build -w apps/api

# ─── Stage 2 : runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Prisma query engine needs OpenSSL at runtime on Alpine.
RUN apk add --no-cache openssl

# Manifests (pour npm ci --omit=dev)
COPY --from=builder /app/package.json          ./package.json
COPY --from=builder /app/package-lock.json     ./package-lock.json
COPY --from=builder /app/packages/shared/package.json    ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist           ./packages/shared/dist
COPY --from=builder /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder /app/packages/database/prisma       ./packages/database/prisma
COPY --from=builder /app/apps/api/package.json          ./apps/api/package.json
COPY --from=builder /app/apps/api/dist                  ./apps/api/dist

# Conserver les artefacts Prisma générés en build, puis nettoyer les dev deps
COPY --from=builder /app/node_modules ./node_modules

# Répertoire de stockage (monté via volume en prod)
RUN mkdir -p /app/apps/api/storage/contracts /app/apps/api/storage/receipts

EXPOSE 3001

CMD ["node", "apps/api/dist/main.js"]
