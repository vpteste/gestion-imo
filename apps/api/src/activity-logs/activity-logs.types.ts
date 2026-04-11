export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  actorId?: string;
  actorRole?: string;
  actorEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  durationMs?: number;
}

export interface ActivityLogFilters {
  role?: string;
  actorId?: string;
  method?: string;
  statusCode?: number;
  pathContains?: string;
  limit?: number;
}
