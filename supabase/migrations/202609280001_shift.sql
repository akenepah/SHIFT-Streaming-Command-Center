-- SHIFT normalized user data. Shared NHL catalog and schedule remain versioned app assets.
create table public.leagues (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid not null unique references auth.users(id) on delete cascade,
 name text not null, season text not null, number_of_teams integer not null check (number_of_teams between 2 and 32),
 week_start_reset_day integer not null check (week_start_reset_day between 0 and 6),
 weekly_acquisition_limit integer not null check (weekly_acquisition_limit between 0 and 50),
 minimum_goalie_appearances integer not null check (minimum_goalie_appearances between 0 and 14),
 default_effective_date text not null check (default_effective_date in ('TODAY','NEXT_DAY')),
 bench_slots integer not null check (bench_slots between 0 and 20), ir_plus_slots integer not null check (ir_plus_slots between 0 and 10),
 setup_complete boolean not null default false, revision bigint not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,owner_user_id)
);
create table public.fantasy_teams (
 id uuid primary key default gen_random_uuid(), league_id uuid not null unique,
 owner_user_id uuid not null, name text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(league_id,owner_user_id) references public.leagues(id,owner_user_id) on delete cascade, unique(id,owner_user_id)
);
create table public.league_slots (
 league_id uuid not null, owner_user_id uuid not null, position text not null check(position in ('C','LW','RW','D','UTIL','G')),
 count integer not null check(count between 0 and 10), primary key(league_id,position),
 foreign key(league_id,owner_user_id) references public.leagues(id,owner_user_id) on delete cascade
);
create table public.custom_players (team_id uuid not null, owner_user_id uuid not null, id text not null, name text not null, nhl_team text not null, eligible_positions text[] not null, headshot text, primary key(team_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(team_id,owner_user_id) references public.fantasy_teams(id,owner_user_id) on delete cascade);
create table public.player_overrides (team_id uuid not null, owner_user_id uuid not null, id text not null, nhl_player_id bigint not null, name text not null, nhl_team text not null, eligible_positions text[] not null,
 headshot text, primary_position text, yahoo_player_id text, eligibility_source text, eligibility_season text, primary key(team_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(team_id,owner_user_id) references public.fantasy_teams(id,owner_user_id) on delete cascade);
create table public.roster_players (team_id uuid not null, owner_user_id uuid not null, player_id text not null, roster_status text not null check(roster_status in ('ACTIVE','BENCH','IR_PLUS')), ordinal integer not null,
 primary key(team_id,player_id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(team_id,owner_user_id) references public.fantasy_teams(id,owner_user_id) on delete cascade);
create table public.planned_moves (team_id uuid not null, owner_user_id uuid not null, id text not null, type text not null check(type in ('ADD','DROP','ADD_DROP')), add_player_id text, drop_player_id text,
 effective_date date not null, status text not null check(status in ('PLANNED','CANCELLED')), planned_at timestamptz not null, primary key(team_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(team_id,owner_user_id) references public.fantasy_teams(id,owner_user_id) on delete cascade);
create table public.lineup_overrides (team_id uuid not null, owner_user_id uuid not null, lineup_date date not null, player_id text not null, target_slot text not null, ordinal integer not null, primary key(team_id,lineup_date,player_id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(team_id,owner_user_id) references public.fantasy_teams(id,owner_user_id) on delete cascade);
alter table public.leagues enable row level security;
create policy owner_only on public.leagues for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create index on public.leagues(owner_user_id);
grant select, insert, update, delete on public.leagues to authenticated;
revoke all on public.leagues from anon;
alter table public.fantasy_teams enable row level security;
create policy owner_only on public.fantasy_teams for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create index on public.fantasy_teams(owner_user_id);
grant select, insert, update, delete on public.fantasy_teams to authenticated;
revoke all on public.fantasy_teams from anon;
alter table public.league_slots enable row level security;
create policy owner_only on public.league_slots for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create index on public.league_slots(owner_user_id);
grant select, insert, update, delete on public.league_slots to authenticated;
revoke all on public.league_slots from anon;
alter table public.custom_players enable row level security;
create policy owner_only on public.custom_players for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create index on public.custom_players(owner_user_id);
grant select, insert, update, delete on public.custom_players to authenticated;
revoke all on public.custom_players from anon;
alter table public.player_overrides enable row level security;
create policy owner_only on public.player_overrides for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create index on public.player_overrides(owner_user_id);
grant select, insert, update, delete on public.player_overrides to authenticated;
revoke all on public.player_overrides from anon;
alter table public.roster_players enable row level security;
create policy owner_only on public.roster_players for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create index on public.roster_players(owner_user_id);
grant select, insert, update, delete on public.roster_players to authenticated;
revoke all on public.roster_players from anon;
alter table public.planned_moves enable row level security;
create policy owner_only on public.planned_moves for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create index on public.planned_moves(owner_user_id);
grant select, insert, update, delete on public.planned_moves to authenticated;
revoke all on public.planned_moves from anon;
alter table public.lineup_overrides enable row level security;
create policy owner_only on public.lineup_overrides for all to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create index on public.lineup_overrides(owner_user_id);
grant select, insert, update, delete on public.lineup_overrides to authenticated;
revoke all on public.lineup_overrides from anon;
create unique index unique_live_move on public.planned_moves(team_id,coalesce(add_player_id,''),coalesce(drop_player_id,''),effective_date) where status <> 'CANCELLED';

create function public.save_shift_state(payload jsonb, expected_revision bigint) returns bigint
language plpgsql security invoker set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); lid uuid; tid uuid; rev bigint; s jsonb := payload->'settings'; p jsonb; r jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 -- Serializes concurrent first migrations as well as normal saves for this owner.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select id,revision into lid,rev from public.leagues where owner_user_id=uid for update;
 if lid is null then
   if expected_revision<>0 then raise exception 'SHIFT_CONFLICT'; end if;
   insert into public.leagues(owner_user_id,name,season,number_of_teams,week_start_reset_day,weekly_acquisition_limit,minimum_goalie_appearances,default_effective_date,bench_slots,ir_plus_slots)
   values(uid,trim(s->>'leagueName'),s->>'season',(s->>'numberOfTeams')::int,(s->>'weekStartsOn')::int,(s->>'weeklyAcquisitionLimit')::int,(s->>'minGoalieAppearances')::int,s->>'defaultMoveTiming',(s#>>'{roster,benchSlots}')::int,(s#>>'{roster,irPlusSlots}')::int) returning id into lid;
   rev:=0;
 end if;
 if rev<>expected_revision then raise exception 'SHIFT_CONFLICT'; end if;
 if (s#>>'{roster,slots,G}')::int=0 and (s->>'minGoalieAppearances')::int>0 then raise exception 'Add a G slot or remove goalie minimum'; end if;
 update public.leagues set name=trim(s->>'leagueName'),season=s->>'season',number_of_teams=(s->>'numberOfTeams')::int,
 week_start_reset_day=(s->>'weekStartsOn')::int,weekly_acquisition_limit=(s->>'weeklyAcquisitionLimit')::int,
 minimum_goalie_appearances=(s->>'minGoalieAppearances')::int,default_effective_date=s->>'defaultMoveTiming',
 bench_slots=(s#>>'{roster,benchSlots}')::int,ir_plus_slots=(s#>>'{roster,irPlusSlots}')::int,
 setup_complete=(payload->>'setupComplete')::boolean,revision=rev+1,updated_at=now() where id=lid;
 insert into public.fantasy_teams(league_id,owner_user_id,name) values(lid,uid,trim(s->>'teamName'))
 on conflict(league_id) do update set name=excluded.name,updated_at=now() returning id into tid;
 delete from public.league_slots where league_id=lid;
 insert into public.league_slots select lid,uid,key,value::int from jsonb_each_text(s#>'{roster,slots}');
 delete from public.custom_players where team_id=tid;
 delete from public.player_overrides where team_id=tid;
 delete from public.roster_players where team_id=tid;
 delete from public.planned_moves where team_id=tid;
 delete from public.lineup_overrides where team_id=tid;
 for p in select value from jsonb_array_elements(payload->'players') loop
  if p->>'source'='NHL' and p->>'nhlPlayerId' is not null then
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
 return rev+1;
end $$;

create function public.load_shift_state() returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.leagues; t public.fantasy_teams; players jsonb; slots jsonb; roster jsonb; moves jsonb; overrides jsonb;
begin
 select * into l from public.leagues where owner_user_id=auth.uid() for share;
 if l.id is null then return null; end if;
 select * into t from public.fantasy_teams where league_id=l.id;
 select coalesce(jsonb_object_agg(position,count),'{}') into slots from public.league_slots where league_id=l.id;
 select coalesce(jsonb_object_agg(id,data),'{}') into players from (
  select id,jsonb_build_object('id',id,'name',name,'nhlTeamId',nhl_team,'eligiblePositions',eligible_positions,'headshot',headshot,'nhlPlayerId',null,'source','CUSTOM','eligibilitySource','USER') data from public.custom_players where team_id=t.id
  union all
  select id,jsonb_build_object('id',id,'name',name,'nhlTeamId',nhl_team,'eligiblePositions',eligible_positions,'headshot',headshot,'nhlPlayerId',nhl_player_id,'source','NHL','primaryPosition',primary_position,'yahooPlayerId',yahoo_player_id,'eligibilitySource',eligibility_source,'eligibilitySeason',eligibility_season) from public.player_overrides where team_id=t.id
 ) p;
 select coalesce(jsonb_agg(jsonb_build_object('playerId',player_id,'rosterStatus',roster_status) order by ordinal),'[]') into roster from public.roster_players where team_id=t.id;
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',id,'type',type,'addPlayerId',add_player_id,'dropPlayerId',drop_player_id,'effectiveDate',effective_date,'status',status,'createdAt',planned_at)) order by planned_at,id),'[]') into moves from public.planned_moves where team_id=t.id;
 select coalesce(jsonb_agg(jsonb_build_object('date',lineup_date,'playerId',player_id,'targetSlotId',target_slot) order by ordinal),'[]') into overrides from public.lineup_overrides where team_id=t.id;
 return jsonb_build_object('revision',l.revision,'state',jsonb_build_object('version',2,'setupComplete',l.setup_complete,'needsRepair','[]'::jsonb,'players',players,'roster',roster,'transactions',moves,'overrides',overrides,'settings',jsonb_build_object('leagueName',l.name,'teamName',t.name,'season',l.season,'numberOfTeams',l.number_of_teams,'weekStartsOn',l.week_start_reset_day,'weeklyAcquisitionLimit',l.weekly_acquisition_limit,'minGoalieAppearances',l.minimum_goalie_appearances,'defaultMoveTiming',l.default_effective_date,'roster',jsonb_build_object('slots',slots,'benchSlots',l.bench_slots,'irPlusSlots',l.ir_plus_slots))));
end $$;
revoke all on function public.save_shift_state(jsonb,bigint) from public,anon;
revoke all on function public.load_shift_state() from public,anon;
grant execute on function public.save_shift_state(jsonb,bigint) to authenticated;
grant execute on function public.load_shift_state() to authenticated;
