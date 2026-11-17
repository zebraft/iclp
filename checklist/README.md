# ICLP Book Confirmations

Public, no-login frontend for personal book-recommendation checklists. The homepage contains no bibliography or researcher data. Issue data requires an unguessable 72-character personal key and expires after 90 days in the private backend. Page visits never create recommendations; only explicit reviewed submissions do. No orders are placed.

A server-only secret `REVIEW_BACKEND_SERVICE_TOKEN` grants this frontend service access to the workspace-private backend. The proxy is fixed to that backend and to `/api/recommendations/<uuid>` only; it forwards only GET and same-origin POST, with explicit header allowlists and no cookies. It cannot proxy settings, credentials, holdings, MCP or arbitrary paths. API responses disable caching and referrers; bibliography renders as text, and external links have no referrer. Missing/invalid keys fail closed.

Responses and revisions persist in the existing backend database, preserving issue IDs and numbering. Staff use the private AS Holdings Checker tools to reconcile submissions to Drive. The external submitter is identified by possession of the personal link, not by a verified ChatGPT or email login. Keep links private and do not forward them. Email replies remain available as fallback.

## Direct staff-workbook delivery

The private backend attempts a direct Google Sheets write on each explicit form submission after its administrator connects its Apps Script bridge (or an existing service account) at `/sheets/setup`. The public frontend never sees that key. The result distinguishes `workbookSynced=true` from durable response storage with delivery pending. Retry keeps the same response ID; no new researcher decision is created. This frontend cannot set up the Google connection or alter stored credentials.

## Automatic delivery recovery

`/api/delivery/retry` forwards only a bounded signed retry envelope to the private administration Site's fixed `/api/sheets/retry` endpoint. The existing backend service credential stays server-only. The backend verifies the Apps Script connection signature, request age and nonce before retrying pending responses. This route grants no general proxy access, workbook reads, email or purchasing permission. Apps Script's five-minute trigger is a recovery path; ordinary researcher submissions still attempt delivery immediately.


## Personal-link privacy

New personal links put the capability in a URL fragment, so it is not sent in the initial HTTP request. Legacy query-key links remain accepted and are converted to fragments in the browser. Referrers and API caching stay disabled. The private backend projects researcher-facing responses: registered email, staff workbook URL, source row numbers, selected-book snapshots and staff synchronization receipts are omitted. Internal Google Drive and ChatGPT links are not displayed as bibliographic sources. Only bibliography and the holder's selected book IDs remain visible. Researcher names, profiles, personalized rationales, staff issue labels and previously submitted free-text comments are omitted, including for valid-link holders. Optional comments can still be sent privately to staff. A personal link is a bearer capability; forwarding it grants access to that issue.
