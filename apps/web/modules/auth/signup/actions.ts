"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { logger } from "@forms/logger";
import {
  INVITE_TOKEN_INVALID_ERROR_CODE,
  InvalidInputError,
  PASSWORD_COMPROMISED_ERROR_CODE,
  SIGNUP_DISABLED_ERROR_CODE,
  SIGNUP_EMAIL_DOMAIN_BLOCKED_ERROR_CODE,
  UnknownError,
} from "@forms/types/errors";
import { ZUser, ZUserEmail, ZUserLocale, ZUserName, ZUserPassword } from "@forms/types/user";
import { env } from "@/lib/env";
import { pramaan } from "@/lib/pramaan";
import { getUserByEmail } from "@/lib/user/service";
import { actionClient } from "@/lib/utils/action-client";
import { auth } from "@/modules/auth/lib/auth";
import { isPasswordCompromisedError } from "@/modules/auth/lib/password-errors";
import { isSignupEmailDomainBlocked } from "@/modules/auth/lib/signup-email-domain";
import {
  SIGNUP_INTENT_COOKIE_NAME,
  SIGNUP_INTENT_COOKIE_OPTIONS,
  createSignupIntentToken,
} from "@/modules/auth/lib/signup-intent";
import { resolveUninvitedSignupAdmission } from "@/modules/auth/lib/signup-policy";
import {
  markBootstrapAdminSignup,
  markSignupDomainAllowed,
  runWithSignupRequestContext,
} from "@/modules/auth/lib/signup-request-context";
import { updateUser } from "@/modules/auth/lib/user";
import { type InviteMatch, resolveInviteMatch } from "@/modules/auth/signup/lib/invite";
import { handlePostUserCreation } from "@/modules/auth/signup/lib/post-registration";
import { applyIPRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";

const ZCreatedUser = ZUser.pick({
  name: true,
  email: true,
  locale: true,
  id: true,
  notificationSettings: true,
});

type TCreatedUser = z.infer<typeof ZCreatedUser>;

const ZCreateUserAction = z.object({
  name: ZUserName,
  email: ZUserEmail,
  password: ZUserPassword,
  inviteToken: z.string().optional(),
  userLocale: ZUserLocale.optional(),
  botCheckToken: z
    .string()
    .optional()
    .refine(
      (token) => !IS_BOT_CHECK_CONFIGURED || (IS_BOT_CHECK_CONFIGURED && token),
      "Bot verification required"
    ),
  subscribeToSecurityUpdates: z.boolean().optional(),
  subscribeToProductUpdates: z.boolean().optional(),
});

/**
 * Bot check for sign-up. Off by default: the operator connects their own
 * bot-protection widget through Pramaan and sets PRAMAAN_BOT_CHECK_WIDGET to
 * the widget name; only then is a challenge token required and verified
 * through the Pramaan bot-check capability.
 */
async function verifyBotCheckIfConfigured(botCheckToken: string | undefined): Promise<void> {
  if (!IS_BOT_CHECK_CONFIGURED) return;

  if (!botCheckToken) {
    throw new UnknownError("Bot verification failed");
  }

  const result = (await pramaan?.call("auth.bot-check.verify", {
    token: botCheckToken,
    widget: env.PRAMAAN_BOT_CHECK_WIDGET,
  })) as { passed?: boolean } | undefined;

  if (!result?.passed) {
    throw new UnknownError("Bot verification failed");
  }
}

/** Bot check is opt-in: set PRAMAAN_BOT_CHECK_WIDGET to the operator's connected widget name. */
const IS_BOT_CHECK_CONFIGURED = Boolean(env.PRAMAAN_BOT_CHECK_WIDGET);

/**
 * Whether THIS request created the account, as a discriminated union rather than a boolean flag.
 *
 * Everything downstream of sign-up — invite acceptance, organization creation, the mailing-list
 * subscription, the analytics identify, the `created` audit event — may only run for `"created"`.
 * `createUserAction` is unauthenticated, so running any of it against an account the caller has not
 * proven they own is an authorization defect (ENG-2091). Encoding that in the type keeps the guard
 * from being dropped by a later refactor: `handlePostUserCreation` accepts only the `"created"`
 * variant, so misuse is a compile error rather than a silent privilege hole.
 */
type TSignUpOutcome =
  | { status: "created"; user: TCreatedUser }
  // Carries no user on purpose. Nothing downstream may act on a pre-existing account, so not handing
  // one out is the cheapest way to keep it that way — there is no object to accidentally thread into a
  // side effect later.
  | { status: "already_existed" };

async function signUpUserSafely(
  email: string,
  name: string,
  password: string,
  userLocale: z.infer<typeof ZUserLocale> | undefined
): Promise<TSignUpOutcome> {
  const normalizedEmail = email.toLowerCase();

  // Assigned on every path that does not throw; `undefined` is only in the type because TS cannot see
  // that across the try/catch. If it ever were undefined — Better Auth changing its response shape —
  // the id comparison below fails and the request is treated as already-existed, so no side effect
  // runs against an account we cannot attribute. Degrading that way is the safe direction.
  let signedUpUserId: string | undefined;
  try {
    // Better Auth-native signup: creates the User + a bcrypt credential Account (via the password hook
    // in auth.ts) and, when verification is enabled, sends Better Auth's verification email (sendOnSignUp;
    // callbackURL defaults to "/"). We deliberately do NOT pass a /invite callbackURL for invite signups:
    // the invite is accepted and deleted in handlePostUserCreation right after this, so by the time the
    // verification link is clicked /invite would render "Invite Not Found" (ENG-1527) — the verified,
    // already-provisioned user lands on the app home instead. Replaces the manual hash + createUser + the
    // legacy verification-token email.
    const signUpResult = await auth.api.signUpEmail({
      body: { email: normalizedEmail, password, name },
      headers: await headers(),
    });
    signedUpUserId = signUpResult.user.id;
  } catch (error) {
    // A breached password is rejected before any user is created — surface it as an expected error
    // with a stable code the sign-up form maps to a localized message (not an enumeration signal).
    if (isPasswordCompromisedError(error)) {
      throw new InvalidInputError(PASSWORD_COMPROMISED_ERROR_CODE);
    }
    // Enumeration-safe: a duplicate email resolves to "already existed", not a surfaced error.
    // Reachable only when Better Auth is configured to THROW on a duplicate — see the id check below.
    if (await getUserByEmail(normalizedEmail)) {
      return { status: "already_existed" };
    }
    throw error;
  }

  const user = await getUserByEmail(normalizedEmail);
  if (!user) {
    // signUpEmail succeeded but the row can't be loaded — an invariant violation. Fail loud rather
    // than returning { success: true } with no user, which would skip org creation / invite acceptance.
    throw new UnknownError("Failed to load user after signup");
  }

  // ENG-2091: a duplicate email does NOT throw here. Better Auth takes an enumeration-safe branch
  // whenever `emailAndPassword.requireEmailVerification || autoSignIn === false` — auth.ts sets both —
  // which hashes the password for timing parity, then returns HTTP 200 carrying a SYNTHETIC user: a
  // freshly generated id, no row written, no credential linked and (because it returns before the send)
  // no verification email. So the id it hands back, not a thrown error, is what distinguishes the two:
  // a synthetic id is never in the database. Do not "simplify" this to the catch above — that branch
  // only fires under a configuration that makes Better Auth throw USER_ALREADY_EXISTS instead, which
  // is why both signals are kept.
  if (user.id !== signedUpUserId) {
    return { status: "already_existed" };
  }

  // signUpEmail can't carry the chosen locale (not a Better Auth field), so apply it afterwards — only
  // for an account this request created. Applying it on the already-existed path would let an
  // anonymous caller rewrite an existing user's locale by POSTing their address at sign-up.
  if (userLocale && user.locale !== userLocale) {
    await updateUser(user.id, { locale: userLocale });
    return { status: "created", user: { ...user, locale: userLocale } };
  }

  return { status: "created", user };
}

async function assertSignupPolicyAllows(
  inviteToken: string | undefined,
  inviteMatch: InviteMatch
): Promise<{ isBootstrapAdmin: boolean }> {
  // A supplied-but-unusable invite is rejected before the user row is created, so a bad token can't
  // leave an orphaned account behind (handleInviteAcceptance would otherwise throw after signup).
  if (inviteToken && inviteMatch !== "valid") {
    logger.warn({ inviteMatch }, "Rejected sign-up with an unusable invite token");
    throw new InvalidInputError(INVITE_TOKEN_INVALID_ERROR_CODE);
  }

  // A valid invite is an independent grant — it admits the holder whatever the instance policy says.
  // Never the bootstrap administrator, even on an empty instance: the grant is the invite, not the
  // exception, and spending the single-use marker here would lock out the operator it is reserved for.
  if (inviteMatch === "valid") {
    return { isBootstrapAdmin: false };
  }

  // No invite, so it comes down to instance policy: public sign-up genuinely open, or the initial
  // administrator during fresh-instance setup, who has no invite to present. That predicate is shared
  // with the Better Auth hooks (signup-policy.ts) — writing it out twice is what left Better Auth's
  // native /sign-up/email open after this action was fixed (ENG-2073 → ENG-2293).
  const admission = await resolveUninvitedSignupAdmission();
  if (admission === "denied") {
    throw new InvalidInputError(SIGNUP_DISABLED_ERROR_CODE);
  }

  return { isBootstrapAdmin: admission === "fresh-instance" };
}

export const createUserAction = actionClient
  .inputSchema(ZCreateUserAction)
  .action(async ({ parsedInput }) => {
    await applyIPRateLimit(rateLimitConfigs.auth.signup);
    await verifyBotCheckIfConfigured(parsedInput.botCheckToken);

    // Normalized once, up front, and used for every downstream decision. The sign-up form always sends
    // this field as `inviteToken ?? ""`, so an ordinary uninvited sign-up arrives with an empty string —
    // anything blank has to mean "no invite" everywhere, or the checks below disagree with
    // `handlePostUserCreation` about which path the request is on.
    const inviteToken = parsedInput.inviteToken?.trim() || undefined;
    const inviteMatch = await resolveInviteMatch(inviteToken, parsedInput.email);

    const { isBootstrapAdmin } = await assertSignupPolicyAllows(inviteToken, inviteMatch);

    // Forms Cloud only: reject personal/free/disposable email domains before any user is created.
    // Invited users are exempt unless SIGNUP_DOMAIN_CHECK_ON_INVITES is enabled.
    if (await isSignupEmailDomainBlocked(parsedInput.email, async () => inviteMatch === "valid")) {
      throw new InvalidInputError(SIGNUP_EMAIL_DOMAIN_BLOCKED_ERROR_CODE);
    }

    // The domain policy passed, so mark the request scope: user.create.before uses this to tell a
    // sign-up that went through this action apart from a direct POST to Better Auth's native
    // /sign-up/email endpoint (which bypasses the action and is re-checked in the hook).
    const outcome = await runWithSignupRequestContext(() => {
      markSignupDomainAllowed();
      // ENG-2247: carried into user.create.before, which stamps the marker on the row it inserts. The
      // unique index on that column is what makes two concurrent fresh-instance sign-ups resolve to one.
      if (isBootstrapAdmin) markBootstrapAdminSignup();
      return signUpUserSafely(
        parsedInput.email,
        parsedInput.name,
        parsedInput.password,
        parsedInput.userLocale
      );
    });

    // Everything below is provisioning + analytics for a NEW account. On "already_existed" the response
    // is deliberately identical (enumeration-safe) but nothing runs: this endpoint is unauthenticated,
    // so the caller has proven nothing about an account that already exists (ENG-2091).
    if (outcome.status === "created") {
      const { user } = outcome;

      // ENG-2562: remember, in THIS browser, that it is the one that created this account, so the
      // verification click can be told apart from a stranger's and only this browser is auto-signed-in.
      //
      // Issued on the `created` path only, and that exclusion is the security-relevant half: on
      // `already_existed` the caller is an unauthenticated stranger who has proven nothing about an
      // account that already exists, so arming a cookie for it would hand them the very auto-sign-in
      // this fix exists to withhold — and would leak that the address is registered.
      //
      // Before the other side effects: those can fail, and a sign-up that created the account but lost
      // its intent cookie would silently degrade to "verify, then log in".
      //
      // Non-fatal for the same reason: the cookie buys UX (auto-sign-in after verification), so a
      // failure to mint it must cost exactly that UX — never the sign-up itself, which has already
      // created the account. Concretely reachable when neither secret is set.
      try {
        (await cookies()).set(
          SIGNUP_INTENT_COOKIE_NAME,
          createSignupIntentToken(user.id),
          SIGNUP_INTENT_COOKIE_OPTIONS
        );
      } catch (error) {
        logger.error(
          { error, userId: user.id },
          "Failed to issue the sign-up intent cookie; verification will require a manual sign-in"
        );
      }

      await handlePostUserCreation(outcome, inviteToken);

      // Inside the "created" branch: an audit record claiming a user was created must only exist when
      // one was. Previously this ran unconditionally, so a duplicate sign-up wrote a `created` event
      // attributed to the PRE-EXISTING user and carrying their object (ENG-2091 / S1).
    } else {
      // No account was created, so no `created` event may be written. Attribution alone is not enough:
      // `withAuditLogging` wraps the whole action with a fixed action name and cannot see which branch
      // ran, so without this it still logged a SUCCESSFUL `created` for an UNKNOWN_DATA target — a false
      // creation record on audit-enabled deployments (raised by @BhagyaAmarasinghe in review).
      //
      // The response stays byte-identical either way (ENG-2099) — this changes only what we record, and
      // only on the success path, so a genuine failure is still audited.
    }

    // Deliberately invariant: the response never varies with whether the address already had an
    // account, nor with what happened to the verification email. Both would make it a lookup
    // (ENG-2099). The verification-requested screen the form lands on is phrased conditionally and
    // carries a log-in link, so the existing-account visitor still has a way out.
    return {
      success: true,
    };
  });
