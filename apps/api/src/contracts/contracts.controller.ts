import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { RequestUser } from "../common/types";
import { PaymentsService } from "../payments/payments.service";
import { PropertiesService } from "../properties/properties.service";
import { ContractsService } from "./contracts.service";
import type { ContractFilters } from "./contracts.types";

@Controller("contracts")
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly paymentsService: PaymentsService,
    private readonly propertiesService: PropertiesService,
  ) {}

  @Get()
  @Roles("admin", "agent", "proprietaire", "locataire")
  async findAll(@Query() query: ContractFilters, @CurrentUser() user?: RequestUser) {
    const filters = await (async () => {
      if (user?.role === "proprietaire") {
        const propertyIds = await (async () => {
          try {
            if (await this.propertiesService.isDbAvailable()) {
              return await this.propertiesService.getOwnerPropertyKeysDb(user.id);
            }
          } catch {
            // fallback mémoire
          }

          return this.propertiesService.getOwnerPropertyKeys(user.id);
        })();

        return { ...query, propertyIds };
      }

      if (user?.role === "locataire") {
        const leaseIds = await (async () => {
          try {
            if (await this.paymentsService.isDbAvailable()) {
              return (await this.paymentsService.findAllDb({ tenantEmail: user.email })).map((item) => item.leaseId);
            }
          } catch {
            // fallback mémoire
          }

          return this.paymentsService.findAll({ tenantEmail: user.email }).map((item) => item.leaseId);
        })();

        return { ...query, leaseIds };
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
      if (await this.contractsService.isDbAvailable()) {
        return await this.contractsService.findAllDb(filters);
      }
    } catch {
      // fallback mémoire
    }

    return this.contractsService.findAll(filters);
  }

  @Post("upload")
  @Roles("admin", "agent")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async upload(
    @UploadedFile() file: any,
    @Query("propertyId") propertyId?: string,
    @Query("leaseId") leaseId?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    if (!propertyId) {
      throw new BadRequestException("propertyId est obligatoire");
    }

    if (!file) {
      throw new BadRequestException("Aucun fichier recu");
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

      if (!agentPropertyKeys.includes(propertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    try {
      if (await this.contractsService.isDbAvailable()) {
        return await this.contractsService.saveContractDb({
          propertyId,
          leaseId,
          uploadedById: user?.id,
          file,
        });
      }
    } catch {
      // fallback mémoire
    }

    return this.contractsService.saveContract({
      propertyId,
      leaseId,
      uploadedById: user?.id,
      file,
    });
  }

  @Get(":id/download")
  @Roles("admin", "agent", "proprietaire", "locataire")
  async download(@Param("id") id: string, @Res() res: any, @CurrentUser() user?: RequestUser) {
    const contract = await (async () => {
      try {
        if (await this.contractsService.isDbAvailable()) {
          return await this.contractsService.findOneDb(id);
        }
      } catch {
        // fallback mémoire
      }

      return this.contractsService.findOne(id);
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

      if (!ownerPropertyKeys.includes(contract.propertyId)) {
        throw new ForbiddenException("Accès interdit à ce contrat");
      }
    }

    if (user?.role === "locataire") {
      const leaseIds = await (async () => {
        try {
          if (await this.paymentsService.isDbAvailable()) {
            return (await this.paymentsService.findAllDb({ tenantEmail: user.email })).map((item) => item.leaseId);
          }
        } catch {
          // fallback mémoire
        }

        return this.paymentsService
          .findAll({ tenantEmail: user.email })
          .map((item) => item.leaseId);
      })();

      if (!contract.leaseId || !leaseIds.includes(contract.leaseId)) {
        throw new ForbiddenException("Accès interdit à ce contrat");
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

      if (!agentPropertyKeys.includes(contract.propertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    return res.download(contract.filePath, contract.fileName);
  }

  @Delete(":id")
  @Roles("admin", "agent")
  async remove(@Param("id") id: string, @CurrentUser() user?: RequestUser) {
    const contract = await (async () => {
      try {
        if (await this.contractsService.isDbAvailable()) {
          return await this.contractsService.findOneDb(id);
        }
      } catch {
        // fallback mémoire
      }

      return this.contractsService.findOne(id);
    })();

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

      if (!agentPropertyKeys.includes(contract.propertyId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    try {
      if (await this.contractsService.isDbAvailable()) {
        return await this.contractsService.removeDb(id);
      }
    } catch {
      // fallback mémoire
    }

    return this.contractsService.remove(id);
  }
}
