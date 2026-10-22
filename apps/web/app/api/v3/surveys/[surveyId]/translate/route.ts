import { z } from "zod";
import { prisma } from "@forms/database";
import { PramaanError } from "@forms/pramaan";
import { withV3ApiWrapper } from "@/app/api/v3/lib/api-wrapper";
import { can } from "@/lib/authorization";
import { isSurveyOutboundAllowed } from "@/lib/survey/visibility/outbound";
import { LocalizationUncertain, localizeSurveyText } from "@/modules/text-tools/localize";
import { textToolSettings } from "@/modules/text-tools/service";

export const maxDuration = 120;
export const POST = withV3ApiWrapper({
  auth: "session",
  schemas: {
    params: z.object({ surveyId: z.cuid2() }),
    query: z.object({}),
    body: z.object({
      text: z.string().min(1).max(5000),
      languages: z
        .array(z.string().regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/))
        .min(1)
        .max(8),
    }),
  },
  handler: async ({ parsedInput, authentication, req }) => {
    if (!authentication || !("user" in authentication))
      return Response.json({ error: "Sign in first." }, { status: 401 });
    const { surveyId } = parsedInput.params;
    if (
      !(await can({ type: "user", id: authentication.user.id }, "survey.write", {
        type: "survey",
        id: surveyId,
      }))
    )
      return Response.json({ error: "Survey access required." }, { status: 403 });
    const survey = await prisma.survey.findUniqueOrThrow({ where: { id: surveyId } });
    if (!isSurveyOutboundAllowed(survey))
      return Response.json({ error: "This survey cannot send text outside the workspace." }, { status: 403 });
    if (!(await textToolSettings(survey.workspaceId)).enabled)
      return Response.json({ error: "Enable text tools in workspace settings first." }, { status: 409 });
    try {
      return Response.json({
        data: await localizeSurveyText(
          parsedInput.body.text,
          [...new Set(parsedInput.body.languages)],
          req.signal
        ),
      });
    } catch (error) {
      if (error instanceof PramaanError && error.code === "rate_limited")
        return Response.json(
          { error: "Translation is busy. Wait before trying again." },
          { status: 429, headers: { "Retry-After": "5" } }
        );
      if (error instanceof LocalizationUncertain)
        return Response.json(
          { error: "Could not confirm the result. Check its status before trying again." },
          { status: 409 }
        );
      return Response.json({ error: "Translation is not available yet." }, { status: 503 });
    }
  },
});
