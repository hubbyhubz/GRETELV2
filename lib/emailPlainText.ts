const normalizeNewlines = (input: string) => input.replace(/\r\n?/g, '\n');

const stripMarkdownHeadings = (input: string) =>
  input
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}(={3,}|-{3,})\s*$/gm, '');

const normalizeBullets = (input: string) =>
  input.replace(/^(\s*)[*-]\s+/gm, '$1• ');

const stripBoldAndItalic = (input: string) => {
  let out = input;

  out = out.replace(/\*\*([^\n]+?)\*\*/g, '$1');
  out = out.replace(/__([^\n]+?)__/g, '$1');

  out = out.replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, '$1$2');
  out = out.replace(/(^|[^_])_(?!\s)([^_\n]+?)_(?!_)/g, '$1$2');

  return out;
};

const stripInlineCodeAndFences = (input: string) =>
  input
    .replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, '$1')
    .replace(/`([^`\n]+?)`/g, '$1');

const tidyWhitespace = (input: string) =>
  input
    .replace(/[\t ]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

export const normalizeEmailPlainText = (input: string): string => {
  if (!input) return '';

  let out = normalizeNewlines(input);

  out = stripInlineCodeAndFences(out);
  out = stripMarkdownHeadings(out);
  out = normalizeBullets(out);
  out = stripBoldAndItalic(out);
  out = tidyWhitespace(out);

  return out;
};

