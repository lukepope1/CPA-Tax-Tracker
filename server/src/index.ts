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

const app = express();
const PORT = process.env.PORT || 4000;

// CLIENT_ORIGIN may be a single URL or a comma-separated list of allowed origins
// (e.g. the Render URL plus a custom domain).
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
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

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
