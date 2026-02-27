document.addEventListener('DOMContentLoaded', () => {
  const proxyInput = document.getElementById('proxyString');
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');
  const errorDiv = document.getElementById('error');
  const infoPanel = document.getElementById('info-panel');

  // Загружаем сохранённые данные
  chrome.storage.local.get(['proxyString', 'proxyActive'], (result) => {
    if (result.proxyString) proxyInput.value = result.proxyString;
    updateStatus(result.proxyActive);
    showInfoPanel(); // показываем всегда — и с прокси, и без
  });

  connectBtn.addEventListener('click', () => {
    const proxyStr = proxyInput.value.trim();
    errorDiv.style.display = 'none';

    if (!proxyStr) { showError('Введите строку прокси'); return; }

    try {
      const parsed = parseProxyString(proxyStr);
      if (!parsed) throw new Error('Некорректный формат');

      const { scheme, host, port, username, password } = parsed;

      const config = {
        mode: "fixed_servers",
        rules: {
          singleProxy: { scheme, host, port },
          bypassList: ["localhost", "127.0.0.1"]
        }
      };

      connectBtn.disabled = true;

      chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
        const proxyAuth = (username && password) ? { username, password } : null;
        chrome.storage.local.set({ proxyActive: true, proxyString: proxyStr, proxyAuth }, () => {
          updateStatus(true);
          connectBtn.disabled = false;
          showInfoPanel();
        });
      });

    } catch (e) {
      showError('Неверный формат. Примеры:\nhttp://user:pass@ip:port\nhttp://ip:port:user:pass\nip:port:user:pass\nip:port');
    }
  });

  disconnectBtn.addEventListener('click', () => {
    chrome.proxy.settings.clear({ scope: 'regular' }, () => {
      chrome.storage.local.set({ proxyActive: false }, () => {
        updateStatus(false);
        showInfoPanel(); // обновляем данные — теперь без прокси
      });
    });
  });

  // ── Парсинг прокси ────────────────────────────────────────────────────────
  // Поддерживаемые форматы:
  //   1. http://user:pass@ip:port      (стандартный URL)
  //   2. socks5://user:pass@ip:port    (SOCKS через URL)
  //   3. http://ip:port:user:pass      (схема://ip:port:user:pass)
  //   4. ip:port:user:pass             (без схемы, с авторизацией)
  //   5. ip:port                        (без схемы и авторизации)
  function parseProxyString(raw) {
    raw = raw.trim();

    // Определяем схему и тело
    let scheme = 'http';
    let body = raw;

    const schemeMatch = raw.match(/^(https?|socks5?):\/\//i);
    if (schemeMatch) {
      scheme = schemeMatch[1].toLowerCase();
      body = raw.slice(schemeMatch[0].length);
    }

    // Проверяем стандартный URL-формат: user:pass@host:port
    if (body.includes('@')) {
      try {
        const url = new URL(schemeMatch ? raw : 'http://' + body);
        const host = url.hostname;
        const port = parseInt(url.port) || (scheme === 'https' ? 443 : 80);
        const username = decodeURIComponent(url.username);
        const password = decodeURIComponent(url.password);
        if (!host) return null;
        return { scheme, host, port, username, password };
      } catch { return null; }
    }

    // Нестандартный формат: разбиваем по ':'
    // body может быть: ip:port, ip:port:user:pass
    const parts = body.split(':');

    // ip:port
    if (parts.length === 2) {
      const host = parts[0];
      const port = parseInt(parts[1]);
      if (!host || isNaN(port)) return null;
      return { scheme, host, port, username: '', password: '' };
    }

    // ip:port:user:pass
    if (parts.length === 4) {
      const host = parts[0];
      const port = parseInt(parts[1]);
      const username = parts[2];
      const password = parts[3];
      if (!host || isNaN(port)) return null;
      return { scheme, host, port, username, password };
    }

    return null;
  }

  function updateStatus(isActive) {
    statusText.textContent = isActive ? 'Подключён' : 'Отключён';
    statusDot.className = 'dot ' + (isActive ? 'active' : 'inactive');
  }

  function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.style.display = 'block';
  }

  // ── IP Info Panel ──────────────────────────────────
  function showInfoPanel() {
    infoPanel.style.display = 'block';
    resetGeo();
    fetchIP();
    pingSites();
  }

  function resetGeo() {
    ['ip-val', 'g-country', 'g-city', 'g-region', 'g-tz'].forEach(id => {
      const el = document.getElementById(id);
      el.textContent = '···';
      el.className = el.className.replace('empty', '') + (id === 'ip-val' ? ' loading' : ' empty');
    });
    ['p0', 'p1', 'p2', 'p3'].forEach(id => {
      document.getElementById(id).className = 'ping-chip';
    });
  }

  function fetchIP() {
    const xhr = new XMLHttpRequest();
    xhr.timeout = 10000;
    xhr.open('GET', 'http://www.ixbrowser.com/api/ip-api');
    xhr.onload = () => {
      const ipEl = document.getElementById('ip-val');
      ipEl.classList.remove('loading');
      if (xhr.status === 200) {
        try {
          const d = JSON.parse(xhr.response);
          ipEl.textContent = d.query || '—';

          const set = (id, val) => {
            const el = document.getElementById(id);
            el.textContent = val || '—';
            el.className = 'g-val' + (val ? '' : ' empty');
          };
          set('g-country', d.country);
          set('g-city', d.city);
          set('g-region', d.regionName);
          set('g-tz', d.timezone);
        } catch (e) { ipEl.textContent = 'Ошибка'; }
      } else {
        ipEl.textContent = 'Ошибка';
      }
    };
    xhr.onerror = () => {
      const ipEl = document.getElementById('ip-val');
      ipEl.classList.remove('loading');
      ipEl.textContent = 'Ошибка';
    };
    xhr.send();
  }

  function pingSites() {
    const sites = [
      { id: 'p0', url: 'https://www.google.com/' },
      { id: 'p1', url: 'https://www.amazon.com/' },
      { id: 'p2', url: 'https://yandex.com/' },
      { id: 'p3', url: 'https://www.tiktok.com/' },
    ];
    sites.forEach(({ id, url }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      fetch(url, { mode: 'no-cors', signal: controller.signal })
        .then(() => {
          clearTimeout(timer);
          document.getElementById(id).className = 'ping-chip ok';
        })
        .catch(() => {
          clearTimeout(timer);
          document.getElementById(id).className = 'ping-chip fail';
        });
    });
  }
});
