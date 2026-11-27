begin;

alter table public.player_events
  add column if not exists distribution_channel text,
  add column if not exists traffic_class text,
  add column if not exists distribution_source text,
  add column if not exists build_channel text,
  add column if not exists is_test_install boolean;

alter table public.player_events
  drop constraint if exists player_events_traffic_class_check,
  add constraint player_events_traffic_class_check
    check (traffic_class is null or traffic_class = any (array[
      'production'::text,
      'test'::text,
      'unclassified'::text
    ]));

alter table public.player_events
  drop constraint if exists player_events_distribution_channel_check,
  add constraint player_events_distribution_channel_check
    check (distribution_channel is null or distribution_channel = any (array[
      'app_store'::text,
      'testflight'::text,
      'google_play'::text,
      'sideloaded'::text,
      'qa'::text,
      'development'::text,
      'web'::text,
      'unknown'::text
    ]));

create index if not exists player_events_traffic_class_received_idx
  on public.player_events (traffic_class, received_at desc)
  where name = 'session_started';

create index if not exists player_events_distribution_channel_received_idx
  on public.player_events (distribution_channel, received_at desc)
  where name = 'session_started';

comment on column public.player_events.distribution_channel is
  'Runtime app distribution classification: App Store, TestFlight, Google Play, QA, development, web, or unknown.';
comment on column public.player_events.traffic_class is
  'Production, test, or unclassified install. Historical events remain null because their channel cannot be reconstructed.';
comment on column public.player_events.distribution_source is
  'Non-identifying source used to derive distribution metadata, such as StoreKit, Android installer, or build config.';
comment on column public.player_events.build_channel is
  'Build-time label, such as store, qa, or development; separate from runtime distribution channel.';
comment on column public.player_events.is_test_install is
  'True for confirmed test/development installs, false for confirmed production installs, null when classification is unavailable.';

comment on column public.player_events.properties is
  'Allowlisted pseudonymous event details. Install attribution stores campaign labels and click-id presence only; raw click IDs and location are not stored.';

commit;
