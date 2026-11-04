import landing from './babel.html';

function unavailable(seconds) {
  return new Response(null, {
    status: 503,
    headers: { 'Retry-After': String(seconds), 'Cache-Control': 'no-store' }
  });
}

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
        : 'User-agent: *\nAllow: /avatar-rng\nDisallow: /\n';
      return new Response(request.method === 'HEAD' ? null : robots, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    if (host === domain && url.pathname === '/about/avatar-rng') {
      return new Response(request.method === 'HEAD' ? null : landing, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (url.pathname === '/about/babel' || url.pathname === '/babel' || url.pathname.startsWith('/babel/')) {
      url.pathname = url.pathname.replace('/babel', '/avatar-rng');
      return Response.redirect(url.href, 301);
    }

    if (url.pathname === '/avatar-rng/image') {
      let image;
      try {
        image = new URL(url.searchParams.get('url'));
      } catch {
        return new Response(null, { status: 400 });
      }
      if (image.protocol !== 'https:' || !image.hostname.startsWith('avatars.') ||
          (!image.hostname.endsWith('.steamstatic.com') && !image.hostname.endsWith('.steamusercontent.com')) ||
          image.port || image.username || image.password)
        return new Response(null, { status: 400 });

      let response;
      try {
        response = await fetch(image.href, {
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
          cf: { cacheEverything: true, cacheTtl: 604800 }
        });
      } catch {
        return new Response(null, { status: 502 });
      }
      if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/'))
        return new Response(null, { status: 502 });
      return new Response(request.method === 'HEAD' ? null : response.body, {
        headers: {
          'Content-Type': response.headers.get('Content-Type'),
          'Cache-Control': 'public, max-age=604800',
          'X-Robots-Tag': 'noindex, nofollow'
        }
      });
    }

    if (url.pathname.startsWith('/avatar-rng/avatar/')) {
      const value = url.pathname.slice('/avatar-rng/avatar/'.length);
      const account = Number(value);
      if (!/^[1-9]\d{0,9}$/.test(value) || account > 4294967295)
        return new Response(null, { status: 404 });

      const key = new Request(`https://minecat.net/babel/avatar/${account}?v=2`);
      const cached = await caches.default.match(key);
      if (cached) {
        const response = new Response(cached.body, cached);
        response.headers.set('X-Avatar-Cached', '1');
        return response;
      }

      const cooldownKey = new Request('https://minecat.net/babel/steam-cooldown');
      const cooldown = await caches.default.match(cooldownKey);
      const until = cooldown ? Number(await cooldown.text()) : 0;
      if (until > Date.now()) return unavailable(Math.ceil((until - Date.now()) / 1000));

      async function pause(seconds) {
        await caches.default.put(cooldownKey, new Response(String(Date.now() + seconds * 1000), {
          headers: { 'Cache-Control': `public, max-age=${seconds}` }
        }));
        return unavailable(seconds);
      }

      const steam = 76561197960265728n + BigInt(account);
      let profile;
      try {
        profile = await fetch(`https://steamcommunity.com/profiles/${steam}/`, {
          signal: AbortSignal.timeout(6000)
        });
      } catch {
        return pause(60);
      }
      if (profile.status === 403 || profile.status === 429 || profile.status >= 500) {
        const retry = profile.headers.get('Retry-After');
        const seconds = /^\d+$/.test(retry || '') ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000;
        return pause(Math.max(600, Math.ceil(seconds) || 0));
      }
      if (!profile.ok && profile.status !== 404) return pause(60);

      let avatar;
      if (profile.ok) {
        await new HTMLRewriter().on('.playerAvatarAutoSizeInner img', {
          element(element) {
            avatar = element.getAttribute('src') || element.getAttribute('srcset')?.split(/[ ,]/)[0];
          }
        }).transform(profile).text();
      }
      let image;
      try {
        image = new URL(avatar);
      } catch {}
      const valid = image?.protocol === 'https:' && (
        image.hostname.endsWith('.steamstatic.com') || image.hostname.endsWith('.steamusercontent.com')
      );
      const response = Response.json(valid ? { url: image.href } : {}, {
        status: valid ? 200 : 404,
        headers: {
          'Cache-Control': `public, max-age=${valid ? 604800 : 86400}`,
          'X-Robots-Tag': 'noindex, nofollow'
        }
      });
      await caches.default.put(key, response.clone());
      return response;
    }

    if (url.pathname === '/b' || url.pathname.startsWith('/b/')) {
      url.pathname = '/avatar-rng' + url.pathname.slice(2);
      return new Response(null, {
        status: 301,
        headers: { Location: url.href, 'X-Robots-Tag': 'noindex, nofollow' }
      });
    }

    const seedURL = new URL(url);
    seedURL.pathname = seedURL.pathname.replace(/^\/avatar-rng(?=\/|$)/, '/babel');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seedURL.href));
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

    const accountLimit = 1800000000;
    const ceiling = 0x100000000 - (0x100000000 % accountLimit);
    const tiles = Array.from({ length: 16 }, () => {
      let value;
      do {
        value = next();
      } while (value >= ceiling);
      const account = value % accountLimit + 1;
      const profile = 76561197960265728n + BigInt(account);
      return `<a href="https://steamcommunity.com/profiles/${profile}/" target="_blank" rel="nofollow noopener noreferrer" aria-label="Open Steam profile"><img data-avatar="${account}" alt="" width="119" height="119"></a>`;
    }).join('\n');
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>avatar-rng</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
      body {
        margin: 1.5rem;
        background: #fff;
        color: #000;
        font: clamp(12px, 3vw, 16px)/1.5 system-ui, sans-serif;
      }

      button {
        margin-bottom: 0.75rem;
        font: inherit;
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
    <button type="button" id="new">new</button>
    <main>${tiles}</main>
    <script>
      document.getElementById('new').addEventListener('click', () => {
        const seed = crypto.getRandomValues(new Uint8Array(16));
        const path = [...seed].map(value => value.toString(16).padStart(2, '0')).join('');
        location.assign('/avatar-rng/' + path);
      });

      const controller = new AbortController();
      const pictures = new Set();
      addEventListener('pagehide', () => {
        controller.abort();
        for (const picture of pictures) URL.revokeObjectURL(picture);
      });

      function show(image, blob) {
        const picture = URL.createObjectURL(blob);
        pictures.add(picture);
        image.onerror = () => image.remove();
        image.src = picture;
      }

      async function fetchPicture(image, url, cache, key) {
        try {
          const response = await fetch('/avatar-rng/image?url=' + encodeURIComponent(url), {
            signal: controller.signal
          });
          if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/')) {
            image.remove();
            return;
          }
          const blob = await response.blob();
          show(image, blob);
          if (cache) await cache.put(key, new Response(blob)).catch(() => {});
        } catch {
          image.remove();
        }
      }

      async function load() {
        const cache = await caches.open('babel-avatars-v1').catch(() => null);
        const images = [...document.querySelectorAll('img[data-avatar]')];
        const pending = await Promise.all(images.map(async image => {
          const key = '/babel/avatar/' + image.dataset.avatar;
          const saved = await cache?.match(key).catch(() => null);
          if (saved) {
            if (saved.status === 200) show(image, await saved.blob());
            else image.remove();
            return null;
          }
          return { image, key };
        }));
        const downloads = [];
        for (const tile of pending.filter(Boolean)) {
          if (controller.signal.aborted) break;
          const { image, key } = tile;
          const started = Date.now();
          try {
            if (cache) await cache.put(key, new Response(null, { status: 204 })).catch(() => {});
            const response = await fetch('/avatar-rng/avatar/' + image.dataset.avatar + '?v=2', { signal: controller.signal });
            if (response.status === 503 || response.status === 429) break;
            if (response.ok) {
              const avatar = await response.json();
              downloads.push(fetchPicture(image, avatar.url, cache, key));
            } else {
              image.remove();
            }
            if (response.headers.get('X-Avatar-Cached') !== '1') {
              const delay = Math.max(0, 1000 - (Date.now() - started));
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          } catch {
            break;
          }
        }
        await Promise.all(downloads);
      }
      load();
    </script>
  </body>
</html>`;
    return new Response(request.method === 'HEAD' ? null : html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
    });
  }
};
