-- SHIFT: one account, many fantasy teams. Each league (with its 1:1 fantasy team) is a workspace.
-- Forward-only. Keeps the original load_shift_state()/save_shift_state() working for clients still on
-- the single-team build: they always read and write the user's FIRST (oldest) workspace.

alter table public.leagues drop constraint if exists leagues_owner_user_id_key;
-- Client-supplied creation key: makes "create this workspace" idempotent (double submit, retry, second tab).
alter table public.leagues add column if not exists origin_key text;
create unique index if not exists leagues_owner_origin_key on public.leagues(owner_user_id, origin_key) where origin_key is not null;
create index if not exists leagues_owner_created on public.leagues(owner_user_id, created_at, id);

-- Lightweight list for the Account menu (no rosters or moves).
create function public.list_shift_workspaces() returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id', l.id, 'leagueName', l.name, 'teamName', coalesce(t.name, ''), 'season', l.season,
   'setupComplete', l.setup_complete, 'updatedAt', l.updated_at, 'createdAt', l.created_at
 ) order by l.created_at, l.id), '[]'::jsonb)
 from public.leagues l left join public.fantasy_teams t on t.league_id = l.id
 where l.owner_user_id = auth.uid();
$$;

create function public.load_shift_workspace(p_league_id uuid) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare l public.leagues; t public.fantasy_teams; players jsonb; slots jsonb; roster jsonb; moves jsonb; overrides jsonb;
begin
 select * into l from public.leagues where id = p_league_id and owner_user_id = auth.uid() for share;
 if l.id is null then return null; end if;
 select * into t from public.fantasy_teams where league_id = l.id;
 select coalesce(jsonb_object_agg(position, count), '{}') into slots from public.league_slots where league_id = l.id;
 select coalesce(jsonb_object_agg(id, data), '{}') into players from (
  select id, jsonb_build_object('id',id,'name',name,'nhlTeamId',nhl_team,'eligiblePositions',eligible_positions,'headshot',headshot,'nhlPlayerId',null,'source','CUSTOM','eligibilitySource','USER') data from public.custom_players where team_id = t.id
  union all
  select id, jsonb_build_object('id',id,'name',name,'nhlTeamId',nhl_team,'eligiblePositions',eligible_positions,'headshot',headshot,'nhlPlayerId',nhl_player_id,'source','NHL','primaryPosition',primary_position,'yahooPlayerId',yahoo_player_id,'eligibilitySource',eligibility_source,'eligibilitySeason',eligibility_season) from public.player_overrides where team_id = t.id
 ) p;
 select coalesce(jsonb_agg(jsonb_build_object('playerId',player_id,'rosterStatus',roster_status) order by ordinal), '[]') into roster from public.roster_players where team_id = t.id;
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',id,'type',type,'addPlayerId',add_player_id,'dropPlayerId',drop_player_id,'effectiveDate',effective_date,'status',status,'createdAt',planned_at)) order by planned_at, id), '[]') into moves from public.planned_moves where team_id = t.id;
 select coalesce(jsonb_agg(jsonb_build_object('date',lineup_date,'playerId',player_id,'targetSlotId',target_slot) order by ordinal), '[]') into overrides from public.lineup_overrides where team_id = t.id;
 return jsonb_build_object('leagueId', l.id, 'revision', l.revision, 'state', jsonb_build_object('version',2,'setupComplete',l.setup_complete,'needsRepair','[]'::jsonb,'players',players,'roster',roster,'transactions',moves,'overrides',overrides,'settings',jsonb_build_object('leagueName',l.name,'teamName',t.name,'season',l.season,'numberOfTeams',l.number_of_teams,'weekStartsOn',l.week_start_reset_day,'weeklyAcquisitionLimit',l.weekly_acquisition_limit,'minGoalieAppearances',l.minimum_goalie_appearances,'defaultMoveTiming',l.default_effective_date,'roster',jsonb_build_object('slots',slots,'benchSlots',l.bench_slots,'irPlusSlots',l.ir_plus_slots))));
end $$;

-- p_league_id null = create a new workspace (expected_revision must be 0; p_origin_key makes it idempotent).
create function public.save_shift_workspace(p_league_id uuid, payload jsonb, expected_revision bigint, p_origin_key text default null) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); lid uuid; tid uuid; rev bigint; s jsonb := payload->'settings'; p jsonb; r jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
 if p_league_id is null then
   if expected_revision <> 0 then raise exception 'SHIFT_CONFLICT'; end if;
   if p_origin_key is not null and exists (select 1 from public.leagues where owner_user_id = uid and origin_key = p_origin_key) then
     raise exception 'SHIFT_DUPLICATE';
   end if;
   insert into public.leagues(owner_user_id,name,season,number_of_teams,week_start_reset_day,weekly_acquisition_limit,minimum_goalie_appearances,default_effective_date,bench_slots,ir_plus_slots,origin_key)
   values(uid,trim(s->>'leagueName'),s->>'season',(s->>'numberOfTeams')::int,(s->>'weekStartsOn')::int,(s->>'weeklyAcquisitionLimit')::int,(s->>'minGoalieAppearances')::int,s->>'defaultMoveTiming',(s#>>'{roster,benchSlots}')::int,(s#>>'{roster,irPlusSlots}')::int,p_origin_key)
   returning id into lid;
   rev := 0;
 else
   select id, revision into lid, rev from public.leagues where id = p_league_id and owner_user_id = uid for update;
   if lid is null then raise exception 'SHIFT_NOT_FOUND'; end if;
 end if;
 if rev <> expected_revision then raise exception 'SHIFT_CONFLICT'; end if;
 if (s#>>'{roster,slots,G}')::int = 0 and (s->>'minGoalieAppearances')::int > 0 then raise exception 'Add a G slot or remove goalie minimum'; end if;
 update public.leagues set name=trim(s->>'leagueName'),season=s->>'season',number_of_teams=(s->>'numberOfTeams')::int,
  week_start_reset_day=(s->>'weekStartsOn')::int,weekly_acquisition_limit=(s->>'weeklyAcquisitionLimit')::int,
  minimum_goalie_appearances=(s->>'minGoalieAppearances')::int,default_effective_date=s->>'defaultMoveTiming',
  bench_slots=(s#>>'{roster,benchSlots}')::int,ir_plus_slots=(s#>>'{roster,irPlusSlots}')::int,
  setup_complete=(payload->>'setupComplete')::boolean,revision=rev+1,updated_at=now() where id = lid;
 insert into public.fantasy_teams(league_id,owner_user_id,name) values(lid,uid,trim(s->>'teamName'))
  on conflict(league_id) do update set name=excluded.name,updated_at=now() returning id into tid;
 delete from public.league_slots where league_id = lid;
 insert into public.league_slots select lid,uid,key,value::int from jsonb_each_text(s#>'{roster,slots}');
 delete from public.custom_players where team_id = tid;
 delete from public.player_overrides where team_id = tid;
 delete from public.roster_players where team_id = tid;
 delete from public.planned_moves where team_id = tid;
 delete from public.lineup_overrides where team_id = tid;
 for p in select value from jsonb_array_elements(payload->'players') loop
  if p->>'source' = 'NHL' and p->>'nhlPlayerId' is not null then
   insert into public.player_overrides(team_id,owner_user_id,id,nhl_player_id,name,nhl_team,eligible_positions,headshot,primary_position,yahoo_player_id,eligibility_source,eligibility_season)
   values(tid,uid,p->>'id',(p->>'nhlPlayerId')::bigint,p->>'name',p->>'nhlTeamId',array(select jsonb_array_elements_text(p->'eligiblePositions')),p->>'headshot',p->>'primaryPosition',p->>'yahooPlayerId',p->>'eligibilitySource',p->>'eligibilitySeason');
  else
   insert into public.custom_players(team_id,owner_user_id,id,name,nhl_team,eligible_positions,headshot)
   values(tid,uid,p->>'id',p->>'name',p->>'nhlTeamId',array(select jsonb_array_elements_text(p->'eligiblePositions')),p->>'headshot');
  end if;
 end loop;
 for r in select value from jsonb_array_elements(payload->'roster') loop
  insert into public.roster_players(team_id,owner_user_id,player_id,roster_status,ordinal) values(tid,uid,r->>'playerId',r->>'rosterStatus',(r->>'ordinal')::int);
 end loop;
 for r in select value from jsonb_array_elements(payload->'transactions') loop
  insert into public.planned_moves(team_id,owner_user_id,id,type,add_player_id,drop_player_id,effective_date,status,planned_at)
  values(tid,uid,r->>'id',r->>'type',r->>'addPlayerId',r->>'dropPlayerId',(r->>'effectiveDate')::date,r->>'status',(r->>'createdAt')::timestamptz);
 end loop;
 for r in select value from jsonb_array_elements(payload->'overrides') loop
  insert into public.lineup_overrides(team_id,owner_user_id,lineup_date,player_id,target_slot,ordinal)
  values(tid,uid,(r->>'date')::date,r->>'playerId',r->>'targetSlotId',(r->>'ordinal')::int);
 end loop;
 return jsonb_build_object('leagueId', lid, 'revision', rev + 1);
end $$;

-- Single-team clients (the build currently on main): pinned to the user's first workspace.
create or replace function public.load_shift_state() returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare lid uuid;
begin
 select id into lid from public.leagues where owner_user_id = auth.uid() order by created_at, id limit 1;
 if lid is null then return null; end if;
 return public.load_shift_workspace(lid);
end $$;

create or replace function public.save_shift_state(payload jsonb, expected_revision bigint) returns bigint
language plpgsql security invoker set search_path = public, pg_temp as $$
declare lid uuid;
begin
 select id into lid from public.leagues where owner_user_id = auth.uid() order by created_at, id limit 1;
 return (public.save_shift_workspace(lid, payload, expected_revision)->>'revision')::bigint;
end $$;

revoke all on function public.list_shift_workspaces() from public, anon;
revoke all on function public.load_shift_workspace(uuid) from public, anon;
revoke all on function public.save_shift_workspace(uuid, jsonb, bigint, text) from public, anon;
grant execute on function public.list_shift_workspaces() to authenticated;
grant execute on function public.load_shift_workspace(uuid) to authenticated;
grant execute on function public.save_shift_workspace(uuid, jsonb, bigint, text) to authenticated;
