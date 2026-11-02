// Request validation (second layer; the database CHECK constraints are the final guard).
import { z } from 'zod';

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(1).max(200),
});

export const ticketSchema = z.object({
  description: z.string().trim().min(10, 'Please describe the problem in at least 10 characters').max(2000),
  priority: z.enum(PRIORITIES).default('Medium'),
});

export const updateTicketSchema = z.object({
  status: z.enum(['In Progress', 'Resolved']),
  resolution_text: z.string().trim().min(10).max(4000).optional(),
});

export const feedbackSchema = z.object({ helpful: z.boolean() });

export const assignSchema = z.object({
  action: z.enum(['reassign', 'escalate']),
  dept_id: z.coerce.number().int().positive().optional(),
  tech_id: z.coerce.number().int().positive().optional(),
  priority: z.enum(PRIORITIES).optional(),
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(10, 'Password must be at least 10 characters').max(100),
  role: z.enum(['Employee', 'Technician', 'Admin']),
  dept_id: z.coerce.number().int().positive().optional(),
});

export const userPatchSchema = z.object({ is_active: z.boolean() });

export const listSchema = z.object({
  status: z.enum(['Open', 'In Progress', 'Resolved']).optional(),
  priority: z.enum(PRIORITIES).optional(),
  dept_id: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(200).optional(),
  scope: z.enum(['all', 'queue', 'triage', 'unassigned']).optional(),
});

export function parseQuery(request, schema) {
  const obj = {};
  for (const [k, v] of new URL(request.url).searchParams) if (v !== '') obj[k] = v;
  return schema.parse(obj);
}
