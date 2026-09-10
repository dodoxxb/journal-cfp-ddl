# Journal CFP Deadlines 📚

Bilingual (EN/ZH) web app for tracking academic journal **Call for Papers** deadlines, with SJR quartile / H-index enrichment. Inspired by [ccf-deadlines](https://github.com/ccfddl/ccf-deadlines) and [ShowJCR](https://github.com/HopeGhost/ShowJCR).

**🌐 Live site: <https://dodoxxb.github.io/journal-cfp-ddl/>** · Source: <https://github.com/dodoxxb/journal-cfp-ddl>

> **Data snapshot** — generated `2026-09-08` · **63,613** CFPs · **13** publishers · **15** disciplines · 6-month window · 38 monthly shards (28 MB)

| | |
|---|---|
| Top publishers | MDPI 53,323 (83.8%) · Springer 3,249 (5.1%) · Frontiers 3,063 (4.8%) · Elsevier 2,280 (3.6%) · Nature 999 (1.6%) |
| Top disciplines | Medicine & Health 18,459 · Computer Science 17,320 · Engineering 10,924 · Life Sciences 4,878 |
| CFP types | Special Issue 58,067 (91.3%) · Research Topic 4,117 · Collection 999 · Call for Papers 430 |
| Rolling (no deadline) | 2,235 |

## Features

- ⚡ **Sharded lazy loading** — the frontend never downloads the full dataset. It fetches `index.json` (≈3 KB) plus the current month and next 2 months on first paint, then appends 2 more months per "load more" click. This replaced an earlier version that fetched a single 108 MB JSON and crashed the tab.
- 🔍 **Search** — debounced (250 ms) across title, journal, publisher, category and tags; all tokens must match
- 🎛️ **Multi-select facets** — publisher, discipline, CFP type, and SJR quartile (Q1–Q4), each with live counts
- ⏱️ **Time-range filter** — all / 7 days / 30 days / 90 days
- ↕️ **Sorting** — by deadline, journal or publisher, ascending or descending; expired entries always sink to the bottom when sorting by deadline
- 📄 **Pagination** — 30 cards per page with ellipsis-style page navigation
- 🔗 **Shareable state** — the entire filter/search/sort state is serialized into the URL query string, so any view can be bookmarked or shared
- ⏰ **Urgency coding** — a left color stripe and countdown pill driven by days remaining (≤3 d critical, ≤7 d soon, rolling, expired)
- 📊 **SJR metrics** — quartile / SJR / H-index / OA badges joined by ISSN from SCImago (free tier, not Clarivate JCR)
- ♾️ **Rolling CFPs** — journals without a fixed deadline live in a dedicated `rolling` shard
- 🌙 **Dark mode** — manual toggle, `class`-based, persisted
- 📱 **Responsive** — single column below 640 px

## Quick start

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # tsc --noEmit + Vite production build
npm run preview    # Preview the production build
npm test           # Vitest (25 tests)
npm run lint       # ESLint
```

### Rebuilding the dataset

The frontend reads pre-built JSON from `public/data/`. To regenerate it from the local data lake:

```bash
pip install -r scripts/requirements.txt

# data lake (data/cfp_by_publisher/open/) → public/data/ shards
python scripts/build_site_data.py --window 6      # 6-month window (current setting)
python scripts/build_site_data.py --dry-run       # stats only, writes nothing

# SCImago metrics → public/data/journal_meta.json (SJR quartile join)
python scripts/enrich_journal_meta.py
```

**Windows note:** use `F:/Python/python.exe` (3.8.10) for the crawlers — `wiley.py` and `mdpi.py` need Playwright, which is installed against that interpreter.

## Data pipeline

```
crawlers  →  data/cfp_by_publisher/open/<publisher>/<slug>.json   (data lake, 329 MB, git-ignored)
           ↓  scripts/build_site_data.py
           →  public/data/index.json        shard index + facet counts + rolling count
           →  public/data/shards/YYYY-MM.json   one file per deadline month + rolling.json
           →  public/data/journal_meta.json SJR metrics keyed by 8-digit ISSN
           ↓
           →  deployed to GitHub Pages
```

`build_site_data.py` is **idempotent** — the same input always yields the same output. It flattens the lake, deduplicates globally by CFP link (merging participating journals), applies the time window, truncates descriptions, infers a discipline for each entry, and emits short field names to keep the payload small. Default window is 6 months (`--window N` to override).

Design rule: **frontend stability first.** The build deliberately drops data rather than risk a slow or crashing page.

### Frontend data contract

`public/data/index.json`:

```json
{
  "generated_at": "2026-09-08T09:22:48Z",
  "window_months": 6,
  "cutoff": "2026-03-10T09:22:48Z",
  "total": 63613,
  "rolling_count": 2235,
  "publishers": [{ "name": "MDPI", "count": 53323 }],
  "categories": [{ "name": "Computer Science", "count": 17320 }],
  "types":      [{ "name": "special_issue", "count": 58067 }],
  "months":     [{ "name": "2026-09", "file": "shards/2026-09.json", "count": 6609 }]
}
```

Each record in `shards/YYYY-MM.json` uses abbreviated keys:

| Key | Meaning | Key | Meaning |
|-----|---------|-----|---------|
| `id` | unique id | `u` | source URL |
| `t` | title | `ty` | CFP type |
| `j` | journal | `c` | discipline |
| `p` | publisher | `ad` | abstract deadline (often empty) |
| `d` | deadline `YYYY-MM-DD` | `g` | tags |
| `dt` | deadline ISO timestamp | `x` | description |
| `jn` | participating journal count | `is` | ISSN (8-digit, for metric join) |
| `js` | participating journal names | `rolling` | no fixed deadline |

## Publisher crawlers

| Publisher | CFPs | Crawler | Method | Lake dir |
|-----------|-----:|---------|--------|----------|
| MDPI | 53,323 | `mdpi.py` | Playwright **headed** | `mdpi/` |
| Springer | 3,249 | `springer.py` | requests + BS4 | `springer/` |
| Frontiers | 3,063 | `frontiers.py` | requests + BS4 | `frontiers/` |
| Elsevier | 2,280 | `elsevier.py` | requests + BS4 / Playwright | `elsevier/` |
| Nature Portfolio | 999 | `nature.py` | requests + BS4 | `springer_nature/` |
| Emerald Publishing | 314 | `emerald.py` | requests + BS4 | `emerald/` |
| Wiley | 232 | `wiley.py` + `wiley_batch.py` | Playwright **headed** | `wiley/` |
| RSC | 84 | `extra_sources.py` → `crawl_rsc()` | requests + BS4 | `rsc/` |
| IEEE | 39 | `ieee.py`, `ieee_societies.py` | requests + BS4 | `ieee/` |
| UPenn CFP Aggregator | 12 | `extra_sources.py` | requests + BS4 | `upenn/` |
| FEBS Press | 11 | `febs.py` | Playwright (Wiley profile) | `febs/` |
| ACS | 4 | `extra_sources.py` → `crawl_acs()` | requests + BS4 | `acs/` |
| OUP | 3 | `extra_sources.py` → `crawl_oup()` | requests + BS4 | `oup/` |

Notes:

- **MDPI and Wiley require a headed browser.** MDPI's Akamai CDN and Wiley's Cloudflare both block headless Chromium and plain HTTP requests.
- **`wiley_batch.py`** drives the full Wiley catalogue in resumable 250-journal batches (state in `data/wiley_crawl_state.json`). The completed run covered **2,324 / 2,324** journals; 139 exposed a CFP. Wiley CFP pages appear under two URL shapes (`.../homepage/call-for-papers` and `.../homepage/call_for_papers`), so when the direct path misses, the crawler opens the journal homepage and regex-matches `call[-_ ]?for[-_ ]?papers?` on every anchor.
- **`acm.py`, `cambridge.py`, `taylorfrancis.py`** exist but currently contribute no records (no ACM / Cambridge / T&F entries in the lake).

## Project structure

```
journal-cfp-ddl/
├── src/
│   ├── App.tsx              # Main component (~1000 lines: header, stats, filters, list, pagination)
│   ├── main.tsx             # Entry point
│   ├── index.css            # Tailwind layers + GitHub Primer design tokens
│   ├── hooks/               # useTheme, useNow, useDebounce
│   ├── lib/
│   │   ├── types.ts         # CFPRecord, CfpIndex, CfpFilterState, JournalMetric …
│   │   ├── dataLoader.ts    # shard fetch + cache + month selection
│   │   ├── filters.ts       # pure filter / sort / stats / facet functions
│   │   ├── urlState.ts      # filter state ⇄ URL query string
│   │   ├── constants.ts     # debounce, tick, month-span, page size
│   │   └── utils.ts
│   └── test/                # Vitest: App, types, utils
├── scripts/
│   ├── build_site_data.py       # ⭐ data lake → public/data shards (current)
│   ├── enrich_journal_meta.py   # SCImago join → journal_meta.json
│   ├── wiley_batch.py           # resumable full-catalogue Wiley crawl
│   ├── session_manager.py       # anti-bot session capture / cookie export
│   ├── check_data.py / validate_cfp_schema.py / analyze_lake.py
│   └── crawlers/                # one module per publisher + extra_sources.py
├── _archived/                   # retired files, moved here rather than deleted
│   ├── legacy-frontend-data/    # pre-Vite public/index.html, css/, js/
│   ├── legacy-converter/        # build_frontend.py, build_data.py
│   ├── legacy-scraper/          # cfp_sync_playwright.py, unified_extractor.py
│   ├── legacy-scripts/          # one-off migrations
│   └── misc/                    # debug probes
├── data/
│   ├── cfp_by_publisher/open/<publisher>/*.json   # full data lake (329 MB, git-ignored)
│   ├── scimago*.csv + scimago_*.json              # local only, git-ignored
│   └── wiley_crawl_state.json                     # local only, git-ignored
├── public/data/
│   ├── index.json
│   ├── journal_meta.json
│   └── shards/                  # 38 files, 28 MB
└── .github/workflows/
    ├── deploy.yml           # scheduled crawl + Pages deploy
    └── frontend-ci.yml      # lint + tsc + test + build
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite 5 |
| Styling | Tailwind CSS 3, lucide-react icons, GitHub Primer colour tokens |
| Testing | Vitest 4, @testing-library/react, jsdom |
| Crawlers | Python 3, requests, BeautifulSoup 4, Playwright 1.48 (Chromium) |
| Metrics | SCImago Journal Rank CSV (free tier), joined by ISSN |
| Data format | Per-journal JSON in the lake; sharded short-key JSON for the site |
| CI/CD | GitHub Actions → GitHub Pages |

No router, no state-management library, no component library, no chart library.

## Two folders: local workspace vs GitHub release

This repo is the **local workspace**. It intentionally holds things that must never reach GitHub — the 329 MB data lake, SCImago source CSVs, anti-bot browser sessions, and archived leftovers.

The pushable copy is generated into a **separate folder** by a whitelist-driven script:

```bash
python scripts/make_release.py                    # → ../journal-cfp-ddl-github
python scripts/make_release.py --target D:/x      # custom location
python scripts/make_release.py --dry-run          # show what would be copied
```

| | Local workspace (`journal-cfp-ddl`) | Release (`journal-cfp-ddl-github`) |
|---|---|---|
| `data/` data lake (329 MB) | ✅ | ❌ |
| `_archived/`, `.workbuddy/`, `data/sessions/` | ✅ | ❌ |
| `node_modules/`, `dist/` | ✅ | ❌ (rebuilt in CI) |
| `src/`, `public/data/`, `scripts/`, `docs/`, `.github/` | ✅ | ✅ |

Only paths on the script's whitelist are copied, so a newly added large file can never sneak into a push. The generated `RELEASE-MANIFEST.json` records what was exported and when.

Typical loop:

```bash
# 1. workspace: crawl → curate → rebuild shards
python scripts/build_site_data.py --window 6

# 2. export
python scripts/make_release.py

# 3. verify in the release folder
cd ../journal-cfp-ddl-github && npm install && npm run build

# 4. push
git add -A && git commit -m "Update CFP data 2026-09-09" && git push
```

## CI/CD

**Data generation is a local, manual step — CI never runs crawlers.** Three reasons: the data lake is git-ignored (so anything CI crawled would be discarded), MDPI and Wiley need a headed browser to pass their bot challenges, and `public/data/` is a curated artifact you should eyeball before shipping.

- **`frontend-ci.yml`** — on push/PR to `main`/`master`: ESLint → `tsc --noEmit` → Vitest → `npm run build`, then verifies `dist/assets/` exists and that `dist/index.html` uses **relative** asset paths (a regression guard for the Pages subpath).
- **`deploy.yml`** — on push to `main`/`master` or `workflow_dispatch`: verifies `public/data/` is present, builds, and deploys `dist/` to GitHub Pages.

## Known gaps

1. **`dt` has no timezone field.** Deadlines are stored as `<date>T23:59:59Z`, but most publishers actually close at **AoE (UTC-12)** — up to ~12 h later than recorded. Countdowns near the boundary can be off by one day. The frontend mitigates this by counting down to 23:59:59 in the **viewer's local timezone** and showing an AoE hint; the real fix is for the crawlers to capture a timezone per CFP.
2. **MDPI is 83.8% of the corpus** (53,323 / 63,613). Default deadline order is dominated by it — combine publisher with discipline or quartile filters to get a useful view.
3. **`acm.py`, `cambridge.py`, `taylorfrancis.py`** exist but contribute no records.
4. **~56 records have implausible far-future deadlines** (2030-12 has 20, 2034-02 has 1) — parser noise. The frontend folds everything beyond 12 months into a single "later" bucket; the build script does not yet reject them.

## Roadmap

Planned frontend work (see `docs/ux-research.md` for the full analysis):

- Deadline histogram (12 months + "later" bucket) with click-to-filter
- Compact table view alongside the card view
- Calendar export: `.ics` download and Google Calendar deep links
- Favorites and read-state, persisted in `localStorage`
- Saved filter views
- Second-level countdown for entries closing within 3 days

## License

MIT License

## Contributing

Issues and PRs welcome. To contribute data:

1. Run a crawler to discover CFPs for a publisher
2. Review the output JSON in `data/cfp_by_publisher/open/<publisher>/`
3. Re-run `python scripts/build_site_data.py --window 6`
4. Submit a PR with the changed `public/data/` files

To prevent a crawler from overwriting a hand-corrected entry, set `"manual_lock": true` on that CFP in the lake.
