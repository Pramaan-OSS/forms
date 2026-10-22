# Run Forms

Install Docker with Compose. Copy `.env.example` to `.env`, paste `PRAMAAN_API_KEY`, then run `./start`.
Open http://localhost:3036. `./stop` stops this checkout's containers without deleting its data.
The first start downloads public dependencies and compiles the app's shared packages. Subsequent starts reuse them.

The supported local stack runs the web app with automatic rebuilding, a bundled database on host port 55436,
a cache and a persistent permissions database. Only loopback ports are published. Uploads stay in
the `data` volume by default. Keep the generated `.env` file with backups: its encryption key is
needed to recover encrypted data. Never commit it. The local `postgres` and `data` volumes hold your data.

Managed sign-in and the managed database are provided through Pramaan in test mode. On startup,
Forms provisions or reuses its sign-in backend. Email and shared development browser sign-in work
without an operator-owned identity client. Public HTTPS `APP_URL` origins are configured as return
addresses; local addresses use the backend’s built-in development allowance. Existing signup, invite
and account restrictions still apply. Other sign-in options retain the existing local and optional
own-client methods. If provisioning is unavailable, Forms uses local sign-in.

Database provisioning saves its once-only connection settings in `.runtime/database.json`, with
mode 0600 inside a private directory. Restarts reuse them. Keep `.runtime/` with your backups.
An unavailable managed database produces one plain startup line and uses the bundled database
through the same application and migration code. Local permissions infrastructure remains bundled.
Selecting a managed database does not copy records from an existing local database.

Startup saves action request identifiers in `.runtime/actions.json` before contacting the service,
with mode 0600. Retries reuse them, including after an interrupted start. A changed public return
address gets a new identifier; a retry of that change keeps it. Keep this file with the other private
settings. Refused requests stop startup with a fixed, safe reason, including a missing request
identifier header. Only service unavailability selects the local fallback.

## Optional connections

Connected accounts are configured from workspace settings → Integrations. The access is broad.
Choose an action returned by the catalogue and map the survey response into its required fields.
Existing legacy vendor connections must reconnect here. Test mode is explicit: `PRAMAAN_FAKE=1`
uses offline fixtures and marks pages as test mode; it never delivers mail or connected actions. Its managed sign-in fixture accepts only its fixed
offline test token; other tokens are refused.
Do not use it for real data. Without a key, startup opens local sign-in and skips managed provisioning.
Saved database settings remain usable and provisioning is skipped.

Optional own-client sign-in uses `PRAMAAN_SOCIAL_SIGN_IN`, a comma-separated list of account keys
and client ids. The accepted keys and exact callbacks are in
`apps/web/modules/auth/lib/pramaan-signin/config.ts`. Enterprise sign-in is optional through
`PRAMAAN_ENTERPRISE_SIGN_IN=1` with exactly one configured connection. These choices remain
available under Other sign-in options.
Bot checks need your own challenge widget and its connected account: set `PRAMAAN_BOT_CHECK_WIDGET`
and the response widget's public `RECAPTCHA_SITE_KEY`. No challenge account is bundled.
A completed challenge token must accompany an enabled bot check; verification goes through Pramaan.

Analysis and translations stay off until a workspace manager enables them in Integrations.
Review translated survey text before saving. Private/restricted surveys never send text through
these outbound features. The common-password breach lookup is unavailable pending a capability
that accepts only a five-character prefix; existing local password rules remain enforced.

Remote storage is optional: set `FORMS_STORAGE_DRIVER=pramaan`; `FORMS_STORAGE_BUCKET` defaults
to `forms`. Otherwise the same upload API stores files locally with signed, expiring links.
Telemetry export is off; an operator may set `OTEL_EXPORTER_OTLP_ENDPOINT` for their own collector.

## Checks

With Node 24 and pnpm 11.7 installed for development: `pnpm install --frozen-lockfile`,
`pnpm test`, `pnpm typecheck`, `pnpm build`. The web app itself needs only Docker through `./start`.
Do not use a real key for tests. Browser checks use a dummy key and explicit offline fixtures.

## Booking pages

A Booking page question is off when added. Enable it and paste the HTTPS URL of a booking
page you host, including a page from the Scheduling template. The URL cannot contain account
credentials. Forms loads it in an iframe with only form submission and scripts inside the frame
allowed; the frame has no origin access, parent navigation, popups or device permissions.
Forms injects no scheduling script. A link to open the page in a new tab is always visible,
since browsers do not reliably report every refusal to be framed. Pages that need cookies or
other blocked features can also use that link.

Existing explicit URLs and saved custom host/page values stay readable. A saved page handle
without any host or full URL needs the owner to paste a URL; there is no implicit hosted-service
default. Respondents confirm that they finished booking; Forms cannot verify a booking on an
unrelated page and does not treat frame loading or frame messages as proof of a booking.
