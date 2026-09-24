import { PrismaClient } from "@prisma/client";

import { FAILURE_PATTERNS } from "../src/patterns/failure-patterns";

const prisma = new PrismaClient();

async function main() {
  for (const pattern of FAILURE_PATTERNS) {
    await prisma.failurePattern.upsert({
      where: { id: pattern.id },
      create: {
        id: pattern.id,
        name: pattern.name,
        description: pattern.description,
        exampleSignature: pattern.exampleSignature,
        sourceName: pattern.source.name,
        sourceDate: pattern.source.date,
        sourceUrl: pattern.source.url,
      },
      update: {
        name: pattern.name,
        description: pattern.description,
        exampleSignature: pattern.exampleSignature,
        sourceName: pattern.source.name,
        sourceDate: pattern.source.date,
        sourceUrl: pattern.source.url,
      },
    });
  }

  console.log(`Seeded ${FAILURE_PATTERNS.length} failure patterns.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
