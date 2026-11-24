import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const tauto = process.env.TAUTO_BIN ?? 'tauto';
for (const backend of ['rust', 'javascript']) {
  test(`typed route generation (${backend})`, {timeout: 180000}, async () => {
    const result = await run(tauto, ['run', '--backend', backend, 'tests/route-syntax'], {cwd: root, maxBuffer: 2 * 1024 * 1024, env: {...process.env, CARGO_NET_OFFLINE: 'true'}});
    assert.doesNotMatch(result.stdout, /FAILED/);
    assert.equal((result.stdout.match(/= "ok"/g) ?? []).length, 13, result.stdout);
  });
}
test('query decoding and primitive codecs', {timeout: 180000}, async () => {
  const result = await run(tauto, ['run', '--backend', 'javascript', 'tests/route-runtime'], {cwd: root, maxBuffer: 2 * 1024 * 1024});
  assert.doesNotMatch(result.stdout, /FAILED/);
  assert.equal((result.stdout.match(/= "ok"/g) ?? []).length, 3, result.stdout);
});

test('invalid route schemas and incorrectly typed values fail during compilation', {timeout: 180000}, async t => {
  await mkdir(join(root, 'target'), {recursive: true});
  const directory = await mkdtemp(join(root, 'target/route-reject-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const declarations = ' => struct Broken, fn Broken::href, fn Broken::parse, fn Broken::route\n';
  const schemas = [
    ['duplicate-key', 'Broken /?a={first:Text}&a={second:Text}', /duplicate query key/],
    ['duplicate-field', 'Broken /?a={value:Text}&b={value:Text}', /duplicate field name/],
    ['separator', 'Broken /&a={value:Text}', /start with \? and continue with &/],
    ['segment-partial', 'Broken /users-{id:u64}', /whole segment/],
    ['segment-adjacent', 'Broken /{a:Text}{b:Text}', /whole segment/],
    ['segment-duplicate', 'Broken /{id:Text}?id={id:Text}', /duplicate field name/],
    ['default-type', 'Broken /?n={count:u64=${"oops"}}', /u64|Text/]
  ];
  for (const [name, schema, expected] of schemas) {
    const file = join(directory, name + '.taut');
    await writeFile(file, 'import ' + JSON.stringify(join(root, 'src/route.taut')) + '\nroute!(`' + schema + '`)' + declarations + '#()\n');
    await assert.rejects(run(tauto, ['run', '--backend', 'javascript', file], {cwd: root, maxBuffer: 2 * 1024 * 1024}), error => {
      assert.match(error.stdout + error.stderr, expected, name);
      return true;
    });
  }
  const file = join(directory, 'value-type.taut');
  await writeFile(file, 'import ' + JSON.stringify(join(root, 'src/route.taut')) + '\nroute!(`Broken /?n={count:u64}`)' + declarations + 'perform show("url", Broken::href(Broken { count: "oops" }))\n');
  await assert.rejects(run(tauto, ['run', '--backend', 'javascript', file], {cwd: root}), error => {
    assert.match(error.stdout + error.stderr, /u64|Text/);
    return true;
  });
});
