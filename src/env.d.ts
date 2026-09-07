/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

// Bindingurile Workerului (vezi ../wrangler.jsonc). Se citesc la runtime prin
// `import { env } from "cloudflare:workers"`. Interfata `Cloudflare.Env` se
// uneste peste declaratii, deci `env.DB` iese tipat ca D1Database.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    // Configurate pe Worker dupa crearea aplicatiei Cloudflare Access.
    // Fara ele, orice ruta raspunde 503 (esueaza inchis).
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
    // Doar in .dev.vars, pentru dezvoltare locala. Ignorat in productie.
    DEV_EMAIL?: string;
  }
}

declare namespace App {
  interface Locals {
    // Emailul utilizatorului autentificat, pus de middleware pe fiecare cerere.
    email: string;
  }
}
