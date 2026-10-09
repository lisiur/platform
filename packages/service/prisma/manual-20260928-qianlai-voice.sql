-- ============================================================================
-- ONE-OFF manual migration: qianlai_voice reference data (2026-09-28)
-- ============================================================================
-- Purpose: provision the voice-entry AI config on EXISTING deployments.
-- Fresh databases need nothing — seed.ts already inserts all of these rows
-- on first boot.
--
-- DO NOT move this into prisma/migrations/: on a fresh database the migration
-- would run BEFORE boot-seed and the seed's createFeature/createAiAgent would
-- then 409-crash the boot. This file and seed.ts are two views of the same
-- desired rows — if you change one, change the other.
--
-- Idempotent: safe to run any number of times (ON CONFLICT DO NOTHING).
-- Wrap in one transaction; takes effect immediately, no service restart
-- needed (agent/feature/billing lookups are per-request).
--
-- Unlike the receipt migration there is NO ai_model step: the voice agent
-- passes no capability requirement, so deepseek-v4-flash needs no extra
-- tagging (and a cheaper text model can be pinned in admin later without
-- touching this row's capabilities).
-- ============================================================================

BEGIN;

-- 1. Feature: entitlement gate for the voice-entry agent.
INSERT INTO "feature" ("id", "code", "name", "description", "status", "createdAt", "updatedAt")
VALUES (
  'feat_qianlai_voice',
  'qianlai_voice',
  'Qianlai Voice Entry',
  'Parse spoken transaction descriptions into draft entries.',
  'active',
  now(),
  now()
)
ON CONFLICT ("code") DO NOTHING;

-- 2. Grant the feature to the `basic` plan (all users auto-subscribe there).
INSERT INTO "plan_feature" ("planId", "featureId")
SELECT p."id", f."id"
FROM "pricing_plan" p
JOIN "feature" f ON f."code" = 'qianlai_voice'
WHERE p."code" = 'basic'
ON CONFLICT DO NOTHING;

-- 3. The agent itself. `subAgents` must stay byte-compatible with the shape
--    agent-resolution.service.ts's subAgentSchema parses (label/modelId
--    required) and with seed.ts's system prompt.
INSERT INTO "ai_agent" ("id", "code", "name", "description", "status", "subAgents", "allowedApis", "createdAt", "updatedAt")
VALUES (
  'agent_qianlai_voice',
  'qianlai_voice',
  'Qianlai Voice Entry',
  'Parses spoken transaction descriptions into draft bookkeeping entries.',
  'active',
  '{"default":{"label":"Voice Entry","description":"Extracts one transaction from a spoken description.","modelId":"deepseek-v4-flash","systemPrompt":"You are the voice-entry engine inside Qianlai, a personal double-entry bookkeeping app.\nYou receive a transcript of the user speaking one transaction (amount, what it was for, when, where, money direction) in natural speech, plus the current local time as the anchor for relative expressions.\nYou must extract exactly one transaction from it.\n\nRespond with ONLY a single valid JSON object — no markdown, no code fences, no commentary.\nNever invent details the user did not say; use null.","reasoning":"none"}}',
  '[]',
  now(),
  now()
)
ON CONFLICT ("code") DO NOTHING;

-- 4. Billing: flat 1 credit per parse (prepaid; 402 when short).
INSERT INTO "billing_config" ("id", "resourceType", "resourceId", "billingType", "priceUnit", "priceAmount", "status", "description", "createdAt", "updatedAt")
VALUES (
  'billing_qianlai_voice',
  'ai_agent',
  'qianlai_voice',
  'per_call',
  'credit',
  1,
  'active',
  'Bill Qianlai voice entry as a fixed flat call price.',
  now(),
  now()
)
ON CONFLICT ("resourceType", "resourceId") DO NOTHING;

COMMIT;

-- ============================================================================
-- Verification (run after; every row below should answer):
-- SELECT "code", "status" FROM "feature" WHERE "code" = 'qianlai_voice';
-- SELECT f."code" FROM "plan_feature" pf
--   JOIN "pricing_plan" p ON p."id" = pf."planId"
--   JOIN "feature" f ON f."id" = pf."featureId"
--   WHERE p."code" = 'basic';
-- SELECT "code", "subAgents"->'default'->>'modelId' AS model
--   FROM "ai_agent" WHERE "code" = 'qianlai_voice';
-- SELECT "billingType", "priceAmount" FROM "billing_config"
--   WHERE "resourceType" = 'ai_agent' AND "resourceId" = 'qianlai_voice';
-- ============================================================================
