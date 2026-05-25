import { visit } from 'unist-util-visit';

const KIND_MAP = {
  note: { label: 'note', color: 'var(--info)' },
  tip: { label: 'tip', color: 'var(--accent)' },
  caution: { label: 'careful', color: 'var(--warn)' },
  warning: { label: 'warning', color: 'var(--warn)' },
  danger: { label: 'careful', color: 'var(--err)' },
};

export default function remarkCallouts() {
  return (tree) => {
    visit(tree, (node) => {
      if (node.type !== 'containerDirective') return;
      const kind = KIND_MAP[node.name];
      if (!kind) return;

      const data = node.data ?? (node.data = {});
      data.hName = 'aside';
      data.hProperties = {
        class: 'callout',
        style: `padding: 14px 18px; border-radius: 8px; margin: 18px 0; background: color-mix(in oklab, ${kind.color} 8%, var(--bg-1)); border: 1px solid color-mix(in oklab, ${kind.color} 30%, transparent); color: var(--text-1); display: flex; gap: 14px; align-items: flex-start; font-size: 14px;`,
      };

      const label = {
        type: 'paragraph',
        data: {
          hName: 'span',
          hProperties: {
            style: `color: ${kind.color}; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; flex-shrink: 0; margin-top: 2px;`,
          },
        },
        children: [{ type: 'text', value: kind.label }],
      };

      const body = {
        type: 'paragraph',
        data: {
          hName: 'div',
        },
        children: node.children ?? [],
      };

      node.children = [label, body];
    });
  };
}
