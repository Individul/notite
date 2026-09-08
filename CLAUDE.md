# Notițe

Aplicație personală de notițe (notite.dumitru.cloud). Astro `output: 'server'` pe Cloudflare Workers, D1 pentru date, Cloudflare Access pentru autentificare. Planul complet: `docs/plans/2026-09-07-notite-v1.md`.

## Convenții

- Totul în română: UI cu diacritice; comentarii, mesaje de commit și nume de fișiere fără diacritice; identificatori în română (`notaZi`, `verificaAccessJwt`).
- Fiecare interogare D1 filtrează pe `owner`. Paginile nu citesc `env.ACCESS_*` direct; identitatea vine din `Astro.locals.email` (middleware).
- Modulele pure din `src/lib` au teste (`vitest` cu `@cloudflare/vitest-pool-workers`).
- Editorul e CodeMirror 6 cu formatarea la vedere (`src/scripts/vizual.ts`). Documentul lui *este* textul Markdown, deci salvarea, D1 si cautarea raman ce erau. Limbajul se construieste pe `@lezer/markdown`, nu pe `@codemirror/lang-markdown`: acela aduce parserele HTML/CSS/JS si dubleaza pachetul. Decoram doar ce randeaza aplicatia; restul ramane text simplu.

## Development

Prima dată: `cp .dev.vars.example .dev.vars` și `npm run migrate:local`.

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

Pentru proba pe telefon: `npm run dev:retea` (acelasi lucru plus `--ip 0.0.0.0`). Middleware-ul ramane multumit fiindca `--local-upstream localhost` pune oricum `localhost` in URL, deci nu trebuie slabita poarta de identitate. Cat ruleaza, notitele locale sunt vizibile oricui din retea.

Teste: `npm test`. Verificare tipuri: `npm run check`. Apropiat de producție: `npm run dev:worker` (build + `wrangler dev --local-upstream localhost`; fără `--local-upstream`, wrangler pune hostname-ul domeniului custom și middleware-ul nu mai recunoaște mediul local, deci răspunde 503).

Capcana: `wrangler dev` isi face lista de assets o singura data, la pornire, din `dist`. Daca rulezi `npm run build` cat timp serverul merge, `dist` e sters si refacut, iar serverul raspunde 404 la CSS si la JavaScript — chiar si cand numele fisierelor raman aceleasi. Vezi aplicatia complet nestilizata, iar fara JavaScript nu merge nici salvarea automata, desi indicatorul zice mai departe „salvat”. Nu e bug-ul de mai jos: reporneste `npm run dev:worker`.

Cunoscut: cu Astro 7.3 + adaptorul Cloudflare 14.3, `astro dev` servește uneori paginile fără `<style>` și fără `/@vite/client` (rulează în workerd și pierde mediul de dev la pornire rece sau după „program reload”). Rutele, middleware-ul și API-ul merg corect. Pentru verificări vizuale folosește `npm run dev:worker` (port 8787), care servește build-ul real.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
