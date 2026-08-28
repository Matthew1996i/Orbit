import { WifiOff } from 'lucide-react';
import { CostSummary } from '../api';
import './CostUsageFooter.css';

export function formatTokens(total: number): string {
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(2)}M`;
  if (total >= 1_000) return `${(total / 1_000).toFixed(1)}k`;
  return `${total}`;
}

export function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
        <WifiOff size={12} /> sem conexão
      </div>
    );
  }

  if (!summary || summary.tokensTotal === 0) return null;

  return (
    <div className="cost-usage-footer" title="custo estimado com base nos preços por modelo configurados localmente">
      {formatTokens(summary.tokensTotal)} tokens · ~{formatBrl(summary.costBrl)}
    </div>
  );
}
