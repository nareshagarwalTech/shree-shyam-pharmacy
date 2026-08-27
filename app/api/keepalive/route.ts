import { NextResponse } from 'next/server';

/**
 * GET /api/keepalive
 *
 * Hits the Supabase REST API with the anon key to reset the project's
 * inactivity timer (free-tier projects auto-pause after ~7 days of no
 * activity). Wired to a Vercel Cron in `vercel.json` — fires every 2 days
 * at 03:00 UTC (well inside the 7-day pause window).
 *
 * Can also be hit manually (GET) as a lightweight health probe.
 *
 * Response:
 *   { ok: true, rows: <total>, at: <ISO ts>, ms: <latency> }   on success
 *   { ok: false, error: <string>, at: <ISO ts> }               on failure
 *
 * Notes:
 * - Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the env var
 *   is set. If CRON_SECRET is present we require it (rejects public probes).
 *   If not set, the endpoint is open — fine for a health check.
 * - Uses the anon key which is public anyway (shipped in the browser bundle).
 * - Does NOT call the Management API / attempt restore — that requires the
 *   sensitive PAT which we don't want in a frontend env var. If the project
 *   is already paused, this endpoint will return ok:false; a human needs to
 *   restore via the Supabase dashboard. The whole point of the cron is to
 *   prevent that from happening in the first place.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const started = Date.now();

  // Optional shared secret enforced when set (Vercel Cron passes it as
  // `Authorization: Bearer <CRON_SECRET>` automatically).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { ok: false, error: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY' },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/customers?select=id&limit=1`,
      {
        method: 'HEAD',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Prefer: 'count=exact',
        },
        cache: 'no-store',
      },
    );
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Supabase responded ${res.status}`,
          at: new Date().toISOString(),
          ms: Date.now() - started,
        },
        { status: 502 },
      );
    }
    // Content-Range header looks like `0-0/355` — the total is what we care about.
    const range = res.headers.get('content-range') || '';
    const rows = Number(range.split('/').pop() || 0);
    return NextResponse.json({
      ok: true,
      rows,
      at: new Date().toISOString(),
      ms: Date.now() - started,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
        ms: Date.now() - started,
      },
      { status: 502 },
    );
  }
}
