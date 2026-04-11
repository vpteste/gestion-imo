export interface CreateTenantDto {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
  nationalId?: string;
  currentPropertyId?: string;
  leaseId?: string;
  monthlyIncome?: number;
}

export interface UpdateTenantDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  nationalId?: string;
  currentPropertyId?: string;
  leaseId?: string;
  monthlyIncome?: number;
  status?: TenantStatus;
}

export type TenantStatus = "actif" | "inactif" | "en_attente";

export interface TenantFilters {
  status?: TenantStatus;
  currentPropertyId?: string;
  currentPropertyIds?: string[];
}

export interface TenantEntity {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
  nationalId?: string;
  currentPropertyId?: string;
  currentPropertyReference?: string;
  leaseId?: string;
  leaseReference?: string;
  monthlyIncome?: number;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
  activation?: {
    token?: string;
    expiresAt: string;
  };
}
