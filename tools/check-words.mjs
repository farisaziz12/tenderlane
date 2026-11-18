// Fails on words that docs/CONTEXT.md and docs/writing.md rule out, in everything a person
// reads: the website, the docs, the README, DEMO.md and the example app.
//
//   node tools/check-words.mjs
//
// Code is not checked: fenced code blocks, inline `code`, imports, comments in source files
// and the "don't" columns of the two guides themselves are skipped.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Words that say less than they seem to, and names we do not use. */
const RULED_OUT = [
  ['seamless(?:ly)?', 'say what makes it true'],
  ['effortless(?:ly)?', 'say what makes it true'],
  ['powerful', 'say what it does'],
  ['robust', 'say what it survives'],
  ['unified', 'say what is shared'],
  ['next-generation', 'say what is new'],
  ['enterprise-grade', 'say what it guarantees'],
  ['revolutioni[sz](?:e|es|ing)', 'say what changes'],
  ['blazing(?:ly)?', 'give the measurement'],
  ['orchestrat(?:e|es|ed|ing|ion|or)', 'say "picks the provider" or "routes the checkout"'],
  ['boundar(?:y|ies)', 'say who decides what'],
  ['headless', 'say "has no UI"'],
  ['leverag(?:e|es|ed|ing)', 'say "use"'],
  ['utili[sz](?:e|es|ed|ing)', 'say "use"'],
  ['PSPs?', 'say "provider"', 'exact'],
  ['learn more', 'say where the link goes'],
  ['click here', 'say where the link goes'],
  ['get started', 'say what the reader will do'],
  ['something went wrong', 'say what happened and what to do'],
];

const PROSE = ['README.md', 'DEMO.md'];
const DIRECTORIES = [
  ['docs-site/src/content/docs', /\.mdx?$/],
  ['docs-site/src/pages', /\.astro$/],
  ['docs-site/src/components', /\.astro$/],
  ['examples/react-checkout-multi-psp/app', /\.tsx$/],
];

function filesUnder(directory, pattern) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path, pattern);
    return pattern.test(entry.name) ? [path] : [];
  });
}

/** Blank out what is code, keeping line numbers. */
function proseOnly(source, file) {
  const blank = (match) => match.replace(/[^\n]/g, ' ');
  let text = source;
  if (/\.(mdx?|astro)$/.test(file)) {
    text = text
      .replace(/^---\n[\s\S]*?\n---/, (frontmatter) =>
        file.endsWith('.astro') ? blank(frontmatter) : frontmatter,
      )
      .replace(/```[\s\S]*?```/g, blank)
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, blank)
      .replace(/^import .*$/gm, blank);
  }
  if (file.endsWith('.tsx')) {
    text = text
      .replace(/\/\*[\s\S]*?\*\//g, blank)
      .replace(/^\s*\/\/.*$/gm, blank)
      .replace(/^import .*$/gm, blank);
  }
  return text.replace(/`[^`\n]*`/g, blank).replace(/\]\([^)]*\)/g, blank);
}

const findings = [];
const files = [...PROSE, ...DIRECTORIES.flatMap(([directory, pattern]) => filesUnder(directory, pattern))];

for (const file of files) {
  const lines = proseOnly(readFileSync(join(root, file), 'utf8'), file).split('\n');
  lines.forEach((line, index) => {
    const where = `${relative(root, join(root, file))}:${index + 1}`;
    for (const [pattern, advice, mode] of RULED_OUT) {
      const match = new RegExp(`\\b(${pattern})\\b`, mode === 'exact' ? '' : 'i').exec(line);
      if (match) findings.push(`${where} "${match[1]}": ${advice}`);
    }
    if (line.includes('—')) findings.push(`${where} em dash: use a full stop, a comma or a colon`);
  });
}

if (findings.length > 0) {
  console.error('Words that docs/CONTEXT.md and docs/writing.md rule out:\n');
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`No ruled-out words in ${files.length} files people read.`);
