-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Engagement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
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
    "billed" BOOLEAN NOT NULL DEFAULT false,
    "billedDate" DATETIME,
    "billedAmount" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Engagement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Engagement_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Engagement" ("assignedToId", "clientId", "createdAt", "extensionFiled", "fiscalYearEndDay", "fiscalYearEndMonth", "formType", "id", "notes", "status", "taxYear", "updatedAt") SELECT "assignedToId", "clientId", "createdAt", "extensionFiled", "fiscalYearEndDay", "fiscalYearEndMonth", "formType", "id", "notes", "status", "taxYear", "updatedAt" FROM "Engagement";
DROP TABLE "Engagement";
ALTER TABLE "new_Engagement" RENAME TO "Engagement";
CREATE INDEX "Engagement_clientId_idx" ON "Engagement"("clientId");
CREATE INDEX "Engagement_taxYear_idx" ON "Engagement"("taxYear");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
