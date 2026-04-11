import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateInspectionDto,
  InspectionEntity,
  InspectionFilters,
  InspectionPhoto,
  InspectionType,
  UpdateInspectionDto,
} from "./inspections.types";

@Injectable()
export class InspectionsService {
  private readonly inspections: InspectionEntity[] = [];

  constructor(private readonly prisma: PrismaService) {}

  private mapDbInspection(item: {
    id: string;
    propertyId: string;
    leaseId: string;
    type: InspectionType;
    status: "planifie" | "realise" | "valide";
    notes: string | null;
    entreeNotes: string | null;
    sortieNotes: string | null;
    scheduledAt: Date;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
    signedByTenantAt: Date | null;
    signedByTenantName: string | null;
    signedByTenantSignatureDataUrl: string | null;
    photos: Array<{
      phase: InspectionType;
      filename: string;
      url: string;
      uploadedAt: Date;
      uploadedById: string | null;
    }>;
  }): InspectionEntity {
    const entreePhotos: InspectionPhoto[] = [];
    const sortiePhotos: InspectionPhoto[] = [];

    for (const photo of item.photos) {
      const mapped: InspectionPhoto = {
        filename: photo.filename,
        url: photo.url,
        uploadedAt: photo.uploadedAt.toISOString(),
        uploadedById: photo.uploadedById ?? undefined,
      };

      if (photo.phase === "entree") {
        entreePhotos.push(mapped);
      } else {
        sortiePhotos.push(mapped);
      }
    }

    return {
      id: item.id,
      propertyId: item.propertyId,
      leaseId: item.leaseId,
      type: item.type,
      status: item.status,
      notes: item.notes ?? undefined,
      entreeNotes: item.entreeNotes ?? undefined,
      sortieNotes: item.sortieNotes ?? undefined,
      entreePhotos,
      sortiePhotos,
      scheduledAt: item.scheduledAt.toISOString(),
      createdById: item.createdById ?? undefined,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      signedByTenantAt: item.signedByTenantAt?.toISOString(),
      signedByTenantName: item.signedByTenantName ?? undefined,
      signedByTenantSignatureDataUrl: item.signedByTenantSignatureDataUrl ?? undefined,
    };
  }

  async findAll(filters: InspectionFilters): Promise<InspectionEntity[]> {
    try {
      const where: {
        propertyId?: string | { in: string[] };
        leaseId?: string | { in: string[] };
        status?: "planifie" | "realise" | "valide";
        type?: InspectionType;
      } = {};

      if (filters.propertyIds?.length) {
        where.propertyId = { in: filters.propertyIds };
      } else if (filters.propertyId) {
        where.propertyId = filters.propertyId;
      }

      if (filters.leaseIds?.length) {
        where.leaseId = { in: filters.leaseIds };
      } else if (filters.leaseId) {
        where.leaseId = filters.leaseId;
      }

      if (filters.status) {
        where.status = filters.status;
      }
      if (filters.type) {
        where.type = filters.type;
      }

      const rows = await this.prisma.inspection.findMany({
        where,
        include: {
          photos: {
            orderBy: {
              uploadedAt: "asc",
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return rows.map((row) => this.mapDbInspection(row));
    } catch {
      return this.inspections.filter((item) => {
        if (filters.propertyId && item.propertyId !== filters.propertyId) {
          return false;
        }
        if (filters.propertyIds?.length && !filters.propertyIds.includes(item.propertyId)) {
          return false;
        }
        if (filters.leaseId && item.leaseId !== filters.leaseId) {
          return false;
        }
        if (filters.leaseIds?.length && !filters.leaseIds.includes(item.leaseId)) {
          return false;
        }
        if (filters.status && item.status !== filters.status) {
          return false;
        }
        if (filters.type && item.type !== filters.type) {
          return false;
        }
        return true;
      });
    }
  }

  async findOne(id: string): Promise<InspectionEntity> {
    try {
      const row = await this.prisma.inspection.findUnique({
        where: { id },
        include: {
          photos: {
            orderBy: {
              uploadedAt: "asc",
            },
          },
        },
      });

      if (!row) {
        throw new NotFoundException("Etat des lieux introuvable");
      }
      return this.mapDbInspection(row);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const inspection = this.inspections.find((item) => item.id === id);
      if (!inspection) {
        throw new NotFoundException("Etat des lieux introuvable");
      }
      return inspection;
    }
  }

  async create(dto: CreateInspectionDto, actorId?: string): Promise<InspectionEntity> {
    try {
      const created = await this.prisma.inspection.create({
        data: {
          id: randomUUID(),
          propertyId: dto.propertyId,
          leaseId: dto.leaseId,
          type: dto.type,
          status: "planifie",
          notes: dto.notes,
          entreeNotes: dto.entreeNotes,
          sortieNotes: dto.sortieNotes,
          scheduledAt: new Date(dto.scheduledAt),
          createdById: actorId,
        },
        include: {
          photos: true,
        },
      });
      return this.mapDbInspection(created);
    } catch {
      const now = new Date().toISOString();
      const inspection: InspectionEntity = {
        id: randomUUID(),
        propertyId: dto.propertyId,
        leaseId: dto.leaseId,
        type: dto.type,
        status: "planifie",
        notes: dto.notes,
        entreeNotes: dto.entreeNotes,
        sortieNotes: dto.sortieNotes,
        entreePhotos: [],
        sortiePhotos: [],
        scheduledAt: dto.scheduledAt,
        createdById: actorId,
        createdAt: now,
        updatedAt: now,
      };

      this.inspections.unshift(inspection);
      return inspection;
    }
  }

  async update(id: string, dto: UpdateInspectionDto): Promise<InspectionEntity> {
    try {
      const existing = await this.prisma.inspection.findUnique({ where: { id }, select: { id: true } });
      if (!existing) {
        throw new NotFoundException("Etat des lieux introuvable");
      }

      const updated = await this.prisma.inspection.update({
        where: { id },
        data: {
          status: dto.status,
          notes: dto.notes,
          entreeNotes: dto.entreeNotes,
          sortieNotes: dto.sortieNotes,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        },
        include: {
          photos: {
            orderBy: {
              uploadedAt: "asc",
            },
          },
        },
      });

      return this.mapDbInspection(updated);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      const inspection = await this.findOne(id);
      if (dto.status) {
        inspection.status = dto.status;
      }
      if (dto.notes !== undefined) {
        inspection.notes = dto.notes;
      }
      if (dto.entreeNotes !== undefined) {
        inspection.entreeNotes = dto.entreeNotes;
      }
      if (dto.sortieNotes !== undefined) {
        inspection.sortieNotes = dto.sortieNotes;
      }
      if (dto.scheduledAt) {
        inspection.scheduledAt = dto.scheduledAt;
      }
      inspection.updatedAt = new Date().toISOString();
      return inspection;
    }
  }

  async addPhoto(id: string, phase: InspectionType, filename: string, actorId?: string): Promise<InspectionEntity> {
    try {
      const existing = await this.prisma.inspection.findUnique({ where: { id }, select: { id: true } });
      if (!existing) {
        throw new NotFoundException("Etat des lieux introuvable");
      }

      await this.prisma.inspectionPhoto.create({
        data: {
          id: randomUUID(),
          inspectionId: id,
          phase,
          filename,
          url: `/uploads/inspections/${filename}`,
          uploadedById: actorId,
        },
      });

      return this.findOne(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      const inspection = await this.findOne(id);
      const photo: InspectionPhoto = {
        filename,
        url: `/uploads/inspections/${filename}`,
        uploadedAt: new Date().toISOString(),
        uploadedById: actorId,
      };

      if (phase === "entree") {
        inspection.entreePhotos.push(photo);
      } else {
        inspection.sortiePhotos.push(photo);
      }

      inspection.updatedAt = new Date().toISOString();
      return inspection;
    }
  }

  async removePhoto(id: string, phase: InspectionType, filename: string): Promise<InspectionEntity> {
    try {
      await this.prisma.inspectionPhoto.deleteMany({
        where: {
          inspectionId: id,
          phase,
          filename,
        },
      });
      return this.findOne(id);
    } catch {
      const inspection = await this.findOne(id);
      if (phase === "entree") {
        inspection.entreePhotos = inspection.entreePhotos.filter((p) => p.filename !== filename);
      } else {
        inspection.sortiePhotos = inspection.sortiePhotos.filter((p) => p.filename !== filename);
      }
      inspection.updatedAt = new Date().toISOString();
      return inspection;
    }
  }

  async signByTenant(id: string): Promise<InspectionEntity> {
    return this.signByTenantWithDetails(id, {});
  }

  async signByTenantWithDetails(
    id: string,
    payload: { tenantName?: string; signatureDataUrl?: string },
  ): Promise<InspectionEntity> {
    try {
      const existing = await this.prisma.inspection.findUnique({
        where: { id },
        select: { id: true, status: true, signedByTenantName: true, signedByTenantSignatureDataUrl: true },
      });

      if (!existing) {
        throw new NotFoundException("Etat des lieux introuvable");
      }

      await this.prisma.inspection.update({
        where: { id },
        data: {
          signedByTenantAt: new Date(),
          signedByTenantName: payload.tenantName?.trim() || existing.signedByTenantName,
          signedByTenantSignatureDataUrl:
            payload.signatureDataUrl?.trim() || existing.signedByTenantSignatureDataUrl,
          status: existing.status === "realise" ? "valide" : existing.status,
        },
      });

      return this.findOne(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      const inspection = await this.findOne(id);
      inspection.signedByTenantAt = new Date().toISOString();
      inspection.signedByTenantName = payload.tenantName?.trim() || inspection.signedByTenantName;
      inspection.signedByTenantSignatureDataUrl =
        payload.signatureDataUrl?.trim() || inspection.signedByTenantSignatureDataUrl;
      inspection.updatedAt = inspection.signedByTenantAt;
      if (inspection.status === "realise") {
        inspection.status = "valide";
      }
      return inspection;
    }
  }

  async remove(id: string): Promise<{ success: true }> {
    try {
      const existing = await this.prisma.inspection.findUnique({ where: { id }, select: { id: true } });
      if (!existing) {
        throw new NotFoundException("Etat des lieux introuvable");
      }
      await this.prisma.inspection.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      const index = this.inspections.findIndex((item) => item.id === id);
      if (index < 0) {
        throw new NotFoundException("Etat des lieux introuvable");
      }

      this.inspections.splice(index, 1);
      return { success: true };
    }
  }
}
