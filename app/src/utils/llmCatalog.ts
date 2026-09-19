import { fetchLlms, LlmCli } from '../api';

// O catálogo inteiro vem da descoberta local. Nenhuma CLI é presumida instalada.
export async function fetchAllLlms(): Promise<LlmCli[]> {
  return (await fetchLlms()).llms;
}
