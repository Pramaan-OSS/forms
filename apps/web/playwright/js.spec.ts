import { expect } from "@playwright/test";
import http from "http";
import { writeFileSync } from "node:fs";
import { prisma } from "@forms/database";
import { PUBLIC_API_SURVEY_NAME_PLACEHOLDER } from "@forms/types/js-constants";
import { test } from "./lib/fixtures";
import { gotoSurveyList, gotoSurveyTemplates } from "./lib/utils";
import { activateSurvey, useSelectedTemplate } from "./utils/helper";

const HTML_TEMPLATE = `<head>
  <script type="text/javascript">
    // An AMD loader stub, kept for the whole page life, so both UMD bundles (the SDK and the lazily
    // loaded survey renderer) must still take their browser-global branch on an AMD page (ENG-3657).
    window.define = function () {};
    window.define.amd = {};
  </script>
  <script type="text/javascript">
    !(function () {
      var t = document.createElement("script");
      (t.type = "text/javascript"), (t.async = !0), (t.src = "APP_ORIGIN/js/forms.umd.cjs");
      var e = document.getElementsByTagName("script")[0];
      t.onload = function(){
        if (window.forms) {
          // forms.on() is the only JS subscription surface (ENG-1814); registered before
          // setup(), which the API promises works. Same names as the GTM dataLayer pushes.
          window.formsEvents = [];
          ["forms_survey_shown", "forms_response_submitted", "forms_survey_closed"].forEach(
            function (name) {
              window.forms.on(name, function (payload) {
                window.formsEvents.push(Object.assign({ event: name }, payload));
              });
            }
          );
          window.forms.setup({workspaceId: "WORKSPACE_ID", appUrl: "APP_ORIGIN"});
        } else {
          console.error("Forms library failed to load properly. The forms object is not available.");
        }
      };
      e.parentNode.insertBefore(t, e);
    })();
  </script>
</head>

<body style="background-color: #fff">
  <p>This is my sample page using the Forms JS javascript widget</p>
</body>
`;

test.describe("JS Package Test", async () => {
  let server: http.Server;
  let workspaceId: string;
  let appOrigin: string;
  let widgetOrigin: string;

  test.setTimeout(3 * 60 * 1000);
  test.beforeAll(async () => {
    // Create a simple HTTP server
    server = http.createServer((_, res) => {
      const htmlContent = HTML_TEMPLATE.replace("WORKSPACE_ID", workspaceId || "").replaceAll(
        "APP_ORIGIN",
        appOrigin
      );
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(htmlContent);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Widget test server has no port.");
        widgetOrigin = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  test.afterAll(async () => {
    // Cleanup: close the server
    await new Promise((resolve) => server.close(resolve));
  });

  test("Create, display and validate PMF survey", async ({ page, users }, testInfo) => {
    // Create and login user
    const user = await users.create();
    await user.login();
    appOrigin = new URL(page.url()).origin;

    await gotoSurveyList(page);

    // Get the workspaceId from the fixture (needed for SDK setup)
    workspaceId =
      user.workspaceId ??
      (() => {
        throw new Error("Unable to get workspaceId from user fixture");
      })();

    await gotoSurveyTemplates(page, workspaceId);

    // Create survey from template
    await page.getByRole("heading", { name: "Product Market Fit (Superhuman)" }).isVisible();
    await page.getByRole("heading", { name: "Product Market Fit (Superhuman)" }).click();
    await page.getByRole("button", { name: "Use this template" }).isVisible();
    await useSelectedTemplate(page);

    // Configure survey settings
    await page.getByRole("button", { name: "Settings", exact: true }).click();

    await expect(page.locator("#howToSendCardTrigger")).toBeVisible();
    await page.locator("#howToSendCardTrigger").click();
    await expect(page.locator("#howToSendCardOption-app")).toBeVisible();
    await page.locator("#howToSendCardOption-app").click();

    await page.locator("#whenToSendCardTrigger").click();
    await page.getByRole("button", { name: "Add action" }).click();

    await page.getByRole("button", { name: "Capture new action" }).click();
    await page.getByPlaceholder("E.g. Clicked Download").click();
    await page.getByPlaceholder("E.g. Clicked Download").fill("New Session");
    await page.getByText("Page View").click();
    await page.getByRole("button", { name: "Create action" }).click();

    await page.locator("#recontactOptionsCardTrigger").click();
    await page.locator('[data-testid="recontact-option-respondMultiple"]').click();
    await page.locator('[data-testid="cooldown-period-option-ignore"]').click();

    await page.getByRole("button", { name: "Save as draft", exact: true }).click();
    await expect(page.getByText("Changes saved.")).toBeVisible();

    await Promise.all([
      page.waitForURL(/\/workspaces\/[^/]+\/surveys\/[^/]+\/summary/, { timeout: 120000 }),
      activateSurvey(page),
    ]);

    const surveyId = /\/surveys\/([^/]+)\/summary/.exec(page.url())?.[1];
    if (!surveyId) throw new Error(`Unable to parse surveyId from ${page.url()}`);

    // ENG-3552: workspace and survey custom CSS, saved through the same v3 endpoints the editors use, so
    // the processor, storage and cache invalidation are the real ones. Both style the same hook so one
    // assertion proves both arrive and that survey CSS outranks workspace CSS (M2.03).
    await test.step("save workspace and survey custom CSS", async () => {
      const workspaceCss = await page.request.patch(`/api/v3/workspaces/${workspaceId}/custom-css`, {
        data: {
          customCss: {
            light: '[data-fb-part="headline"] { letter-spacing: 3px; color: rgb(10, 20, 30); }',
            dark: null,
          },
        },
      });
      expect(workspaceCss.ok()).toBe(true);

      // Survey CSS is delivered only while the survey's "Add custom styles" is on (ENG-3723). The v3 survey
      // API has no styling field, so it is set directly, before the PATCH below invalidates the cache.
      const { styling } = await prisma.survey.findUniqueOrThrow({
        where: { id: surveyId },
        select: { styling: true },
      });
      await prisma.survey.update({
        where: { id: surveyId },
        data: { styling: { ...styling, overwriteThemeStyling: true } },
      });

      const surveyCss = await page.request.patch(`/api/v3/surveys/${surveyId}`, {
        data: { customCss: { light: '[data-fb-part="headline"] { color: rgb(40, 50, 60); }', dark: null } },
      });
      expect(surveyCss.ok()).toBe(true);
    });

    const diagnostics: string[] = [`App origin: ${appOrigin}`, `Workspace: ${workspaceId}`];
    page.on("pageerror", (error) => diagnostics.push(`Page error: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.push(message.text());
    });
    page.on("requestfailed", (request) =>
      diagnostics.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`)
    );
    page.on("response", (response) => {
      if (response.status() >= 400)
        diagnostics.push(`${new URL(response.url()).pathname}: HTTP ${response.status()}`);
    });
    const environmentResponse = page
      .waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          /\/api\/v1\/client\/[^/]+\/environment/.test(response.url())
      )
      .catch(() => null);
    // The address used to isolate sign-in limits belongs only to the app's own requests.
    // A customer page must use the SDK without that extra request header.
    await page.context().setExtraHTTPHeaders({});
    await page.goto(widgetOrigin);
    try {
      await expect
        .poll(() => page.evaluate(() => typeof (window as any).forms?.setup), { timeout: 15000 })
        .toBe("function");
      await expect(page.locator("#forms-modal-container")).toHaveCount(1, { timeout: 30000 });
    } catch (error) {
      writeFileSync(testInfo.outputPath("widget-network-errors.json"), JSON.stringify(diagnostics, null, 2));
      await testInfo.attach("Widget network errors", {
        body: JSON.stringify(diagnostics, null, 2),
        contentType: "application/json",
      });
      throw error;
    }

    await test.step("the SDK receives compiled custom CSS only, workspace CSS once", async () => {
      // The endpoint wraps the state in its own envelope: `{ data: { data: <state>, expiresAt } }`.
      const reply = await environmentResponse;
      expect(reply).not.toBeNull();
      const { data } = ((await reply!.json()) as { data: unknown }).data as {
        data: {
          workspace: { customCss?: Record<string, string> };
          project?: { customCss?: unknown };
          surveys: { id: string; customCss?: Record<string, string> }[];
        };
      };
      const surveyCustomCss = data.surveys.find((survey) => survey.id === surveyId)?.customCss;

      // Compiled `{ light?, dark? }` only — no source, no processor internals — and not repeated in the
      // legacy `project` alias.
      expect(Object.keys(data.workspace.customCss ?? {})).toEqual(["light"]);
      expect(data.workspace.customCss?.light).toContain("fb-workspace");
      expect(Object.keys(surveyCustomCss ?? {})).toEqual(["light"]);
      expect(surveyCustomCss?.light).toContain("fb-survey");
      expect(data.project?.customCss).toBeUndefined();
    });

    await test.step("workspace and survey custom CSS style the app survey", async () => {
      const headline = page.locator('#forms-modal-container [data-fb-part="headline"]').first();
      // Workspace CSS applies (letter-spacing), and survey CSS wins where both set a property (color).
      await expect(headline).toHaveCSS("letter-spacing", "3px");
      await expect(headline).toHaveCSS("color", "rgb(40, 50, 60)");
    });

    // The widget reads the survey from the public client API, which substitutes a placeholder for
    // every survey name so names are not exposed over an unauthenticated endpoint. This is the only
    // place the real API, the widget and the dialog are wired together, so it is the only place that
    // can catch the placeholder leaking into what a screen reader announces: the dialog falls back
    // to its generic name instead, and the survey's one h1 carries that same name (ENG-2799). The h1
    // is looked up inside the dialog, because aria-modal hides anything outside it from assistive tech.
    // The placeholder is matched through the shared constant, not a literal, so a change to its text
    // cannot turn this into a matcher that finds nothing and passes vacuously.
    const widget = page.locator("#forms-modal-container");
    const dialog = widget.getByRole("dialog");
    await expect(dialog).toHaveAttribute("aria-label", "Survey Dialog");
    await expect(dialog.getByRole("heading", { level: 1 })).toHaveText("Survey Dialog");
    await expect(widget.getByText(PUBLIC_API_SURVEY_NAME_PLACEHOLDER)).toHaveCount(0);

    await expect(
      page.locator("#questionCard-0").getByRole("link", { name: "Powered by Forms" })
    ).toBeVisible();

    // Fill the survey
    await page.getByRole("button", { name: "Happy to help!" }).click();
    await page.locator("#questionCard-1 label").filter({ hasText: "Somewhat disappointed" }).click();
    await page.locator("#questionCard-1").getByRole("button", { name: "Next" }).click();
    await page.locator("#questionCard-2 label").filter({ hasText: "Founder" }).click();
    await page.locator("#questionCard-2").getByRole("button", { name: "Next" }).click();
    await page
      .locator("#questionCard-3")
      .getByRole("textbox")
      .fill("People who believe that PMF is necessary");
    await page.locator("#questionCard-3").getByRole("button", { name: "Next" }).click();
    await page.locator("#questionCard-4").getByRole("textbox").fill("Much higher response rates!");
    await page.locator("#questionCard-4").getByRole("button", { name: "Next" }).click();
    await page.locator("#questionCard-5").getByRole("textbox").fill("Make this end to end test pass!");
    await page.locator("#questionCard-5").getByRole("button", { name: "Finish" }).click();

    await page.getByTestId("loading-spinner").waitFor({ state: "hidden" });
    await page.waitForLoadState("networkidle");
    // The last lifecycle event fires only once the ending card auto-closes the modal, so wait for it
    // rather than for a fixed time.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (window as unknown as { formsEvents?: { event: string }[] }).formsEvents?.some(
              ({ event }) => event === "forms_survey_closed"
            )
          ),
        { timeout: 15000 }
      )
      .toBe(true);

    // The `responseId` on the events is the PERSISTED id (ENG-1846). This is the only level that
    // can prove it: the id is minted by the server, so `onResponseCreated`/`onFinished` can only
    // carry it by firing from the response queue's creation ack — and the renderer that passes it
    // lives in a .tsx, which the repo does not unit-test. Asserted against the stored row rather
    // than for self-consistency, so a client-minted or dropped id fails here (ENG-1814: the
    // forms.on() surface, registered before setup(), is what captured them).
    await test.step("the journey reaches forms.on subscribers with the persisted responseId", async () => {
      const events = await page.evaluate(
        () =>
          (
            window as unknown as {
              formsEvents: {
                event: string;
                surveyId: string;
                responseId?: string;
                finished?: boolean;
              }[];
            }
          ).formsEvents
      );

      const storedResponse = await prisma.response.findFirst({
        where: { surveyId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      // A hard throw rather than expect().not.toBeNull(): it narrows the type, so the id
      // comparisons below cannot silently compare undefined against undefined.
      if (!storedResponse) throw new Error("No response was persisted for the survey");

      // Shown, first answer, completion, and — after the ending card auto-closes the modal —
      // closed exactly once. One vocabulary, in order.
      expect(events.map((event) => event.event)).toEqual([
        "forms_survey_shown",
        "forms_response_submitted",
        "forms_response_submitted",
        "forms_survey_closed",
      ]);
      expect(events.map((event) => event.finished)).toEqual([undefined, false, true, undefined]);
      for (const event of events) {
        expect(event.surveyId).toBe(surveyId);
      }
      expect(events[1].responseId).toBe(storedResponse.id);
      expect(events[2].responseId).toBe(storedResponse.id);
    });

    // Validate displays and response
    await page.goto("/");
    await page.waitForURL(/\/workspaces\/[^/]+\/surveys/);
    await page.getByRole("link", { name: "product Market Fit (Superhuman)" }).click();
    await page.waitForSelector("text=Responses");
    await page.waitForTimeout(5000);

    const impressionsCount = await page.getByRole("button", { name: "Impressions" }).innerText();
    expect(impressionsCount).toEqual("Impressions\n\n1");

    await expect(page.getByRole("link", { name: "Responses" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Completed 100%" })).toBeVisible();
    await expect(page.getByText("1 response", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Somewhat disappointed")).toBeVisible();
    await expect(page.getByText("Founder")).toBeVisible();
    await expect(page.getByText("People who believe that PMF").first()).toBeVisible();
    await expect(page.getByText("Much higher response rates!").first()).toBeVisible();
    await expect(page.getByText("Make this end to end test").first()).toBeVisible();
  });
});
