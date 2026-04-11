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
  const users = await client.user.findMany({
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });
  console.log("EMAILS", users.map((u) => u.email).join("|"));
}

main()
  .catch((error) => {
    console.error("PRISMA_ERR", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.$disconnect();
  });
