import { useMemo, useState } from 'react';
import { Brain, Clock3, Database, FileSearch, GitBranch, Globe2, MessagesSquare, NotebookTabs, Server, Workflow } from 'lucide-react';
import CatalogScreen, { CatalogGroup } from './CatalogScreen';
import './McpEditScreen.css';

interface McpPreset {
  id: string;
  name: string;
  description: string;
  category: 'OAuth' | 'Local';
  auth: string;
  icon: React.ReactNode;
  config: Record<string, unknown>;
}

// Endpoints/pacotes publicados pelos próprios fornecedores ou pelo projeto
// de referência do MCP. A autenticação OAuth é feita pela CLI compatível ao
// usar o servidor; o Orbit não armazena credenciais nesses presets.
const PRESETS: McpPreset[] = [
  { id: 'notion', name: 'Notion', description: 'Páginas, bases de dados e tarefas do workspace.', category: 'OAuth', auth: 'OAuth ao usar', icon: <NotebookTabs size={22} />, config: { type: 'http', url: 'https://mcp.notion.com/mcp' } },
  { id: 'figma', name: 'Figma', description: 'Contexto de arquivos e componentes de design.', category: 'OAuth', auth: 'OAuth ao usar', icon: <Workflow size={22} />, config: { type: 'http', url: 'https://mcp.figma.com/mcp' } },
  { id: 'atlassian', name: 'Atlassian', description: 'Jira, Confluence, Bitbucket e produtos Atlassian Cloud.', category: 'OAuth', auth: 'OAuth ao usar', icon: <Workflow size={22} />, config: { type: 'http', url: 'https://mcp.atlassian.com/v2/mcp' } },
  { id: 'slack', name: 'Slack', description: 'Mensagens, canais e arquivos do Slack.', category: 'OAuth', auth: 'OAuth do app Slack', icon: <MessagesSquare size={22} />, config: { type: 'http', url: 'https://mcp.slack.com/mcp' } },
  { id: 'github', name: 'GitHub', description: 'Repositórios, issues, pull requests e ações.', category: 'OAuth', auth: 'OAuth · requer Docker', icon: <GitBranch size={22} />, config: { command: 'docker', args: ['run', '-i', '--rm', '-p', '127.0.0.1:8085:8085', '-e', 'GITHUB_OAUTH_CALLBACK_PORT', 'ghcr.io/github/github-mcp-server'], env: { GITHUB_OAUTH_CALLBACK_PORT: '8085' } } },
  { id: 'filesystem', name: 'Filesystem', description: 'Arquivos e diretórios permitidos no computador.', category: 'Local', auth: 'Sem autenticação', icon: <FileSearch size={22} />, config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] } },
  { id: 'git', name: 'Git', description: 'Histórico, diffs e operações em repositórios Git locais.', category: 'Local', auth: 'Sem autenticação', icon: <GitBranch size={22} />, config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-git'] } },
  { id: 'fetch', name: 'Fetch', description: 'Leitura e conversão de conteúdo da web.', category: 'Local', auth: 'Sem autenticação', icon: <Globe2 size={22} />, config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] } },
  { id: 'memory', name: 'Memory', description: 'Memória persistente em grafo de conhecimento.', category: 'Local', auth: 'Sem autenticação', icon: <Brain size={22} />, config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] } },
  { id: 'time', name: 'Time', description: 'Conversão de fusos horários e horários locais.', category: 'Local', auth: 'Sem autenticação', icon: <Clock3 size={22} />, config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-time'] } },
  { id: 'sequential-thinking', name: 'Sequential Thinking', description: 'Raciocínio estruturado e iterativo para tarefas complexas.', category: 'Local', auth: 'Sem autenticação', icon: <Workflow size={22} />, config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] } },
  { id: 'postgres', name: 'PostgreSQL', description: 'Template local para conectar um banco PostgreSQL.', category: 'Local', auth: 'Configure a URL', icon: <Database size={22} />, config: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://usuario:senha@localhost:5432/banco'] } },
];

interface Props {
  onBack: () => void;
  onChoose: (draft: { name: string; config: Record<string, unknown> }) => void;
  onManual: () => void;
}

export default function McpPresetCatalogScreen({ onBack, onChoose, onManual }: Props) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? PRESETS.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(q)) : PRESETS;
  }, [query]);
  const groups: CatalogGroup<McpPreset>[] = useMemo(() => [
    { key: 'oauth', title: 'Conecte e autentique', items: filtered.filter((item) => item.category === 'OAuth') },
    { key: 'local', title: 'Servidores locais', items: filtered.filter((item) => item.category === 'Local') },
  ].filter((group) => group.items.length), [filtered]);
  return <CatalogScreen title="Adicionar MCP" subtitle="Escolha uma integração pronta ou crie uma conexão manual do Orbit." groups={groups} query={query} onQueryChange={setQuery} createLabel="Configuração manual" onCreate={onManual} onBack={onBack} itemKey={(item) => item.id} onOpenItem={(item) => onChoose({ name: item.id, config: item.config })} totalCount={PRESETS.length} emptyIcon={<Server size={20} strokeWidth={1.75} />} emptyTitle="Nenhuma integração encontrada" emptyText="Tente outro termo ou crie uma configuração manual." noResultText="Nenhuma integração encontrada" renderCard={(item) => <><div className="mcp-preset-card-icon">{item.icon}</div><div className="catalog-card-name-row"><span className="catalog-card-name">{item.name}</span><span className="catalog-card-badge">{item.auth}</span></div><div className="catalog-card-desc" title={item.description}>{item.description}</div><div className="catalog-card-meta">{item.category === 'OAuth' ? 'Pronto para conectar' : 'Template pronto'}</div></>} />;
}
