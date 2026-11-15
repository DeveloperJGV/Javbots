/** A home console: one shelf of the collection. */
export interface Platform {
  id: string;
  name: string;
  /** The rail groups shelves by era. */
  era: string;
  /** Games come as cartridges (drawn from the front) instead of discs in a case (drawn by their spine). */
  cartridge: boolean;
}

/** The shelves, oldest first (the order of the rail). Home consoles from NES to Series X. */
export const PLATFORMS: readonly Platform[] = [
  { id: 'nes', name: 'NES', era: '8 y 16 bits', cartridge: true },
  { id: 'snes', name: 'Super Nintendo', era: '8 y 16 bits', cartridge: true },
  { id: 'n64', name: 'Nintendo 64', era: '32 y 64 bits', cartridge: true },
  { id: 'ps1', name: 'PlayStation', era: '32 y 64 bits', cartridge: false },
  { id: 'gc', name: 'GameCube', era: '128 bits', cartridge: false },
  { id: 'xbox', name: 'Xbox', era: '128 bits', cartridge: false },
  { id: 'ps2', name: 'PlayStation 2', era: '128 bits', cartridge: false },
  { id: 'x360', name: 'Xbox 360', era: 'HD', cartridge: false },
  { id: 'wii', name: 'Wii', era: 'HD', cartridge: false },
  { id: 'ps3', name: 'PlayStation 3', era: 'HD', cartridge: false },
  { id: 'wiiu', name: 'Wii U', era: 'HD', cartridge: false },
  { id: 'xone', name: 'Xbox One', era: 'HD', cartridge: false },
  { id: 'ps4', name: 'PlayStation 4', era: 'HD', cartridge: false },
  { id: 'switch', name: 'Switch', era: 'Ahora', cartridge: false },
  { id: 'ps5', name: 'PlayStation 5', era: 'Ahora', cartridge: false },
  { id: 'xsx', name: 'Xbox Series X', era: 'Ahora', cartridge: false },
];

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));

export const platformById = (id: string): Platform | undefined => BY_ID.get(id);
export const isPlatformId = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id);
/** Position on the rail (unknown ids last). */
export const platformOrder = (id: string): number => {
  const i = PLATFORMS.findIndex((p) => p.id === id);
  return i < 0 ? PLATFORMS.length : i;
};
