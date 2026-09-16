import { useEffect, useMemo } from 'react';
import { ExtrudeGeometry, Shape } from 'three';
import type { House, Village } from '../../../core/world/village.types';
import { BlockBatch } from '../../../components/block-batch';
import { SceneObstacle } from './scene-obstacle';

const Roof = ({ house }: { house: House }) => {
  const geometry = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-house.width / 2, 0); shape.lineTo(0, house.roof);
    shape.lineTo(house.width / 2, 0); shape.closePath();
    return new ExtrudeGeometry(shape, { depth: house.depth, bevelEnabled: false });
  }, [house]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <SceneObstacle obstacle={{ position: house.position, radius: Math.hypot(house.width, house.depth) / 2, height: house.height + house.roof + 2 }}><mesh geometry={geometry} position={[house.position[0], house.position[1] + house.height, house.position[2] - house.depth / 2]} castShadow receiveShadow>
    <meshStandardMaterial color={house.color} roughness={0.85} />
  </mesh></SceneObstacle>;
};

export const VillageBuildings = ({ village }: { village: Village }) => <>
  <BlockBatch blocks={village.masonry} roughness={0.87} />
  <BlockBatch blocks={village.timber} roughness={0.8} />
  <BlockBatch blocks={village.tiles} roughness={0.65} />
  <BlockBatch blocks={village.lights} glow />
  {village.houses.map((house, index) => <Roof key={index} house={house} />)}
</>;
