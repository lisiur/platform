-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LinkType" AS ENUM ('GROUP', 'INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "RoleScopeType" AS ENUM ('PLATFORM', 'ORGANIZATION', 'APPLICATION');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
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
    "impersonatedBy" TEXT,
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
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
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
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "role" TEXT NOT NULL DEFAULT 'member',
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

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
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "uploaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
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
    "appId" TEXT,
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
    "scopeType" "RoleScopeType" NOT NULL DEFAULT 'PLATFORM',
    "scopeId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "scopeType" "RoleScopeType" NOT NULL DEFAULT 'PLATFORM',
    "scopeId" TEXT NOT NULL DEFAULT '',
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
    "sessionId" TEXT,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "event" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "targetType" TEXT,
    "targetId" TEXT,
    "targetName" TEXT,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "creatorId" TEXT,
    "source" TEXT,
    "variables" JSONB,
    "renderedSubject" TEXT,
    "renderedTitle" TEXT,
    "renderedBody" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
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

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "department_organizationId_idx" ON "department"("organizationId");

-- CreateIndex
CREATE INDEX "department_parentId_idx" ON "department"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "department_organizationId_code_key" ON "department"("organizationId", "code");

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
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE INDEX "system_config_group_idx" ON "system_config"("group");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_group_key_key" ON "system_config"("group", "key");

-- CreateIndex
CREATE INDEX "upload_uploaderId_idx" ON "upload"("uploaderId");

-- CreateIndex
CREATE INDEX "application_deletedAt_idx" ON "application"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "application_code_key" ON "application"("code");

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
CREATE INDEX "permission_appId_idx" ON "permission"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "permission_appId_code_key" ON "permission"("appId", "code");

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
CREATE INDEX "role_assignment_scopeType_scopeId_idx" ON "role_assignment"("scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "role_assignment_userId_roleId_scopeType_scopeId_key" ON "role_assignment"("userId", "roleId", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "role_appId_idx" ON "role"("appId");

-- CreateIndex
CREATE INDEX "role_scopeType_scopeId_idx" ON "role"("scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "role_appId_scopeType_scopeId_code_key" ON "role"("appId", "scopeType", "scopeId", "code");

-- CreateIndex
CREATE INDEX "operation_log_traceId_idx" ON "operation_log"("traceId");

-- CreateIndex
CREATE INDEX "operation_log_sessionId_idx" ON "operation_log"("sessionId");

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
CREATE INDEX "audit_log_sessionId_idx" ON "audit_log"("sessionId");

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
CREATE INDEX "notification_channel_deletedAt_idx" ON "notification_channel"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_channel_key_key" ON "notification_channel"("key");

-- CreateIndex
CREATE INDEX "notification_template_channelId_idx" ON "notification_template"("channelId");

-- CreateIndex
CREATE INDEX "notification_template_enabled_idx" ON "notification_template"("enabled");

-- CreateIndex
CREATE INDEX "notification_template_deletedAt_idx" ON "notification_template"("deletedAt");

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
CREATE INDEX "notification_status_idx" ON "notification"("status");

-- CreateIndex
CREATE INDEX "notification_createdAt_idx" ON "notification"("createdAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "upload" ADD CONSTRAINT "upload_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu" ADD CONSTRAINT "menu_appId_fkey" FOREIGN KEY ("appId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu" ADD CONSTRAINT "menu_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_permission" ADD CONSTRAINT "menu_permission_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_permission" ADD CONSTRAINT "menu_permission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission" ADD CONSTRAINT "permission_appId_fkey" FOREIGN KEY ("appId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_appId_fkey" FOREIGN KEY ("appId") REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_template" ADD CONSTRAINT "notification_template_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "notification_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "notification_channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

