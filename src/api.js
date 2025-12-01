// api.js - wrapper para llamadas al servidor (simuladas)
export async function postReport(report) {
  // Intenta enviar al servidor; si falla, lanza error para que el caller lo guarde en outbox
  const resp = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!resp.ok) throw new Error("Network");
  return resp.json();
}
