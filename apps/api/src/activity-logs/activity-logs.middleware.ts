import { Injectable, NestMiddleware } from "@nestjs/common";
import type { AuthenticatedRequest } from "../common/types";
import { ActivityLogsService } from "./activity-logs.service";

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
      }).catch(() => {
        // Les erreurs de logging ne doivent pas bloquer la requete principale.
      });
    });

    next();
  }
}
