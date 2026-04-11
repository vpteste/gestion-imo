import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreatePaymentDto,
  PaymentEntity,
  PaymentFilters,
  ReceiptResult,
  UpdatePaymentDto,
} from "./payments.types";

const RECEIPTS_DIR = join(process.cwd(), "storage", "receipts");

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
  if (value == null) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizePhone(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, "").replace(/[^\d+]/g, "");
  return normalized.length >= 8 ? normalized : undefined;
}

async function sendWhatsAppMessage(input: { to?: string; text: string }): Promise<{ sent: boolean; reason?: string }> {
  const endpoint = process.env.WHATSAPP_API_URL?.trim();
  const token = process.env.WHATSAPP_API_TOKEN?.trim();
  const sender = process.env.WHATSAPP_SENDER?.trim();
  const to = normalizePhone(input.to);

  if (!endpoint) {
    return { sent: false, reason: "WHATSAPP_API_URL non configure" };
  }

  if (!to) {
    return { sent: false, reason: "Telephone locataire absent" };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ to, text: input.text, ...(sender ? { from: sender } : {}) }),
    });

    if (!response.ok) {
      return { sent: false, reason: `HTTP_${response.status}` };
    }

    return { sent: true };
  } catch {
    return { sent: false, reason: "Provider indisponible" };
  }
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly payments: PaymentEntity[] = [];

  findAll(filters: PaymentFilters): PaymentEntity[] {
    return this.payments.filter((item) => {
      if (filters.status && item.status !== filters.status) {
        return false;
      }

      if (filters.leaseId && item.leaseId !== filters.leaseId) {
        return false;
      }

      if (filters.leaseIds?.length && !filters.leaseIds.includes(item.leaseId)) {
        return false;
      }

      if (filters.tenantEmail && item.tenantEmail !== filters.tenantEmail) {
        return false;
      }

      if (filters.ownerId && item.ownerId !== filters.ownerId) {
        return false;
      }

      return true;
    });
  }

  async isDbAvailable(): Promise<boolean> {
    return this.prisma.isAvailable();
  }

  private mapPaymentFromDb(item: {
    id: string;
    leaseId: string;
    dueDate: Date;
    paidAt: Date | null;
    amountDue: any;
    amountPaid: any;
    status: string;
    lateDays: number;
    createdAt: Date;
    updatedAt: Date;
    notes: string | null;
    lease: {
      reference: string;
      tenant: {
        fullName: string;
        email: string;
      };
      property: {
        ownerId: string;
        reference: string;
        title: string;
        addressLine: string;
        city: string;
      };
    };
  }): PaymentEntity {
    return {
      id: item.id,
      leaseId: item.leaseId,
      tenantName: item.lease.tenant.fullName,
      tenantEmail: item.lease.tenant.email,
      ownerId: item.lease.property.ownerId,
      leaseReference: item.lease.reference,
      propertyReference: item.lease.property.reference,
      propertyTitle: `${item.lease.property.title} - ${item.lease.property.addressLine}, ${item.lease.property.city}`,
      dueDate: item.dueDate.toISOString(),
      amountDue: Number(item.amountDue),
      amountPaid: item.amountPaid != null ? Number(item.amountPaid) : undefined,
      paidAt: item.paidAt?.toISOString(),
      status: item.status as PaymentEntity["status"],
      lateDays: item.lateDays,
      notes: item.notes ?? undefined,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  async findAllDb(filters: PaymentFilters): Promise<PaymentEntity[]> {
    const rows = await this.prisma.payment.findMany({
      where: {
        status: filters.status,
        leaseId: filters.leaseIds?.length ? { in: filters.leaseIds } : filters.leaseId,
        lease: {
          tenant: filters.tenantEmail
            ? {
                email: filters.tenantEmail,
              }
            : undefined,
          property: filters.ownerId
            ? {
                ownerId: filters.ownerId,
              }
            : undefined,
        },
      },
      include: {
        lease: {
          select: {
            reference: true,
            tenant: {
              select: {
                fullName: true,
                email: true,
              },
            },
            property: {
              select: {
                ownerId: true,
                reference: true,
                title: true,
                addressLine: true,
                city: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((row) => this.mapPaymentFromDb(row));
  }

  getAlerts(filters: PaymentFilters = {}) {
    const items = this.findAll(filters);
    const late = items.filter((item) => item.status === "retard");
    const unpaid = items.filter((item) => item.status === "impaye");

    return {
      lateCount: late.length,
      unpaidCount: unpaid.length,
      totalAlerts: late.length + unpaid.length,
      items: [...late, ...unpaid],
    };
  }

  async getAlertsDb(filters: PaymentFilters = {}) {
    const items = await this.findAllDb(filters);
    const late = items.filter((item) => item.status === "retard");
    const unpaid = items.filter((item) => item.status === "impaye");

    return {
      lateCount: late.length,
      unpaidCount: unpaid.length,
      totalAlerts: late.length + unpaid.length,
      items: [...late, ...unpaid],
    };
  }

  create(dto: CreatePaymentDto): PaymentEntity {
    const now = new Date().toISOString();

    const payment: PaymentEntity = {
      id: randomUUID(),
      leaseId: dto.leaseId,
      tenantName: dto.tenantName,
      tenantEmail: dto.tenantEmail,
      ownerId: "u-owner",
      leaseReference: dto.leaseId,
      dueDate: dto.dueDate,
      amountDue: dto.amountDue,
      status: "retard",
      lateDays: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.payments.push(payment);
    return payment;
  }

  async createDb(dto: CreatePaymentDto): Promise<PaymentEntity> {
    const row = await this.prisma.payment.create({
      data: {
        leaseId: dto.leaseId,
        dueDate: new Date(dto.dueDate),
        amountDue: dto.amountDue,
        status: "retard",
        lateDays: 0,
      },
      include: {
        lease: {
          select: {
            reference: true,
            tenant: {
              select: {
                fullName: true,
                email: true,
              },
            },
            property: {
              select: {
                ownerId: true,
                reference: true,
                title: true,
                addressLine: true,
                city: true,
              },
            },
          },
        },
      },
    });

    return this.mapPaymentFromDb(row);
  }

  update(id: string, dto: UpdatePaymentDto): PaymentEntity {
    const payment = this.payments.find((item) => item.id === id);

    if (!payment) {
      throw new NotFoundException("Paiement introuvable");
    }

    Object.assign(payment, dto, {
      updatedAt: new Date().toISOString(),
    });

    return payment;
  }

  async updateDb(id: string, dto: UpdatePaymentDto): Promise<PaymentEntity> {
    const row = await this.prisma.payment.update({
      where: { id },
      data: {
        amountPaid: dto.amountPaid,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
        status: dto.status,
        lateDays: dto.lateDays,
        notes: dto.notes,
      },
      include: {
        lease: {
          select: {
            reference: true,
            tenant: {
              select: {
                fullName: true,
                email: true,
              },
            },
            property: {
              select: {
                ownerId: true,
                reference: true,
                title: true,
                addressLine: true,
                city: true,
              },
            },
          },
        },
      },
    });

    return this.mapPaymentFromDb(row);
  }

  async findOneDb(id: string): Promise<PaymentEntity> {
    const row = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        lease: {
          select: {
            reference: true,
            tenant: {
              select: {
                fullName: true,
                email: true,
              },
            },
            property: {
              select: {
                ownerId: true,
                reference: true,
                title: true,
                addressLine: true,
                city: true,
              },
            },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException("Paiement introuvable");
    }

    return this.mapPaymentFromDb(row);
  }

  remove(id: string): { success: true } {
    const index = this.payments.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new NotFoundException("Paiement introuvable");
    }

    this.payments.splice(index, 1);
    return { success: true };
  }

  async removeDb(id: string): Promise<{ success: true }> {
    await this.prisma.payment.delete({ where: { id } });
    return { success: true };
  }

  private async ensureReceiptsDir() {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  }

  async generateReceipt(paymentId: string): Promise<ReceiptResult> {
    const payment = await (async () => {
      try {
        if (await this.isDbAvailable()) {
          return await this.findOneDb(paymentId);
        }
      } catch {
        // fallback mémoire
      }

      const memoryPayment = this.payments.find((item) => item.id === paymentId);
      if (!memoryPayment) {
        throw new NotFoundException("Paiement introuvable");
      }

      return memoryPayment;
    })();

    await this.ensureReceiptsDir();

    const receiptPath = join(RECEIPTS_DIR, `quittance-${payment.id}.pdf`);
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    await new Promise<void>((resolve, reject) => {
      const stream = require("node:fs").createWriteStream(receiptPath);
      const leaseLabel = payment.leaseReference ?? payment.leaseId;
      const propertyLabel = payment.propertyReference ?? "Non renseigne";
      const propertyTitle = payment.propertyTitle ?? "Bien non renseigne";

      doc.pipe(stream);
      doc.fontSize(18).text("Quittance de loyer", { underline: true });
      doc.moveDown();
      doc.fontSize(12).text(`Reference quittance: QUITT-${payment.id.slice(0, 8).toUpperCase()}`);
      doc.text(`Locataire: ${payment.tenantName}`);
      doc.text(`Reference bail: ${leaseLabel}`);
      doc.text(`Reference bien: ${propertyLabel}`);
      doc.text(`Designation du bien: ${propertyTitle}`);
      doc.text(`Echeance: ${new Date(payment.dueDate).toLocaleDateString("fr-FR")}`);
      doc.text(`Montant du: ${payment.amountDue.toLocaleString("fr-FR")} FCFA`);
      doc.text(`Montant paye: ${(payment.amountPaid ?? 0).toLocaleString("fr-FR")} FCFA`);
      doc.text(`Statut: ${payment.status}`);
      doc.text(`Date generation: ${new Date().toLocaleString("fr-FR")}`);
      doc.end();

      stream.on("finish", () => resolve());
      stream.on("error", (err: Error) => reject(err));
    });

    return {
      paymentId: payment.id,
      receiptPath,
      generatedAt: new Date().toISOString(),
    };
  }

  async sendReminderEmail(paymentId: string) {
    const payment = await (async () => {
      try {
        if (await this.isDbAvailable()) {
          return await this.findOneDb(paymentId);
        }
      } catch {
        // fallback mémoire
      }

      const memoryPayment = this.payments.find((item) => item.id === paymentId);
      if (!memoryPayment) {
        throw new NotFoundException("Paiement introuvable");
      }

      return memoryPayment;
    })();

    let tenantPhone: string | undefined;
    try {
      if (await this.isDbAvailable()) {
        const contact = await this.prisma.payment.findUnique({
          where: { id: paymentId },
          select: {
            lease: {
              select: {
                tenant: {
                  select: { phone: true },
                },
              },
            },
          },
        });
        tenantPhone = contact?.lease.tenant.phone ?? undefined;
      }
    } catch {
      tenantPhone = undefined;
    }

    const to = payment.tenantEmail ?? "locataire@gestion.local";
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

    const info = await transporter.sendMail({
      from,
      to,
      subject: `Rappel de paiement - ${payment.leaseReference ?? payment.leaseId}`,
      text: `Bonjour ${payment.tenantName},\n\nVotre paiement lie au bail ${payment.leaseReference ?? payment.leaseId} pour le bien ${payment.propertyReference ?? "non renseigne"} est actuellement au statut ${payment.status}.\nMontant concerne: ${payment.amountDue.toLocaleString("fr-FR")} FCFA.\nMerci de regulariser si necessaire.`,
    });

    const whatsapp = await sendWhatsAppMessage({
      to: tenantPhone,
      text: `Rappel loyer: bail ${payment.leaseReference ?? payment.leaseId}, statut ${payment.status}, montant ${payment.amountDue.toLocaleString("fr-FR")} FCFA.`,
    });

    return {
      message: "Rappel email envoye",
      to,
      messageId: info.messageId,
      whatsapp,
    };
  }
}
