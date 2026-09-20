import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D } from 'three';
import type { Placement, Village } from '../../../core/world/village.types';
import { MODEL_SIZE } from '../../../core/world/village-models';
import { useVillageModels, villageUrl, type MergedModel } from './kit-models';

const NAMES = Object.keys(MODEL_SIZE);
NAMES.forEach((name) => useGLTF.preload(villageUrl(name)));
const SOLID = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const WINDOWS = new MeshBasicMaterial({ color: '#ffd28a', toneMapped: false });

const Building = ({ placement, model }: { placement: Placement; model: MergedModel }) =>
  <group position={placement.position} rotation={[0, placement.rotation, 0]} scale={placement.scale}>
    <mesh geometry={model.geometry} material={SOLID} castShadow receiveShadow />
    {model.windows && <mesh geometry={model.windows} material={WINDOWS} />}
  </group>
;

// Todos os props/ladrilhos de um mesmo modelo saem num unico draw call.
const Instanced = ({ placements, model, shadow }: { placements: Placement[]; model: MergedModel; shadow: boolean }) => {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const transform = new Object3D();
    placements.forEach((placement, index) => {
      transform.position.set(...placement.position); transform.rotation.set(0, placement.rotation, 0);
      transform.scale.setScalar(placement.scale); transform.updateMatrix();
      ref.current!.setMatrixAt(index, transform.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [placements]);
  return <instancedMesh ref={ref} args={[model.geometry, SOLID, placements.length]} castShadow={shadow} receiveShadow />;
};

const groupByModel = (placements: Placement[]) => {
  const groups = new Map<string, Placement[]>();
  for (const placement of placements) groups.set(placement.model, [...(groups.get(placement.model) ?? []), placement]);
  return [...groups.entries()];
};

export const VillageBuildings = ({ village }: { village: Village }) => {
  const models = useVillageModels(NAMES);
  const { gl, invalidate } = useThree();
  const props = useMemo(() => groupByModel(village.props), [village]);
  const paths = useMemo(() => groupByModel(village.paths), [village]);
  useEffect(() => { gl.shadowMap.needsUpdate = true; invalidate(); }, [gl, invalidate, models]);
  return <>
    {village.buildings.map((placement, index) => <Building key={index} placement={placement} model={models[placement.model]} />)}
    {props.map(([name, placements]) => <Instanced key={name} placements={placements} model={models[name]} shadow />)}
    {paths.map(([name, placements]) => <Instanced key={name} placements={placements} model={models[name]} shadow={false} />)}
  </>;
};
