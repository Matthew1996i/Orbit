import { fetchLlms, fetchUsage, LlmCli } from '../api';
import { CLAUDE_LLM_OPTION } from './llmLogos';

// lista completa de LLMs (Claude + as demais CLIs conhecidas, ver
// KNOWN_LLM_CLIS em server.py), com o status do Claude sobrescrito pelo
// status REAL de autenticacao — Claude nao vem de /api/llms (essa CLI e o
// proprio app, ver CLAUDE_LLM_OPTION), entao precisa de uma segunda chamada
// pra saber se esta logado. Usado por qualquer tela que precise da lista
// completa (Sidebar, telas cheias de catalogo/detalhe de LLM) — centralizado
// aqui pra nao duplicar essa combinacao em cada lugar.
export async function fetchAllLlms(): Promise<LlmCli[]> {
  // as duas chamadas sao independentes (uma le CLIs instaladas no disco, a
  // outra faz um round-trip de rede pro status de uso do Claude) — rodar em
  // paralelo evita que a lista inteira espere o dobro do tempo (uma
  // esperando a outra) so pra sobrescrever o status do Claude no final.
  const [llmsResult, usageResult] = await Promise.allSettled([fetchLlms(), fetchUsage()]);

  let llms: LlmCli[] =
    llmsResult.status === 'fulfilled'
      ? [CLAUDE_LLM_OPTION, ...llmsResult.value.llms]
      : [CLAUDE_LLM_OPTION];

  if (usageResult.status === 'fulfilled') {
    const { claudeAuthenticated, claudePath } = usageResult.value;
    llms = llms.map((llm) =>
      llm.id === 'claude'
        ? {
            ...llm,
            connected: claudeAuthenticated,
            status: claudeAuthenticated ? 'connected' : 'installed',
            // path real do binario (ver find_claude_bin_path em server.py)
            // em vez do placeholder "claude" fixo — mesma info que as
            // outras LLMs mostram em Configuracoes.
            path: claudePath ?? llm.path,
          }
        : llm,
    );
  }
  // status/path do claude ficam no placeholder se essa chamada falhar.
  return llms;
}
