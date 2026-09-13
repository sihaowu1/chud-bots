import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  if (path.length > 1 || (path[0] && !/^[a-f0-9]{32}$/.test(path[0]))) {
    return NextResponse.json(
      { detail: "Unknown analytics route" },
      { status: 404 },
    );
  }
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !== request.nextUrl.origin
  ) {
    return NextResponse.json(
      { detail: "Invalid request origin" },
      { status: 403 },
    );
  }
  try {
    const upstream = await fetch(
      `${process.env.ANALYTICS_BACKEND_URL ?? "http://127.0.0.1:8001"}/api/analytics${path.length ? `/${path[0]}` : ""}`,
      {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: request.method === "POST" ? await request.text() : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      },
    );
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "Reddit discovery service is unavailable" },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
