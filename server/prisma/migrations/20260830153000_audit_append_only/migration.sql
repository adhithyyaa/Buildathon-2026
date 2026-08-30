-- The audit ledger is append-only, enforced by the database itself: a BEFORE UPDATE/DELETE trigger
-- rejects any in-place edit or deletion of an "AuditLog" row. Not even the application's own connection
-- can rewrite a ledger row — rows can only be appended (INSERT) or cleared as a whole by TRUNCATE
-- (the sanctioned admin reset). Combined with the SHA-256 hash chain, this closes the "just rewrite the
-- entire chain" gap: surgical tampering is not merely evident, it is impossible through this database.

CREATE OR REPLACE FUNCTION recoup_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: % is not permitted on the audit ledger', TG_OP USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON "AuditLog";
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION recoup_audit_append_only();

DROP TRIGGER IF EXISTS audit_log_no_delete ON "AuditLog";
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION recoup_audit_append_only();
