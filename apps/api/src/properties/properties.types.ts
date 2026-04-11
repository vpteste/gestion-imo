export type PropertyType = "apartment" | "house" | "studio" | "land";

export interface CreatePropertyDto {
  reference?: string;
  title: string;
  propertyType?: PropertyType;
  addressLine: string;
  city: string;
  postalCode: string;
  country?: string;
  rentAmount: number;
  chargesAmount?: number;
  ownerId?: string;
  agentId?: string;
}

export interface UpdatePropertyDto {
  title?: string;
  propertyType?: PropertyType;
  addressLine?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  rentAmount?: number;
  chargesAmount?: number;
  ownerId?: string;
  agentId?: string;
}

export interface PropertyFilters {
  city?: string;
  propertyType?: PropertyType;
  ownerId?: string;
  agentId?: string;
}

export interface PropertyEntity {
  id: string;
  reference: string;
  title: string;
  propertyType: PropertyType;
  addressLine: string;
  city: string;
  postalCode: string;
  country: string;
  latitude?: number;
  longitude?: number;
  rentAmount: number;
  chargesAmount: number;
  ownerId: string;
  agentId?: string;
  createdAt: string;
  updatedAt: string;
}
