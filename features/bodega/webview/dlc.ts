// Kept apart from constants.ts: OfficeState imports those, and the Node tests can't load images.
import drlightUrl from './assets/dlc-drlight.png';
import pikminUrl from './assets/dlc-pikmin.png';

export interface DlcCharacter {
  id: string;
  name: string;
  /** First frame (24×44) of the character's sheet. */
  url: string;
  note: string;
}

/** Characters made and put on hold. Their full sheets live in arte/pixellab/personajes/<id>/. */
export const DLC_CHARACTERS: readonly DlcCharacter[] = [
  { id: 'drlight', name: 'Dr. Light', url: drlightUrl, note: 'En pausa: ya van tres con bata.' },
  { id: 'pikmin', name: 'Pikmin', url: pikminUrl, note: 'En pausa: de frente parece puerco.' },
];
