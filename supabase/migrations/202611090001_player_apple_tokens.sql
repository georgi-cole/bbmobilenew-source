-- Encrypted Apple credentials used solely to revoke Sign in with Apple on account deletion.
create table public.player_apple_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_token text not null
);

alter table public.player_apple_tokens enable row level security;
revoke all on table public.player_apple_tokens from public, anon, authenticated, service_role;
grant select, insert, update on table public.player_apple_tokens to service_role;
