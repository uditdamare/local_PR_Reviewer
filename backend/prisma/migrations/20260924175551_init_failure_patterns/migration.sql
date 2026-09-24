-- CreateTable
CREATE TABLE "failure_patterns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "exampleSignature" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceDate" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "failure_patterns_pkey" PRIMARY KEY ("id")
);
