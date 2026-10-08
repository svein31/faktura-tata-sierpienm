These UI fonts are subsets of the Inter variable WOFF2 assets already used by
the application. Their license is [OFL.txt](./OFL.txt), from the official
[Inter repository](https://github.com/rsms/inter/blob/master/LICENSE.txt).
The derivative font family is named **FakturaProsto Sans**.

- Latin: 42,184 bytes, variable weight 100–900.
- Latin Extended A and currencies: 16,948 bytes, including Polish letters.
- Combined: 59,132 bytes versus 133,704 bytes for the earlier Latin and full
  Latin Extended assets. `next/font/local` provides hashed assets, preload,
  `font-display: swap`, and the metric-adjusted fallback.

Regenerate with `scripts/subset-ui-fonts.py` in a Python environment containing
`fontTools[woff]`. Supply the original licensed source files with
`--latin-source` and `--extended-source`. No font generator, Python package, or
external font request is required during application builds or page loads.

Original source SHA-256 values:

```text
Latin: c940764593d0fe5d596be327ca7558855e018039fb78509aa21921fd3644c3e4
Extended: a28eb6d3ccb534ae0c94ca999371df024aab60b08c3c8a5720ee9e32fa0faaa2
```
