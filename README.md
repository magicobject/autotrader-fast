# Autotrader Fast Search + MOT Check

A Chrome extension for Greg's own car hunting on [autotrader.co.uk](https://www.autotrader.co.uk):

- **Fast table** on search results: every car in the search in one sortable, filterable table, with
  performance, running costs and history filled in, price drops tracked and new cars marked.
- **At a glance** panel on each advert, so there's no need to open "View all spec and features".
- **MOT colours**: a Red/Amber/Green summary of the car's public MOT history from GOV.UK, with a dated
  reason for every concern.

The plain-English guide is [static/help.html](static/help.html); in Chrome, click the extension's icon to
open it. This README is the technical side.

## Install on a computer

You need Node.js 22 or later.

```bash
cd C:\Users\magic\github\autotrader-fast   # or wherever the repo is
npm install
npm run build
```

Then in Chrome: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose
the `dist` folder. After pulling changes, run `npm run build` again and press the ↻ on the extension's card.

`npm run package` also writes `autotrader-fast-<version>.zip` (the contents of `dist/`) for passing on.

## How it works

| Part | File | Runs in |
|---|---|---|
| Page hook | `src/autotrader/pageHook.ts` | Autotrader's own page world, from `document_start` |
| Content script | `src/autotrader/contentScript.ts` → `searchTable.ts`, `advertPanel.ts` | Every Autotrader page (isolated world) |
| GOV.UK summary | `src/mot/motResultsPage.ts` | GOV.UK MOT results pages |
| Background worker | `src/background/serviceWorker.ts` | Extension service worker |

- **Search data.** Autotrader's results page loads listings from its own gateway
  (`/at-gateway?opname=SearchResultsListingsGridQuery`). The page hook wraps `window.fetch`, passes each
  results response to the content script (via `window.postMessage`), and for **Load all pages** replays
  the page's own last request with the page number changed, one page every 0.6 s, until a page has no
  cars or the limit is reached. `searchRequest.ts` and `searchListings.ts` validate that data.
- **Advert data.** Advert pages embed their data as `window.__staticRouterHydrationData`. `advertDetails.ts`
  extracts and validates it, from the open page or by fetching `/car-details/<id>` (two at a time,
  0.35 s apart).
- **Registration.** Autotrader's data never includes the reg. `findRegistrationInDescription` looks for one
  in the seller's description; otherwise the person types it.
- **MOT history.** The background worker fetches
  `https://www.check-mot.service.gov.uk/results?registration=<REG>&checkRecalls=true` (the address the
  GOV.UK form submits to, so no form is filled in). `motHistoryParser.ts` reads it by its `data-test-id`
  attributes; `motHistoryAnalysis.ts` applies the rules below.
- **Messages** between the parts are discriminated unions validated with zod (`src/shared/messages.ts`);
  window messages can come from any script on the page, so nothing is trusted unvalidated.
- **Storage** (`src/shared/storage.ts`) is `chrome.storage.local` only, with versioned keys and a schema
  check on every read: advert details for 3 days, MOT summaries for 12 hours, prices until a car hasn't
  been seen for 120 days.

## The MOT colours

Single source: `MOT_RULES` and the word lists at the top of `src/mot/motHistoryAnalysis.ts`.
`test/documentation.test.ts` checks this section and the help page still quote its numbers.

**Red**: no valid MOT for more than 90 days between tests; mileage going down, or the advert showing fewer
miles than the last MOT; corrosion that failed a test or is on structural parts or brake/fuel pipes; a
dangerous defect on anything that isn't a consumable; or an MOT record for a different make. Defect rules
look at the last 4 years.

**Amber**: a lapse of 31 to 90 days or an expired MOT; a stretch of very uneven mileage (3 times above or
below the car's typical yearly miles, and at least 5,000 miles a year different); corrosion advisories;
failures on non-consumables, non-consumable advisories on the latest test, and items not fixed by the next
test; dangerous tyres or brakes.

**Green**: otherwise. Consumables are tyres, brake pads and discs, wipers, washers, bulbs and lights.

## Developing

```bash
npm test           # type check (strict), unit and interface tests (vitest + jsdom + axe-core), then build
npm run test:e2e   # loads the built extension into Chrome against made-up pages (Playwright)
npm run audit      # npm audit, high and above
```

The pre-push hook runs all three. `test:e2e` needs a Chrome that still allows `--load-extension`
(Chrome for Testing, or Chromium; branded Chrome stopped allowing it in version 137): set `CHROME_PATH`
if it isn't at `/usr/bin/google-chrome`. It serves the fixture pages through Playwright routes,
including the background worker's GOV.UK request. Tests use made-up data shaped like the live sites (see `test/fixtures/`);
nothing in the test suite contacts Autotrader or GOV.UK.

**After a change that touches the pages' data**, check by hand on the live sites with the built extension:
a search (table fills, **Load all pages**, **Get specs**), an advert (panel fills), and an MOT check. The
two sites can change without notice; when they do, the fix is almost always in `searchRequest.ts`,
`searchListings.ts`, `advertDetails.ts` or `motHistoryParser.ts`.

## Releases

Each change gets an entry at the top of [CHANGELOG.md](CHANGELOG.md) (`YYYY.MM.DD.NNN`, author from
[users.json](users.json)) and the merge commit is tagged `build-YYYY.MM.DD.NNN`. The extension's version
number is `package.json`'s `version`, copied into the manifest by the build.
