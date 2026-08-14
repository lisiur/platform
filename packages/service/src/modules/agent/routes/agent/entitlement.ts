import { HTTPException } from "hono/http-exception";
import { hasActiveFeatureForUser } from "#modules/pricing/public";

export const PLATFORM_ASSISTANT_FEATURE_CODE = "platform_assistant";

export async function assertPlatformAssistantAccess(userId: string) {
  const hasFeature = await hasActiveFeatureForUser(
    userId,
    PLATFORM_ASSISTANT_FEATURE_CODE,
  );
  if (!hasFeature) {
    throw new HTTPException(403, {
      message: "Platform Assistant is not enabled for this user.",
    });
  }
}
