// Foco compartilhado entre a cena 3D e o painel DOM: `inspect` e o hover
// (transitorio), `select` fixa o agente no painel e faz a camera segui-lo.
export type FocusHandlers = { inspect: (id: string | null) => void; select: (id: string | null) => void };
export type Focus = { inspected: string | null; selected: string | null };
