# Homepage and loading screen

The instance's own pages outside the client are the homepage at `/`, the link previews for it and for invites, and the loading screen the client shows while it starts. All of them read the config on each request, so a change shows up on the next page load without a restart.

## Homepage

The homepage has the instance icon and name, a tagline, sign-up and sign-in buttons, four feature highlights and a FAQ of seven questions. The FAQ works without JavaScript. The footer links to `/status`, `/terms`, `/privacy` and `/guidelines` and keeps the Meowcord credit.

| Setting                                              | Effect                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `client.instanceName`, `client.icon`                 | The name and icon throughout the page.                                                           |
| `general.instanceDescription`                        | Replaces the default tagline and the page's meta description.                                    |
| `register.disabled`, `register.allowNewRegistration` | Either one closes registration. The page then shows only Sign in and says new accounts are closed. |
| `register.requireInvite`                             | The page explains that joining needs an invite link.                                             |
| `general.correspondenceEmail`                        | Adds a Contact link to the footer and the address to the FAQ.                                    |

## Link previews

The homepage and every `/invite/<code>` page carry Open Graph and Twitter Card tags, so other sites and chat apps show a card instead of a bare URL.

The homepage card uses the instance name, `general.instanceDescription` and the app icon at 512px. An invite card says "Join the <server> server on <instance>", uses the server description or a sentence with the member count, and shows the server icon at 256px. A group DM invite gets a generic card. An unknown or expired invite gets the homepage card, so the page doesn't reveal whether a code ever existed.

`/api/v9/oembed?url=<page>` answers oEmbed requests for pages on the same host and returns 404 for any other host.

## Loading screen

In the admin dashboard under Site settings, Loading screen, an operator enters one "Did you know?" tip per line and pastes a loading animation as an SVG. The client picks a random tip on each start. Empty fields restore the built-in tips and animation. Preview shows the first tip and the animation before saving.

| Key                  | Limit                                                   |
| -------------------- | ------------------------------------------------------- |
| `client.loadingTips` | Up to 100 tips of 500 characters each.                  |
| `client.loadingSvg`  | Up to 64 KB, 1,000 elements and 64 levels of nesting.   |

The SVG may use drawing elements, gradients, local references, CSS and SVG animation. The server refuses scripts, event handlers, embedded HTML, external resources and document declarations with a 400 and keeps the old config. The client draws the SVG as an image and the tips as plain text. Open pages pick up a change when they reload.
