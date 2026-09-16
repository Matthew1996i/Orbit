// Dimensoes brutas (x, y, z) dos modelos do Medieval Village (Quaternius, CC0),
// medidas nos GLBs em public/models/medievalvillage. A escala do mundo e
// aplicada em cima disso (VILLAGE_SCALE).
export const VILLAGE_SCALE = 3;
export const MODEL_SIZE: Record<string, [number, number, number]> = {
  House_1: [2.14, 3.39, 2.66], House_2: [2.22, 3.25, 3.42], House_3: [1.94, 2.09, 2.12],
  Inn: [4.03, 3.49, 4.02], Blacksmith: [3.89, 3.0, 3.28], Mill: [3.4, 4.8, 2.73],
  Sawmill: [4.4, 2.86, 3.28], Stable: [4.7, 2.49, 3.33], Bell_Tower: [1.94, 4.76, 2.23],
  Barrel: [0.16, 0.2, 0.16], Crate: [0.16, 0.16, 0.16], Hay: [0.12, 0.18, 0.12], Cart: [0.46, 0.8, 0.93],
  Fence: [0.79, 0.33, 0.03], Bench_1: [0.66, 0.32, 0.24], Bench_2: [0.66, 0.19, 0.22],
  MarketStand_1: [0.95, 1.05, 1.19], MarketStand_2: [0.52, 1.04, 1.15], Gazebo: [1.04, 1.35, 1.26],
  Bonfire_Lit: [0.41, 0.35, 0.36], Cauldron: [0.36, 0.25, 0.3], Bags: [0.27, 0.11, 0.24], Bag: [0.15, 0.06, 0.11],
  Bag_Open: [0.15, 0.1, 0.2], Package_1: [0.28, 0.13, 0.18], Package_2: [0.19, 0.16, 0.19],
  Rock_1: [0.26, 0.17, 0.21], Rock_2: [0.24, 0.15, 0.09], Path_Square: [0.49, 0.05, 0.48], Path_Straight: [0.5, 0.04, 0.98],
};
export const modelHeight = (model: string) => MODEL_SIZE[model][1] * VILLAGE_SCALE;
export const modelFootprint = (model: string, scale = VILLAGE_SCALE) => {
  const [x, , z] = MODEL_SIZE[model];
  return Math.hypot(x, z) / 2 * scale;
};
