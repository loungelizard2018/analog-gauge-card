# Publishing a release

1. Ensure the HACS validation workflow is green on `main`.
2. Create a GitHub release named `v4.1.3` from the `main` branch.
3. Use `release-notes/v4.1.3.md` or the relevant section from `CHANGELOG.md` as the release notes.
4. No separate binary asset is required: HACS reads `dist/analog-gauge-card.js` and the assets in `dist/` from the release source archive.

For subsequent versions:

1. Update the runtime version in `dist/analog-gauge-card.js` when JavaScript changes.
2. Update `package.json`.
3. Add a section to `CHANGELOG.md`.
4. Commit and push.
5. Create a full GitHub release, not only a tag.
