-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobPriority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'IDLE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "LinkType" AS ENUM ('GROUP', 'INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ai_message_role" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "CollectionItemType" AS ENUM ('WORD', 'PHRASE', 'SENTENCE');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "avatar" TEXT,
    "avatarId" TEXT,
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "activeOrganizationId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_instance" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "JobPriority" NOT NULL DEFAULT 'NORMAL',
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "timeoutMs" INTEGER NOT NULL DEFAULT 60000,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "payload" JSONB,
    "cronExpression" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" "JobPriority" NOT NULL DEFAULT 'NORMAL',
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "timeoutMs" INTEGER NOT NULL DEFAULT 60000,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "logoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "roleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_position" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "inviterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'string',
    "schema" JSONB,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "mask" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" TEXT NOT NULL,
    "bizType" TEXT NOT NULL,
    "bizId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "logoId" TEXT,
    "favicon" TEXT,
    "faviconId" TEXT,
    "copyright" TEXT,
    "icp" TEXT,
    "psif" TEXT,
    "watermarkEnabled" BOOLEAN NOT NULL DEFAULT false,
    "watermarkConfig" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_config" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'string',
    "schema" JSONB,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "mask" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "icon" TEXT,
    "linkType" "LinkType" NOT NULL DEFAULT 'GROUP',
    "url" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_permission" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_log" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "authType" TEXT,
    "authTokenId" TEXT,
    "level" TEXT NOT NULL DEFAULT 'info',
    "source" TEXT,
    "module" TEXT,
    "event" TEXT NOT NULL,
    "message" TEXT,
    "method" TEXT,
    "path" TEXT,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "errorName" TEXT,
    "errorMessage" TEXT,
    "stack" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "authType" TEXT,
    "authTokenId" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "source" TEXT,
    "event" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channel" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_template" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "subjectTemplate" TEXT,
    "titleTemplate" TEXT,
    "bodyTemplate" TEXT NOT NULL,
    "variablesSchema" JSONB,
    "sampleVariables" JSONB,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "appId" TEXT,
    "creatorId" TEXT,
    "source" TEXT,
    "variables" JSONB,
    "renderedSubject" TEXT,
    "renderedTitle" TEXT,
    "renderedBody" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_override" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "max" INTEGER,
    "windowMs" INTEGER,
    "bypass" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_override_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_token" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "tokenSuffix" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scope" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "ai_message_role" NOT NULL,
    "parts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studybuddy_collection_item" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "appId" TEXT NOT NULL DEFAULT 'studybuddy',
    "type" "CollectionItemType" NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "title" TEXT,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "mastery" INTEGER NOT NULL DEFAULT 0,
    "enrichStatus" TEXT NOT NULL DEFAULT 'none',
    "enrichError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studybuddy_collection_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studybuddy_item_enrichment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studybuddy_item_enrichment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "aiAdapter" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "balance" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "concurrencyLimit" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_account_provider" (
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,

    CONSTRAINT "ai_account_provider_pkey" PRIMARY KEY ("accountId","providerId")
);

-- CreateTable
CREATE TABLE "ai_key" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "mask" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contextWindow" INTEGER,
    "supportsReasoning" BOOLEAN NOT NULL DEFAULT false,
    "supportsCaching" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_pricing" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "policy" JSONB NOT NULL DEFAULT '[]',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_model_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "subAgents" JSONB NOT NULL DEFAULT '{}',
    "allowedApis" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT,
    "modelId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "latencyMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_config" (
    "id" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "billingType" TEXT NOT NULL DEFAULT 'none',
    "priceUnit" TEXT NOT NULL DEFAULT 'credit',
    "priceAmount" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_rate" (
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(36,18) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currency_rate_pkey" PRIMARY KEY ("currency")
);

-- CreateTable
CREATE TABLE "pricing_plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_feature" (
    "planId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,

    CONSTRAINT "plan_feature_pkey" PRIMARY KEY ("planId","featureId")
);

-- CreateTable
CREATE TABLE "user_quota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "allocated" INTEGER NOT NULL DEFAULT 0,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_quota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_subscription" (
    "id" TEXT NOT NULL,
    "principalType" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "frozen" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_credit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credit_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "frozenBefore" INTEGER NOT NULL DEFAULT 0,
    "frozenAfter" INTEGER NOT NULL DEFAULT 0,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redeem_code" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "credit" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unused',
    "expiresAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "redeem_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qianlai_ledger" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "status" TEXT NOT NULL DEFAULT 'active',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastEntryNo" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qianlai_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qianlai_project" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qianlai_project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qianlai_project_member" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qianlai_project_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qianlai_ledger_member" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qianlai_ledger_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qianlai_real_account" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "icon" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qianlai_real_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qianlai_book_account" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "name" TEXT,
    "code" TEXT,
    "type" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "icon" TEXT,
    "meta" JSONB,
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "realAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qianlai_book_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qianlai_journal_entry" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "entryNo" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "memo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "createdById" TEXT,
    "projectId" TEXT,
    "countsInLedger" BOOLEAN NOT NULL DEFAULT true,
    "guestCreated" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT,
    "addressName" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qianlai_journal_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qianlai_journal_line" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "memo" TEXT,

    CONSTRAINT "qianlai_journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qianlai_journal_entry_participant" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qianlai_journal_entry_participant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "verification_expiresAt_idx" ON "verification"("expiresAt");

-- CreateIndex
CREATE INDEX "job_instance_jobId_idx" ON "job_instance"("jobId");

-- CreateIndex
CREATE INDEX "job_instance_status_scheduledAt_idx" ON "job_instance"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "job_instance_status_priority_idx" ON "job_instance"("status", "priority");

-- CreateIndex
CREATE INDEX "job_instance_type_idx" ON "job_instance"("type");

-- CreateIndex
CREATE INDEX "job_instance_completedAt_idx" ON "job_instance"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_name_key" ON "job"("name");

-- CreateIndex
CREATE INDEX "job_enabled_nextRunAt_idx" ON "job"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "department_organizationId_idx" ON "department"("organizationId");

-- CreateIndex
CREATE INDEX "department_parentId_idx" ON "department"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "department_organizationId_code_key" ON "department"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "position_roleId_key" ON "position"("roleId");

-- CreateIndex
CREATE INDEX "position_organizationId_idx" ON "position"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "position_organizationId_code_key" ON "position"("organizationId", "code");

-- CreateIndex
CREATE INDEX "member_position_memberId_idx" ON "member_position"("memberId");

-- CreateIndex
CREATE INDEX "member_position_positionId_idx" ON "member_position"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "member_position_memberId_positionId_key" ON "member_position"("memberId", "positionId");

-- CreateIndex
CREATE INDEX "member_organizationId_idx" ON "member"("organizationId");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE INDEX "member_departmentId_idx" ON "member"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "member_organizationId_userId_key" ON "member"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE INDEX "invitation_inviterId_idx" ON "invitation"("inviterId");

-- CreateIndex
CREATE INDEX "system_config_group_idx" ON "system_config"("group");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_group_key_key" ON "system_config"("group", "key");

-- CreateIndex
CREATE UNIQUE INDEX "upload_hash_key" ON "upload"("hash");

-- CreateIndex
CREATE INDEX "upload_path_idx" ON "upload"("path");

-- CreateIndex
CREATE INDEX "attachment_bizType_bizId_idx" ON "attachment"("bizType", "bizId");

-- CreateIndex
CREATE INDEX "attachment_uploadId_idx" ON "attachment"("uploadId");

-- CreateIndex
CREATE INDEX "attachment_createdBy_idx" ON "attachment"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "application_code_key" ON "application"("code");

-- CreateIndex
CREATE INDEX "application_config_appId_group_idx" ON "application_config"("appId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "application_config_appId_group_key_key" ON "application_config"("appId", "group", "key");

-- CreateIndex
CREATE INDEX "menu_appId_idx" ON "menu"("appId");

-- CreateIndex
CREATE INDEX "menu_parentId_idx" ON "menu"("parentId");

-- CreateIndex
CREATE INDEX "menu_permission_menuId_idx" ON "menu_permission"("menuId");

-- CreateIndex
CREATE INDEX "menu_permission_permissionId_idx" ON "menu_permission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_permission_menuId_permissionId_key" ON "menu_permission"("menuId", "permissionId");

-- CreateIndex
CREATE INDEX "permission_group_idx" ON "permission"("group");

-- CreateIndex
CREATE UNIQUE INDEX "permission_code_key" ON "permission"("code");

-- CreateIndex
CREATE INDEX "role_permission_roleId_idx" ON "role_permission"("roleId");

-- CreateIndex
CREATE INDEX "role_permission_permissionId_idx" ON "role_permission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_roleId_permissionId_key" ON "role_permission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "role_assignment_userId_idx" ON "role_assignment"("userId");

-- CreateIndex
CREATE INDEX "role_assignment_roleId_idx" ON "role_assignment"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_assignment_userId_roleId_key" ON "role_assignment"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");

-- CreateIndex
CREATE INDEX "operation_log_traceId_idx" ON "operation_log"("traceId");

-- CreateIndex
CREATE INDEX "operation_log_authType_idx" ON "operation_log"("authType");

-- CreateIndex
CREATE INDEX "operation_log_authTokenId_idx" ON "operation_log"("authTokenId");

-- CreateIndex
CREATE INDEX "operation_log_userId_idx" ON "operation_log"("userId");

-- CreateIndex
CREATE INDEX "operation_log_level_idx" ON "operation_log"("level");

-- CreateIndex
CREATE INDEX "operation_log_module_idx" ON "operation_log"("module");

-- CreateIndex
CREATE INDEX "operation_log_event_idx" ON "operation_log"("event");

-- CreateIndex
CREATE INDEX "operation_log_statusCode_idx" ON "operation_log"("statusCode");

-- CreateIndex
CREATE INDEX "operation_log_createdAt_idx" ON "operation_log"("createdAt");

-- CreateIndex
CREATE INDEX "audit_log_traceId_idx" ON "audit_log"("traceId");

-- CreateIndex
CREATE INDEX "audit_log_authType_idx" ON "audit_log"("authType");

-- CreateIndex
CREATE INDEX "audit_log_authTokenId_idx" ON "audit_log"("authTokenId");

-- CreateIndex
CREATE INDEX "audit_log_userId_idx" ON "audit_log"("userId");

-- CreateIndex
CREATE INDEX "audit_log_event_idx" ON "audit_log"("event");

-- CreateIndex
CREATE INDEX "audit_log_category_idx" ON "audit_log"("category");

-- CreateIndex
CREATE INDEX "audit_log_severity_idx" ON "audit_log"("severity");

-- CreateIndex
CREATE INDEX "audit_log_outcome_idx" ON "audit_log"("outcome");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "notification_channel_providerKey_idx" ON "notification_channel"("providerKey");

-- CreateIndex
CREATE INDEX "notification_channel_enabled_idx" ON "notification_channel"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "notification_channel_key_key" ON "notification_channel"("key");

-- CreateIndex
CREATE INDEX "notification_template_channelId_idx" ON "notification_template"("channelId");

-- CreateIndex
CREATE INDEX "notification_template_enabled_idx" ON "notification_template"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "notification_template_key_key" ON "notification_template"("key");

-- CreateIndex
CREATE INDEX "notification_correlationId_idx" ON "notification"("correlationId");

-- CreateIndex
CREATE INDEX "notification_templateId_idx" ON "notification"("templateId");

-- CreateIndex
CREATE INDEX "notification_channelId_idx" ON "notification"("channelId");

-- CreateIndex
CREATE INDEX "notification_recipientUserId_idx" ON "notification"("recipientUserId");

-- CreateIndex
CREATE INDEX "notification_appId_idx" ON "notification"("appId");

-- CreateIndex
CREATE INDEX "notification_creatorId_idx" ON "notification"("creatorId");

-- CreateIndex
CREATE INDEX "notification_status_idx" ON "notification"("status");

-- CreateIndex
CREATE INDEX "notification_createdAt_idx" ON "notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_override_subject_key" ON "rate_limit_override"("subject");

-- CreateIndex
CREATE INDEX "rate_limit_override_type_idx" ON "rate_limit_override"("type");

-- CreateIndex
CREATE UNIQUE INDEX "api_token_tokenHash_key" ON "api_token"("tokenHash");

-- CreateIndex
CREATE INDEX "api_token_ownerId_idx" ON "api_token"("ownerId");

-- CreateIndex
CREATE INDEX "api_token_scope_idx" ON "api_token"("scope");

-- CreateIndex
CREATE INDEX "ai_conversation_userId_createdAt_idx" ON "ai_conversation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_conversation_appId_idx" ON "ai_conversation"("appId");

-- CreateIndex
CREATE INDEX "ai_message_sessionId_createdAt_idx" ON "ai_message"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "studybuddy_collection_item_ownerId_appId_idx" ON "studybuddy_collection_item"("ownerId", "appId");

-- CreateIndex
CREATE INDEX "studybuddy_collection_item_ownerId_type_idx" ON "studybuddy_collection_item"("ownerId", "type");

-- CreateIndex
CREATE INDEX "studybuddy_collection_item_ownerId_status_idx" ON "studybuddy_collection_item"("ownerId", "status");

-- CreateIndex
CREATE INDEX "studybuddy_item_enrichment_itemId_idx" ON "studybuddy_item_enrichment"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "studybuddy_item_enrichment_itemId_kind_key" ON "studybuddy_item_enrichment"("itemId", "kind");

-- CreateIndex
CREATE INDEX "ai_account_provider_providerId_idx" ON "ai_account_provider"("providerId");

-- CreateIndex
CREATE INDEX "ai_key_accountId_idx" ON "ai_key"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_providerId_modelId_key" ON "ai_model"("providerId", "modelId");

-- CreateIndex
CREATE INDEX "ai_model_pricing_modelId_effectiveFrom_idx" ON "ai_model_pricing"("modelId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ai_model_pricing_accountId_modelId_idx" ON "ai_model_pricing"("accountId", "modelId");

-- CreateIndex
CREATE INDEX "ai_model_pricing_modelId_accountId_timeZone_idx" ON "ai_model_pricing"("modelId", "accountId", "timeZone");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_code_key" ON "ai_agent"("code");

-- CreateIndex
CREATE INDEX "ai_usage_event_userId_createdAt_idx" ON "ai_usage_event"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_event_agentId_createdAt_idx" ON "ai_usage_event"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_event_modelId_createdAt_idx" ON "ai_usage_event"("modelId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_event_accountId_createdAt_idx" ON "ai_usage_event"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "billing_config_resourceType_idx" ON "billing_config"("resourceType");

-- CreateIndex
CREATE UNIQUE INDEX "billing_config_resourceType_resourceId_key" ON "billing_config"("resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_plan_code_key" ON "pricing_plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "feature_code_key" ON "feature"("code");

-- CreateIndex
CREATE INDEX "plan_feature_featureId_idx" ON "plan_feature"("featureId");

-- CreateIndex
CREATE INDEX "user_quota_userId_idx" ON "user_quota"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_quota_userId_key" ON "user_quota"("userId");

-- CreateIndex
CREATE INDEX "pricing_subscription_principalType_principalId_idx" ON "pricing_subscription"("principalType", "principalId");

-- CreateIndex
CREATE INDEX "pricing_subscription_planId_idx" ON "pricing_subscription"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "user_credit_userId_key" ON "user_credit"("userId");

-- CreateIndex
CREATE INDEX "user_credit_ledger_userId_createdAt_idx" ON "user_credit_ledger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_credit_ledger_referenceType_referenceId_idx" ON "user_credit_ledger"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "redeem_code_code_key" ON "redeem_code"("code");

-- CreateIndex
CREATE INDEX "qianlai_ledger_ownerId_idx" ON "qianlai_ledger"("ownerId");

-- CreateIndex
CREATE INDEX "qianlai_project_ledgerId_idx" ON "qianlai_project"("ledgerId");

-- CreateIndex
CREATE INDEX "qianlai_project_member_userId_idx" ON "qianlai_project_member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "qianlai_project_member_projectId_userId_key" ON "qianlai_project_member"("projectId", "userId");

-- CreateIndex
CREATE INDEX "qianlai_ledger_member_userId_idx" ON "qianlai_ledger_member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "qianlai_ledger_member_ledgerId_userId_key" ON "qianlai_ledger_member"("ledgerId", "userId");

-- CreateIndex
CREATE INDEX "qianlai_real_account_ownerId_idx" ON "qianlai_real_account"("ownerId");

-- CreateIndex
CREATE INDEX "qianlai_book_account_ledgerId_sortOrder_idx" ON "qianlai_book_account"("ledgerId", "sortOrder");

-- CreateIndex
CREATE INDEX "qianlai_book_account_realAccountId_idx" ON "qianlai_book_account"("realAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "qianlai_book_account_ledgerId_code_key" ON "qianlai_book_account"("ledgerId", "code");

-- CreateIndex
CREATE INDEX "qianlai_journal_entry_ledgerId_date_idx" ON "qianlai_journal_entry"("ledgerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "qianlai_journal_entry_ledgerId_entryNo_key" ON "qianlai_journal_entry"("ledgerId", "entryNo");

-- CreateIndex
CREATE INDEX "qianlai_journal_line_accountId_idx" ON "qianlai_journal_line"("accountId");

-- CreateIndex
CREATE INDEX "qianlai_journal_entry_participant_userId_idx" ON "qianlai_journal_entry_participant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "qianlai_journal_entry_participant_entryId_userId_key" ON "qianlai_journal_entry_participant"("entryId", "userId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_instance" ADD CONSTRAINT "job_instance_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_position" ADD CONSTRAINT "member_position_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_position" ADD CONSTRAINT "member_position_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_config" ADD CONSTRAINT "application_config_appId_fkey" FOREIGN KEY ("appId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu" ADD CONSTRAINT "menu_appId_fkey" FOREIGN KEY ("appId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu" ADD CONSTRAINT "menu_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_permission" ADD CONSTRAINT "menu_permission_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_permission" ADD CONSTRAINT "menu_permission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_template" ADD CONSTRAINT "notification_template_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "notification_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "notification_channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_appId_fkey" FOREIGN KEY ("appId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation" ADD CONSTRAINT "ai_conversation_appId_fkey" FOREIGN KEY ("appId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_message" ADD CONSTRAINT "ai_message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studybuddy_collection_item" ADD CONSTRAINT "studybuddy_collection_item_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studybuddy_item_enrichment" ADD CONSTRAINT "studybuddy_item_enrichment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "studybuddy_collection_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_account_provider" ADD CONSTRAINT "ai_account_provider_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ai_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_account_provider" ADD CONSTRAINT "ai_account_provider_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_key" ADD CONSTRAINT "ai_key_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ai_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model" ADD CONSTRAINT "ai_model_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_pricing" ADD CONSTRAINT "ai_model_pricing_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ai_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_pricing" ADD CONSTRAINT "ai_model_pricing_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ai_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ai_agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ai_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ai_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_feature" ADD CONSTRAINT "plan_feature_planId_fkey" FOREIGN KEY ("planId") REFERENCES "pricing_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_feature" ADD CONSTRAINT "plan_feature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_quota" ADD CONSTRAINT "user_quota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_subscription" ADD CONSTRAINT "pricing_subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "pricing_plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_credit" ADD CONSTRAINT "user_credit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_credit_ledger" ADD CONSTRAINT "user_credit_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_ledger" ADD CONSTRAINT "qianlai_ledger_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_project" ADD CONSTRAINT "qianlai_project_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "qianlai_ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_project_member" ADD CONSTRAINT "qianlai_project_member_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "qianlai_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_project_member" ADD CONSTRAINT "qianlai_project_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_ledger_member" ADD CONSTRAINT "qianlai_ledger_member_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "qianlai_ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_ledger_member" ADD CONSTRAINT "qianlai_ledger_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_real_account" ADD CONSTRAINT "qianlai_real_account_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_book_account" ADD CONSTRAINT "qianlai_book_account_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "qianlai_ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_book_account" ADD CONSTRAINT "qianlai_book_account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "qianlai_book_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_book_account" ADD CONSTRAINT "qianlai_book_account_realAccountId_fkey" FOREIGN KEY ("realAccountId") REFERENCES "qianlai_real_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_journal_entry" ADD CONSTRAINT "qianlai_journal_entry_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "qianlai_ledger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_journal_entry" ADD CONSTRAINT "qianlai_journal_entry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_journal_entry" ADD CONSTRAINT "qianlai_journal_entry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "qianlai_project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_journal_line" ADD CONSTRAINT "qianlai_journal_line_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "qianlai_journal_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_journal_line" ADD CONSTRAINT "qianlai_journal_line_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "qianlai_book_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_journal_entry_participant" ADD CONSTRAINT "qianlai_journal_entry_participant_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "qianlai_journal_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qianlai_journal_entry_participant" ADD CONSTRAINT "qianlai_journal_entry_participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

