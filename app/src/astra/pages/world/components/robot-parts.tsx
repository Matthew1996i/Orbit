import { robotPalette } from './robot-palette';
import type { RobotVariant } from '../../../core/world/agent-identity';
import { BlockBatch } from '../../../components/block-batch';
import type { Block, Position } from '../../../core/world/types';
const block = (position: Position, scale: Position, color: string): Block => ({ position, scale, color });
const HEAD = [
  block([0, 0, 0], [0.83, 0.48, 0.61], '#c7c5ad'),
  block([0, 0.27, -0.01], [0.94, 0.09, 0.69], '#8a9e8b'),
  block([0, 0.07, 0.32], [0.69, 0.27, 0.07], '#172c28'),
  block([0, -0.2, 0.33], [0.59, 0.07, 0.09], '#87917b'),
  block([-0.46, 0, 0], [0.11, 0.26, 0.3], '#718675'),
  block([0.46, 0, 0], [0.11, 0.26, 0.3], '#718675'),
  block([0.29, 0.49, -0.08], [0.035, 0.38, 0.035], '#485e52'),
  ...[-0.31, 0.31].map((x) => block([x, -0.14, 0.366], [0.045, 0.045, 0.025], '#3f5046')),
  ...[-0.16, 0, 0.16].map((x) => block([x, -0.135, 0.322], [0.07, 0.025, 0.02], '#33483d')),
];
const EYES = [-0.19, 0.19].map((x) => block([x, 0, 0], [0.13, 0.11, 0.025], '#c4f4ce'));
const BODY = [
  block([0, 0.86, 0], [0.66, 0.6, 0.44], '#a9b09a'),
  block([0, 0.92, 0.247], [0.48, 0.38, 0.08], '#778b79'),
  block([0, 0.92, 0.3], [0.26, 0.27, 0.045], '#253d34'),
  block([0, 0.56, 0], [0.59, 0.12, 0.48], '#4a5b4e'),
  block([0, 1.22, 0], [0.46, 0.11, 0.46], '#b87848'),
  block([-0.19, 1.02, 0.29], [0.12, 0.3, 0.05], '#b87848'),
  block([0, 0.91, -0.39], [0.59, 0.67, 0.3], '#5e7562'),
  block([0, 1.3, -0.39], [0.65, 0.12, 0.38], '#879680'),
  block([0, 0.92, -0.56], [0.4, 0.45, 0.06], '#31483c'),
  ...[-0.2, 0.2].map((x) => block([x, 0.89, -0.6], [0.065, 0.54, 0.03], '#b7ad86')),
  ...[0.78, 0.9, 1.02].map((height) => block([0, height, -0.61], [0.25, 0.045, 0.025], '#879a7b')),
  block([0.4, 0.66, -0.05], [0.17, 0.25, 0.26], '#9f8657'),
];
const ARM = [
  block([0, 0, 0], [0.29, 0.22, 0.31], '#c0c1a5'),
  block([0, -0.22, 0], [0.17, 0.28, 0.21], '#4b6152'),
  block([0, -0.42, 0.02], [0.24, 0.24, 0.28], '#879a80'),
  block([0, -0.59, 0.04], [0.25, 0.12, 0.28], '#c0bca0'),
  block([0, -0.6, 0.192], [0.08, 0.1, 0.025], '#405b4c'),
];
const LEG = [
  block([0, -0.13, 0], [0.2, 0.29, 0.23], '#455d4f'),
  block([0, -0.2, 0.14], [0.24, 0.15, 0.07], '#b1b79c'),
  block([0, -0.32, 0], [0.22, 0.15, 0.24], '#879780'),
  block([0, -0.42, 0.08], [0.31, 0.15, 0.42], '#b7baa0'),
  block([0, -0.49, 0.08], [0.33, 0.04, 0.44], '#364d40'),
];
const CORE = [block([0, 0.92, 0.332], [0.13, 0.17, 0.025], '#f6bc72')];
const ANTENNA = [block([0.29, 0.71, -0.08], [0.08, 0.08, 0.08], '#edb973')];
export const RobotHead = ({ variant }: { variant: RobotVariant }) => <><BlockBatch castShadow={false} blocks={robotPalette(HEAD, variant)} roughness={0.62} /><BlockBatch castShadow={false} blocks={robotPalette(ANTENNA, variant)} glow /></>;
export const RobotEyes = ({ variant }: { variant: RobotVariant }) => <BlockBatch castShadow={false} blocks={robotPalette(EYES, variant)} glow />;
export const RobotTorso = ({ variant }: { variant: RobotVariant }) => <><BlockBatch castShadow={false} blocks={robotPalette(BODY, variant)} roughness={0.68} /><BlockBatch castShadow={false} blocks={robotPalette(CORE, variant)} glow /></>;
export const RobotArm = ({ variant }: { variant: RobotVariant }) => <BlockBatch castShadow={false} blocks={robotPalette(ARM, variant)} roughness={0.65} />;
export const RobotLeg = ({ variant }: { variant: RobotVariant }) => <BlockBatch castShadow={false} blocks={robotPalette(LEG, variant)} roughness={0.7} />;
