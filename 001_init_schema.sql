-- ============================================================================
-- Nigerian Multi-Company HR & Payroll SaaS — Initial Schema Migration
-- Source: PRD Section 5 (Database Schema) + Section 9 (Statutory Rules)
-- Target: Supabase (PostgreSQL 15+)
-- ============================================================================
-- READ THIS FIRST — two deliberate deviations from the literal PRD text:
--
-- 1. statutory_rate_tables.rate_type gets an extra value 'rent_relief'.
--    The PRD lists (paye_band|pension|nhf|nsitf|itf) but Section 8.2 also
--    requires an editable Rent Relief rule (20% of annual rent, capped at
--    ₦500,000) — without a rate_type for it, that cap would have to be
--    hardcoded, which defeats the "no cap hardcoded in application logic"
--    design goal. Flagging this so you can confirm it's the right call.
--
-- 2. statutory_rate_tables has NO company_id, matching the PRD's literal
--    column list. That means these rates are PLATFORM-WIDE, not
--    per-company — which is correct for Nigerian tax law (it's the same
--    law for every company), but it also means only the PLATFORM Super
--    Admin can edit them here, not a company Admin (see RLS policy below).
--    The PRD's user story ("As an Admin, I want to update this year's PAYE
--    tax bands") is ambiguous about which "Admin" — if you actually want
--    per-company overrides, that needs a company_id column added and the
--    engine needs to fall back to the platform default when absent. Flag
--    this back to me if company-level overrides turn out to be needed.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- SECTION A: CORE PLATFORM + COMPANY TABLES
-- ============================================================================

create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rc_number text,
  tin text,
  address text,
  logo_url text,
  default_currency text not null default 'NGN',
  payroll_policy_json jsonb not null default '{}'::jsonb,
  nhf_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_type text not null,
  employee_limit int not null,
  status text not null default 'trial' check (status in ('trial','active','suspended','cancelled')),
  started_at timestamptz not null default now(),
  renewed_at timestamptz
);

create table public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  platform_admin_user_id uuid not null references public.users(id),
  granted_by_user_id uuid not null references public.users(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null
);

create table public.user_company_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('admin','hr','finance')),
  created_at timestamptz not null default now(),
  unique (user_id, company_id, role)
);

-- ============================================================================
-- SECTION B: COMPANY CONFIGURATION TABLES
-- ============================================================================

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  step text,
  monthly_salary numeric(14,2) not null
);

create table public.salary_structure_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  component_name text not null,
  category text not null check (category in ('taxable','reimbursement')),
  percentage_of_taxable_or_gross numeric(6,3) not null,
  sort_order int not null default 0
);

create table public.employer_cost_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  component_name text not null,
  calculation_type text not null check (calculation_type in ('percentage','fixed')),
  value numeric(14,4) not null
);

create table public.pfas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text not null
);

-- ============================================================================
-- SECTION C: EMPLOYEES
-- ============================================================================

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  employee_code text not null,
  full_name text not null,
  email text,
  phone text,
  hire_date date not null,
  exit_date date,
  status text not null default 'active' check (status in ('active','inactive')),
  grade_id uuid references public.grades(id),
  salary_basis text not null check (salary_basis in ('gross','net')),
  target_salary numeric(14,2) not null,
  bank_name text,
  bank_account_no text,
  tin text,
  rsa_pin text,
  pfa_id uuid references public.pfas(id),
  nhf_number text,
  nhf_consent boolean not null default false,
  nsitf_number text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_code)
);

create index idx_employees_company_status on public.employees(company_id, status);

-- ============================================================================
-- SECTION D: PAYROLL
-- ============================================================================

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','rejected','paid')),
  prepared_by_user_id uuid references public.users(id),
  approved_by_user_id uuid references public.users(id),
  approved_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, period_month, period_year)
);

create table public.payroll_run_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  gross_salary numeric(14,2) not null,
  taxable_income numeric(14,2) not null,
  paye_tax numeric(14,2) not null,
  pension_employee numeric(14,2) not null,
  pension_employer numeric(14,2) not null,
  nhf numeric(14,2) not null default 0,
  other_deductions_json jsonb not null default '[]'::jsonb,
  other_additions_json jsonb not null default '[]'::jsonb,
  net_pay numeric(14,2) not null,
  employer_cost_total numeric(14,2) not null,
  snapshot_json jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_payroll_run_lines_run on public.payroll_run_lines(payroll_run_id);
create index idx_payroll_run_lines_employee on public.payroll_run_lines(employee_id);

create table public.md_approval_dispatches (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  sent_to_email text not null,
  sent_at timestamptz not null default now(),
  approval_token text not null unique,
  token_expires_at timestamptz not null,
  decision text not null default 'pending' check (decision in ('pending','approved','rejected')),
  decision_at timestamptz,
  decision_ip text,
  fallback_used boolean not null default false
);

-- ============================================================================
-- SECTION E: AUDIT + STATUTORY RATES
-- ============================================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade, -- null for platform-level actions
  user_id uuid references public.users(id),
  action text not null,
  module text not null,
  record_id uuid,
  previous_value_json jsonb,
  new_value_json jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_company_date on public.audit_logs(company_id, created_at desc);

create table public.statutory_rate_tables (
  id uuid primary key default gen_random_uuid(),
  rate_type text not null check (rate_type in ('paye_band','pension','nhf','nsitf','itf','rent_relief')),
  config_json jsonb not null,
  effective_from date not null,
  effective_to date,
  created_by_user_id uuid references public.users(id),
  created_at timestamptz not null default now()
);

create index idx_statutory_rates_lookup on public.statutory_rate_tables(rate_type, effective_from);

-- ============================================================================
-- SECTION F: AUTH TRIGGER — mirror auth.users into public.users on signup
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (auth_id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- ============================================================================
-- SECTION G: RLS HELPER FUNCTIONS
-- ============================================================================

create or replace function public.current_app_user_id()
returns uuid
language sql stable
as $$
  select id from public.users where auth_id = auth.uid();
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.platform_admins pa
    join public.users u on u.id = pa.user_id
    where u.auth_id = auth.uid()
  );
$$;

create or replace function public.has_company_role(p_company_id uuid, p_roles text[])
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.user_company_roles ucr
    join public.users u on u.id = ucr.user_id
    where u.auth_id = auth.uid()
      and ucr.company_id = p_company_id
      and ucr.role = any(p_roles)
  );
$$;

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql stable
as $$
  select public.has_company_role(p_company_id, array['admin','hr','finance']);
$$;

create or replace function public.has_active_support_grant(p_company_id uuid)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.support_access_grants sag
    join public.users u on u.id = sag.platform_admin_user_id
    where u.auth_id = auth.uid()
      and sag.company_id = p_company_id
      and sag.revoked_at is null
      and sag.expires_at > now()
  );
$$;

-- Governs read/write of a company's operational data (employees, payroll,
-- settings) — deliberately NOT satisfied by is_platform_admin() alone, per
-- FR-5a.4: Super Admin cannot silently view a company's data without an
-- explicit, client-granted, time-limited support_access_grant.
create or replace function public.can_access_company(p_company_id uuid)
returns boolean
language sql stable
as $$
  select public.is_company_member(p_company_id)
      or (public.is_platform_admin() and public.has_active_support_grant(p_company_id));
$$;

-- ============================================================================
-- SECTION H: ENABLE RLS
-- ============================================================================

alter table public.users enable row level security;
alter table public.platform_admins enable row level security;
alter table public.companies enable row level security;
alter table public.company_subscriptions enable row level security;
alter table public.support_access_grants enable row level security;
alter table public.departments enable row level security;
alter table public.user_company_roles enable row level security;
alter table public.grades enable row level security;
alter table public.salary_structure_components enable row level security;
alter table public.employer_cost_components enable row level security;
alter table public.pfas enable row level security;
alter table public.employees enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_run_lines enable row level security;
alter table public.md_approval_dispatches enable row level security;
alter table public.audit_logs enable row level security;
alter table public.statutory_rate_tables enable row level security;

-- ============================================================================
-- SECTION I: RLS POLICIES
-- ============================================================================

-- users: see yourself, platform admins, or anyone who shares a company with you
create policy users_select on public.users for select
  using (
    auth_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.user_company_roles mine
      join public.user_company_roles theirs on theirs.company_id = mine.company_id
      where mine.user_id = public.current_app_user_id()
        and theirs.user_id = users.id
    )
  );
create policy users_update_self on public.users for update
  using (auth_id = auth.uid());
-- No client-side insert/delete policy: rows are created only by the
-- on_auth_user_created trigger (security definer, bypasses RLS).

-- platform_admins: platform admins only. NOTE: the very first row must be
-- inserted from the Supabase SQL editor / service role — there's no
-- authenticated user who can satisfy is_platform_admin() before one exists.
create policy platform_admins_all on public.platform_admins for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- companies: platform admins see/provision all; company members see their own
create policy companies_select on public.companies for select
  using (public.is_platform_admin() or public.is_company_member(id));
create policy companies_insert on public.companies for insert
  with check (public.is_platform_admin());
create policy companies_update on public.companies for update
  using (public.is_platform_admin() or public.has_company_role(id, array['admin']));

-- company_subscriptions: platform admin manages; company can view its own plan
create policy company_subscriptions_select on public.company_subscriptions for select
  using (public.is_platform_admin() or public.is_company_member(company_id));
create policy company_subscriptions_write on public.company_subscriptions for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- support_access_grants: company admin grants/revokes; platform admin can view/self-revoke
create policy support_grants_select on public.support_access_grants for select
  using (public.has_company_role(company_id, array['admin']) or public.is_platform_admin());
create policy support_grants_insert on public.support_access_grants for insert
  with check (public.has_company_role(company_id, array['admin']));
create policy support_grants_update on public.support_access_grants for update
  using (public.has_company_role(company_id, array['admin']) or public.is_platform_admin());

-- departments / grades / pfas / salary_structure_components / employer_cost_components:
-- same shape — members read, admin (or supported platform admin) writes
create policy departments_select on public.departments for select
  using (public.can_access_company(company_id));
create policy departments_write on public.departments for all
  using (public.has_company_role(company_id, array['admin']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)))
  with check (public.has_company_role(company_id, array['admin']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)));

create policy grades_select on public.grades for select
  using (public.can_access_company(company_id));
create policy grades_write on public.grades for all
  using (public.has_company_role(company_id, array['admin']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)))
  with check (public.has_company_role(company_id, array['admin']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)));

create policy pfas_select on public.pfas for select
  using (public.can_access_company(company_id));
create policy pfas_write on public.pfas for all
  using (public.has_company_role(company_id, array['admin']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)))
  with check (public.has_company_role(company_id, array['admin']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)));

create policy salary_components_select on public.salary_structure_components for select
  using (public.can_access_company(company_id));
create policy salary_components_write on public.salary_structure_components for all
  using (public.has_company_role(company_id, array['admin']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)))
  with check (public.has_company_role(company_id, array['admin']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)));

create policy employer_costs_select on public.employer_cost_components for select
  using (public.can_access_company(company_id));
create policy employer_costs_write on public.employer_cost_components for all
  using (public.has_company_role(company_id, array['admin']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)))
  with check (public.has_company_role(company_id, array['admin']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)));

-- user_company_roles: admin manages membership; anyone can see their own row
create policy user_company_roles_select on public.user_company_roles for select
  using (
    public.has_company_role(company_id, array['admin'])
    or user_id = public.current_app_user_id()
    or public.is_platform_admin()
  );
create policy user_company_roles_write on public.user_company_roles for all
  using (public.has_company_role(company_id, array['admin']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)))
  with check (public.has_company_role(company_id, array['admin']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)));

-- employees: admin/hr write; no delete policy anywhere — deactivate via status (FR-2.3)
create policy employees_select on public.employees for select
  using (public.can_access_company(company_id));
create policy employees_insert on public.employees for insert
  with check (public.has_company_role(company_id, array['admin','hr']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)));
create policy employees_update on public.employees for update
  using (public.has_company_role(company_id, array['admin','hr']) or (public.is_platform_admin() and public.has_active_support_grant(company_id)));

-- payroll_runs: HR/Admin prepare; the row becomes read-only to non-admins
-- once locked_at is set — matches FR-3.7 / Section 15 acceptance criteria
-- that only an Admin "Reopen" action can touch a locked run again.
create policy payroll_runs_select on public.payroll_runs for select
  using (public.can_access_company(company_id));
create policy payroll_runs_insert on public.payroll_runs for insert
  with check (public.has_company_role(company_id, array['admin','hr']));
create policy payroll_runs_update on public.payroll_runs for update
  using (
    (locked_at is null and public.has_company_role(company_id, array['admin','hr','finance']))
    or (locked_at is not null and public.has_company_role(company_id, array['admin']))
  );

-- payroll_run_lines: no company_id column, so join through payroll_runs.
-- Same lock rule as payroll_runs — once the parent run is locked, nobody
-- (including Admin) can write a line directly; Admin must null out
-- payroll_runs.locked_at via the Reopen action first, which is itself
-- audit-logged (FR-7.3).
create policy payroll_run_lines_select on public.payroll_run_lines for select
  using (exists (
    select 1 from public.payroll_runs pr
    where pr.id = payroll_run_lines.payroll_run_id
      and public.can_access_company(pr.company_id)
  ));
create policy payroll_run_lines_insert on public.payroll_run_lines for insert
  with check (exists (
    select 1 from public.payroll_runs pr
    where pr.id = payroll_run_lines.payroll_run_id
      and pr.locked_at is null
      and public.has_company_role(pr.company_id, array['admin','hr'])
  ));
create policy payroll_run_lines_update on public.payroll_run_lines for update
  using (exists (
    select 1 from public.payroll_runs pr
    where pr.id = payroll_run_lines.payroll_run_id
      and pr.locked_at is null
      and public.has_company_role(pr.company_id, array['admin','hr','finance'])
  ));
-- No delete policy: run lines are never deleted (immutable snapshot, FR-3.7).

-- md_approval_dispatches: Admin/Finance trigger dispatch; decision updates
-- (via the emailed link) happen server-side with the service role key,
-- which bypasses RLS entirely — that path does not need a policy here.
create policy md_dispatches_select on public.md_approval_dispatches for select
  using (exists (
    select 1 from public.payroll_runs pr
    where pr.id = md_approval_dispatches.payroll_run_id
      and public.can_access_company(pr.company_id)
  ));
create policy md_dispatches_insert on public.md_approval_dispatches for insert
  with check (exists (
    select 1 from public.payroll_runs pr
    where pr.id = md_approval_dispatches.payroll_run_id
      and public.has_company_role(pr.company_id, array['admin','finance'])
  ));
create policy md_dispatches_update on public.md_approval_dispatches for update
  using (exists (
    select 1 from public.payroll_runs pr
    where pr.id = md_approval_dispatches.payroll_run_id
      and public.has_company_role(pr.company_id, array['admin'])
  ));

-- audit_logs: read-only from the client, per FR-7.2. Writes happen only via
-- SECURITY DEFINER trigger functions (attach these per-table as you build
-- out the app logic) or the service role — never a direct client insert.
create policy audit_logs_select on public.audit_logs for select
  using (
    (company_id is not null and public.can_access_company(company_id))
    or (company_id is null and public.is_platform_admin())
  );

-- statutory_rate_tables: every authenticated company member can read
-- (the engine needs it); only the platform Super Admin can write, since
-- these are national-law rates shared by every tenant (see note at top).
create policy statutory_rates_select on public.statutory_rate_tables for select
  using (auth.uid() is not null);
create policy statutory_rates_write on public.statutory_rate_tables for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ============================================================================
-- SECTION J: SEED — Nigeria Tax Act 2025 rates, effective 1 January 2026
-- ============================================================================
-- created_by_user_id is left null for the seed row (no user exists yet at
-- migration time). Populate it later if you want the audit trail to show
-- who owns the seed vs. a real edit.

insert into public.statutory_rate_tables (rate_type, config_json, effective_from) values
(
  'paye_band',
  '{
    "description": "Progressive PAYE bands, NTA 2025, applied to Chargeable Income",
    "bands": [
      {"upto": 800000,    "rate": 0.00},
      {"upto": 3000000,   "rate": 0.15},
      {"upto": 10000000,  "rate": 0.18},
      {"upto": 25000000,  "rate": 0.21},
      {"upto": 50000000,  "rate": 0.23},
      {"upto": null,      "rate": 0.25}
    ]
  }'::jsonb,
  '2026-01-01'
),
(
  'pension',
  '{"employee_rate": 0.08, "employer_rate": 0.10, "base": "basic_plus_housing_plus_transport"}'::jsonb,
  '2026-01-01'
),
(
  'nhf',
  '{"rate": 0.025, "base": "basic", "default_enabled": false, "opt_in": true}'::jsonb,
  '2026-01-01'
),
(
  'nsitf',
  '{"rate": 0.01, "base": "gross", "payer": "employer"}'::jsonb,
  '2026-01-01'
),
(
  'itf',
  '{"rate": 0.01, "base": "gross", "payer": "employer"}'::jsonb,
  '2026-01-01'
),
(
  'rent_relief',
  '{"percentage_of_annual_rent": 0.20, "cap": 500000, "requires_declared_rent": true}'::jsonb,
  '2026-01-01'
);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
