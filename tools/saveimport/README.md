# Save import

Python 3.14+ (standard-library Zstandard). Source saves are copied before any
content is read. Backups and research output belong in ignored `scratch/`.
Do not put backup/output directories in the game's settings directory.

```powershell
python -m tools.saveimport inspect "%LOCALAPPDATA%\EA SPORTS FC 27\settings\CmMgrC20261024175128313"
python -m tools.saveimport research .\scratch\saveimport\CmMgrC20261024175128313 --backups .\scratch\research-copies --report .\scratch\career-research\report.json
python -m tools.saveimport compare "%LOCALAPPDATA%\EA SPORTS FC 27\settings\CmMgrC20261024175128313" --export-dir C:\FCExport --snapshot 84af764b_20300717_174946 --report scratch/saveimport/comparison.json
python -m unittest discover -s tools/saveimport/tests -v
python -m tools.saveimport import "$env:LOCALAPPDATA\EA SPORTS FC 27\settings" --export-dir C:\FCExport --db .\fc_career.db
python -m tools.saveimport watch "$env:LOCALAPPDATA\EA SPORTS FC 27\settings" --export-dir C:\FCExport --db .\fc_career.db --interval 10
```

The first Zstandard frame contains two standard T3DB v8 databases. Never parse
DB signatures or apparent 9-byte descriptors in compressed literal data.
Unknown tables/fields/types, truncation and inconsistent record counts fail
closed. Cancelled records are skipped; integer range offsets come from config.
CRC validation is not implemented; schema/bounds checks and export comparison
are the current integrity checks. Source files are never modified.

The research command compares copied payloads within the same UID/slot and reports candidate offsets separately from
decoded season/finance data. It never writes to a database. The season archive (including board confidence and league
objective) and 23 finance category totals are provisional FC 27 fields; see `docs/data-dictionary.md`.
On first import with block version 2, a known source hash gets its derived career blocks refreshed once, without changing
snapshot/branch identity or timestamps. Older same-day sources cannot overwrite newer source data. The API shows
the archive's source date; recent transaction sums remain separate from season category totals.

Run the combined watcher instead of `exporter/tools/importer.py --watch` for the
same destination database: both honor its `.lock` file. The wrapper also imports
the existing export manifest/events without changing exporter files. Use
`FC_CAREER_DB` to point the backend at the combined database. Backups are retained
until manually removed; watch is polling and unchanged content is idempotent.

`snapshots.source` is the dominant source (`save` if present); `snapshot_sources`
records all observations and backup paths, `snapshot_tables` records table
precedence. Same-day save/export merges preserve export budgets, save tables and
the existing snapshot ID. Revision changes invalidate backend caches. Static
labels carry forward only within the same career; club IDs always come from the
current squad links. Missing labels stay unknown. Budgets never carry to a new day.

LE's UID is read from its marker row using config; without it a local slot UID is
used and export matching is unavailable. `(UID, save title)` identifies a slot
across filename changes, and each slot has a branch. Distinct slots must have
distinct save titles. Renaming a title starts a new branch. Moving game date
backwards also starts a branch. Ambiguous identical same-day export matches to
multiple slots fail rather than silently combining careers.
