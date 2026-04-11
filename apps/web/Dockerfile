# ─── Stage 1 : installation des dépendances ────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/web/         ./apps/web/

RUN npm ci --ignore-scripts

# ─── Stage 2 : build Next.js ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT_STANDALONE=1

# Récupérer les node_modules installés
COPY --from=deps /app/node_modules           ./node_modules
COPY --from=deps /app/packages/shared/       ./packages/shared/
COPY --from=deps /app/apps/web/node_modules  ./apps/web/node_modules

# Sources
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/ ./apps/web/

# Compiler shared (requis par web)
RUN npm run build -w packages/shared

# Build Next.js (génère .next-build/standalone en production)
RUN npm run build -w apps/web

# ─── Stage 3 : runtime minimal ─────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Artefacts standalone générés par Next.js
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next-build/standalone      ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next-build/static          ./apps/web/.next-build/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public                      ./apps/web/public

USER nextjs

EXPOSE 3000

# Le serveur standalone est généré à la racine du répertoire standalone
CMD ["node", "apps/web/server.js"]
