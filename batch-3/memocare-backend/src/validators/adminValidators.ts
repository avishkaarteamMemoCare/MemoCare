import { z } from 'zod';

export const createHospitalSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(300).optional(),
});

export const approveStaffSchema = z.object({
  staffTitle: z.enum(['DOCTOR', 'NURSE', 'CLINICIAN', 'ADMIN_STAFF']),
});

// Hospital management can create a ready-to-use staff login (e.g. for a
// doctor joining today) instead of waiting for a self-signup to be approved.
export const createStaffSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  staffTitle: z.enum(['DOCTOR', 'NURSE', 'CLINICIAN', 'ADMIN_STAFF']),
  hospitalId: z.string().uuid().optional(),
});

export const listUsersQuerySchema = z.object({
  role: z.enum(['FAMILY', 'CARETAKER', 'HOSPITAL_STAFF', 'ADMIN']).optional(),
  status: z.enum(['PENDING_VERIFICATION', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED']).optional(),
});
