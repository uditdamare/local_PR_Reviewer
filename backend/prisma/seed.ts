import { PrismaClient } from "@prisma/client";

import { seedFailurePatterns } from "../src/db/seed-patterns";

const prisma = new PrismaClient();

seedFailurePatterns(prisma)
  .then((count) => {
    console.log(`Seeded ${count} failure patterns.`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
