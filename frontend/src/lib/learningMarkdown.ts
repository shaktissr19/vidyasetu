export type LearningInlineNode =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'emphasis'; children: LearningInlineNode[] }
  | { type: 'strong'; children: LearningInlineNode[] }
  | { type: 'link'; href: string; external: boolean; children: LearningInlineNode[] };

export type LearningMarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: string[] }
  | { type: 'blockquote'; children: LearningMarkdownBlock[] }
  | { type: 'codeBlock'; value: string }
  | { type: 'rule' };

/**
 * Older imports stored the two characters "\\n" instead of a line break.
 * Normalize that compatibility form at the rendering boundary without
 * interpreting any HTML or other escape sequences.
 */
export function normalizeLearningMarkdown(markdown: string | null | undefined): string {
  if (!markdown) return '';
  return markdown
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .trim();
}

export function isSafeLearningHref(href: string): boolean {
  const value = href.trim();
  if (!value || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return false;
  if (value.startsWith('#') || value.startsWith('?')) return true;
  if (value.startsWith('/') && !value.startsWith('//')) return true;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function pushText(nodes: LearningInlineNode[], value: string): void {
  if (!value) return;
  const last = nodes[nodes.length - 1];
  if (last?.type === 'text') last.value += value;
  else nodes.push({ type: 'text', value });
}

export function parseLearningInline(markdown: string, depth = 0): LearningInlineNode[] {
  if (depth > 8) return [{ type: 'text', value: markdown }];

  const nodes: LearningInlineNode[] = [];
  let index = 0;
  while (index < markdown.length) {
    const character = markdown[index];

    if (character === '\\' && index + 1 < markdown.length) {
      const escaped = markdown[index + 1];
      if ('\\`*_{}[]()#+-.!>'.includes(escaped)) {
        pushText(nodes, escaped);
        index += 2;
        continue;
      }
    }

    if (character === '[') {
      const labelEnd = markdown.indexOf('](', index + 1);
      const targetEnd = labelEnd >= 0 ? markdown.indexOf(')', labelEnd + 2) : -1;
      if (labelEnd > index + 1 && targetEnd > labelEnd + 2) {
        const label = markdown.slice(index + 1, labelEnd);
        const href = markdown.slice(labelEnd + 2, targetEnd).trim();
        if (isSafeLearningHref(href)) {
          nodes.push({
            type: 'link',
            href,
            external: /^https:\/\//i.test(href),
            children: parseLearningInline(label, depth + 1),
          });
          index = targetEnd + 1;
          continue;
        }
        pushText(nodes, markdown.slice(index, targetEnd + 1));
        index = targetEnd + 1;
        continue;
      }
    }

    if (character === '`') {
      const close = markdown.indexOf('`', index + 1);
      if (close > index + 1) {
        nodes.push({ type: 'code', value: markdown.slice(index + 1, close) });
        index = close + 1;
        continue;
      }
    }

    const marker = markdown.slice(index, index + 2);
    if (marker === '**' || marker === '__') {
      const close = markdown.indexOf(marker, index + 2);
      if (close > index + 2 && markdown[index + 2] !== ' ' && markdown[close - 1] !== ' ') {
        nodes.push({ type: 'strong', children: parseLearningInline(markdown.slice(index + 2, close), depth + 1) });
        index = close + 2;
        continue;
      }
    }

    if ((character === '*' || character === '_') && markdown[index + 1] !== character) {
      const close = markdown.indexOf(character, index + 1);
      const left = markdown[index - 1] || '';
      if (close > index + 1 && markdown[index + 1] !== ' ' && markdown[close - 1] !== ' '
        && !(character === '_' && /[A-Za-z0-9]/.test(left))) {
        nodes.push({ type: 'emphasis', children: parseLearningInline(markdown.slice(index + 1, close), depth + 1) });
        index = close + 1;
        continue;
      }
    }

    pushText(nodes, character);
    index += 1;
  }

  return nodes;
}

interface ListMarker {
  ordered: boolean;
  start: number;
  text: string;
}

function listMarker(line: string): ListMarker | null {
  const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
  if (unordered) return { ordered: false, start: 1, text: unordered[1] };
  const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
  if (ordered) return { ordered: true, start: Number(ordered[1]), text: ordered[2] };
  return null;
}

export function parseLearningMarkdown(markdown: string | null | undefined): LearningMarkdownBlock[] {
  const normalized = normalizeLearningMarkdown(markdown);
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const blocks: LearningMarkdownBlock[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    const text = paragraph.join(' ').trim();
    if (text) blocks.push({ type: 'paragraph', text });
    paragraph = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^```([^`]*)$/);
    if (fence) {
      flushParagraph();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'codeBlock', value: code.join('\n') });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: 'rule' });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      const quoted: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoted.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'blockquote', children: parseLearningMarkdown(quoted.join('\n')) });
      continue;
    }

    const firstMarker = listMarker(line);
    if (firstMarker) {
      flushParagraph();
      const items = [firstMarker.text];
      index += 1;
      while (index < lines.length) {
        const next = listMarker(lines[index]);
        if (!next || next.ordered !== firstMarker.ordered) break;
        items.push(next.text);
        index += 1;
      }
      blocks.push({ type: 'list', ordered: firstMarker.ordered, start: firstMarker.start, items });
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
}
