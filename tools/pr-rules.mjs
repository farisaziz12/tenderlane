// The rules every pull request description must meet (.github/workflows/pr-rules.yml).
// Plain JavaScript so the workflow can import it without a build. Check locally with:
//   node tools/pr-rules.mjs <body.md> <changed-file>...

const VISUAL_FILES = [/^docs-site\/src\//, /^examples\/[^/]+\/app\//];
const LIBRARY_SOURCE = [/^packages\/[^/]+\/src\//];
const CHANGESET = [/^\.changeset\/[^/]+\.md$/];
const REQUIRED_SECTIONS = ['Change', 'Why', 'Before → After'];
const MOST_VISIBLE_WORDS = 100;

const IMAGE =
  /!\[[^\]]*\]\([^)]+\)|<img\s[^>]*src=|https:\/\/github\.com\/user-attachments\/assets\/\S+|\.(png|jpe?g|gif|webp)\b/i;
const CONVENTIONAL =
  /^(feat|fix|perf|refactor|revert|docs|test|build|ci|chore|style)(\([\w./-]+\))?!?: .+$/;

const withoutComments = (text) => text.replace(/<!--[\s\S]*?-->/g, '');

/** The text under a `## Heading`, without HTML comments, trimmed. */
export function section(body, heading) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`,
  );
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s|^<details>/.test(line));
  return withoutComments((end === -1 ? rest : rest.slice(0, end)).join('\n')).trim();
}

/** Words a reader sees without opening the collapsed block; URLs and image markup don't count. */
export function visibleWords(body) {
  return withoutComments(body.replace(/\r\n/g, '\n'))
    .replace(/<details>[\s\S]*?<\/details>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)|<img\s[^>]*>|https?:\/\/\S+/g, '')
    .split(/\s+/)
    .filter((word) => /\w/.test(word)).length;
}

const touches = (files, patterns) =>
  files.some((file) => patterns.some((pattern) => pattern.test(file)));

/**
 * @param {{ body?: string | null, files: string[], title?: string, author?: string }} pullRequest
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkPullRequest({ body, files, title, author }) {
  const errors = [];
  const warnings = [];
  const text = body ?? '';

  // Release and dependency bots write their own descriptions.
  if (author && /\[bot\]$/.test(author)) return { errors, warnings };

  for (const heading of REQUIRED_SECTIONS) {
    const content = section(text, heading);
    if (content === undefined) errors.push(`Missing "## ${heading}" (use the PR template).`);
    else if (content === '') errors.push(`"## ${heading}" is empty.`);
  }

  if (touches(files, VISUAL_FILES) && !IMAGE.test(withoutComments(text))) {
    errors.push(
      'docs-site/ or examples/ changed: add before and after screenshots (node tools/shot.mjs).',
    );
  }

  const words = visibleWords(text);
  if (words > MOST_VISIBLE_WORDS) {
    warnings.push(
      `${words} visible words; aim for under ${MOST_VISIBLE_WORDS}. Move detail into the collapsed block.`,
    );
  }

  if (touches(files, LIBRARY_SOURCE) && !touches(files, CHANGESET)) {
    warnings.push('packages/*/src changed without a changeset (pnpm changeset).');
  }

  if (title !== undefined && !CONVENTIONAL.test(title)) {
    warnings.push('Title is not a conventional commit, e.g. "fix(core): validate quantity".');
  }

  return { errors, warnings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const [bodyPath, ...files] = process.argv.slice(2);
  const result = checkPullRequest({ body: readFileSync(bodyPath, 'utf8'), files });
  result.warnings.forEach((warning) => console.warn(`warning: ${warning}`));
  result.errors.forEach((error) => console.error(`error: ${error}`));
  process.exit(result.errors.length > 0 ? 1 : 0);
}
