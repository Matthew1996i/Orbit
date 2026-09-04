// classificacao best-effort (nao vem de nenhuma API) de cada CLI como
// "gratuita" (roda local ou tem uso gratis sem cartao) ou "paga" (exige
// assinatura/chave paga do provedor pra funcionar de verdade) — usada so pro
// chip informativo no catalogo, nao afeta login/instalacao.
export type LlmPricing = 'free' | 'paid';

const PAID_LLM_IDS = new Set(['claude', 'codex', 'cursor-agent', 'amp', 'copilot']);

// as demais (gemini, antigravity, opencode, aider, ollama, llamafile,
// qwen-code, goose, openhands) sao open-source e/ou tem camada gratuita
// generosa sem cartao pra comecar a usar — aider/opencode/goose/openhands
// ainda pedem uma CHAVE DE API paga de algum provedor pra funcionar bem,
// mas a CLI em si e livre, entao entram como "free".
export function llmPricingFor(id: string): LlmPricing {
  return PAID_LLM_IDS.has(id) ? 'paid' : 'free';
}
