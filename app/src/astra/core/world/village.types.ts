import type { Position } from './types';

export type Tree = { position: Position; height: number; radius: number };
// Um modelo do pacote colocado no mundo. `footprint` e o raio (em unidades do
// mundo) que ele ocupa no chao — usado pra evitar sobreposicao e pra manter a
// vegetacao e os agentes fora dele.
export type Placement = { model: string; position: Position; rotation: number; scale: number; footprint: number; height: number };
export type Footprint = { x: number; z: number; radius: number };
export type Village = {
  plazaRadius: number;
  buildings: Placement[]; props: Placement[]; paths: Placement[];
  trees: Tree[]; lanterns: Position[];
  footprints: Footprint[];
};
