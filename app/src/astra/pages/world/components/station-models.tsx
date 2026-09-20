import { useEffect, useMemo, type ReactElement } from 'react';
import { useGLTF } from '@react-three/drei';
import { Material, MeshStandardMaterial } from 'three';
import { KIT_STATION_MODELS } from '../../../core/world/activity';
import { kitUrl, useKitMeshes, useVillageModels } from './kit-models';

KIT_STATION_MODELS.forEach((name) => useGLTF.preload(kitUrl(name)));

export type StationModel = { render: (material: Material) => ReactElement; height: number; width: number; makeMaterial: () => Material };

// Bancadas podem vir dos dois pacotes. Cada um tem seu proprio loader e
// material (atlas com textura no Cube World Kit, cor por vertice no Medieval
// Village), entao a escolha e feita por nome antes dos hooks rodarem.
const useKitStationModel = (name: string): StationModel => {
  const names = useMemo(() => [name], [name]);
  const { meshes, material } = useKitMeshes(names);
  const [mesh] = meshes;
  return useMemo(() => ({
    height: mesh.height, width: mesh.width,
    makeMaterial: () => { const copy = material.clone(); copy.transparent = true; copy.opacity = 0; return copy; },
    render: (instance: Material) => <mesh geometry={mesh.geometry} material={instance} castShadow receiveShadow />,
  }), [mesh, material]);
};

const useVillageStationModel = (name: string): StationModel => {
  const names = useMemo(() => [name], [name]);
  const model = useVillageModels(names)[name];
  const bounds = model.geometry.boundingBox!;
  return useMemo(() => ({
    height: model.height, width: Math.hypot(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z),
    makeMaterial: () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, transparent: true, opacity: 0 }),
    render: (instance: Material) => <>
      <mesh geometry={model.geometry} material={instance} castShadow receiveShadow />
      {model.windows && <mesh geometry={model.windows} material={instance} />}
    </>,
  }), [model, bounds]);
};

export const isKitStation = (name: string) => KIT_STATION_MODELS.includes(name);
// Um hook por pacote; quem chama escolhe pelo nome, que e fixo por instancia.
export const useKitStation = useKitStationModel;
export const useVillageStation = useVillageStationModel;

// Material proprio por instancia pra cada bancada aparecer e sumir em fade
// sem afetar as outras que compartilham a mesma geometria.
export const useStationMaterial = (model: StationModel) => {
  const material = useMemo(() => model.makeMaterial(), [model]);
  useEffect(() => () => material.dispose(), [material]);
  return material;
};
