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
  durationMs?: number | undefined;
  targetType?: string;
  targetLabel?: string;
}

export interface ActivityLogFilters {
  role?: string;
  actorId?: string;
  method?: string;
  statusCode?: number;
  pathContains?: string;
  limit?: number;
}

export interface OnlineAgentEntry {
  agentId: string;
  agentEmail?: string;
  lastSeenAt: string;
  ipAddress?: string;
  userAgent?: string;
  deviceSummary?: string;
}
