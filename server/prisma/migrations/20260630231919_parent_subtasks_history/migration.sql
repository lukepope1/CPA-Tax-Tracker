-- CreateTable
CREATE TABLE "StatusChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engagementId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" TEXT,
    CONSTRAINT "StatusChange_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StatusChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "clientType" TEXT NOT NULL DEFAULT 'Corporation',
    "firstName" TEXT,
    "lastName" TEXT,
    "spouseName" TEXT,
    "clientCode" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "fiscalYearEndMonth" INTEGER NOT NULL DEFAULT 12,
    "fiscalYearEndDay" INTEGER NOT NULL DEFAULT 31,
    "notes" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parentId" TEXT,
    CONSTRAINT "Client_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Client" ("clientCode", "clientType", "contactEmail", "contactName", "contactPhone", "createdAt", "deletedAt", "firstName", "fiscalYearEndDay", "fiscalYearEndMonth", "id", "lastName", "name", "notes", "spouseName") SELECT "clientCode", "clientType", "contactEmail", "contactName", "contactPhone", "createdAt", "deletedAt", "firstName", "fiscalYearEndDay", "fiscalYearEndMonth", "id", "lastName", "name", "notes", "spouseName" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_clientCode_key" ON "Client"("clientCode");
CREATE TABLE "new_Engagement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT 'Federal',
    "description" TEXT,
    "taxYear" INTEGER NOT NULL,
    "fiscalYearEndMonth" INTEGER NOT NULL DEFAULT 12,
    "fiscalYearEndDay" INTEGER NOT NULL DEFAULT 31,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "extensionFiled" BOOLEAN NOT NULL DEFAULT false,
    "assignedToId" TEXT,
    "notes" TEXT,
    "projectedFee" REAL,
    "priorYearFee" REAL,
    "priorYearHours" REAL,
    "priorBilled" REAL,
    "billed" BOOLEAN NOT NULL DEFAULT false,
    "billedDate" DATETIME,
    "billedAmount" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "parentEngagementId" TEXT,
    CONSTRAINT "Engagement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Engagement_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Engagement_parentEngagementId_fkey" FOREIGN KEY ("parentEngagementId") REFERENCES "Engagement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Engagement" ("assignedToId", "billed", "billedAmount", "billedDate", "clientId", "createdAt", "description", "extensionFiled", "fiscalYearEndDay", "fiscalYearEndMonth", "formType", "id", "jurisdiction", "notes", "priorBilled", "priorYearFee", "priorYearHours", "projectedFee", "status", "taxYear", "updatedAt") SELECT "assignedToId", "billed", "billedAmount", "billedDate", "clientId", "createdAt", "description", "extensionFiled", "fiscalYearEndDay", "fiscalYearEndMonth", "formType", "id", "jurisdiction", "notes", "priorBilled", "priorYearFee", "priorYearHours", "projectedFee", "status", "taxYear", "updatedAt" FROM "Engagement";
DROP TABLE "Engagement";
ALTER TABLE "new_Engagement" RENAME TO "Engagement";
CREATE INDEX "Engagement_clientId_idx" ON "Engagement"("clientId");
CREATE INDEX "Engagement_taxYear_idx" ON "Engagement"("taxYear");
CREATE INDEX "Engagement_parentEngagementId_idx" ON "Engagement"("parentEngagementId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "StatusChange_engagementId_idx" ON "StatusChange"("engagementId");
