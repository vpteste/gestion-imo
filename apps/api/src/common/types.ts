import type { UserRole } from "@gestion/shared";

export interface RequestUser {
  id: string;
  role: UserRole;
  email?: string;
  fullName?: string;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: RequestUser;
}
