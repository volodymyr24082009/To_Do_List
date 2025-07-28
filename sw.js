const CACHE_NAME = "todolist-v1.2.0";
const STATIC_CACHE = "todolist-static-v1.2.0";
const DYNAMIC_CACHE = "todolist-dynamic-v1.2.0";

// Файли для кешування
const STATIC_FILES = [
  "/",
  "/index.html",
  "/auth.html",
  "/profile.html",
  "/css/index.css",
  "/css/auth.css",
  "/css/profile.css",
  "/js/index.js",
  "/js/auth.js",
  "/js/profile.js",
  "/js/pwa.js",
  "/manifest.json",
  "/offline.html",
];

// API ендпоінти для кешування
const API_ENDPOINTS = [
  "/api/user/tasks",
  "/api/user/profile",
  "/api/user/statistics",
];

// Встановлення Service Worker
self.addEventListener("install", (event) => {
  console.log("🔧 Service Worker встановлюється...");

  event.waitUntil(
    Promise.all([
      // Кешування статичних файлів
      caches.open(STATIC_CACHE).then((cache) => {
        console.log("📦 Кешування статичних файлів...");
        return cache.addAll(STATIC_FILES);
      }),

      // Пропуск очікування
      self.skipWaiting(),
    ])
  );
});

// Активація Service Worker
self.addEventListener("activate", (event) => {
  console.log("✅ Service Worker активується...");

  event.waitUntil(
    Promise.all([
      // Очищення старих кешів
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (
              cacheName !== STATIC_CACHE &&
              cacheName !== DYNAMIC_CACHE &&
              cacheName !== CACHE_NAME
            ) {
              console.log("🗑️ Видалення старого кешу:", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),

      // Захоплення всіх клієнтів
      self.clients.claim(),
    ])
  );
});

// Перехоплення запитів
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ігнорування запитів до інших доменів
  if (url.origin !== location.origin) {
    return;
  }

  // Стратегія для різних типів запитів
  if (request.method === "GET") {
    if (isStaticAsset(request.url)) {
      // Cache First для статичних файлів
      event.respondWith(cacheFirst(request));
    } else if (isAPIRequest(request.url)) {
      // Network First для API запитів
      event.respondWith(networkFirst(request));
    } else {
      // Stale While Revalidate для HTML сторінок
      event.respondWith(staleWhileRevalidate(request));
    }
  } else {
    // Network Only для POST/PUT/DELETE запитів
    event.respondWith(networkOnly(request));
  }
});

// Стратегія Cache First
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error("Cache First помилка:", error);
    return await caches.match("/offline.html");
  }
}

// Стратегія Network First
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log("🌐 Мережа недоступна, використовуємо кеш для:", request.url);

    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Повернення офлайн відповіді для API
    if (isAPIRequest(request.url)) {
      return new Response(
        JSON.stringify({
          error: "Офлайн режим",
          offline: true,
          data: await getOfflineData(request.url),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return await caches.match("/offline.html");
  }
}

// Стратегія Stale While Revalidate
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}

// Стратегія Network Only
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (error) {
    // Для POST запитів зберігаємо в IndexedDB для пізнішої синхронізації
    if (request.method === "POST") {
      await saveForBackgroundSync(request);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Збережено для синхронізації",
          offline: true,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    throw error;
  }
}

// Допоміжні функції
function isStaticAsset(url) {
  return (
    url.includes("/css/") ||
    url.includes("/js/") ||
    url.includes("/uploads/") ||
    url.endsWith(".css") ||
    url.endsWith(".js") ||
    url.endsWith(".png") ||
    url.endsWith(".jpg") ||
    url.endsWith(".svg")
  );
}

function isAPIRequest(url) {
  return url.includes("/api/");
}

async function getOfflineData(url) {
  // Повернення збережених даних з IndexedDB
  if (url.includes("/api/user/tasks")) {
    return await getOfflineTasks();
  }

  if (url.includes("/api/user/profile")) {
    return await getOfflineProfile();
  }

  return [];
}

async function getOfflineTasks() {
  try {
    const db = await openDB();
    const transaction = db.transaction(["tasks"], "readonly");
    const store = transaction.objectStore("tasks");
    const tasks = await store.getAll();
    return tasks || [];
  } catch (error) {
    console.error("Помилка отримання офлайн завдань:", error);
    return [];
  }
}

async function getOfflineProfile() {
  try {
    const db = await openDB();
    const transaction = db.transaction(["profile"], "readonly");
    const store = transaction.objectStore("profile");
    const profile = await store.get("current");
    return profile || {};
  } catch (error) {
    console.error("Помилка отримання офлайн профілю:", error);
    return {};
  }
}

async function saveForBackgroundSync(request) {
  try {
    const db = await openDB();
    const transaction = db.transaction(["sync"], "readwrite");
    const store = transaction.objectStore("sync");

    const syncData = {
      id: Date.now(),
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: await request.text(),
      timestamp: Date.now(),
    };

    await store.add(syncData);

    // Реєстрація фонової синхронізації
    if (
      "serviceWorker" in navigator &&
      "sync" in window.ServiceWorkerRegistration.prototype
    ) {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register("background-sync");
    }
  } catch (error) {
    console.error("Помилка збереження для синхронізації:", error);
  }
}

// IndexedDB для офлайн зберігання
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("TodoListDB", 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Створення сховищ
      if (!db.objectStoreNames.contains("tasks")) {
        db.createObjectStore("tasks", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("profile")) {
        db.createObjectStore("profile", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("sync")) {
        db.createObjectStore("sync", { keyPath: "id" });
      }
    };
  });
}

// Фонова синхронізація
self.addEventListener("sync", (event) => {
  console.log("🔄 Фонова синхронізація:", event.tag);

  if (event.tag === "background-sync") {
    event.waitUntil(performBackgroundSync());
  }
});

async function performBackgroundSync() {
  try {
    const db = await openDB();
    const transaction = db.transaction(["sync"], "readwrite");
    const store = transaction.objectStore("sync");
    const syncItems = await store.getAll();

    for (const item of syncItems) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body,
        });

        if (response.ok) {
          await store.delete(item.id);
          console.log("✅ Синхронізовано:", item.url);
        }
      } catch (error) {
        console.error("❌ Помилка синхронізації:", error);
      }
    }
  } catch (error) {
    console.error("Помилка фонової синхронізації:", error);
  }
}

// Push сповіщення
self.addEventListener("push", (event) => {
  console.log("📬 Отримано push сповіщення");

  const options = {
    body: "У вас є нові завдання для виконання!",
    icon: "/placeholder.svg?height=192&width=192&text=📝",
    badge: "/placeholder.svg?height=72&width=72&text=📝",
    vibrate: [200, 100, 200],
    data: {
      url: "/index.html",
    },
    actions: [
      {
        action: "view",
        title: "Переглянути",
        icon: "/placeholder.svg?height=32&width=32&text=👁️",
      },
      {
        action: "dismiss",
        title: "Закрити",
        icon: "/placeholder.svg?height=32&width=32&text=❌",
      },
    ],
  };

  if (event.data) {
    const data = event.data.json();
    options.body = data.body || options.body;
    options.data = { ...options.data, ...data };
  }

  event.waitUntil(self.registration.showNotification("TO DO LIST", options));
});

// Обробка кліків по сповіщенням
self.addEventListener("notificationclick", (event) => {
  console.log("🔔 Клік по сповіщенню:", event.action);

  event.notification.close();

  if (event.action === "view" || !event.action) {
    const url = event.notification.data?.url || "/index.html";

    event.waitUntil(
      clients.matchAll({ type: "window" }).then((clientList) => {
        // Пошук існуючого вікна
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }

        // Відкриття нового вікна
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});

// Обробка помилок
self.addEventListener("error", (event) => {
  console.error("Service Worker помилка:", event.error);
});

self.addEventListener("unhandledrejection", (event) => {
  console.error("Service Worker необроблена помилка:", event.reason);
});

console.log("🚀 Service Worker завантажено успішно!");
