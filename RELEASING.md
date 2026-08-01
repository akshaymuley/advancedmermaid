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

**Working since 2026-08-01.** The `AkshayDMuley` namespace exists, the PAT is verified, the
`OVSX_PAT` secret is configured, and **v2.0.0 published successfully to both registries** — the
first version to reach Open VSX at all. The steps below are kept for the next time this has to be
done, and because two of them fail silently.

> **Check the namespace with `https://open-vsx.org/api/AkshayDMuley`, not
> `https://open-vsx.org/api/-/namespace/AkshayDMuley`.** The second returns 404 whether or not the
> namespace exists. This file recommended it for weeks, which is why registration looked incomplete
> long after it wasn't. A namespace that exists answers `200` with
> `{"name":"AkshayDMuley","extensions":{…},"verified":false,"access":"restricted"}` — and
> `verified: false` is normal, an ownership badge rather than a permission to publish.

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

0. **Run the Release readiness workflow** (Actions → *Release readiness* → *Run workflow*). It
   reports whether a workflow actually resolves `VSCE_PAT` and `OVSX_PAT`, whether either carries
   stray whitespace, and whether the Open VSX namespace exists.
   This exists because `gh secret list` cannot answer the question that matters. Both publish steps
   in `release.yml` are gated on `if: env.X != ''`, so a secret that is misnamed, empty, or added
   as an Environment secret rather than an Actions repository secret does not fail the release —
   it **silently skips**. Open VSX does not backfill and a version number can never be
   republished, so a skip costs that version permanently.
   The workflow still cannot prove the token is *accepted*; only `npx ovsx verify-pat` can, and
   that needs the token itself.
1. Confirm the extension actually works in a real VS Code — `npm run test:integration`, plus an
   F5 pass over anything that changed visually.
2. Bump `version` in `package.json`.
3. Move the `[Unreleased]` items in `CHANGELOG.md` under the new version, add the date, and
   update the link definitions at the bottom.
4. Commit and merge to `main`.
5. Tag and push:

   ```bash
   git tag v2.0.0
   git push origin v2.0.0
   ```

6. Watch the **Release** workflow. It refuses to run if the tag doesn't match
   `package.json` — that mismatch is the most common release mistake and it's cheaper to catch
   in CI than on the Marketplace.
   Check that **both** publish steps *ran* rather than being skipped. They are gated on
   `env.X != ''`, so a missing secret leaves the run green with nothing published.

7. **Confirm both registries actually serve the new version — and poll, don't check once.**
   Both lag behind a successful publish, and both look like a failed release while they do. At
   v2.0.0, Open VSX returned 404 for about a minute after printing `🚀 Published`, and the
   Marketplace kept serving the previous version for roughly five minutes.

   ```bash
   # Open VSX
   curl -s https://open-vsx.org/api/AkshayDMuley/advanced-mermaid | head -c 200

   # Marketplace — `vsce show` reads a cache that lags further; the gallery API is straighter
   curl -s -X POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery \
     -H 'Accept: application/json;api-version=7.2-preview.1' -H 'Content-Type: application/json' \
     -d '{"filters":[{"criteria":[{"filterType":7,"value":"AkshayDMuley.advanced-mermaid"}]}],"flags":403}'
   ```

8. **Install it from the registry and open one comparison.** Everything before this proves the
   artifact; only this proves it works once installed rather than sideloaded from a local `.vsix`.

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
