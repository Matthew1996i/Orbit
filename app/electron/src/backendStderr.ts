import type { ChildProcess } from 'child_process';

// O Python pode escrever avisos mesmo sem erro fatal. Sem leitor, o pipe de
// stderr enche e bloqueia todas as requisições que gerarem novos avisos.
export function drainBackendStderr(process: Pick<ChildProcess, 'stderr'>): void {
  process.stderr?.resume();
}
