/** A console (home or handheld), or the PC: one shelf of the collection. */
export interface Platform {
  id: string;
  name: string;
  /** The rail groups shelves by era. */
  era: string;
  /** Year it came out in America: the order inside its era. */
  year: number;
  /** Games come as cartridges or cards (drawn from the front) instead of discs in a case (drawn by their spine). */
  cartridge: boolean;
}

/** The eras of the rail, oldest first. The PC has no generation: it gets its own group, last. */
export const ERAS = [
  'Clásicas',
  '8 y 16 bits',
  '32 y 64 bits',
  '128 bits',
  'HD',
  'Ahora',
  'Computadora',
] as const;

/**
 * The shelves in rail order: by era, and inside an era by launch date in America (consoles and handhelds together).
 * Ids are what the collection file stores: never rename one.
 */
export const PLATFORMS: readonly Platform[] = [
  { id: 'a2600', name: 'Atari 2600', era: 'Clásicas', year: 1977, cartridge: true },
  { id: 'intv', name: 'Intellivision', era: 'Clásicas', year: 1979, cartridge: true },
  { id: 'coleco', name: 'ColecoVision', era: 'Clásicas', year: 1982, cartridge: true },
  { id: 'a7800', name: 'Atari 7800', era: 'Clásicas', year: 1986, cartridge: true },
  { id: 'nes', name: 'NES', era: '8 y 16 bits', year: 1985, cartridge: true },
  { id: 'sms', name: 'Master System', era: '8 y 16 bits', year: 1986, cartridge: true },
  { id: 'gb', name: 'Game Boy', era: '8 y 16 bits', year: 1989, cartridge: true },
  { id: 'genesis', name: 'Sega Genesis', era: '8 y 16 bits', year: 1989, cartridge: true },
  { id: 'tg16', name: 'TurboGrafx-16', era: '8 y 16 bits', year: 1989, cartridge: true },
  { id: 'neogeo', name: 'Neo Geo', era: '8 y 16 bits', year: 1990, cartridge: true },
  { id: 'gg', name: 'Game Gear', era: '8 y 16 bits', year: 1991, cartridge: true },
  { id: 'snes', name: 'Super Nintendo', era: '8 y 16 bits', year: 1991, cartridge: true },
  { id: 'segacd', name: 'Sega CD', era: '8 y 16 bits', year: 1992, cartridge: false },
  { id: '32x', name: 'Sega 32X', era: '8 y 16 bits', year: 1994, cartridge: true },
  { id: 'gbc', name: 'Game Boy Color', era: '8 y 16 bits', year: 1998, cartridge: true },
  { id: '3do', name: '3DO', era: '32 y 64 bits', year: 1993, cartridge: false },
  { id: 'jaguar', name: 'Atari Jaguar', era: '32 y 64 bits', year: 1993, cartridge: true },
  { id: 'saturn', name: 'Sega Saturn', era: '32 y 64 bits', year: 1995, cartridge: false },
  { id: 'vboy', name: 'Virtual Boy', era: '32 y 64 bits', year: 1995, cartridge: true },
  { id: 'ps1', name: 'PlayStation', era: '32 y 64 bits', year: 1995, cartridge: false },
  { id: 'n64', name: 'Nintendo 64', era: '32 y 64 bits', year: 1996, cartridge: true },
  { id: 'ngpc', name: 'Neo Geo Pocket Color', era: '32 y 64 bits', year: 1999, cartridge: true },
  { id: 'dreamcast', name: 'Dreamcast', era: '128 bits', year: 1999, cartridge: false },
  { id: 'ps2', name: 'PlayStation 2', era: '128 bits', year: 2000, cartridge: false },
  { id: 'gba', name: 'Game Boy Advance', era: '128 bits', year: 2001, cartridge: true },
  { id: 'xbox', name: 'Xbox', era: '128 bits', year: 2001, cartridge: false },
  { id: 'gc', name: 'GameCube', era: '128 bits', year: 2001, cartridge: false },
  { id: 'ds', name: 'Nintendo DS', era: 'HD', year: 2004, cartridge: true },
  { id: 'psp', name: 'PSP', era: 'HD', year: 2005, cartridge: false },
  { id: 'x360', name: 'Xbox 360', era: 'HD', year: 2005, cartridge: false },
  { id: 'ps3', name: 'PlayStation 3', era: 'HD', year: 2006, cartridge: false },
  { id: 'wii', name: 'Wii', era: 'HD', year: 2006, cartridge: false },
  { id: '3ds', name: 'Nintendo 3DS', era: 'HD', year: 2011, cartridge: true },
  { id: 'psvita', name: 'PS Vita', era: 'HD', year: 2012, cartridge: true },
  { id: 'wiiu', name: 'Wii U', era: 'HD', year: 2012, cartridge: false },
  { id: 'ps4', name: 'PlayStation 4', era: 'HD', year: 2013, cartridge: false },
  { id: 'xone', name: 'Xbox One', era: 'HD', year: 2013, cartridge: false },
  { id: 'switch', name: 'Switch', era: 'Ahora', year: 2017, cartridge: false },
  { id: 'xsx', name: 'Xbox Series X', era: 'Ahora', year: 2020, cartridge: false },
  { id: 'ps5', name: 'PlayStation 5', era: 'Ahora', year: 2020, cartridge: false },
  { id: 'switch2', name: 'Switch 2', era: 'Ahora', year: 2025, cartridge: true },
  { id: 'pc', name: 'PC', era: 'Computadora', year: 0, cartridge: false },
];

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));
const ORDER = new Map(PLATFORMS.map((p, i) => [p.id, i]));

export const platformById = (id: string): Platform | undefined => BY_ID.get(id);
export const isPlatformId = (id: unknown): id is string => typeof id === 'string' && BY_ID.has(id);
/** Position on the rail (unknown ids last). */
export const platformOrder = (id: string): number => ORDER.get(id) ?? PLATFORMS.length;

/** The consoles grouped by era, in rail order (for the form's picker). */
export const platformsByEra = (): { era: string; platforms: Platform[] }[] =>
  ERAS.map((era) => ({ era, platforms: PLATFORMS.filter((p) => p.era === era) })).filter(
    (g) => g.platforms.length > 0,
  );
