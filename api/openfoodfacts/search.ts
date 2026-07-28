export const config = { runtime: "edge" };

const UPSTREAM = "https://search.openfoodfacts.org/search";
const FORWARDED_PARAMS = new Set(["q", "langs", "page", "page_size", "index_id", "fields"]);

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8", allow: "GET" },
    });
  }

  const incoming = new URL(request.url);
  const query = incoming.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 180) {
    return new Response(JSON.stringify({ error: "Query must contain 2–180 characters" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const upstream = new URL(UPSTREAM);
  incoming.searchParams.forEach((value, key) => {
    if (FORWARDED_PARAMS.has(key)) upstream.searchParams.set(key, value);
  });
  upstream.searchParams.set("page_size", String(Math.min(20, Number(upstream.searchParams.get("page_size")) || 18)));

  try {
    const response = await fetch(upstream, {
      headers: {
        accept: "application/json",
        "user-agent": "Rootine/1.0 nutrition catalog",
      },
    });
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": response.ok
          ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
          : "no-store",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Open Food Facts is temporarily unavailable" }), {
      status: 502,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}
