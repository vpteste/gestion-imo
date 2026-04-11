FROM node:20-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production

# Prisma query engine needs OpenSSL at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Workspace root manifests
COPY package.json package-lock.json tsconfig.base.json ./

# Packages nécessaires à l'API
COPY packages/shared/ ./packages/shared/
COPY packages/database/ ./packages/database/

# Code source API
COPY apps/api/ ./apps/api/

# Installer uniquement les workspaces requis par l'API
RUN npm ci --ignore-scripts --workspace @gestion/shared --workspace @gestion/database --workspace api
RUN npx prisma generate --schema packages/database/prisma/schema.prisma

# Compiler shared puis api
RUN npm run build -w packages/shared
RUN npm run build -w apps/api

# Répertoire de stockage (monté via volume en prod)
RUN mkdir -p /app/apps/api/storage/contracts /app/apps/api/storage/receipts

EXPOSE 3001

CMD ["node", "apps/api/dist/main.js"]
