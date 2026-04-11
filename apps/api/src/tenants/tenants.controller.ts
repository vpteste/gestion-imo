import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { RequestUser } from "../common/types";
import { PropertiesService } from "../properties/properties.service";
import { TenantsService } from "./tenants.service";
import type { CreateTenantDto, TenantFilters, UpdateTenantDto } from "./tenants.types";

@Controller("tenants")
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly propertiesService: PropertiesService,
  ) {}

  /** Liste tous les locataires (filtres optionnels: status, currentPropertyId) */
  @Get()
  @Roles("admin", "agent", "proprietaire")
  async findAll(
    @Query("status") status?: TenantFilters["status"],
    @Query("currentPropertyId") currentPropertyId?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    let ownerPropertyKeys: string[] | undefined;
    let agentPropertyKeys: string[] | undefined;
    if (user?.role === "proprietaire") {
      try {
        ownerPropertyKeys = await this.propertiesService.isDbAvailable()
          ? await this.propertiesService.getOwnerPropertyKeysDb(user.id)
          : this.propertiesService.getOwnerPropertyKeys(user.id);
      } catch {
        ownerPropertyKeys = this.propertiesService.getOwnerPropertyKeys(user.id);
      }
    }

    if (user?.role === "agent") {
      try {
        agentPropertyKeys = await this.propertiesService.isDbAvailable()
          ? await this.propertiesService.getAgentPropertyKeysDb(user.id)
          : this.propertiesService.getAgentPropertyKeys(user.id);
      } catch {
        agentPropertyKeys = this.propertiesService.getAgentPropertyKeys(user.id);
      }
    }

    const filters = user?.role === "proprietaire"
      ? {
          status,
          currentPropertyId,
          currentPropertyIds: ownerPropertyKeys,
        }
      : user?.role === "agent"
        ? {
            status,
            currentPropertyId,
            currentPropertyIds: agentPropertyKeys,
          }
      : { status, currentPropertyId };

    try {
      if (await this.tenantsService.isDbAvailable()) {
        return await this.tenantsService.findAllDb(filters);
      }
    } catch {
      // fallback mémoire
    }

    return this.tenantsService.findAll(filters);
  }

  /** Détail d'un locataire */
  @Get(":id")
  @Roles("admin", "agent", "proprietaire")
  async findOne(@Param("id") id: string, @CurrentUser() user?: RequestUser) {
    const tenant = await (async () => {
      try {
        if (await this.tenantsService.isDbAvailable()) {
          return await this.tenantsService.findOneDb(id);
        }
      } catch {
        // fallback mémoire
      }

      return this.tenantsService.findOne(id);
    })();

    if (user?.role === "proprietaire") {
      const ownerPropertyKeys = await (async () => {
        try {
          if (await this.propertiesService.isDbAvailable()) {
            return await this.propertiesService.getOwnerPropertyKeysDb(user.id);
          }
        } catch {
          // fallback mémoire
        }

        return this.propertiesService.getOwnerPropertyKeys(user.id);
      })();

      if (!tenant.currentPropertyId || !ownerPropertyKeys.includes(tenant.currentPropertyId)) {
        throw new ForbiddenException("Accès interdit à ce locataire");
      }
    }

    if (user?.role === "agent") {
      const agentPropertyKeys = await (async () => {
        try {
          if (await this.propertiesService.isDbAvailable()) {
            return await this.propertiesService.getAgentPropertyKeysDb(user.id);
          }
        } catch {
          // fallback mémoire
        }

        return this.propertiesService.getAgentPropertyKeys(user.id);
      })();

      if (!tenant.currentPropertyId || !agentPropertyKeys.includes(tenant.currentPropertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    return tenant;
  }

  /** Création d'un locataire */
  @Post()
  @Roles("admin", "agent")
  async create(@Body() dto: CreateTenantDto, @CurrentUser() user?: RequestUser) {
    if (user?.role === "agent" && dto.currentPropertyId) {
      const agentPropertyKeys = await (async () => {
        try {
          if (await this.propertiesService.isDbAvailable()) {
            return await this.propertiesService.getAgentPropertyKeysDb(user.id);
          }
        } catch {
          // fallback mémoire
        }

        return this.propertiesService.getAgentPropertyKeys(user.id);
      })();

      if (!agentPropertyKeys.includes(dto.currentPropertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    const dbAvailable = await this.tenantsService.isDbAvailable();
    if (dbAvailable) {
      return await this.tenantsService.createDb(dto);
    }

    return this.tenantsService.create(dto);
  }

  /** Mise à jour partielle */
  @Patch(":id")
  @Roles("admin", "agent")
  async update(@Param("id") id: string, @Body() dto: UpdateTenantDto, @CurrentUser() user?: RequestUser) {
    if (user?.role === "agent") {
      const tenant = await (async () => {
        try {
          if (await this.tenantsService.isDbAvailable()) {
            return await this.tenantsService.findOneDb(id);
          }
        } catch {
          // fallback mémoire
        }

        return this.tenantsService.findOne(id);
      })();

      const agentPropertyKeys = await (async () => {
        try {
          if (await this.propertiesService.isDbAvailable()) {
            return await this.propertiesService.getAgentPropertyKeysDb(user.id);
          }
        } catch {
          // fallback mémoire
        }

        return this.propertiesService.getAgentPropertyKeys(user.id);
      })();

      const targetPropertyId = dto.currentPropertyId ?? tenant.currentPropertyId;
      if (!targetPropertyId || !agentPropertyKeys.includes(targetPropertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    const dbAvailable = await this.tenantsService.isDbAvailable();
    if (dbAvailable) {
      return await this.tenantsService.updateDb(id, dto);
    }

    return this.tenantsService.update(id, dto);
  }

  /** Suppression */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles("admin")
  async remove(@Param("id") id: string) {
    const dbAvailable = await this.tenantsService.isDbAvailable();
    if (dbAvailable) {
      await this.tenantsService.removeDb(id);
      return;
    }

    this.tenantsService.remove(id);
  }
}
