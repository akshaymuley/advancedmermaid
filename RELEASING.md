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

**Not set up yet, and blocked.** As of 2026-07-31 the namespace does not exist
(`https://open-vsx.org/api/-/namespace/AkshayDMuley` returns 404) and no `OVSX_PAT` secret is
configured, so nothing has been published there. Registration is stalled on Eclipse account
creation. Because of the no-backfill rule above, **this must be finished before the next version
bump** if v1.1.0 is to reach VSCodium, Cursor, Gitpod, and Windsurf at all.

1. **Create an Eclipse account** at [accounts.eclipse.org](https://accounts.eclipse.org), and set
   the **GitHub Username** field in your profile to your GitHub handle. Open VSX identifies you by
   that mapping; leave it blank and you can still log in and mint a token, and publishing fails
   later with what looks like a permissions error.
2. **Sign in** at [open-vsx.org](https://open-vsx.org) with GitHub.
3. **Sign the Eclipse Foundation Publisher Agreement.** Profile → *Publisher Agreement*. This is
   the step that bites: the token authenticates fine without it and publishing still fails.
4. **Create an access token** from your profile → *Access Tokens*. Copy it; shown once.
5. **Claim the namespace**, once, from your machine — it must match `publisher` in
   `package.json`:

   ```bash
   npx ovsx create-namespace AkshayDMuley -p <token>
   ```

6. **Verify before trusting it.** This is the check that catches steps 1 and 3 having been missed,
   at a point where the fix is still free:

   ```bash
   npx ovsx verify-pat AkshayDMuley -p <token>
   ```

7. **Add the secret** as `OVSX_PAT`, the same way as `VSCE_PAT` above (`gh secret set OVSX_PAT`
   prompts for the value, which keeps the token out of your shell history).

## Each release

0. **If Open VSX matters for this version, register *first*.** Open VSX does not backfill: only
   tags pushed after `OVSX_PAT` exists ever appear there, and a version number can never be
   republished. Check with `gh secret list` — if `OVSX_PAT` isn't there, either complete the setup
   below or accept that this version stays Marketplace-only, permanently.
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
