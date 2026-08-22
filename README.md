# MNSTRY organization profile

This repository owns the landing page rendered at `github.com/MNSTRY`.

The profile has two authorities:

- `profile/README.md` contains the durable, authored MNSTRY story.
- The content between `mnstry:repositories` markers is generated from the public GitHub API by `scripts/update-profile.mjs`.

The generator includes public, non-fork repositories owned by MNSTRY. It excludes this `.github` infrastructure repository and any disabled repository. Archived repositories remain visible with an explicit archived status.

## Local commands

Node.js `>=22.18.0 <23` is required.

```sh
npm test
npm run profile:update
npm run profile:check
```

`GITHUB_TOKEN` is optional for local use and supplied by GitHub Actions in automation. The updater fails without changing the profile when GitHub cannot provide a complete response.

## Updating the profile

Edit prose outside the generated markers directly. Edit `profile/repositories.json` only for curated presentation facts such as a display name, documentation URL, package name, or featured order. Repository descriptions, languages, licenses, topics, activity dates, and tags come from GitHub.

A scheduled workflow refreshes the catalogue daily and commits only when public metadata changed. It can also be run manually from the Actions tab.

New public repositories need no profile edit. They appear on the next successful refresh unless explicitly excluded.

The profile code and content are available under Apache-2.0. `NOTICE` keeps the MNSTRY marks outside that software license.

## Publication boundary

The updater reads only `GET /orgs/MNSTRY/repos?type=public`. It never authenticates against or enumerates the private repository inventory. The generated section escapes repository-controlled prose before placing it in Markdown.
