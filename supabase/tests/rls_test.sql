-- Authorization tests run against the real migration with several simulated users.
-- Run with: npm run test:db   (see scripts/test-db.sh)
\set ON_ERROR_STOP on
\set QUIET on

-- Helpers ---------------------------------------------------------------
create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  if p_uid is null then
    execute 'set local role anon';
  else
    execute 'set local role authenticated';
  end if;
end $$;

create or replace function pg_temp.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'PASS  % (blocked: %)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL  % — statement was allowed: %', p_label, p_sql;
end $$;

create or replace function pg_temp.expect_eq(p_actual bigint, p_expected bigint, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL  % — expected %, got %', p_label, p_expected, p_actual;
  end if;
  raise notice 'PASS  %', p_label;
end $$;

-- Fixtures (fake test users; never used outside this test) ---------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local',  '{"first_name":"Ada","last_name":"Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.local',    '{"first_name":"Bob","last_name":"B"}'),
  ('00000000-0000-0000-0000-00000000000c', 'cal@test.local',    '{"first_name":"Cal","last_name":"C"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dee@test.local',    '{"first_name":"Dee","last_name":"D"}'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@test.local',    '{"first_name":"Eve","last_name":"E"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

insert into public.trips (id, slug, name, year, destination, status, max_participants, trip_fee_cents)
values ('10000000-0000-0000-0000-000000000001', 'test-trip', 'Test Trip', 2027, 'Testville', 'open', 3, 50000);

-- 1. Profile trigger
select pg_temp.expect_eq((select count(*) from public.profiles), 5, 'profile auto-created for each auth user');

-- 2. Signed-out visitors see nothing
begin;
select pg_temp.as_user(null);
select pg_temp.expect_error('select * from public.trips', 'anon cannot read trips');
select pg_temp.expect_error('select * from public.profiles', 'anon cannot read profiles');
select pg_temp.expect_error($$select public.get_trip_roster('10000000-0000-0000-0000-000000000001')$$, 'anon cannot read roster');
select pg_temp.expect_eq((select count(*) from (select public.keepalive()) k), 1, 'anon can call keepalive (no data)');
rollback;

-- 3. Member privacy & role escalation
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error('select email from public.profiles', 'member cannot read other emails');
select pg_temp.expect_error('select phone from public.profiles', 'member cannot read phone numbers');
select pg_temp.expect_error($$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b'$$, 'member cannot make self admin');
select pg_temp.expect_eq((select count(*) from public.get_my_profile() where email = 'bob@test.local'), 1, 'member reads own private profile');
update public.profiles set hometown = 'Irvine, CA' where id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_eq((select count(*) from public.profiles where hometown = 'Irvine, CA'), 0, 'member cannot edit another profile');
update public.trips set name = 'Hacked';
select pg_temp.expect_eq((select count(*) from public.trips where name = 'Hacked'), 0, 'member cannot edit trips');
rollback;

-- 4. Joining a trip (committed) + capacity
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.join_trip('10000000-0000-0000-0000-000000000001', false)$$, 'join requires policy agreement');
select public.join_trip('10000000-0000-0000-0000-000000000001', true);
select pg_temp.expect_error($$insert into public.trip_participants (trip_id, profile_id, status, agreed_policy_at) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000e','committed',now())$$, 'member cannot add others directly');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.join_trip('10000000-0000-0000-0000-000000000001', true);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.join_trip('10000000-0000-0000-0000-000000000001', true);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$select public.join_trip('10000000-0000-0000-0000-000000000001', true)$$, 'capacity enforced (trip full)');
commit;

begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_eq((select count(*) from public.trip_participants), 1, 'member sees only own participant row');
select pg_temp.expect_eq((select count(*) from public.get_trip_roster('10000000-0000-0000-0000-000000000001')), 3, 'member sees full roster');
select pg_temp.expect_eq((select count(*) from public.get_trip_roster('10000000-0000-0000-0000-000000000001') where status = 'committed'), 3, 'roster shows committed status');
select pg_temp.expect_error($$select * from public.get_trip_ledger('10000000-0000-0000-0000-000000000001')$$, 'member cannot see who paid');
select pg_temp.expect_error(format('select public.participant_paid_cents(%L)', (select participant_id from public.get_trip_roster('10000000-0000-0000-0000-000000000001') where first_name = 'Cal')), 'member cannot call payment helper functions');
rollback;

-- 5. Payments
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.payment_claims (participant_id, amount_cents, method)
  select id, 50000, 'venmo' from public.trip_participants where profile_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_error($$insert into public.payment_claims (participant_id, amount_cents, method) select id, 50000, 'venmo' from public.trip_participants where profile_id = '00000000-0000-0000-0000-00000000000b'$$, 'duplicate pending claim blocked');
commit;

select id as cal_tp from public.trip_participants where profile_id = '00000000-0000-0000-0000-00000000000c' \gset
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error(format('insert into public.payment_claims (participant_id, amount_cents, method) values (%L, 100, ''venmo'')', :'cal_tp'), 'cannot claim for someone else');
select pg_temp.expect_error($$insert into public.payments (participant_id, amount_cents, method) select id, 50000, 'venmo' from public.trip_participants where profile_id = '00000000-0000-0000-0000-00000000000b'$$, 'member cannot record own payment');
select pg_temp.expect_error($$select public.record_payment((select id from public.trip_participants limit 1), 50000, 'venmo', null, null)$$, 'member cannot call record_payment');
select pg_temp.expect_error($$update public.payment_claims set status = 'accepted'$$, 'member cannot approve own claim');
rollback;

begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_eq((select count(*) from public.get_trip_ledger('10000000-0000-0000-0000-000000000001') where pending_claim_id is not null), 1, 'admin sees pending claim');
select public.review_claim((select id from public.payment_claims where status = 'pending'), true);
select pg_temp.expect_eq((select paid_cents from public.get_trip_ledger('10000000-0000-0000-0000-000000000001') where first_name = 'Bob'), 50000, 'accepted claim becomes verified payment');
select public.record_payment((select tp.id from public.trip_participants tp where tp.profile_id = '00000000-0000-0000-0000-00000000000c'), 20000, 'zelle', null, 'deposit');
select pg_temp.expect_error($$update public.payments set amount_cents = 1$$, 'payments are append-only (even for admin)');
select pg_temp.expect_error($$delete from public.payments$$, 'payments cannot be deleted');
commit;

begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_eq((select count(*) from public.get_trip_roster('10000000-0000-0000-0000-000000000001') where status = 'confirmed'), 1, 'paid-in-full shows as confirmed');
select pg_temp.expect_eq((select count(*) from public.get_trip_roster('10000000-0000-0000-0000-000000000001') where first_name = 'Cal' and status = 'committed'), 1, 'partial payment stays committed');
select pg_temp.expect_eq((select count(*) from public.payments), 1, 'member sees only own payments');
rollback;

-- 6. Pairings & tee times are hidden until published
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.rounds (id, trip_id, name, course_name) values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Round 1', 'Test Course');
insert into public.foursomes (id, round_id, tee_time) values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', now() + interval '30 days');
insert into public.foursome_members (foursome_id, round_id, participant_id, is_captain)
  select '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', id, profile_id = '00000000-0000-0000-0000-00000000000a'
  from public.trip_participants where trip_id = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect_error($$update public.foursome_members set is_captain = true$$, 'only one captain per group');
commit;

begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_eq((select count(*) from public.foursomes), 0, 'unpublished tee times hidden from members');
select pg_temp.expect_eq((select count(*) from public.foursome_members), 0, 'unpublished pairings hidden from members');
rollback;

update public.trips set pairings_publish_at = now() - interval '1 minute' where id = '10000000-0000-0000-0000-000000000001';

begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_eq((select count(*) from public.foursome_members), 3, 'published pairings visible to members');
delete from public.foursome_members;
select pg_temp.expect_eq((select count(*) from public.foursome_members), 3, 'member cannot change pairings');
rollback;

-- group size and trip membership
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'f1@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'f2@test.local');
update public.trips set max_participants = null where id = '10000000-0000-0000-0000-000000000001';
insert into public.trip_participants (trip_id, profile_id, status, agreed_policy_at)
  select '10000000-0000-0000-0000-000000000001', id, 'committed', now() from auth.users
  where email in ('f1@test.local', 'f2@test.local', 'dee@test.local');
insert into public.foursome_members (foursome_id, round_id, participant_id)
  select '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', tp.id
  from public.trip_participants tp join public.profiles p on p.id = tp.profile_id where p.email = 'f1@test.local';
select pg_temp.expect_error($$insert into public.foursome_members (foursome_id, round_id, participant_id) select '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', tp.id from public.trip_participants tp join public.profiles p on p.id = tp.profile_id where p.email = 'f2@test.local'$$, 'max 4 players per group');

insert into public.trips (id, slug, name, year, destination) values ('10000000-0000-0000-0000-000000000002', 'other-trip', 'Other', 2028, 'Elsewhere');
insert into public.trip_participants (id, trip_id, profile_id) values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000e');
insert into public.foursomes (id, round_id) values ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001');
select pg_temp.expect_error($$insert into public.foursome_members (foursome_id, round_id, participant_id) values ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001')$$, 'cannot pair a player from a different trip');

-- 7. Audit log
begin;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_eq((select count(*) from public.audit_log), 0, 'members cannot read audit log');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_eq((select count(*) from public.audit_log where entity = 'payments'), 2, 'admin sees payment audit trail');
rollback;

\echo 'ALL DATABASE TESTS PASSED'
