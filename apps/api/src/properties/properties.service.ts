import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreatePropertyDto,
  PropertyEntity,
  PropertyFilters,
  UpdatePropertyDto,
} from "./properties.types";

const CITY_COORDS: Record<string, [number, number]> = {
  abidjan: [5.35995, -4.00826],
  cocody: [5.35444, -3.98056],
  yopougon: [5.33639, -4.08917],
  plateau: [5.319, -4.015],
  treichville: [5.298, -4.012],
  koumassi: [5.303, -3.962],
  abobo: [5.416, -4.017],
  bingerville: [5.35581, -3.88537],
  "port-bouet": [5.25556, -3.92639],
  yamoussoukro: [6.82762, -5.28934],
  bouake: [7.68963, -5.03031],
  korhogo: [9.45711, -5.62961],
  "san-pedro": [4.74851, -6.6363],
  "san pedro": [4.74851, -6.6363],
  daloa: [6.87735, -6.45022],
  man: [7.41251, -7.55383],
  gagnoa: [6.13193, -5.9506],
};

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeText(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  private cityFallbackCoords(city: string): [number, number] | undefined {
    return CITY_COORDS[this.normalizeText(city)];
  }

  private deterministicCoords(city: string): [number, number] {
    const normalized = this.normalizeText(city) || "unknown-city";
    let hash = 0;
    for (let index = 0; index < normalized.length; index += 1) {
      hash = (hash * 31 + normalized.charCodeAt(index)) % 100000;
    }

    // Cadre Côte d'Ivoire approximatif pour garder des points plausibles.
    const lat = 4 + (hash % 6000) / 1000; // 4.000 -> 9.999
    const lon = -8 + ((Math.floor(hash / 10) % 6000) / 1000); // -8.000 -> -2.001
    return [Number(lat.toFixed(6)), Number(lon.toFixed(6))];
  }

  private async geocode(dto: {
    addressLine: string;
    city: string;
    postalCode: string;
    country?: string;
  }): Promise<{ latitude?: number; longitude?: number }> {
    const fallback = this.cityFallbackCoords(dto.city);

    const params = new URLSearchParams({
      format: "json",
      limit: "1",
      street: dto.addressLine,
      city: dto.city,
      postalcode: dto.postalCode,
      country: dto.country ?? "Cote d'Ivoire",
    });

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
          "User-Agent": "GestionImmobiliere/1.0 (geocoding)",
          "Accept-Language": "fr",
        },
      });

      if (response.ok) {
        const data = (await response.json()) as Array<{ lat: string; lon: string }>;
        const first = data[0];
        if (first) {
          const lat = Number(first.lat);
          const lon = Number(first.lon);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            return { latitude: lat, longitude: lon };
          }
        }
      }
    } catch {
      // fallback city only
    }

    if (fallback) {
      return { latitude: fallback[0], longitude: fallback[1] };
    }

    const synthetic = this.deterministicCoords(dto.city);
    return { latitude: synthetic[0], longitude: synthetic[1] };
  }

  private toInitials(value: string, max = 3): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, max)
      .padEnd(2, "X");
  }

  private buildAutoReference(dto: CreatePropertyDto): string {
    const cityCode = this.toInitials(dto.city, 3);
    const titleCode = this.toInitials(dto.title, 3);
    const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `CI-${cityCode}-${titleCode}-${stamp}-${rand}`;
  }

  private ensureReference(dto: CreatePropertyDto): string {
    const candidate = dto.reference?.trim();
    return candidate && candidate.length > 0 ? candidate : this.buildAutoReference(dto);
  }

  private toEntity(item: {
    id: string;
    reference: string;
    title: string;
    propertyType: "apartment" | "house" | "studio" | "land";
    addressLine: string;
    city: string;
    postalCode: string;
    country: string;
    latitude: any;
    longitude: any;
    rentAmount: any;
    chargesAmount: any;
    ownerId: string;
    agentId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PropertyEntity {
    return {
      id: item.id,
      reference: item.reference,
      title: item.title,
      propertyType: item.propertyType,
      addressLine: item.addressLine,
      city: item.city,
      postalCode: item.postalCode,
      country: item.country,
      latitude: item.latitude != null ? Number(item.latitude) : undefined,
      longitude: item.longitude != null ? Number(item.longitude) : undefined,
      rentAmount: Number(item.rentAmount),
      chargesAmount: Number(item.chargesAmount),
      ownerId: item.ownerId,
      agentId: item.agentId ?? undefined,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private readonly properties: PropertyEntity[] = [];

  findAll(filters: PropertyFilters): PropertyEntity[] {
    return this.properties.filter((property) => {
      if (filters.city && property.city.toLowerCase() !== filters.city.toLowerCase()) {
        return false;
      }

      if (filters.propertyType && property.propertyType !== filters.propertyType) {
        return false;
      }

      if (filters.ownerId && property.ownerId !== filters.ownerId) {
        return false;
      }

      if (filters.agentId && property.agentId !== filters.agentId) {
        return false;
      }

      return true;
    });
  }

  async findAllDb(filters: PropertyFilters): Promise<PropertyEntity[]> {
    const rows = await this.prisma.property.findMany({
      where: {
        city: filters.city ? { equals: filters.city, mode: "insensitive" } : undefined,
        propertyType: filters.propertyType,
        ownerId: filters.ownerId,
        agentId: filters.agentId,
      },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((item) => this.toEntity(item));
  }

  async isDbAvailable(): Promise<boolean> {
    return this.prisma.isAvailable();
  }

  async getOwnerPropertyKeysDb(ownerId: string): Promise<string[]> {
    const rows = await this.prisma.property.findMany({
      where: { ownerId },
      select: { id: true, reference: true },
    });

    return rows.flatMap((property) => [property.id, property.reference]);
  }

  getOwnerPropertyKeys(ownerId: string): string[] {
    return this.properties
      .filter((property) => property.ownerId === ownerId)
      .flatMap((property) => [property.id, property.reference]);
  }

  getAgentPropertyKeys(agentId: string): string[] {
    return this.properties
      .filter((property) => property.agentId === agentId)
      .flatMap((property) => [property.id, property.reference]);
  }

  async getAgentPropertyKeysDb(agentId: string): Promise<string[]> {
    const rows = await this.prisma.property.findMany({
      where: { agentId },
      select: { id: true, reference: true },
    });

    return rows.flatMap((property) => [property.id, property.reference]);
  }

  findOne(id: string): PropertyEntity {
    const property = this.properties.find((item) => item.id === id);

    if (!property) {
      throw new NotFoundException("Bien introuvable");
    }

    return property;
  }

  async findOneDb(id: string): Promise<PropertyEntity> {
    const row = await this.prisma.property.findFirst({
      where: {
        OR: [{ id }, { reference: id }],
      },
    });

    if (!row) {
      throw new NotFoundException("Bien introuvable");
    }

    return this.toEntity(row);
  }

  create(dto: CreatePropertyDto): PropertyEntity {
    const now = new Date().toISOString();
    const reference = this.ensureReference(dto);
    const fallback = this.cityFallbackCoords(dto.city) ?? this.deterministicCoords(dto.city);

    const duplicate = this.properties.some((item) => item.reference === reference);
    if (duplicate) {
      throw new BadRequestException("La reference du bien existe deja");
    }

    const property: PropertyEntity = {
      id: randomUUID(),
      reference,
      title: dto.title,
      propertyType: dto.propertyType ?? "apartment",
      addressLine: dto.addressLine,
      city: dto.city,
      postalCode: dto.postalCode,
      country: dto.country ?? "Cote d'Ivoire",
      latitude: fallback[0],
      longitude: fallback[1],
      rentAmount: dto.rentAmount,
      chargesAmount: dto.chargesAmount ?? 0,
      ownerId: dto.ownerId,
      agentId: dto.agentId,
      createdAt: now,
      updatedAt: now,
    };

    this.properties.push(property);
    return property;
  }

  async createDb(dto: CreatePropertyDto): Promise<PropertyEntity> {
    const reference = this.ensureReference(dto);
    const geo = await this.geocode({
      addressLine: dto.addressLine,
      city: dto.city,
      postalCode: dto.postalCode,
      country: dto.country,
    });

    try {
      const row = await this.prisma.property.create({
        data: {
          reference,
          title: dto.title,
          propertyType: dto.propertyType,
          addressLine: dto.addressLine,
          city: dto.city,
          postalCode: dto.postalCode,
          country: dto.country ?? "Cote d'Ivoire",
          latitude: geo.latitude,
          longitude: geo.longitude,
          rentAmount: dto.rentAmount,
          chargesAmount: dto.chargesAmount ?? 0,
          ownerId: dto.ownerId,
          agentId: dto.agentId,
        },
      });

      return this.toEntity(row);
    } catch (error) {
      const prismaError = error as { code?: string; meta?: { target?: string[] | string } };
      const target = prismaError.meta?.target;
      const targets = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
      if (prismaError.code === "P2002" && targets.some((field) => String(field).includes("reference"))) {
        throw new BadRequestException("La reference du bien existe deja");
      }

      throw error;
    }
  }

  update(id: string, dto: UpdatePropertyDto): PropertyEntity {
    const property = this.findOne(id);

    Object.assign(property, dto, {
      updatedAt: new Date().toISOString(),
    });

    return property;
  }

  async updateDb(id: string, dto: UpdatePropertyDto): Promise<PropertyEntity> {
    const existing = await this.prisma.property.findFirst({
      where: {
        OR: [{ id }, { reference: id }],
      },
      select: {
        id: true,
        addressLine: true,
        city: true,
        postalCode: true,
        country: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Bien introuvable");
    }

    const geo = (dto.city || dto.addressLine || dto.postalCode || dto.country)
      ? await this.geocode({
          addressLine: dto.addressLine ?? existing.addressLine,
          city: dto.city ?? existing.city,
          postalCode: dto.postalCode ?? existing.postalCode,
          country: dto.country ?? existing.country,
        })
      : undefined;

    const row = await this.prisma.property.update({
      where: { id: existing.id },
      data: {
        title: dto.title,
        propertyType: dto.propertyType,
        addressLine: dto.addressLine,
        city: dto.city,
        postalCode: dto.postalCode,
        country: dto.country,
        latitude: geo?.latitude,
        longitude: geo?.longitude,
        rentAmount: dto.rentAmount,
        chargesAmount: dto.chargesAmount,
        ownerId: dto.ownerId,
        agentId: dto.agentId,
      },
    });

    return this.toEntity(row);
  }

  remove(id: string): { success: true } {
    const index = this.properties.findIndex((item) => item.id === id);

    if (index < 0) {
      throw new NotFoundException("Bien introuvable");
    }

    this.properties.splice(index, 1);
    return { success: true };
  }

  async removeDb(id: string): Promise<{ success: true }> {
    const existing = await this.prisma.property.findFirst({
      where: {
        OR: [{ id }, { reference: id }],
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException("Bien introuvable");
    }

    const leases = await this.prisma.lease.findMany({
      where: { propertyId: existing.id },
      select: { id: true },
    });
    const leaseIds = leases.map((item) => item.id);

    const contracts = await this.prisma.contract.findMany({
      where: {
        OR: [
          { propertyId: existing.id },
          ...(leaseIds.length > 0 ? [{ leaseId: { in: leaseIds } }] : []),
        ],
      },
      select: { filePath: true },
    });

    const documents = await this.prisma.document.findMany({
      where: {
        OR: [
          { propertyId: existing.id },
          ...(leaseIds.length > 0 ? [{ leaseId: { in: leaseIds } }] : []),
        ],
      },
      select: { filePath: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (leaseIds.length > 0) {
        await tx.payment.deleteMany({
          where: { leaseId: { in: leaseIds } },
        });
      }

      await tx.contract.deleteMany({ where: { propertyId: existing.id } });
      if (leaseIds.length > 0) {
        await tx.contract.deleteMany({ where: { leaseId: { in: leaseIds } } });
      }

      await tx.document.deleteMany({ where: { propertyId: existing.id } });
      if (leaseIds.length > 0) {
        await tx.document.deleteMany({ where: { leaseId: { in: leaseIds } } });
      }

      await tx.lease.deleteMany({ where: { propertyId: existing.id } });
      await tx.property.delete({ where: { id: existing.id } });
    });

    const filesToDelete = [
      ...contracts.map((item) => item.filePath),
      ...documents.map((item) => item.filePath),
    ];
    await Promise.all(
      filesToDelete.map(async (filePath) => {
        try {
          await fs.unlink(filePath);
        } catch {
          // ignore missing files
        }
      }),
    );

    return { success: true };
  }
}
