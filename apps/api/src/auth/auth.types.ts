import type { UserRole } from "@gestion/shared";

export interface JwtPayload {
  sub: string;
  email: string;
  fullName: string;
  role: UserRole;
  agency?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export type AccountStatus = "pending" | "active" | "suspended";

export interface IdentityLinks {
  propertyId?: string;
  propertyIds?: string[];
  leaseId?: string;
  agency?: string;
  agentCode?: string;
}

export interface ProvisionUserDto {
  email: string;
  fullName: string;
  role: UserRole;
  identityLinks?: IdentityLinks;
  initialPassword?: string;
}

export interface ActivateAccountDto {
  token: string;
  password: string;
}

export interface UpdateUserRoleDto {
  role: UserRole;
  identityLinks?: IdentityLinks;
}

export interface UpdateUserPasswordDto {
  password: string;
}
