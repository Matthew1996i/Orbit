import { useEffect, useMemo, useState } from 'react';
import { ConfigProvider, Input, Tag, Typography } from 'antd';
import { ArrowLeft, Search, Check, ChevronRight, SearchX } from 'lucide-react';
import { LlmCli } from '../api';
import { llmLogoFor, llmLogoColorFor } from '../utils/llmLogos';
import { llmPricingFor } from '../utils/llmPricing';
import { fetchAllLlms } from '../utils/llmCatalog';
import { useLlmScreenTheme } from '../utils/llmScreenTheme';
import LlmDrawer from './LlmDrawer';
import './LlmScreens.css';
import './LlmCatalogScreen.css';

const { Title, Text } = Typography;

interface Props {
  onBack: () => void;
}

const GROUPS: { key: LlmCli['status']; title: string }[] = [
  { key: 'connected', title: 'Conectadas' },
  { key: 'installed', title: 'Instaladas' },
  { key: 'none', title: 'Outras' },
];

// tela cheia (substitui o conteudo principal, nao e mais modal) aberta pelo
// "+" da secao LLMs — mostra TODA a catalogo (inclusive as ainda nao
// instaladas, status "none", que a Sidebar esconde) em cards com busca,
// agrupados por status (conectadas primeiro). Clicar em QUALQUER card (de
// qualquer status) abre o LlmDrawer — instalar/desinstalar so orienta (sem
// rodar comando), login/logout continuam automatizados dentro do drawer (ver
// LlmDrawer.tsx). Autocontida (busca os proprios dados) — nao depende do
// estado da Sidebar, que pode nem estar montada enquanto essa tela esta
// aberta.
export default function LlmCatalogScreen({ onBack }: Props) {
  const theme = useLlmScreenTheme();
  const [llms, setLlms] = useState<LlmCli[]>([]);
  const [query, setQuery] = useState('');
  const [drawerId, setDrawerId] = useState<string | null>(null);

  // devolve a lista fresca (nao so void) — o LlmDrawer usa isso pra saber se
  // o login/logout deu certo de verdade antes de decidir se fecha sozinho.
  const reload = () => fetchAllLlms().then((fresh) => (setLlms(fresh), fresh));
  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return llms;
    return llms.filter((l) => l.name.toLowerCase().includes(q) || l.vendor.toLowerCase().includes(q));
  }, [llms, query]);

  const grouped = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: filtered.filter((l) => l.status === g.key) })).filter((g) => g.items.length),
    [filtered],
  );

  const drawerLlm = llms.find((l) => l.id === drawerId) ?? null;

  return (
    <ConfigProvider theme={theme}>
      <div className="llm-catalog-screen">
        <div className="llm-catalog-toolbar">
          <div className="llm-screen-header">
            <button className="llm-screen-back" onClick={onBack} aria-label="Voltar">
              <ArrowLeft size={16} />
            </button>
            <div>
              <Title level={3} className="llm-screen-title">LLMs</Title>
              <Text className="llm-screen-subtitle">Conecte e gerencie os modelos de linguagem desta máquina.</Text>
            </div>
          </div>
        </div>

        {/* busca fora da div do titulo — pertence ao conteudo da tela, nao
            ao cabecalho (que so tem titulo/voltar). Divide a linha ao meio
            com uma coluna vazia (ver CSS) pra bater com o alinhamento do
            catalogo de agentes, que tem um botao de acao nessa segunda
            metade — aqui essa metade so fica reservada, sem nada dentro. */}
        <div className="llm-catalog-search-row">
          <Input
            size="large"
            className="llm-catalog-search"
            prefix={<Search size={14} color="#a3a3ab" />}
            placeholder="Buscar por nome ou fornecedor…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            allowClear
            autoFocus
            spellCheck={false}
          />
          <div aria-hidden="true" />
        </div>

        {grouped.length === 0 && (
          <div className="llm-catalog-empty">
            <span className="llm-catalog-empty-icon">
              <SearchX size={20} strokeWidth={1.75} />
            </span>
            <div className="llm-catalog-empty-title">Nenhuma LLM encontrada</div>
            <div className="llm-catalog-empty-text">
              Não encontramos resultados para “{query}”. Tente outro nome ou fornecedor.
            </div>
          </div>
        )}

        {grouped.map((group) => (
          <section key={group.key} className="llm-group">
            <div className="llm-group-header">
              <span className="llm-group-title">{group.title}</span>
              <span className="llm-group-count">{group.items.length}</span>
            </div>

            <div className="llm-catalog-grid">
              {group.items.map((llm) => {
                const Logo = llmLogoFor(llm.id);
                const logoColor = llmLogoColorFor(llm.id) ?? '#111114';

                return (
                  <button key={llm.id} className="llm-card" onClick={() => setDrawerId(llm.id)}>
                    <span className="llm-logo llm-card-logo" style={{ color: logoColor }}>
                      <Logo size={24} strokeWidth={1.75} />
                    </span>
                    <div className="llm-card-body">
                      <div className="llm-card-name-row">
                        <span className="llm-card-name">{llm.name}</span>
                        <span className={`pricing-chip pricing-chip-${llmPricingFor(llm.id)}`}>
                          {llmPricingFor(llm.id) === 'paid' ? 'Pago' : 'Grátis'}
                        </span>
                      </div>
                      <div className="llm-card-vendor">{llm.vendor}</div>
                    </div>
                    {llm.status === 'connected' ? (
                      <Tag className="llm-card-tag llm-card-tag-connected">
                        <Check size={11} strokeWidth={2.5} /> Conectado
                      </Tag>
                    ) : llm.status === 'installed' ? (
                      <Tag className="llm-card-tag llm-card-tag-installed">
                        <span className="llm-card-tag-dot" /> Instalado
                      </Tag>
                    ) : (
                      <ChevronRight size={16} className="llm-card-chevron" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <LlmDrawer llm={drawerLlm} onClose={() => setDrawerId(null)} onChanged={reload} />
    </ConfigProvider>
  );
}
