// Personagens animados do Cube World Kit usados como avatar dos agentes.
export const CHARACTERS = ['Demon', 'Giant', 'Goblin', 'Skeleton', 'Skeleton_Armor', 'Wizard', 'Yeti', 'Zombie'] as const;
export type Character = typeof CHARACTERS[number];

// Altura alvo em unidades do mundo (os robos antigos tinham ~2).
const HEIGHTS: Record<Character, number> = { Demon: 2.0, Giant: 2.6, Goblin: 1.9, Skeleton: 2.0, Skeleton_Armor: 2.1, Wizard: 2.3, Yeti: 2.2, Zombie: 2.0 };
export const characterHeight = (name: Character) => HEIGHTS[name];
