# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Oxwazolsky/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Oxwazolsky/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in replacement for csv-reader 1.0.0, make.fun's reference CSV reader. `solve.js` exports `run(input)`, which returns exactly csv-reader's answer for `{text, header}` — `{columns, rows, errors}` under csv-reader's broken-row policy (BOM handling, stray CRs, quoted fields with doubled quotes and embedded line breaks, quote junk, unterminated quotes, short/long row padding and cutting, and the full error list with record line and row). Where csv-reader walks the text a character at a time and builds every field a character at a time, this reader jumps between the characters that matter and takes fields out of the text as slices, so it answers the same in a fraction of the CPU time (about 3.4x faster than the reference on the practice set). `main.ts` is the harness driver: it answers every case in `/input/cases.json` with `run` and writes `/output/answers.json`.

## Run it

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=gykmd6xj&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
