import landing from './babel.html';

const domains = ['minecat.net', 'lattices.net', 'lattices.org', 'ollvm.com', 'pkey.org', 'sad.pet', 'spleef.net'];

export default {
  async fetch(request, env, context) {
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

    if (url.pathname.startsWith('/babel/avatar/')) {
      const value = url.pathname.slice('/babel/avatar/'.length);
      const account = Number(value);
      if (!/^[1-9]\d{0,9}$/.test(value) || account > 4294967295)
        return new Response(null, { status: 404 });

      const key = new Request(`https://minecat.net/babel/avatar/${account}`);
      const cached = await caches.default.match(key);
      if (cached) return cached;

      for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = ((account + Math.imul(attempt, 0x9e3779b9)) >>> 0) || 1;
        const steam = 76561197960265728n + BigInt(candidate);
        let profile;
        try {
          profile = await fetch(`https://steamcommunity.com/profiles/${steam}/`, {
            signal: AbortSignal.timeout(6000)
          });
        } catch {
          return new Response(null, { status: 503, headers: { 'Retry-After': '60' } });
        }
        if (profile.status === 429 || profile.status >= 500)
          return new Response(null, { status: 503, headers: { 'Retry-After': '60' } });
        if (!profile.ok) continue;

        let avatar;
        await new HTMLRewriter().on('.playerAvatarAutoSizeInner img', {
          element(element) {
            avatar = element.getAttribute('src') || element.getAttribute('srcset')?.split(/[ ,]/)[0];
          }
        }).transform(profile).text();
        if (!avatar) continue;
        const image = new URL(avatar);
        if (!image.hostname.endsWith('.steamstatic.com') && !image.hostname.endsWith('.steamusercontent.com')) continue;

        const response = new Response(null, {
          status: 302,
          headers: {
            Location: image.href,
            'Cache-Control': 'public, max-age=86400',
            'X-Robots-Tag': 'noindex, nofollow'
          }
        });
        context.waitUntil(caches.default.put(key, response.clone()));
        return response;
      }
      return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
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
    const tiles = Array.from({ length: 16 }, (_, index) => {
      const account = next() || 1;
      return `<a data-page="${index % 7}" rel="nofollow" aria-label="Next Babel page"><img data-avatar="${account}" alt="" width="119" height="119"></a>`;
    }).join('\n');
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>babel</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
      body {
        margin: 1.5rem;
        background: #fff;
        color: #000;
        font: clamp(12px, 3vw, 16px)/1.5 system-ui, sans-serif;
      }

      main {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.75rem;
        max-width: 32rem;
      }

      a {
        display: block;
        aspect-ratio: 1;
        background: #f2f2f2;
      }

      img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    </style>
  </head>
  <body>
    <main>${tiles}</main>
    <script>
      const destinations = ${JSON.stringify(destinations)};
      for (const link of document.querySelectorAll('main a')) {
        link.href = destinations[Number(link.dataset.page)];
      }

      const images = [...document.querySelectorAll('img[data-avatar]')];
      async function load() {
        while (images.length) {
          const image = images.shift();
          await new Promise(resolve => {
            image.onload = resolve;
            image.onerror = () => {
              image.parentElement.title = 'Avatar unavailable';
              image.remove();
              resolve();
            };
            image.src = '/babel/avatar/' + image.dataset.avatar;
          });
        }
      }
      for (let index = 0; index < 4; index++) load();
    </script>
  </body>
</html>`;
    return new Response(request.method === 'HEAD' ? null : html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
    });
  }
};
