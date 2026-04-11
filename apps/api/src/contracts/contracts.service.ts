import { Injectable, NotFoundException } from "@nestjs/common";
import { promises as fs } from "node:fs";
import { basename } from "node:path";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { ContractEntity, ContractFilters } from "./contracts.types";

const STORAGE_DIR = join(process.cwd(), "storage", "contracts");

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly contracts: ContractEntity[] = [];

  async isDbAvailable(): Promise<boolean> {
    return this.prisma.isAvailable();
  }

  private mapContractFromDb(item: {
    id: string;
    propertyId: string;
    leaseId: string | null;
    fileName: string;
    filePath: string;
    mimeType: string;
    uploadedById: string | null;
    uploadedAt: Date;
    property: {
      reference: string;
      title: string;
      addressLine: string;
      city: string;
    };
    lease: {
      reference: string;
      tenant: {
        fullName: string;
      };
    } | null;
  }): ContractEntity {
    return {
      id: item.id,
      propertyId: item.propertyId,
      propertyReference: item.property.reference,
      propertyTitle: item.property.title,
      propertyAddress: `${item.property.addressLine}, ${item.property.city}`,
      leaseId: item.leaseId ?? undefined,
      leaseReference: item.lease?.reference ?? undefined,
      tenantName: item.lease?.tenant.fullName,
      fileName: item.fileName,
      storedFileName: basename(item.filePath),
      filePath: item.filePath,
      mimeType: item.mimeType,
      size: 0,
      uploadedById: item.uploadedById ?? undefined,
      uploadedAt: item.uploadedAt.toISOString(),
    };
  }

  async ensureStorageDir(): Promise<void> {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  }

  async findAll(filters: ContractFilters): Promise<ContractEntity[]> {
    return this.contracts.filter((item) => {
      if (filters.propertyIds && !filters.propertyIds.includes(item.propertyId)) {
        return false;
      }

      if (filters.leaseIds && (!item.leaseId || !filters.leaseIds.includes(item.leaseId))) {
        return false;
      }

      if (filters.propertyId && item.propertyId !== filters.propertyId) {
        return false;
      }

      if (filters.leaseId && item.leaseId !== filters.leaseId) {
        return false;
      }

      return true;
    });
  }

  async findAllDb(filters: ContractFilters): Promise<ContractEntity[]> {
    const rows = await this.prisma.contract.findMany({
      where: {
        propertyId: filters.propertyIds?.length ? { in: filters.propertyIds } : filters.propertyId,
        leaseId: filters.leaseIds?.length ? { in: filters.leaseIds } : filters.leaseId,
      },
      include: {
        property: {
          select: {
            reference: true,
            title: true,
            addressLine: true,
            city: true,
          },
        },
        lease: {
          select: {
            reference: true,
            tenant: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
      orderBy: { uploadedAt: "desc" },
    });

    return rows.map((row) => this.mapContractFromDb(row));
  }

  async findOne(id: string): Promise<ContractEntity> {
    const contract = this.contracts.find((item) => item.id === id);

    if (!contract) {
      throw new NotFoundException("Contrat introuvable");
    }

    return contract;
  }

  async findOneDb(id: string): Promise<ContractEntity> {
    const row = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        property: {
          select: {
            reference: true,
            title: true,
            addressLine: true,
            city: true,
          },
        },
        lease: {
          select: {
            reference: true,
            tenant: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException("Contrat introuvable");
    }

    return this.mapContractFromDb(row);
  }

  async saveContract(params: {
    propertyId: string;
    leaseId?: string;
    uploadedById?: string;
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    };
  }): Promise<ContractEntity> {
    await this.ensureStorageDir();

    const id = randomUUID();
    const extension = params.file.originalname.includes(".")
      ? params.file.originalname.slice(params.file.originalname.lastIndexOf("."))
      : "";
    const storedFileName = `${id}${extension}`;
    const filePath = join(STORAGE_DIR, storedFileName);

    await fs.writeFile(filePath, params.file.buffer);

    const contract: ContractEntity = {
      id,
      propertyId: params.propertyId,
      leaseId: params.leaseId,
      fileName: params.file.originalname,
      storedFileName,
      filePath,
      mimeType: params.file.mimetype || "application/octet-stream",
      size: params.file.size,
      uploadedById: params.uploadedById,
      uploadedAt: new Date().toISOString(),
    };

    this.contracts.push(contract);
    return contract;
  }

  async saveContractDb(params: {
    propertyId: string;
    leaseId?: string;
    uploadedById?: string;
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    };
  }): Promise<ContractEntity> {
    await this.ensureStorageDir();

    const id = randomUUID();
    const extension = params.file.originalname.includes(".")
      ? params.file.originalname.slice(params.file.originalname.lastIndexOf("."))
      : "";
    const storedFileName = `${id}${extension}`;
    const filePath = join(STORAGE_DIR, storedFileName);

    await fs.writeFile(filePath, params.file.buffer);

    const row = await this.prisma.contract.create({
      data: {
        propertyId: params.propertyId,
        leaseId: params.leaseId,
        fileName: params.file.originalname,
        filePath,
        mimeType: params.file.mimetype || "application/octet-stream",
        uploadedById: params.uploadedById,
      },
      include: {
        property: {
          select: {
            reference: true,
            title: true,
            addressLine: true,
            city: true,
          },
        },
        lease: {
          select: {
            reference: true,
            tenant: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    });

    return {
      ...this.mapContractFromDb(row),
      size: params.file.size,
      storedFileName,
    };
  }

  async remove(id: string): Promise<{ success: true }> {
    const contract = await this.findOne(id);
    this.contracts.splice(this.contracts.findIndex((item) => item.id === id), 1);

    try {
      await fs.unlink(contract.filePath);
    } catch {
      // ignore missing files
    }

    return { success: true };
  }

  async removeDb(id: string): Promise<{ success: true }> {
    const row = await this.prisma.contract.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException("Contrat introuvable");
    }

    await this.prisma.contract.delete({ where: { id } });

    try {
      await fs.unlink(row.filePath);
    } catch {
      // ignore missing files
    }

    return { success: true };
  }
}
