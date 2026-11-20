# Autotrader Fast Search + MOT Check: rules for working in this repo

Greg's global `~/.claude/CLAUDE.md` applies; this file adds what is specific to this extension.

## What it is
A Chrome extension (Manifest V3) for Greg's own use, loaded unpacked from `dist/`. Not published to the
Chrome Web Store and not a MediaWright product: keep the repo private, and don't name it publicly.
It reads Autotrader's pages as Greg browses them, at a gentle pace; keep it that way (no background
crawling, no scheduled scraping, no sharing the data), because Autotrader's terms limit use of their
content to personal, non-commercial use.
GOV.UK's MOT service is behind bot protection: never fetch it from the extension or work around that
protection. MOT pages are opened by Greg in a tab; the content script there reads the page he sees.

## Single sources of truth
- MOT rules: `MOT_RULES` and the word lists in `src/mot/motHistoryAnalysis.ts`. README.md ("The MOT
  colours") and `static/help.html` describe them in plain English; change all three together.
  `test/documentation.test.ts` fails if the numbers drift.
- Colours: the tokens at the top of `static/styles.css`, with each pairing's ratio recorded beside them
  and checked by `test/contrast.test.ts`.
- Version: `package.json` `version`; the build copies it into `dist/manifest.json`.
- Shapes of outside data: the zod schemas in `searchRequest.ts`, `searchListings.ts`, `advertDetails.ts`
  and the parser in `motHistoryParser.ts`. Nothing else reads Autotrader or GOV.UK data directly.

## Code standards
Strict TypeScript (see `tsconfig.json`; don't weaken it), zod (`zod/mini`, which keeps the bundles
small) at every boundary: window messages, runtime messages, gateway and page data, and storage reads.
Names say what things hold. `scripts/*.mjs` stay plain JavaScript (build tooling).
Interface code builds DOM with `createElement` in `src/shared/dom.ts`, never `innerHTML`, because it
runs inside other sites' pages.

## Before pushing
`npm test` (type check, vitest, build), `npm run test:e2e` (the built extension in Chrome against
fixture pages) and `npm run audit`; the pre-push hook runs all three. If the change
touches how live pages are read, also do the manual check in README.md ("Developing") with the built
extension and say in the PR that you did.

## Changelog
`CHANGELOG.md`, newest first, one entry per build (`YYYY.MM.DD.NNN` · author from `users.json` · date),
linking every file the change touched that a reader would open. Tag the merge commit
`build-YYYY.MM.DD.NNN` and push the tag. Bump `package.json` `version` for any change Greg would notice.
