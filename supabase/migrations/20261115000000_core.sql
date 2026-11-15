-- DCCW Golf — core schema (Milestone 1)
-- Members, trips, participation, manual payments, pairings/tee times, audit log.
-- Authorization is enforced here with Row Level Security; the app never trusts
-- a role sent from the browser.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('admin', 'member');
create type public.trip_status as enum ('planning', 'open', 'closed', 'in_progress', 'completed', 'cancelled');
create type public.participant_status as enum ('invited', 'committed', 'withdrawn');
create type public.payment_method as enum ('venmo', 'zelle', 'cash', 'other');
create type public.claim_status as enum ('pending', 'accepted', 'rejected');

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  first_name    text not null default '' check (char_length(first_name) <= 60),
  last_name     text not null default '' check (char_length(last_name) <= 60),
  phone         text check (char_length(phone) <= 30),
  hometown      text check (char_length(hometown) <= 100),
  handicap      numeric(4, 1) check (handicap between -10 and 54),
  photo_path    text check (char_length(photo_path) <= 300),
  email_updates boolean not null default true,
  role          public.member_role not null default 'member',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- New auth user -> profile row. Names come from invite metadata when present.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'first_name', ''), 60),
    left(coalesce(new.raw_user_meta_data ->> 'last_name', ''), 60)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync if a user changes their auth email.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- Belt and braces: nobody but an admin (or the service role / SQL editor,
-- where auth.uid() is null) may change a role.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and (select auth.uid()) is not null
     and not public.is_admin() then
    raise exception 'Not allowed to change roles' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- Trips
-- ---------------------------------------------------------------------------
create table public.trips (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name                text not null check (char_length(name) between 2 and 100),
  year                int  not null check (year between 2000 and 2100),
  destination         text not null check (char_length(destination) between 2 and 100),
  timezone            text not null default 'America/Los_Angeles',
  starts_at           timestamptz,
  ends_at             timestamptz,
  status              public.trip_status not null default 'planning',
  max_participants    int check (max_participants > 0),
  trip_fee_cents      int check (trip_fee_cents >= 0),
  payment_due_date    date,
  venmo_handle        text check (char_length(venmo_handle) <= 60),
  zelle_info          text check (char_length(zelle_info) <= 120),
  payment_policy      text not null default
    'Your payment is non-refundable except in the case of a serious life event, at the organizer''s discretion. The organizer books tee times and lodging based on paid commitments.',
  description         text check (char_length(description) <= 5000),
  pairings_publish_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

-- ---------------------------------------------------------------------------
-- Trip participants
-- "committed" = said I'm in + agreed to the payment policy.
-- "confirmed" is NOT stored: it is derived (committed AND paid in full).
-- ---------------------------------------------------------------------------
create table public.trip_participants (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  status           public.participant_status not null default 'invited',
  amount_due_cents int check (amount_due_cents >= 0), -- null = use trip fee
  agreed_policy_at timestamptz,
  committed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (trip_id, profile_id),
  check (status <> 'committed' or agreed_policy_at is not null)
);
create index trip_participants_profile_idx on public.trip_participants (profile_id);

-- ---------------------------------------------------------------------------
-- Payments (manual Venmo/Zelle tracking)
-- Claims: a member says "I sent it". Payments: what the admin verified.
-- Payments are append-only; corrections/refunds are negative entries.
-- ---------------------------------------------------------------------------
create table public.payment_claims (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.trip_participants (id) on delete cascade,
  amount_cents   int not null check (amount_cents > 0 and amount_cents <= 10000000),
  method         public.payment_method not null,
  note           text check (char_length(note) <= 300),
  status         public.claim_status not null default 'pending',
  reviewed_by    uuid references public.profiles (id),
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);
-- One open claim per person at a time (stops accidental double submits).
create unique index payment_claims_one_pending
  on public.payment_claims (participant_id) where status = 'pending';

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.trip_participants (id) on delete restrict,
  amount_cents   int not null check (amount_cents <> 0 and abs(amount_cents) <= 10000000),
  method         public.payment_method not null,
  received_on    date not null default current_date,
  note           text check (char_length(note) <= 300),
  claim_id       uuid unique references public.payment_claims (id),
  recorded_by    uuid references public.profiles (id),
  created_at     timestamptz not null default now()
);
create index payments_participant_idx on public.payments (participant_id);

create or replace function public.forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Payments are append-only; record a correcting entry instead' using errcode = '42501';
end;
$$;
create trigger payments_append_only
  before update or delete on public.payments
  for each row execute function public.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Rounds, foursomes (pairings) and tee times
-- ---------------------------------------------------------------------------
create table public.rounds (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  course_name text check (char_length(course_name) <= 120),
  play_date   date,
  notes       text check (char_length(notes) <= 1000),
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index rounds_trip_idx on public.rounds (trip_id);

create table public.foursomes (
  id        uuid primary key default gen_random_uuid(),
  round_id  uuid not null references public.rounds (id) on delete cascade,
  label     text check (char_length(label) <= 60),
  tee_time  timestamptz,
  sort      int not null default 0,
  unique (id, round_id)
);
create index foursomes_round_idx on public.foursomes (round_id);

create table public.foursome_members (
  foursome_id    uuid not null,
  round_id       uuid not null,
  participant_id uuid not null references public.trip_participants (id) on delete cascade,
  is_captain     boolean not null default false,
  primary key (foursome_id, participant_id),
  foreign key (foursome_id, round_id) references public.foursomes (id, round_id) on delete cascade,
  unique (round_id, participant_id) -- one group per person per round
);
create unique index foursome_one_captain
  on public.foursome_members (foursome_id) where is_captain;

create or replace function public.check_foursome_member()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
  if not exists (
    select 1
    from public.rounds r
    join public.trip_participants tp on tp.trip_id = r.trip_id
    where r.id = new.round_id and tp.id = new.participant_id
  ) then
    raise exception 'Player is not on this trip';
  end if;

  select count(*) into v_count
  from public.foursome_members
  where foursome_id = new.foursome_id and participant_id <> new.participant_id;
  if v_count >= 4 then
    raise exception 'A group can have at most 4 players';
  end if;
  return new;
end;
$$;
create trigger foursome_members_check
  before insert or update on public.foursome_members
  for each row execute function public.check_foursome_member();

create or replace function public.pairings_visible(p_trip_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.trips
    where id = p_trip_id
      and pairings_publish_at is not null
      and pairings_publish_at <= now()
  );
$$;

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  details    jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

create or replace function public.audit_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    jsonb_build_object(
      'old', case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
      'new', case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
    )
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_trip_participants after insert or update or delete on public.trip_participants
  for each row execute function public.audit_row();
create trigger audit_payments after insert on public.payments
  for each row execute function public.audit_row();
create trigger audit_payment_claims after insert or update on public.payment_claims
  for each row execute function public.audit_row();
create trigger audit_trips after insert or update or delete on public.trips
  for each row execute function public.audit_row();
create trigger audit_profiles_role after update of role on public.profiles
  for each row execute function public.audit_row();

-- updated_at helpers
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger trips_touch before update on public.trips
  for each row execute function public.touch_updated_at();
create trigger trip_participants_touch before update on public.trip_participants
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Money helpers (integer cents only)
-- ---------------------------------------------------------------------------
create or replace function public.participant_paid_cents(p_participant_id uuid)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(amount_cents), 0)::bigint
  from public.payments where participant_id = p_participant_id;
$$;

create or replace function public.participant_due_cents(p_participant_id uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce(tp.amount_due_cents, t.trip_fee_cents)
  from public.trip_participants tp
  join public.trips t on t.id = tp.trip_id
  where tp.id = p_participant_id;
$$;

-- Display status shown to everyone: invited / committed / confirmed / withdrawn.
create or replace function public.participant_display_status(p_participant_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when tp.status = 'withdrawn' then 'withdrawn'
    when tp.status = 'invited' then 'invited'
    when public.participant_due_cents(tp.id) is not null
         and public.participant_paid_cents(tp.id) >= public.participant_due_cents(tp.id)
      then 'confirmed'
    else 'committed'
  end
  from public.trip_participants tp
  where tp.id = p_participant_id;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Roster for any signed-in member. Deliberately excludes money.
create or replace function public.get_trip_roster(p_trip_id uuid)
returns table (
  participant_id uuid,
  profile_id     uuid,
  first_name     text,
  last_name      text,
  photo_path     text,
  hometown       text,
  status         text
)
language sql stable security definer set search_path = ''
as $$
  select tp.id, p.id, p.first_name, p.last_name, p.photo_path, p.hometown,
         public.participant_display_status(tp.id)
  from public.trip_participants tp
  join public.profiles p on p.id = tp.profile_id
  where tp.trip_id = p_trip_id
    and tp.status <> 'withdrawn'
    and (select auth.uid()) is not null
  order by p.last_name, p.first_name;
$$;

-- Admin-only money view.
create or replace function public.get_trip_ledger(p_trip_id uuid)
returns table (
  participant_id      uuid,
  profile_id          uuid,
  first_name          text,
  last_name           text,
  email               text,
  status              text,
  due_cents           int,
  paid_cents          bigint,
  pending_claim_id    uuid,
  pending_claim_cents int,
  pending_claim_method public.payment_method,
  pending_claim_note  text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
    select tp.id, p.id, p.first_name, p.last_name, p.email,
           public.participant_display_status(tp.id),
           public.participant_due_cents(tp.id),
           public.participant_paid_cents(tp.id),
           c.id, c.amount_cents, c.method, c.note
    from public.trip_participants tp
    join public.profiles p on p.id = tp.profile_id
    left join public.payment_claims c on c.participant_id = tp.id and c.status = 'pending'
    where tp.trip_id = p_trip_id
    order by p.last_name, p.first_name;
end;
$$;

-- Member says "I'm in". Capacity is checked under a row lock so two people
-- can't grab the last spot at the same time.
create or replace function public.join_trip(p_trip_id uuid, p_agree_policy boolean)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_trip  public.trips;
  v_count int;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not coalesce(p_agree_policy, false) then
    raise exception 'You must agree to the payment policy';
  end if;

  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'Trip not found';
  end if;
  if v_trip.status <> 'open' then
    raise exception 'Sign-ups are not open for this trip';
  end if;

  if v_trip.max_participants is not null then
    select count(*) into v_count
    from public.trip_participants
    where trip_id = p_trip_id and status = 'committed' and profile_id <> v_uid;
    if v_count >= v_trip.max_participants then
      raise exception 'This trip is full — contact the organizer';
    end if;
  end if;

  insert into public.trip_participants (trip_id, profile_id, status, agreed_policy_at, committed_at)
  values (p_trip_id, v_uid, 'committed', now(), now())
  on conflict (trip_id, profile_id) do update
    set status = 'committed',
        agreed_policy_at = coalesce(public.trip_participants.agreed_policy_at, now()),
        committed_at = coalesce(public.trip_participants.committed_at, now())
  returning id into v_id;

  return v_id;
end;
$$;

-- Admin records a payment received (negative = refund/correction).
create or replace function public.record_payment(
  p_participant_id uuid,
  p_amount_cents   int,
  p_method         public.payment_method,
  p_received_on    date,
  p_note           text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  insert into public.payments (participant_id, amount_cents, method, received_on, note, recorded_by)
  values (p_participant_id, p_amount_cents, p_method, coalesce(p_received_on, current_date), p_note, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- Admin accepts or rejects a member's "I sent it" claim, atomically.
create or replace function public.review_claim(p_claim_id uuid, p_accept boolean, p_amount_cents int default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim public.payment_claims;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select * into v_claim from public.payment_claims where id = p_claim_id for update;
  if not found or v_claim.status <> 'pending' then
    raise exception 'Claim is not pending';
  end if;

  update public.payment_claims
     set status = case when p_accept then 'accepted'::public.claim_status else 'rejected'::public.claim_status end,
         reviewed_by = (select auth.uid()),
         reviewed_at = now()
   where id = p_claim_id;

  if p_accept then
    insert into public.payments (participant_id, amount_cents, method, note, claim_id, recorded_by)
    values (v_claim.participant_id, coalesce(p_amount_cents, v_claim.amount_cents), v_claim.method,
            v_claim.note, v_claim.id, (select auth.uid()));
  end if;
end;
$$;

-- Own profile including private fields.
create or replace function public.get_my_profile()
returns public.profiles
language sql stable security definer set search_path = ''
as $$
  select * from public.profiles where id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security & privileges
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.trips             enable row level security;
alter table public.trip_participants enable row level security;
alter table public.payment_claims    enable row level security;
alter table public.payments          enable row level security;
alter table public.rounds            enable row level security;
alter table public.foursomes         enable row level security;
alter table public.foursome_members  enable row level security;
alter table public.audit_log         enable row level security;

-- Nothing is visible to signed-out visitors.
revoke all on all tables in schema public from anon;
-- Supabase grants EXECUTE on new functions to signed-in users by default.
-- Revoke everything, then grant back only the RPCs meant to be called
-- (helpers like participant_paid_cents would otherwise leak payment amounts).
revoke execute on all functions in schema public from anon, authenticated, public;

-- profiles: everyone signed in sees the public card; email/phone stay private
-- (read your own via get_my_profile, admins via the server).
revoke all on public.profiles from authenticated;
grant select (id, first_name, last_name, hometown, handicap, photo_path, role, created_at)
  on public.profiles to authenticated;
grant update (first_name, last_name, phone, hometown, handicap, photo_path, email_updates)
  on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- trips: all members can read; only admins write.
create policy trips_select on public.trips for select to authenticated using (true);
create policy trips_admin_write on public.trips for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- participants: you see your own row; admins see and manage all.
-- Members join only through join_trip().
create policy tp_select_own on public.trip_participants for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_admin());
create policy tp_admin_write on public.trip_participants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- claims: members create/see their own; admins review through review_claim().
revoke all on public.payment_claims from authenticated;
grant select on public.payment_claims to authenticated;
grant insert (participant_id, amount_cents, method, note) on public.payment_claims to authenticated;
create policy claims_select on public.payment_claims for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.trip_participants tp
               where tp.id = participant_id and tp.profile_id = (select auth.uid()))
  );
create policy claims_insert_own on public.payment_claims for insert to authenticated
  with check (
    exists (select 1 from public.trip_participants tp
            where tp.id = participant_id
              and tp.profile_id = (select auth.uid())
              and tp.status = 'committed')
  );

-- payments: read your own; admins read all; writes only via record_payment/review_claim.
revoke all on public.payments from authenticated;
grant select on public.payments to authenticated;
create policy payments_select on public.payments for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.trip_participants tp
               where tp.id = participant_id and tp.profile_id = (select auth.uid()))
  );

-- pairings: hidden from members until the trip's publish time.
create policy rounds_select on public.rounds for select to authenticated
  using (public.pairings_visible(trip_id));
create policy rounds_admin_write on public.rounds for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy foursomes_select on public.foursomes for select to authenticated
  using (exists (select 1 from public.rounds r where r.id = round_id and public.pairings_visible(r.trip_id)));
create policy foursomes_admin_write on public.foursomes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy fm_select on public.foursome_members for select to authenticated
  using (exists (select 1 from public.rounds r where r.id = round_id and public.pairings_visible(r.trip_id)));
create policy fm_admin_write on public.foursome_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- audit log: admins read only; rows are written by triggers.
revoke all on public.audit_log from authenticated;
grant select on public.audit_log to authenticated;
create policy audit_select on public.audit_log for select to authenticated using (public.is_admin());

-- RPCs callable by signed-in users (each checks permissions internally).
grant execute on function
  public.is_admin(),
  public.pairings_visible(uuid),
  public.get_trip_roster(uuid),
  public.get_trip_ledger(uuid),
  public.join_trip(uuid, boolean),
  public.record_payment(uuid, int, public.payment_method, date, text),
  public.review_claim(uuid, boolean, int),
  public.get_my_profile()
to authenticated;
