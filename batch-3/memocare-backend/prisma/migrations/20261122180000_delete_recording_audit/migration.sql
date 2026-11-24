-- Audit trail entry for deleting a patient recording.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'DELETE_RECORDING';
