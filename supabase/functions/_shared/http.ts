// What the Edge Functions share: the sub-path router, JSON replies with CORS, and the caller's sign-in.

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }

/** Answers one sub-path of a function, e.g. /jobs/add. */
export type Handler = (req: Request) => Promise<Response>

/** A JSON answer with the CORS headers every browser caller needs. */
export function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status: status, headers: { ...CORS, "Content-Type": "application/json" } })
}

/** Serves one function: answers CORS preflights, then hands the request to the route named by the last path segment. */
export function serveRoutes(routes: Record<string, Handler>): void {
  Deno.serve(async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
    const route = routes[new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ?? ""]

    return route ? await route(req) : reply(404, { error: "Not found." })
  })
}
