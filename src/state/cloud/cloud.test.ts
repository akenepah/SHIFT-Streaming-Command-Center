import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe,it,expect,beforeAll,afterAll } from 'vitest';
import { createInitialState } from '../appState';
import { migrationPayload,shouldOfferMigration } from './repository';
import {player} from '@/domain/testing/fixtures';
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; grant usage on schema public,auth to authenticated; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; insert into auth.users values('${A}'),('${B}');`);
 for (const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8'));
},30000);
afterAll(async()=>{await db?.close();});
async function asUser(id:string){await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}';`);}
async function save(state=sample(),revision=0){return db.query<{revision:number}>('select public.save_shift_state($1::jsonb,$2::bigint) revision',[JSON.stringify(migrationPayload(state)),revision]);}
function sample(){const s=createInitialState();s.setupComplete=true;s.players={custom:player('custom','TOR','C','RW')};s.roster=[{playerId:'custom',rosterStatus:'ACTIVE'}];s.overrides=[{date:'2026-10-06',playerId:'custom',targetSlotId:'RW1'}];s.transactions=[{id:'tx',type:'ADD',addPlayerId:'custom',effectiveDate:'2026-10-07',status:'PLANNED',createdAt:'2026-09-28T12:00:00Z'}];return s;}
describe('cloud persistence / real SQL migration',()=>{
 it('round trips normalized settings, custom players, roster, moves and overrides',async()=>{
  await asUser(A);await save();
  const {rows}=await db.query<{data:{revision:number,state:unknown}}>('select public.load_shift_state() data');
  expect(rows[0].data.revision).toBe(1);
  expect(rows[0].data.state).toMatchObject({setupComplete:true,roster:sample().roster,overrides:sample().overrides,settings:sample().settings});
  const tables=await db.query('select * from public.custom_players');expect(tables.rows).toHaveLength(1);
 });
 it('rejects repeated migration and stale tab writes without overwriting cloud',async()=>{
  await asUser(A);await expect(save(sample(),0)).rejects.toThrow('SHIFT_CONFLICT');
  await save(sample(),1);await expect(save(sample(),1)).rejects.toThrow('SHIFT_CONFLICT');
 });
 it('isolates user B with RLS and rejects forged ownership',async()=>{
  await asUser(B);
  expect((await db.query('select * from public.leagues')).rows).toHaveLength(0);
  expect((await db.query<{data:unknown}>('select public.load_shift_state() data')).rows[0].data).toBeNull();
  await expect(db.query("insert into public.custom_players(team_id,owner_user_id,id,name,nhl_team,eligible_positions) values(gen_random_uuid(),$1,'x','forged','TOR',array['C'])",[A])).rejects.toThrow();
  await save();expect((await db.query('select * from public.leagues')).rows).toHaveLength(1);
  await asUser(A);expect((await db.query('select * from public.leagues')).rows).toHaveLength(1);
 });
 it('cloud wins and repair records never silently disappear during migration',()=>{
  expect(shouldOfferMigration(sample(),true)).toBe(false);
  expect(shouldOfferMigration(sample(),false)).toBe(true);
  expect(shouldOfferMigration(createInitialState(),false)).toBe(false);
  const s=sample();s.needsRepair=[{playerId:'bad',name:'Bad',nhlTeamId:'?',eligiblePositions:[],rosterStatus:null,problems:['Team']}];
  expect(()=>migrationPayload(s)).toThrow('Repair');
 });
});

import { LocalStorageRepository, SIGNED_OUT_BACKUP_KEY, STORAGE_KEY } from '../repository';
describe('local data is set aside, never destroyed, when cloud wins',()=>{
 it('backup() keeps a copy under its own key that load() never picks up',()=>{
  const data=new Map<string,string>();
  const repo=new LocalStorageRepository({getItem:k=>data.get(k)??null,setItem:(k,v)=>void data.set(k,v),removeItem:k=>void data.delete(k)});
  const s=sample();repo.save(s);repo.backup(s);repo.clear();
  expect(data.has(STORAGE_KEY)).toBe(false);
  expect(JSON.parse(data.get(SIGNED_OUT_BACKUP_KEY)!).state.roster).toEqual(s.roster);
  expect(repo.load().status).toBe('empty');
 });
});
