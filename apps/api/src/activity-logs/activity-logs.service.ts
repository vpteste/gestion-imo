import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { ActivityLogEntry, ActivityLogFilters } from "./activity-logs.types";

@Injectable()
export class ActivityLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async add(entry: Omit<ActivityLogEntry, "id" | "timestamp">): Promise<void> {
    const entityType = this.extractEntityType(entry.path);
    const entityId = this.extractEntityId(entry.path);

    await this.prisma.activityLog.create({
      data: {
        actionType: entry.method,
        entityType,
        entityId,
        actorId: entry.actorId,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        statusCode: entry.statusCode,
        durationMs: entry.durationMs,
        errorMessage: entry.statusCode >= 400 ? `HTTP_${entry.statusCode}` : null,
        beforeData: {
          method: entry.method,
          path: entry.path,
          actorRole: entry.actorRole,
          actorEmail: entry.actorEmail,
        },
      },
    });
  }

  async findAll(filters: ActivityLogFilters = {}): Promise<ActivityLogEntry[]> {
    const where: any = {};

    if (filters.actorId) {
      where.actorId = filters.actorId;
    }

    if (filters.method) {
      where.actionType = filters.method.toUpperCase();
    }

    if (typeof filters.statusCode === "number") {
      where.statusCode = filters.statusCode;
    }

    if (filters.pathContains) {
      where.beforeData = {
        path: ["path"],
        string_contains: filters.pathContains,
      };
    }

    const limit = Math.max(1, Math.min(filters.limit ?? 100, 500));
    const logs = await this.prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return logs
      .map((log) => {
        const payload = (log.beforeData as any) ?? {};
        const actorRole = payload.actorRole as string | undefined;

        if (filters.role && actorRole !== filters.role) {
          return null;
        }

        const path = (payload.path as string | undefined) ?? `/${log.entityType.toLowerCase()}`;

        if (filters.pathContains && !path.toLowerCase().includes(filters.pathContains.toLowerCase())) {
          return null;
        }

        return {
          id: log.id,
          timestamp: log.createdAt.toISOString(),
          method: ((payload.method as string | undefined) ?? log.actionType).toUpperCase(),
          path,
          statusCode: log.statusCode ?? 200,
          actorId: log.actorId,
          actorRole,
          actorEmail: payload.actorEmail as string | undefined,
          userAgent: log.userAgent,
          durationMs: log.durationMs,
          ipAddress: log.ipAddress,
        } as ActivityLogEntry;
      })
      .filter((entry): entry is NonNullable<ActivityLogEntry | null> => entry !== null) as ActivityLogEntry[];
  }

  private extractEntityType(path: string): string {
    const cleanPath = path.split("?")[0] ?? "";
    const segments = cleanPath.split("/").filter(Boolean);
    return segments[0] ?? "system";
  }

  private extractEntityId(path: string): string | undefined {
    const cleanPath = path.split("?")[0] ?? "";
    const segments = cleanPath.split("/").filter(Boolean);
    if (segments.length < 2) {
      return undefined;
    }

    const candidate = segments[1];
    if (!candidate || ["login", "activate", "users", "summary-pdf"].includes(candidate)) {
      return undefined;
    }

    return candidate;
  }
}
