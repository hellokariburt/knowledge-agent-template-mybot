# Mock Snapshot Content

This folder contains fake content for smoke-testing Knowledge Agent Template sync/search.

All data in this directory is synthetic and does not represent real offers, rates, or policies.

## Structure

- `docs/articles/*.md` - fake editorial content
- `docs/cards/*.json` - fake card data (one card per file)
- `docs/cards/index.json` - small index of available cards

## Notes

- This dataset is intentionally small for fast sync tests.
- File formats are compatible with KAT sync filters (`.md`, `.json`).
