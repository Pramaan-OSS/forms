import { expect, test } from "vitest";
import type { Caps } from "../src/capabilities";
import { FakePramaan } from "../src/fake";

const input: Caps.EmailSendRequest = {
  from: "Forms <sender@example.test>",
  to: ["guest@example.test"],
  subject: "Your visit",
  text: "Details",
  invitation: {
    uid: "booking-1",
    title: "Visit",
    start: "2026-10-14T10:00:00Z",
    end: "2026-10-14T11:00:00Z",
    timeZone: "Europe/London",
    organiser: "sender@example.test",
    attendees: ["guest@example.test"],
    method: "request",
    sequence: 0,
  },
};
test("fake accepts the new invitation and uploaded attachment contract", async () => {
  const fake = new FakePramaan({ "email.send": () => ({ status: "sent" }) });
  await fake.emailSend(
    { ...input, attachments: [{ fileId: `file_${"0".repeat(26)}`, name: "notes.txt" }] },
    { idempotencyKey: "test-email" }
  );
  expect(fake.calls).toHaveLength(1);
});
test("fake refuses organiser mismatch, hidden attendees, invalid times and zero cancel revision", async () => {
  const fake = new FakePramaan({ "email.send": () => ({ status: "sent" }) });
  for (const change of [
    { organiser: "other@example.test" },
    { attendees: ["hidden@example.test"] },
    { start: "2026-10-14T10:00:00.123Z" },
    { method: "cancel", sequence: 0 },
  ] as const) {
    await expect(
      fake.emailSend(
        {
          ...input,
          bcc: ["hidden@example.test"],
          invitation: { ...input.invitation!, ...change },
        },
        { idempotencyKey: "test-email" }
      )
    ).rejects.toThrow("Invalid email request");
  }
  expect(fake.calls).toHaveLength(0);
});
