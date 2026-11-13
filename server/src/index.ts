import "dotenv/config";
import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import clientsRouter from "./routes/clients";
import engagementsRouter from "./routes/engagements";
import dueDatesRouter from "./routes/dueDates";
import timeEntriesRouter from "./routes/timeEntries";
import dashboardRouter from "./routes/dashboard";
import billingRouter from "./routes/billing";
import exportRouter from "./routes/export";
import reportsRouter from "./routes/reports";
import openItemsRouter from "./routes/openItems";
import tasksRouter from "./routes/tasks";
import clientNotesRouter from "./routes/clientNotes";
import { backfillBilledTime } from "./lib/backfillBilledTime";
import { backfillBusinessDays } from "./lib/backfillBusinessDays";

const app = express();
// 4200 keeps clear of the other local projects: the Impact CRM API uses 4000
// and the NMTC Compliance Platform API uses 4100.
const PORT = process.env.PORT || 4200;

// CLIENT_ORIGIN may be a single URL or a comma-separated list of allowed origins
// (e.g. the Render URL plus a custom domain).
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5180")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/engagements", engagementsRouter);
app.use("/api/due-dates", dueDatesRouter);
app.use("/api/time-entries", timeEntriesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/billing", billingRouter);
app.use("/api/export", exportRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/open-items", openItemsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/client-notes", clientNotesRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  // One-off repair of bills raised before time entries were linked to them.
  // Idempotent, so it is a no-op on every boot after the first.
  backfillBilledTime().catch((e) => console.error("[billing] backfill failed", e));
  // Same for deadlines stored before the weekend/holiday rule existed.
  backfillBusinessDays().catch((e) => console.error("[due-dates] backfill failed", e));
  console.log(`API server listening on port ${PORT}`);
});
