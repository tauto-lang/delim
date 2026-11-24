# Delim

Tauto で書く UI ライブラリ。仮想 DOM の差分を取らず、signal が読んだ場所だけを更新する。
コンポーネントの実行文脈（state、context、データ取得）とサーバ／クライアントの違いは effect と
ハンドラで表す。

いまあるのは、signal と所有の木（`src/signal.taut`）、描画先に依らない要素の層（`src/tree.taut`）、
Elm 型の store（`src/store.taut`）、DOM と HTML の描画先、islands、resource と suspense、`view!`。
ページの書き出し（静的サイト生成）は [`delim-ssg`](../delim-ssg/README.md)
にある。

```tauto
reactive(() => {
  let count := signal(1)
  let double := memo(() => get(count) * 2)
  let last := perform ref_new(0)
  watch(() => perform ref_set(last, get(double)))   // last = 2
  set(count, 5)                                     // last = 10
})
```

## signal（`src/signal.taut`）

- `signal(v)`・`get(s)`・`peek(s)`・`set(s, v)`・`update(s, f)`：値を持つ signal。watcher の中の
  `get` は、その watcher を signal に購読させる。`peek` と `untracked(f)` は購読しない。
- `batch(f)`：`f` の中の書き込みを溜め、最後に一度だけ watcher を走らせる。
- `watch(f)`：`f` をすぐ実行し、前回の実行で読んだ signal が変わるたびにもう一度実行する。
  依存は実行ごとに取り直す。
- `memo(f)`：`f()` を持ち、`f` が読む signal に従う signal。源が変わるたびに読み手に知らせる。
- `memo_eq(f)`：`memo` と同じだが、`f()` が前と同じ値（`DecEq`）なら読み手に知らせない。
- `set_eq(s, v)`：`set` と同じだが、今の値と同じ（`DecEq`）なら通知せず、呼んだ watcher の依存も増やさない。
- 所有の木：watcher は作られたときの所有者に属する。watcher が再実行される前と、所有者が
  `dispose` されたときに、その中で作られた watcher が先に終わり、`on_cleanup` で登録した後処理が
  新しい順に走る。`scope(f)` は新しい所有者の下で `f` を実行し、`Scoped { value, owner }` を返す。
  `value` が計算結果、`owner` が `dispose` に渡す所有者。
- 書き込みは一度にまとめて流す。一つの書き込みから届く watcher は、何本の経路で届いても一度だけ、
  すべての memo が更新された後に走る。
- 読む signal に書く watcher は自分をまた古くする。一つの書き込みが同じ watcher を走らせるのは
  100 回までで、それを超えると積まずに止め、`take_stalled()` がその watcher を返して空にする。
  次の書き込みではまた走る。
- 実行時の状態は effect `rt` で受け取り、`reactive(body)` が与える。`rt` は `direct` なので、signal を
  読み書きするコードは中断しない。
- signal は自分の id と値だけを持ち、誰が何を読んだかと所有の木は実行時の状態が id の hash map で
  持つので、強参照の循環ができない。購読・購読の取り消し・所有の木の操作は、全体の節の数にも、
  一つの signal を読む watcher の数にも比例しない。取り消した watcher は signal の読み手の並びに
  印だけ付けて残し、次にその signal へ書くときに並びから外す。
- `label(s, name)` は signal に名前を付け、`graph()` はどの signal をどの watcher が読んでいるかを
  一行ずつの文字にする。開発中に、思った signal が思った場所で読まれているかを見るのに使う。

watcher と後処理の関数が起こせる effect は今のところ `rt` と `Div` だけ。

## context とコンポーネント（`src/context.taut`、`src/component.taut`）

- `context`：`provide(値, () => …)` の中で `use_context()` が値を取り出す。effect `context(A)` を型
  ごとに一つずつ持つので、`provide` の外で使うコードは型が通らず、一番内側の `provide` が勝つ。
  同じ型の context を二つ要るときは、別の struct に包む。
- コンポーネントは props と子（`List(Node)`）を受け取って `Node` を返す関数で、周りに要るものは
  effect の行に出る（`rt`、`context(A)`、`fail(Text)`）。
- `error_boundary(#{ failed, body })`：木を `ui` から取る形。`body()` が `fail(why)` で失敗したら
  `failed(why)` を見せる。`suspense(#{ pending, cancelled, body })` は、`body` が `read` で待つ間
  `pending()` を見せ、資源が決まったら `body` を作り直す。取り消された資源には `cancelled()` を見せる。
  作り直した `body` が `fail(why)` で失敗したときは、上の `error_boundary` が `failed(why)` に切り替わる
  （`suspense` は `error_boundary` の中に置く）。
- `error_boundary_in(t, body, fallback)`：`body` が `fail(why)` で失敗したら `fallback(why)` を見せる。
  失敗するまでに作られた節はどこにも置かれていないので、見えない。
- `portal(t, target, body)`：`body` が作った節を、その場ではなく `target`（モーダルの層など）の
  下に置き、所有者が終わると外す。その場には空の group が残る。

## 要素の層（`src/tree.taut`）

番号の付いた節の保持木を持ち、変更を patch の列として積む。描画先（DOM、ネイティブ、テスト用の
headless）は `take_patches` で受け取って当てる。`K` は描画先の要素の種類の型、`P` は性質の型。

- `el(t, kind, props, children)`：要素。性質は `Static(p)`、読んだ signal に従う `Dyn(f)`
  （値が変わったときだけ `SetProp`）、ハンドラ `On(event, f)`。
- `text(t, s)`・`text_dyn(t, f)`：文字。
- `show(t, cond, build)`・`switch_on(t, f, build)`：形が変わる所。条件や値が変わると、前に作った
  節を所有の木ごと終えて `Remove` を出す。
- `keyed_each(t, items, key, row)`：キー付きの列。残ったキーは節と中身を保ち、消えたキーは終え、
  新しいキーだけ `row` を呼ぶ。並べ替えでは、前の順を保つ最長の行の列（最長増加部分列）を残し、
  ほかの行だけを `InsertBefore` か `Append` で動かす。同じキーの項目が複数あれば、最初の
  一つだけが行になる。
- `keyed_each_signal(t, items, key, row)`：行に `Signal(A)` を渡す列。同じキーで項目の内容が変わる
  場合は、行内の `text_dyn`・`Dyn` から `get(item)` で読む。行の節・ハンドラ・ローカル状態は保つ。
- `take_duplicate_keys(t)`：前回の呼び出し以降に重複したキーを、一つのキーにつき一回取り出して空にする。
  両方のキー付き列に使える。重複したキーの項目は、最初の一つだけを描く。キーの型は `u64`。
- `fire(t, node, kind, data)`：描画先が受けたイベントを、その種類（`EventKind`）のハンドラに中身
  （`EventData`：キー、確定した文字、ポインタの位置とボタン、スクロール量）ごと渡す。ハンドラの
  書き込みは一つの `batch` にまとまる。
- ハンドラと `Dyn` の関数が起こせる effect は `rt` と `Div` だけ。待つ処理は store の job にする。

patch の意味：

- 節は `Create`・`CreateText`・`CreateGroup` で親なしに作られ、番号は使い回さない。
- 既に親を持つ節への `Append`・`InsertBefore` は移動。
- `Remove` は部分木ごと外し、その下の節はすべて死ぬ（以後どの patch も名指さない）。`Remove` が出る
  のは外した部分木の根だけ。
- group は自分の箱を持たず、その子が親の中で group の位置を占める。

## store（`src/store.taut`）

- `store(init, update)`：`update: (Model, Msg) -> Next(Model, Job)` は純粋な関数で、待つ処理は
  job として返す。`dispatch(s, msg)` が model を書き換え、job は `take_jobs(s)` で描画先のループが
  受け取って実行する。
- `select(s, f)`：model の一部を `memo_eq` で切り出す。その部分が変わったときだけ読み手が走る。

## 共通の部品（`src/common.taut`、`src/widgets.taut`）

`Role` は支援技術に対する要素の役割で、押せる要素は名前を必ず持ちます。`Vocab` は描画先ごとに
要素の種類と属性の作り方を与える組で、`column`・`row`・`button`・`text_input` はこれだけを
使って書かれているので、どの描画先でも動きます。`template` は同じ形の部分木に印を付け、
描画先が最初の一つを複製に使えるようにします。

## DOM の描画先（`delim-html/dom/`）

要素の種類はタグ名、属性は DOM の属性です（`delim-html/src/markup.taut`、HTML の描画先と共通）。patch は一つずつ `delim-html/dom/host/dom.mjs` の呼び出しに
なり、JavaScript 側は番号から DOM ノードへの表と、根に置く一つずつのイベントリスナーだけを
持ちます。イベントは `fire` に渡され、その batch で古くなった watcher の patch がそのまま
適用されます。

リポジトリのルートで実行します。

```
tauto build --backend javascript --target browser totes/delim-html/dom
node totes/delim-html/dom/web/check.cjs       # Playwright でカウンターを押して確かめる
node totes/delim-html/dom/web/check-all.cjs   # ブラウザーの検査を Chromium・Firefox・WebKit で
```

どの検査も `dom/web/browser.cjs` でブラウザーを起動します。`DELIM_BROWSER` に `chromium`（既定）・
`firefox`・`webkit` を書くとそのブラウザーで、`CHROMIUM_EXECUTABLE_PATH` を書くと Chromium はその
実行ファイルで走ります。`check-all.cjs` は自分でサーバーを立てる三つの検査（`check.cjs`・
`check-overlay.cjs`・`check-host.cjs`）を三つのブラウザーで
回し、一つでも落ちると終了コードが 0 でなくなります。引数でブラウザーを絞れます
（`node check-all.cjs firefox webkit`）。

ページから外すときは DOM のホストの `unmount(element)`（要素かセレクタ）を呼びます。その要素の root を
release し（リスナー・タイマー・保留中の読み込みを解放し、以後の配達をしない）、描いた節を取り除きます。
同じ要素にもう一度 mount すると、前の root は release されます。

`dom/web/index.html` が例のページです。開発中は `dom/host/overlay.mjs` の `install()` を呼ぶと、ハンドラで
起きた誤りと拒否された promise が、メッセージとスタックのテキストとしてページの上に出ます
（`dom/web/check-overlay.cjs` が確かめます）。

## HTML の描画先（`delim-html/src/html.taut`）

`render_html` は patch を自分の木に適用して HTML として書き出し、どのバックエンドでも動きます。
前もっての書き出し（SSG）は、これを使う `delim-ssg` の役目です。

書き出すのは `delim-html/src/write.taut` の `write` で、カーネルが読める形で書いてあります。定理
`write_safe` は、木が何を持っていても（どんな文字、属性、タグ名でも）、書き出したものを
下の `html_safe` が受け入れることを、公理なしで示します。文字と属性の値はエスケープし、
許可リストにない属性は書かず、開始タグ・終了タグ・番号のコメントはそれぞれ `html_safe` が
受け入れるときだけ書きます（描画先は許可リストにあるタグと属性しか渡さないので、実際に
落ちるものはありません）。

## 書くもの（`delim-html/src/policy.taut`）

DOM と HTML の描画先は、許可リストにあるものだけを書きます。リストは `delim-html/src/policy.taut` にあり、
カーネルが読める形（バイト列と `Yn`）で書いています。

- 要素：コードを走らせず、後に続く文字の読み方も変えない HTML の要素と、`-` を含む名前の
  カスタム要素。`script`・`style`・`iframe`・`object`・`embed`・`base`・`link`・`meta`・
  `template`・`svg`・`math` などは入っていません。リストにないタグは、何も見せない
  `<delim-refused hidden>` として書き、中の文字は文字のままです。
- 属性：リストにある属性と `data-…`・`aria-…`。`on…` のハンドラ、`style`、`srcdoc` は
  入っていません（`style` は描画先が付ける `display:contents` だけを書きます）。
- URL（`href`・`src`・`action`・`formaction`・`poster`・`cite`）：ページからの相対か、scheme が
  `http`・`https`・`mailto`・`tel` のもの。最初の `/`・`?`・`#` より前に `&`・`<`・`>`・`"` が
  あるものは、文字参照で scheme を綴れるので書きません。

`id` と `name` は書くので、ページの JavaScript が `window` や `document` の同名のプロパティを
読む場合は、利用者の値をそこへ入れないでください。

## そのまま書く HTML（`delim-html/src/safe.taut`）

`trusted(t, h)` は `TrustedHtml` の HTML をエスケープせずに `<delim-trusted>`（レイアウトを
変えない要素）の中へ書きます。DOM では `innerHTML` で入れます。ほかのテキストはすべて
エスケープされるので、エスケープしない入口はこの型一つです（islands の最初の描画も、
`write_safe` の証明付きでこの型として渡します）。

`TrustedHtml` は、バイト列と「`html_safe` がそれを受け入れる」という証明の組です。証明は
実行時には消えますが、証明なしには作れないので、ほかのバイト列の `TrustedHtml` は書けません。
作り方は二つです。

- `escaped_html(text)`：エスケープして作る。エスケープしたものを `html_safe` が受け入れる
  ことは定理 `Escape::safe` です。
- `checked_html(html)`：`html_safe` を実行時に確かめ、受け入れるときだけ `Some` を返す。
  Markdown やハイライトなど、ほかの描画器の出力を通す入口です。直したりはせず、断るだけです。

`html_safe` が受け入れるのは HTML の小さな部分だけです。`<` を含まない文字、上の許可リストに
ある要素の開始タグと終了タグ、許可リストにある属性（` name` か ` name="value"` で、値に `"` と
`<` がない）、数字だけのコメント `<!--1-->`。この部分がブラウザでスクリプトを走らせないこと
は、ブラウザについての主張なので証明できず、この小さな規則を読んで確かめるものとして残ります。

## islands と hydration

サーバーで描画するページの中の `island(t, name, props, view)` は、`view(props)` を自分の木で
描画し、各ノードに番号を付けて書き出します（要素には `data-b`、テキストには直前のコメント）。
ブラウザでは `hydrate(name, view)` が同じ `view` を `props` からもう一度動かし、ノードを作る
代わりにページにあるノードを番号で引き取ります。引き取るときはタグ・文字・親・子の順序・欠落・余剰・重複した番号を検査し、合わなければ
`HydrationError` にします。入れ子の island と trusted HTML の内部の番号は混ぜず、自動の再マウントもしません。
島の外はサーバーが書いたまま動きません。
ブラウザへ渡す状態は `props` のテキストだけです。`dom/web/island.html` がその例で、
`check.cjs` は引き取った後もボタンが同じ DOM ノードであることを確かめます。

## resource と suspense（`src/resource.taut`）

`resource(t, key)` はキーで名指すテキストの資源で、`Loading`・`Loaded`・`LoadFailed` のどれかを
持つ signal です。読み込むのは描画先で、サーバーでは `render_html_loading` が `load` で全部を
読み込んでからページを書き、ブラウザでは DOM のホストに `setLoader` で置いた関数が読み込みます。
`setLoader(f, element)`（要素かセレクタ）はその要素の下の root だけに効き、同じページの複数のアプリや island が別々の loader を使えます。どこから読むかは Delim は知りません。ハンドラなど、組み立ての後で頼むときは `request(key)` です。

型の付いた資源は `resource_as(t, key, decode)` と `request_as(key, decode)` で、`Fetched(A)`（`Fetching`・
`FetchedOk(A)`・`FetchFailed(Text)`）の signal を返します。`decode` が読めないテキストは `FetchFailed` で、間違った値には
なりません。ハンドラは待てない（effect は `rt` と `Div` だけ）ので、`request_as` で頼み、続きを
`on_ready(s, f)` に渡します。`on_ready` は `FetchedOk` になったとき一度だけ `f` を走らせます。値をテキストにしているのは、サーバーが読んだものを
そのままブラウザへ渡せるようにするためです。`suspense_in(t, fallback, body)` は、`body` を
組み立てる間に求められた資源が揃うまで `fallback` を見せます。`resolve` と `reject` は
最初の一回だけが効き、二回目は何もしません。

## view! マクロ（`src/view.taut`）

`view!` は web の描画先の要素をマークアップで書く構文マクロです。最初の `$t` が木で、属性は
引用符のテキスト（固定）か `${e}`（追従するテキスト）、`on:press` などのイベントは `${h}` で
ハンドラを渡します。子は要素、引用符のテキスト、ノードを返す `${e}`、
Fragment、または下記の制御構文です。

イベント名は `press`・`focus`・`blur`・`key`（押した）・`keyup`（離した）・`edit`・`dblclick`・
`contextmenu`・`wheel`（`ScrollData` に横・縦の回転量）・`paste`（`TextData` に貼り付けた平文）・
`scroll`・`submit`・`pointerdown`/`pointerup`/`pointermove`/`pointerenter`/`pointerleave`・
`dragstart`/`dragmove`/`dragend`/`drop`、それに `action:<名前>` です。

````tauto
view!(```view
  $t <div class="row"><p>"Count: " ${text_dyn(t, () => Text::of_u64(get(n)))}</p>
    <button on:press=${(d: EventData) => update(n, (x: u64) => handle { x + 1 } with { overflow() => x })}>"+"</button>
  </div>
  ```)
````

### 条件・一覧・複数の子

制御構文には `@` を付ける。表示する文字列は引用符で囲むので、
`<pre>"if true { 1 } else { 0 }"</pre>` はコードの文字列を表示する。
条件・一覧・キー関数・match の対象には `${…}`（名前だけなら `$name`）を使う。

````text
view!(```view
  $t <>
    @if ${get(open)} {
      <p>"開いています"</p>
    } @else {
      <p>"閉じています"</p>
    }
    <ul>
      @for todo in ${get(todos)} key ${(item: Todo) => item.id} {
        <li>${text_dyn(t, () => get(todo).title)}</li>
      }
    </ul>
    @match ${get(session)} {
      Some(user) => { <p>${text(t, user.name)}</p> }
      None => { <a href="/login">"ログイン"</a> }
    }
  </>
```)
````

- `@if` は `show`、`@if … @else …` と `@match` は `switch_on` に展開する。
  対象の式が読む signal に追従し、値が変わると前の分岐とその所有者を破棄して作り直す。
  `@else @if …` で条件を続けられる。非表示の分岐の状態は保持しない。
- `@for` は `keyed_each_signal` に展開する。`key` は必須で、キー関数は項目の値から `u64` を返す。
  本文の行変数は `Signal(A)`。同じキーなら行・ハンドラ・ローカル状態を保ち、項目の値を更新する。
  内容への追従は `text_dyn`・`Dyn` 内で `get(row)` を使う。キーと同じ不変の ID を部品に渡す場合は
  `peek(row)` で構築時の値を読むこともできる。重複キーは `keyed_each` と同じく最初だけを使う。
- `@match` の束縛変数は通常の値。対象には `switch_on` と同じ `Shared`・`DecEq` 制約があり、
  値が変わると同じ constructor のままでも作り直す。
  パターンは `_`、変数、`true`・`false`、constructor と入れ子の引数を扱う。
  引数なしの constructor は大文字始まり・修飾名、または `Constructor()` で書く。
  `${…}` による constructor・Bool・Text のパターンも扱うが、数値・record・guard は未対応。
  網羅性は展開後の Tauto の `match` が検査する。
- `<>…</>` は `fragment(t, children)`。各ブロックにはゼロ個以上の子を書け、複数なら group にまとめる。
  要素・Fragment・制御構文はルートにも置ける。文字・属性・式埋め込みの追従規則は、要素の中に書くときと同じ。

Fragment は `CreateGroup` を使う。DOM/HTML では hydration と移動のための
`<delim-group style="display:contents">` が残る。レイアウトの箱は作らないが、
React の Fragment と異なり DOM 要素自体は存在する。要素を挟めない HTML の位置ではこの違いに注意する。
`fragment`・`switch_on`・`show`・`keyed_each_signal` は関数としても使える。

追従する `value=${text}` は `Value(Text)`、`disabled=${flag}` は `Disabled(Bool)` に展開します。
通常の文字列属性と区別するので、textarea の値や boolean 属性を文字列でごまかす必要はありません。
DOM は同じ値の書き込みで選択範囲を動かさず、select の値は子の option を追加した後にも反映します。

`on:action:<名前>` は `NamedAction("<名前>")` のハンドラです。ブラウザー側は対象の要素へ
`CustomEvent("delim:action", {bubbles: true, detail: {action: "<名前>"}})` を送れます。
通常のイベントと同じ `fire` と batch を通るので、ブラウザー固有の選択範囲やタイマーからの通知も
Tauto の状態更新と patch の適用に接続できます。

要素の名前、属性の名前と固定の値は、マクロの段階で上の許可リストに照らし、リストにない
ものは誤りになります（`on…` 属性なら、ハンドラは `on:` のイベントだと示します）。マクロの
関数は `Nat` の数を扱えないので、マクロの段階のリストは `src/view.taut` にテキストで書き直して
あり、二つが同じであることをテストが確かめます。追従する値は、DOM と HTML の描画先が書く前に
`delim-html/src/policy.taut` で確かめ、断ったものは書きません。

文法を変えたら `tauto syntax gen totes/delim/src` で `src/.tauto-syntax/` の表を作り直します。

## 証明

リポジトリのルートで実行します。

```bash
tauto check totes/delim-html/src/safe.taut      # Escape::safe など、公理なし
tauto check totes/delim-html/src/write.taut     # write_safe：書き出したものはいつも html_safe、公理なし
tauto check totes/delim/proof/safe.taut    # html_safe がいくつかの HTML を受け入れる・断ること
tauto check totes/delim/proof/write.taut   # write がいくつかの木を書いたもの
tauto check totes/delim/proof/policy.taut  # 許可リストのバイト列が名前どおりであること
```

証明の外に残るものは次のとおりです。

- `html_safe` が受け入れる HTML がブラウザでスクリプトを走らせないこと（ブラウザについての
  主張なので、規則を小さく保って読んで確かめる）。
- 抽出とバックエンド、DOM の描画先の JavaScript（`dom/host/dom.mjs`）が書いたとおりに動くこと。
  DOM の描画先は文字列を組み立てず、要素の名前と属性を同じ許可リストで確かめてから渡します。
- `delim-ssg` のページの枠（`<head>` など）。`Script` と `Stylesheet` に利用者の値を渡さない
  ことは使う側の責任です。
- `id`・`name` による DOM clobbering や、`data-…` を読んでコードにするライブラリ（script
  gadget）など、ページ自身のスクリプトがからむもの。

## テスト

`delim` tote のルートから実行します。`tests/src` のテストは `perform test` で登録しているので、`tauto test` で実行します。

```bash
tauto test tests
tauto test --backend javascript tests
```

## 検査

`delim` tote のルートで実行します。

```sh
for f in src/*.taut proof/*.taut tests/src/*.taut tests/*/src/*.taut; do tauto check "$f"; done
tauto lint src/*.taut proof/*.taut tests/src/*.taut tests/*/src/*.taut
tauto fmt --check src/*.taut proof/*.taut tests/src/*.taut tests/*/src/*.taut
(cd tests && tauto check .)
```

## resource の再取得

再取得は次のように使う。同じ signal を保ち、古い応答とキャンセル後の応答は無視する。所有者が `dispose`
された後の応答と新しい要求も無視する。

```tauto
let search := reloadable()
let result := resource_state(search)  // Signal(Load)
reload(search, "first query")
reload(search, "new query")          // first query の遅い応答は無視する
cancel_resource(search)              // 未完了なら LoadFailed にする
```

`decoded(result, decode)` で型の付いた資源にもできる。`on_ready` は一回だけ走るので、繰り返す表示には
`watch` や `text_dyn` を使う。所有者の破棄では最後の signal 値を書き換えず、応答だけを無効にする。
再取得・キャンセルによる個別の通信中断はしない。DOM の loader は第二引数として `{ signal }`
を受け取れるため、`fetch(url, { signal })` のように接続すれば、DOM root の release で通信を中断できる。
第二引数を使わない loader でも動き、release 後の結果は配達されない。

フォームの属性には `Checked`・`Selected`・`Multiple`・`Hidden`・`Required`・`ReadOnly` と `OptionalAttr` があり、
`view!` の `checked=${flag}` などでも使える。`readonly=${flag}` は `ReadOnly(flag)`。
`OptionalAttr(name, None)` は属性を取り除き、`Some(value)` は通常の属性と同じ許可リストを通る。
textarea と select の `Value` は HTML の出力にも反映する。

`tests/gaps` と DOM ホストのテストは、リポジトリのルートから次で実行する。DOM ホストのテストもほかの検査と同じく
`dom/web/browser.cjs` でブラウザーを起動する。

```bash
tauto run --backend javascript totes/delim/tests/gaps
node totes/delim-html/dom/web/check-host.cjs
```

## 契約と、まだないもの

- signal と所有者は、同じ `reactive` / `with_runtime` の中で作ったものだけを使う。runtime をまたぐ検査はない。
  island のあいだで signal や所有者の番号を渡さず、データやメッセージを渡す。
- watcher の中の書き込みは許す（`memo` に必要）。循環は、一つの書き込みあたり 100 回までの実行回数の上限と
  `take_stalled` で扱う。
- 全表の個数を取る API（メモリの増え方を調べる診断）はない。取り消した watcher は読み手の並びに印を残すので、
  `graph()` の出力が同じであることだけでは、表のメモリが増えないことの証明にならない。
- runtime 全体を閉じて以後の使用を拒む API はない。所有の木は `scope` と `dispose(owner)` で終え、ページから外すには
  `unmount` を使う。
- ブラウザーのネイティブの `submit` を処理する API と、その既定動作を止める API はない。`Edit` は DOM の `change` に
  対応し、独自の通知は `NamedAction` で受ける。
- `view!` の子は節で、表示と依存の追跡を暗黙に混ぜる記法はない。

## 型付き resource handle と read effect

`src/handle.taut` の Resource(A, E) は一つの処理の読み取り用 handle。
state は Pending / Ready(A) / Failed(E) / Cancelled。
read は成功値を返し、未完了なら resource_wait(A, E)、失敗なら fail(E)、キャンセルなら
resource_cancelled を発生させる。必要な effect は型の行に残り、呼び出し元が handler を用意する。
resource_wait の継続を再開すると read は状態を再確認する。

join(a, b) は両方の成功値の組（`A × B`）を返す handle を作る。失敗・キャンセルでは早期に終端し、
共有された他方の処理をキャンセルしない。
select(a, b) は最初に観測した終端を保持し、成功時は First / Second で入力を区別する。
同じ更新 batch で両方が終端なら左を優先する。「最初の成功」を待つ操作とは異なる。
これらは新しい取得を開始せず、入力 handle を合成するだけ。
Resource にキャンセル操作はなく、取得を所有する側の権限と読み取りを分けている。

このモジュールは汎用 task scheduler や新しい ui/suspense を実装するものではない。
新しい effect の最小 handler と合成の動作例は tests/src/handle.taut。

```sh
tauto test totes/delim/tests/src/handle.taut
```

## ライセンス

[MIT](LICENSE-MIT) と [Apache-2.0](LICENSE-APACHE) のデュアルライセンス。どちらかを選んで使える。

変更履歴は [CHANGELOG.md](../../CHANGELOG.md)、脆弱性の報告は [SECURITY.md](../../SECURITY.md) を見る。
