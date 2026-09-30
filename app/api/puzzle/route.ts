// 리체스 일일 퍼즐 프록시 (CORS 회피)
export async function GET() {
  try {
    const res = await fetch('https://lichess.org/api/puzzle/daily', {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return Response.json({ error: 'puzzle fetch failed' }, { status: 502 });
    }
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ error: 'puzzle fetch failed' }, { status: 502 });
  }
}
