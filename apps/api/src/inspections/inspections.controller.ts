import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { RequestUser } from "../common/types";
import { PaymentsService } from "../payments/payments.service";
import { PropertiesService } from "../properties/properties.service";
import { NotificationsService } from "../notifications/notifications.service";
import { InspectionsService } from "./inspections.service";
import type {
  CreateInspectionDto,
  InspectionFilters,
  InspectionType,
  SignInspectionDto,
  UpdateInspectionDto,
} from "./inspections.types";

const UPLOADS_DIR = join(process.cwd(), "uploads", "inspections");
// Crée le dossier s'il n'existe pas
mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

@Controller("inspections")
export class InspectionsController {
  constructor(
    private readonly inspectionsService: InspectionsService,
    private readonly propertiesService: PropertiesService,
    private readonly paymentsService: PaymentsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  @Roles("admin", "agent", "proprietaire", "locataire")
  async findAll(@Query() query: InspectionFilters, @CurrentUser() user?: RequestUser) {
    if (user?.role === "proprietaire") {
      const propertyIds = await this.getOwnerPropertyKeys(user.id);
      return this.inspectionsService.findAll({ ...query, propertyIds });
    }

    if (user?.role === "agent") {
      const propertyIds = await this.getAgentPropertyKeys(user.id);
      return this.inspectionsService.findAll({ ...query, propertyIds });
    }

    if (user?.role === "locataire") {
      const leaseIds = await this.getTenantLeaseIds(user.email);
      return this.inspectionsService.findAll({ ...query, leaseIds });
    }

    return this.inspectionsService.findAll(query);
  }

  @Get(":id")
  @Roles("admin", "agent", "proprietaire", "locataire")
  async findOne(@Param("id") id: string, @CurrentUser() user?: RequestUser) {
    const inspection = await this.inspectionsService.findOne(id);

    if (user?.role === "proprietaire") {
      const propertyIds = await this.getOwnerPropertyKeys(user.id);
      if (!propertyIds.includes(inspection.propertyId)) {
        throw new ForbiddenException("Accès interdit à cet état des lieux");
      }
    }

    if (user?.role === "agent") {
      const propertyIds = await this.getAgentPropertyKeys(user.id);
      if (!propertyIds.includes(inspection.propertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    if (user?.role === "locataire") {
      const leaseIds = await this.getTenantLeaseIds(user.email);
      if (!leaseIds.includes(inspection.leaseId)) {
        throw new ForbiddenException("Accès interdit à cet état des lieux");
      }
    }

    return inspection;
  }

  @Post()
  @Roles("admin", "agent")
  async create(@Body() dto: CreateInspectionDto, @CurrentUser() user?: RequestUser) {
    if (user?.role === "agent") {
      const propertyIds = await this.getAgentPropertyKeys(user.id);
      if (!propertyIds.includes(dto.propertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    return this.inspectionsService.create(dto, user?.id);
  }

  @Patch(":id")
  @Roles("admin", "agent", "proprietaire")
  async update(@Param("id") id: string, @Body() dto: UpdateInspectionDto, @CurrentUser() user?: RequestUser) {
    const inspection = await this.inspectionsService.findOne(id);

    if (user?.role === "agent") {
      const propertyIds = await this.getAgentPropertyKeys(user.id);
      if (!propertyIds.includes(inspection.propertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    if (user?.role === "proprietaire") {
      const propertyIds = await this.getOwnerPropertyKeys(user.id);
      if (!propertyIds.includes(inspection.propertyId)) {
        throw new ForbiddenException("Accès interdit à cet état des lieux");
      }
    }

    return this.inspectionsService.update(id, dto);
  }

  @Delete(":id")
  @Roles("admin", "agent", "proprietaire")
  async remove(@Param("id") id: string, @CurrentUser() user?: RequestUser) {
    const inspection = await this.inspectionsService.findOne(id);

    if (user?.role === "agent") {
      const propertyIds = await this.getAgentPropertyKeys(user.id);
      if (!propertyIds.includes(inspection.propertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    if (user?.role === "proprietaire") {
      const propertyIds = await this.getOwnerPropertyKeys(user.id);
      if (!propertyIds.includes(inspection.propertyId)) {
        throw new ForbiddenException("Accès interdit à cet état des lieux");
      }
    }

    return this.inspectionsService.remove(id);
  }

  @Post(":id/sign")
  @Roles("admin", "agent", "proprietaire", "locataire")
  async sign(@Param("id") id: string, @Body() body: SignInspectionDto, @CurrentUser() user?: RequestUser) {
    const inspection = await this.inspectionsService.findOne(id);

    if (user?.role === "locataire") {
      const leaseIds = await this.getTenantLeaseIds(user?.email);
      if (!leaseIds.includes(inspection.leaseId)) {
        throw new ForbiddenException("Accès interdit à cet état des lieux");
      }
    }

    if (user?.role === "agent") {
      const propertyIds = await this.getAgentPropertyKeys(user.id);
      if (!propertyIds.includes(inspection.propertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    if (user?.role === "proprietaire") {
      const propertyIds = await this.getOwnerPropertyKeys(user.id);
      if (!propertyIds.includes(inspection.propertyId)) {
        throw new ForbiddenException("Accès interdit à cet état des lieux");
      }
    }

    const signed = await this.inspectionsService.signByTenantWithDetails(id, {
      tenantName: body?.tenantName ?? user?.fullName,
      signatureDataUrl: body?.signatureDataUrl,
    });

    void this.notificationsService.broadcastToRoles({
      type: "etat_des_lieux",
      subject: "État des lieux signé",
      body: `Le bail ${signed.leaseId} a été signé par le locataire.`,
      senderId: user?.id,
      roles: ["admin", "agent", "proprietaire"],
    });

    return signed;
  }

  @Post(":id/photos")
  @Roles("admin", "agent", "proprietaire", "locataire")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const unique = `${randomUUID()}${extname(file.originalname)}`;
          cb(null, unique);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException("Type de fichier non autorisé (jpeg, png, webp, gif uniquement)"), false);
        }
      },
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo max
    }),
  )
  async addPhoto(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("phase") phase: string,
    @CurrentUser() user?: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException("Aucun fichier reçu");
    }
    if (phase !== "entree" && phase !== "sortie") {
      throw new BadRequestException("phase doit être 'entree' ou 'sortie'");
    }

    const inspection = await this.inspectionsService.findOne(id);

    // Vérification portefeuille
    if (user?.role === "agent") {
      const propertyIds = await this.getAgentPropertyKeys(user.id);
      if (!propertyIds.includes(inspection.propertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }
    if (user?.role === "proprietaire") {
      const propertyIds = await this.getOwnerPropertyKeys(user.id);
      if (!propertyIds.includes(inspection.propertyId)) {
        throw new ForbiddenException("Accès interdit à cet état des lieux");
      }
    }
    if (user?.role === "locataire") {
      const leaseIds = await this.getTenantLeaseIds(user.email);
      if (!leaseIds.includes(inspection.leaseId)) {
        throw new ForbiddenException("Accès interdit à cet état des lieux");
      }
    }

    return this.inspectionsService.addPhoto(id, phase as InspectionType, file.filename, user?.id);
  }

  @Delete(":id/photos/:filename")
  @Roles("admin", "agent")
  async removePhoto(
    @Param("id") id: string,
    @Param("filename") filename: string,
    @Body("phase") phase: string,
    @CurrentUser() user?: RequestUser,
  ) {
    if (phase !== "entree" && phase !== "sortie") {
      throw new BadRequestException("phase doit être 'entree' ou 'sortie'");
    }
    const inspection = await this.inspectionsService.findOne(id);
    if (user?.role === "agent") {
      const propertyIds = await this.getAgentPropertyKeys(user.id);
      if (!propertyIds.includes(inspection.propertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }
    return this.inspectionsService.removePhoto(id, phase as InspectionType, filename);
  }

  private async getOwnerPropertyKeys(ownerId: string): Promise<string[]> {
    try {
      if (await this.propertiesService.isDbAvailable()) {
        return await this.propertiesService.getOwnerPropertyKeysDb(ownerId);
      }
    } catch {
      // fallback mémoire
    }
    return this.propertiesService.getOwnerPropertyKeys(ownerId);
  }

  private async getAgentPropertyKeys(agentId: string): Promise<string[]> {
    try {
      if (await this.propertiesService.isDbAvailable()) {
        return await this.propertiesService.getAgentPropertyKeysDb(agentId);
      }
    } catch {
      // fallback mémoire
    }
    return this.propertiesService.getAgentPropertyKeys(agentId);
  }

  private async getTenantLeaseIds(email?: string): Promise<string[]> {
    if (!email) {
      return [];
    }

    try {
      if (await this.paymentsService.isDbAvailable()) {
        return (await this.paymentsService.findAllDb({ tenantEmail: email })).map((item) => item.leaseId);
      }
    } catch {
      // fallback mémoire
    }

    return this.paymentsService.findAll({ tenantEmail: email }).map((item) => item.leaseId);
  }
}
