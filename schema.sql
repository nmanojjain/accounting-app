-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users Table (Extends Supabase Auth)
create table public.users (
  id uuid references auth.users not null primary key,
  email text,
  role text check (role in ('admin', 'operator')),
  passkey text, -- For simple passkey auth if needed, or rely on Supabase Auth
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Companies Table
create table public.companies (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  financial_year text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- User Company Access (Many-to-Many)
create table public.user_company_access (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  unique(user_id, company_id)
);

-- Ledgers Table
create table public.ledgers (
  id uuid default uuid_generate_v4() primary key,
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  group_name text not null, -- Asset, Liability, Income, Expense
  sub_group text, -- For additional classification (e.g. City, Product Group)
  opening_balance numeric default 0,
  current_balance numeric default 0,
  is_cash_ledger boolean default false, -- To identify cash ledgers
  assigned_operator_id uuid references public.users(id), -- For Operator Cash
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Vouchers Table
create table public.vouchers (
  id uuid default uuid_generate_v4() primary key,
  company_id uuid references public.companies(id) on delete cascade,
  voucher_type text check (voucher_type in ('receipt', 'payment', 'sales', 'purchase', 'journal', 'contra')),
  voucher_number text,
  date date not null,
  narration text,
  created_by uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Voucher Entries Table
create table public.voucher_entries (
  id uuid default uuid_generate_v4() primary key,
  voucher_id uuid references public.vouchers(id) on delete cascade,
  ledger_id uuid references public.ledgers(id),
  debit numeric default 0,
  credit numeric default 0
);

-- RLS Policies (Simplified for initial setup)
alter table public.users enable row level security;
alter table public.companies enable row level security;
alter table public.ledgers enable row level security;
alter table public.vouchers enable row level security;

-- Admin has full access
-- Helper function to check admin role (bypassing RLS to avoid recursion)
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer;

-- Policies
create policy "Users can view own profile" on public.users
  for select using (auth.uid() = id);

create policy "Admins can view all profiles" on public.users
  for select using (public.is_admin());

create policy "Admins can update all profiles" on public.users
  for update using (public.is_admin());

create policy "Admins can insert profiles" on public.users
  for insert with check (public.is_admin() OR auth.uid() = id); -- Allow self-registration if needed, or just admin


-- Admin Policies for Companies
create policy "Admins can do everything on companies" on public.companies
  for all using (public.is_admin());

-- Admin Policies for User Company Access
create policy "Admins can do everything on user_company_access" on public.user_company_access
  for all using (public.is_admin());

-- Admin Policies for Ledgers
create policy "Admins can do everything on ledgers" on public.ledgers
  for all using (public.is_admin());

-- Admin Policies for Vouchers
create policy "Admins can do everything on vouchers" on public.vouchers
  for all using (public.is_admin());

-- Admin Policies for Voucher Entries
create policy "Admins can do everything on voucher_entries" on public.voucher_entries
  for all using (public.is_admin());

-- Operator Policies (Existing)
-- Operators can view assigned companies
create policy "Operator view companies" on public.companies
  for select using (
    exists (
      select 1 from public.user_company_access
      where user_id = auth.uid() and company_id = public.companies.id
    )
  );

-- Operators can view ledgers in assigned companies
create policy "Operator view ledgers" on public.ledgers
  for select using (
    exists (
      select 1 from public.user_company_access
      where user_id = auth.uid() and company_id = public.ledgers.company_id
    )
  );

-- Operators can create ledgers (optional, maybe restricted to admin?)
-- Let's allow them to create for now if needed, or restrict.
-- Assuming only Admin creates ledgers for now based on requirements?
-- "Operator specific cash ledgers transferable only by the admin" implies Admin manages structure.
-- But "Operator can create vouchers" is key.

-- Operators can create ledgers in assigned companies
create policy "Operator create ledgers" on public.ledgers
  for insert with check (
    exists (
      select 1 from public.user_company_access
      where user_id = auth.uid() and company_id = public.ledgers.company_id
    )
  );

-- Operators can view/create vouchers in assigned companies
create policy "Operator view vouchers" on public.vouchers
  for select using (
    exists (
      select 1 from public.user_company_access
      where user_id = auth.uid() and company_id = public.vouchers.company_id
    )
  );

create policy "Operator create vouchers" on public.vouchers
  for insert with check (
    exists (
      select 1 from public.user_company_access
      where user_id = auth.uid() and company_id = public.vouchers.company_id
    )
  );

-- Operators can view/create voucher entries
create policy "Operator view voucher entries" on public.voucher_entries
  for select using (
    exists (
      select 1 from public.vouchers
      where id = public.voucher_entries.voucher_id
      and exists (
        select 1 from public.user_company_access
        where user_id = auth.uid() and company_id = public.vouchers.company_id
      )
    )
  );

create policy "Operator create voucher entries" on public.voucher_entries
  for insert with check (
    exists (
      select 1 from public.vouchers
      where id = public.voucher_entries.voucher_id
      and exists (
        select 1 from public.user_company_access
        where user_id = auth.uid() and company_id = public.vouchers.company_id
      )
    )
  );

