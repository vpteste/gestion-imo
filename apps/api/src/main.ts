import "reflect-metadata";
import { config as loadEnv } from "dotenv";
import { NestFactory } from "@nestjs/core";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import helmet from "helmet";

const envCandidates = [
  join(process.cwd(), ".env"),
  join(process.cwd(), "..", "..", ".env"),
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}

async function bootstrap() {
  const corsOrigin = process.env.CORS_ORIGIN ?? "*";
  const port = Number(process.env.PORT ?? "3001");

  const corsOrigins = corsOrigin === "*" || !corsOrigin.trim()
    ? true
    : corsOrigin.split(",").map((item) => item.trim()).filter(Boolean);

  const allowedVercelOrigin = "https://gestion-imo-mu.vercel.app";
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      origin:
        corsOrigins === true
          ? true
          : (origin, callback) => {
              if (!origin) {
                return callback(null, true);
              }

              const normalizedOrigins = Array.isArray(corsOrigins)
                ? corsOrigins
                : [];

              if (normalizedOrigins.includes(origin) || origin === allowedVercelOrigin) {
                return callback(null, true);
              }

              return callback(
                new Error(`Origin ${origin} not allowed by CORS`),
                false,
              );
            },
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
    },
  });

  // Servir les uploads (photos états des lieux) en statique
  const uploadsDir = join(process.cwd(), "uploads");
  mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: "/uploads" });

  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
  await app.listen(port, "0.0.0.0");
}

bootstrap();
