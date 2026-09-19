# Orbit 1.0.27 — Melhorias de performance

Esta versão parte da 1.0.26 e inclui as otimizações gerais do commit 858238b, sem o Astra 3D.

- Rotas e 15 telas de gerenciamento carregadas sob demanda; imports de logos limitados aos SVGs utilizados.
- Consultas de sessões, custos, CLIs e uso pausadas enquanto a janela está oculta, com atualização ao retornar e sem requisições sobrepostas por assinatura.
- Descoberta de CLIs a cada 30 segundos; contadores de agentes continuam acompanhando o estado das sessões.
- Atualizações dos transcripts agrupadas em intervalos de 100 ms e reaproveitamento de diffs inalterados.
- Verificações de prompts por lote processado pelo terminal; verificação de dimensões a cada segundo, preservando resize imediato por eventos.
- Janelas destacadas recebem eventos apenas da própria sessão; reconexões evitam timers duplicados e falsos timeouts com janela oculta.
- Limpeza de buffers de sessões removidas, limite de 128 buffers com até 300 eventos cada e caches de metadados limitados a 256 entradas.
- Leitura dos históricos pelo final até encontrar os 400 eventos pedidos; leitura incremental em blocos de até 256 KiB, preservando UTF-8 incompleto.

## Validação local

- 29 testes frontend, 9 testes Python e 6 testes Electron aprovados.
- TypeScript e build de produção aprovados, com avisos de CSS do Ionic e tamanho de chunks.
- Benchmark sintético de 20 mil eventos / 13,036 MiB: pico de alocações Python de 43,009 MiB para 0,631 MiB; tempo de 158,3 ms para 3,3 ms nesta execução. Ambos retornaram os mesmos 400 eventos.
- Esses números medem somente a leitura do histórico, não a RAM total do aplicativo.

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

O smoke test usa backend simulado e agentes fictícios; requer ambiente gráfico e não instala o aplicativo.
