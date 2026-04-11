import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { RequestUser } from "../common/types";
import { PropertiesService } from "./properties.service";
import type { CreatePropertyDto, PropertyFilters, UpdatePropertyDto } from "./properties.types";

@Controller("properties")
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  @Roles("admin", "agent", "proprietaire")
  async findAll(@Query() query: PropertyFilters, @CurrentUser() user?: RequestUser) {
    const filters = await (async () => {
      if (user?.role === "proprietaire") {
        return { ...query, ownerId: user.id };
      }

      if (user?.role === "agent") {
        const propertyIds = await (async () => {
          try {
            if (await this.propertiesService.isDbAvailable()) {
              return await this.propertiesService.getAgentPropertyKeysDb(user.id);
            }
          } catch {
            // fallback mémoire
          }

          return this.propertiesService.getAgentPropertyKeys(user.id);
        })();

        return { ...query, propertyIds };
      }

      return query;
    })();

    try {
      if (!(await this.propertiesService.isDbAvailable())) {
        return this.propertiesService.findAll(filters);
      }

      return await this.propertiesService.findAllDb(filters);
    } catch {
      return this.propertiesService.findAll(filters);
    }
  }

  @Get(":id")
  @Roles("admin", "agent", "proprietaire")
  async findOne(@Param("id") id: string, @CurrentUser() user?: RequestUser) {
    const property = await (async () => {
      try {
        if (await this.propertiesService.isDbAvailable()) {
          return await this.propertiesService.findOneDb(id);
        }
      } catch {
        // fallback mémoire
      }

      return this.propertiesService.findOne(id);
    })();

    if (user?.role === "proprietaire" && property.ownerId !== user.id) {
      throw new ForbiddenException("Accès interdit à ce bien");
    }

    if (user?.role === "agent" && property.agentId !== user.id) {
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

      if (!agentPropertyKeys.includes(property.id) && !agentPropertyKeys.includes(property.reference)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agence");
      }
    }

    return property;
  }

  @Post()
  @Roles("admin", "agent")
  async create(@Body() body: CreatePropertyDto, @CurrentUser() user?: RequestUser) {
    const payload = user
      ? {
          ...body,
          ownerId: body.ownerId ?? user.id,
          agentId: user.role === "agent" ? user.id : body.agentId,
        }
      : body;

    const dbAvailable = await this.propertiesService.isDbAvailable();
    if (dbAvailable) {
      return await this.propertiesService.createDb(payload);
    }

    return this.propertiesService.create(payload);
  }

  @Patch(":id")
  @Roles("admin", "agent")
  async update(@Param("id") id: string, @Body() body: UpdatePropertyDto, @CurrentUser() user?: RequestUser) {
    if (user?.role === "agent") {
      const current = await (async () => {
        try {
          if (await this.propertiesService.isDbAvailable()) {
            return await this.propertiesService.findOneDb(id);
          }
        } catch {
          // fallback mémoire
        }

        return this.propertiesService.findOne(id);
      })();

      if (current.agentId !== user.id) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    const payload = user?.role === "agent"
      ? { ...body, agentId: user.id }
      : body;

    const dbAvailable = await this.propertiesService.isDbAvailable();
    if (dbAvailable) {
      return await this.propertiesService.updateDb(id, payload);
    }

    return this.propertiesService.update(id, payload);
  }

  @Delete(":id")
  @Roles("admin")
  async remove(@Param("id") id: string) {
    const dbAvailable = await this.propertiesService.isDbAvailable();
    if (dbAvailable) {
      return await this.propertiesService.removeDb(id);
    }

    return this.propertiesService.remove(id);
  }
}
