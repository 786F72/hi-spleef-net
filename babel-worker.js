import list from './bip39-wordlist.txt';
import landing from './babel.html';

const words = list.trim().split('\n');
const domains = ['minecat.net', 'lattices.net', 'lattices.org', 'ollvm.com', 'pkey.org', 'sad.pet', 'spleef.net'];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const host = url.hostname;
    const domain = domains.find(domain => host === domain || host.endsWith('.' + domain));
    if (!domain) return new Response('Not found', { status: 404 });
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });

    if (url.pathname === '/robots.txt') {
      const robots = host === domain
        ? 'User-agent: *\nAllow: /\nSitemap: https://minecat.net/sitemap.xml\n'
        : 'User-agent: *\nAllow: /b\nDisallow: /\n';
      return new Response(request.method === 'HEAD' ? null : robots, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    if (host === domain && url.pathname === '/about/babel') {
      return new Response(request.method === 'HEAD' ? null : landing, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (url.pathname === '/b' || url.pathname.startsWith('/b/')) {
      url.pathname = '/babel' + url.pathname.slice(2);
      return new Response(null, {
        status: 301,
        headers: { Location: url.href, 'X-Robots-Tag': 'noindex, nofollow' }
      });
    }

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url.href));
    const seed = new DataView(digest);
    let a = seed.getUint32(0);
    let b = seed.getUint32(4);
    let c = seed.getUint32(8);
    let d = seed.getUint32(12);

    function next() {
      const value = (a + b + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = ((c << 21) | (c >>> 11)) + value | 0;
      return value >>> 0;
    }

    function random(length, alphabet) {
      return Array.from({ length }, () => alphabet[next() % alphabet.length]).join('');
    }

    const targets = [...domains];
    for (let index = targets.length - 1; index > 0; index--) {
      const pick = next() % (index + 1);
      [targets[index], targets[pick]] = [targets[pick], targets[index]];
    }
    const destinations = targets.map(target => {
      const host = random(63, 'abcdefghijklmnopqrstuvwxyz0123456789');
      const prefix = `https://${host}.${target}/babel/`;
      return prefix + random(16384 - prefix.length, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
    });
    const text = Array.from({ length: 4096 }, (_, index) => {
      const word = words[next() & 2047];
      const shade = index % 2 ? ' shade' : '';
      return `<a class="word${shade}" data-page="${index % 7}" rel="nofollow">${word}</a>`;
    }).join('<span class="space"> </span><wbr>');
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Babel — generated page</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
      body {
        margin: 1rem 1rem 1rem 0;
        background: #fff;
        color: #000;
        font: clamp(12px, 3vw, 16px)/1.4 Arial, sans-serif;
      }

      main {
        color: #fff;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      .word {
        color: inherit;
        text-decoration: none;
        cursor: default;
      }

      .shade {
        background: #efefef;
        color: #efefef;
      }

      .space {
        background: #000;
        white-space: pre;
      }

    </style>
  </head>
  <body>
    <main>${text}</main>
    <script>
      const destinations = ${JSON.stringify(destinations)};
      for (const link of document.querySelectorAll('main a')) {
        link.href = destinations[Number(link.dataset.page)];
      }
    </script>
  </body>
</html>`;
    return new Response(request.method === 'HEAD' ? null : html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
    });
  }
};
