import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { grammarReady, highlight, htmlToRanges, loadGrammar } from '../src/code/highlight.ts';
import { filterLanguages, findLanguage, grammarFor, languageLabel, liveKind } from '../src/code/languages.ts';
import { csvToHtml, markdownInline, markdownToHtml, parseCsv } from '../src/code/render-text.ts';

describe('code languages', () => {
  it('finds a language by key or alias and names its grammar', () => {
    assert.equal(findLanguage('PY')?.key, 'python');
    assert.equal(findLanguage('tsx')?.key, 'typescript');
    assert.equal(findLanguage('cobol'), null);
    assert.equal(grammarFor(null), 'auto');
    assert.equal(grammarFor('html'), 'xml');
    assert.equal(grammarFor('plain'), null);
    assert.equal(grammarFor('lean'), null);
    assert.equal(liveKind('tex'), 'latex');
    assert.equal(liveKind('python'), null);
  });

  it('labels the button by language, or auto with what was detected', () => {
    assert.equal(languageLabel('js'), 'JavaScript');
    assert.equal(languageLabel(null), 'auto');
    assert.equal(languageLabel(null, 'python'), 'auto (Python)');
    assert.equal(languageLabel(null, 'xml'), 'auto (HTML)');
    assert.equal(languageLabel('cobol'), 'cobol');
  });

  it('filters the picker by name or alias', () => {
    assert.deepEqual(
      filterLanguages('sh').map(language => language.key),
      ['bash'],
    );
    assert.equal(filterLanguages('').length, 16);
  });
});

describe('highlighting', () => {
  it('reads highlight.js HTML as ranges that tile the text, entities decoded', () => {
    const html = '<span class="hljs-keyword">if</span> a &lt; b &amp;&amp; <span class="hljs-string">&quot;x&#x27;<span class="hljs-subst">y</span>&quot;</span>';
    const text = 'if a < b && "x\'y"';
    const all = htmlToRanges(html, true);
    let at = 0;
    for (const range of all) {
      assert.equal(range.from, at);
      at = range.to;
    }
    assert.equal(at, text.length);
    const classed = htmlToRanges(html);
    assert.deepEqual(
      classed.map(range => [text.slice(range.from, range.to), range.classes]),
      [
        ['if', 'hljs-keyword'],
        ['"x\'', 'hljs-string'],
        ['y', 'hljs-string hljs-subst'],
        ['"', 'hljs-string'],
      ],
    );
  });

  it('highlights Python once its grammar is loaded, and detects it under auto', async () => {
    const code = 'def greet(name):\n    return f"hi {name}"  # say hi\n';
    assert.equal(await loadGrammar('python'), true);
    assert.ok(grammarReady('python'));
    const made = highlight(code, 'python')!;
    const words = made.ranges.map(range => [code.slice(range.from, range.to), range.classes]);
    assert.ok(words.some(([word, classes]) => word === 'def' && classes === 'hljs-keyword'));
    assert.ok(words.some(([word, classes]) => word === '# say hi' && classes === 'hljs-comment'));
    assert.equal(await loadGrammar('auto'), true);
    const auto = highlight('def greet(name):\n    """Say hi."""\n    return f"hi {name}"\n\nclass Thing(object):\n    def __init__(self):\n        self.x = None\n', 'auto')!;
    assert.equal(auto.detected, 'python');
    assert.equal(highlight('x', 'cobol'), null);
  });
});

describe('live CSV and Markdown', () => {
  it('parses quoted CSV fields', () => {
    assert.deepEqual(parseCsv('a,"b, c","say ""hi"""\r\n1,"two\nlines",3\n'), [
      ['a', 'b, c', 'say "hi"'],
      ['1', 'two\nlines', '3'],
    ]);
    assert.deepEqual(parseCsv(''), []);
  });

  it('draws CSV as a table with a header row, escaped and padded', () => {
    assert.equal(csvToHtml('name,qty\n<b>,1,extra'), '<table><thead><tr><th>name</th><th>qty</th><th></th></tr></thead><tbody><tr><td>&lt;b&gt;</td><td>1</td><td>extra</td></tr></tbody></table>');
    assert.equal(csvToHtml('\n\n'), '');
  });

  it('draws inline Markdown, with only web and mail links', () => {
    assert.equal(markdownInline('**bold** and *it* and ~~gone~~ and `a*b*`'), '<strong>bold</strong> and <em>it</em> and <del>gone</del> and <code>a*b*</code>');
    assert.equal(markdownInline('[x](https://e.com/?a=1&b=2)'), '<a href="https://e.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">x</a>');
    assert.equal(markdownInline('[x](javascript:alert(1))'), '[x](javascript:alert(1))');
    assert.equal(markdownInline('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  });

  it('draws Markdown blocks: headings, lists, tasks, quotes, tables and code', () => {
    const source = ['# Title', '', '- one', '  - nested', '- [x] done', '1. first', '', '> quoted', '', '| a | b |', '|:--|--:|', '| 1 | 2 |', '', '```', '<x>', '```', '', '---', 'line one', 'line two'].join('\n');
    assert.equal(
      markdownToHtml(source),
      [
        '<h1>Title</h1>',
        '<ul><li>one<ul><li>nested</li></ul></li><li class="task"><input type="checkbox" disabled checked> done</li></ul><ol><li>first</li></ol>',
        '<blockquote><p>quoted</p></blockquote>',
        '<table><thead><tr><th style="text-align:left">a</th><th style="text-align:right">b</th></tr></thead><tbody><tr><td style="text-align:left">1</td><td style="text-align:right">2</td></tr></tbody></table>',
        '<pre><code>&lt;x&gt;</code></pre>',
        '<hr>',
        '<p>line one<br>line two</p>',
      ].join(''),
    );
  });
});
