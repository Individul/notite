# Notițe

Notița de azi și câteva notițe durabile. Scrii, se salvează singur.

Aplicație personală, la [notite.dumitru.cloud](https://notite.dumitru.cloud). Primul ecran este notița zilei curente (fusul Europe/Chișinău); notițele durabile, cu titlu, stau în lista laterală. Căutare full-text în toate, insensibilă la diacritice. Instalabilă ca aplicație pe telefon (PWA).

## Cum funcționează

- **Astro 7** (`output: 'server'`) pe **Cloudflare Workers**, cu `@astrojs/cloudflare`.
- **D1** (SQLite) cu text în clar și index **FTS5**; fiecare notiță are un `owner` (e-mail), iar fiecare interogare filtrează pe el.
- **Cloudflare Access** face autentificarea (cod pe e-mail). Serverul verifică semnătura JWT-ului din `Cf-Access-Jwt-Assertion`; fără Access configurat răspunde 503 (eșuează închis).
- **Salvare automată** la ~1 s după ce te oprești din scris, la `blur`, la ascunderea paginii și la Ctrl/Cmd+S. Dacă salvarea eșuează, textul rămâne în `localStorage` și se retrimite când revine netul. Două taburi care editează aceeași notiță: al doilea primește „conflict” și trebuie să reîncarce.
- **Markdown** minimal (titluri, liste, bold/italic, cod, linkuri), randat de un renderer propriu, sigur, folosit identic pe server și pe client. O bară mică de butoane pune marcajele în text (și Ctrl/Cmd+B, Ctrl/Cmd+I).
- **Sarcini**: `- [ ]` și `- [x]` devin căsuțe de bifat. În „Citește”, bifa se scrie înapoi în textul notiței și se salvează ca orice altă modificare.

Planul complet, cu deciziile luate: [`docs/plans/2026-09-07-notite-v1.md`](docs/plans/2026-09-07-notite-v1.md).

## Dezvoltare locală

```bash
npm install
cp .dev.vars.example .dev.vars   # DEV_EMAIL=dev@local; nu se comite niciodata
npm run migrate:local
npx astro dev --background        # http://localhost:4321
```

- `npm test` rulează testele (vitest în workerd, cu un D1 local real și migrațiile aplicate).
- `npm run check` verifică tipurile.
- `npm run dev:worker` construiește și pornește `wrangler dev` pe build (http://localhost:8787), cel mai aproape de producție. Folosește același D1 local din `.wrangler/state/v3`.

Local, identitatea vine din `DEV_EMAIL` (doar în `astro dev` sau pe `localhost`). Dacă setezi `ACCESS_TEAM_DOMAIN` și `ACCESS_AUD`, Access are prioritate și local.

## Configurare Cloudflare (o singură dată)

Stare (7 septembrie 2026): totul de mai jos este făcut. D1 `notite` creat și migrat, Zero Trust Free activat (echipa `wandering-firefly-46cf`; redenumirea în `dumitru-cloud` a stricat callback-ul `/cdn-cgi/access/authorized` pe zonă, așa că am revenit la numele generat), aplicația Access „Notițe” cu politica „Doar eu” și metodele de login One-time PIN + Cloudflare, `ACCESS_TEAM_DOMAIN` în `wrangler.jsonc`, secretul `ACCESS_AUD` pe Worker, aplicația publicată. Pașii rămân aici ca referință pentru o reinstalare.

1. **Baza de date**

   ```bash
   npx wrangler d1 create notite
   ```

   Pune `database_id`-ul afișat în `wrangler.jsonc`, apoi:

   ```bash
   npm run migrate:remote
   ```

2. **Aplicația Access** (Zero Trust → Access → Applications → Add an application → Self-hosted):
   - Nume: `Notițe`; domeniu: `notite.dumitru.cloud`; durata sesiunii: 1 lună.
   - Identity providers: doar **One-time PIN**.
   - Policy „Doar eu”: Action *Allow*, Include → *Emails* → adresa ta.
   - După salvare, copiază **Application Audience (AUD) Tag** din pagina aplicației.
   - Team domain-ul e cel din Zero Trust → Settings → Custom Pages, de forma `<echipa>.cloudflareaccess.com`.

3. **Variabile și secrete**

   În `wrangler.jsonc`, la `vars.ACCESS_TEAM_DOMAIN`, pune `<echipa>.cloudflareaccess.com`. Apoi:

   ```bash
   npx wrangler secret put ACCESS_AUD
   ```

   `DEV_EMAIL` nu se pune **niciodată** pe Worker, nici ca var, nici ca secret.

4. **Publicare**

   ```bash
   npm run deploy
   ```

   Domeniul custom `notite.dumitru.cloud` (DNS + certificat) este creat automat din `routes` la primul deploy. Adresa `*.workers.dev` rămâne activă, dar cererile de acolo nu trec prin Access, deci nu au JWT și primesc 403.

### Verificare după deploy

- Fereastră privată → `https://notite.dumitru.cloud` arată pagina cu cod pe e-mail a Cloudflare Access; alt e-mail e refuzat; e-mailul tău deschide aplicația, cu „conectat ca …” în subsol.
- `curl -i https://notite.dumitru.cloud/` fără cookie → redirect spre Access.
- `curl -H "Cf-Access-Jwt-Assertion: xyz" https://notite.<cont>.workers.dev/` → 403 (semnătura chiar se verifică).
- Pe telefon: „Adaugă pe ecranul principal”; scrii o linie, blochezi ecranul, revii → „salvat”; mod avion → „nesalvat, offline” → net → „salvat”.
- `npx wrangler tail` fără erori 5xx pe durata unei sesiuni.

## Structură

```
migrations/0001_init.sql     tabela notite + FTS5 + triggere
src/lib/db.ts                acces la date (toate functiile primesc owner)
src/lib/identitate.ts        cine face cererea: Access JWT | DEV_EMAIL | 503
src/lib/markdown.ts          renderer Markdown sigur (server + client)
src/lib/cautare.ts           interogarea FTS si fragmentul cu <mark>
src/middleware.ts            identitate pe fiecare cerere, Cache-Control: no-store
src/pages/                   / (azi), zi/[data], n/[id], n/noua, cautare, api/notite/*
src/scripts/editor.ts        salvare automata, ciorne, reincercari, previzualizare, formatare, bife
```
