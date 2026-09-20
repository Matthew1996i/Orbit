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

// mergeGeometries exige o mesmo conjunto de atributos (e o mesmo uso de
// indice) em todas as partes; alguns modelos misturam meshes com e sem uv ou
// cor, entao ficamos so com o que todas tem e desindexamos quando preciso.
const alignAttributes = (parts: BufferGeometry[]): BufferGeometry[] => {
  const shared = Object.keys(parts[0].attributes).filter((name) => parts.every((part) => part.attributes[name]));
  const indexed = parts.every((part) => part.index);
  return parts.map((part) => {
    const aligned = indexed || !part.index ? part : part.toNonIndexed();
    for (const name of Object.keys(aligned.attributes)) if (!shared.includes(name)) aligned.deleteAttribute(name);
    aligned.morphAttributes = {};
    return aligned;
  });
};

export const useKitMeshes = (names: string[]) => {
  const urls = useMemo(() => names.map(kitUrl), [names]);
  const gltfs = useGLTF(urls);
  return useMemo(() => {
    let material: Material | null = null;
    const meshes = gltfs.map(({ scene }, index): KitMesh => {
      const parts: BufferGeometry[] = [];
      scene.updateMatrixWorld(true);
      scene.traverse((object) => {
        if (!(object as Mesh).isMesh) return;
        const mesh = object as Mesh;
        if (!material) material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        parts.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
      });
      if (!parts.length) throw new Error(`Modelo ${names[index]} sem mesh`);
      const geometry = mergeGeometries(alignAttributes(parts), false);
      if (!geometry) throw new Error(`Modelo ${names[index]} com meshes incompativeis`);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const height = box.max.y - box.min.y, width = Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z);
      geometry.translate(-(box.max.x + box.min.x) / 2, -box.min.y, -(box.max.z + box.min.z) / 2);
      parts.forEach((part) => part.dispose());
      return { geometry, height, width };
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
  const bounds = geometry.boundingBox!, height = bounds.max.y - bounds.min.y;
  const offset: [number, number, number] = [-(bounds.max.x + bounds.min.x) / 2, -bounds.min.y, -(bounds.max.z + bounds.min.z) / 2];
  const windows = glow.length ? mergeGeometries(glow, false) : null;
  geometry.translate(...offset); windows?.translate(...offset);
  [...solid, ...glow].forEach((part) => part.dispose());
  return { geometry, windows, height };
};

export const useVillageModels = (names: string[]) => {
  const urls = useMemo(() => names.map(villageUrl), [names]);
  const gltfs = useGLTF(urls);
  return useMemo(() => Object.fromEntries(names.map((name, index) => [name, mergeModel(gltfs[index].scene)])) as Record<string, MergedModel>, [gltfs, names]);
};
