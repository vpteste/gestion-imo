import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  CreateIncidentDto,
  IncidentEntity,
  IncidentFilters,
  UpdateIncidentDto,
} from "./incidents.types";

@Injectable()
export class IncidentsService {
  private readonly incidents: IncidentEntity[] = [];

  findAll(filters: IncidentFilters): IncidentEntity[] {
    return this.incidents.filter((incident) => {
      if (filters.propertyId && incident.propertyId !== filters.propertyId) {
        return false;
      }

      if (filters.propertyIds?.length && !filters.propertyIds.includes(incident.propertyId)) {
        return false;
      }

      if (filters.tenantId && incident.tenantId !== filters.tenantId) {
        return false;
      }

      if (filters.tenantEmail && incident.tenantEmail !== filters.tenantEmail) {
        return false;
      }

      if (filters.status && incident.status !== filters.status) {
        return false;
      }

      return true;
    });
  }

  findOne(id: string): IncidentEntity {
    const item = this.incidents.find((incident) => incident.id === id);
    if (!item) {
      throw new NotFoundException("Incident introuvable");
    }
    return item;
  }

  create(dto: CreateIncidentDto, actor: { tenantId: string; tenantEmail?: string }): IncidentEntity {
    const now = new Date().toISOString();

    const incident: IncidentEntity = {
      id: randomUUID(),
      propertyId: dto.propertyId ?? "",
      propertyReference: undefined,
      tenantId: actor.tenantId,
      tenantEmail: actor.tenantEmail,
      title: dto.title,
      description: dto.description,
      status: "ouvert",
      createdAt: now,
      updatedAt: now,
    };

    this.incidents.unshift(incident);
    return incident;
  }

  update(id: string, dto: UpdateIncidentDto): IncidentEntity {
    const incident = this.findOne(id);

    if (dto.title != null) {
      incident.title = dto.title;
    }

    if (dto.description != null) {
      incident.description = dto.description;
    }

    if (dto.status) {
      incident.status = dto.status;
    }
    incident.updatedAt = new Date().toISOString();

    return incident;
  }

  remove(id: string): { success: true } {
    const index = this.incidents.findIndex((incident) => incident.id === id);
    if (index < 0) {
      throw new NotFoundException("Incident introuvable");
    }

    this.incidents.splice(index, 1);
    return { success: true };
  }
}
