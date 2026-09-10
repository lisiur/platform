-- Project outsiders no longer hold a ledger row: their ProjectMember rows
-- are the membership (derived as the guest role at access time). Existing
-- guest rows predate that model — drop them so outsider identity comes from
-- one place. LedgerMember is referenced by no other table (participant
-- tags anchor to User), so the delete is safe; full roles
-- (owner/editor/viewer) are untouched.
DELETE FROM "qianlai_ledger_member" WHERE "role" = 'guest';
