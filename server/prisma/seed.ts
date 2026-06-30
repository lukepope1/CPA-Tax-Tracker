import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateDueDates, FormType } from "../src/lib/dueDates";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("password123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@cpataxtracker.com" },
    update: {},
    create: {
      email: "admin@cpataxtracker.com",
      password: adminPassword,
      name: "Pat Admin",
      role: "ADMIN",
    },
  });

  const staffPassword = await bcrypt.hash("password123", 10);
  const staff = await prisma.user.upsert({
    where: { email: "staff@cpataxtracker.com" },
    update: {},
    create: {
      email: "staff@cpataxtracker.com",
      password: staffPassword,
      name: "Sam Staff",
      role: "STAFF",
    },
  });

  const clientsData = [
    {
      name: "John & Mary Smith",
      clientCode: "SMITH-1040",
      contactEmail: "jsmith@example.com",
      fiscalYearEndMonth: 12,
      fiscalYearEndDay: 31,
      engagements: [{ formType: "FORM_1040" as FormType, taxYear: 2025 }],
    },
    {
      name: "Riverside Partners LLC",
      clientCode: "RIVERSIDE-1065",
      contactEmail: "ap@riversidepartners.com",
      fiscalYearEndMonth: 12,
      fiscalYearEndDay: 31,
      engagements: [{ formType: "FORM_1065" as FormType, taxYear: 2025 }],
    },
    {
      name: "Bluebird Consulting, Inc. (S-Corp)",
      clientCode: "BLUEBIRD-1120S",
      contactEmail: "finance@bluebirdconsulting.com",
      fiscalYearEndMonth: 12,
      fiscalYearEndDay: 31,
      engagements: [{ formType: "FORM_1120S" as FormType, taxYear: 2025 }],
    },
    {
      name: "Acme Manufacturing Corp",
      clientCode: "ACME-1120",
      contactEmail: "controller@acmemfg.com",
      fiscalYearEndMonth: 6,
      fiscalYearEndDay: 30,
      engagements: [{ formType: "FORM_1120" as FormType, taxYear: 2025 }],
    },
    {
      name: "Helping Hands Foundation",
      clientCode: "HELPINGHANDS-990",
      contactEmail: "treasurer@helpinghands.org",
      fiscalYearEndMonth: 12,
      fiscalYearEndDay: 31,
      engagements: [{ formType: "FORM_990" as FormType, taxYear: 2025 }],
    },
  ];

  for (const c of clientsData) {
    const existing = await prisma.client.findUnique({ where: { clientCode: c.clientCode } });
    if (existing) continue;

    const client = await prisma.client.create({
      data: {
        name: c.name,
        clientCode: c.clientCode,
        contactEmail: c.contactEmail,
        fiscalYearEndMonth: c.fiscalYearEndMonth,
        fiscalYearEndDay: c.fiscalYearEndDay,
      },
    });

    for (const eng of c.engagements) {
      const generated = generateDueDates(eng.formType, eng.taxYear, c.fiscalYearEndMonth, c.fiscalYearEndDay);
      const engagement = await prisma.engagement.create({
        data: {
          clientId: client.id,
          formType: eng.formType,
          taxYear: eng.taxYear,
          fiscalYearEndMonth: c.fiscalYearEndMonth,
          fiscalYearEndDay: c.fiscalYearEndDay,
          status: "IN_PREP",
          assignedToId: staff.id,
          dueDates: {
            create: generated.map((d) => ({ type: d.type, dueDate: d.dueDate })),
          },
        },
      });

      await prisma.timeEntry.create({
        data: {
          userId: staff.id,
          clientId: client.id,
          engagementId: engagement.id,
          date: new Date(),
          hours: 1.5,
          description: `Initial document review for ${eng.formType.replace("FORM_", "Form ")} - ${eng.taxYear}`,
          billable: true,
        },
      });
    }
  }

  console.log("Seed complete.");
  console.log("Admin login: admin@cpataxtracker.com / password123");
  console.log("Staff login: staff@cpataxtracker.com / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
