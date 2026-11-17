-- Phase 4: index token XofN (ARCHITECTURE §9). Database hanya CACHE/INDEX: status "Locked" di UI
-- selalu berasal dari pembacaan verify() on-chain, tidak dari kolom di sini.
--
-- BELUM PERNAH dijalankan terhadap Postgres nyata (Docker tidak tersedia di lingkungan dev).
-- Hanya untuk Supabase LOKAL sampai owner mengizinkan push ke project remote (CLAUDE.md §5.1).

create table if not exists public.tokens (
  address text primary key check (address = lower(address)),
  home_chain_id integer not null,
  name text not null,
  ticker text not null,
  image_path text,
  tier text not null check (tier in ('standard', 'fortress')),
  status text not null default 'bonding'
    check (status in ('bonding', 'graduated', 'expanding', 'locked', 'changed')),
  expansion_eids integer[] not null default '{}',
  creator text not null check (creator = lower(creator)),
  curve text not null check (curve = lower(curve)),
  -- Parameter curve tidak berubah setelah launch; disimpan sebagai teks karena uint256.
  virtual_eth text not null,
  virtual_tokens text not null,
  sale_supply text not null,
  graduation_threshold text not null,
  created_tx text,
  graduated_tx text,
  created_seq bigint generated always as identity,
  created_at timestamptz not null default now()
);

create index if not exists tokens_home_status_idx on public.tokens (home_chain_id, status);

create table if not exists public.curve_trades (
  token text references public.tokens (address) on delete cascade,
  curve text not null check (curve = lower(curve)),
  tx_hash text not null,
  log_index integer not null,
  side text not null check (side in ('buy', 'sell')),
  trader text not null check (trader = lower(trader)),
  amount_token text not null,
  amount_eth text not null,
  eth_raised text not null,
  block_number bigint not null,
  block_time timestamptz,
  primary key (tx_hash, log_index)
);

create index if not exists curve_trades_curve_idx on public.curve_trades (curve, block_number, log_index);

create table if not exists public.expansion_steps (
  token text not null references public.tokens (address) on delete cascade,
  eid integer not null,
  step text not null
    check (step in ('none', 'deploy-sent', 'configured', 'liquidity-sent', 'remote-locked')),
  status text not null check (status in ('pending', 'ok', 'failed')),
  tx_hash text,
  lz_guid text,
  updated_at timestamptz not null default now(),
  primary key (token, eid)
);

create table if not exists public.chain_cursors (
  chain_id integer not null,
  contract text not null,
  last_block bigint not null,
  updated_at timestamptz not null default now(),
  primary key (chain_id, contract)
);

-- RLS: anon hanya membaca; tulis hanya lewat service role (yang melewati RLS).
alter table public.tokens enable row level security;
alter table public.curve_trades enable row level security;
alter table public.expansion_steps enable row level security;
alter table public.chain_cursors enable row level security;

create policy "tokens anon read" on public.tokens for select to anon using (true);
create policy "curve_trades anon read" on public.curve_trades for select to anon using (true);
create policy "expansion_steps anon read" on public.expansion_steps for select to anon using (true);
