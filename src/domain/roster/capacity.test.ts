import {describe,it,expect} from 'vitest';
import {defaultRosterStatus,canAddToRoster,rosterCapacity} from './capacity';
import {slotsConfig,rostered,player} from '../testing/fixtures';
import {createInitialState} from '@/state/appState';
import {reducer} from '@/state/reducer';
import {validateSettings} from '../settings';
const config={...slotsConfig({C:1}),benchSlots:1,irPlusSlots:1};
describe('roster capacity and fresh add defaults',()=>{
 it('starts Active, falls back to Bench, never automatically IR+',()=>{
  expect(defaultRosterStatus([],config)).toBe('ACTIVE');
  expect(defaultRosterStatus([rostered('a')],config)).toBe('BENCH');
  expect(defaultRosterStatus([rostered('a'),rostered('b','BENCH')],config)).toBe('BENCH');
  expect(defaultRosterStatus([rostered('injured','IR_PLUS')],config)).toBe('ACTIVE');
 });
 it('enforces section limits and keeps IR separate',()=>{
  const full=[rostered('a'),rostered('b','BENCH')];
  expect(canAddToRoster(full,config,'BENCH')).toBe(false);
  expect(canAddToRoster(full,config,'ACTIVE')).toBe(false);
  expect(canAddToRoster(full,config,'IR_PLUS')).toBe(true);
  expect(canAddToRoster([...full,rostered('ir','IR_PLUS')],config,'IR_PLUS')).toBe(false);
 });
 it('reports legacy overflow without deleting players',()=>{
  const roster=[rostered('a'),rostered('b'),rostered('c')];
  expect(rosterCapacity(roster,config).regularOver).toBe(1);
  expect(roster).toHaveLength(3);
 });
 it('reducer blocks new additions at capacity',()=>{
  const s=createInitialState();s.settings.roster=config;s.players={a:player('a','TOR','C'),b:player('b','TOR','C'),c:player('c','TOR','C')};
  const a=reducer(s,{type:'roster/add',playerId:'a'});
  const b=reducer(a,{type:'roster/add',playerId:'b'});
  expect(b.roster.map(r=>r.rosterStatus)).toEqual(['ACTIVE','BENCH']);
  expect(reducer(b,{type:'roster/add',playerId:'c'})).toBe(b);
 });
 it('allows partial and empty setup completion',()=>{
  expect(reducer(createInitialState(),{type:'setup/complete'}).setupComplete).toBe(true);
 });
 it('rejects identical non-cancelled transactions',()=>{
  const draft={type:'ADD' as const,addPlayerId:'a',effectiveDate:'2026-10-06'};
  const first=reducer(createInitialState(),{type:'tx/create',id:'one',draft});
  expect(reducer(first,{type:'tx/create',id:'two',draft}).transactions).toHaveLength(1);
  const cancelled=reducer(first,{type:'tx/cancel',id:'one'});
  expect(reducer(cancelled,{type:'tx/create',id:'two',draft}).transactions).toHaveLength(2);
 });
 it('validates goalie slots against minimum appearances',()=>{
  const s=createInitialState().settings;s.roster.slots.G=0;
  expect(validateSettings(s)).toContain('Add a G slot or set minimum goalie appearances to None.');
  s.minGoalieAppearances=0;expect(validateSettings(s)).not.toContain('Add a G slot or set minimum goalie appearances to None.');
 });
});

import { describe as describe2, expect as expect2, it as it2 } from 'vitest';
import { cancelTransaction, restoreTransaction } from '../transactions/transactions';
describe2('planned move undo', () => {
 it2('restores a cancelled move exactly (Undo toast)', () => {
  const t = { id: 'm', type: 'ADD' as const, addPlayerId: 'x', effectiveDate: '2026-10-13', status: 'PLANNED' as const, createdAt: '2026-10-01T00:00:00Z' };
  const cancelled = cancelTransaction([t], 'm');
  expect2(cancelled[0].status).toBe('CANCELLED');
  expect2(restoreTransaction(cancelled, 'm')).toEqual([t]);
 });
});

import { describe as describeD, expect as expectD, it as itD } from 'vitest';
import { canAddToRoster as canAddD, defaultRosterStatus as defaultD, fillsOpenActiveSlot, statusChangeBlocker } from './capacity';
import { DEFAULT_ROSTER_CONFIGURATION as CFG } from '../config';
import type { Player as PlayerD, Position as PosD, RosterPlayer as RPD } from '../types';

describeD('position-aware Active capacity (D blocked by surplus forwards)', () => {
 // Default lineup: C3 LW3 RW3 D4 UTIL1 G1 = 15 slots.
 const mk = (id: string, ...positions: PosD[]): PlayerD => ({ id, name: id, nhlTeamId: 'EDM', eligiblePositions: positions });
 const centers = Array.from({ length: 12 }, (_, i) => mk(`c${i}`, 'C'));
 const d = [mk('d1', 'D'), mk('d2', 'D')];
 const g = mk('g1', 'G');
 const mcavoy = mk('mcavoy', 'D');
 const players = Object.fromEntries([...centers, ...d, g, mcavoy].map((p) => [p.id, p]));
 // 15 Active: 12 C (only 4 fit: C3 + UTIL), 2 D, 1 G. Two D slots are still open.
 const roster: RPD[] = [...centers, ...d, g].map((p) => ({ playerId: p.id, rosterStatus: 'ACTIVE' as const }));
 const benchRoster: RPD[] = [...roster.slice(0, 14), { playerId: 'g1', rosterStatus: 'ACTIVE' }, { playerId: 'mcavoy', rosterStatus: 'BENCH' }];

 itD('lets a D go Active when a D slot is open, even at 15 Active', () => {
  expectD(roster.filter((r) => r.rosterStatus === 'ACTIVE')).toHaveLength(15);
  expectD(fillsOpenActiveSlot(roster, CFG, { playerId: 'mcavoy', players })).toBe(true);
  expectD(canAddD(roster, CFG, 'ACTIVE', { playerId: 'mcavoy', players })).toBe(true);
  expectD(defaultD(roster, CFG, { playerId: 'mcavoy', players })).toBe('ACTIVE');
 });

 itD('still refuses a 13th Active center when every C and UTIL slot is taken, and says why', () => {
  const extra = mk('c99', 'C');
  const all = { ...players, c99: extra };
  expectD(canAddD(roster, CFG, 'ACTIVE', { playerId: 'c99', players: all })).toBe(false);
  expectD(defaultD(roster, CFG, { playerId: 'c99', players: all })).toBe('BENCH');
 });

 itD('Bench → Active for a benched D succeeds; the blocker explains refusals', () => {
  expectD(statusChangeBlocker(benchRoster, CFG, 'ACTIVE', { playerId: 'mcavoy', players })).toBeNull();
  const full: RPD[] = [...roster, { playerId: 'x', rosterStatus: 'BENCH' }];
  const withX = { ...players, x: mk('x', 'C') };
  expectD(statusChangeBlocker(full, CFG, 'ACTIVE', { playerId: 'x', players: withX })).toMatch(/No open lineup slot for C/);
 });
});
