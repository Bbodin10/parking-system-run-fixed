-- Migration 005: Vehicles Management & Booking Vehicle Association
create table if not exists vehicles (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references users(id) on delete cascade,
  license_plate text not null,
  vehicle_type text not null,
  brand text default '',
  model text default '',
  color text default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table bookings add column if not exists vehicle_id text references vehicles(id) on delete set null;
alter table bookings add column if not exists license_plate text;
alter table bookings add column if not exists vehicle_type text;

create index if not exists vehicles_user_idx on vehicles(user_id);
