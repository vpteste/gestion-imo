import { PaymentsService } from "./payments.service";

describe("PaymentsService", () => {
  let service: PaymentsService;

  beforeEach(() => {
    const prismaMock = {} as any;
    service = new PaymentsService(prismaMock);
  });

  it("creates payment and exposes alerts", () => {
    const created = service.create({
      leaseId: "lease-100",
      tenantName: "Tenant Unit",
      tenantEmail: "tenant@example.com",
      dueDate: new Date().toISOString(),
      amountDue: 777,
    });

    expect(created.status).toBe("retard");

    const alerts = service.getAlerts();
    expect(alerts.totalAlerts).toBeGreaterThanOrEqual(1);
  });
});
