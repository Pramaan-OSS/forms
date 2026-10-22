"use server";

import { z } from "zod";
import { ZUserNotificationSettings } from "@forms/types/user";
import { updateUser } from "@/lib/user/service";
import { authenticatedActionClient } from "@/lib/utils/action-client";

const ZUpdateNotificationSettingsAction = z.object({
  notificationSettings: ZUserNotificationSettings,
});

export const updateNotificationSettingsAction = authenticatedActionClient
  .inputSchema(ZUpdateNotificationSettingsAction)
  .action(async ({ ctx, parsedInput }) => {
    const result = await updateUser(ctx.user.id, {
      notificationSettings: parsedInput.notificationSettings,
    });
    return result;
  });
