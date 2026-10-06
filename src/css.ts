function skipQuotedValue(css: string, start: number): number {
  const quote = css[start];
  let index = start + 1;

  while (index < css.length) {
    if (css[index] === "\\") {
      index += 2;
    } else if (css[index] === quote) {
      return index + 1;
    } else {
      index += 1;
    }
  }

  return css.length;
}

function skipComment(css: string, start: number): number {
  const end = css.indexOf("*/", start + 2);
  return end === -1 ? css.length : end + 2;
}

function importEnd(css: string, start: number): number | undefined {
  let index = start + "@import".length;
  let parentheses = 0;

  while (index < css.length) {
    const character = css[index];

    if (character === "'" || character === '"') {
      index = skipQuotedValue(css, index);
    } else if (character === "/" && css[index + 1] === "*") {
      index = skipComment(css, index);
    } else if (character === "(") {
      parentheses += 1;
      index += 1;
    } else if (character === ")") {
      parentheses = Math.max(0, parentheses - 1);
      index += 1;
    } else if (character === ";" && parentheses === 0) {
      return index + 1;
    } else {
      index += 1;
    }
  }
}

/** Reports remote stylesheets loaded through a CSS @import directive. */
export function hasRemoteCssImport(css: string): boolean {
  return /@import\s+(?:url\(\s*)?["']?\s*(?:https?:)?\/\//i.test(css);
}

/** Removes complete CSS @import directives without misreading quoted URL data. */
export function stripCssImports(css: string): string {
  let result = "";
  let index = 0;
  let parentheses = 0;
  let blocks = 0;

  while (index < css.length) {
    const character = css[index];

    if (character === "'" || character === '"') {
      const next = skipQuotedValue(css, index);
      result += css.slice(index, next);
      index = next;
      continue;
    }

    if (character === "/" && css[index + 1] === "*") {
      const next = skipComment(css, index);
      result += css.slice(index, next);
      index = next;
      continue;
    }

    if (character === "(") {
      parentheses += 1;
    } else if (character === ")") {
      parentheses = Math.max(0, parentheses - 1);
    } else if (character === "{") {
      blocks += 1;
    } else if (character === "}") {
      blocks = Math.max(0, blocks - 1);
    }

    const directive = css.slice(index, index + "@import".length);
    const nextCharacter = css[index + "@import".length];
    const isImport =
      parentheses === 0 &&
      blocks === 0 &&
      directive.toLowerCase() === "@import" &&
      (nextCharacter === undefined || !/[a-z0-9_-]/i.test(nextCharacter));

    if (isImport) {
      const end = importEnd(css, index);
      if (end !== undefined) {
        index = end;
        continue;
      }
    }

    result += character;
    index += 1;
  }

  return result;
}

export function toShadowCss(css: string): string {
  return stripCssImports(css).replace(/:root\s*\{/g, ":host {");
}
