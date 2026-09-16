import { Component, type ReactNode } from 'react';
export class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="scene-error"><h1>O mundo não pôde ser aberto.</h1><p>Ative a aceleração gráfica no navegador e tente novamente.</p><button onClick={() => window.location.reload()}>Tentar novamente</button></div> : this.props.children;
  }
}
