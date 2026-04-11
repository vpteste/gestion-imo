import { PropertiesService } from "./properties.service";

describe("PropertiesService", () => {
  let service: PropertiesService;

  beforeEach(() => {
    const prismaMock = {
      property: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    service = new PropertiesService(prismaMock);
  });

  it("creates and lists properties", () => {
    const created = service.create({
      reference: "TEST-001",
      title: "Appartement Test",
      addressLine: "1 rue Test",
      city: "Lille",
      postalCode: "59000",
      rentAmount: 900,
      ownerId: "u-owner",
      agentId: "u-agent",
    });

    expect(created.id).toBeDefined();

    const all = service.findAll({});
    expect(all.some((item) => item.reference === "TEST-001")).toBe(true);

    const filtered = service.findAll({ city: "Lille" });
    expect(filtered.length).toBeGreaterThanOrEqual(1);
  });
});
