export interface ContractEntity {
  id: string;
  propertyId: string;
  propertyReference?: string;
  propertyTitle?: string;
  propertyAddress?: string;
  leaseId?: string;
  leaseReference?: string;
  tenantName?: string;
  fileName: string;
  storedFileName: string;
  filePath: string;
  mimeType: string;
  size: number;
  uploadedById?: string;
  uploadedAt: string;
}

export interface ContractFilters {
  propertyId?: string;
  leaseId?: string;
  leaseIds?: string[];
  propertyIds?: string[];
}
