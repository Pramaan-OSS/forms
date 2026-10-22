# Forms

Create surveys, collect responses and connect your own accounts through Pramaan.

Install Docker, then:

```sh
cp .env.example .env  # paste PRAMAAN_API_KEY into .env
./start
```

Open http://localhost:3036. Stop with `./stop`; your data is retained. No other account or secret
is needed to start. [Configuration and development checks](docs/README.md).

Startup builds and serves compiled pages, so visiting a new page does not trigger compilation.
Use `./start --development` for editing, or `./start --production` to switch back. Both modes
keep the same database and private settings. Development mode needs more memory while compiling pages.
Local startup skips copying a separate deployment archive; release builds still include that archive.

Managed sign-in and the managed database are provided through Pramaan in test mode.
Sign in with email or the shared development sign-in client. Database provisioning falls back to
the bundled local database while unavailable. Private connection settings are saved under
`.runtime/`; retain that folder with `.env` and your data, and never publish it. Startup also
saves request identifiers there so retries reuse the same provisioning action. Service unavailability
keeps the local fallback; other refusals stop startup with a safe reason.

Email uses the managed sender. Set `MAIL_FROM` to the owner's reply address when needed.

Organization members can read and edit workspace content without team setup. Owners and managers
retain administration; private surveys and organization boundaries still apply. Startup updates
the bundled previous permission rules automatically. Customized permission rules require review.

## Connected accounts

Connecting an outside account, such as a spreadsheet or another app that receives responses, carries a monthly Pramaan
charge for each connected account, billed to the Pramaan account behind `PRAMAAN_API_KEY`. Signing in is free.
Disconnecting an account ends its charge.

## Built on

Built on [Formbricks](https://github.com/formbricks/formbricks), imported at
`062a49126382f48dfca4ea9c5112c4b8560be612`, under AGPL-3.0. The original licence notice is retained in
`LICENSE-ORIGINAL`. Forms is licensed under AGPL-3.0.
