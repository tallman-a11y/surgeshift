// Live build version — the commit SHA of the currently-deployed server. The
// client compares this against its baked-in NEXT_PUBLIC_BUILD_ID to detect when
// a tab is running stale JS after a deploy (see VersionGate).
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { v: process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_REF || "dev" },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
