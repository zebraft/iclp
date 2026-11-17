# Repository workflow

Maintain this repository as a sanitized source snapshot of the application code and skill instructions. Occasional batched commits are authorized as the normal maintenance workflow. Review the diff, run relevant tests and the public-source scanner, then commit. Branches and pull requests are optional for small batches. Do not assume an edit made in ChatGPT, Sites or the Google Apps Script editor is automatically copied here.

Never commit researcher identities, research profiles, preferences, private correspondence, actual book-selection records, personal checklist links, Google file IDs, runtime credentials, production databases or private deployment configuration. Use synthetic fixtures. Bibliographic authors are public book metadata; researcher identities and personalized rationales are private service data.

Keep staff administration authenticated. Keep researcher-facing response projection limited to bibliography, opaque issue IDs and explicit selection state. Do not return private free-text history or researcher metadata to personal-link holders. Preserve current security tests.

Reuse one privately configured staff workbook across new booklists; preserve immutable issue numbering and original row mappings. Spreadsheet records are runtime data, not source files. Never export operational records into Git for versioning.

Update Apps Script source through administration/google-workspace/apps-script/Bridge.gs and the shared reconciliation engine, then run administration/scripts/bundle-apps-script.mjs. Deploy the resulting code privately; script properties stay outside Git. Direct edits in Google's editor require an explicit source reconciliation before subsequent deployment.

Keep skill source under skills/. Updating a cloud-installed skill requires a separate authorized import/update; writing a repository file does not update ChatGPT automatically.

Keep the retired Book Browser experiment and its dataset outside this repository. Preserve existing vendor license notices. Runtime deployment identities belong in ignored private settings, not this public snapshot.
