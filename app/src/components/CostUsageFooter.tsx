import { WifiSlash } from '@phosphor-icons/react';
import { CostSummary } from '../api';
import './CostUsageFooter.css';

export function formatTokens(total: number): string {
  return Math.round(total).toLocaleString('pt-BR');
}

// versao compacta (18,3M / 412k) pro resumo em cima do card raiz.
export function formatTokensCompact(total: number): string {
  const n = Math.round(total);
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return n.toLocaleString('pt-BR');
}

export function formatBrlCompact(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

interface Props {
  summary: CostSummary | null;
  // true quando o poll MAIS RECENTE de /api/cost-summary falhou — nesse
  // caso mostra so um icone de "sem conexao", nunca o ultimo numero
  // conhecido (que ficaria parecendo atual sem ser).
  connectionError?: boolean;
}

// so exibe o agregado geral — o polling em si e feito uma unica vez em
// SessionTree (compartilhado com o custo por card), pra nao duplicar a
// mesma chamada de rede duas vezes por ciclo.
export default function CostUsageFooter({ summary, connectionError }: Props) {
  if (connectionError) {
    return (
      <div
        className="cost-usage-footer cost-usage-footer-error"
        title="não foi possível consultar o backend agora — o custo mostrado antes pode estar desatualizado"
      >
        <WifiSlash size={12} /> sem conexão
      </div>
    );
  }

  if (!summary || summary.tokensTotal === 0) return null;

  return (
    <div className="cost-usage-footer" title="consumo acumulado das sessões atuais, lido da telemetria nativa de cada CLI">
      {formatTokens(summary.tokensTotal)} tokens
      {summary.costAvailable !== false ? ` · ~${formatBrl(summary.costBrl)}` : ''}
    </div>
  );
}
