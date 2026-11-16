-- Tiny no-data function a scheduled GitHub Action calls every few days so the
-- free Supabase project never counts as inactive (free projects pause after ~7
-- idle days). Returns only the server time; reveals nothing about members.
create or replace function public.keepalive()
returns timestamptz
language sql stable
as $$
  select now();
$$;

revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
