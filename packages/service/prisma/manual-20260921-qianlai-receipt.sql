-- ============================================================================
-- ONE-OFF manual migration: qianlai_receipt reference data (2026-09-21)
-- ============================================================================
-- Purpose: provision the screenshot-recognition AI config on EXISTING
-- deployments. Fresh databases need nothing — seed.ts already inserts all of
-- these rows on first boot.
--
-- DO NOT move this into prisma/migrations/: on a fresh database the migration
-- would run BEFORE boot-seed and the seed's createFeature/createAiAgent would
-- then 409-crash the boot. This file and seed.ts are two views of the same
-- desired rows — if you change one, change the other.
--
-- Idempotent: safe to run any number of times (ON CONFLICT DO NOTHING /
-- guarded UPDATE). Wrap in one transaction; takes effect immediately, no
-- service restart needed (agent/feature/billing lookups are per-request).
-- ============================================================================

BEGIN;

-- 1. Tag deepseek-v4-flash as vision-capable (existing rows predate the
--    seed's capabilities ["vision"]). Skips rows already tagged.
UPDATE "ai_model"
SET "capabilities" = "capabilities" || 'vision'::text,
    "updatedAt"    = now()
WHERE "modelId" = 'deepseek-v4-flash'
  AND NOT ('vision' = ANY("capabilities"));

-- 2. Feature: entitlement gate for the recognition agent.
INSERT INTO "feature" ("id", "code", "name", "description", "status", "createdAt", "updatedAt")
VALUES (
  'feat_qianlai_receipt',
  'qianlai_receipt',
  'Qianlai Receipt Recognition',
  'Recognize payment screenshots into draft bookkeeping entries.',
  'active',
  now(),
  now()
)
ON CONFLICT ("code") DO NOTHING;

-- 3. Grant the feature to the `basic` plan (all users auto-subscribe there).
INSERT INTO "plan_feature" ("planId", "featureId")
SELECT p."id", f."id"
FROM "pricing_plan" p
JOIN "feature" f ON f."code" = 'qianlai_receipt'
WHERE p."code" = 'basic'
ON CONFLICT DO NOTHING;

-- 4. The agent itself. `subAgents` must stay byte-compatible with the shape
--    agent-resolution.service.ts's subAgentSchema parses (label/modelId
--    required) and with seed.ts's system prompt.
INSERT INTO "ai_agent" ("id", "code", "name", "description", "status", "subAgents", "allowedApis", "createdAt", "updatedAt")
VALUES (
  'agent_qianlai_receipt',
  'qianlai_receipt',
  'Qianlai Receipt Recognition',
  'Recognizes payment screenshots into draft bookkeeping entries.',
  'active',
  '{"default":{"label":"Receipt Recognition","description":"Extracts one transaction from a payment screenshot.","modelId":"deepseek-v4-flash","systemPrompt":"You are the receipt-recognition engine inside Qianlai, a personal double-entry bookkeeping app.\nYou receive one payment screenshot (Alipay/WeChat Pay receipt, bank or merchant order page, transfer record, etc.) and must extract exactly one successful transaction from it.\n\nRespond with ONLY a single valid JSON object — no markdown, no code fences, no commentary.\nNever invent values not visible in the screenshot; use null.","reasoning":"none"}}',
  '[]',
  now(),
  now()
)
ON CONFLICT ("code") DO NOTHING;

-- 5. Billing: flat 1 credit per recognition (prepaid; 402 when short).
INSERT INTO "billing_config" ("id", "resourceType", "resourceId", "billingType", "priceUnit", "priceAmount", "status", "description", "createdAt", "updatedAt")
VALUES (
  'billing_qianlai_receipt',
  'ai_agent',
  'qianlai_receipt',
  'per_call',
  'credit',
  1,
  'active',
  'Bill Qianlai screenshot recognition as a fixed flat call price.',
  now(),
  now()
)
ON CONFLICT ("resourceType", "resourceId") DO NOTHING;

COMMIT;

-- ============================================================================
-- Verification (run after; every row below should answer):
-- SELECT "code", "status" FROM "feature" WHERE "code" = 'qianlai_receipt';
-- SELECT f."code" FROM "plan_feature" pf
--   JOIN "pricing_plan" p ON p."id" = pf."planId"
--   JOIN "feature" f ON f."id" = pf."featureId"
--   WHERE p."code" = 'basic';
-- SELECT "code", "subAgents"->'default'->>'modelId' AS model
--   FROM "ai_agent" WHERE "code" = 'qianlai_receipt';
-- SELECT "billingType", "priceAmount" FROM "billing_config"
--   WHERE "resourceType" = 'ai_agent' AND "resourceId" = 'qianlai_receipt';
-- SELECT "modelId", "capabilities" FROM "ai_model"
--   WHERE "modelId" = 'deepseek-v4-flash';
-- ============================================================================
