import list from './bip39-wordlist.txt';
import landing from './babel.html';

const words = list.trim().split('\n');
const domains = ['minecat.net', 'lattices.net', 'lattices.org', 'ollvm.com', 'pkey.org', 'sad.pet', 'spleef.net'];

export default {
  fetch(request) {
    const url = new URL(request.url);
    const host = url.hostname;
    const domain = domains.find(domain => host === domain || host.endsWith('.' + domain));
    if (!domain) return new Response('Not found', { status: 404 });
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });

    if (url.pathname === '/robots.txt') {
      const robots = host === domain
        ? 'User-agent: *\nAllow: /\nSitemap: https://minecat.net/sitemap.xml\n'
        : 'User-agent: *\nAllow: /b/\nDisallow: /\n';
      return new Response(request.method === 'HEAD' ? null : robots, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    if (host === domain && url.pathname === '/babel') {
      return new Response(request.method === 'HEAD' ? null : landing, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    function random(length, alphabet) {
      return Array.from(crypto.getRandomValues(new Uint8Array(length)),
        value => alphabet[value % alphabet.length]).join('');
    }

    const targets = [...domains];
    for (let index = targets.length - 1; index > 0; index--) {
      const pick = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
      [targets[index], targets[pick]] = [targets[pick], targets[index]];
    }
    const links = targets.map((target, index) => {
      const host = random(63, 'abcdefghijklmnopqrstuvwxyz0123456789');
      const prefix = `https://${host}.${target}/b/`;
      const path = random(16384 - prefix.length, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
      return `<a href="${prefix}${path}" rel="nofollow"><img src="https://www.google.com/s2/favicons?domain=${target}&amp;sz=32" alt="" width="16" height="16">Page ${index + 1}</a>`;
    }).join('\n');
    const text = Array.from(crypto.getRandomValues(new Uint16Array(4096)), value => words[value & 2047]) .join('<span class="space"> </span>');
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Babel — generated page</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
      body {
        margin: 1rem;
        background: #fff;
        color: #000;
        font: clamp(12px, 3vw, 16px)/1.4 Arial, sans-serif;
      }

      main {
        color: #fff;
      }

      .space {
        background: #000;
        white-space: pre;
      }

      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      a {
        color: inherit;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }
    </style>
  </head>
  <body>
    <nav>${links}</nav>
    <main>${text}</main>
  </body>
</html>`;
    return new Response(request.method === 'HEAD' ? null : html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
    });
  }
};
