import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { RequestUser } from "../common/types";
import { PropertiesService } from "../properties/properties.service";
import { NotificationsService } from "../notifications/notifications.service";
import { TenantsService } from "../tenants/tenants.service";
import { IncidentsService } from "./incidents.service";
import type { CreateIncidentDto, IncidentFilters, UpdateIncidentDto } from "./incidents.types";

@Controller("incidents")
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly propertiesService: PropertiesService,
    private readonly notificationsService: NotificationsService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get()
  @Roles("admin", "agent", "proprietaire", "locataire")
  async findAll(@Query() query: IncidentFilters, @CurrentUser() user?: RequestUser) {
    if (user?.role === "locataire") {
      return this.incidentsService.findAll({ ...query, tenantEmail: user.email });
    }

    if (user?.role === "proprietaire") {
      const propertyIds = await this.getOwnerPropertyKeys(user.id);
      return this.incidentsService.findAll({ ...query, propertyIds });
    }

    if (user?.role === "agent") {
      const propertyIds = await this.getAgentPropertyKeys(user.id);
      return this.incidentsService.findAll({ ...query, propertyIds });
    }

    return this.incidentsService.findAll(query);
  }

  @Post()
  @Roles("locataire")
  async create(@Body() dto: CreateIncidentDto, @CurrentUser() user?: RequestUser) {
    let propertyId = dto.propertyId;

    if (!propertyId && user?.id) {
      const tenant = await (async () => {
        try {
          if (await this.tenantsService.isDbAvailable()) {
            return await this.tenantsService.findOneDb(user.id);
          }
        } catch {
          // fallback mémoire
        }

        return this.tenantsService.findOne(user.id);
      })();

      propertyId = tenant.currentPropertyId;
    }

    if (!propertyId) {
      throw new BadRequestException("Aucun bien actif rattache au locataire pour creer un incident");
    }

    const property = await (async () => {
      try {
        if (await this.propertiesService.isDbAvailable()) {
          return await this.propertiesService.findOneDb(propertyId!);
        }
      } catch {
        // fallback mémoire
      }

      return this.propertiesService.findOne(propertyId!);
    })();

    const created = this.incidentsService.create({
      ...dto,
      propertyId: property.id,
    }, {
      tenantId: user?.id ?? "unknown-tenant",
      tenantEmail: user?.email,
    });

    created.propertyReference = property.reference;

    void this.notificationsService.broadcastToRoles({
      type: "incident",
      subject: "Nouveau incident locataire",
      body: `${created.title} (${created.propertyReference ?? created.propertyId})`,
      senderId: user?.id,
      roles: ["admin", "agent", "proprietaire"],
    });

    return created;
  }

  @Patch(":id")
  @Roles("admin", "agent", "proprietaire")
  async update(@Param("id") id: string, @Body() dto: UpdateIncidentDto, @CurrentUser() user?: RequestUser) {
    const incident = this.incidentsService.findOne(id);

    if (user?.role === "proprietaire") {
      const ownerPropertyKeys = await this.getOwnerPropertyKeys(user.id);
      if (!ownerPropertyKeys.includes(incident.propertyId)) {
        throw new ForbiddenException("Accès interdit à cet incident");
      }
    }

    if (user?.role === "agent") {
      const agentPropertyKeys = await this.getAgentPropertyKeys(user.id);
      if (!agentPropertyKeys.includes(incident.propertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    const updated = this.incidentsService.update(id, dto);

    void this.notificationsService.broadcastToRoles({
      type: "incident",
      subject: "Mise à jour incident",
      body: `${updated.title} - statut ${updated.status}`,
      senderId: user?.id,
      roles: ["admin", "agent", "proprietaire"],
    });

    return updated;
  }

  @Delete(":id")
  @Roles("admin", "agent", "proprietaire")
  async remove(@Param("id") id: string, @CurrentUser() user?: RequestUser) {
    const incident = this.incidentsService.findOne(id);

    if (user?.role === "proprietaire") {
      const ownerPropertyKeys = await this.getOwnerPropertyKeys(user.id);
      if (!ownerPropertyKeys.includes(incident.propertyId)) {
        throw new ForbiddenException("Accès interdit à cet incident");
      }
    }

    if (user?.role === "agent") {
      const agentPropertyKeys = await this.getAgentPropertyKeys(user.id);
      if (!agentPropertyKeys.includes(incident.propertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    return this.incidentsService.remove(id);
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
}
