import { Injectable } from "@nestjs/common";
import { ContractsService } from "../contracts/contracts.service";
import { PaymentsService } from "../payments/payments.service";
import { PropertiesService } from "../properties/properties.service";
import { TenantsService } from "../tenants/tenants.service";

const BRAND_NAME = process.env.APP_BRAND_NAME ?? "Gestion Immobiliere";
const BRAND_INITIALS = process.env.APP_BRAND_INITIALS ?? "GI";

type SummaryResult = {
  totals: {
    properties: number;
    contracts: number;
    payments: number;
    alerts: number;
  };
  financial: {
    totalRent: number;
    collectionRate: number;
  };
  geography: Record<string, number>;
  paymentStatus: Record<string, number>;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly paymentsService: PaymentsService,
    private readonly contractsService: ContractsService,
    private readonly tenantsService: TenantsService,
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

  async getSummary(filters?: { ownerId?: string; agentId?: string }) {
    const propertyFilters = filters?.ownerId
      ? { ownerId: filters.ownerId }
      : filters?.agentId
        ? { agentId: filters.agentId }
        : {};

    const properties = await (async () => {
      try {
        if (await this.propertiesService.isDbAvailable()) {
          return await this.propertiesService.findAllDb(propertyFilters);
        }
      } catch {
        // fallback mémoire
      }

      return this.propertiesService.findAll(propertyFilters);
    })();

    const propertyIds = await (async () => {
      if (!filters?.ownerId && !filters?.agentId) {
        return undefined;
      }

      try {
        if (await this.propertiesService.isDbAvailable()) {
          if (filters?.ownerId) {
            return await this.propertiesService.getOwnerPropertyKeysDb(filters.ownerId);
          }

          return await this.propertiesService.getAgentPropertyKeysDb(filters!.agentId!);
        }
      } catch {
        // fallback mémoire
      }

      if (filters?.ownerId) {
        return this.propertiesService.getOwnerPropertyKeys(filters.ownerId);
      }

      return this.propertiesService.getAgentPropertyKeys(filters!.agentId!);
    })();

    const leaseIds = filters?.agentId ? await this.getAgentLeaseIds(filters.agentId) : undefined;

    const payments = await (async () => {
      try {
        if (await this.paymentsService.isDbAvailable()) {
          return await this.paymentsService.findAllDb(
            filters?.ownerId
              ? { ownerId: filters.ownerId }
              : filters?.agentId
                ? { leaseIds }
                : {},
          );
        }
      } catch {
        // fallback mémoire
      }

      return this.paymentsService.findAll(
        filters?.ownerId
          ? { ownerId: filters.ownerId }
          : filters?.agentId
            ? { leaseIds }
            : {},
      );
    })();

    const alerts = await (async () => {
      try {
        if (await this.paymentsService.isDbAvailable()) {
          return await this.paymentsService.getAlertsDb(
            filters?.ownerId
              ? { ownerId: filters.ownerId }
              : filters?.agentId
                ? { leaseIds }
                : {},
          );
        }
      } catch {
        // fallback mémoire
      }

      return this.paymentsService.getAlerts(
        filters?.ownerId
          ? { ownerId: filters.ownerId }
          : filters?.agentId
            ? { leaseIds }
            : {},
      );
    })();

    const contracts = await (async () => {
      try {
        if (await this.contractsService.isDbAvailable()) {
          return await this.contractsService.findAllDb(propertyIds ? { propertyIds } : {});
        }
      } catch {
        // fallback mémoire
      }

      return this.contractsService.findAll(propertyIds ? { propertyIds } : {});
    })();

    const totalRent = properties.reduce((sum, item) => sum + item.rentAmount, 0);
    const paidCount = payments.filter((item) => item.status === "paye").length;
    const collectionRate = payments.length > 0 ? Math.round((paidCount / payments.length) * 100) : 0;

    const byCity = properties.reduce<Record<string, number>>((acc, item) => {
      acc[item.city] = (acc[item.city] ?? 0) + 1;
      return acc;
    }, {});

    const byStatus = payments.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      totals: {
        properties: properties.length,
        contracts: contracts.length,
        payments: payments.length,
        alerts: alerts.totalAlerts,
      },
      financial: {
        totalRent,
        collectionRate,
      },
      geography: byCity,
      paymentStatus: byStatus,
    } satisfies SummaryResult;
  }

  private formatFcfa(value: number): string {
    return `${value.toLocaleString("fr-FR")} FCFA`;
  }

  async buildSummaryPdf(filters?: { ownerId?: string; agentId?: string }): Promise<Buffer> {
    const summary = await this.getSummary(filters);
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];

    return await new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      doc.roundedRect(48, 44, 42, 42, 8).fill("#0f766e");
      doc.fillColor("#ffffff").fontSize(16).text(BRAND_INITIALS, 59, 57);
      doc.fillColor("#0f172a").fontSize(17).text(BRAND_NAME, 100, 49);
      doc.fillColor("#475569").fontSize(10).text("Bilan d'activite", 100, 71);
      doc.fontSize(9).text(`Genere le ${new Date().toLocaleString("fr-FR")}`, 100, 86);
      doc.moveTo(48, 102).lineTo(548, 102).strokeColor("#cbd5e1").stroke();

      doc.fillColor("#0f172a").fontSize(13).text("Totaux", 48, 116);
      doc.fontSize(11).fillColor("#1e293b");
      doc.text(`Biens: ${summary.totals.properties}`, 48, 140);
      doc.text(`Contrats: ${summary.totals.contracts}`, 48, 160);
      doc.text(`Paiements: ${summary.totals.payments}`, 48, 180);
      doc.text(`Alertes: ${summary.totals.alerts}`, 48, 200);

      doc.fillColor("#0f172a").fontSize(13).text("Indicateurs financiers", 300, 116);
      doc.fontSize(11).fillColor("#1e293b");
      doc.text(`Loyers cumules: ${this.formatFcfa(summary.financial.totalRent)}`, 300, 140, {
        width: 240,
      });
      doc.text(`Taux d'encaissement: ${summary.financial.collectionRate}%`, 300, 170, {
        width: 240,
      });

      let cursorY = 244;
      doc.moveTo(48, cursorY - 14).lineTo(548, cursorY - 14).strokeColor("#e2e8f0").stroke();
      doc.fillColor("#0f172a").fontSize(13).text("Repartition geographique", 48, cursorY);
      cursorY += 22;

      const cities = Object.entries(summary.geography);
      if (cities.length === 0) {
        doc.fillColor("#64748b").fontSize(10).text("Aucune donnee geographique.", 48, cursorY);
        cursorY += 20;
      } else {
        for (const [city, count] of cities) {
          doc.fillColor("#334155").fontSize(10).text(`${city}: ${count} bien(s)`, 48, cursorY);
          cursorY += 15;
        }
      }

      cursorY += 8;
      doc.moveTo(48, cursorY - 10).lineTo(548, cursorY - 10).strokeColor("#e2e8f0").stroke();
      doc.fillColor("#0f172a").fontSize(13).text("Statuts des paiements", 48, cursorY);
      cursorY += 22;

      const statuses = Object.entries(summary.paymentStatus);
      if (statuses.length === 0) {
        doc.fillColor("#64748b").fontSize(10).text("Aucun paiement enregistre.", 48, cursorY);
      } else {
        for (const [status, count] of statuses) {
          doc.fillColor("#334155").fontSize(10).text(`${status}: ${count}`, 48, cursorY);
          cursorY += 15;
        }
      }

      doc.end();
    });
  }
}
