-- ============================================================
-- VOLTUM — Migration 002
-- RPC pública para mostrar estadísticas reales en el landing.
-- Usada por index.html para renderizar los contadores del hero.
-- ============================================================

create or replace function public.get_voltum_stats()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'djs',       (select count(*)::int from public.profiles where coalesce(is_company, false) = false),
    'companies', (select count(*)::int from public.profiles where is_company = true),
    'bookings',  (select count(*)::int from public.bookings  where voltum_status in ('confirmed','dj_review','approved_voltum'))
  );
$$;

-- Permitir que ANY visitante (anon) y usuarios autenticados la ejecuten.
-- SECURITY DEFINER hace el bypass de RLS pero no se expone nada sensible:
-- solo counts agregados.
grant execute on function public.get_voltum_stats() to anon, authenticated;

-- ─── FIN MIGRATION 002 ────────────────────────────────────────
