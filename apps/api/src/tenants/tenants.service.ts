import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, randomUUID } from "crypto";
import { promises as fs } from "node:fs";
import nodemailer from "nodemailer";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateTenantDto,
  TenantEntity,
  TenantFilters,
  UpdateTenantDto,
} from "./tenants.types";

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value == null) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  private tenants: TenantEntity[] = [];

  private buildLeaseReference(): string {
    const stamp = new Date().toISOString().slice(0, 7).replace("-", "");
    return `BAIL-${stamp}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  findAll(filters: TenantFilters): TenantEntity[] {
    let result = [...this.tenants];

    if (filters.status) {
      result = result.filter((t) => t.status === filters.status);
    }

    if (filters.currentPropertyId) {
      result = result.filter(
        (t) => t.currentPropertyId === filters.currentPropertyId,
      );
    }

    if (filters.currentPropertyIds?.length) {
      result = result.filter(
        (t) => !!t.currentPropertyId && filters.currentPropertyIds!.includes(t.currentPropertyId),
      );
    }

    return result;
  }

  async isDbAvailable(): Promise<boolean> {
    return this.prisma.isAvailable();
  }

  private async sendActivationEmail(user: {
    email: string;
    fullName: string;
    activationToken: string;
    activationTokenExpiresAt: string;
  }): Promise<void> {
    const host = process.env.SMTP_HOST?.trim();
    if (!host) {
      throw new BadRequestException("SMTP_HOST manquant: configuration email requise");
    }

    const port = Number(process.env.SMTP_PORT ?? "587");
    const secure = parseBooleanFlag(process.env.SMTP_SECURE, port === 465);
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS ?? "";
    const from = process.env.SMTP_FROM?.trim() || smtpUser || "noreply@gestion.local";

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    });

    await transporter.sendMail({
      from,
      to: user.email,
      subject: "Activation de votre compte locataire",
      text: `Bonjour ${user.fullName},\n\nVotre compte locataire a ete cree. Utilisez ce token d'activation: ${user.activationToken}\n\nCe token expire le ${user.activationTokenExpiresAt}.`,
    });
  }

  private mapTenantFromDb(item: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    dateOfBirth?: Date | null;
    nationalId?: string | null;
    monthlyIncome?: any;
    createdAt: Date;
    updatedAt: Date;
    leases?: Array<{
      id: string;
      reference: string;
      propertyId: string;
      status: string;
      property: {
        reference: string;
      };
    }>;
  }): TenantEntity {
    const [firstName, ...rest] = item.fullName.trim().split(/\s+/);
    const lastName = rest.join(" ") || "";
    const leases = item.leases ?? [];
    const activeLease = leases.find((lease) => lease.status === "active") ?? leases[0];

    return {
      id: item.id,
      firstName: firstName || item.fullName,
      lastName,
      email: item.email,
      phone: item.phone ?? undefined,
      dateOfBirth: item.dateOfBirth?.toISOString(),
      nationalId: item.nationalId ?? undefined,
      currentPropertyId: activeLease?.propertyId,
      currentPropertyReference: activeLease?.property.reference,
      leaseId: activeLease?.id,
      leaseReference: activeLease?.reference,
      monthlyIncome: item.monthlyIncome != null ? Number(item.monthlyIncome) : undefined,
      status: activeLease ? "actif" : "en_attente",
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  async findAllDb(filters: TenantFilters): Promise<TenantEntity[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        role: "locataire",
        leases: filters.currentPropertyId || filters.currentPropertyIds?.length
          ? {
              some: {
                propertyId: filters.currentPropertyId
                  ? filters.currentPropertyId
                  : { in: filters.currentPropertyIds },
              },
            }
          : undefined,
      },
      include: {
        leases: {
          select: {
            id: true,
            reference: true,
            propertyId: true,
            status: true,
            property: {
              select: {
                reference: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    let items = rows.map((row) => this.mapTenantFromDb(row));

    if (filters.status) {
      items = items.filter((tenant) => tenant.status === filters.status);
    }

    return items;
  }

  findOne(id: string): TenantEntity {
    const tenant = this.tenants.find((t) => t.id === id);

    if (!tenant) {
      throw new NotFoundException(`Locataire ${id} introuvable`);
    }

    return tenant;
  }

  async findOneDb(id: string): Promise<TenantEntity> {
    const row = await this.prisma.user.findFirst({
      where: {
        role: "locataire",
        OR: [{ id }, { email: id }],
      },
      include: {
        leases: {
          select: {
            id: true,
            reference: true,
            propertyId: true,
            status: true,
            property: {
              select: {
                reference: true,
              },
            },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(`Locataire ${id} introuvable`);
    }

    return this.mapTenantFromDb(row);
  }

  create(dto: CreateTenantDto): TenantEntity {
    // Unicité email
    const exists = this.tenants.some(
      (t) => t.email.toLowerCase() === dto.email.toLowerCase(),
    );

    if (exists) {
      throw new BadRequestException(
        `Un locataire avec l'email ${dto.email} existe déjà`,
      );
    }

    const now = new Date().toISOString();
    const hasProperty = !!dto.currentPropertyId;
    const leaseId = dto.leaseId ?? (hasProperty ? randomUUID() : undefined);
    const leaseReference = hasProperty ? this.buildLeaseReference() : undefined;
    const activationToken = randomBytes(24).toString("hex");
    const activationTokenExpiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const tenant: TenantEntity = {
      id: randomUUID(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      dateOfBirth: dto.dateOfBirth,
      nationalId: dto.nationalId,
      currentPropertyId: dto.currentPropertyId,
      currentPropertyReference: dto.currentPropertyId,
      leaseId,
      leaseReference,
      monthlyIncome: dto.monthlyIncome,
      status: leaseId ? "actif" : "en_attente",
      createdAt: now,
      updatedAt: now,
      activation: {
        token: process.env.NODE_ENV === "production" ? undefined : activationToken,
        expiresAt: activationTokenExpiresAt,
      },
    };

    this.tenants.push(tenant);
    return tenant;
  }

  async createDb(dto: CreateTenantDto): Promise<TenantEntity> {
    const fullName = `${dto.firstName} ${dto.lastName}`.trim();
    const property = dto.currentPropertyId
      ? await this.prisma.property.findFirst({
          where: {
            OR: [{ id: dto.currentPropertyId }, { reference: dto.currentPropertyId }],
          },
          select: {
            id: true,
            rentAmount: true,
            propertyType: true,
          },
        })
      : null;

    if (property?.propertyType === "land") {
      throw new BadRequestException("Un terrain est reserve a la vente et ne peut pas etre rattache a un bail locatif");
    }

    const activationToken = randomBytes(24).toString("hex");
    const activationTokenExpiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: "",
        fullName,
        phone: dto.phone,
        monthlyIncome: dto.monthlyIncome,
        role: "locataire",
        status: "pending",
        activationToken,
        activationTokenExpiresAt,
      },
    });

    if (property) {
      await this.prisma.lease.create({
        data: {
          reference: this.buildLeaseReference(),
          propertyId: property.id,
          tenantId: created.id,
          startDate: new Date(),
          monthlyRent: property.rentAmount,
          status: "active",
        },
      });
    }

    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        leases: {
          select: {
            id: true,
            reference: true,
            propertyId: true,
            status: true,
            property: {
              select: {
                reference: true,
              },
            },
          },
        },
      },
    });

    await this.sendActivationEmail({
      email: created.email,
      fullName,
      activationToken,
      activationTokenExpiresAt: activationTokenExpiresAt.toISOString(),
    });

    const tenant = this.mapTenantFromDb(row);
    return {
      ...tenant,
      activation: {
        token: process.env.NODE_ENV === "production" ? undefined : activationToken,
        expiresAt: activationTokenExpiresAt.toISOString(),
      },
    };
  }

  update(id: string, dto: UpdateTenantDto): TenantEntity {
    const tenant = this.findOne(id);

    if (dto.email && dto.email !== tenant.email) {
      const conflict = this.tenants.some(
        (t) => t.id !== id && t.email.toLowerCase() === dto.email!.toLowerCase(),
      );

      if (conflict) {
        throw new BadRequestException(
          `L'email ${dto.email} est déjà utilisé`,
        );
      }
    }

    const updated: TenantEntity = {
      ...tenant,
      ...dto,
      leaseId: dto.currentPropertyId && !tenant.leaseId ? randomUUID() : (dto.leaseId ?? tenant.leaseId),
      currentPropertyReference: dto.currentPropertyId ?? tenant.currentPropertyReference,
      leaseReference: dto.currentPropertyId && !tenant.leaseReference ? this.buildLeaseReference() : tenant.leaseReference,
      updatedAt: new Date().toISOString(),
    };

    this.tenants = this.tenants.map((t) => (t.id === id ? updated : t));
    return updated;
  }

  async updateDb(id: string, dto: UpdateTenantDto): Promise<TenantEntity> {
    const existing = await this.prisma.user.findFirst({
      where: {
        role: "locataire",
        OR: [{ id }, { email: id }],
      },
      select: {
        id: true,
        fullName: true,
        leases: {
          select: {
            id: true,
            propertyId: true,
            status: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Locataire ${id} introuvable`);
    }

    const currentNameParts = existing.fullName.trim().split(/\s+/);
    const currentFirstName = currentNameParts[0] ?? "";
    const currentLastName = currentNameParts.slice(1).join(" ");

    let normalizedPropertyId: string | undefined;
    if (dto.currentPropertyId) {
      const property = await this.prisma.property.findFirst({
        where: {
          OR: [{ id: dto.currentPropertyId }, { reference: dto.currentPropertyId }],
        },
        select: {
          id: true,
          rentAmount: true,
          propertyType: true,
        },
      });

      if (property) {
        if (property.propertyType === "land") {
          throw new BadRequestException("Un terrain est reserve a la vente et ne peut pas etre rattache a un bail locatif");
        }

        normalizedPropertyId = property.id;
        const alreadyActive = existing.leases.some(
          (lease) => lease.status === "active" && lease.propertyId === property.id,
        );

        if (!alreadyActive) {
          await this.prisma.lease.create({
            data: {
              reference: this.buildLeaseReference(),
              propertyId: property.id,
              tenantId: existing.id,
              startDate: new Date(),
              monthlyRent: property.rentAmount,
              status: "active",
            },
          });
        }
      }
    }

    await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: `${dto.firstName ?? currentFirstName} ${dto.lastName ?? currentLastName}`.trim(),
        email: dto.email,
        phone: dto.phone,
        monthlyIncome: dto.monthlyIncome,
      },
      include: {
        leases: {
          select: {
            id: true,
            reference: true,
            propertyId: true,
            status: true,
            property: {
              select: {
                reference: true,
              },
            },
          },
        },
      },
    });

    if (normalizedPropertyId && dto.monthlyIncome == null) {
      const linkedProperty = await this.prisma.property.findUnique({
        where: { id: normalizedPropertyId },
        select: { rentAmount: true },
      });

      if (linkedProperty) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { monthlyIncome: linkedProperty.rentAmount },
        });
      }
    }

    const refreshed = await this.prisma.user.findUniqueOrThrow({
      where: { id: existing.id },
      include: {
        leases: {
          select: {
            id: true,
            reference: true,
            propertyId: true,
            status: true,
            property: {
              select: {
                reference: true,
              },
            },
          },
        },
      },
    });

    return this.mapTenantFromDb(refreshed);
  }

  remove(id: string): void {
    this.findOne(id); // lève une 404 si absent
    this.tenants = this.tenants.filter((t) => t.id !== id);
  }

  async removeDb(id: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        role: "locataire",
        OR: [{ id }, { email: id }],
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException(`Locataire ${id} introuvable`);
    }

    const leases = await this.prisma.lease.findMany({
      where: { tenantId: existing.id },
      select: { id: true },
    });
    const leaseIds = leases.map((item) => item.id);

    const contracts =
      leaseIds.length > 0
        ? await this.prisma.contract.findMany({
            where: { leaseId: { in: leaseIds } },
            select: { filePath: true },
          })
        : [];

    const documents =
      leaseIds.length > 0
        ? await this.prisma.document.findMany({
            where: { leaseId: { in: leaseIds } },
            select: { filePath: true },
          })
        : [];

    await this.prisma.$transaction(async (tx) => {
      if (leaseIds.length > 0) {
        await tx.payment.deleteMany({ where: { leaseId: { in: leaseIds } } });
        await tx.contract.deleteMany({ where: { leaseId: { in: leaseIds } } });
        await tx.document.deleteMany({ where: { leaseId: { in: leaseIds } } });
        await tx.lease.deleteMany({ where: { tenantId: existing.id } });
      }

      await tx.user.delete({ where: { id: existing.id } });
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
  }
}
