import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@gestion/database";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private availabilityCache: boolean | null = null;

  constructor() {
    super({
      datasources: {
        db: {
          url:
            process.env.DIRECT_URL
            ?? process.env.DATABASE_URL
            ?? "postgresql://gestion:gestion@localhost:5432/gestion?schema=public",
        },
      },
    });
  }

  async isAvailable(forceRefresh = false): Promise<boolean> {
    if (!forceRefresh && this.availabilityCache !== null) {
      return this.availabilityCache;
    }

    try {
      await this.$queryRaw`SELECT 1`;
      this.availabilityCache = true;
    } catch {
      this.availabilityCache = false;
    }

    return this.availabilityCache;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}