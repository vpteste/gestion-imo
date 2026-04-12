import { Injectable, NestMiddleware } from "@nestjs/common";
import type { AuthenticatedRequest } from "../common/types";
import { ActivityLogsService } from "./activity-logs.service";

function extractTargetPreview(req: any): { targetType?: string; targetLabel?: string } {
  const method = String(req.method ?? "").toUpperCase();
  const path = String(req.path ?? req.url ?? "");
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (method === "POST" && path.startsWith("/tenants")) {
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const fullName = `${firstName} ${lastName}`.trim();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    return {
      targetType: "locataire",
      targetLabel: [fullName, email].filter(Boolean).join(" — ") || undefined,
    };
  }

  if (method === "POST" && path.startsWith("/properties")) {
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    return {
      targetType: "bien",
      targetLabel: [reference, title].filter(Boolean).join(" — ") || undefined,
    };
  }

  if ((method === "PATCH" || method === "PUT") && path.startsWith("/tenants/")) {
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const fullName = `${firstName} ${lastName}`.trim();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    return {
      targetType: "locataire",
      targetLabel: [fullName, email].filter(Boolean).join(" — ") || undefined,
    };
  }

  return {};
}

@Injectable()
export class ActivityLogsMiddleware implements NestMiddleware {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  use(req: any, res: any, next: () => void) {
    const start = Date.now();

    res.on("finish", () => {
      const request = req as AuthenticatedRequest;

      if (req.path === "/health" || req.path.startsWith("/activity-logs")) {
        return;
      }

      const preview = extractTargetPreview(req);

      void this.activityLogsService.add({
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        actorId: request.user?.id,
        actorRole: request.user?.role,
        actorEmail: request.user?.email,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        durationMs: Date.now() - start,
        targetType: preview.targetType,
        targetLabel: preview.targetLabel,
      }).catch(() => {
        // Les erreurs de logging ne doivent pas bloquer la requete principale.
      });
    });

    next();
  }
}
