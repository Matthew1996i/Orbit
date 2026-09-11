import { ConfigProvider, Input, Typography, Button } from 'antd';
import { ArrowLeft, MagnifyingGlass, MagnifyingGlassMinus, Plus, CaretRight } from '@phosphor-icons/react';
import { useLlmScreenTheme } from '../utils/llmScreenTheme';
import './LlmScreens.css';
import './CatalogScreen.css';

const { Title, Text } = Typography;

export interface CatalogGroup<T> {
  key: string;
  title: string;
  items: T[];
}

interface CatalogScreenProps<T> {
  title: string;
  subtitle: string;
  groups: CatalogGroup<T>[];
  query: string;
  onQueryChange: (query: string) => void;
  searchPlaceholder?: string;
  createLabel?: string;
  onCreate?: () => void;
  onBack: () => void;
  itemKey: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  onOpenItem: (item: T) => void;
  totalCount: number;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptyText: string;
  noResultText: string;
  cardActions?: (item: T) => React.ReactNode;
}

// tela cheia GENERICA de catalogo (extraida do antigo AgentCatalogScreen) —
// so cabecalho/busca/grid/estado-vazio, sem NENHUM termo de dominio. Quem
// chama decide dados, agrupamento, textos e o conteudo do card; reaproveitada
// por Agentes e Skills (ver AgentCatalogScreen.tsx / SkillCatalogScreen.tsx).
export default function CatalogScreen<T>({
  title,
  subtitle,
  groups,
  query,
  onQueryChange,
  searchPlaceholder = 'Buscar por nome ou descrição…',
  createLabel,
  onCreate,
  onBack,
  itemKey,
  renderCard,
  onOpenItem,
  totalCount,
  emptyIcon,
  emptyTitle,
  emptyText,
  noResultText,
  cardActions,
}: CatalogScreenProps<T>) {
  const theme = useLlmScreenTheme();
  const isEmpty = groups.every((group) => group.items.length === 0);

  return (
    <ConfigProvider theme={theme}>
      <div className="catalog-screen">
        <div className="catalog-toolbar">
          <div className="llm-screen-header">
            <button className="llm-screen-back" onClick={onBack} aria-label="Voltar">
              <ArrowLeft size={16} />
            </button>
            <div>
              <Title level={3} className="llm-screen-title">{title}</Title>
              <Text className="llm-screen-subtitle">{subtitle}</Text>
            </div>
          </div>
        </div>

        {/* busca+acao fora da div do titulo — pertencem ao conteudo da
            tela, nao ao cabecalho (que so tem titulo/voltar). */}
        <div className="catalog-toolbar-actions">
          <Input
            size="large"
            className="llm-catalog-search"
            prefix={<MagnifyingGlass size={14} color="#a3a3ab" />}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            allowClear
            autoFocus
            spellCheck={false}
          />
          {createLabel && onCreate && <Button className="llm-btn llm-btn-primary" icon={<Plus size={13} />} onClick={onCreate}>
            {createLabel}
          </Button>}
        </div>

        {isEmpty && (
          <div className="llm-catalog-empty">
            <span className="llm-catalog-empty-icon">
              {totalCount === 0 ? emptyIcon : <MagnifyingGlassMinus size={20} />}
            </span>
            <div className="llm-catalog-empty-title">{totalCount === 0 ? emptyTitle : noResultText}</div>
            <div className="llm-catalog-empty-text">
              {totalCount === 0 ? emptyText : `Não encontramos resultados para "${query}". Tente outro nome ou descrição.`}
            </div>
          </div>
        )}

        {groups.map((group) => (
          <section key={group.key} className="llm-group">
            <div className="llm-group-header">
              <span className="llm-group-title">{group.title}</span>
              <span className="llm-group-count">{group.items.length}</span>
            </div>

            <div className="catalog-grid">
              {group.items.map((item) => (
                // wrapper com position:relative pra sobrepor a acao (excluir)
                // no card SEM aninhar elemento interativo dentro do <button>
                // do card — <button> nao pode conter outro elemento
                // interativo (HTML invalido); a acao fica como IRMA do
                // botao, posicionada em cima dele via CSS (ver
                // .catalog-card-action em CatalogScreen.css).
                <div key={itemKey(item)} className="catalog-card-wrap">
                  <button className="catalog-card" onClick={() => onOpenItem(item)}>
                    <div className="catalog-card-body">{renderCard(item)}</div>
                    <CaretRight size={16} className="llm-card-chevron" />
                  </button>
                  {cardActions?.(item)}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </ConfigProvider>
  );
}
