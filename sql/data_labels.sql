-- Run in Supabase SQL editor

create table if not exists data_labels (
  id                            uuid primary key default gen_random_uuid(),
  scan_id                       uuid references rankall_scans(id) on delete cascade,
  business_name                 text,
  industry                      text,
  intent_type                   text,
  location                      text,
  city                          text,
  state                         text,
  country                       text not null default 'US',
  query_type                    text check (query_type in ('informational','navigational','transactional','local')),
  business_type                 text check (business_type in ('local_service','restaurant','medical','legal','retail','ecommerce','saas','other')),
  competitor_category           text check (competitor_category in ('direct','indirect','none')),
  ai_recommendation_confidence  text check (ai_recommendation_confidence in ('high','medium','low')),
  platforms_mentioned           text[] not null default '{}',
  trust_score                   int not null default 0,
  overall_score                 int not null default 0,
  created_at                    timestamptz not null default now(),
  labeled_at                    timestamptz not null default now(),
  labeled_by                    text not null default 'auto'
);

create index if not exists data_labels_scan_id_idx    on data_labels (scan_id);
create index if not exists data_labels_industry_idx   on data_labels (industry);
create index if not exists data_labels_city_idx       on data_labels (city);
create index if not exists data_labels_created_at_idx on data_labels (created_at desc);

alter table data_labels enable row level security;
