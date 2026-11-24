# 変更履歴

`delim`・`delim-html`・`delim-spa`・`delim-ssg` の変更をここに書く。四つの tote は同じ版で出す。

## 版の付け方

- 版は [Semantic Versioning](https://semver.org/lang/ja/) に従う。`1.0.0` より前は、利用者の書いたコードが通らなくなる変更（API・`view!` の書き方・HTML の出力）で minor を上げ、それ以外で patch を上げる。
- 版は `totes/delim/Tauto.eure`・`totes/delim-html/Tauto.eure`・`totes/delim-spa/Tauto.eure`・`totes/delim-ssg/Tauto.eure` の `version` に書き、四つをそろえる。
- 公開するたびに、下の「未公開」の内容を新しい版の節に移し、日付を付ける。

## 未公開

なし。

## 0.1.0（2026-11-24）

最初の公開。

- `delim`: signal と所有の木、要素の層、store、resource と suspense、islands と hydration、`view!` マクロ。
- `delim-html`: HTML の書き出しと DOM の描画先、書いてよいものの許可リスト、HTML の `view!`。DOM のホスト（`dom/host/dom.mjs`）は、Tauto.eure の extern 全部をその名前で並べた `externs` と、ホストの型を落とす関数の `releases` を書き出す。ページが `instantiate(externs, { release: releases })` でプログラムを作り、書き出した `start` を呼ぶと、そのプログラムはページがある間ずっとイベントを受け取る。
- `delim-spa`: ブラウザーの中で動かすアプリ向けのルーター `route!`。
- `delim-ssg`: 住所とページの組（`Route { path, page }`）で書くルートと、静的サイトの書き出し。resource の読み込みが失敗したページがあるとき、同じ住所を持つページがあるときは、書かずに `generate` が止まる。
