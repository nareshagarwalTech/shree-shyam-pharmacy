import { NextResponse } from 'next/server';

/**
 * POST /api/login
 *
 * Body: { password: string, tier?: 'staff' | 'manager' }
 *
 * Compares the supplied password against either APP_PASSWORD (staff, default)
 * or MANAGER_PASSWORD (manager tier) on the server. Both passwords live in
 * non-NEXT_PUBLIC env vars and are NOT shipped in the JS bundle.
 *
 * This is a single-pharmacy app with two shared passwords (staff + manager).
 * Not a multi-tenant identity system. No rate limiting; relies on HTTPS +
 * platform edge protections.
 */
export async function POST(req: Request) {
  let body: { password?: string; tier?: 'staff' | 'manager' } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  }

  const tier = body.tier === 'manager' ? 'manager' : 'staff';
  const envVar = tier === 'manager' ? 'MANAGER_PASSWORD' : 'APP_PASSWORD';
  const expected = process.env[envVar];

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: `Server is missing ${envVar} env var` },
      { status: 500 },
    );
  }

  if (typeof body.password !== 'string' || body.password !== expected) {
    return NextResponse.json({ ok: false, error: 'Incorrect password' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, tier });
}
