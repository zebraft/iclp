# Library Lookup source

Preserve this directory as a sanitized source template. Do not copy deployment IDs, live service URLs, account or workspace bindings, credentials, private profiles, query histories, database contents or personal correspondence into it. Use synthetic fixtures and example endpoints.

The source is a snapshot of the hosted lookup implementation and its two packaged skills. The original app bindings are intentionally omitted. The portable MCP connection is a placeholder, not a connection to the original service. Do not overwrite a deployed plugin or change its audience when maintaining this copy.

The bridge's DEMO institution symbol, MAIN branch code, and placeholder hosts are synthetic. The direct OCLC provider reads its institution and credentials from runtime configuration. Configure and verify the actual provider scope before claiming live holdings; never replace an unresolved result with an absence claim.

Run npm test in this directory and python scripts/check-public-source.py from the repository root. Regenerate build output with npm run build; do not commit dist or server/*-generated.mjs. Keep real configuration in ignored runtime settings.

Use the repository-root README.md as the human overview; do not add a per-folder README. Put technical detail in code, tests or agent instructions.
