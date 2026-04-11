import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("App E2E", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns ok", async () => {
    await request(app.getHttpServer()).get("/health").expect(200).expect((res) => {
      expect(res.body.status).toBe("ok");
    });
  });

  it("rejects /admin without auth", async () => {
    await request(app.getHttpServer()).get("/admin").expect(401);
  });

  it("allows admin to access /admin", async () => {
    await request(app.getHttpServer())
      .get("/admin")
      .set("x-user-role", "admin")
      .set("x-user-id", "u-admin")
      .expect(200);
  });

  it("supports auth login then profile", async () => {
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@gestion.local", password: "demo-admin" })
      .expect(201);

    const token = loginRes.body.accessToken;
    expect(token).toBeTruthy();

    await request(app.getHttpServer())
      .get("/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.user.role).toBe("admin");
      });
  });

  it("provisions a pending account and activates it before login", async () => {
    const uniqueEmail = `nouveau.locataire.${Date.now()}@gestion.local`;

    const provisionRes = await request(app.getHttpServer())
      .post("/auth/users/provision")
      .set("x-user-role", "admin")
      .set("x-user-id", "u-admin")
      .send({
        email: uniqueEmail,
        fullName: "Nouveau Locataire",
        role: "locataire",
        identityLinks: {
          leaseId: "lease-001",
          propertyId: "prop-demo-1",
        },
      })
      .expect(201);

    expect(provisionRes.body.user.status).toBe("pending");
    expect(provisionRes.body.activation.token).toBeTruthy();

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: uniqueEmail, password: "Password123" })
      .expect(401);

    await request(app.getHttpServer())
      .post("/auth/activate")
      .send({ token: provisionRes.body.activation.token, password: "Password123" })
      .expect(201)
      .expect((res) => {
        expect(res.body.user.status).toBe("active");
      });

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: uniqueEmail, password: "Password123" })
      .expect(201)
      .expect((res) => {
        expect(res.body.user.role).toBe("locataire");
      });
  });

  it("blocks non-admin from provisioning users", async () => {
    await request(app.getHttpServer())
      .post("/auth/users/provision")
      .set("x-user-role", "agent")
      .set("x-user-id", "u-agent")
      .send({
        email: "forbidden.create@gestion.local",
        fullName: "Forbidden Create",
        role: "locataire",
        identityLinks: { leaseId: "lease-001" },
      })
      .expect(403);
  });

  it("filters payments for tenant authenticated by JWT", async () => {
    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "locataire@gestion.local", password: "demo-tenant" })
      .expect(201);

    const token = loginRes.body.accessToken;

    await request(app.getHttpServer())
      .get("/payments")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].tenantEmail).toBe("locataire@gestion.local");
      });
  });

  it("filters properties for owner and blocks foreign property detail", async () => {
    await request(app.getHttpServer())
      .get("/properties")
      .set("x-user-role", "proprietaire")
      .set("x-user-id", "u-owner")
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].ownerId).toBe("u-owner");
      });

    await request(app.getHttpServer())
      .get("/properties/prop-demo-2")
      .set("x-user-role", "proprietaire")
      .set("x-user-id", "u-owner")
      .expect(403);
  });

  it("filters tenants for owner and blocks foreign tenant detail", async () => {
    await request(app.getHttpServer())
      .get("/tenants")
      .set("x-user-role", "proprietaire")
      .set("x-user-id", "u-owner")
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].currentPropertyId).toBe("prop-demo-1");
      });

    await request(app.getHttpServer())
      .get("/tenants/t-demo-2")
      .set("x-user-role", "proprietaire")
      .set("x-user-id", "u-owner")
      .expect(403);
  });

  it("filters properties for agent and blocks foreign property detail", async () => {
    await request(app.getHttpServer())
      .get("/properties")
      .set("x-user-role", "agent")
      .set("x-user-id", "u-agent")
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].agentId).toBe("u-agent");
      });

    await request(app.getHttpServer())
      .get("/properties/prop-demo-2")
      .set("x-user-role", "agent")
      .set("x-user-id", "u-agent")
      .expect(403);
  });

  it("filters tenants and payments for agent portfolio", async () => {
    await request(app.getHttpServer())
      .get("/tenants")
      .set("x-user-role", "agent")
      .set("x-user-id", "u-agent")
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].currentPropertyId).toBe("prop-demo-1");
      });

    await request(app.getHttpServer())
      .get("/payments")
      .set("x-user-role", "agent")
      .set("x-user-id", "u-agent")
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].leaseId).toBe("lease-001");
      });
  });

  it("allows admin to read activity logs and blocks non-admin", async () => {
    await request(app.getHttpServer())
      .get("/properties")
      .set("x-user-role", "agent")
      .set("x-user-id", "u-agent")
      .expect(200);

    await request(app.getHttpServer())
      .get("/activity-logs")
      .set("x-user-role", "admin")
      .set("x-user-id", "u-admin")
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
      });

    await request(app.getHttpServer())
      .get("/activity-logs")
      .set("x-user-role", "agent")
      .set("x-user-id", "u-agent")
      .expect(403);
  });

  it("allows tenant to create incident and restricts agent update outside portfolio", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/incidents")
      .set("x-user-role", "locataire")
      .set("x-user-id", "u-tenant")
      .send({
        propertyId: "prop-demo-2",
        title: "Panne chauffage",
        description: "Le chauffage ne démarre plus.",
      })
      .expect(201);

    expect(createRes.body.id).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/incidents/${createRes.body.id}`)
      .set("x-user-role", "agent")
      .set("x-user-id", "u-agent")
      .send({ status: "en_cours" })
      .expect(403);
  });

  it("restricts inspections by portfolio and allows tenant signature on own lease", async () => {
    const ownInspection = await request(app.getHttpServer())
      .post("/inspections")
      .set("x-user-role", "agent")
      .set("x-user-id", "u-agent")
      .send({
        propertyId: "prop-demo-1",
        leaseId: "lease-001",
        type: "entree",
        scheduledAt: new Date().toISOString(),
      })
      .expect(201);

    const foreignInspection = await request(app.getHttpServer())
      .post("/inspections")
      .set("x-user-role", "admin")
      .set("x-user-id", "u-admin")
      .send({
        propertyId: "prop-demo-2",
        leaseId: "lease-002",
        type: "sortie",
        scheduledAt: new Date().toISOString(),
      })
      .expect(201);

    await request(app.getHttpServer())
      .get("/inspections")
      .set("x-user-role", "agent")
      .set("x-user-id", "u-agent")
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.some((item: { propertyId: string }) => item.propertyId === "prop-demo-1")).toBe(true);
      });

    await request(app.getHttpServer())
      .post("/inspections")
      .set("x-user-role", "agent")
      .set("x-user-id", "u-agent")
      .send({
        propertyId: "prop-demo-2",
        leaseId: "lease-002",
        type: "sortie",
        scheduledAt: new Date().toISOString(),
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/inspections/${ownInspection.body.id}/sign`)
      .set("x-user-role", "locataire")
      .set("x-user-id", "u-tenant")
      .set("x-user-email", "locataire@gestion.local")
      .expect(201)
      .expect((res) => {
        expect(res.body.signedByTenantAt).toBeTruthy();
      });

    await request(app.getHttpServer())
      .post(`/inspections/${foreignInspection.body.id}/sign`)
      .set("x-user-role", "locataire")
      .set("x-user-id", "u-tenant")
      .set("x-user-email", "locataire@gestion.local")
      .expect(403);
  }, 20000);
});
