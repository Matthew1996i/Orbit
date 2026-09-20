import { useEffect, useMemo } from 'react';
import { AdditiveBlending, CanvasTexture } from 'three';
import type { Position, Block } from '../../../core/world/types';
import { BlockBatch } from '../../../components/block-batch';

export const VillageLanterns = ({ positions }: { positions: Position[] }) => {
  const glow = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, '#fff0caff'); gradient.addColorStop(0.12, '#ffd183bb');
    gradient.addColorStop(0.4, '#ffad4322'); gradient.addColorStop(1, '#ffad4300');
    context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
    return new CanvasTexture(canvas);
  }, []);
  useEffect(() => () => glow.dispose(), [glow]);
  const { frames, lamps } = useMemo(() => {
    const frames: Block[] = [], lamps: Block[] = [];
    for (const [x, y, z] of positions) {
      frames.push({ position: [x, (y - 0.23) / 2, z], scale: [0.07, y - 0.23, 0.07], color: '#32354e' });
      for (const offset of [-0.23, 0.23]) frames.push({ position: [x, y + offset, z], scale: [0.38, 0.09, 0.38], color: '#333a52' });
      lamps.push({ position: [x, y, z], scale: [0.21, 0.38, 0.21], color: '#ffcc7e' });
    }
    return { frames, lamps };
  }, [positions]);
  return <><BlockBatch blocks={frames} /><BlockBatch blocks={lamps} glow />
    {positions.map((position, index) => <sprite key={index} position={position} scale={[1.8, 1.8, 1]}>
      <spriteMaterial map={glow} transparent blending={AdditiveBlending} depthWrite={false} opacity={0.62} toneMapped={false} />
    </sprite>)}
  </>;
};
