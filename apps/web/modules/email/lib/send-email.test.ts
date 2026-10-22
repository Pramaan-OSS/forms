import { beforeEach, describe, expect, test, vi } from "vitest";
import { PramaanError } from "@forms/pramaan";
import { FakePramaan } from "@forms/pramaan/fake";
import { sendEmail } from "./send-email";
import { MANAGED_EMAIL_DOMAIN } from "./sender-domain";

const mocks = vi.hoisted(() => ({
  emailSend: vi.fn(),
  constants: {
    MAIL_FROM: "hola@example.com" as string | undefined,
    MAIL_FROM_NAME: "Forms",
  },
  pramaanModule: {
    pramaan: { emailSend: vi.fn() } as unknown,
    pramaanConfigured: true,
    unavailableMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
  },
}));

vi.mock("@/lib/constants", () => mocks.constants);

vi.mock("@/lib/pramaan", () => {
  const client = { emailSend: mocks.emailSend };
  return {
    pramaan: client,
    pramaanConfigured: true,
    unavailableMessage: mocks.pramaanModule.unavailableMessage,
  };
});

const email = {
  emailType: "invite" as const,
  to: "recipient@example.com",
  subject: "Invitation",
  html: "<p>Join</p>",
};

describe("sendEmail through Pramaan", () => {
  beforeEach(() => {
    mocks.constants.MAIL_FROM = "hola@example.com";
    mocks.emailSend.mockReset();
    mocks.emailSend.mockResolvedValue({ status: "queued", ref: "fixture" });
  });

  test("sends with the default sender and the recipient as a one-item list", async () => {
    expect(await sendEmail(email)).toBe(true);
    expect(mocks.emailSend).toHaveBeenCalledTimes(1);
    const [input, opts] = mocks.emailSend.mock.calls[0]!;
    expect(input).toEqual({
      from: `Forms <noreply@${MANAGED_EMAIL_DOMAIN}>`,
      to: ["recipient@example.com"],
      subject: email.subject,
      text: undefined,
      html: email.html,
      replyTo: "hola@example.com",
    });
    expect((opts as { idempotencyKey: string }).idempotencyKey).toBeTruthy();
  });

  test("uses the managed sender, preserves an explicit reply address and omits the email type", async () => {
    await sendEmail({
      ...email,
      emailType: "workflow_email",
      from: "custom@example.com",
      replyTo: "reply@example.com",
      text: "Body",
    });
    const [input] = mocks.emailSend.mock.calls[0]!;
    expect(input).toMatchObject({
      from: `Forms <noreply@${MANAGED_EMAIL_DOMAIN}>`,
      replyTo: "reply@example.com",
      text: "Body",
    });
    expect(input).not.toHaveProperty("emailType");
  });

  test("uses the managed default without any owner address configured", async () => {
    mocks.constants.MAIL_FROM = undefined;
    await sendEmail(email);
    expect(mocks.emailSend.mock.calls[0]![0]).toMatchObject({
      from: `Forms <noreply@${MANAGED_EMAIL_DOMAIN}>`,
      replyTo: undefined,
    });
  });

  test.each([
    "owner@example.com",
    "owner@updates.pramaan.dev",
    `owner@news.${MANAGED_EMAIL_DOMAIN}`,
    `owner@${MANAGED_EMAIL_DOMAIN}.example.com`,
  ])("keeps %s as a reply address without using its domain to send", async (owner) => {
    await sendEmail({ ...email, from: `Survey owner <${owner}>` });
    expect(mocks.emailSend.mock.calls[0]![0]).toMatchObject({
      from: `Forms <noreply@${MANAGED_EMAIL_DOMAIN}>`,
      replyTo: owner,
    });
  });

  test("the fake reproduces the sender-domain refusal and accepts the corrected default", async () => {
    const fake = new FakePramaan({
      "email.send": (input) => {
        const from = (input as { from?: unknown }).from;
        const sender = typeof from === "string" ? (/<([^>]+)>$/.exec(from)?.[1] ?? from) : "";
        if (sender.split("@")[1] !== MANAGED_EMAIL_DOMAIN)
          throw new PramaanError("invalid_request", "Connect an account for this capability first.", {
            status: 400,
          });
        return { status: "queued", ref: "fixture" };
      },
    });
    await expect(
      fake.emailSend(
        { from: "Forms <noreply@forms.local>", to: [email.to], subject: email.subject },
        { idempotencyKey: "old-sender" }
      )
    ).rejects.toMatchObject({ code: "invalid_request", status: 400 });
    mocks.emailSend.mockImplementation((input, options) => fake.emailSend(input, options));
    await expect(sendEmail(email)).resolves.toBe(true);
    expect(fake.callsTo("email.send")).toHaveLength(2);
  });

  test("skips sending when no Pramaan key is configured", async () => {
    vi.doMock("@/lib/pramaan", () => ({
      pramaan: null,
      pramaanConfigured: false,
      unavailableMessage: () => "x",
    }));
    vi.resetModules();
    const { sendEmail: unconfigured } = await import("./send-email");
    expect(await unconfigured(email)).toBe(false);
    expect(mocks.emailSend).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/pramaan");
    vi.resetModules();
  });

  test("a non-accepted status is a failure", async () => {
    mocks.emailSend.mockResolvedValue({ status: "rejected" });
    await expect(sendEmail(email)).rejects.toThrow("The email could not be sent");
  });

  test("preserves the failure contract with a generic message", async () => {
    mocks.emailSend.mockRejectedValue(new Error("raw upstream detail"));
    await expect(sendEmail(email)).rejects.toThrow("The email could not be sent");
  });
});
