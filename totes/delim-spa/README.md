# delim-spa

[Delim](../delim/README.md) で書いたアプリをブラウザーの中で動かす側（SPA）の tote です。
いまはルーター `route!` だけを持ちます。

## ルート（`src/route.taut`）

`route!` は、住所の形からその値の型と、住所を書く関数・読む関数を作ります。
静的サイト生成（delim-ssg）と違い、SPA は今いる住所を読み戻すので、クエリまで型付きで扱います。

```tauto
route!(`PostPage /users/{user:u64}/posts/{slug:Text}?tab={tab:Tab=Overview}`) => struct PostPage, fn PostPage::href, fn PostPage::parse, fn PostPage::route
```

- `struct PostPage` は宣言した各値を持つ構造体です。
- `PostPage::href(value)` は住所を書きます。区間とクエリの値はエスケープします。
- `PostPage::parse(target)` は住所を読み、`Result(PostPage, RouteError)` を返します。`#` 以降は読みません。
- `PostPage::route()` は `href` と `parse` の組 `RouteSpec(PostPage)` です。いくつかのルートを
  アプリの一つの型にまとめるときは、`route_choice` と `choose_route` に渡します。

区間 `{name:Type}` は `/` で区切られた一つの区間を丸ごと埋めます。クエリ `?key={name:Type}` は
`=` のあとに既定値（名前か `${式}`）を書けます。既定値のある値は、無いときも codec が拒んだときも
既定値になり、既定値のない値は `MissingParameter`・`InvalidParameter` になります。区間が合わない
住所は `NoRoute` で、`choose_route` は次のルートを試します。

型の codec は `Text`・`u64`・`Bool` が組み込みで、それ以外の型は `Type::route_codec(): Codec(Type)` を
用意します。

## リンク（`src/link.taut`）

`route_link(t, PostPage::route(), value, children)` は、`href` が書く住所への `<a>` を作ります。

## テスト

`delim-spa` tote のルートで実行します。

```sh
TAUTO_BIN=tauto node --test tests/routes.test.mjs
```

## 検査

```sh
for f in src/*.taut tests/*/src/*.taut; do tauto check "$f"; done
tauto lint src/*.taut tests/*/src/*.taut
tauto fmt --check src/*.taut tests/*/src/*.taut
```

## ライセンス

MIT または Apache-2.0 のデュアルライセンスです。`LICENSE-MIT` と `LICENSE-APACHE` を参照してください。
