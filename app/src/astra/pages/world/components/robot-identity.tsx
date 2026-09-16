import { BlockBatch } from '../../../components/block-batch';
import type { Block } from '../../../core/world/types';
import type { RobotVariant } from '../../../core/world/agent-identity';

const CLAUDE: Block[] = Array.from({ length: 6 }, (_, index) => ({
  position: [0, 0.93, 0.38], scale: [0.31, 0.038, 0.045], color: '#f4b798', rotation: [0, 0, index * Math.PI / 6],
}));
const CODEX: Block[] = [
  { position: [-0.48, 1.52, 0], scale: [0.13, 0.62, 0.38], color: '#d7edf0' },
  { position: [0.48, 1.52, 0], scale: [0.13, 0.62, 0.38], color: '#d7edf0' },
  { position: [-0.14, 0.96, 0.39], scale: [0.18, 0.045, 0.04], color: '#83edca', rotation: [0, 0, 0.7] },
  { position: [-0.14, 0.86, 0.39], scale: [0.18, 0.045, 0.04], color: '#83edca', rotation: [0, 0, -0.7] },
  { position: [0.14, 0.96, 0.39], scale: [0.18, 0.045, 0.04], color: '#83edca', rotation: [0, 0, -0.7] },
  { position: [0.14, 0.86, 0.39], scale: [0.18, 0.045, 0.04], color: '#83edca', rotation: [0, 0, 0.7] },
];

export const RobotIdentity = ({ variant }: { variant: RobotVariant }) => variant === 'neutral' ? null
  : <BlockBatch blocks={variant === 'claude' ? CLAUDE : CODEX} glow castShadow={false} />;
