// Ajutoare de data. Workerul ruleaza in UTC; ziua "de azi" e cea din Moldova.

export const FUS = "Europe/Chisinau";

// D1 scrie "YYYY-MM-DD HH:MM:SS" in UTC; normalizam inainte de parsare.
export function parseDbDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(/[T]/.test(iso) ? iso : iso.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

// "2026-09-07" pentru momentul dat, in fusul Chisinau. en-CA da exact AAAA-LL-ZZ.
export function aziChisinau(acum: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUS, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(acum);
}

// Regex plus round-trip prin Date.UTC, ca "2026-02-30" sa nu treaca.
export function ziValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, l, z] = s.split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(a, l - 1, z));
  return d.getUTCFullYear() === a && d.getUTCMonth() === l - 1 && d.getUTCDate() === z;
}

// Ziua la `delta` zile distanta, calculata pe UTC (zilele din URL nu au fus).
export function ziVecina(data: string, delta: number): string {
  const [a, l, z] = data.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, l - 1, z + delta)).toISOString().slice(0, 10);
}

function laPranzUtc(data: string): Date {
  return new Date(`${data}T12:00:00Z`);
}

// "luni, 7 septembrie 2026"
export function fmtZi(data: string): string {
  return laPranzUtc(data).toLocaleDateString("ro-RO", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// "Azi", "Ieri", "Mâine" sau ziua saptamanii cu majuscula.
export function etichetaZi(data: string, azi: string = aziChisinau()): string {
  if (data === azi) return "Azi";
  if (data === ziVecina(azi, -1)) return "Ieri";
  if (data === ziVecina(azi, 1)) return "Mâine";
  const zi = laPranzUtc(data).toLocaleDateString("ro-RO", { timeZone: "UTC", weekday: "long" });
  return zi.charAt(0).toUpperCase() + zi.slice(1);
}
