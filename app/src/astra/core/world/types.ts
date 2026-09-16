export type Position = [number, number, number];
export type Block = { position: Position; scale: Position; color: string; rotation?: Position; obstacle?: import('./occlusion').Obstacle };
