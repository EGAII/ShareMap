-- =====================================================================
-- ShareMap — Supabase schema (multi-organization)
-- Run this whole file once in Supabase Dashboard → SQL Editor → New query.
-- =====================================================================

create extension if not exists pg_cron;

-- How many days ahead recurring events are generated.
create or replace function public.event_horizon_days() returns int
language sql immutable as $$ select 90 $$;

-- ---------------------------------------------------------------------
-- Profiles (display names)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at   timestamptz not null default now()
);
-- Guests sign in with only a nickname (Supabase anonymous sign-in)
alter table public.profiles add column if not exists is_guest boolean not null default false;

-- How long a guest account lives after joining its first group
create or replace function public.guest_days() returns int
language sql immutable as $$ select 7 $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name, is_guest)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
                   nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Guest'),
          coalesce(new.is_anonymous, false))
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles(id, display_name, is_guest)
select id, coalesce(nullif(split_part(coalesce(email, ''), '@', 1), ''), 'Guest'), coalesce(is_anonymous, false)
from auth.users
on conflict do nothing;

-- true when the signed-in user is a guest
create or replace function public.is_guest() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- ---------------------------------------------------------------------
-- Organizations & members
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id          bigint generated always as identity primary key,
  name        text not null check (length(trim(name)) > 0),
  invite_code text not null unique,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id    bigint not null references public.organizations(id) on delete cascade,
  user_id   uuid   not null references public.profiles(id) on delete cascade,
  role      text   not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on public.org_members(user_id);
-- The owner can stop a member from creating events or from joining them.
alter table public.org_members add column if not exists can_create boolean not null default true;
alter table public.org_members add column if not exists can_join   boolean not null default true;
-- "Organizer": granted by the owner; may add 2 places a day instead of 1.
alter table public.org_members add column if not exists organizer  boolean not null default false;

-- People the owner banned for good: removed and cannot join again.
create table if not exists public.org_bans (
  org_id       bigint not null references public.organizations(id) on delete cascade,
  user_id      uuid   not null,
  display_name text   not null default '',
  banned_by    uuid,
  banned_at    timestamptz not null default now(),
  primary key (org_id, user_id)
);

create or replace function public.is_org_member(p_org bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.is_org_owner(p_org bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.can_create_in(p_org bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid() and can_create);
$$;

create or replace function public.can_join_in(p_org bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid() and can_join);
$$;

create or replace function public.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members a join public.org_members b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- 8 characters, no look-alikes (0/O, 1/I/L)
create or replace function public.new_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.organizations where invite_code = code);
  end loop;
  return code;
end $$;

create or replace function public.create_organization(p_name text) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare o public.organizations;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.is_guest() then raise exception 'GUEST_NOT_ALLOWED'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Name is required'; end if;
  insert into public.organizations(name, invite_code, created_by)
  values (trim(p_name), public.new_invite_code(), auth.uid())
  returning * into o;
  insert into public.org_members(org_id, user_id, role) values (o.id, auth.uid(), 'owner');
  return o;
end $$;

create or replace function public.join_organization(p_code text) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare o public.organizations;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into o from public.organizations
  where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if o.id is null then raise exception 'Invalid invite code'; end if;
  if exists (select 1 from public.org_bans where org_id = o.id and user_id = auth.uid()) then
    raise exception 'BANNED_FROM_ORG';
  end if;
  insert into public.org_members(org_id, user_id) values (o.id, auth.uid()) on conflict do nothing;
  return o;
end $$;

create or replace function public.regenerate_invite_code(p_org bigint) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not public.is_org_owner(p_org) then raise exception 'Only the owner can do this'; end if;
  code := public.new_invite_code();
  update public.organizations set invite_code = code where id = p_org;
  return code;
end $$;

drop function if exists public.set_member_permissions(bigint, uuid, boolean, boolean);
create or replace function public.set_member_permissions(
  p_org bigint, p_user uuid, p_organizer boolean, p_can_create boolean, p_can_join boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_owner(p_org) then raise exception 'Only the owner can do this'; end if;
  update public.org_members set organizer = p_organizer, can_create = p_can_create, can_join = p_can_join
   where org_id = p_org and user_id = p_user and role <> 'owner';
  if not found then raise exception 'The owner cannot be restricted'; end if;
end $$;

-- Remove a member and stop them from ever joining again (until unbanned).
create or replace function public.ban_member(p_org bigint, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_owner(p_org) then raise exception 'Only the owner can do this'; end if;
  if p_user = auth.uid() then raise exception 'You cannot ban yourself'; end if;
  insert into public.org_bans(org_id, user_id, display_name, banned_by)
  values (p_org, p_user, coalesce((select display_name from public.profiles where id = p_user), ''), auth.uid())
  on conflict do nothing;
  delete from public.org_members where org_id = p_org and user_id = p_user;
end $$;

create or replace function public.unban_member(p_org bigint, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_owner(p_org) then raise exception 'Only the owner can do this'; end if;
  delete from public.org_bans where org_id = p_org and user_id = p_user;
end $$;

-- When someone leaves: delete empty orgs, and make sure an owner remains.
create or replace function public.on_member_removed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.organizations where id = old.org_id) then
    return old;   -- the organization itself is being deleted
  elsif not exists (select 1 from public.org_members where org_id = old.org_id) then
    delete from public.organizations where id = old.org_id;
  elsif not exists (select 1 from public.org_members where org_id = old.org_id and role = 'owner') then
    update public.org_members set role = 'owner', can_create = true, can_join = true, organizer = true
    where (org_id, user_id) = (
      select org_id, user_id from public.org_members where org_id = old.org_id order by joined_at limit 1);
  end if;
  return old;
end $$;

drop trigger if exists member_removed on public.org_members;
create trigger member_removed
  after delete on public.org_members
  for each row execute function public.on_member_removed();

revoke execute on function public.create_organization(text), public.join_organization(text),
  public.regenerate_invite_code(bigint), public.set_member_permissions(bigint, uuid, boolean, boolean, boolean),
  public.ban_member(bigint, uuid), public.unban_member(bigint, uuid) from public, anon;
grant execute on function public.create_organization(text), public.join_organization(text),
  public.regenerate_invite_code(bigint), public.set_member_permissions(bigint, uuid, boolean, boolean, boolean),
  public.ban_member(bigint, uuid), public.unban_member(bigint, uuid),
  public.is_org_member(bigint), public.is_org_owner(bigint), public.can_create_in(bigint), public.can_join_in(bigint)
  to authenticated;

-- ---------------------------------------------------------------------
-- Categories (max 2 levels: parent → child), per organization
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id         bigint generated always as identity primary key,
  org_id     bigint not null references public.organizations(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  parent_id  bigint references public.categories(id) on delete cascade,
  sort_order int not null default 0,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists categories_org_idx on public.categories(org_id);

create or replace function public.check_category() returns trigger
language plpgsql as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'A category cannot be its own parent';
    end if;
    if not exists (select 1 from public.categories where id = new.parent_id and org_id = new.org_id) then
      raise exception 'Parent category belongs to another organization';
    end if;
    if exists (select 1 from public.categories where id = new.parent_id and parent_id is not null) then
      raise exception 'Only 2 levels of categories are allowed';
    end if;
    if exists (select 1 from public.categories where parent_id = new.id) then
      raise exception 'This category has sub-categories, so it cannot become a sub-category';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists categories_check on public.categories;
create trigger categories_check
  before insert or update on public.categories
  for each row execute function public.check_category();

-- ---------------------------------------------------------------------
-- Places (Google Maps share links)
-- ---------------------------------------------------------------------
create table if not exists public.places (
  id          bigint generated always as identity primary key,
  org_id      bigint not null references public.organizations(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  map_url     text not null check (map_url ~* '^https?://'),
  category_id bigint references public.categories(id) on delete set null,
  note        text not null default '',
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists places_org_idx on public.places(org_id);

-- Places a member may add per day (Japan time): 1, or 2 for organizers.
-- null = no limit (the owner).
create or replace function public.place_daily_limit(p_org bigint) returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if public.is_org_owner(p_org) then return null; end if;
  if exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid() and organizer) then return 2; end if;
  return 1;
end $$;

create or replace function public.check_place() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; used int;
begin
  if auth.uid() is not null then   -- requests from the site (not the dashboard)
    if tg_op = 'UPDATE' then
      -- who added it, when, and in which organization never change
      new.created_by := old.created_by;
      new.created_at := old.created_at;
      new.org_id     := old.org_id;
    else
      new.created_by := auth.uid();
      new.created_at := now();
      lim := public.place_daily_limit(new.org_id);
      if lim is not null then
        select count(*) into used from public.places
         where org_id = new.org_id and created_by = auth.uid()
           and (created_at at time zone 'Asia/Tokyo')::date = (now() at time zone 'Asia/Tokyo')::date;
        if used >= lim then raise exception 'PLACE_DAILY_LIMIT %', lim; end if;
      end if;
    end if;
  end if;
  if new.category_id is not null
     and not exists (select 1 from public.categories where id = new.category_id and org_id = new.org_id) then
    raise exception 'Category belongs to another organization';
  end if;
  return new;
end $$;

drop trigger if exists places_check on public.places;
create trigger places_check
  before insert or update on public.places
  for each row execute function public.check_place();

-- ---------------------------------------------------------------------
-- Event series = the "rule" (one-off or repeating).
-- Events = concrete dates generated from a series.
-- ---------------------------------------------------------------------
create table if not exists public.event_series (
  id               bigint generated always as identity primary key,
  org_id           bigint not null references public.organizations(id) on delete cascade,
  place_id         bigint not null references public.places(id) on delete cascade,
  title            text not null check (length(trim(title)) > 0),
  description      text not null default '',
  start_date       date not null,
  start_time       time not null,
  duration_minutes int  not null default 120 check (duration_minutes > 0),
  timezone         text not null default 'Asia/Tokyo',
  freq             text not null default 'none' check (freq in ('none','daily','weekly','monthly')),
  interval_n       int  not null default 1 check (interval_n between 1 and 52),
  weekdays         int[] not null default '{}',   -- 0=Sun … 6=Sat (weekly only)
  until_date       date,
  capacity         int check (capacity is null or capacity > 0),
  active           boolean not null default true,
  created_by       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now()
);

create or replace function public.check_series() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.places where id = new.place_id and org_id = new.org_id) then
    raise exception 'Place belongs to another organization';
  end if;
  return new;
end $$;

drop trigger if exists series_check on public.event_series;
create trigger series_check
  before insert or update on public.event_series
  for each row execute function public.check_series();

create table if not exists public.events (
  id          bigint generated always as identity primary key,
  org_id      bigint not null references public.organizations(id) on delete cascade,
  series_id   bigint not null references public.event_series(id) on delete cascade,
  place_id    bigint not null references public.places(id) on delete cascade,
  title       text not null,
  description text not null default '',
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  capacity    int,
  cancelled   boolean not null default false,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (series_id, starts_at)
);
create index if not exists events_org_starts_idx on public.events(org_id, starts_at);

-- People who joined a specific date. Order of joined_at decides who is
-- confirmed and who is on the waiting list (capacity is never a hard block).
create table if not exists public.event_participants (
  id         bigint generated always as identity primary key,
  event_id   bigint not null references public.events(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  guest_name text not null default '',   -- '' = the user themself; otherwise a guest they bring
  joined_at  timestamptz not null default now(),
  unique (event_id, user_id, guest_name)
);
create index if not exists participants_event_idx on public.event_participants(event_id);

-- "Auto-join every time" for a repeating series.
create table if not exists public.series_subscribers (
  series_id  bigint not null references public.event_series(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (series_id, user_id)
);

-- Confirmed / waiting list, computed live.
create or replace view public.event_participant_status
with (security_invoker = true) as
select p.id, p.event_id, p.user_id, p.guest_name, p.joined_at,
       pr.display_name,
       row_number() over w as position,
       case when e.capacity is null or row_number() over w <= e.capacity
            then 'confirmed' else 'waitlist' end as status
from public.event_participants p
join public.events e on e.id = p.event_id
left join public.profiles pr on pr.id = p.user_id
window w as (partition by p.event_id order by p.joined_at, p.id);

grant select on public.event_participant_status to authenticated;

-- ---------------------------------------------------------------------
-- Generator: creates concrete events for the next N days.
-- p_series_id = null → all active repeating series (used by cron).
-- ---------------------------------------------------------------------
create or replace function public.generate_series_events(
  p_series_id bigint default null,
  p_horizon_days int default public.event_horizon_days()
) returns int
language plpgsql security definer set search_path = public as $$
declare
  s      record;
  d      date;
  d_from date;
  d_to   date;
  today  date;
  wd     int[];
  ok     boolean;
  st     timestamptz;
  new_id bigint;
  n      int := 0;
begin
  for s in
    select * from public.event_series
    where active
      and (p_series_id is null or id = p_series_id)
      and (p_series_id is not null or freq <> 'none')
  loop
    today := (now() at time zone s.timezone)::date;
    if s.freq = 'none' then
      d_from := s.start_date;
      d_to   := s.start_date;
    else
      d_from := greatest(s.start_date, today);
      d_to   := today + p_horizon_days;
      if s.until_date is not null then d_to := least(d_to, s.until_date); end if;
    end if;

    wd := case when coalesce(cardinality(s.weekdays), 0) = 0
               then array[extract(dow from s.start_date)::int] else s.weekdays end;

    d := d_from;
    while d <= d_to loop
      ok := case s.freq
        when 'none'    then true
        when 'daily'   then (d - s.start_date) % s.interval_n = 0
        when 'weekly'  then extract(dow from d)::int = any(wd)
                        and ((d - (s.start_date - extract(dow from s.start_date)::int)) / 7) % s.interval_n = 0
        when 'monthly' then extract(day from d) = extract(day from s.start_date)
                        and ((extract(year from d) * 12 + extract(month from d))
                           - (extract(year from s.start_date) * 12 + extract(month from s.start_date)))::int
                           % s.interval_n = 0
        else false
      end;

      if ok then
        st := (d + s.start_time) at time zone s.timezone;
        insert into public.events(org_id, series_id, place_id, title, description, starts_at, ends_at, capacity, created_by)
        values (s.org_id, s.id, s.place_id, s.title, s.description, st,
                st + make_interval(mins => s.duration_minutes), s.capacity, s.created_by)
        on conflict (series_id, starts_at) do nothing
        returning id into new_id;

        if new_id is not null then
          -- auto-join subscribers who may still join, in the order they subscribed
          insert into public.event_participants(event_id, user_id, joined_at)
          select new_id, ss.user_id, ss.created_at
          from public.series_subscribers ss
          join public.org_members m on m.org_id = s.org_id and m.user_id = ss.user_id and m.can_join
          where ss.series_id = s.id
          on conflict do nothing;
          n := n + 1;
        end if;
      end if;
      d := d + 1;
    end loop;
  end loop;
  return n;
end $$;

revoke execute on function public.generate_series_events(bigint, int) from public, anon, authenticated;

-- Series insert/update → (re)generate dates and propagate edits.
create or replace function public.on_series_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    update public.events
       set title = new.title, description = new.description, capacity = new.capacity
     where series_id = new.id and starts_at > now();

    if not new.active then
      delete from public.events where series_id = new.id and starts_at > now();
    elsif new.until_date is not null then
      delete from public.events
       where series_id = new.id and starts_at > now()
         and (starts_at at time zone new.timezone)::date > new.until_date;
    end if;
  end if;

  if new.active then
    perform public.generate_series_events(new.id);
  end if;
  return new;
end $$;

drop trigger if exists series_changed on public.event_series;
create trigger series_changed
  after insert or update on public.event_series
  for each row execute function public.on_series_changed();

-- Subscribe → join all future dates; unsubscribe → leave future dates.
create or replace function public.on_subscriber_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.event_participants(event_id, user_id, joined_at)
    select e.id, new.user_id, now()
    from public.events e
    where e.series_id = new.series_id and e.starts_at > now() and not e.cancelled
    on conflict do nothing;
    return new;
  else
    delete from public.event_participants p
    using public.events e
    where p.event_id = e.id and e.series_id = old.series_id and e.starts_at > now()
      and p.user_id = old.user_id and p.guest_name = '';
    return old;
  end if;
end $$;

drop trigger if exists subscriber_changed on public.series_subscribers;
create trigger subscriber_changed
  after insert or delete on public.series_subscribers
  for each row execute function public.on_subscriber_changed();

-- ---------------------------------------------------------------------
-- Event history: an append-only record of sign-ups and of what organizers
-- created, edited, cancelled or deleted. Written only by the triggers
-- below; nobody (the owner included) can edit or delete a row. It has no
-- foreign keys, so the record stays when the event or organization goes.
-- ---------------------------------------------------------------------
create table if not exists public.event_log (
  id          bigint generated always as identity primary key,
  org_id      bigint not null,
  series_id   bigint not null,
  event_id    bigint,                        -- null = the whole event / series
  starts_at   timestamptz,                   -- the date it concerns, if any
  title       text not null default '',      -- event title at the time
  action      text not null,                 -- created | edited | deleted | cancelled | restored
                                             -- | date_deleted | joined | left | removed
  actor_id    uuid,                          -- null = done by the system (nightly job)
  actor_name  text not null default '',
  target_id   uuid,                          -- the participant, for joined / left / removed
  target_name text not null default '',
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists event_log_org_idx on public.event_log(org_id, created_at desc);
create index if not exists event_log_series_idx on public.event_log(series_id, created_at);

create or replace function public.event_log_readonly() returns trigger
language plpgsql as $$
begin
  raise exception 'Event history cannot be changed or deleted';
end $$;

drop trigger if exists event_log_no_change on public.event_log;
create trigger event_log_no_change
  before update or delete on public.event_log
  for each row execute function public.event_log_readonly();
drop trigger if exists event_log_no_truncate on public.event_log;
create trigger event_log_no_truncate
  before truncate on public.event_log
  for each statement execute function public.event_log_readonly();

create or replace function public.write_event_log(
  p_org bigint, p_series bigint, p_event bigint, p_starts timestamptz, p_title text, p_action text,
  p_target uuid default null, p_details jsonb default '{}'
) returns void
language sql security definer set search_path = public as $$
  insert into public.event_log(org_id, series_id, event_id, starts_at, title, action,
                               actor_id, actor_name, target_id, target_name, details)
  values (p_org, p_series, p_event, p_starts, coalesce(p_title, ''), p_action,
          auth.uid(), coalesce((select display_name from public.profiles where id = auth.uid()), ''),
          p_target, coalesce((select display_name from public.profiles where id = p_target), ''),
          coalesce(p_details, '{}'));
$$;

create or replace function public.log_series() returns trigger
language plpgsql security definer set search_path = public as $$
declare ch jsonb := '{}';
begin
  if tg_op = 'INSERT' then
    perform public.write_event_log(new.org_id, new.id, null, null, new.title, 'created', null,
      jsonb_build_object('start_date', new.start_date, 'start_time', to_char(new.start_time, 'HH24:MI'),
                         'duration_minutes', new.duration_minutes, 'freq', new.freq, 'capacity', new.capacity));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.title       is distinct from old.title       then ch := ch || jsonb_build_object('title',       jsonb_build_array(old.title, new.title)); end if;
    if new.description is distinct from old.description then ch := ch || jsonb_build_object('description', jsonb_build_array(old.description, new.description)); end if;
    if new.capacity    is distinct from old.capacity    then ch := ch || jsonb_build_object('capacity',    jsonb_build_array(old.capacity, new.capacity)); end if;
    if new.until_date  is distinct from old.until_date  then ch := ch || jsonb_build_object('until_date',  jsonb_build_array(old.until_date, new.until_date)); end if;
    if new.active      is distinct from old.active      then ch := ch || jsonb_build_object('active',      jsonb_build_array(old.active, new.active)); end if;
    if ch <> '{}' then
      perform public.write_event_log(new.org_id, new.id, null, null, new.title, 'edited', null, ch);
    end if;
    return new;
  else
    -- skip when the whole organization is being deleted
    if exists (select 1 from public.organizations where id = old.org_id) then
      perform public.write_event_log(old.org_id, old.id, null, null, old.title, 'deleted', null,
        case when exists (select 1 from public.places where id = old.place_id) then '{}'::jsonb
             else '{"place_deleted": true}'::jsonb end);
    end if;
    return old;
  end if;
end $$;

-- Named so it fires before series_changed (triggers run in name order),
-- so "created" comes before the auto-joins of the first dates.
drop trigger if exists series_audit on public.event_series;
create trigger series_audit
  after insert or update or delete on public.event_series
  for each row execute function public.log_series();

-- Cancelling/restoring one date, or deleting one date directly.
-- Dates removed because the series was edited or deleted are covered by that entry.
create or replace function public.log_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.cancelled is distinct from old.cancelled then
      perform public.write_event_log(new.org_id, new.series_id, new.id, new.starts_at, new.title,
        case when new.cancelled then 'cancelled' else 'restored' end);
    end if;
    return new;
  end if;
  if pg_trigger_depth() = 1 then
    perform public.write_event_log(old.org_id, old.series_id, old.id, old.starts_at, old.title, 'date_deleted');
  end if;
  return old;
end $$;

drop trigger if exists event_logged on public.events;
create trigger event_logged
  after update or delete on public.events
  for each row execute function public.log_event();

-- Sign-ups: join, leave, or removed by the organizer / owner.
create or replace function public.log_participant() returns trigger
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  if tg_op = 'INSERT' then
    select * into e from public.events where id = new.event_id;
    perform public.write_event_log(e.org_id, e.series_id, e.id, e.starts_at, e.title, 'joined', new.user_id,
      jsonb_build_object('guest_name', new.guest_name, 'joined_at', new.joined_at));
    return new;
  end if;
  select * into e from public.events where id = old.event_id;
  if e.id is null then return old; end if;   -- the date itself was deleted
  perform public.write_event_log(e.org_id, e.series_id, e.id, e.starts_at, e.title,
    case when auth.uid() = old.user_id then 'left' else 'removed' end, old.user_id,
    jsonb_build_object('guest_name', old.guest_name, 'joined_at', old.joined_at));
  return old;
end $$;

drop trigger if exists participant_logged on public.event_participants;
create trigger participant_logged
  after insert or delete on public.event_participants
  for each row execute function public.log_participant();

revoke execute on function public.write_event_log(bigint, bigint, bigint, timestamptz, text, text, uuid, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.organizations      enable row level security;
alter table public.org_members        enable row level security;
alter table public.categories         enable row level security;
alter table public.places             enable row level security;
alter table public.event_series       enable row level security;
alter table public.events             enable row level security;
alter table public.event_participants enable row level security;
alter table public.series_subscribers enable row level security;
alter table public.event_log          enable row level security;
alter table public.org_bans           enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','organizations','org_members','categories','places','event_series',
                        'events','event_participants','series_subscribers','event_log','org_bans')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles: yourself and people in your organizations
create policy pr_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));
create policy pr_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy pr_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- organizations: created/joined via RPC; owner renames or deletes
create policy org_select on public.organizations for select to authenticated using (public.is_org_member(id));
create policy org_update on public.organizations for update to authenticated
  using (public.is_org_owner(id)) with check (public.is_org_owner(id));
create policy org_delete on public.organizations for delete to authenticated using (public.is_org_owner(id));

-- org_members: see co-members; leave yourself; owner removes others
create policy om_select on public.org_members for select to authenticated using (public.is_org_member(org_id));
create policy om_delete on public.org_members for delete to authenticated
  using (user_id = auth.uid() or public.is_org_owner(org_id));

-- bans: only the owner sees the list; changed through ban_member / unban_member
create policy ob_select on public.org_bans for select to authenticated using (public.is_org_owner(org_id));

-- categories: members read, only the owner adds, renames or deletes
create policy cat_select on public.categories for select to authenticated using (public.is_org_member(org_id));
create policy cat_insert on public.categories for insert to authenticated with check (public.is_org_owner(org_id));
create policy cat_update on public.categories for update to authenticated
  using (public.is_org_owner(org_id)) with check (public.is_org_owner(org_id));
create policy cat_delete on public.categories for delete to authenticated using (public.is_org_owner(org_id));

-- places: members read and add (daily limit in check_place); the person who added
-- a place, or the owner, edits or deletes it
create policy pl_select on public.places for select to authenticated using (public.is_org_member(org_id));
create policy pl_insert on public.places for insert to authenticated with check (public.is_org_member(org_id));
create policy pl_update on public.places for update to authenticated
  using (created_by = auth.uid() or public.is_org_owner(org_id)) with check (public.is_org_member(org_id));
create policy pl_delete on public.places for delete to authenticated
  using (created_by = auth.uid() or public.is_org_owner(org_id));

-- event_series: members read, creator edits (and only the creator: not even the owner)
create policy es_select on public.event_series for select to authenticated using (public.is_org_member(org_id));
create policy es_insert on public.event_series for insert to authenticated
  with check (public.can_create_in(org_id) and created_by = auth.uid() and not public.is_guest());
create policy es_update on public.event_series for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid() and public.is_org_member(org_id));
create policy es_delete on public.event_series for delete to authenticated using (created_by = auth.uid());

-- events: generated by the server; creator can cancel/restore or delete a date
create policy ev_select on public.events for select to authenticated using (public.is_org_member(org_id));
create policy ev_update on public.events for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy ev_delete on public.events for delete to authenticated using (created_by = auth.uid());

-- participants: join/leave yourself (and your guests); organizer or owner may remove anyone
create policy ep_select on public.event_participants for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and public.is_org_member(e.org_id)));
create policy ep_insert on public.event_participants for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.events e where e.id = event_id and public.can_join_in(e.org_id)));
create policy ep_delete on public.event_participants for delete to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.events e where e.id = event_id
                    and (e.created_by = auth.uid() or public.is_org_owner(e.org_id))));

-- subscribers
create policy ss_select on public.series_subscribers for select to authenticated
  using (exists (select 1 from public.event_series s where s.id = series_id and public.is_org_member(s.org_id)));
create policy ss_insert on public.series_subscribers for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.event_series s where s.id = series_id and public.can_join_in(s.org_id)));
create policy ss_delete on public.series_subscribers for delete to authenticated using (user_id = auth.uid());

-- event history: members read; no insert/update/delete policy, and no table rights either
create policy el_select on public.event_log for select to authenticated using (public.is_org_member(org_id));
revoke insert, update, delete, truncate on public.event_log from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Guest accounts are deleted guest_days() after joining their first group
-- (or after signing in, if they never joined one). Their sign-ups are
-- removed first so the event history still shows their name.
-- ---------------------------------------------------------------------
create or replace function public.delete_expired_guests() returns int
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(u.id), '{}') into ids
  from auth.users u
  where u.is_anonymous
    and coalesce((select min(m.joined_at) from public.org_members m where m.user_id = u.id), u.created_at)
        < now() - make_interval(days => public.guest_days());
  if cardinality(ids) = 0 then return 0; end if;
  delete from public.event_participants where user_id = any(ids);
  delete from auth.users where id = any(ids);
  return cardinality(ids);
end $$;

revoke execute on function public.delete_expired_guests() from public, anon, authenticated;

select cron.schedule(
  'sharemap-delete-guests',
  '15 * * * *',
  $$select public.delete_expired_guests();$$
);

-- ---------------------------------------------------------------------
-- Cron: every day at 03:00 JST (18:00 UTC) extend repeating events.
-- ---------------------------------------------------------------------
select cron.schedule(
  'sharemap-generate-events',
  '0 18 * * *',
  $$select public.generate_series_events();$$
);
