# Releasing

The release workflow (`.github/workflows/release.yml`) fires on a `v*` tag. It always builds the
`.vsix` and attaches it to a GitHub Release; it publishes to the Marketplace only once the
`VSCE_PAT` secret exists. Tagging before that is safe — you just get the artifact.

## One-time setup

1. **Create the publisher.** Sign in at
   [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) with a
   Microsoft account and create the publisher ID `AkshayDMuley` — it must match `publisher` in
   `package.json`.
2. **Generate a PAT.** In [Azure DevOps](https://dev.azure.com) → *User settings* → *Personal
   access tokens* → *New Token*:
   - Organization: **All accessible organizations** (this is the step people get wrong — a
     single-org token fails at publish time)
   - Scopes: *Custom defined* → **Marketplace → Manage**
   - Copy the token; it is shown once.
3. **Add the secret.** Repo → *Settings* → *Secrets and variables* → *Actions* → *New repository
   secret*, named `VSCE_PAT`.

### Open VSX (optional second registry)

Open VSX serves VSCodium, Cursor, Gitpod, and Windsurf, which cannot reach the Microsoft
Marketplace. The release workflow publishes there too, and skips it silently while `OVSX_PAT` is
absent — exactly like `VSCE_PAT`.

**Not set up yet.** The steps below have not been done, so nothing is published to Open VSX
today. Note that it does not backfill: whenever you do complete them, only tags pushed afterwards
appear there.

1. **Sign in** at [open-vsx.org](https://open-vsx.org) with GitHub.
2. **Sign the Eclipse Foundation Publisher Agreement.** Profile → *Publisher Agreement*. This is
   the step that bites: the token authenticates fine without it and publishing still fails.
3. **Create an access token** from your profile → *Access Tokens*. Copy it; shown once.
4. **Claim the namespace**, once, from your machine — it must match `publisher` in
   `package.json`:

   ```bash
   npx ovsx create-namespace AkshayDMuley -p <token>
   ```

5. **Add the secret** as `OVSX_PAT`, the same way as `VSCE_PAT` above.

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
- Open VSX is a separate registry with its own version history. Publishing there is part of the
  same tagged release (see the setup section above), but a failure on one registry does not roll
  back the other — check both steps in the workflow run.
