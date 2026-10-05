import type { PrismaClient } from "@prisma/client";

import { FAILURE_PATTERNS } from "../patterns/failure-patterns";

/**
 * Upserts the curated failure patterns from patterns/failure-patterns.ts into
 * Postgres. Shared by `npm run db:seed` (prisma/seed.ts) and the remote HTTP
 * server's startup, so a freshly migrated, empty database is never served
 * without its pattern set.
 *
 * The TS file is the source of truth (patterns are added via PR review, not at
 * runtime), so re-running this on every boot is intentional: it re-applies the
 * reviewed definitions and is a no-op when nothing changed.
 */
export async function seedFailurePatterns(prisma: PrismaClient): Promise<number> {
  for (const pattern of FAILURE_PATTERNS) {
    const data = {
      name: pattern.name,
      description: pattern.description,
      exampleSignature: pattern.exampleSignature,
      sourceName: pattern.source.name,
      sourceDate: pattern.source.date,
      sourceUrl: pattern.source.url,
    };

    await prisma.failurePattern.upsert({
      where: { id: pattern.id },
      create: { id: pattern.id, ...data },
      update: data,
    });
  }

  return FAILURE_PATTERNS.length;
}
