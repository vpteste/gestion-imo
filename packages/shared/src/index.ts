export type UserRole = "admin" | "agent" | "proprietaire" | "locataire";

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
}

export interface HealthResponse {
  status: "ok";
  timestamp: string;
}
