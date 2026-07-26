# Releasing

The release workflow (`.github/workflows/release.yml`) fires on a `v*` tag. It always builds the
`.vsix` and attaches it to a GitHub Release; it publishes to the Marketplace only once the
`VSCE_PAT` secret exists. Tagging before that is safe — you just get the artifact.

## One-time setup

1. **Create the publisher.** Sign in at
   [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) with a
   Microsoft account and create the publisher ID `akshaymuley` — it must match `publisher` in
   `package.json`.
2. **Generate a PAT.** In [Azure DevOps](https://dev.azure.com) → *User settings* → *Personal
   access tokens* → *New Token*:
   - Organization: **All accessible organizations** (this is the step people get wrong — a
     single-org token fails at publish time)
   - Scopes: *Custom defined* → **Marketplace → Manage**
   - Copy the token; it is shown once.
3. **Add the secret.** Repo → *Settings* → *Secrets and variables* → *Actions* → *New repository
   secret*, named `VSCE_PAT`.

## Each release

1. Confirm the extension actually works in a real VS Code — `npm run test:integration`, plus an
   F5 pass over anything that changed visually.
2. Bump `version` in `package.json`.
3. Move the `[Unreleased]` items in `CHANGELOG.md` under the new version, add the date, and
   update the link definitions at the bottom.
4. Commit and merge to `main`.
5. Tag and push:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

6. Watch the **Release** workflow. It refuses to run if the tag doesn't match
   `package.json` — that mismatch is the most common release mistake and it's cheaper to catch
   in CI than on the Marketplace.

## Notes

- **A published version number can never be reused.** If a release is broken, publish a patch;
  there is no overwrite.
- The Marketplace resolves README images by absolute URL only. The links in `README.md` point at
  `raw.githubusercontent.com/.../main/docs/images/...`, so those files must be on `main` before
  the release renders correctly.
- To dry-run the packaging locally: `npx @vscode/vsce package`, then `npx @vscode/vsce ls` to
  see exactly which files land in the `.vsix`.
- Open VSX (VSCodium, Cursor, Gitpod) is a separate registry: `npx ovsx publish` with an
  `OVSX_PAT` from [open-vsx.org](https://open-vsx.org). Not wired up yet.
