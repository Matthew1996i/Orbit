import type { Block } from '../../../core/world/types';
import type { RobotVariant } from '../../../core/world/agent-identity';

const shells = new Set(['#c7c5ad', '#a9b09a', '#c0c1a5', '#c0bca0', '#b7baa0', '#b1b79c']);
const trim = new Set(['#8a9e8b', '#87917b', '#718675', '#778b79', '#879780', '#879a80', '#879680', '#879a7b', '#b7ad86']);
const cache = new WeakMap<Block[], Map<RobotVariant, Block[]>>();

export const robotPalette = (blocks: Block[], variant: RobotVariant): Block[] => {
  if (variant === 'neutral') return blocks;
  let variants = cache.get(blocks);
  if (!variants) { variants = new Map(); cache.set(blocks, variants); }
  const cached = variants.get(variant);
  if (cached) return cached;
  const result = blocks.map((block) => ({ ...block, color: shells.has(block.color)
    ? variant === 'claude' ? '#d78f70' : '#d6e0e7'
    : trim.has(block.color) ? variant === 'claude' ? '#a9624e' : '#6c91a0'
      : block.color === '#b87848' ? variant === 'claude' ? '#eed3b4' : '#8ae5c6' : block.color }));
  variants.set(variant, result);
  return result;
};
