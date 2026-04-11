export type InspectionType = "entree" | "sortie";
export type InspectionStatus = "planifie" | "realise" | "valide";

export interface InspectionPhoto {
  filename: string;
  url: string;
  uploadedAt: string;
  uploadedById?: string;
}

export interface InspectionEntity {
  id: string;
  propertyId: string;
  leaseId: string;
  type: InspectionType;
  status: InspectionStatus;
  notes?: string;
  // Notes par phase
  entreeNotes?: string;
  sortieNotes?: string;
  // Photos par phase
  entreePhotos: InspectionPhoto[];
  sortiePhotos: InspectionPhoto[];
  scheduledAt: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  signedByTenantAt?: string;
  signedByTenantName?: string;
  signedByTenantSignatureDataUrl?: string;
}

export interface InspectionFilters {
  propertyId?: string;
  propertyIds?: string[];
  leaseId?: string;
  leaseIds?: string[];
  status?: InspectionStatus;
  type?: InspectionType;
}

export interface CreateInspectionDto {
  propertyId: string;
  leaseId: string;
  type: InspectionType;
  notes?: string;
  entreeNotes?: string;
  sortieNotes?: string;
  scheduledAt: string;
}

export interface UpdateInspectionDto {
  status?: InspectionStatus;
  notes?: string;
  entreeNotes?: string;
  sortieNotes?: string;
  scheduledAt?: string;
}

export interface AddPhotoDto {
  phase: InspectionType;
}

export interface SignInspectionDto {
  tenantName?: string;
  signatureDataUrl?: string;
}
