# Otimizações de desempenho — 16/09/2026

## Escopo

- Rotas e 15 telas de gerenciamento carregadas sob demanda. Logos importam apenas os SVGs usados, evitando os componentes de avatar e suas dependências.
- Consultas de sessões, custos, CLIs e uso pausam quando a janela está oculta. Cada assinatura aguarda a resposta antes de agendar outra consulta e atualiza ao voltar à janela.
- Descoberta de CLIs passa de 2 s para 30 s; contadores de agentes continuam vindo do estado de sessões. Alterações externas de instalação/autenticação podem levar até 30 s para aparecer no widget.
- Eventos do transcript agrupam atualizações de React em intervalos de 100 ms. Diffs inalterados reaproveitam a renderização.
- Terminais verificam prompts uma vez por lote processado pelo xterm, no máximo uma vez por frame. A verificação de segurança de dimensões passa de 100 ms para 1 s; ResizeObserver e resize da janela continuam imediatos. Desmontagem remove callbacks do socket antes de destruir o terminal.
- Janelas destacadas assinam apenas eventos da própria sessão. Reconexões evitam timers duplicados e falsos timeouts causados pela janela oculta.
- Buffers de sessões desaparecidas são removidos. O dashboard limita o número de buffers a 128, além do limite existente de 300 eventos por buffer. Os quatro caches de metadados de transcripts no backend ficam limitados a 256 entradas cada.
- O backend lê históricos de trás para frente até encontrar os 400 eventos pedidos. O índice Codex também é lido pelo final. Leitura incremental usa blocos de até 256 KiB, preserva bytes UTF-8 incompletos e descarta offsets de sessões encerradas. Linhas individuais excepcionalmente grandes ainda podem exigir memória proporcional ao seu tamanho.
- Astra usa renderização sob demanda com animação programada a 30 Hz, DPR 1, sombras 1024² e contexto sem antialias/transparência. Interações de câmera também podem solicitar frames. Ao trocar para a árvore, desmonta o canvas e seus recursos; ao reabrir, a câmera volta à posição inicial. A árvore mantém seu estado.
- A ocultação de obstáculos guarda somente as matrizes de cada obstáculo, em vez de copiar o lote inteiro para cada um.

## Evidências

### Histórico sintético, 20 mil eventos / 13,036 MiB

Medição local com `tracemalloc`, comparando o algoritmo anterior ao atual. Ambos retornam os mesmos 400 eventos, na mesma ordem.

| Medida | Anterior | Atual |
| --- | ---: | ---: |
| Pico de alocações Python | 44,234 MiB | 0,530 MiB |
| Tempo nessa execução | 0,1252 s | 0,0027 s |
| Eventos analisados, fixture sem ruído | 20.000 | 400 |

Esses números medem somente a leitura do histórico. Não representam economia percentual de RAM do app inteiro nem uma medição de VRAM.

### Electron com 24 agentes fictícios

Teste local no Electron do projeto, janela 1280×800 e backend simulado: árvore → Astra → árvore → janela oculta. Sem erros de console; canvas ausente na árvore, presente no Astra e removido ao retornar. Nenhuma nova consulta de interface no intervalo observado com a janela oculta. O script também registra heap JS e working set por processo para comparação futura.

Chromium pode manter páginas de memória e caches depois de descartar recursos; remover o canvas não implica queda imediata do RSS. O working set do processo GPU não equivale à VRAM. Não houve comparação de RAM total antes/depois nem validação em máquinas Windows/Linux ou hardware de entrada.

## Reprodução

```sh
python3 -m unittest discover -s tests -v
python3 tests/benchmark_history.py
cd app
npm run test.unit -- --run
npm run build
cd electron
npm test
./node_modules/.bin/electron tests/performance-smoke.cjs
```

O smoke test abre uma janela de teste com dados fictícios, intercepta as chamadas ao backend e não inicia agentes reais. Requer ambiente gráfico. O runner Vitest exclui metadados `._*` do macOS e deixa os testes Node do Electron para seu próprio runner.

Validação: 40 testes frontend, 9 testes Python e 6 testes Electron passaram; TypeScript e build de produção passaram. O lint global ainda encontra problemas preexistentes no código Electron/Capacitor e Sidebar, além de avisos de hooks e Fast Refresh. O build mantém avisos de CSS do Ionic e chunks grandes; não foi feita uma migração de framework ou de runtime.

Referências: [renderização sob demanda no React Three Fiber](https://r3f.docs.pmnd.rs/advanced/scaling-performance), [liberação de recursos no Three.js](https://threejs.org/manual/en/cleanup.html). O uso de `onWriteParsed` foi conferido nos tipos da versão instalada do xterm.
