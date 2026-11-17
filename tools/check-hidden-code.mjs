// Fails when a tracked source file has a line too long to be written by hand.
//
// This repository was once pushed to with a payload appended to config files after thousands of
// spaces, so it sat outside the visible part of the line in every diff view. Linting for eval()
// is not enough: one of the two copies did not use it. Line length is the reliable signal.
//
//   node tools/check-hidden-code.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const LONGEST_LINE = 1000;
const SOURCE = /\.(m?[jt]sx?|cjs|astro|vue|json|ya?ml|sh|mdx?)$/;
const SKIPPED = [/^pnpm-lock\.yaml$/, /(^|\/)CHANGELOG\.md$/];

const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => SOURCE.test(file) && !SKIPPED.some((pattern) => pattern.test(file)));

const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted in the working tree
  }
  text.split('\n').forEach((line, index) => {
    if (line.length > LONGEST_LINE) {
      findings.push(`${file}:${index + 1} is ${line.length} characters long`);
    }
    if (/\S\s{200,}\S/.test(line)) {
      findings.push(`${file}:${index + 1} has code after a long run of whitespace`);
    }
  });
}

if (findings.length > 0) {
  console.error('Possible hidden code. Read the full line before trusting it:\n');
  findings.forEach((finding) => console.error(`  ${finding}`));
  process.exit(1);
}
console.log(`No hidden code in ${files.length} source files.`);
