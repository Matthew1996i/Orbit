import type { SessionInfo } from '../../../api';
import type { Position } from './types';

export const ACTOR_RADIUS = 1.15;
export const STATION_RADIUS = 2;
export const CELL_SIZE = 9;
export type WorldNode = {
  id: string; session: SessionInfo; position: Position; model: string | null;
  present: boolean; opacity: number;
};
export type WorldActor = {
  id: string; position: Position; entrance: Position; destination: Position;
  route: Position[]; heading: number; walking: boolean; working: boolean; opacity: number;
  activityId: string | null; visited: Map<string, string>; retry: number;
};
export type LiveWorld = { nodes: Map<string, WorldNode>; actors: Map<string, WorldActor>; obstacles: Circle[]; revision: number };
export type Circle = { x: number; z: number; radius: number };
export const createLiveWorld = (obstacles: Circle[] = []): LiveWorld => ({ nodes: new Map(), actors: new Map(), obstacles, revision: 0 });
export const distance = (first: Position, second: Position) => Math.hypot(first[0] - second[0], first[2] - second[2]);
export const atGround = (x: number, z: number): Position => [x, 0.035, z];
