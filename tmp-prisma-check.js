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
  const count = await client.user.count();
  console.log("USER_COUNT", count);
}

main()
  .catch((error) => {
    console.error("PRISMA_ERR", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.$disconnect();
  });
