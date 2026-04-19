-- ============================================================
-- VOLTUM — Migration 001
-- Rediseño del flujo de bookings: Voltum como intermediario.
--
-- ANTES: empresa → DJ (directo). DJ veía la solicitud y aceptaba/rechazaba.
-- AHORA: empresa → Voltum (admin revisa, aplica comisión, gestiona) → DJ.
-- Adicional: perfil empresa es gratuito (sin membresía).
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

-- ─── EXTENDER TABLA bookings ──────────────────────────────────
alter table public.bookings
  add column if not exists voltum_status text default 'review_voltum',
  add column if not exists equipment_provided boolean,
  add column if not exists equipment_details text,
  add column if not exists commission_percent numeric default 12,
  add column if not exists commission_amount numeric,
  add column if not exists dj_net_amount numeric,
  add column if not exists admin_notes text,
  add column if not exists admin_reviewed_at timestamptz,
  add column if not exists admin_reviewed_by uuid references auth.users on delete set null,
  add column if not exists dj_notified_at timestamptz;

-- voltum_status workflow:
--   'review_voltum'    → recién creado, admin revisa (DJ no ve el booking)
--   'approved_voltum'  → admin aprobó, se puede enviar al DJ
--   'rejected_voltum'  → admin rechazó (no cumple requisitos)
--   'dj_review'        → enviado al DJ, esperando respuesta
--   'confirmed'        → DJ aceptó, evento confirmado
--   'dj_declined'      → DJ rechazó
--   'cancelled'        → cancelado (empresa o admin)

-- ─── MIGRAR BOOKINGS EXISTENTES ───────────────────────────────
-- Los bookings viejos con status legacy deben mapearse a voltum_status
update public.bookings
  set voltum_status = case
    when status = 'aceptado'  then 'confirmed'
    when status = 'rechazado' then 'dj_declined'
    when status = 'cancelado' then 'cancelled'
    when status = 'pendiente' then 'dj_review'
    else 'review_voltum'
  end
where voltum_status is null;

-- ─── ÍNDICES para queries del admin y DJ ──────────────────────
create index if not exists idx_bookings_voltum_status on public.bookings(voltum_status);
create index if not exists idx_bookings_dj_user        on public.bookings(dj_user_id);
create index if not exists idx_bookings_company        on public.bookings(company_id);
create index if not exists idx_bookings_created_at     on public.bookings(created_at desc);

-- ─── RLS POLICIES ─────────────────────────────────────────────
-- Admin ve todo
drop policy if exists "Admin ve todos los bookings" on public.bookings;
create policy "Admin ve todos los bookings"
  on public.bookings for select
  using (public.is_admin());

drop policy if exists "Admin actualiza bookings" on public.bookings;
create policy "Admin actualiza bookings"
  on public.bookings for update
  using (public.is_admin());

-- DJ solo ve bookings que Voltum aprobó (no ve los que están en review_voltum)
drop policy if exists "DJ ve sus bookings aprobados" on public.bookings;
create policy "DJ ve sus bookings aprobados"
  on public.bookings for select
  using (
    dj_user_id = auth.uid()
    and voltum_status in ('approved_voltum', 'dj_review', 'confirmed', 'dj_declined', 'cancelled')
  );

-- DJ puede actualizar SU RESPUESTA cuando está en dj_review
drop policy if exists "DJ responde bookings en dj_review" on public.bookings;
create policy "DJ responde bookings en dj_review"
  on public.bookings for update
  using (dj_user_id = auth.uid() and voltum_status in ('dj_review', 'approved_voltum'));

-- Empresa ve sus propios bookings (sin importar el estado Voltum)
drop policy if exists "Empresa ve sus propios bookings" on public.bookings;
create policy "Empresa ve sus propios bookings"
  on public.bookings for select
  using (
    company_id in (
      select id from public.companies where user_id = auth.uid()
    )
  );

-- Empresa inserta nuevos bookings
drop policy if exists "Empresa crea bookings" on public.bookings;
create policy "Empresa crea bookings"
  on public.bookings for insert
  with check (
    company_id in (
      select id from public.companies where user_id = auth.uid()
    )
  );

-- Empresa puede cancelar su propio booking
drop policy if exists "Empresa cancela su booking" on public.bookings;
create policy "Empresa cancela su booking"
  on public.bookings for update
  using (
    company_id in (
      select id from public.companies where user_id = auth.uid()
    )
  );

-- ─── VISTA: bookings del DJ (solo los relevantes) ─────────────
create or replace view public.dj_visible_bookings as
  select
    b.*,
    c.name as company_name,
    c.contact_phone as company_phone,
    c.instagram as company_instagram
  from public.bookings b
  left join public.companies c on c.id = b.company_id
  where b.voltum_status in ('approved_voltum', 'dj_review', 'confirmed', 'dj_declined');

-- ─── TRIGGER: al aceptar DJ, marcar timestamp ────────────────
create or replace function public.on_booking_status_change()
returns trigger language plpgsql as $$
begin
  if new.voltum_status = 'dj_review' and old.voltum_status <> 'dj_review' then
    new.dj_notified_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists booking_status_change on public.bookings;
create trigger booking_status_change
  before update on public.bookings
  for each row execute function public.on_booking_status_change();

-- ─── FIN MIGRATION 001 ────────────────────────────────────────
