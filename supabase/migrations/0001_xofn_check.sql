-- XofN Check: cache hasil pembacaan OFT (Phase 2).
-- DB hanya CACHE. Status keamanan selalu berasal dari pembacaan chain; setiap baris membawa
-- checked_at dari pembacaan itu. Migrasi ini hanya untuk Supabase LOKAL; push ke project
-- remote/produksi butuh izin owner (CLAUDE.md §5.1).

create extension if not exists pgcrypto;

create table if not exists public.oft_checks (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('local', 'testnet', 'mainnet')),
  chain_id bigint not null,
  chain_key text not null check (chain_key in ('robinhood', 'base', 'arbitrum')),
  address text not null check (address = lower(address) and address ~ '^0x[0-9a-f]{40}$'),
  checked_at timestamptz not null,
  owner text,
  delegate text,
  overall_label text check (
    overall_label is null
    or overall_label in ('one-of-one', 'two-plus', 'two-plus-locked', 'blocked', 'unread')
  ),
  is_xofn boolean not null default false,
  verify_result jsonb,
  raw jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists oft_checks_lookup_idx
  on public.oft_checks (network, chain_key, address, checked_at desc);

create table if not exists public.oft_pathways (
  id bigint generated always as identity primary key,
  check_id uuid not null references public.oft_checks (id) on delete cascade,
  local_eid integer not null,
  remote_eid integer not null,
  direction text not null check (direction in ('send', 'receive')),
  library text,
  uses_default_lib boolean,
  confirmations text,
  required_dvns text[] not null default '{}',
  optional_dvns text[] not null default '{}',
  optional_threshold integer,
  app_config jsonb,
  label text not null check (label in ('one-of-one', 'two-plus', 'blocked', 'unread')),
  status text not null check (status in ('ok', 'unread'))
);

create index if not exists oft_pathways_check_idx on public.oft_pathways (check_id);

-- Label operator DVN, disinkronkan dari config/dvn-labels.json. Dikunci per (chain, alamat).
create table if not exists public.dvn_labels (
  network text not null check (network in ('testnet', 'mainnet')),
  chain_key text not null check (chain_key in ('robinhood', 'base', 'arbitrum')),
  address text not null check (address = lower(address)),
  operator_id text not null,
  operator text not null,
  deprecated boolean not null default false,
  source_url text not null,
  verified_at timestamptz not null,
  primary key (network, chain_key, address)
);

-- RLS: anon hanya boleh membaca. Tidak ada policy insert/update/delete, sehingga hanya
-- service role (yang melewati RLS) yang bisa menulis.
alter table public.oft_checks enable row level security;
alter table public.oft_pathways enable row level security;
alter table public.dvn_labels enable row level security;

drop policy if exists oft_checks_read on public.oft_checks;
create policy oft_checks_read on public.oft_checks for select to anon, authenticated using (true);

drop policy if exists oft_pathways_read on public.oft_pathways;
create policy oft_pathways_read on public.oft_pathways for select to anon, authenticated using (true);

drop policy if exists dvn_labels_read on public.dvn_labels;
create policy dvn_labels_read on public.dvn_labels for select to anon, authenticated using (true);
