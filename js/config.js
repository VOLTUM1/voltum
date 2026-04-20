// ============================================================
// VOLTUM — Configuración Global
// ============================================================
// IMPORTANTE: Reemplaza los valores de abajo con los tuyos.
//
// ─── SUPABASE SQL SCHEMA ────────────────────────────────────
// Ejecuta esto en el SQL Editor de tu proyecto Supabase:
//
// create table public.profiles (
//   id uuid references auth.users on delete cascade primary key,
//   dj_name text not null,
//   real_name text,
//   slug text unique,
//   bio text,
//   genres text[],
//   location text,
//   photo_url text,
//   banner_url text,
//   social_instagram text,
//   social_tiktok text,
//   social_soundcloud text,
//   social_spotify text,
//   social_youtube text,
//   social_facebook text,
//   technical_rider text,
//   booking_email text,
//   profile_views integer default 0,
//   is_admin boolean default false,
//   created_at timestamptz default now(),
//   updated_at timestamptz default now()
// );
//
// -- Si ya tienes la tabla, solo agrega las columnas:
// alter table public.profiles add column if not exists is_admin boolean default false;
// alter table public.profiles add column if not exists custom_link1 text;
// alter table public.profiles add column if not exists custom_link2 text;
//
// -- Orden de eventos destacados en el press kit:
// alter table public.events add column if not exists featured_order integer;
//
// create table public.memberships (
//   id uuid primary key default gen_random_uuid(),
//   user_id uuid references auth.users on delete cascade unique,
//   status text default 'pending',
//   payment_id text,
//   amount numeric,
//   starts_at timestamptz,
//   expires_at timestamptz,
//   created_at timestamptz default now()
// );
//
// create table public.events (
//   id uuid primary key default gen_random_uuid(),
//   user_id uuid references auth.users on delete cascade,
//   name text not null,
//   venue text,
//   city text,
//   date date,
//   created_at timestamptz default now()
// );
//
// -- Habilitar RLS
// alter table public.profiles enable row level security;
// alter table public.memberships enable row level security;
// alter table public.events enable row level security;
//
// -- Tabla de códigos de referido
// create table if not exists public.referral_codes (
//   id uuid primary key default gen_random_uuid(),
//   code text unique not null,
//   owner_user_id uuid references auth.users on delete set null,
//   discount_percent integer not null default 20,
//   discount_months integer not null default 3,
//   active boolean default true,
//   created_at timestamptz default now()
// );
//
// -- Tabla de referidos (quién usó cada código)
// create table if not exists public.referrals (
//   id uuid primary key default gen_random_uuid(),
//   code text not null,
//   referrer_user_id uuid references auth.users on delete set null,
//   referred_user_id uuid references auth.users on delete cascade unique,
//   discount_months_remaining integer not null default 3,
//   created_at timestamptz default now()
// );
//
// alter table public.referral_codes enable row level security;
// alter table public.referrals enable row level security;
//
// create policy "Leer códigos activos" on referral_codes for select using (true);
// create policy "Ver propios referidos" on referrals for select using (referrer_user_id = auth.uid() or public.is_admin());
//
// -- Insertar el código richandbleak20 (ejecutar en SQL Editor)
// insert into public.referral_codes (code, owner_user_id, discount_percent, discount_months)
// select 'RICHANDBLEAK40', id, 40, 3
// from auth.users where email = 'richandbleakbookings@gmail.com';
//
// -- Función helper para verificar admin (ejecutar antes de las policies)
// create or replace function public.is_admin()
// returns boolean language sql security definer as $$
//   select coalesce(
//     (select is_admin from public.profiles where id = auth.uid()),
//     false
//   );
// $$;
//
// -- Políticas de profiles
// create policy "Profiles públicos visibles" on profiles for select using (true);
// create policy "Usuarios crean su perfil" on profiles for insert with check (auth.uid() = id);
// create policy "Usuarios editan su perfil" on profiles for update using (auth.uid() = id or public.is_admin());
//
// -- Políticas de memberships
// create policy "Ver propia membresía" on memberships for select using (auth.uid() = user_id or public.is_admin());
// create policy "Insertar propia membresía" on memberships for insert with check (auth.uid() = user_id);
// create policy "Actualizar propia membresía" on memberships for update using (auth.uid() = user_id or public.is_admin());
//
// -- Políticas de events
// create policy "Eventos públicos visibles" on events for select using (true);
// create policy "Gestionar propios eventos" on events for all using (auth.uid() = user_id or public.is_admin());
//
// -- Bucket de storage (ejecutar en Supabase Storage)
// insert into storage.buckets (id, name, public) values ('press-kits', 'press-kits', true);
// create policy "Imágenes públicas" on storage.objects for select using (bucket_id = 'press-kits');
// create policy "Subir imágenes autenticado" on storage.objects for insert with check (bucket_id = 'press-kits' and auth.role() = 'authenticated');
// create policy "Actualizar propias imágenes" on storage.objects for update using (bucket_id = 'press-kits' and auth.uid()::text = (storage.foldername(name))[1]);
// create policy "Borrar propias imágenes" on storage.objects for delete using (bucket_id = 'press-kits' and auth.uid()::text = (storage.foldername(name))[1]);
// ─────────────────────────────────────────────────────────────

const VOLTUM = {
  supabase: {
    url: 'https://vsadzmuzzeovwqnpcgrr.supabase.co',
    anonKey: 'sb_publishable_AkB3PPIhFjaUZAf4_JgLFA_Zv_pguEo'
  },
  mercadoPago: {
    publicKey: 'APP_USR-081a5007-0ae7-4e29-aa9f-5bceefbdda78',
    // Endpoints de Supabase Edge Functions
    preferenceEndpoint: 'https://vsadzmuzzeovwqnpcgrr.supabase.co/functions/v1/create-payment',
    cancelEndpoint: 'https://vsadzmuzzeovwqnpcgrr.supabase.co/functions/v1/cancel-subscription',
    redeemPromoEndpoint: 'https://vsadzmuzzeovwqnpcgrr.supabase.co/functions/v1/redeem-promo'
  },
  plan: {
    name: 'Voltum Pro',
    price: 9990,
    currency: 'CLP',
    description: 'Press Kit Digital + Membresía Mensual'
  },
  app: {
    url: 'http://localhost' // Cambia a tu dominio en producción
  }
};

// Inicializar Supabase
const { createClient } = supabase;
const sb = createClient(VOLTUM.supabase.url, VOLTUM.supabase.anonKey);

// ============================================================
// Lucide Icons — carga diferida a idle para no bloquear paint
// Uso: <i data-lucide="music"></i>  (ver https://lucide.dev)
// Se carga durante el tiempo muerto del CPU post-paint.
// ============================================================
(function loadLucide() {
  if (typeof window === 'undefined') return;
  if (window.__voltumLucideLoaded) return;
  window.__voltumLucideLoaded = true;

  const refresh = () => { try { window.lucide && window.lucide.createIcons(); } catch(_) {} };

  // Observer con debounce para re-render tras inserts dinámicos
  let obsT;
  let obsMounted = false;
  const mountObserver = () => {
    if (obsMounted) return;
    obsMounted = true;
    const obs = new MutationObserver(() => {
      clearTimeout(obsT);
      obsT = setTimeout(refresh, 80);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  };

  const loadLib = () => {
    if (window.lucide) { refresh(); mountObserver(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/lucide@0.454.0/dist/umd/lucide.min.js';
    s.defer = true;
    s.fetchPriority = 'low';
    s.onload = () => { refresh(); mountObserver(); };
    document.head.appendChild(s);
  };

  // Carga la lib cuando el navegador esté idle (o máximo 1.5s después).
  // Así no compite con el CSS/HTML crítico en el initial paint.
  const boot = () => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(loadLib, { timeout: 1500 });
    } else {
      setTimeout(loadLib, 200);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Helper global para re-render manual tras insertar markup con data-lucide
  window.renderIcons = refresh;
})();

// ============================================================
// Service Worker — registrarlo solo en producción y tras load
// ============================================================
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}

// Helpers de autenticación
const Auth = {
  async getUser() {
    const { data: { user } } = await sb.auth.getUser();
    return user;
  },
  async requireAuth() {
    const user = await this.getUser();
    if (!user) { window.location.href = 'auth.html'; return null; }
    return user;
  },
  async requireNoAuth() {
    const user = await this.getUser();
    if (user) { window.location.href = 'dashboard.html'; }
  }
};

// Helper para mostrar notificaciones
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
}

// Formatear precio
function formatPrice(n) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(n);
}

// ============================================================
// Polish & perf bootstrap
// ============================================================
(function voltumBoot() {
  if (typeof window === 'undefined') return;
  if (window.__voltumBootLoaded) return;
  window.__voltumBootLoaded = true;

  const onReady = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };

  // ── Scroll-reveal: elementos con [data-reveal] se muestran al entrar al viewport
  const mountReveal = () => {
    const els = document.querySelectorAll('[data-reveal]:not(.is-visible)');
    if (!els.length || !('IntersectionObserver' in window)) {
      els.forEach(e => e.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -60px 0px', threshold: 0.08 });
    els.forEach(el => io.observe(el));
  };

  // ── Counter: elementos con .counter y data-count="N" animan al entrar al viewport
  const mountCounters = () => {
    const els = document.querySelectorAll('.counter[data-count]:not(.is-counted)');
    if (!els.length || !('IntersectionObserver' in window)) {
      els.forEach(e => { e.textContent = e.dataset.count; e.classList.add('is-counted'); });
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = parseFloat(el.dataset.count) || 0;
        const suffix = el.dataset.suffix || '';
        const prefix = el.dataset.prefix || '';
        const duration = parseInt(el.dataset.duration || '1400', 10);
        const start = performance.now();
        const ease = (t) => 1 - Math.pow(1 - t, 3);
        const tick = (now) => {
          const p = Math.min(1, (now - start) / duration);
          const val = Math.floor(target * ease(p));
          el.textContent = prefix + val.toLocaleString('es-CL') + suffix;
          if (p < 1) requestAnimationFrame(tick);
          else el.classList.add('is-counted');
        };
        requestAnimationFrame(tick);
        io.unobserve(el);
      });
    }, { threshold: 0.3 });
    els.forEach(el => io.observe(el));
  };

  // ── Ripple: coordenadas del click sobre .btn para el radial glow
  const mountRipple = () => {
    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest && e.target.closest('.btn');
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      btn.style.setProperty('--rx', ((e.clientX - r.left) / r.width * 100) + '%');
      btn.style.setProperty('--ry', ((e.clientY - r.top) / r.height * 100) + '%');
    }, { passive: true });
  };

  // ── Image fade-in al cargar (evita flash de layout vacío)
  const mountImageFade = () => {
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
      if (img.complete && img.naturalHeight !== 0) {
        img.classList.add('loaded');
      } else {
        img.addEventListener('load',  () => img.classList.add('loaded'), { once: true });
        img.addEventListener('error', () => img.classList.add('loaded'), { once: true });
      }
    });
  };

  // ── Smooth anchor scroll respetando prefers-reduced-motion
  const mountSmoothAnchors = () => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href').slice(1);
      if (!id || id === '!') return;
      const t = document.getElementById(id);
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', '#' + id);
    });
  };

  onReady(() => {
    mountReveal();
    mountCounters();
    mountRipple();
    mountImageFade();
    mountSmoothAnchors();

    // Reveal/counters dinámicos (contenido insertado más tarde)
    let rT;
    const rObs = new MutationObserver(() => {
      clearTimeout(rT);
      rT = setTimeout(() => { mountReveal(); mountCounters(); mountImageFade(); }, 120);
    });
    rObs.observe(document.body, { childList: true, subtree: true });
  });
})();
