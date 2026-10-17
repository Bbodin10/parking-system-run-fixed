-- Migration 007: System Alerts & Priority Configuration
create table if not exists public.alert_configs (
  id text primary key default 'default_config',
  offline_timeout_sec int not null default 120,
  enable_offline_alert boolean not null default true,
  offline_priority text not null default 'CRITICAL',
  
  enable_barrier_fault_alert boolean not null default true,
  barrier_fault_priority text not null default 'CRITICAL',
  barrier_stuck_sec int not null default 300,
  
  enable_sensor_flapping_alert boolean not null default true,
  sensor_flapping_priority text not null default 'HIGH',
  sensor_flap_threshold int not null default 5,
  
  enable_noshow_alert boolean not null default true,
  noshow_priority text not null default 'HIGH',
  
  enable_overtime_alert boolean not null default true,
  overtime_priority text not null default 'HIGH',
  
  enable_line_admin_notify boolean not null default true,
  line_admin_min_priority text not null default 'HIGH',
  cooldown_minutes int not null default 15,
  enable_sound_alert boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.system_alerts (
  id text primary key default gen_random_uuid()::text,
  priority text not null check (priority in ('CRITICAL', 'HIGH', 'NORMAL', 'INFO')),
  source_type text not null default 'device',
  device_id text references public.devices(id) on delete set null,
  slot_id text references public.slots(id) on delete set null,
  title text not null,
  message text not null,
  status text not null default 'active' check (status in ('active', 'acknowledged', 'resolved')),
  notified_line boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists system_alerts_status_idx on public.system_alerts(status);
create index if not exists system_alerts_priority_idx on public.system_alerts(priority);
create index if not exists system_alerts_created_at_idx on public.system_alerts(created_at desc);
