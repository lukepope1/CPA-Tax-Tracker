import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();
router.use(requireAuth, requireAdmin);

const d = (val: Date | string | null | undefined) => (val ? new Date(val).toISOString().slice(0, 10) : "");

// Full data export for off-site backup. Admin only. Returns flat rows per
// entity, ready to drop into spreadsheet tabs on the client.
router.get("/all", async (_req, res) => {
  const [clients, engagements, dueDates, timeEntries, users] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.engagement.findMany({
      include: { client: { select: { name: true } }, assignedTo: { select: { name: true } } },
      orderBy: [{ taxYear: "desc" }],
    }),
    prisma.dueDate.findMany({
      include: { engagement: { include: { client: { select: { name: true } } } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.timeEntry.findMany({
      include: {
        user: { select: { name: true } },
        client: { select: { name: true } },
        engagement: { select: { formType: true, taxYear: true, jurisdiction: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, billableRate: true } }),
  ]);

  res.json({
    clients: clients.map((c) => ({
      Name: c.name,
      Type: c.clientType,
      FirstName: c.firstName ?? "",
      LastName: c.lastName ?? "",
      SpouseName: c.spouseName ?? "",
      Code: c.clientCode ?? "",
      ContactName: c.contactName ?? "",
      ContactEmail: c.contactEmail ?? "",
      ContactPhone: c.contactPhone ?? "",
      FYE_Month: c.fiscalYearEndMonth,
      FYE_Day: c.fiscalYearEndDay,
      Notes: c.notes ?? "",
      InTrash: c.deletedAt ? "Yes" : "",
      DeletedAt: d(c.deletedAt),
      CreatedAt: d(c.createdAt),
    })),
    returns: engagements.map((e) => ({
      Client: e.client.name,
      Form: e.formType,
      Jurisdiction: e.jurisdiction,
      TaxYear: e.taxYear,
      Status: e.status,
      AssignedTo: e.assignedTo?.name ?? "",
      ExtensionFiled: e.extensionFiled ? "Yes" : "",
      ProjectedFee: e.projectedFee ?? "",
      PriorYearFee: e.priorYearFee ?? "",
      PriorYearHours: e.priorYearHours ?? "",
      PriorBilled: e.priorBilled ?? "",
      Billed: e.billed ? "Yes" : "",
      BilledDate: d(e.billedDate),
      BilledAmount: e.billedAmount ?? "",
    })),
    dueDates: dueDates.map((dd) => ({
      Client: dd.engagement?.client?.name ?? "",
      Form: dd.engagement?.formType ?? "",
      Jurisdiction: dd.engagement?.jurisdiction ?? "",
      TaxYear: dd.engagement?.taxYear ?? "",
      Type: dd.type,
      DueDate: d(dd.dueDate),
      Completed: dd.completed ? "Yes" : "",
      CompletedDate: d(dd.completedDate),
    })),
    timeEntries: timeEntries.map((t) => ({
      Date: d(t.date),
      Staff: t.user?.name ?? "",
      Client: t.client?.name ?? "",
      Return: t.engagement ? `${t.engagement.formType} ${t.engagement.taxYear} (${t.engagement.jurisdiction})` : "General",
      Hours: t.hours,
      Rate: t.rate ?? "",
      Description: t.description,
      Billable: t.billable ? "Yes" : "No",
    })),
    staff: users.map((u) => ({
      Name: u.name,
      Email: u.email,
      Role: u.role,
      BillableRate: u.billableRate ?? "",
    })),
  });
});

export default router;
