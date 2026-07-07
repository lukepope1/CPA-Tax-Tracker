import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken, requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(["ADMIN", "STAFF"]).default("STAFF"),
  billableRate: z.number().nonnegative().optional().nullable(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "STAFF"]).optional(),
  billableRate: z.number().nonnegative().optional().nullable(),
  password: z.string().min(8).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const userCount = await prisma.user.count();
  const role = userCount === 0 ? "ADMIN" : "STAFF";

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashed, name, role },
  });

  const token = signToken({ userId: user.id, role: user.role as "ADMIN" | "STAFF" });
  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken({ userId: user.id, role: user.role as "ADMIN" | "STAFF" });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

// Any signed-in user can change their own password (current password required).
router.post("/change-password", requireAuth, async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "New password must be at least 8 characters" });

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!valid) return res.status(400).json({ error: "Current password is incorrect" });

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(parsed.data.newPassword, 10) },
  });
  res.json({ ok: true });
});

router.get("/users", requireAuth, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, billableRate: true },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

// Admin: add a staff member with a name, email, password, role, and billable rate.
router.post("/users", requireAuth, requireAdmin, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, name, role, billableRate } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashed, name, role, billableRate: billableRate ?? null },
  });

  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role, billableRate: user.billableRate });
});

// Admin: update a staff member's name, role, billable rate, or password.
router.put("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, role, billableRate, password } = parsed.data;

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      name,
      role,
      billableRate: billableRate === undefined ? undefined : billableRate,
      password: password ? await bcrypt.hash(password, 10) : undefined,
    },
  });

  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, billableRate: user.billableRate });
});

// Admin: remove a staff member. Their logged time entries are removed with
// them (cascade); any engagements assigned to them become unassigned.
router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  if (req.params.id === req.user!.userId) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  await prisma.user.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
