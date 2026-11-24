# delim-html

delim の HTML の側。HTML と DOM の描画先が共有する要素と属性（`src/markup.taut`）、HTML の書き出し（`src/html.taut`、
`src/write.taut`）、書いてよいものの許可リスト（`src/policy.taut`）、そのまま書く HTML（`src/safe.taut`）、SVG（`src/svg.taut`）、
`ui` の効果（`src/ui.taut`）、HTML の要素を書く `view!`（`src/html-view.taut`）がある。

`view!` の文法と `@if`・`@for`・`@match` の展開は `delim` の `src/view.taut` にあり、ここには HTML の方言（タグ名と属性の一覧、
URL の検査）と `view!` だけを置く。

DOM の描画先は `dom/`（JavaScript の host と、Playwright の web の検査を含む）。ブラウザーの検査（`dom/web/check*.cjs`）は npm の `playwright` を `require` する。この repository に `package.json` はないので、使う人が自分の環境に入れる。

## 検査

`delim-html` tote のルートで実行します。

```sh
for f in src/*.taut dom/src/*.taut; do tauto check "$f"; done
tauto lint src/*.taut dom/src/*.taut
tauto fmt --check src/*.taut dom/src/*.taut
```

証明（`write_safe` など）の検査は [`delim` の README](../delim/README.md#証明) にある。

## ライセンス

MIT と Apache-2.0 のデュアルライセンス。`LICENSE-MIT` と `LICENSE-APACHE` を参照。
