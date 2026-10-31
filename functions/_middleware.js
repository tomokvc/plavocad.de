// Cloudflare Pages: sorgt dafür, dass die 404-Seite immer als Webseite ausgeliefert wird.
// Ohne das kann Cloudflare bei falschen Adressen mit Dateiendung (z. B. /alt.php) den Dateityp der Endung übernehmen,
// und der Browser lädt die Fehlerseite dann als Datei herunter.
export async function onRequest(context) {
  const res = await context.next();
  if (res.status !== 404) return res;
  const headers = new Headers(res.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.delete('Content-Disposition');
  return new Response(res.body, { status: 404, statusText: 'Not Found', headers });
}
