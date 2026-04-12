import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { ActivityLogEntry, ActivityLogFilters, OnlineAgentEntry } from "./activity-logs.types";

function summarizeDevice(userAgent?: string): string | undefined {
  if (!userAgent) {
    return undefined;
  }

  const ua = userAgent.toLowerCase();
  const browser = ua.includes("edg")
    ? "Edge"
    : ua.includes("chrome")
      ? "Chrome"
      : ua.includes("firefox")
        ? "Firefox"
        : ua.includes("safari")
          ? "Safari"
          : "Navigateur";

  const os = ua.includes("windows")
    ? "Windows"
    : ua.includes("android")
      ? "Android"
      : ua.includes("iphone") || ua.includes("ipad")
        ? "iOS"
        : ua.includes("mac os")
          ? "macOS"
          : ua.includes("linux")
            ? "Linux"
            : "OS";

  const device = ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")
    ? "Mobile"
    : "Ordinateur";

  return `${browser} · ${os} · ${device}`;
}

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
          targetType: entry.targetType,
          targetLabel: entry.targetLabel,
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
          targetType: payload.targetType as string | undefined,
          targetLabel: payload.targetLabel as string | undefined,
        } as ActivityLogEntry;
      })
      .filter((entry): entry is NonNullable<ActivityLogEntry | null> => entry !== null) as ActivityLogEntry[];
  }

  async getOnlineAgents(lastMinutes = 5): Promise<OnlineAgentEntry[]> {
    const windowStart = new Date(Date.now() - Math.max(1, lastMinutes) * 60_000);
    const logs = await this.prisma.activityLog.findMany({
      where: {
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const byAgent = new Map<string, OnlineAgentEntry>();

    for (const log of logs) {
      const payload = (log.beforeData as any) ?? {};
      if (payload.actorRole !== "agent") {
        continue;
      }

      const agentId = log.actorId;
      if (!agentId || byAgent.has(agentId)) {
        continue;
      }

      byAgent.set(agentId, {
        agentId,
        agentEmail: payload.actorEmail as string | undefined,
        lastSeenAt: log.createdAt.toISOString(),
        ipAddress: log.ipAddress ?? undefined,
        userAgent: log.userAgent ?? undefined,
        deviceSummary: summarizeDevice(log.userAgent ?? undefined),
      });
    }

    return [...byAgent.values()];
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
