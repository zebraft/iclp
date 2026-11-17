# API holdings workflow

Use the connected 院內館藏查核 AS Holdings Checker to check books directly from chat. Keep Drive as the durable home for source booklists, researcher preferences, selected/excluded rows, recommendation issues and replies. Do not make Apps Script runs or copied execution logs the normal workflow.

## Connect and check

1. Discover the installed checker's actual tools; use `worldcat_connection_status` before starting a run. Reuse a successful connection check in the same task. The checker uses shared institutional credentials: authorized workspace colleagues do not enter individual OCLC keys. If unconfigured, ask the original administrator to restore the shared connection in the connected administration Site, resolving its verified URL from live connection metadata rather than a documentation placeholder; only that administrator can replace or remove the encrypted credentials. Never request or print secrets in chat, put them in a Sheet/Page/prompt, or read credential storage. Continue independent profile and list preparation while setup is pending.
2. Distinguish authentication success from completed holdings validation. A transport failure does not establish invalid credentials; inspect the reported error and fix the connection before asking the user to replace credentials. If necessary, use read-only T2/T6 controls from the development Page rather than repeatedly asking the user to run scripts. Do not repeat successful controls unless code, configuration, results or errors justify it.
3. Call `check_as_holdings` with `books` containing at most three entries. Each needs `title`; supply `isbn`, `author`, `sourceListDate` and `source` when available. Pass ISBN-10/13 as text without hyphens/spaces; preserve the original identifier separately. Use `source` to identify the Drive file, exact tab and source row. Omit an unavailable ISBN rather than guessing one. The tool does not itself read or write Drive.
4. Match every result to its input, preserving the entire run's pending IDs. Keep the report's timestamp, symbol, candidate OCLC numbers, returned ISBNs, title, author, publisher, year, edition, format, institution IDs, holdings counts, incomplete reasons and bibliographic warnings. Commit progress to the same output Sheet after each batch. An unattempted row remains `not checked` with a blank `AS holding?`.

## Reuse and refresh evidence

The shared checker uses ISBN-first staged lookup and stops expansion only after a sufficiently matched print record has AS institution 11128 holding evidence. It skips unrelated title candidates and qualifies fallback title queries with the supplied author. A positive remains scope-provisional; broad catalog coverage, orders, translations and volumes still need review.

Reuse the returned shared cache across researchers: verified complete positives expire after 24 hours, complete nonpositive checks after one hour, and incomplete checks are not persisted. The cache preserves the original checkedAt and reports current-call request counts separately. ISBN aliases are reused only when listed on the verified catalog record; do not infer equivalence between distinct translations or unresolved volumes. Caller source references are not shared in cached evidence.

Set top-level refresh:true on check_as_holdings for an explicitly requested fresh check and before purchaser handoff. Preserve the refreshed evidence and source mapping. Keep the three-book maximum; the server coalesces duplicate in-flight checks and uses bounded workers. Cache hits do not mean a new catalog lookup occurred.

## Interpret evidence

- Treat worldwide search records only as candidates. Use the AAE-filtered per-record holdings responses as holdings evidence; do not infer AS ownership from worldwide matches or counts.
- Reconcile the returned work and edition with the input. An ISBN can occur on multiple records or on ebook metadata. Never stop at the first ISBN record, substitute an ebook for a requested print edition, or accept a title-only similarity as identity proof. Apply the main skill's title-level duplicate rule across represented editions and record differences.
- Read `incomplete`, `incompleteReasons`, `scopeProvisional`, `purchaseReady`, and scope/order flags when returned. An empty reasons list and HTTP 200 establish technical completion only, not full institutional coverage.
- `matching_print_holding_requires_scope_review`: a returned print record has the requested ISBN and holding evidence. Verify its title/author, institution identity and edition before mapping to `yes` or excluding it.
- `holding_candidate_requires_identity_review`: inspect every relevant candidate; an earlier edition or ebook may represent the work, but identity, access and the requested matching rule need review. Keep `uncertain` until resolved.
- `no_holding_found_in_AAE`: record **AAE 未查得館藏 / No AAE holdings found** as the API result. Do not automatically map it to `AS holding? = no`. Until AAE's all-AS coverage and the required order follow-up are independently established, retain `uncertain`; it may still be offered as a researcher-recommendation candidate with a clear buyer-review flag. Recheck before purchaser handoff or purchase, and never describe it as confirmed unheld or purchase-ready.
- Any incomplete/failed/ambiguous response remains `uncertain`. Do not turn a timeout, pagination/candidate cap, zero result or missing field into an absence decision. Preserve positive evidence from an incomplete check, but resolve identity and scope before exclusion.
- Do not overwrite conservative tool flags to force a positive or negative classification. Record any independently verified scope or institution mapping, its source and date in the service register; seek additional catalog evidence when flags or observations conflict.
- Treat generated `catalogLinks` with `visited: false` as unvisited navigation links, not observed catalog-page evidence. API responses themselves remain dated evidence. Preserve supplied hyperlinks and label any unvisited links accordingly.
- Preserve source dates and catalog years separately. A source-list date is not necessarily a release date; retain discrepancies without silently updating the source or advertising an old publication as new.

## Fallback and delivery

Use the main skill's AS-scoped Discovery workflow for unresolved institution coverage, live orders, issue/volume holdings, missing records or identity conflicts when that route is available. If blocked, save successful work and keep unresolved entries; do not claim screening is complete.

Use the main skill's remaining/excluded output structure. Send holdings-screened researcher emails only after its identity, mailbox, recipient and eligibility rules are met. Keep unresolved entries in the register rather than silently dropping them or mailing them as confirmed unheld. Do not send empty issues. No schedules, purchases, sharing changes or recipient expansion are authorized by this integration alone.
