export type IncidentStatus = "ouvert" | "en_cours" | "resolu";

export interface IncidentEntity {
  id: string;
  propertyId: string;
  propertyReference?: string;
  tenantId: string;
  tenantEmail?: string;
  title: string;
  description: string;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentFilters {
  propertyId?: string;
  propertyIds?: string[];
  tenantId?: string;
  tenantEmail?: string;
  status?: IncidentStatus;
}

export interface CreateIncidentDto {
  propertyId?: string;
  title: string;
  description: string;
}

export interface UpdateIncidentDto {
  title?: string;
  description?: string;
  status?: IncidentStatus;
}
