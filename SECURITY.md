# セキュリティ

## 対象の版

公開している最新の版だけを直す。`1.0.0` より前は、古い版へ修正を戻さない。

## 脆弱性の報告

脆弱性は公開の issue や pull request に書かず、GitHub の非公開の報告（このリポジトリの「Security」タブの「Report a vulnerability」）で知らせてほしい。

報告には次を書いてもらえると助かる。

- 影響する tote（`delim`・`delim-html`・`delim-spa`・`delim-ssg` のどれか）と版
- 再現の手順か、最小のコード
- 動かしたバックエンド
- 想定される影響（XSS、情報の漏れ、サービスの停止など）

受け取ったら 7 日以内に返事をし、直し方と公開の時期を報告者と相談する。直した版を出した後で、変更履歴とセキュリティ勧告で内容を公開する。

## 特に気をつけている範囲

- HTML の出力でのエスケープ（`delim-html/src/html.taut`、`delim-html/src/safe.taut`、`delim-html/src/policy.taut`）
- `delim-ssg` が書き出すファイルの住所（出力先の外に書かないこと）
