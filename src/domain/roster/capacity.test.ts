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
