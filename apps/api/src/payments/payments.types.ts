export type PaymentStatus = "paye" | "retard" | "impaye";

export interface PaymentEntity {
  id: string;
  leaseId: string;
  leaseReference?: string;
  propertyReference?: string;
  propertyTitle?: string;
  tenantName: string;
  tenantEmail?: string;
  ownerId?: string;
  dueDate: string;
  amountDue: number;
  amountPaid?: number;
  paidAt?: string;
  status: PaymentStatus;
  lateDays: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentDto {
  leaseId: string;
  tenantName: string;
  tenantEmail?: string;
  dueDate: string;
  amountDue: number;
}

export interface UpdatePaymentDto {
  amountPaid?: number;
  paidAt?: string;
  status?: PaymentStatus;
  lateDays?: number;
  notes?: string;
}

export interface PaymentFilters {
  status?: PaymentStatus;
  leaseId?: string;
  leaseIds?: string[];
  tenantEmail?: string;
  ownerId?: string;
}

export interface ReceiptResult {
  paymentId: string;
  receiptPath: string;
  generatedAt: string;
}
