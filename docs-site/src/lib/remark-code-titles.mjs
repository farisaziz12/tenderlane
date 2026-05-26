import { visit } from 'unist-util-visit';

const TITLE_RE = /title=(?:"([^"]+)"|'([^']+)')/;

export default function remarkCodeTitles() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (!node.meta || index === null || index === undefined || !parent) return;
      const match = node.meta.match(TITLE_RE);
      if (!match) return;
      const title = match[1] ?? match[2];

      const cleanedMeta = node.meta.replace(TITLE_RE, '').trim();
      node.meta = cleanedMeta.length > 0 ? cleanedMeta : null;

      const figcaption = {
        type: 'paragraph',
        data: {
          hName: 'figcaption',
          hProperties: { class: 'code-figcaption' },
        },
        children: [{ type: 'text', value: title }],
      };

      const figure = {
        type: 'paragraph',
        data: {
          hName: 'figure',
          hProperties: { class: 'code-figure' },
        },
        children: [figcaption, { ...node }],
      };

      parent.children[index] = figure;
    });
  };
}
