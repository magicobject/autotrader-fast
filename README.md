# Autotrader Fast Search + MOT Check

A Chrome extension for Greg's own car hunting on [autotrader.co.uk](https://www.autotrader.co.uk):

- **Quick sort** buttons above Autotrader's results (Cheapest, Nearest, Lowest miles, Newest, Just listed,
  Best match), plus an optional default order applied to every search that doesn't choose one.
- **Fast table** on search results: every car in the search in one sortable, filterable table, with
  performance, running costs and history filled in, price drops tracked and new cars marked.
- **At a glance** section on each advert, in the page above Autotrader's Overview, so there's no need to
  open "View all spec and features".
- **MOT colours**: a Red/Amber/Green summary of the car's public MOT history from GOV.UK, with a dated
  reason for every concern.

The plain-English guide is [static/help.html](static/help.html); in Chrome, click the extension's icon to
open it. This README is the technical side.

## Install on a computer

You need Node.js 22 or later.

```bash
cd C:\Users\magic\github\autotrader-fast   # or wherever the repo is
npm ci
npm run build
```

Use `npm ci`, not `npm install`. It installs exactly what `package-lock.json` lists and never rewrites
that file. npm on Windows tidies the lockfile differently from npm on Linux, so `npm install` leaves it
modified, and the next `git pull` then refuses to run. If that has already happened,
`git checkout package-lock.json` puts it back. (Use `npm install <package>` only when deliberately adding
or upgrading a dependency.)

Then in Chrome: open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose
the `dist` folder. After pulling changes, run `npm ci` and `npm run build` again and press the ↻ on the
extension's card.

`npm run package` also writes `autotrader-fast-<version>.zip` (the contents of `dist/`) for passing on.

## How it works

| Part              | File                                                                   | Runs in                                            |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| Page hook         | `src/autotrader/pageHook.ts`                                           | Autotrader's own page world, from `document_start` |
| Content script    | `src/autotrader/contentScript.ts` → `searchTable.ts`, `advertPanel.ts` | Every Autotrader page (isolated world)             |
| GOV.UK summary    | `src/mot/motResultsPage.ts`                                            | GOV.UK MOT results pages                           |
| Background worker | `src/background/serviceWorker.ts` (help page, cache tidying)           | Extension service worker                           |

- **Search data.** Autotrader's results page loads listings from its own gateway
  (`/at-gateway?opname=SearchResultsListingsGridQuery`). The page hook wraps `window.fetch`, passes each
  results response to the content script (via `window.postMessage`), and for **Load all pages** replays
  the page's own last request with the page number changed, one page every 0.6 s, until a page has no
  cars or the limit is reached. `searchRequest.ts` and `searchListings.ts` validate that data.
- **Advert data.** Advert pages embed their data as `window.__staticRouterHydrationData`. `advertDetails.ts`
  extracts and validates it, from the open page or by fetching `/car-details/<id>` (two at a time,
  0.35 s apart). The data is only used when its `advertData.id` matches the advert asked for (after
  in-app navigation the open page can still hold the previous advert's data); if Autotrader ever stops
  sending that id, every advert will fail to load and `lookUpAdvertFromHtml` is where to change it.
- **Quick sort.** `quickSortBar.ts` sets Autotrader's own `sort` address parameter (values in `sortOrders.ts`,
  taken from the live "Filter and sort" dialog), so the sorting is done by Autotrader across the whole
  search. A default order is stored in `chrome.storage.local`; a search with no `sort` is redirected once
  (the tab's `sessionStorage` remembers it, so it can never loop; the same memory means a search Greg deliberately
  sets back to Best match in Autotrader's own dialog isn't re-sorted in that tab). A default of Best match
  needs no redirect: it is Autotrader's own order.
- **Registration.** Autotrader's data never includes the reg. `findRegistrationInDescription` looks for one
  in the seller's description; otherwise the person types it.
- **MOT history.** GOV.UK's MOT service sits behind bot protection (Imperva): a request that isn't from a
  person's own browser tab gets a "Pardon Our Interruption" page, so the extension never fetches it and
  must not try to get round that. **Check on GOV.UK** opens
  `https://www.check-mot.service.gov.uk/results?registration=<REG>&checkRecalls=true` (the address the
  GOV.UK form submits to) in a new tab. The content script there (`motResultsPage.ts`) reads the page by its
  `data-test-id` attributes (`motHistoryParser.ts`), applies the rules below (`motHistoryAnalysis.ts`),
  shows the card and saves the summary; the advert's section is listening (`onMotSummarySaved`) and shows
  it too. For automatic or bulk MOT checks, the sanctioned route is DVSA's MOT History API (free, needs
  an API key); not used yet.
- **At a glance** is a `<details>` section inserted before Autotrader's `overview` section (`placeForPanel`),
  re-inserted if Autotrader's page redraws it, and floating only if that layout isn't found.
- **Messages** between the parts are discriminated unions validated with zod (`src/shared/messages.ts`);
  window messages can come from any script on the page, so nothing is trusted unvalidated.
- **Storage** (`src/shared/storage.ts`) is `chrome.storage.local` only, with versioned keys and a schema
  check on every read: advert details for 3 days, MOT summaries for 30 days (expired ones are removed
  when the browser starts), prices until a car hasn't been seen for 120 days. Typed registrations are kept.

## The MOT colours

Single source: `MOT_RULES` and the word lists at the top of `src/mot/motHistoryAnalysis.ts`.
`test/documentation.test.ts` checks this section and the help page still quote its numbers.

**Red**: no valid MOT for more than 90 days between tests; no MOT tests at all on a car over 3 years old;
mileage going down by more than 50 miles between tests, or the advert showing more than 50 miles fewer than
the last MOT; corrosion that failed a test or is on structural parts or brake/fuel pipes; a dangerous defect
on anything that isn't a consumable; or an MOT record for a different make. Defect rules look at the
last 4 years.

**Amber**: a lapse of 31 to 90 days or an expired MOT; a first MOT more than 90 days after the car turned 3
(could be an import or a Northern Ireland car); a stretch of very uneven mileage (3 times above or below the
car's typical yearly miles, and at least 5,000 miles a year different, over stretches of half a year or
more); corrosion advisories; failures on non-consumables, non-consumable advisories on the latest test, and
items not fixed by the next test; dangerous consumables.

**Green**: otherwise. Consumables are tyres, brake pads and discs, wipers and washers, bulbs, lamps,
indicators and reflectors, number plates, the horn, the windscreen and mirrors.

## Developing

```bash
npm test           # type check (strict), unit and interface tests (vitest + jsdom + axe-core), then build
npm run test:e2e   # loads the built extension into Chrome against made-up pages (Playwright)
npm run audit      # npm audit, high and above
```

The pre-push hook runs all three. `test:e2e` runs in Playwright's own Chromium (pinned to the same
Playwright version as echo, so browsers already downloaded on Greg's machine are reused; otherwise run
`npx playwright install chromium` once). Branded Google Chrome can't be used: since version 137 it refuses
to load unpacked extensions from the command line. To use another Chromium-based browser, set
`CHROME_PATH`. It serves the fixture pages, including GOV.UK's, through Playwright routes. Tests use made-up data shaped like the live sites (see `test/fixtures/`);
nothing in the test suite contacts Autotrader or GOV.UK.

**After a change that touches the pages' data**, check by hand on the live sites with the built extension:
a search (table fills, **Load all pages**, **Get specs**), an advert (panel fills), and an MOT check. The
two sites can change without notice; when they do, the fix is almost always in `searchRequest.ts`,
`searchListings.ts`, `advertDetails.ts` or `motHistoryParser.ts`.

## Releases

Each change gets an entry at the top of [CHANGELOG.md](CHANGELOG.md) (`YYYY.MM.DD.NNN`, author from
[users.json](users.json)) and the merge commit is tagged `build-YYYY.MM.DD.NNN`. The extension's version
number is `package.json`'s `version`, copied into the manifest by the build.
