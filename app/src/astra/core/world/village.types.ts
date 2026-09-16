import type { Block, Position } from './types';

export type House = { position: Position; width: number; depth: number; height: number; roof: number; color: string };
export type Tree = { position: Position; height: number; radius: number };
export type Village = {
  masonry: Block[]; timber: Block[]; tiles: Block[]; lights: Block[];
  houses: House[]; trees: Tree[]; lanterns: Position[];
};

export const addBlock = (blocks: Block[], position: Position, scale: Position, color: string, rotation?: Position) => {
  blocks.push({ position, scale, color, rotation });
};
