---written by AI---

# ICLP book recommendations

Select books from a supplied catalog, match them to researcher interests, check Academia Sinica holdings, and collect purchase recommendations.

## Workflow

1. Read the catalog and the researcher’s **Research Areas** master profile.
2. Select relevant books, exclude confirmed holdings, and flag uncertain results for staff review.
3. Save a numbered issue in one private staff workbook and create a personal checklist.
4. Send the checklist when email delivery is authorized. Submitted choices sync to the workbook and deduplicated buyer queue.
5. Apply explicit topic changes to both Research Areas and the private preference record, in Chinese and English. Preserve history and verify both updates.

Recommendations are not purchase orders. Holdings and outstanding orders require review before purchase.

## Source

- `administration/`: authenticated staff tools, holdings checks, and response storage.
- `checklist/`: personal book-confirmation webpage.
- `administration/google-workspace/apps-script/`: workbook connection and delivery retries.
- `skills/buy-books/`: agent workflow instructions.

## Setup and maintenance

Replace the `.invalid` origins, workbook placeholder, and profile references with your private configuration. Keep credentials, researcher data, personal links, and operational records outside this public repository.

For each app, run `npm run install:ci`, `node --test tests/*.test.mjs`, `npm exec tsc -- --noEmit`, and `npm run build`. After Apps Script changes, regenerate its download with `node scripts/bundle-apps-script.mjs` from `administration/`.

Before committing, run `python scripts/check-public-source.py` and relevant checks. See [AGENTS.md](AGENTS.md) for maintenance rules.

This repository does not automatically synchronize with deployed Sites, Google Apps Script, or installed ChatGPT skills. Update each destination explicitly.
