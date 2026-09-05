# Especificação técnica — Tela full-screen de Skills (paridade com Agentes)

- **Repositório:** `/Users/mr_robot/Projects/llm-orquestrador` (Orbit — Electron + React 19 + TS + Vite)
- **Data:** 2026-09-05
- **Baseline:** commits `f44ce9c` (catálogo full-screen de LLM/Agentes) e `3da10de` (shell estilo VS Code)

---

## Objetivo & escopo

Levar a seção **Skills** ao mesmo patamar da seção **Agentes**: catálogo full-screen
com busca e agrupamento, criação, edição e **exclusão**, acessível pela Activity
Bar/Sidebar, persistindo a tela aberta entre refreshes — reaproveitando os componentes
já existentes em vez de duplicá-los.

### Entra no escopo

1. `SkillCatalogScreen` (tela cheia, listagem + busca + "Criar skill").
2. Edição/criação de skill reutilizando **`AgentEditScreen`** com `kind="skill"`
   (já suportado hoje: `SECTION_LABEL.skill`, `SECTION_SUBTITLE.skill`,
   `NEW_TEMPLATES.skill`), em vez do `AgentEditModal`.
3. Roteamento no `AppShell` (`FullScreen`), persistência em `uiPrefs`, e correção do
   "voltar" da tela de edição para o catálogo **da seção correta** (hoje volta sempre
   para o catálogo de agentes).
4. Wiring da Sidebar: seção `skills` deixa de abrir modal e passa a abrir catálogo/tela.
5. **Exclusão** de skill (não existe hoje para nenhum kind): novo endpoint no
   `server.py`, função em `api.ts`, ação na tela de edição e no card do catálogo, com
   `ConfirmDialog` (`danger`).
6. Extração de um componente de catálogo compartilhado, consumido por Agentes **e**
   Skills (sem duplicar `AgentCatalogScreen`).

### Fica de fora

- Seção **Commands** (continua no `AgentEditModal`). O `AgentEditModal` **não** deve
  ser removido nesta entrega — só deixa de ser usado por `skills`.
- Alterar o formato de arquivo de skill, o parser de frontmatter ou o "Gerar com IA".
- Instalação/importação de skills de fontes externas (marketplace/git).
- Tema escuro para as telas cheias (elas são brancas por decisão explícita — ver
  cabeçalho de `LlmScreens.css`).

---

## Estado atual verificado (terreno)

### Skills hoje

| Camada | Situação |
| --- | --- |
| Backend | `read_skills_catalog()` (`server.py`) lê `~/.claude/skills/<nome>/SKILL.md` e devolve `{name, description, version}` em `GET /api/catalog`. `_agent_file_path(name, kind="skill")` resolve `~/.claude/skills/<name>/SKILL.md` com validação `^[a-zA-Z0-9_-]+$` (anti path-traversal). `GET/POST /api/agent-file` já leem e gravam skill (o POST faz `mkdir(parents=True)`, então **criação já funciona**). **Não existe endpoint de exclusão para nenhum kind.** |
| API TS | `SkillDef`, `CatalogResponse.skills`, `AgentFileKind = 'agent' \| 'skill' \| 'command'`, `fetchAgentFile`, `saveAgentFile`, `generateMarkdownChat` — tudo já aceita `kind='skill'`. Falta `deleteAgentFile`. |
| Navegação | `sidebarSections.ts` já tem `{ key: 'skills', Icon: Puzzle, label: 'Skills' }` (Activity Bar OK). |
| Sidebar | `case 'skills'` lista as skills, mas o clique chama `setEditTarget(...)` → **`AgentEditModal`** (padrão antigo). O botão do cabeçalho é `Plus / "Criar skill"` → abre o modal em modo criação. |
| Tela cheia | **Não existe** `SkillCatalogScreen`. `AppShell.FullScreen` só conhece `llmCatalog \| llmDetail \| agentCatalog \| agentEdit`. |
| Edição | `AgentEditScreen` **já é genérico por kind** (labels, subtítulo e template de skill inclusos) — só nunca é acionado com `kind='skill'`. |

### Bug pré-existente a corrigir junto

`AppShell.tsx` monta `<AgentEditScreen ... onBack={openAgentCatalog} />` de forma fixa
e `fullScreenSection()` devolve `'agents'` para todo `agentEdit`. Com skills passando
a usar essa tela, o "voltar" cairia no catálogo de agentes e a troca de seção na
Activity Bar fecharia/manteria a tela na seção errada.

### Padrões estabelecidos pela tela de Agentes (o contrato a repetir)

1. **Tela cheia substitui o conteúdo, não é rota.** `AppShell` troca o conteúdo de
   `.orbit-content` por um componente conforme o estado `FullScreen`; ao abrir,
   `dismissSidebar()` fecha a sidebar/preview. Persistido em
   `dashboard.fullScreen` via `readPref/writePref` + `readFullScreen()` (parser
   defensivo, ignora payload desconhecido).
2. **Componente de tela autocontido:** busca os próprios dados (`fetchCatalog()`), não
   depende da Sidebar estar montada; props apenas de navegação (`onBack`, `onOpen*`,
   `onCreate*`).
3. **AntD escopado:** `<ConfigProvider theme={useLlmScreenTheme()}>` na raiz da tela;
   `Typography` (`Title level={3}`), `Input size="large"`, `Button` com classes
   `llm-btn llm-btn-primary` / `llm-btn-secondary`.
4. **Ícones:** exclusivamente `lucide-react`, tamanho 13 em botões, 14 na sidebar,
   16 no back/drawer, 20 no ícone de estado vazio (`strokeWidth={1.75}`).
5. **Cabeçalho:** `.<x>-catalog-toolbar` sticky com `.llm-screen-header`
   (botão `.llm-screen-back` com `aria-label="Voltar"` + `Title`/`Text`); busca e ação
   primária **fora** do cabeçalho, em `.<x>-catalog-toolbar-actions`.
6. **Conteúdo:** busca client-side (`useMemo` sobre nome+descrição, `trim().toLowerCase()`),
   agrupamento editorial em `.llm-group` (título maiúsculo + contagem), grid
   `auto-fill minmax(300px, 1fr)`, card `<button>` com nome + badge + descrição +
   meta + `ChevronRight.llm-card-chevron`.
7. **Estado vazio diferenciado:** "nenhum cadastrado" (ícone do domínio) vs. "nenhum
   encontrado" (ícone `SearchX`), com textos distintos.
8. **Textos em pt-BR**, sem i18n (o projeto não tem camada de i18n; não introduzir).
9. **CSS:** um `.css` irmão por componente, importado no topo do `.tsx`
   (`import './X.css'`), classes em kebab-case prefixadas pelo componente; cores
   literais (paleta zinc) nas telas brancas, `var(--orbit-accent, #18181b)` só para
   cor de destaque; comentários explicando o **porquê** de regras não óbvias.
10. **Comentários em português explicando intenção/decisão** (não o óbvio) — padrão
    forte e consistente em todo o repositório; a spec exige mantê-lo.
11. **Confirmação destrutiva:** `ConfirmDialog` com `danger` (mesmo componente já usado
    no app, CSS próprio, sem AntD Modal).

---

## Abordagem técnica

### Decisão central: extrair um catálogo compartilhado

`AgentCatalogScreen.tsx` (172 linhas) e o futuro `SkillCatalogScreen` diferem apenas em
**dados, agrupamento, textos e conteúdo do card**. Duplicar violaria o item 7 do
`PADRAO-ARQUITETURA-FRONTEND.md` ("componentes de design system não podem ter
comportamento hardcoded que deveria ser prop") e o limite de 150 linhas por arquivo.

**Criar `app/src/components/CatalogScreen.tsx` + `CatalogScreen.css`** — componente
apresentacional genérico (sem fetch, sem regra de domínio), com a API:

```ts
export interface CatalogGroup<T> { key: string; title: string; items: T[] }

interface CatalogScreenProps<T> {
  title: string;                    // "Agentes" | "Skills"
  subtitle: string;
  groups: CatalogGroup<T>[];        // já filtrados/ordenados pelo dono da tela
  query: string;
  onQueryChange: (q: string) => void;
  searchPlaceholder?: string;       // default: "Buscar por nome ou descrição…"
  createLabel: string;              // "Criar agente" | "Criar skill"
  onCreate: () => void;
  onBack: () => void;
  itemKey: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;   // corpo do card (.catalog-card-body)
  onOpenItem: (item: T) => void;
  totalCount: number;               // pra distinguir "vazio" de "sem resultado"
  emptyIcon: React.ReactNode;       // <Bot/> | <Puzzle/>
  emptyTitle: string;
  emptyText: string;
  noResultText: string;
  cardActions?: (item: T) => React.ReactNode;  // ex.: botão de excluir no card
}
```

Regras da extração:

- `CatalogScreen` é **genérico e burro**: `ConfigProvider` + toolbar + busca + botão de
  criar + estado vazio + `.llm-group` + grid + card `<button>` + `ChevronRight`.
  Nenhuma menção a agente/skill no código.
- **CSS:** mover as regras de `AgentCatalogScreen.css` para `CatalogScreen.css`
  renomeando o prefixo `.agent-catalog-*` → `.catalog-*` (`.catalog-screen`,
  `.catalog-toolbar`, `.catalog-toolbar-actions`, `.catalog-grid`, `.catalog-card`,
  `.catalog-card-body`, `.catalog-card-name-row`, `.catalog-card-name`,
  `.catalog-card-badge`, `.catalog-card-desc`, `.catalog-card-desc-empty`,
  `.catalog-card-meta`). Manter sem renomear as classes já compartilhadas por convenção
  (`.llm-screen-*`, `.llm-catalog-search`, `.llm-catalog-empty*`, `.llm-group*`,
  `.llm-card-chevron`, `.llm-btn*`) e o `import './LlmScreens.css'`.
  Após a migração, `AgentCatalogScreen.css` deve ser **removido** (não deixar arquivo
  órfão) — o que sobrar de específico de agente vira regra em `CatalogScreen.css` ou
  é absorvido pelo `renderCard`.
- `AgentCatalogScreen.tsx` é **refatorado** para consumir `CatalogScreen` mantendo
  intactos: tiers `opus/sonnet/haiku/other`, `agentSubtitle()`, `toolCountOf()`,
  textos e comportamento. **Nenhuma mudança visual perceptível em Agentes.**
- `SkillCatalogScreen.tsx` novo, no mesmo formato.

> **Plano B (só se a refatoração de Agentes se mostrar arriscada em revisão):** manter
> `AgentCatalogScreen` como está e criar `SkillCatalogScreen` espelhado. Isso deve ser
> registrado explicitamente como dívida no PR — não é o caminho preferido.

### `SkillCatalogScreen.tsx` (novo)

- Fetch próprio: `fetchCatalog().then(c => setSkills(c.skills)).catch(() => setSkills([]))`.
- Filtro por `name` + `description` (mesma normalização do catálogo de agentes).
- **Agrupamento** (equivalente aos tiers de modelo, mas honesto para o domínio):
  `Versionadas` (skills com `version` não vazio, ordenadas por nome) e `Sem versão`.
  Grupos vazios são omitidos (`.filter(g => g.items.length)`), igual ao padrão atual.
- **Card:** nome + badge `v{version}` (mesmo formato da Sidebar, `.catalog-card-badge`),
  descrição com fallback `"Sem descrição"` usando `.catalog-card-desc-empty`, e
  `.catalog-card-meta` com o caminho relativo `skills/{name}/SKILL.md` (informação útil
  e verificável; **não** inventar contagens que o backend não fornece).
- Estado vazio: ícone `Puzzle` (mesmo da seção na Activity Bar), título
  `"Nenhuma skill cadastrada"`, texto `"Crie a primeira skill com o botão acima."`;
  sem resultado: `Nenhuma skill encontrada` + `Não encontramos resultados para "{query}"…`.
- Props: `{ onBack, onOpenSkill(name, subtitle?), onCreateSkill, onDeleteSkill? }`.
- Recarrega a lista ao voltar do foco/depois de excluir (`reload()` exposto internamente).

### Roteamento — `AppShell.tsx`

```ts
type FullScreen =
  | { kind: 'llmCatalog' }
  | { kind: 'llmDetail'; id: string }
  | { kind: 'agentCatalog' }
  | { kind: 'skillCatalog' }
  | { kind: 'agentEdit'; name: string; fileKind: AgentFileKind; subtitle?: string; isNew?: boolean };
```

- `readFullScreen()`: aceitar `'skillCatalog'` (mantendo o parse defensivo).
- `fullScreenSection()`: `skillCatalog` → `'skills'`; `agentEdit` → `'skills'` quando
  `fileKind === 'skill'`, `'commands'` quando `'command'`, senão `'agents'`.
- Novos handlers `openSkillCatalog()` / `openSkillEdit(name, subtitle?, isNew?)` — ambos
  chamam `dismissSidebar()` antes de `setFullScreen`, igual aos de agente.
  `openSkillEdit` reusa `{ kind: 'agentEdit', fileKind: 'skill' }` (a tela de edição já
  é multi-kind; **não** criar um `skillEdit` separado).
- Render: `fullScreen.kind === 'skillCatalog'` → `<SkillCatalogScreen ... />`.
- **Correção do voltar:** `onBack` do `AgentEditScreen` passa a ser derivado do
  `fileKind` — `fileKind === 'skill' ? openSkillCatalog : openAgentCatalog`
  (para `'command'`, `closeFullScreen`, já que não há catálogo de comandos).
- Passar `onOpenSkillCatalog` / `onOpenSkillEdit` para **as duas** instâncias de
  `Sidebar` (fixada e preview de hover) — esquecer a segunda é um erro fácil aqui.

### Sidebar — `Sidebar.tsx`

- Novas props opcionais `onOpenSkillCatalog?: () => void` e
  `onOpenSkillEdit?: (name: string, subtitle?: string, isNew?: boolean) => void`.
- `onAdd.skills` passa de `{ label: 'Criar skill', icon: Plus }` para
  `{ label: 'Ver catálogo de skills', icon: LayoutGrid, onClick: () => onOpenSkillCatalog?.() }`
  — coerente com a regra de intenção já documentada no arquivo ("`+` só para o que cria
  na hora; catálogo usa a grade").
- `case 'skills'`: o clique no item chama `onOpenSkillEdit?.(skill.name, skill.version ? \`versão: ${skill.version}\` : undefined)` em vez de `setEditTarget`.
- Adicionar estado vazio `"Nenhuma skill configurada"` (hoje a seção renderiza lista
  vazia sem mensagem — os casos `commands`/`mcps`/`secrets` já têm `.sidebar-empty`).
- **Manter** `editTarget`/`AgentEditModal` para `commands`. Atualizar o comentário do
  bloco de props que ainda diz "skills/commands continuam no AgentEditModal".

### Exclusão (novo em toda a stack)

**Backend — `server.py`** (junto do handler `POST /api/agent-file`, mesma convenção
`/delete` usada em secrets e ai-providers):

```
POST /api/agent-file/delete   body: { name, kind }
```

- Resolver via `_agent_file_path(name, kind)`; `None` → `{"error": "nome inválido"}` 400.
- Inexistente → `{"error": "não encontrado"}` 404.
- `kind == "skill"`: remover o **diretório** `~/.claude/skills/<name>/` inteiro
  (`shutil.rmtree`), pois a skill é uma pasta. Antes de remover, **validar que o
  diretório resolvido está de fato sob `CLAUDE_DIR / "skills"`** (`Path.resolve()` +
  checagem de prefixo, como já é feito para o `STATIC_DIR`) — defesa em profundidade
  além do regex de nome, por ser uma operação recursiva e irreversível.
- `kind` `agent`/`command`: `fpath.unlink()`.
- `OSError` → `{"error": str(e)}` 500. Sucesso → `{"ok": True}`.
- Registrar o handler **antes** da rota `POST /api/agent-file` (ou usar comparação
  exata de path) para o prefixo não engolir a rota nova.

**API — `app/src/api.ts`:**

```ts
export async function deleteAgentFile(
  name: string,
  kind: AgentFileKind = 'agent',
): Promise<{ ok: true } | { error: string }>
```
`POST` para `/api/agent-file/delete` com `{ name, kind }` — assinatura genérica por
`kind` (serve a agentes e comandos depois, sem retrabalho).

**UI:**

- `AgentEditScreen`: botão `llm-btn llm-btn-secondary` com ícone `Trash2 size={13}`,
  texto "Excluir", em `.agent-screen-header-actions` (antes do "Gerar com IA"),
  **oculto quando `isNew`**. Abre `ConfirmDialog` com `danger`, título
  `"Excluir {name}?"`, mensagem explicando que o arquivo/pasta é removido do disco e a
  ação é irreversível, `confirmText="Excluir"`. Em sucesso, chama uma nova prop
  `onDeleted?: () => void` (o `AppShell` liga ao catálogo da seção correspondente);
  em erro, popula o `error` já existente da tela. Adicionar `.agent-screen-header-actions
  .llm-btn-danger` em `AgentEditScreen.css` se for necessário um tom destrutivo.
- `SkillCatalogScreen`: ação de excluir também no card, via `cardActions` do
  `CatalogScreen` — botão discreto (`Trash2 size={14}`, `.catalog-card-action`) que
  aparece no `:hover`/`:focus-within` do card. **Obrigatório** `e.stopPropagation()`
  (o card é um `<button>`; um botão aninhado é HTML inválido → renderizar a ação como
  `<span role="button" tabIndex={0}>` **fora** do `<button>` do card, posicionada
  absoluta sobre ele, ou converter o card em `<div role="button">`. Escolher uma das
  duas e comentar a decisão no código.)
- Após excluir, recarregar o catálogo (`reload()`).

### Fluxos resultantes

| Gatilho | Resultado |
| --- | --- |
| Activity Bar → ícone `Puzzle` | Sidebar na seção Skills (comportamento atual, inalterado) |
| Sidebar Skills → botão `LayoutGrid` | `SkillCatalogScreen` em tela cheia, sidebar fecha |
| Sidebar Skills → item da lista | `AgentEditScreen` (`kind='skill'`, edição), sidebar fecha |
| Catálogo → "Criar skill" | `AgentEditScreen` (`kind='skill'`, `isNew`), template de skill |
| Catálogo → card | `AgentEditScreen` (`kind='skill'`, edição), subtítulo `versão: x.y.z` |
| Edição → "Voltar" | `SkillCatalogScreen` (não mais o de agentes) |
| Edição → "Salvar" | `POST /api/agent-file` grava `~/.claude/skills/<name>/SKILL.md` |
| Edição/Catálogo → "Excluir" + confirmação | `POST /api/agent-file/delete` e volta ao catálogo |
| Activity Bar → outra seção com tela de skill aberta | tela cheia fecha (`fullScreenSection` correto) |
| Refresh (Ctrl+R) | tela de skills restaurada de `dashboard.fullScreen` |

---

## Impacto & riscos

| Risco | Mitigação |
| --- | --- |
| **Regressão visual/funcional no catálogo de Agentes** (maior risco, por causa da extração do `CatalogScreen`) | Refatorar em commit separado do de Skills; conferir manualmente tiers, busca, estados vazios e navegação de agentes antes de seguir. |
| **Exclusão recursiva de diretório** (`rmtree` em skill) | Regex de nome + validação de prefixo do caminho resolvido; `ConfirmDialog` `danger`; sem exclusão em massa; sem exclusão para `isNew`. |
| Prefixo de rota engolindo `/api/agent-file/delete` | Ordenar/comparar paths exatamente; testar com `curl`. |
| `dashboard.fullScreen` antigo em `localStorage` | `readFullScreen()` já é defensivo — garantir que payload desconhecido devolva `null`. |
| Sidebar em duas instâncias (fixada + preview) recebendo props diferentes | Checklist explícito: passar as novas props nas duas. |
| `AgentEditScreen` já em 426 linhas cresce mais com exclusão | Extrair o bloco "Gerar com IA" (drawer + chat) para `AgentGenerateDrawer.tsx` se passar de ~470 linhas — atende o limite de 150 linhas do padrão de forma incremental, sem reescrever a tela. |
| Nome de skill alterado no frontmatter durante edição | Comportamento atual preservado: salvar cria a nova pasta e a antiga permanece. **Não** tratar rename nesta entrega; documentar como limitação conhecida. |

### Comportamento existente a preservar

- Catálogo de LLMs, detalhe de LLM e catálogo/edição de Agentes: idênticos.
- `AgentEditModal` continua funcionando para `commands`.
- Polling de 4 s da Sidebar (`AGENT_SYNC_MS`) e o botão de sincronizar.
- Preview de hover da Activity Bar e persistência de largura/seção da sidebar.

---

## Checklist de implementação

### Backend (`server.py`)

- [ ] Handler `POST /api/agent-file/delete` com validação de nome, 404 para
      inexistente, `rmtree` para `kind='skill'` e `unlink` para os demais — pronto
      quando: `curl -X POST .../api/agent-file/delete -d '{"name":"x","kind":"skill"}'`
      remove a pasta e devolve `{"ok": true}`, e `{"name":"../etc"}` devolve 400.
- [ ] Validação de prefixo do caminho resolvido antes do `rmtree` — pronto quando:
      nenhum caminho fora de `~/.claude/skills` é removível por qualquer entrada.

### Frontend — infraestrutura compartilhada

- [ ] `deleteAgentFile(name, kind)` em `app/src/api.ts` — pronto quando: tipada como
      `{ ok: true } | { error: string }` e usada pela UI.
- [ ] `components/CatalogScreen.tsx` + `CatalogScreen.css` genéricos (props acima,
      sem termos de domínio) — pronto quando: nenhuma string "agente"/"skill" no
      arquivo e o build/tsc passa.
- [ ] `AgentCatalogScreen.tsx` refatorado sobre `CatalogScreen`; `AgentCatalogScreen.css`
      removido — pronto quando: catálogo de agentes visualmente e funcionalmente
      idêntico ao de antes (tiers, busca, vazio, navegação).

### Frontend — Skills

- [ ] `components/SkillCatalogScreen.tsx` (fetch próprio, busca, grupos
      Versionadas/Sem versão, card com badge `v{version}`, estados vazios com `Puzzle`)
      — pronto quando: lista todas as skills de `~/.claude/skills` e a busca filtra por
      nome e descrição.
- [ ] `AppShell.tsx`: `FullScreen` com `skillCatalog`, `readFullScreen` atualizado,
      `fullScreenSection` por `fileKind`, `openSkillCatalog`/`openSkillEdit`, render da
      nova tela e `onBack` do `AgentEditScreen` derivado do kind — pronto quando:
      voltar de uma skill leva ao catálogo de skills e trocar de seção fecha a tela.
- [ ] `Sidebar.tsx`: props novas, `onAdd.skills` como `LayoutGrid / "Ver catálogo de
      skills"`, item abre a tela cheia, estado vazio, comentários atualizados — pronto
      quando: nenhum caminho da seção Skills abre `AgentEditModal`.
- [ ] Novas props passadas às **duas** instâncias de `Sidebar` no `AppShell` — pronto
      quando: o preview de hover abre a tela de skills igual à sidebar fixada.

### Frontend — Exclusão

- [ ] Botão "Excluir" + `ConfirmDialog danger` em `AgentEditScreen` (oculto se `isNew`),
      prop `onDeleted` ligada no `AppShell` — pronto quando: excluir remove o arquivo e
      leva ao catálogo da seção certa.
- [ ] Ação de excluir no card do catálogo de skills via `cardActions`, com markup válido
      (sem `<button>` aninhado) e propagação de clique contida — pronto quando: clicar
      no ícone não abre a tela de edição e a lista recarrega após confirmar.

### Fechamento

- [ ] `cd app && npm run build` (tsc + vite) e `npm run lint` sem erros novos.
- [ ] `npm run test.unit` (smoke `App.test.tsx`) verde.
- [ ] Comentários em pt-BR explicando as decisões não óbvias (rmtree/validação,
      reuso do `agentEdit` para skill, escolha do markup do card com ação).

---

## Critérios de aceite

- [ ] O ícone `Puzzle` na Activity Bar abre a seção Skills e o botão de catálogo abre
      `SkillCatalogScreen` em tela cheia, com a sidebar fechando.
- [ ] O catálogo lista todas as skills de `~/.claude/skills/<nome>/SKILL.md`, com badge
      de versão, descrição (ou placeholder em itálico) e busca por nome/descrição.
- [ ] "Criar skill" abre o editor com o template de skill (`name`, `description`,
      `version: 1.0.0`) e salvar cria `~/.claude/skills/<nome>/SKILL.md`.
- [ ] Clicar em uma skill (catálogo ou sidebar) abre `AgentEditScreen` com breadcrumb
      "Skills / Skills configuradas neste projeto." e o conteúdo do arquivo.
- [ ] "Excluir" pede confirmação destrutiva e, ao confirmar, remove a pasta da skill e
      devolve o usuário ao catálogo, já sem o item.
- [ ] O botão "Voltar" da edição de skill leva ao catálogo de **skills**.
- [ ] Trocar para outra seção na Activity Bar fecha a tela de skills; clicar em Skills
      de novo não fecha.
- [ ] Ctrl+R com o catálogo de skills aberto restaura o catálogo de skills.
- [ ] Nenhum fluxo de Skills abre modal; catálogo/edição de Agentes e LLMs seguem
      idênticos ao comportamento anterior.
- [ ] Nenhum arquivo novo excede 150 linhas sem justificativa registrada no PR;
      nenhuma duplicação de `AgentCatalogScreen` no repositório.

---

## Cenários de teste (para a auditoria)

### Caminho feliz

1. Sidebar → Skills → catálogo → "Criar skill" → editar frontmatter com
   `name: minha-skill` → Salvar → aparece "Salvo" → Voltar → item na lista e na sidebar
   em até 4 s (polling).
2. Abrir skill existente → alterar o corpo markdown → preview sincroniza a rolagem →
   Salvar → reabrir e confirmar persistência em disco.
3. Excluir skill pelo card e por dentro do editor.
4. Busca por trecho de descrição (não só nome) retorna o item.

### Erro

5. Criar skill com `name:` vazio ou inválido → botão Salvar desabilitado e aviso
   "Defina um `name:` válido no frontmatter".
6. `name: Minha Skill!` (com espaço/acento) → slugificado antes de salvar, frontmatter
   reescrito com o nome efetivo.
7. Backend fora do ar → catálogo mostra lista vazia sem quebrar a tela (`catch`).
8. `POST /api/agent-file/delete` com `name: "../../etc"` → 400, nada removido.
9. Excluir skill já removida por fora → 404 tratado, mensagem de erro na UI.

### Borda

10. Zero skills instaladas → estado vazio com `Puzzle` e texto de "crie a primeira".
11. Busca sem resultado → estado `SearchX` com o termo pesquisado no texto.
12. Todas as skills sem `version` → só o grupo "Sem versão" aparece (nenhum header vazio).
13. Skill com descrição muito longa → truncada com ellipsis, `title` com o texto completo.
14. 70+ skills → grid rola sem travar; sidebar continua rolando (regressão conhecida
    de `flex-shrink`, ver comentário em `Sidebar.css`).
15. Abrir edição de skill, trocar de tema pela Activity Bar → cor de destaque dos botões
    acompanha (`useLlmScreenTheme` + `MutationObserver`).
16. Preview de hover da sidebar → abrir catálogo de skills a partir dele funciona igual
    à sidebar fixada.
17. `dashboard.fullScreen` com JSON corrompido → app abre na tela inicial, sem exceção.

---

## Padrões a seguir

- **`/Users/mr_robot/.claude/PADRAO-ARQUITETURA-FRONTEND.md`:**
  - §1.6 limite de 150 linhas por arquivo novo (motiva a extração do `CatalogScreen`
    e, se necessário, do drawer de "Gerar com IA").
  - §1.7 nada de comportamento hardcoded que deveria ser prop — a API do
    `CatalogScreen` expõe textos, ícones, grupos, card e ações.
  - §1.2/§3 fluxo de dependência unidirecional: `api.ts` (dados) não importa UI;
    `CatalogScreen` (componente) não conhece domínio; `AppShell` (composição) orquestra.
  - §1.3 uma fonte de verdade por responsabilidade: rotas de tela cheia **só** no
    `FullScreen` do `AppShell`; seções **só** em `sidebarSections.ts`; HTTP **só** em
    `api.ts`.
  - ⚠️ A estrutura de pastas de referência (`core/`, `services/`, `pages/`) **não** é a
    do repositório (que usa `components/` + `pages/` + `utils/` + `api.ts` plano).
    **Seguir a estrutura real do repositório** — migrar de pastas está fora do escopo.
- **Convenções verificadas no repositório (fonte primária, não há `docs/PROJETO.md`
  nem `docs/MEMORY.md`):** `PascalCase.tsx` + `PascalCase.css` irmão em
  `app/src/components/`; ícones `lucide-react`; AntD só dentro das telas cheias via
  `ConfigProvider`/`useLlmScreenTheme`; `readPref`/`writePref` para persistência de UI;
  `ConfirmDialog` para ações destrutivas; textos em pt-BR; comentários explicando o
  porquê das decisões.
- **Referências de código a espelhar:** `AgentCatalogScreen.tsx`,
  `AgentEditScreen.tsx`, `LlmCatalogScreen.tsx`, `AppShell.tsx`, `Sidebar.tsx`,
  `sidebarSections.ts`, `LlmScreens.css`, `ConfirmDialog.tsx`.

---

## Suposições explícitas

1. Skills vivem apenas em `~/.claude/skills/<nome>/SKILL.md` (global, como o backend já
   assume) — não há skills por projeto nesta entrega.
2. `version` é texto livre no frontmatter; nenhuma validação semver é imposta.
3. Excluir uma skill remove a **pasta inteira**, inclusive arquivos auxiliares que o
   usuário tenha colocado nela — isso deve ser dito na mensagem de confirmação.
4. Renomear via frontmatter cria uma nova skill e mantém a antiga (comportamento atual
   preservado; não é escopo desta entrega).
5. Commands ficam no modal antigo; a migração deles é uma entrega futura, que herdará
   este mesmo `CatalogScreen`.
