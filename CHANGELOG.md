# Changelog

Every build, newest first. Each entry is tagged `build-<build>` in git.

## 2026.11.20.001 · Greg Wright · 20 Nov 2026

The first version of the extension, rebuilt in TypeScript from the prototype made the same morning.

- **Search results:** a fast table of every car in a search (Load all pages), sortable by any column and filtered by price, miles, year, power, words, trade-only, new since last visit and price drops. **Get specs** fills in performance, running costs and history from each advert. Price changes are tracked from the first time you see a car. Download as CSV.
- **Adverts:** an "At a glance" panel with performance, running costs, history and the price history you've seen.
- **MOT history:** a Red/Amber/Green summary with a dated reason for each concern, on the advert panel and at the top of the GOV.UK MOT history page. The rules are in [README.md](README.md#the-mot-colours) and the [help page](static/help.html).
- Plain-English [help page](static/help.html), opened by clicking the extension's icon.
