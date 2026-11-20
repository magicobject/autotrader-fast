# Changelog

Every build, newest first. Each entry is tagged `build-<build>` in git.

## 2026.11.20.004 · Greg Wright · 20 Nov 2026

At a glance moves into the advert page, and the MOT check now works (version 1.2.0).

- **At a glance** now sits in the advert itself, just above Autotrader's "Overview", instead of floating over the description, and folds up by clicking its title ([src/autotrader/advertPanel.ts](src/autotrader/advertPanel.ts), [static/styles.css](static/styles.css)).
- **MOT check:** every check said "No MOT record found" because GOV.UK's bot protection sends a "Pardon Our Interruption" page to anything but a person's own browser tab. **Check on GOV.UK** now opens the history in a new tab, and the summary appears both there and back on the advert (its colour also beside the At a glance title), kept for a month. A summary checked against a different advertised mileage says so ([src/mot/motResultsPage.ts](src/mot/motResultsPage.ts), [src/shared/storage.ts](src/shared/storage.ts)). The background fetching, the table's bulk **MOT check** button and the extension's GOV.UK host permission are gone ([static/manifest.json](static/manifest.json), [src/background/serviceWorker.ts](src/background/serviceWorker.ts)).
- [Help page](static/help.html#advert), [README.md](README.md) and [CLAUDE.md](CLAUDE.md) updated.

## 2026.11.20.003 · Greg Wright · 20 Nov 2026

The end-to-end tests now run on Windows. They had looked for Chrome at a Linux path (`/usr/bin/google-chrome`) and failed on Greg's PC before any test ran. They now use Playwright's own Chromium (branded Chrome no longer loads unpacked extensions), with Playwright pinned to 1.65.0 like echo so the browsers already downloaded are reused. `CHROME_PATH` still selects another browser. See [test/e2e/extension.spec.ts](test/e2e/extension.spec.ts), [playwright.config.ts](playwright.config.ts) and [README.md](README.md#developing).

## 2026.11.20.002 · Greg Wright · 20 Nov 2026

One-click sorting on Autotrader's search results (version 1.1.0).

- A **quick sort** row above the results: Cheapest, Nearest, Lowest miles, Newest, Just listed and Best match, each one click instead of going through "Filter and sort" ([src/autotrader/quickSortBar.ts](src/autotrader/quickSortBar.ts), [src/autotrader/sortOrders.ts](src/autotrader/sortOrders.ts)).
- **My default sort** (a star toggle) sorts every search that doesn't choose its own order ([src/shared/storage.ts](src/shared/storage.ts)).
- Described on the [help page](static/help.html#quick-sort) and in [README.md](README.md); styles in [static/styles.css](static/styles.css).

## 2026.11.20.001 · Greg Wright · 20 Nov 2026

The first version of the extension, rebuilt in TypeScript from the prototype made the same morning.

- **Search results:** a fast table of every car in a search (Load all pages), sortable by any column and filtered by price, miles, year, power, words, trade-only, new since last visit and price drops. **Get specs** fills in performance, running costs and history from each advert. Price changes are tracked from the first time you see a car. Download as CSV.
- **Adverts:** an "At a glance" panel with performance, running costs, history and the price history you've seen.
- **MOT history:** a Red/Amber/Green summary with a dated reason for each concern, on the advert panel and at the top of the GOV.UK MOT history page. The rules are in [README.md](README.md#the-mot-colours) and the [help page](static/help.html).
- Plain-English [help page](static/help.html), opened by clicking the extension's icon.
