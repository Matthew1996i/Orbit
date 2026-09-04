// CLIs cujo login (ver KNOWN_LLM_CLIS em server.py) e o proprio binario sem
// subcomando dedicado (ex: so "gemini") OU tem um menu interativo antes de
// abrir o navegador (ex: "gh auth login" pergunta tipo de conta/protocolo) —
// sem alguem apertando Enter, o processo fica parado esperando pra sempre.
// Como o fluxo de conectar nunca mostra terminal (ver InstallLogView.tsx),
// essas usam autopilot: manda Enter sozinho a cada pausa na saida, aceitando
// a opcao padrao/destacada do menu, ate a CLI abrir o navegador.
//
// Goose (`goose configure`) fica DE FORA de proposito — o setup dela pede
// pra DIGITAR uma chave de API de verdade, nao so navegar um menu; nao tem
// resposta automatica segura pra isso, entao o botao de conectar nem
// aparece pra ela (ver server.py/LlmCli — deixamos `login` vazio).
const AUTOPILOT_LOGIN_IDS = new Set(['gemini', 'qwen-code', 'antigravity', 'copilot']);

export function llmNeedsAutopilot(id: string): boolean {
  return AUTOPILOT_LOGIN_IDS.has(id);
}
