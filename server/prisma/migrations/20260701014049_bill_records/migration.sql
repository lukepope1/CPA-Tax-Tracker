-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "billedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bill_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "billId" TEXT,
    CONSTRAINT "Engagement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Engagement_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Engagement_parentEngagementId_fkey" FOREIGN KEY ("parentEngagementId") REFERENCES "Engagement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Engagement_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Engagement" ("assignedToId", "billed", "billedAmount", "billedDate", "clientId", "createdAt", "description", "extensionFiled", "fiscalYearEndDay", "fiscalYearEndMonth", "formType", "id", "jurisdiction", "notes", "parentEngagementId", "priorBilled", "priorYearFee", "priorYearHours", "projectedFee", "status", "taxYear", "updatedAt") SELECT "assignedToId", "billed", "billedAmount", "billedDate", "clientId", "createdAt", "description", "extensionFiled", "fiscalYearEndDay", "fiscalYearEndMonth", "formType", "id", "jurisdiction", "notes", "parentEngagementId", "priorBilled", "priorYearFee", "priorYearHours", "projectedFee", "status", "taxYear", "updatedAt" FROM "Engagement";
DROP TABLE "Engagement";
ALTER TABLE "new_Engagement" RENAME TO "Engagement";
CREATE INDEX "Engagement_clientId_idx" ON "Engagement"("clientId");
CREATE INDEX "Engagement_taxYear_idx" ON "Engagement"("taxYear");
CREATE INDEX "Engagement_parentEngagementId_idx" ON "Engagement"("parentEngagementId");
CREATE INDEX "Engagement_billId_idx" ON "Engagement"("billId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Bill_clientId_idx" ON "Bill"("clientId");
