import { Zap, Server, Database, Leaf, MemoryStick, Container, Hexagon, FileCode, Globe, Terminal, Rabbit } from 'lucide-react';

// @lobehub/icons nao tem nenhum icone de infraestrutura (a lib e focada em
// provedores/modelos de IA) — todo icone de recurso vem do lucide-react, sem
// logo de marca. `rabbitmq` entrou depois dos 11 originais — so aparece pra
// container Docker classificado por imagem (host nunca ve o processo real).
export const RESOURCE_ICON_BY_KIND: Record<string, typeof Server> = {
  'node-dev-server': Zap,
  'python-server': Server,
  postgres: Database,
  mysql: Database,
  mongodb: Leaf,
  redis: MemoryStick,
  rabbitmq: Rabbit,
  docker: Container,
  node: Hexagon,
  python: FileCode,
  port: Globe,
  process: Terminal,
};

export function resourceIconFor(kind?: string): typeof Server {
  return RESOURCE_ICON_BY_KIND[(kind || '').toLowerCase()] || Terminal;
}

// lucide-react e 100% monocromatico (todo icone desenha com `stroke:
// currentColor`, sem fill proprio) — diferente das marcas de LLM em
// @lobehub/icons, aqui NENHUM resourceKind tem cor "de fabrica" embutida no
// SVG. Pra ficar colorido como os icones de LLM, a cor de marca de cada
// serviço entra "na mao" aqui e e aplicada via CSS `color` no container do
// badge (o mesmo mecanismo de `llmLogoColorFor`, ver SessionTree.tsx).
export const RESOURCE_ICON_COLOR_BY_KIND: Record<string, string> = {
  'node-dev-server': '#3c873a',
  node: '#3c873a',
  'python-server': '#ffd43b',
  python: '#ffd43b',
  postgres: '#336791',
  mysql: '#4479a1',
  mongodb: '#47a248',
  redis: '#dc382d',
  rabbitmq: '#ff6600',
  docker: '#2496ed',
  port: '#8a8f98',
  process: '#8a8f98',
};

export function resourceIconColorFor(kind?: string): string | undefined {
  return RESOURCE_ICON_COLOR_BY_KIND[(kind || '').toLowerCase()];
}
