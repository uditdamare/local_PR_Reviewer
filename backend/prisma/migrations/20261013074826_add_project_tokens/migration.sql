-- CreateTable
CREATE TABLE "project_tokens" (
    "id" SERIAL NOT NULL,
    "gitlabProjectId" TEXT NOT NULL,
    "projectPath" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "scopes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_tokens_gitlabProjectId_key" ON "project_tokens"("gitlabProjectId");
