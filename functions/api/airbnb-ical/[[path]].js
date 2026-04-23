export async function onRequestGet(context) {
  try {
    const reqUrl = new URL(context.request.url);
    const rawPath = context.params.path;
    const path = Array.isArray(rawPath) ? rawPath.join('/') : rawPath || '';

    if (!path) {
      return new Response('Missing iCal path', { status: 400 });
    }

    const targetUrl = `https://www.airbnb.com/calendar/ical/${path}${reqUrl.search}`;

    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/calendar,text/plain,*/*',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });

    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return new Response(`Proxy error: ${error?.message || 'Unknown error'}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  }
}
