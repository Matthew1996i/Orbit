import { useMemo, useState, type ReactNode } from 'react';
import { Check, Copy } from '@phosphor-icons/react';
import { marked, type Token, type Tokens } from 'marked';
import './AgentMarkdown.css';

const safeLink = (href: string): boolean => /^https?:\/\//i.test(href);

const CodeBlock = ({ code, language }: { code: string; language?: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  };
  return (
    <div className="agent-code-block">
      <div className="agent-code-toolbar">
        <span>{language || 'código'}</span>
        <button type="button" onClick={copy} aria-label="Copiar código">
          {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
};

const renderInline = (tokens: Token[]): ReactNode[] => tokens.map((token, index) => {
  const key = `${index}-${token.type}`;
  if (token.type === 'strong') return <strong key={key}>{renderInline((token as Tokens.Strong).tokens)}</strong>;
  if (token.type === 'em') return <em key={key}>{renderInline((token as Tokens.Em).tokens)}</em>;
  if (token.type === 'del') return <del key={key}>{renderInline((token as Tokens.Del).tokens)}</del>;
  if (token.type === 'codespan') return <code key={key}>{(token as Tokens.Codespan).text}</code>;
  if (token.type === 'br') return <br key={key} />;
  if (token.type === 'link') {
    const link = token as Tokens.Link;
    return safeLink(link.href)
      ? <a key={key} href={link.href} target="_blank" rel="noopener noreferrer" onClick={(event) => {
          if (window.dashboardAPI?.openExternal) {
            event.preventDefault();
            void window.dashboardAPI.openExternal(link.href);
          }
        }}>{renderInline(link.tokens)}</a>
      : <span key={key}>{renderInline(link.tokens)}</span>;
  }
  if (token.type === 'image') return <span key={key}>{(token as Tokens.Image).text}</span>;
  if (token.type === 'html') return <span key={key}>{token.raw}</span>;
  if (token.type === 'text' || token.type === 'escape') {
    const content = token as Tokens.Text;
    return <span key={key}>{content.tokens?.length ? renderInline(content.tokens) : content.text}</span>;
  }
  return <span key={key}>{token.raw}</span>;
});

const renderBlocks = (tokens: Token[]): ReactNode[] => tokens.map((token, index) => {
  const key = `${index}-${token.type}`;
  if (token.type === 'paragraph') return <p key={key}>{renderInline((token as Tokens.Paragraph).tokens)}</p>;
  if (token.type === 'text') {
    const content = token as Tokens.Text;
    return <p key={key}>{content.tokens?.length ? renderInline(content.tokens) : content.text}</p>;
  }
  if (token.type === 'heading') {
    const heading = token as Tokens.Heading;
    const children = renderInline(heading.tokens);
    if (heading.depth === 1) return <h2 key={key}>{children}</h2>;
    if (heading.depth === 2) return <h3 key={key}>{children}</h3>;
    return <h4 key={key}>{children}</h4>;
  }
  if (token.type === 'code') {
    const code = token as Tokens.Code;
    return <CodeBlock key={key} code={code.text} language={code.lang} />;
  }
  if (token.type === 'list') {
    const list = token as Tokens.List;
    const children = list.items.map((item, itemIndex) => (
      <li key={itemIndex}>
        {item.task && <input type="checkbox" checked={!!item.checked} readOnly aria-label="Item do plano" />}
        {renderBlocks(item.tokens)}
      </li>
    ));
    return list.ordered ? <ol key={key} start={Number(list.start) || 1}>{children}</ol> : <ul key={key}>{children}</ul>;
  }
  if (token.type === 'blockquote') return <blockquote key={key}>{renderBlocks((token as Tokens.Blockquote).tokens)}</blockquote>;
  if (token.type === 'hr') return <hr key={key} />;
  if (token.type === 'table') {
    const table = token as Tokens.Table;
    return <div className="agent-markdown-table" key={key}><table>
      <thead><tr>{table.header.map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell.tokens)}</th>)}</tr></thead>
      <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>
        {row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell.tokens)}</td>)}
      </tr>)}</tbody>
    </table></div>;
  }
  if (token.type === 'html') return <p key={key}>{token.raw}</p>;
  return null;
});

export const AgentMarkdown = ({ text }: { text: string }) => {
  const tokens = useMemo(() => marked.lexer(text, { gfm: true, breaks: true }), [text]);
  return <div className="agent-markdown">{renderBlocks(tokens)}</div>;
};
