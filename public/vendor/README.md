# Vendored browser libraries

These files are served by `express.static` from `public/` and loaded by `public/index.html`.
They are vendored instead of loaded from a CDN so the exact bytes are pinned and reviewed,
and so the app works offline on localhost.

| File | Package | Version | Source in npm tarball | SHA-256 |
|---|---|---|---|---|
| `marked-13.0.3.min.js` | marked | 13.0.3 | `marked.min.js` | `5adea7d8ee41a700fccc14bb9d503104f0470cc17a84ad3e167d3f5251eae0da` |
| `purify-3.5.0.min.js` | dompurify | 3.5.0 | `dist/purify.min.js` | `f69a46022ab1f53e969c8ebbca98172c8995785a9b3be72ea4a12d25b1a1bf67` |

`test/render-sanitize.test.js` checks these hashes, so a changed file fails the tests.

## Updating

1. `npm pack marked@<version>` and `npm pack dompurify@<version>` in a scratch folder.
2. Copy the files above out of the tarballs, rename with the new version, and update the
   `<script>` tags in `public/index.html`.
3. Update the table and the hashes in the test (`sha256sum public/vendor/*.js`).
