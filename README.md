# ICLP book recommendation service

Current service source only: private staff administration, personal book-confirmation webpage, Apps Script delivery, and the buy-books skill source.

- `administration/`: staff-only service, holdings checks and durable response register.
- `checklist/`: public homepage and capability-protected book checklist. Researcher names, research profiles, personalized rationales and previous private comments are not returned to this frontend.
- `administration/google-workspace/apps-script/`: Google-account-owned workbook connection. No service account is required for this path.
- `skills/buy-books/`: agent workflow source with one permanent staff workbook across source lists. Updating these files does not by itself replace a separately installed cloud skill.

The earlier browser-local Book Browser experiment and its dataset are excluded. This is a fresh source snapshot, not the private deployment's Git history. It contains no real researcher profiles, recipient addresses, staff workbook IDs, personal confirmation links, runtime credentials, operational records or raw API captures.

## Configure your own deployment

The `administration.example.invalid`, `checklist.example.invalid` and `REPLACE_WITH_STAFF_WORKBOOK_ID` values are deliberate placeholders. Replace them with your own verified deployment origins and permanent workbook configuration. Regenerate the downloadable script with `node scripts/bundle-apps-script.mjs` in `administration/`. Register new Sites through their supported workflow; these template manifests contain no existing project IDs. Keep administrator access private and preserve the workbook's restricted sharing.

For each app, install using `npm run install:ci`, run `node --test tests/*.test.mjs`, run `npm exec tsc -- --noEmit`, then `npm run build`. Configure `CREDENTIAL_ENCRYPTION_KEY` only in the private administration runtime and `REVIEW_BACKEND_SERVICE_TOKEN` only in the checklist server runtime. Run the workbook's Apps Script setup, authorize it in Google, and enter its connection code only in the private setup page. Never commit these values or cloud skill profile data.

Institutional profile Page URLs in the skill are placeholders. Configure those privately; do not add real researchers or their interests to public examples. Use synthetic book lists for an openly shared demo. Personal-link holders can still see the books listed for their issue and their selected book IDs; keep real personal links private.

## Before each update

Run `python scripts/check-public-source.py` before committing. Keep build output, runtime databases, logs, screenshots, traces and copied private deployment settings out of Git. The optional `PRIVATE_SOURCE_SCAN_PATTERNS_JSON` environment variable can supply private checks without putting the private values in this repository. The repository-level scan is a targeted check for the known exposure classes, not a substitute for a review of new files.

## Colleague changes and Git

Occasional batched snapshot commits are fine for this repository. Collect code and skill changes, review the diff, run the privacy scan and relevant tests, then commit and push. Branches and pull requests are optional for small maintenance batches. The included CI runs privacy-pattern checks, application tests, type checks and builds. It does not deploy sites or read private runtime data.

Changes made only in the deployed Sites editor, ChatGPT's cloud skill editor, Google Sheets or the Google Apps Script editor do not synchronize back to GitHub. Deploy reviewed code from the repository, and explicitly update the deployed Apps Script and cloud skill from that version. Sheets selections, feedback, profiles and other operational records remain private runtime data and must not be committed.

This repository is a sanitized source snapshot and does not establish automatic source synchronization or deployment. Its `.invalid` origins and workbook placeholder require private deployment configuration before deployment to an existing service.
