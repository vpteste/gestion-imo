import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { basename } from "node:path";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { RequestUser } from "../common/types";
import { PropertiesService } from "../properties/properties.service";
import { TenantsService } from "../tenants/tenants.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PaymentsService } from "./payments.service";
import type { CreatePaymentDto, PaymentFilters, UpdatePaymentDto } from "./payments.types";

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly propertiesService: PropertiesService,
    private readonly tenantsService: TenantsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async getAgentLeaseIds(agentId: string): Promise<string[]> {
    const propertyIds = await (async () => {
      try {
        if (await this.propertiesService.isDbAvailable()) {
          return await this.propertiesService.getAgentPropertyKeysDb(agentId);
        }
      } catch {
        // fallback mémoire
      }

      return this.propertiesService.getAgentPropertyKeys(agentId);
    })();

    const tenants = await (async () => {
      try {
        if (await this.tenantsService.isDbAvailable()) {
          return await this.tenantsService.findAllDb({ currentPropertyIds: propertyIds });
        }
      } catch {
        // fallback mémoire
      }

      return this.tenantsService.findAll({ currentPropertyIds: propertyIds });
    })();

    return tenants.map((tenant) => tenant.leaseId).filter((id): id is string => !!id);
  }

  @Get()
  @Roles("admin", "agent", "proprietaire", "locataire")
  async findAll(@Query() query: PaymentFilters, @CurrentUser() user?: RequestUser) {
    const filters = user?.role === "locataire"
      ? { ...query, tenantEmail: user.email }
      : user?.role === "proprietaire"
        ? { ...query, ownerId: user.id }
        : user?.role === "agent"
          ? { ...query, leaseIds: await this.getAgentLeaseIds(user.id) }
        : query;

    try {
      if (await this.paymentsService.isDbAvailable()) {
        return await this.paymentsService.findAllDb(filters);
      }
    } catch {
      // fallback mémoire
    }

    return this.paymentsService.findAll(filters);
  }

  @Get("alerts")
  @Roles("admin", "agent", "proprietaire", "locataire")
  async alerts(@CurrentUser() user?: RequestUser) {
    const filters = user?.role === "locataire"
      ? { tenantEmail: user.email }
      : user?.role === "proprietaire"
        ? { ownerId: user.id }
      : user?.role === "agent"
        ? { leaseIds: await this.getAgentLeaseIds(user.id) }
      : {};

    try {
      if (await this.paymentsService.isDbAvailable()) {
        return await this.paymentsService.getAlertsDb(filters);
      }
    } catch {
      // fallback mémoire
    }

    return this.paymentsService.getAlerts(filters);
  }

  @Post()
  @Roles("admin", "agent")
  async create(@Body() body: CreatePaymentDto, @CurrentUser() user?: RequestUser) {
    if (user?.role === "agent") {
      const leaseIds = await this.getAgentLeaseIds(user.id);
      if (!leaseIds.includes(body.leaseId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    const dbAvailable = await this.paymentsService.isDbAvailable();
    const created = dbAvailable
      ? await this.paymentsService.createDb(body)
      : this.paymentsService.create(body);

    void this.notificationsService.broadcastToRoles({
      type: "rappel_echeance",
      subject: "Nouveau paiement créé",
      body: `Paiement pour le bail ${created.leaseReference ?? created.leaseId} (${created.amountDue} FCFA).`,
      senderId: user?.id,
      roles: ["admin", "agent"],
    });

    return created;
  }

  @Patch(":id")
  @Roles("admin", "agent")
  async update(@Param("id") id: string, @Body() body: UpdatePaymentDto, @CurrentUser() user?: RequestUser) {
    if (user?.role === "agent") {
      const leaseIds = await this.getAgentLeaseIds(user.id);
      const payment = await (async () => {
        try {
          if (await this.paymentsService.isDbAvailable()) {
            return await this.paymentsService.findOneDb(id);
          }
        } catch {
          // fallback mémoire
        }

        return this.paymentsService.findAll({}).find((item) => item.id === id);
      })();

      if (!payment || !leaseIds.includes(payment.leaseId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    const dbAvailable = await this.paymentsService.isDbAvailable();
    const updated = dbAvailable
      ? await this.paymentsService.updateDb(id, body)
      : this.paymentsService.update(id, body);

    if (updated.status === "retard" || updated.status === "impaye") {
      void this.notificationsService.broadcastToRoles({
        type: "alerte_impaye",
        subject: "Alerte paiement",
        body: `Paiement ${updated.status} pour ${updated.tenantName} (bail ${updated.leaseReference ?? updated.leaseId}).`,
        senderId: user?.id,
        roles: ["admin", "agent", "proprietaire"],
      });
    }

    return updated;
  }

  @Delete(":id")
  @Roles("admin", "agent")
  async remove(@Param("id") id: string, @CurrentUser() user?: RequestUser) {
    if (user?.role === "agent") {
      const leaseIds = await this.getAgentLeaseIds(user.id);
      const payment = await (async () => {
        try {
          if (await this.paymentsService.isDbAvailable()) {
            return await this.paymentsService.findOneDb(id);
          }
        } catch {
          // fallback mémoire
        }

        return this.paymentsService.findAll({}).find((item) => item.id === id);
      })();

      if (!payment || !leaseIds.includes(payment.leaseId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    const dbAvailable = await this.paymentsService.isDbAvailable();
    if (dbAvailable) {
      return await this.paymentsService.removeDb(id);
    }

    return this.paymentsService.remove(id);
  }

  @Post(":id/receipt")
  @Roles("admin", "agent")
  async generateReceipt(@Param("id") id: string, @CurrentUser() user: RequestUser | undefined, @Res() res: Response) {
    if (user?.role === "agent") {
      const leaseIds = await this.getAgentLeaseIds(user.id);
      const payment = await (async () => {
        try {
          if (await this.paymentsService.isDbAvailable()) {
            return await this.paymentsService.findOneDb(id);
          }
        } catch {
          // fallback mémoire
        }

        return this.paymentsService.findAll({}).find((item) => item.id === id);
      })();

      if (!payment || !leaseIds.includes(payment.leaseId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    const receipt = await this.paymentsService.generateReceipt(id);
    const filename = basename(receipt.receiptPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
    res.sendFile(receipt.receiptPath);
  }

  @Post(":id/reminder")
  @Roles("admin", "agent")
  async sendReminder(@Param("id") id: string, @CurrentUser() user?: RequestUser) {
    if (user?.role === "agent") {
      const leaseIds = await this.getAgentLeaseIds(user.id);
      const payment = await (async () => {
        try {
          if (await this.paymentsService.isDbAvailable()) {
            return await this.paymentsService.findOneDb(id);
          }
        } catch {
          // fallback mémoire
        }

        return this.paymentsService.findAll({}).find((item) => item.id === id);
      })();

      if (!payment || !leaseIds.includes(payment.leaseId)) {
        throw new ForbiddenException("Accès interdit hors portefeuille agent");
      }
    }

    return this.paymentsService.sendReminderEmail(id);
  }
}
