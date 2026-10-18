# Signup and captcha

New accounts sign up with a username and a password and solve a Cap captcha. [invites.md](invites.md) covers invite-only signup, and [automod.md](automod.md) covers join reasons, manual approval, signup scoring and the limits per address.

## Cap verification

Registration needs a solved [Cap](https://trycap.dev/guide/capjs-core) proof by default. The signup form shows the Cap widget above Create Account, and the API answers HTTP 400 when the proof is missing, invalid, expired or already used. An instance invite doesn't replace the captcha. The Captcha card in Site settings has these settings:

| Setting                                   | Default | Effect                                                                 |
| ----------------------------------------- | ------- | ---------------------------------------------------------------------- |
| `register.requireCaptcha`                 | true    | Registration needs a captcha.                                          |
| `security.captcha.enabled`                | false   | Allows the optional captcha on sign-in and password reset.             |
| `login.requireCaptcha`                    | false   | Sign-in needs a captcha, when `security.captcha.enabled` is on.        |
| `passwordReset.requireCaptcha`            | false   | Password reset needs a captcha, when `security.captcha.enabled` is on. |
| `security.captcha.capMode`                | `core`  | `core` or `standalone`.                                                |
| `security.captcha.blockAutomatedBrowsers` | true    | Refuse solves from automated browsers, see below.                      |

In `core` mode the server runs Cap itself and serves the widget from the instance, with no API key, other service or outside request. In `standalone` mode it uses a Cap Standalone server and needs its URL in `security.captcha.instance`, its `sitekey` and its `secret`. Site settings refuses to save standalone mode without all three, and a blank secret field keeps the stored secret. When the standalone settings are incomplete, the server refuses every captcha instead of falling back to core. Cap is the only supported captcha.

Challenges and solved tokens expire after 5 minutes, and each token works once. The challenge and redeem routes each allow 30 requests per IP per minute, even when the general rate limits are off. The API reads the proof from the `X-Captcha-Key` header or from `captcha_key` in the body, and the `/verify-email` page shows the widget when email verification asks for one.

## Challenge work per place

A Cap core solve is a set of SHA-256 proof of work challenges. `count` is how many challenges one solve has, `size` is the length of each salt and `difficulty` is how many leading hex digits each hash has to match. One challenge at difficulty 5 needs about a million hashes, and each step of difficulty multiplies the work by 16.

| Place          | Key                                         | Default                              |
| -------------- | ------------------------------------------- | ------------------------------------ |
| Registration   | `security.captcha.challenges.register`      | 64 challenges, size 32, difficulty 5 |
| Sign-in        | `security.captcha.challenges.login`         | 16 challenges, size 32, difficulty 5 |
| Password reset | `security.captcha.challenges.passwordReset` | 16 challenges, size 32, difficulty 5 |

The server clamps `count` to 1 through 500, `size` to 16 through 64 and `difficulty` to 1 through 8. A Cap Standalone server ignores these and sets its own difficulty. A proof solved for sign-in doesn't work for registration, while a registration proof works everywhere.

On an Apple M3 MacBook in Brave, a registration solve took 3 to 6 seconds under normal use and 9 to 11 seconds under heavy load. Phones take longer. Set `difficulty` to 4 for a sixteenth of the work if your members sign up from slow devices.

## Refusing automated browsers

While `security.captcha.blockAutomatedBrowsers` is on, every Cap core challenge carries a script that inspects the browser while it solves, and the server refuses a solve that looks automated with reason `automated_browser`. It logs `[Cap] refused an automated browser for <place>: <reasons>`. With the setting off, nothing is refused. Site settings shows it as Refuse headless and automated browsers.

Cap refuses `navigator.webdriver` and headless user agents itself. The server adds strong reasons, any one of which refuses the solve, and weak reasons, which refuse it from 2 together:

- Strong: `webdriver`, `headless_user_agent`, `zero_window` for a 0 by 0 window, and `signals_missing` when the solve carries no result from the check.
- Weak: `software_renderer` for a software WebGL renderer, `no_plugins` and `missing_chrome_object` on desktop Chromium, and `notification_mismatch` when the notification permission and the permissions API disagree.

One weak reason is never enough, because a virtual machine without a GPU reports a software renderer. Firefox, Safari and phones skip the Chromium checks.

The check stops headless Chromium driven by Playwright, Puppeteer or Selenium with their default settings. A real browser, patched values or a paid solving service gets through, though it still pays the proof of work and the registration rate limits. Treat it as a filter for low-effort signups, not as bot detection.

`scripts/dev/worktree-setup.sh` turns the setting off in a dev worktree's `config.json`, because the seed script and the probes solve Cap in a headless browser. Production keeps it on.

## Signup form

The form shows Retry verification when the widget fails to load or a token expires. When a registration request is interrupted, the form keeps its fields and offers to sign in with the username and password entered. An HTTP 429 shows the remaining wait and keeps the fields. When registration is closed, the username field shows `DISABLED` for `register.disabled` and `REGISTRATION_DISABLED` for `register.allowNewRegistration: false`.

## Email

The signup form has no email field by default, because `assets/client_patches/55-simple-signup.js` removes Discord's. Site settings has 3 switches under Registration:

| Switch                   | Setting                     | Default | Effect                                                                                                         |
| ------------------------ | --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| Require an email address | `register.email.required`   | false   | The form shows a required email field after the next page load, and the API refuses a signup without one.    |
| Verify email addresses   | `defaults.user.verified`    | true    | The switch is on when this is `false`, and new accounts then start unverified and get a verification link.   |
| Require a verified email | `login.requireVerification` | false   | Unverified accounts are held back as described below.                                                         |

Verification links need an email provider, see `SMTP_HOST` in [setup.md](../self-hosting/setup.md). Site settings refuses with HTTP 400 to require a verified email while an email address isn't required at signup.

An unverified account can always sign in. While `login.requireVerification` is on, the server answers its `POST`, `PUT`, `PATCH` and `DELETE` requests with HTTP 403 and code 40002, the gateway ignores its voice joins, and the client shows a Verification Required screen with Resend Email and Change Email. `GET` requests, `POST /auth/verify/resend`, `POST /auth/logout` and `PATCH /users/@me` still work. The screen goes away without a reload once the account is verified. Bots are never held back, and accounts created while verification was off are already verified.

## Testing

Run these only against a database you created for the test. Test accounts solve a real challenge through `scripts/dev/cap-token.mjs`, because there is no test bypass.

```sh
CAP_REGISTRATION_TEST=1 APPLY_DB_MIGRATIONS=false bun --env-file=<isolated .env> test ./scripts/tests/cap-registration.postgres.cjs
PORT=<port> bun scripts/dev/cap-signup-smoke.mjs
PORT=<port> bun scripts/dev/cap-disconnect-smoke.mjs
PORT=<port> bun scripts/dev/cap-disabled-smoke.mjs
```

`cap-disabled-smoke.mjs` needs an instance with registration disabled, and `REGISTRATION_DISABLED_CODE=REGISTRATION_DISABLED` tests the other switch. The smoke tests take `BROWSER=webkit` for an iPhone-sized WebKit window. `scripts/tests/cap-automation-signals.test.cjs` and `scripts/tests/cap-contexts.test.cjs` cover the automated browser check and the settings per place.
