# Changelog

Every build, newest first. Each entry is tagged `build-<build>` in git.

## 2026.11.20.002 · Greg Wright · 20 Nov 2026

One-click sorting on Autotrader's search results (version 1.1.0).

- A **quick sort** row above the results: Cheapest, Nearest, Lowest miles, Newest, Just listed and Best match, each one click instead of going through "Filter and sort" ([src/autotrader/quickSortBar.ts](src/autotrader/quickSortBar.ts), [src/autotrader/sortOrders.ts](src/autotrader/sortOrders.ts)).
- **Make this my default** sorts every search that doesn't choose its own order ([src/shared/storage.ts](src/shared/storage.ts)).
- Described on the [help page](static/help.html#quick-sort) and in [README.md](README.md); styles in [static/styles.css](static/styles.css).

## 2026.11.20.001 · Greg Wright · 20 Nov 2026

The first version of the extension, rebuilt in TypeScript from the prototype made the same morning.

- **Search results:** a fast table of every car in a search (Load all pages), sortable by any column and filtered by price, miles, year, power, words, trade-only, new since last visit and price drops. **Get specs** fills in performance, running costs and history from each advert. Price changes are tracked from the first time you see a car. Download as CSV.
- **Adverts:** an "At a glance" panel with performance, running costs, history and the price history you've seen.
- **MOT history:** a Red/Amber/Green summary with a dated reason for each concern, on the advert panel and at the top of the GOV.UK MOT history page. The rules are in [README.md](README.md#the-mot-colours) and the [help page](static/help.html).
- Plain-English [help page](static/help.html), opened by clicking the extension's icon.
