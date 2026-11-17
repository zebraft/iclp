# vinext-starter

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git and `tar` (including Windows `tar.exe`) are required for publishing; portable publication does not require Bash

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

Publish archives outside the source checkout or under its ignored `outputs/` directory. Local `.env*`, `.dev.vars*`, TypeScript build state, and tool runtime directories are ignored; keep the hosting manifest, migrations, and authored scripts in source control.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For managed Linux browser QA, follow the Sites skill's managed preview reference. The daemon runs the project's Vite dev script with `--host 0.0.0.0 --port 4173 --strictPort`; use the CLI's returned URL. The ignored local profile survives the daemon's cleared environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `worker/index.ts` is the production Worker entrypoint and preserves request-scoped connector bindings
- `scripts/vite/` contains the maintained Vite integrations and the vendored Sites plugin license
- `scripts/connector-preview/` contains the local connector preview Worker and session helpers
- the remaining `scripts/` files select execution profiles and run installation, development, and builds; the plugin's helpers orchestrate the Sites lifecycle
- `dist/` contains generated deployment output; `.vinext/`, `.wrangler/`, and `.sites-runtime/` contain ignored local tool state
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## Researcher confirmation checklist

`create_recommendation_checklist` snapshots an already-sent issue and returns a personalized, personalized URL. Keep the URL private: it contains the review capability; only its SHA-256 hash is stored. The page sends no referrer and retains its key through sign-in. GET never records consent. Explicit reviewed POST submissions preserve the immutable issue/book mapping, revision history, separate profile changes and feedback, and an idempotency key. Confirmation is a recommendation, not an order. Original holdings remain uncertain pending librarian review.

Responses persist in D1 before delivery. With a verified Sheets connection, each submitted revision updates the configured workbook immediately and reports success only after readback. An Apps Script trigger retries the latest pending revision every five minutes, up to five issues per run. Agent reconciliation is a recovery path, not a routine librarian task. Preserve all D1 revisions; superseded pending revisions do not override the latest choice. No buyer email or mailbox authorization is installed by this feature.

The backend Sites workspace audience is unchanged. External researchers use the separate public ICLP Book Confirmations frontend. It proxies only token-authorized review reads and submissions using a server-held Sites service credential. No settings, credentials, MCP or other private routes are proxied. The personal issue token is the authorization for external submissions; `actor_id=personal-link` does not assert verified email identity.


## Direct Google Sheets delivery

The preferred connection uses the staff workbook owner's existing Google account through a container-bound Apps Script. No service account is required. `/sheets/setup` provides the generated Code.gs and setup instructions. Add the Google Sheets advanced service, run `setUp`, authorize it, deploy as the owner with Anyone access, and paste its deployment URL and connection code into the private administrator form. If an organization prohibits anonymous web-app deployments, this path requires its administrator's policy decision; do not change policy or substitute a personal account silently.

The publicly callable script only accepts timestamped HMAC-signed probe/sync requests, limits all operations to the bound workbook, and never returns a Google token. The connection secret is AES-GCM encrypted in the backend. Script locks serialize each complete read-write-readback transaction. The original service-account connection remains supported for existing deployments.

A submission saves its immutable response first, then tries direct delivery twice. Both connection types use `lib/reconciliation.mjs`; `scripts/bundle-apps-script.mjs` embeds that exact engine in `public/setup/Code.gs`. After edits, regenerate the script before building. Format, table ranges and validation are preserved. The reply record, selected buyer rows, amended buyer statuses and every researcher note are read back before a synchronized receipt is issued. Automatic withdrawal can be undone by explicit reselection; staff-set declined/ordered states remain staff decisions.

The script's `setUp` installs a five-minute `retryDeliveries` trigger. It calls the public frontend's fixed `/api/delivery/retry` route with a signed envelope; the frontend forwards only that operation to the private backend. The backend verifies signature, freshness and nonce uniqueness before retrying the latest pending revisions. Keys, arbitrary URLs and Google credentials are never accepted from researchers. Connection status probes Google access and trigger installation; a separate heartbeat reports observed retry calls. Missing credentials, failed authorization or failed readback leaves the response pending. A trigger being installed does not prove a live retry has run.

No order or email is sent. Profile-change requests and feedback remain separate records; preference edits still need their authorized processing.

### Future Google Workspace migration

The Sheet, bound script, stable book/issue/response IDs, immutable numbering and shared reconciliation engine are portable. `google-workspace/apps-script/` includes the bridge and manifest; the production downloadable script is generated from those sources. A future Workspace-owned frontend can replace the current checklist host without changing workbook IDs or purchasing records. The Apps Script `RETRY_URL` Script Property can override the current callback when that host changes. Migration of website response history, personal links and acquisition preferences still needs an explicit migration plan; this change does not move those records or identities.

## Staff management homepage

The site is titled 薦購系統管理 Book Recommendation Administration. Its homepage shows response totals/latest revisions for the signed-in operator’s own issues, pending workbook deliveries, Google connection state, recent response receipts and the canonical buyer-worklist link. Missing Google authorization is labeled as a one-time administrator setup, never as a routine per-list task. Configured administrators can explicitly retry pending deliveries. Holdings checks and connection credentials are collapsed secondary tools. The T2/T6 development control and credential-removal button are removed from normal navigation; backend checks and APIs remain available.

The duplicate researcher checklist screen has been removed from this private management Site. Its old page route redirects authorized staff to the single public 挑書 interface. Response storage, public proxy endpoints and tool contracts are preserved.

## Public-release boundary

The public checklist response includes bibliography and explicit selection IDs only. It omits researcher names, research profiles, personalized rationales, previously submitted private comments, staff issue labels, staff workbook destinations, registered emails, source-row mappings, staff receipts and internal Drive links. Bibliographic authors remain part of the book metadata. New capability links use URL fragments; legacy query links still work and are converted client-side. Treat personal links as private bearer capabilities, not public demo URLs.

The permanent configured staff workbook is reused across source booklists. Append new issue records and preserve previous numbering and source-row mappings. Ad hoc holdings-only exports can remain separate; they are not destinations for this service's automatic submissions.

Publish only a clean source snapshot. The private Sites history contains prior researcher fixtures and live deployment/file identifiers; do not mirror that history to public GitHub. Operational data, raw API captures, screenshots, logs, runtime state, connection codes and deployment settings are not public examples. The earlier browser-local Book Browser experiment is archived separately and is outside this service.


Candidate worksheets use the explicit name `AI candidates - <researcher>`, remain hidden from the normal buyer view, and are not purchase confirmations. Keep `採購清單 Buyer queue` first and retain its confirmed-only header. Existing immutable issues without a source-sheet label are routed to this candidate-tab name without changing their bibliography or numbering. Hiding is navigation only, not an access-control boundary for workbook editors.
