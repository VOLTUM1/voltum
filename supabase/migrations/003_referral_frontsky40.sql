-- ============================================================
-- VOLTUM — Migration 003
-- Código de referido: FRONTSKY40
-- 40% descuento en las primeras 3 mensualidades para quien lo use.
-- El DJ FRONTSKY queda como "owner" del código (puede aparecer
-- en su dashboard como referidos cuando alguien lo canjea).
-- ============================================================

-- Upsert del código: si ya existe lo actualiza, si no lo crea.
insert into public.referral_codes (code, owner_user_id, discount_percent, discount_months, active)
select
  'FRONTSKY40',
  p.id,
  40,
  3,
  true
from public.profiles p
where upper(p.dj_name) = 'FRONTSKY'
   or lower(p.slug)     = 'frontsky'
   or lower(p.slug) like 'frontsky-%'
order by p.created_at asc
limit 1
on conflict (code) do update
  set discount_percent = 40,
      discount_months  = 3,
      active           = true,
      owner_user_id    = excluded.owner_user_id;

-- Verificación (opcional): muestra el código insertado + el DJ dueño.
-- Descomentar para correr junto al insert y ver el resultado.
-- select rc.*, p.dj_name as owner_name, p.slug as owner_slug
-- from public.referral_codes rc
-- left join public.profiles p on p.id = rc.owner_user_id
-- where rc.code = 'FRONTSKY40';

-- ─── FIN MIGRATION 003 ────────────────────────────────────────
