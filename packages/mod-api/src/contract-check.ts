import type { Entity, Game, ModHost } from '@patch-notes-live/engine';
import type { Entity as ApiEntity, Game as ApiGame, Hooks } from '../api.js';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type EntityContractMatches = Assert<Same<Entity, ApiEntity>>;
export type GameContractMatches = Assert<Same<Game, ApiGame>>;
export type HooksContractMatches = Assert<Same<ModHost, Hooks>>;
