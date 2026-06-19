create extension if not exists pgcrypto;

create table if not exists members (
  student_id text primary key,
  name text not null,
  role text not null default 'member' check (role in ('member', 'admin')),
  password text not null default '',
  created_at timestamptz not null default now()
);

alter table members add column if not exists password text not null default '';

create table if not exists bands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'active' check (status in ('active', 'dissolved')),
  created_at timestamptz not null default now()
);

create table if not exists band_members (
  band_id uuid not null references bands(id) on delete cascade,
  student_id text not null references members(student_id) on delete cascade,
  primary key (band_id, student_id)
);

create table if not exists room_days (
  date date primary key,
  is_open boolean not null default true,
  note text not null default ''
);

create table if not exists room_slots (
  date date not null,
  slot_id text not null,
  is_open boolean not null default true,
  note text not null default '',
  primary key (date, slot_id)
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  slot_id text not null,
  reservation_type text not null check (reservation_type in ('band', 'personal')),
  student_id text not null references members(student_id),
  band_id uuid references bands(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint reservation_band_required check (
    (reservation_type = 'band' and band_id is not null)
    or (reservation_type = 'personal' and band_id is null)
  )
);

create unique index if not exists reservations_one_active_per_slot
on reservations(date, slot_id)
where cancelled_at is null;

create table if not exists band_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('create', 'update_members', 'dissolve')),
  band_name text not null,
  student_id text not null references members(student_id),
  reason text not null default '',
  member_entries jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text references members(student_id)
);

alter table band_requests add column if not exists member_entries jsonb not null default '[]'::jsonb;
alter table band_requests drop constraint if exists band_requests_request_type_check;
alter table band_requests add constraint band_requests_request_type_check
check (request_type in ('create', 'update_members', 'dissolve'));

create table if not exists settings (
  id boolean primary key default true,
  personal_open_days integer not null default 3,
  monthly_band_limit integer not null default 8,
  monthly_personal_limit integer not null default 4,
  weekly_open_slots jsonb not null default '{"0":[],"1":["lunch","p3a","p3b","p4a","p4b","p5a","p5b","p6a","p6b"],"2":["p1a","p1b","p2a","p2b","p5a","p5b"],"3":["p1a","p1b","p2a","p2b","lunch","p3a","p3b","p4a","p4b","p5a","p5b"],"4":["p1a","p1b","p2a","p2b","lunch","p3a","p3b","p4a","p4b","p5a","p5b","p6a","p6b"],"5":["p1a","p1b","p2a","p2b","lunch","p3a","p3b","p4a","p4b","p5a","p5b","p6a","p6b"],"6":["p1a","p1b","p2a","p2b"]}'::jsonb,
  check (id = true)
);

alter table settings add column if not exists weekly_open_slots jsonb not null default '{"0":[],"1":["lunch","p3a","p3b","p4a","p4b","p5a","p5b","p6a","p6b"],"2":["p1a","p1b","p2a","p2b","p5a","p5b"],"3":["p1a","p1b","p2a","p2b","lunch","p3a","p3b","p4a","p4b","p5a","p5b"],"4":["p1a","p1b","p2a","p2b","lunch","p3a","p3b","p4a","p4b","p5a","p5b","p6a","p6b"],"5":["p1a","p1b","p2a","p2b","lunch","p3a","p3b","p4a","p4b","p5a","p5b","p6a","p6b"],"6":["p1a","p1b","p2a","p2b"]}'::jsonb;

insert into settings (id) values (true)
on conflict (id) do nothing;

insert into members (student_id, name, role, password) values
  ('admin001', '軽音部運営', 'admin', 'adminpass')
on conflict (student_id) do update
set name = excluded.name,
    role = excluded.role,
    password = excluded.password;

delete from band_members where student_id in ('s240001', 's240002', 's240003', 's240004', 'testadmin', 'testmember', 'admin002');
delete from reservations where student_id in ('s240001', 's240002', 's240003', 's240004', 'testadmin', 'testmember', 'admin002');
update band_requests set reviewed_by = null where reviewed_by in ('s240001', 's240002', 's240003', 's240004', 'testadmin', 'testmember', 'admin002');
delete from band_requests where student_id in ('s240001', 's240002', 's240003', 's240004', 'testadmin', 'testmember', 'admin002');
delete from members where student_id in ('s240001', 's240002', 's240003', 's240004', 'testadmin', 'testmember', 'admin002');

insert into bands (name) values
  ('放課後コード'),
  ('Blue Notes')
on conflict (name) do nothing;

alter table members enable row level security;
alter table bands enable row level security;
alter table band_members enable row level security;
alter table room_days enable row level security;
alter table room_slots enable row level security;
alter table reservations enable row level security;
alter table band_requests enable row level security;
alter table settings enable row level security;

drop policy if exists "prototype read members" on members;
create policy "prototype read members" on members for select using (true);
drop policy if exists "prototype write members" on members;
create policy "prototype write members" on members for all using (true) with check (true);

drop policy if exists "prototype read bands" on bands;
create policy "prototype read bands" on bands for select using (true);
drop policy if exists "prototype write bands" on bands;
create policy "prototype write bands" on bands for all using (true) with check (true);

drop policy if exists "prototype read band_members" on band_members;
create policy "prototype read band_members" on band_members for select using (true);
drop policy if exists "prototype write band_members" on band_members;
create policy "prototype write band_members" on band_members for all using (true) with check (true);

drop policy if exists "prototype read room_days" on room_days;
create policy "prototype read room_days" on room_days for select using (true);
drop policy if exists "prototype write room_days" on room_days;
create policy "prototype write room_days" on room_days for all using (true) with check (true);

drop policy if exists "prototype read room_slots" on room_slots;
create policy "prototype read room_slots" on room_slots for select using (true);
drop policy if exists "prototype write room_slots" on room_slots;
create policy "prototype write room_slots" on room_slots for all using (true) with check (true);

drop policy if exists "prototype read reservations" on reservations;
create policy "prototype read reservations" on reservations for select using (true);
drop policy if exists "prototype insert reservations" on reservations;
create policy "prototype insert reservations" on reservations for insert with check (true);
drop policy if exists "prototype update reservations" on reservations;
create policy "prototype update reservations" on reservations for update using (true) with check (true);

drop policy if exists "prototype read band_requests" on band_requests;
create policy "prototype read band_requests" on band_requests for select using (true);
drop policy if exists "prototype insert band_requests" on band_requests;
create policy "prototype insert band_requests" on band_requests for insert with check (true);
drop policy if exists "prototype update band_requests" on band_requests;
create policy "prototype update band_requests" on band_requests for update using (true) with check (true);

drop policy if exists "prototype read settings" on settings;
create policy "prototype read settings" on settings for select using (true);
drop policy if exists "prototype update settings" on settings;
create policy "prototype update settings" on settings for update using (true) with check (true);
