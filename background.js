let proxyAuthCache = null;

// Инициализируем кэш при старте Service Worker-а
chrome.storage.local.get(['proxyAuth'], (result) => {
    if (result.proxyAuth) {
        proxyAuthCache = result.proxyAuth;
    }
});

// Обновляем кэш при изменении настроек прокси
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.proxyAuth) {
        proxyAuthCache = changes.proxyAuth.newValue || null;
    }
});

// Обработка авторизации прокси (MV3: только синхронный blocking)
chrome.webRequest.onAuthRequired.addListener(
    function (details) {
        if (!details.isProxy) return {};

        if (proxyAuthCache && proxyAuthCache.username) {
            return {
                authCredentials: {
                    username: proxyAuthCache.username,
                    password: proxyAuthCache.password
                }
            };
        }

        return {};
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
);
