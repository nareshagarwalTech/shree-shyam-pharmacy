import { NextResponse } from 'next/server';

/**
 * POST /api/login
 *
 * Compares the supplied password against APP_PASSWORD on the server.
 * The password lives in a non-NEXT_PUBLIC env var, so it is not in
 * the JS bundle. Successful login sets a small JSON cookie that the
 * client uses for "am I logged in?" checks.
 *
 * This is a single-pharmacy app with one shared password — not a
 * multi-tenant identity system. There is no rate limiting; rely on
 * Vercel's edge protections + HTTPS.
 */
export async function POST(req: Request) {
  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  }

  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'Server is missing APP_PASSWORD env var' },
      { status: 500 },
    );
  }

  if (typeof body.password !== 'string' || body.password !== expected) {
    return NextResponse.json({ ok: false, error: 'Incorrect password' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
