-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClientNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "engagementId" TEXT,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientNote_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ClientNote" ("body", "clientId", "createdAt", "createdById", "id", "updatedAt") SELECT "body", "clientId", "createdAt", "createdById", "id", "updatedAt" FROM "ClientNote";
DROP TABLE "ClientNote";
ALTER TABLE "new_ClientNote" RENAME TO "ClientNote";
CREATE INDEX "ClientNote_clientId_idx" ON "ClientNote"("clientId");
CREATE INDEX "ClientNote_engagementId_idx" ON "ClientNote"("engagementId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
