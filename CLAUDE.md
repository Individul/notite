# Notițe

Aplicație personală de notițe (notite.dumitru.cloud). Astro `output: 'server'` pe Cloudflare Workers, D1 pentru date, Cloudflare Access pentru autentificare. Planul complet: `docs/plans/2026-09-07-notite-v1.md`.

## Convenții

- Totul în română: UI cu diacritice; comentarii, mesaje de commit și nume de fișiere fără diacritice; identificatori în română (`notaZi`, `verificaAccessJwt`).
- Fiecare interogare D1 filtrează pe `owner`. Paginile nu citesc `env.ACCESS_*` direct; identitatea vine din `Astro.locals.email` (middleware).
- Modulele pure din `src/lib` au teste (`vitest` cu `@cloudflare/vitest-pool-workers`).

## Development

Prima dată: `cp .dev.vars.example .dev.vars` și `npm run migrate:local`.

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

Teste: `npm test`. Verificare tipuri: `npm run check`. Apropiat de producție: `npm run build && npx wrangler dev`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
