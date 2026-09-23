/**
 * mystic-realm/storage/SoulRepository.ts
 * Persists the operator's Soul traits (risk/speed/taste). Small JSON file.
 */

import { SoulTraits } from '../models/MysticRealmState';

export interface SoulRepository {
  init(): Promise<void>;
  get(): Promise<SoulTraits>;
  set(patch: Partial<SoulTraits>): Promise<SoulTraits>;
  close(): Promise<void>;
}
