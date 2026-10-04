import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isSafeLearningHref,
  normalizeLearningMarkdown,
  parseLearningInline,
  parseLearningMarkdown,
} from './learningMarkdown';

test('normalizes legacy escaped line breaks into readable Markdown blocks', () => {
  const source = String.raw`# Class 8 Rational Numbers\n\nCompare these values.\n\n- One half\n- तीन चौथाई`;
  const blocks = parseLearningMarkdown(source);

  assert.equal(normalizeLearningMarkdown(source), [
    '# Class 8 Rational Numbers',
    '',
    'Compare these values.',
    '',
    '- One half',
    '- तीन चौथाई',
  ].join('\n'));
  assert.deepEqual(blocks, [
    { type: 'heading', level: 1, text: 'Class 8 Rational Numbers' },
    { type: 'paragraph', text: 'Compare these values.' },
    { type: 'list', ordered: false, start: 1, items: ['One half', 'तीन चौथाई'] },
  ]);
});

test('preserves real line breaks and groups wrapped paragraph lines', () => {
  const blocks = parseLearningMarkdown('First line\r\ncontinued line\r\n\r\nNext paragraph.');
  assert.deepEqual(blocks, [
    { type: 'paragraph', text: 'First line continued line' },
    { type: 'paragraph', text: 'Next paragraph.' },
  ]);
});

test('supports headings, ordered lists, quotes, and fenced code blocks', () => {
  const blocks = parseLearningMarkdown('## Steps\n\n3. Observe\n4. Explain\n\n> Think first\n> then answer\n\n```html\n<script>alert(1)</script>\n```');
  assert.equal(blocks[0]?.type, 'heading');
  assert.deepEqual(blocks[1], { type: 'list', ordered: true, start: 3, items: ['Observe', 'Explain'] });
  assert.deepEqual(blocks[2], { type: 'blockquote', children: [{ type: 'paragraph', text: 'Think first then answer' }] });
  assert.deepEqual(blocks[3], { type: 'codeBlock', value: '<script>alert(1)</script>' });
});

test('allows HTTPS and same-site links but rejects executable and protocol-relative URLs', () => {
  assert.equal(isSafeLearningHref('https://ncert.nic.in/resource'), true);
  assert.equal(isSafeLearningHref('http://example.org'), false);
  assert.equal(isSafeLearningHref('https://user:pass@example.org'), false);
  assert.equal(isSafeLearningHref('/learn/resource/class-8'), true);
  assert.equal(isSafeLearningHref('#exercise-1'), true);
  assert.equal(isSafeLearningHref('//evil.example/path'), false);
  assert.equal(isSafeLearningHref('javascript:alert(1)'), false);
  assert.equal(isSafeLearningHref('data:text/html,<script>'), false);
});

test('keeps raw HTML and unsafe Markdown links as inert text nodes', () => {
  const source = '<script>alert(1)</script> [unsafe](javascript:alert(1)) [safe](https://example.org/lesson)';
  const nodes = parseLearningInline(source);
  const links = nodes.filter((node) => node.type === 'link');
  assert.equal(links.length, 1);
  assert.equal(links[0]?.type === 'link' ? links[0].href : '', 'https://example.org/lesson');
  const leadingText = nodes.find((node) => node.type === 'text');
  assert.equal(leadingText?.type === 'text' && leadingText.value, '<script>alert(1)</script> [unsafe](javascript:alert(1)) ');
});

test('returns no blocks for empty content', () => {
  assert.deepEqual(parseLearningMarkdown('  \n  '), []);
  assert.deepEqual(parseLearningMarkdown(null), []);
});
