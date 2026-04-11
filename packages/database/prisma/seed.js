const { PrismaClient, UserRole } = require("@prisma/client");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://gestion:gestion@localhost:5432/gestion?schema=public";
}

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@gestion.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe_2026!";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Administrateur Plateforme";

async function cleanupDemoData() {
  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany({});
    await tx.inspectionPhoto.deleteMany({});
    await tx.inspection.deleteMany({});
    await tx.payment.deleteMany({});
    await tx.contract.deleteMany({});
    await tx.document.deleteMany({});
    await tx.lease.deleteMany({});
    await tx.property.deleteMany({});
    await tx.user.deleteMany({ where: { email: { not: ADMIN_EMAIL } } });
  });
}

async function main() {
  await cleanupDemoData();

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      fullName: ADMIN_NAME,
      role: UserRole.admin,
      passwordHash: ADMIN_PASSWORD,
      status: "active",
    },
    create: {
      email: ADMIN_EMAIL,
      passwordHash: ADMIN_PASSWORD,
      fullName: ADMIN_NAME,
      role: UserRole.admin,
      status: "active",
    },
  });

  console.log("Seed propre appliqué.");
  console.log(`Compte admin disponible: ${ADMIN_EMAIL}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
