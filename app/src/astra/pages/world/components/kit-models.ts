import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, Color, Material, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Modelos do Cube World Kit (Quaternius, CC0), servidos de public/models.
// Todos compartilham o mesmo atlas de textura, entao reaproveitamos o material
// da primeira mesh carregada pra nao subir uma copia da textura por modelo.
export const KIT = '/models/cubeworldkit';
export const kitUrl = (name: string) => `${KIT}/${name}.glb`;

export type KitMesh = { geometry: BufferGeometry; height: number; width: number };

export const useKitMeshes = (names: string[]) => {
  const urls = useMemo(() => names.map(kitUrl), [names]);
  const gltfs = useGLTF(urls);
  return useMemo(() => {
    let material: Material | null = null;
    const meshes = gltfs.map(({ scene }, index): KitMesh => {
      let mesh: Mesh | null = null;
      scene.traverse((object) => { if (!mesh && (object as Mesh).isMesh) mesh = object as Mesh; });
      if (!mesh) throw new Error(`Modelo ${names[index]} sem mesh`);
      const { geometry } = mesh as Mesh;
      if (!material) material = (mesh as Mesh).material as Material;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      return { geometry, height: box.max.y - box.min.y, width: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) };
    });
    return { meshes, material: material! };
  }, [gltfs, names]);
};

// Modelos do Medieval Village (Quaternius, CC0). Vem de OBJ sem textura, com
// uma cor solida por material; fundimos todas as partes numa unica geometria
// com cor por vertice (um draw call por modelo, e instanciavel). As janelas
// saem separadas pra brilhar como as da vila antiga.
export const VILLAGE = '/models/medievalvillage';
export const villageUrl = (name: string) => `${VILLAGE}/${name}.glb`;
export type MergedModel = { geometry: BufferGeometry; windows: BufferGeometry | null; height: number };

const bakeColor = (geometry: BufferGeometry, color: Color) => {
  const count = geometry.attributes.position.count, colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) { colors[index * 3] = color.r; colors[index * 3 + 1] = color.g; colors[index * 3 + 2] = color.b; }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
};

export const mergeModel = (scene: Object3D): MergedModel => {
  scene.updateMatrixWorld(true);
  const solid: BufferGeometry[] = [], glow: BufferGeometry[] = [];
  scene.traverse((object) => {
    if (!(object as Mesh).isMesh) return;
    const mesh = object as Mesh, material = mesh.material as MeshStandardMaterial;
    const geometry = mesh.geometry.clone().toNonIndexed().applyMatrix4(mesh.matrixWorld);
    for (const attribute of Object.keys(geometry.attributes)) if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute);
    (material.name === 'Windows' ? glow : solid).push(bakeColor(geometry, material.color));
  });
  const geometry = mergeGeometries(solid, false)!;
  geometry.computeBoundingBox();
  return { geometry, windows: glow.length ? mergeGeometries(glow, false) : null, height: geometry.boundingBox!.max.y - geometry.boundingBox!.min.y };
};

export const useVillageModels = (names: string[]) => {
  const urls = useMemo(() => names.map(villageUrl), [names]);
  const gltfs = useGLTF(urls);
  return useMemo(() => Object.fromEntries(names.map((name, index) => [name, mergeModel(gltfs[index].scene)])) as Record<string, MergedModel>, [gltfs, names]);
};
