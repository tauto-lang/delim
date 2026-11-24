# delim-ssg

[Delim](../delim/README.md) で書いたページを、前もって HTML のファイルに書き出す tote です（静的サイト生成）。
書き出したファイルは、どの静的ホストにも置けます。

## ルート（`src/route.taut`）

ページは、書き出す住所との組 `Route { path, page }` で表します。`route(segments, page)` は区間を
エスケープしてつなぎ（`route(["posts", "a b"], p)` の住所は `/posts/a%20b`、`route(Nil, p)` は `/`）、
組を作ります。

```tauto
fn about_route(): Route ! {overflow, div} { route(["about"], about_page()) }
fn post_route(p: Post): Route ! {overflow, div} { route(["posts", p.slug], post_page(p)) }
```

- 引数のあるページは、組を返す関数にします。全部を書き出すときは、値を並べてその関数に渡します。
- リンクは同じ組から `link(t, post_route(p), children)` で作ります。住所を書くのはページを定義する
  一か所だけなので、書き出さないページへのリンクは作れません。
- ページを自分の型（enum など）で呼ぶサイトは、`routes_of(rs, segments, page)` で各値の組を作れます。

書き出しでは住所を読み戻さないので、住所からルートを読むための関数やクエリはありません。

## ページ（`src/site.taut`）

`Page { title, lang, head, view }` の `lang` は `<html lang>`（空なら付けない）、`head` は
`Stylesheet(href)`・`Meta(name, content)`・`Script(src)` などの並びで、`<head>` に書きます。値は
エスケープし、URL は delim の許可リストにあるもの（ページからの相対か `http`・`https` など）
だけを書きます。`Script` と `Stylesheet` はページで走るコードを読み込む入口なので、利用者の
値から作らないでください。

`generate` は `/` を `index.html` に、それ以外を `Layout` に従って `Flat` なら `<path>.html`、
`Directories` なら `<path>/index.html` に書き、要るディレクトリを作ります。

次のときは、何も書かずに理由を返します。

- 二つのページが同じ住所を持つとき（後のファイルが前のファイルを黙って上書きしないように）。
- 住所に空・`.`・`..` の区間があるとき（出力先の外に書かないように）。

ページが読む resource の読み込みが失敗したときは、そのページの住所・resource の key・理由を返して止まります。
一部が欠けたページは書きません。

## アセット

`App::assets` は `#(@path, @body)` の並びで、本体は `Bytes` です。テキストは
`text_asset(path, text)` で作れ、画像・フォント・`.wasm` はバイト列のまま渡します。`generate` が
そのパスに書きます。パスは `/` で始まり、空・`.`・`..` の区間を持てません。

## resource（`src/resource.taut`）

ページが書き出しのときに読むデータは `Res { key, value }` で宣言し、ページでは
`use_res_in_tree(t, r)`、書き出す側では `loading(r, run)` で読み込み方を渡します。`run` は
`Div` のほかの効果（ファイルの読み込みなど）も行えます。その効果は `App(e)` と `generate_app` の行に出ます。

## レイアウト（`src/frame.taut`）

`Frame { head, wrap }` は節で共有する head と、ページの view を包む関数です。`framed(frame, page)`
でページを包み、`nested(outer, inner)` で枠を重ねます。枠とページは一つの木で、suspense と resource も共有します。

## アプリ（`src/app.taut`）

`generate_app(App { routes, resources, assets, layout, not_found })` は `generate <dir>` で各ページを
書き出します。`not_found` に `Some(page)` を渡すと `/404.html` にも書きます（静的ホストの多くはこのファイルを
404 に使います）。失敗すると理由を標準エラーに書いて終了コード 1 で終わります。

リポジトリのルートで実行します。

```
tauto run --yes totes/delim-ssg/example -- generate out
```

`example/` が例です。大きなページを書き出すときは、歩数の上限に当たらないよう `--allow-div` も付けてください。

## テスト

```bash
cd totes/delim-ssg && tauto test tests
```

## 検査

`delim-ssg` tote のルートで実行します。

```sh
for f in src/*.taut example/src/*.taut tests/src/*.taut; do tauto check "$f"; done
tauto lint src/*.taut example/src/*.taut tests/src/*.taut
tauto fmt --check src/*.taut example/src/*.taut tests/src/*.taut
```

## ライセンス

[MIT](LICENSE-MIT) と [Apache-2.0](LICENSE-APACHE) のデュアルライセンス。どちらかを選んで使える。

変更履歴は [CHANGELOG.md](../../CHANGELOG.md)、脆弱性の報告は [SECURITY.md](../../SECURITY.md) を見る。
