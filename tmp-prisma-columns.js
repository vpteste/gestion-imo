require("dotenv").config();

const { PrismaClient } = require("@gestion/database");

const client = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function main() {
  const cols = await client.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='User' ORDER BY column_name"
  );
  console.log("COLUMNS", cols.map((c) => c.column_name).join("|"));
}

main()
  .catch((error) => {
    console.error("PRISMA_ERR", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.$disconnect();
  });
