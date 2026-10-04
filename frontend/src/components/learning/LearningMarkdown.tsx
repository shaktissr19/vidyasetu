import type { ElementType, ReactNode } from 'react';
import styles from '@/components/public/publicLearning.module.css';
import { parseLearningInline, parseLearningMarkdown, type LearningInlineNode, type LearningMarkdownBlock } from '@/lib/learningMarkdown';

function renderInline(nodes: LearningInlineNode[], prefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${prefix}-${index}`;
    if (node.type === 'text') return node.value;
    if (node.type === 'code') return <code key={key}>{node.value}</code>;
    if (node.type === 'strong') return <strong key={key}>{renderInline(node.children, key)}</strong>;
    if (node.type === 'emphasis') return <em key={key}>{renderInline(node.children, key)}</em>;
    return (
      <a key={key} href={node.href} target={node.external ? '_blank' : undefined} rel={node.external ? 'noopener noreferrer' : undefined}>
        {renderInline(node.children, key)}
      </a>
    );
  });
}

function renderBlocks(blocks: LearningMarkdownBlock[], prefix: string): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${prefix}-${index}`;
    if (block.type === 'heading') {
      // Resource titles already provide the page's h1; body headings start at h2.
      const Heading = `h${Math.min(6, block.level + 1)}` as ElementType;
      return <Heading key={key}>{renderInline(parseLearningInline(block.text), key)}</Heading>;
    }
    if (block.type === 'paragraph') return <p key={key}>{renderInline(parseLearningInline(block.text), key)}</p>;
    if (block.type === 'list') {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List key={key} start={block.ordered && block.start > 1 ? block.start : undefined}>
          {block.items.map((item, itemIndex) => <li key={`${key}-item-${itemIndex}`}>{renderInline(parseLearningInline(item), `${key}-item-${itemIndex}`)}</li>)}
        </List>
      );
    }
    if (block.type === 'blockquote') return <blockquote key={key}>{renderBlocks(block.children, `${key}-quote`)}</blockquote>;
    if (block.type === 'codeBlock') return <pre key={key}><code>{block.value}</code></pre>;
    return <hr key={key} />;
  });
}

export default function LearningMarkdown({
  body,
  tone = 'default',
  className,
}: {
  body?: string | null;
  tone?: 'default' | 'inverse';
  className?: string;
}) {
  const classes = [styles.learningMarkdown, tone === 'inverse' ? styles.learningMarkdownInverse : '', className || '']
    .filter(Boolean)
    .join(' ');

  return <div className={classes}>{renderBlocks(parseLearningMarkdown(body), 'lesson')}</div>;
}
