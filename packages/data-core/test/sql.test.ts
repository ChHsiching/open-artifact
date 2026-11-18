import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fillKnownConnectorArguments,
  fillSqlParameters,
  getConnectorSqlTool,
  getKnownConnector,
  KNOWN_QUERY_CONNECTORS,
  portableSqlParameterLiteral,
  sqlParameterLiteral,
  sqlScalarLiteral,
  tokenizeSql,
  tokenizeSqlWithPlaceholders,
} from '../src/index.ts';
import type { Parameters } from '../src/index.ts';

const params = (record: Record<string, unknown>): Parameters => record as Parameters;
const kinds = (sql: string, quotes?: 'backslash' | 'doubled' | 'spark') =>
  tokenizeSql(sql, quotes)
    .filter((token) => token.kind !== 'space')
    .map((token) => [token.kind, token.text]);

describe('SQL tokens', () => {
  it('splits words, numbers, strings, names, comments and punctuation', () => {
    assert.deepEqual(kinds("select a, 1.5 from `t` where s = 'x' -- note\n/* block */"), [
      ['word', 'select'],
      ['word', 'a'],
      ['punct', ','],
      ['number', '1.5'],
      ['word', 'from'],
      ['name', '`t`'],
      ['word', 'where'],
      ['word', 's'],
      ['punct', '='],
      ['string', "'x'"],
      ['comment', '-- note'],
      ['comment', '/* block */'],
    ]);
  });

  it('reads backslash escapes, or doubled quotes', () => {
    assert.deepEqual(kinds("'a\\'b' x"), [
      ['string', "'a\\'b'"],
      ['word', 'x'],
    ]);
    assert.deepEqual(kinds("'it''s'", 'doubled'), [
      ['string', "'it'"],
      ['string', "'s'"],
    ]);
  });

  it('marks an unclosed string or comment open', () => {
    const [token] = tokenizeSql("'never closed");
    assert.equal(token?.kind, 'string');
    assert.equal(token?.open, true);
    assert.equal(tokenizeSql('/* open').at(-1)?.open, true);
  });

  it('keeps # as a comment except in Spark SQL', () => {
    assert.equal(tokenizeSql('# c')[0]?.kind, 'comment');
    assert.equal(tokenizeSql('# c', 'spark')[0]?.kind, 'punct');
  });

  it('can read placeholders as tokens', () => {
    const placeholder = tokenizeSqlWithPlaceholders('x = {{region}}').find((token) => token.kind === 'placeholder');
    assert.equal(placeholder?.text, '{{region}}');
    assert.equal(tokenizeSql('x = {{region}}').some((token) => token.kind === 'placeholder'), false);
  });
});

describe('SQL literals', () => {
  it('writes scalars', () => {
    assert.equal(sqlScalarLiteral(null), 'NULL');
    assert.equal(sqlScalarLiteral(true), 'TRUE');
    assert.equal(sqlScalarLiteral(-3), '(-3)');
    assert.equal(sqlScalarLiteral(7), '7');
    assert.equal(sqlScalarLiteral("it's"), "'it\\'s'");
    assert.equal(sqlScalarLiteral('a\\b'), "'a\\\\b'");
    assert.equal(sqlScalarLiteral("it's", 'doubled'), "'it''s'");
  });

  it('writes lists, and an empty list as (NULL)', () => {
    assert.equal(sqlParameterLiteral(['a', 1]), "('a', 1)");
    assert.equal(sqlParameterLiteral([]), '(NULL)');
    assert.equal(portableSqlParameterLiteral("o'k"), "'o''k'");
  });

  it('fills placeholders outside quotes and names the first one inside', () => {
    const result = fillSqlParameters("select * from t where r in {{r}} and n = '{{n}}' -- {{c}}", params({ r: ['a', 'b'], n: 'x' }));
    assert.equal(result.text, "select * from t where r in  ('a', 'b')  and n = '{{n}}' -- {{c}}");
    assert.equal(result.quoted, 'n');
    assert.equal(fillSqlParameters('select {{missing}}', params({})).text, 'select  NULL ');
  });

  it('fills a known connector\'s SQL argument with literals', () => {
    const name = Object.keys(KNOWN_QUERY_CONNECTORS)[0] as string;
    const spec = getKnownConnector(name);
    assert.ok(spec !== null);
    const tool = Object.keys(spec.query).find((key) => getConnectorSqlTool(spec, key) !== undefined);
    assert.ok(tool !== undefined);
    const sqlArg = getConnectorSqlTool(spec, tool)?.sqlArg as string;
    const filled = fillKnownConnectorArguments(JSON.stringify({ [sqlArg]: 'select {{n}}' }), spec, tool, params({ n: "o'k" }));
    assert.match(JSON.parse(filled.args)[sqlArg], /^select  'o(\\'|'')k' $/);
    const quoted = fillKnownConnectorArguments(JSON.stringify({ [sqlArg]: "select '{{n}}'" }), spec, tool, params({ n: 'x' }));
    assert.equal(quoted.unfilledAs?.code, 'quotedFilter');
  });

  it('fills an unknown connector with portable literals', () => {
    const filled = fillKnownConnectorArguments(JSON.stringify({ q: 'n = {{n}}', whole: '{{n}}' }), null, 'run', params({ n: "o'k" }));
    assert.deepEqual(JSON.parse(filled.args), { q: "n = 'o''k'", whole: "o'k" });
  });
});
