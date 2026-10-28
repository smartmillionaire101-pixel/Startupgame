/**
 * The English templates the engine writes for players to read: every inbox
 * notification (`notify(…, { text })`), and in the round-7 modules the
 * refusals (`ensure`/`fail`), a pitch's `reason` and the lines kept in
 * constant tables. Read from the engine source with the TypeScript parser;
 * `${…}` becomes `{}` (the French catalog's {placeholders}, unnamed).
 *
 * The client shows these through tx(), which matches a French entry with the
 * same words around its placeholders (i18n/index.ts).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export const ENGINE_SRC = join(__dirname, '..', '..', '..', 'packages', 'engine', 'src');

/** Round-7 modules whose refusals, reasons and line tables are covered too. */
export const ROUND7 = [
  'pitchmeeting.ts',
  'team.ts',
  'cofounders.ts',
  'rest.ts',
  'sales.ts',
  'salestalk.ts',
  'customer-interviews.ts',
];

export interface EngineText {
  file: string;
  line: number;
  text: string;
  /** The text with each `${a ? 'x' : 'y'}` spelled out, when it has some ("you’re now an …"). */
  variants: string[];
}

const literal = (e: ts.Expression): string | null =>
  ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) ? e.text : null;

/** A template's spelled-out forms: a choice between two literals gives one form each. */
function variantsOf(e: ts.TemplateExpression): string[] {
  let out = [e.head.text];
  for (const span of e.templateSpans) {
    const x = span.expression;
    const opts =
      ts.isConditionalExpression(x) && literal(x.whenTrue) !== null && literal(x.whenFalse) !== null
        ? [literal(x.whenTrue)!, literal(x.whenFalse)!]
        : ['{}'];
    out = out.flatMap((s) => opts.map((o) => `${s}${o}${span.literal.text}`));
  }
  return out.length > 1 && out.length <= 8 ? out : [];
}

/** Text with real words (not "{}: {}" or a lone "them"). */
const wordy = (s: string) => /[A-Za-z]{2,}/.test(s.replace(/\{\}/g, '')) && /\s/.test(s.trim());

function templatesOf(e: ts.Expression | undefined, out: { text: string; variants: string[] }[]) {
  if (!e) return;
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e))
    return templatesOf(e.expression, out);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
    out.push({ text: e.text, variants: [] });
    return;
  }
  if (ts.isTemplateExpression(e)) {
    let s = e.head.text;
    for (const span of e.templateSpans) {
      s += `{}${span.literal.text}`;
      templatesOf(span.expression, out);
    }
    out.push({ text: s, variants: variantsOf(e) });
    return;
  }
  if (ts.isConditionalExpression(e)) {
    templatesOf(e.whenTrue, out);
    templatesOf(e.whenFalse, out);
    return;
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    templatesOf(e.right, out);
  }
}

const calleeName = (c: ts.CallExpression) =>
  ts.isIdentifier(c.expression) ? c.expression.text : null;

export function engineTexts(): EngineText[] {
  const found: EngineText[] = [];
  const files = readdirSync(ENGINE_SRC).filter((f) => f.endsWith('.ts'));
  for (const file of files) {
    const src = readFileSync(join(ENGINE_SRC, file), 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
    const r7 = ROUND7.includes(file);
    const add = (node: ts.Node, e: ts.Expression | undefined) => {
      const out: { text: string; variants: string[] }[] = [];
      templatesOf(e, out);
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      for (const x of out)
        if (wordy(x.text))
          found.push({
            file,
            line,
            text: x.text.trim(),
            variants: x.variants.map((v) => v.trim()),
          });
    };
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const name = calleeName(node);
        if (name === 'notify') {
          const item = node.arguments[2];
          if (item && ts.isObjectLiteralExpression(item))
            for (const p of item.properties)
              if (ts.isPropertyAssignment(p) && p.name.getText(sf) === 'text')
                add(p, p.initializer);
        } else if (r7 && name === 'ensure') add(node, node.arguments[2]);
        else if (r7 && name === 'fail') add(node, node.arguments[1]);
        else if (r7 && name === 'spendHours') add(node, node.arguments[2]);
      } else if (
        r7 &&
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(node.left) &&
        node.left.name.text === 'reason'
      ) {
        add(node, node.right);
      } else if (
        r7 &&
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        /^[A-Z][A-Z_]+$/.test(node.name.text) &&
        node.initializer &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        for (const p of node.initializer.properties)
          if (ts.isPropertyAssignment(p)) add(p, p.initializer);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return found;
}

/** A catalog key or template with its placeholders unnamed: "{name} won" → "{} won". */
export const shape = (s: string) => s.replace(/\|[a-z]+$/, '').replace(/\{\w*\}/g, '{}');
