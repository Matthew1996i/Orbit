import { Fragment, ReactNode } from 'react';
import './DiffBlock.css';

const KEYWORDS_BY_LANG: Record<string, string[]> = {
  python: [
    'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or',
    'import', 'from', 'as', 'with', 'try', 'except', 'finally', 'raise', 'pass', 'break', 'continue',
    'lambda', 'yield', 'global', 'nonlocal', 'assert', 'del', 'is', 'None', 'True', 'False', 'async', 'await', 'self',
  ],
  js: [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'in', 'of', 'new',
    'class', 'extends', 'import', 'export', 'from', 'as', 'default', 'try', 'catch', 'finally', 'throw',
    'async', 'await', 'yield', 'typeof', 'instanceof', 'this', 'super', 'null', 'undefined', 'true', 'false',
    'interface', 'type', 'enum', 'implements', 'public', 'private', 'protected', 'readonly', 'static', 'void',
  ],
  css: ['important'],
};

const EXT_TO_LANG: Record<string, keyof typeof KEYWORDS_BY_LANG> = {
  py: 'python',
  js: 'js', jsx: 'js', ts: 'js', tsx: 'js', mjs: 'js', cjs: 'js',
  css: 'css',
};

/** Highlight leve baseado em regex — não é um parser de verdade, só reconhece
 * comentário / string / número / palavra-chave por padrão textual. O bastante
 * pra parecer um editor de código, sem trazer uma lib inteira de highlight. */
function highlightLine(text: string, lang: keyof typeof KEYWORDS_BY_LANG | null): ReactNode[] {
  if (!lang) return [text];
  const keywords = new Set(KEYWORDS_BY_LANG[lang]);
  const commentRe = lang === 'python' ? /#.*/ : /\/\/.*/;

  const commentMatch = text.match(commentRe);
  const codePart = commentMatch ? text.slice(0, commentMatch.index) : text;
  const commentPart = commentMatch ? text.slice(commentMatch.index) : '';

  const tokenRe = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+\.?\d*\b|\b[A-Za-z_][A-Za-z0-9_]*\b/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRe.exec(codePart))) {
    if (match.index > lastIndex) {
      nodes.push(<Fragment key={key++}>{codePart.slice(lastIndex, match.index)}</Fragment>);
    }
    const token = match[0];
    if (/^["'`]/.test(token)) {
      nodes.push(<span key={key++} className="code-string">{token}</span>);
    } else if (/^\d/.test(token)) {
      nodes.push(<span key={key++} className="code-number">{token}</span>);
    } else if (keywords.has(token)) {
      nodes.push(<span key={key++} className="code-keyword">{token}</span>);
    } else {
      nodes.push(<Fragment key={key++}>{token}</Fragment>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < codePart.length) {
    nodes.push(<Fragment key={key++}>{codePart.slice(lastIndex)}</Fragment>);
  }
  if (commentPart) {
    nodes.push(<span key={key++} className="code-comment">{commentPart}</span>);
  }
  return nodes;
}

type DiffLine = { kind: 'context' | 'add' | 'remove'; text: string };

const LCS_LINE_LIMIT = 400; // acima disso, LCS O(n*m) fica caro demais pra UI — cai pro modo posicional

/** Diff de linhas via LCS clássico (programação dinâmica). Bom o bastante pra
 * blocos de código de tamanho normal — não é Myers otimizado, mas não precisa
 * ser: é só pra reconstruir visualmente o que mudou, igual o terminal real. */
function lcsDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const n = oldLines.length;
  const m = newLines.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      result.push({ kind: 'context', text: oldLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ kind: 'remove', text: oldLines[i] });
      i++;
    } else {
      result.push({ kind: 'add', text: newLines[j] });
      j++;
    }
  }
  while (i < n) result.push({ kind: 'remove', text: oldLines[i++] });
  while (j < m) result.push({ kind: 'add', text: newLines[j++] });
  return result;
}

/** Fallback O(n) pra blocos grandes: compara posicionalmente (linha i do velho
 * vs linha i do novo) — menos preciso que LCS quando há linhas inseridas no
 * meio, mas não trava a UI em arquivos grandes. */
function positionalDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i++) {
    const o = oldLines[i];
    const nline = newLines[i];
    if (o === undefined) {
      result.push({ kind: 'add', text: nline });
    } else if (nline === undefined) {
      result.push({ kind: 'remove', text: o });
    } else if (o === nline) {
      result.push({ kind: 'context', text: o });
    } else {
      result.push({ kind: 'remove', text: o });
      result.push({ kind: 'add', text: nline });
    }
  }
  return result;
}

function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];
  if (oldLines.length === 0) return newLines.map((text) => ({ kind: 'add', text }));
  if (oldLines.length > LCS_LINE_LIMIT || newLines.length > LCS_LINE_LIMIT) {
    return positionalDiff(oldLines, newLines);
  }
  return lcsDiff(oldLines, newLines);
}

interface Props {
  file: string;
  oldText: string;
  newText: string;
}

export default function DiffBlock({ file, oldText, newText }: Props) {
  const lines = diffLines(oldText, newText);
  const added = lines.filter((l) => l.kind === 'add').length;
  const removed = lines.filter((l) => l.kind === 'remove').length;

  const fileName = file.split('/').pop() || file;
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined;
  const lang = ext ? EXT_TO_LANG[ext] ?? null : null;

  return (
    <div className="transcript-turn transcript-diff-turn">
      <span className="transcript-marker transcript-marker-diff">●</span>
      <div className="transcript-body">
        <div className="diff-header">
          Update<span className="diff-header-file">({fileName})</span>
        </div>
        <div className="diff-subitem">
          <span className="transcript-subitem-branch">└</span>
          <span>
            {added > 0 && (
              <span className="diff-summary-added">Added {added} {added === 1 ? 'line' : 'lines'}</span>
            )}
            {added > 0 && removed > 0 && ', '}
            {removed > 0 && (
              <span className="diff-summary-removed">removed {removed} {removed === 1 ? 'line' : 'lines'}</span>
            )}
          </span>
        </div>
        <div className="diff-block">
          {lines.map((line, idx) => {
            const sign = line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' ';
            return (
              <div key={idx} className={`diff-line diff-line-${line.kind}`}>
                <span className="diff-line-no">{idx + 1}</span>
                <span className="diff-line-sign">{sign}</span>
                <span className="diff-line-text">{highlightLine(line.text, lang)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
