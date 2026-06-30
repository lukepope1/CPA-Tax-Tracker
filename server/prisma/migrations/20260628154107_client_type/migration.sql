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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Client" ("clientCode", "contactEmail", "contactName", "contactPhone", "createdAt", "fiscalYearEndDay", "fiscalYearEndMonth", "id", "name", "notes") SELECT "clientCode", "contactEmail", "contactName", "contactPhone", "createdAt", "fiscalYearEndDay", "fiscalYearEndMonth", "id", "name", "notes" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_clientCode_key" ON "Client"("clientCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
