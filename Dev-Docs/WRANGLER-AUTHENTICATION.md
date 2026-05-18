# Wrangler Authentication Standard

## Problem

Wrangler's interactive `wrangler login` stores an OAuth token in the user's global Wrangler config. That is convenient for occasional manual commands, but it is a weak default for active local development across multiple projects:

- The global OAuth refresh token can become invalid and then every project depending on it starts asking for login again.
- Long-running dev servers with remote bindings may need Cloudflare API access hours after the initial login.
- A project that does not declare its own auth setup has no reproducible local environment.

In this repo, `npm exec wrangler -- whoami` failed with `Failed to fetch auth token: 401 Unauthorized`, even though Wrangler had a global config file. That means the saved OAuth refresh token existed but was no longer usable.

## Best Path

Every Cloudflare project should use a project-local, ignored `.env` file for Wrangler system environment variables:

```sh
CLOUDFLARE_ACCOUNT_ID=<account-id>
CLOUDFLARE_API_TOKEN=<account-scoped-token>
```

Cloudflare documents `.env` as the recommended persistent way to set Wrangler system environment variables, and Wrangler supports both `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

Keep `wrangler login` as a manual fallback, not as the main development credential path.

## Standard Project Setup

1. Ignore local credential files:

```gitignore
.env
.env.local
.env.*.local
.dev.vars
.wrangler
```

2. Commit a safe example file:

```sh
CLOUDFLARE_ACCOUNT_ID=<account-id>
CLOUDFLARE_API_TOKEN=
```

3. Fill `.env` locally, never in git.

4. Verify auth with:

```sh
npm exec wrangler -- whoami
```

5. Start development normally:

```sh
npm run dev
```

## Token Scope

Use the smallest token that supports the project. For a Workers project with remote development bindings, the baseline is usually:

- Account scope for the target account.
- Workers Scripts edit/write.
- Workers Tail read if local tooling tails logs.
- AI write/run permissions when Workers AI or remote AI bindings are used.
- Add D1, KV, R2, Queues, Vectorize, Pages, or other product permissions only when the project actually uses them.

Do not use the global API key. Do not expose the token through public client variables. Avoid `PUBLIC_` prefixes and never pass `CLOUDFLARE_API_TOKEN` to browser code.

## Repo-Specific Notes

This project uses:

- `demo/wrangler.toml` with `account_id = "1be30ba84b25839e5cc0d507256f0fc8"`.
- A remote Workers AI binding: `[ai] binding = "AI" remote = true`.
- Astro's Cloudflare adapter for local and preview Cloudflare runtime behavior.

The committed `demo/.env.example` contains the account ID and leaves the token blank. Demo development should copy it to `demo/.env` and set `CLOUDFLARE_API_TOKEN`.

## Operational Rule For Future Projects

When creating or touching any Cloudflare project, check this before calling the work done:

- `.env` and local variants are ignored.
- `demo/.env.example` exists and names required Cloudflare variables without secrets.
- Docs say local dev uses `.env`, not repeated interactive OAuth.
- `npm exec wrangler -- whoami` works from the project root after the local `.env` is present.

If this is missing, fix it as project setup. Do not add fallbacks, alternate providers, or hidden auth flows to work around a missing credential contract.
