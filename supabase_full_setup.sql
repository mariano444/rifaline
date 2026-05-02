create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create table if not exists public.sorteos (
  id uuid primary key default uuid_generate_v4(),
  sorteo_key text unique not null,
  premio bigint not null,
  secret_code text not null,
  total_numeros int not null default 300,
  slots_reales int not null,
  estado text not null default 'activo' check (estado in ('activo', 'sorteando', 'finalizado')),
  created_at timestamptz not null default now(),
  sorteado_at timestamptz,
  finalizado_at timestamptz
);

create table if not exists public.participantes (
  id uuid primary key default uuid_generate_v4(),
  sorteo_id uuid not null references public.sorteos(id) on delete cascade,
  nombre text not null,
  apellido text not null,
  telefono text,
  provincia text not null,
  localidad text not null,
  metodo_pago text not null,
  resena text default '',
  hora_reg text not null default to_char(now(), 'HH24:MI'),
  es_demo boolean not null default false,
  total_pagado bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.numeros_asignados (
  id uuid primary key default uuid_generate_v4(),
  sorteo_id uuid not null references public.sorteos(id) on delete cascade,
  participante_id uuid not null references public.participantes(id) on delete cascade,
  numero int not null check (numero >= 1 and numero <= 300),
  unique (sorteo_id, numero)
);

create table if not exists public.ganadores (
  id uuid primary key default uuid_generate_v4(),
  sorteo_id uuid unique not null references public.sorteos(id) on delete cascade,
  participante_id uuid not null references public.participantes(id),
  numero_ganador int not null,
  nombre text not null,
  localidad text not null,
  telefono text,
  premio bigint not null,
  confirmado boolean not null default false,
  confirmado_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  reference_id text unique not null,
  sorteo_id uuid not null references public.sorteos(id) on delete cascade,
  participant_payload jsonb not null,
  numbers int[] not null,
  amount bigint not null,
  currency text not null default 'ARS',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'failed', 'cancelled', 'refunded')),
  payment_link_id text,
  payment_link_url text,
  proof_token text,
  payment_id text,
  participant_id uuid references public.participantes(id),
  galio_response jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_sorteos_estado on public.sorteos(estado);
create index if not exists idx_participantes_sorteo on public.participantes(sorteo_id);
create index if not exists idx_numeros_sorteo on public.numeros_asignados(sorteo_id);
create index if not exists idx_ganadores_sorteo on public.ganadores(sorteo_id);
create index if not exists idx_payment_orders_reference on public.payment_orders(reference_id);
create index if not exists idx_payment_orders_status on public.payment_orders(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_payment_orders_updated_at on public.payment_orders;
create trigger trg_payment_orders_updated_at
before update on public.payment_orders
for each row execute procedure public.set_updated_at();

create or replace view public.v_sorteo_activo as
select
  s.id,
  s.sorteo_key,
  s.premio,
  s.secret_code,
  s.estado,
  s.total_numeros,
  s.slots_reales,
  s.created_at,
  count(distinct na.numero) as numeros_vendidos,
  s.total_numeros - count(distinct na.numero) as numeros_disponibles,
  round(count(distinct na.numero)::numeric / s.total_numeros * 100, 1) as pct_completado,
  count(distinct case when p.es_demo = false then p.id end) as participantes_reales
from public.sorteos s
left join public.numeros_asignados na on na.sorteo_id = s.id
left join public.participantes p on p.sorteo_id = s.id
where s.estado = 'activo'
group by s.id;

create or replace view public.v_participantes_con_numeros as
select
  p.id,
  p.sorteo_id,
  p.nombre,
  p.apellido,
  p.telefono,
  p.provincia,
  p.localidad,
  p.metodo_pago,
  p.resena,
  p.hora_reg,
  p.es_demo,
  p.total_pagado,
  p.created_at,
  array_agg(na.numero order by na.numero) as numeros
from public.participantes p
join public.numeros_asignados na on na.participante_id = p.id
group by p.id;

create or replace view public.v_historial_ganadores as
select
  g.id,
  g.sorteo_id,
  g.numero_ganador,
  g.nombre,
  g.localidad,
  g.premio,
  g.confirmado,
  g.confirmado_at,
  g.created_at,
  s.total_numeros
from public.ganadores g
join public.sorteos s on s.id = g.sorteo_id
order by g.created_at desc;

alter table public.sorteos enable row level security;
alter table public.participantes enable row level security;
alter table public.numeros_asignados enable row level security;
alter table public.ganadores enable row level security;
alter table public.payment_orders enable row level security;

drop policy if exists "sorteos_select_public" on public.sorteos;
create policy "sorteos_select_public" on public.sorteos for select using (true);

drop policy if exists "participantes_select_public" on public.participantes;
create policy "participantes_select_public" on public.participantes for select using (true);

drop policy if exists "numeros_select_public" on public.numeros_asignados;
create policy "numeros_select_public" on public.numeros_asignados for select using (true);

drop policy if exists "ganadores_select_public" on public.ganadores;
create policy "ganadores_select_public" on public.ganadores for select using (true);

drop policy if exists "payment_orders_service_only" on public.payment_orders;
create policy "payment_orders_service_only" on public.payment_orders for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

alter publication supabase_realtime add table public.sorteos;
alter publication supabase_realtime add table public.participantes;
alter publication supabase_realtime add table public.numeros_asignados;
alter publication supabase_realtime add table public.ganadores;
