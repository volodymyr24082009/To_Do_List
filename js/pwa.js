class PWAManager {
  constructor() {
    this.deferredPrompt = null
    this.isInstalled = false
    this.isOnline = navigator.onLine
    this.syncQueue = []

    this.init()
  }

  async init() {
    console.log("🚀 Ініціалізація PWA Manager...")

    // Реєстрація Service Worker
    await this.registerServiceWorker()

    // Налаштування подій
    this.setupEventListeners()

    // Перевірка можливості встановлення
    this.checkInstallability()

    // Ініціалізація push сповіщень
    await this.initializePushNotifications()

    // Налаштування офлайн функціональності
    this.setupOfflineHandling()

    // Обробка URL параметрів
    this.handleURLParams()

    console.log("✅ PWA Manager ініціалізовано")
  }

  async registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js")
        console.log("✅ Service Worker зареєстровано:", registration.scope)

        // Перевірка оновлень
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              this.showUpdateNotification()
            }
          })
        })

        return registration
      } catch (error) {
        console.error("❌ Помилка реєстрації Service Worker:", error)
      }
    }
  }

  setupEventListeners() {
    // Подія встановлення PWA
    window.addEventListener("beforeinstallprompt", (e) => {
      console.log("💾 PWA готове до встановлення")
      e.preventDefault()
      this.deferredPrompt = e
      this.showInstallButton()
    })

    // Подія після встановлення
    window.addEventListener("appinstalled", () => {
      console.log("🎉 PWA встановлено!")
      this.isInstalled = true
      this.hideInstallButton()
      this.showNotification("Додаток успішно встановлено!", "success")
    })

    // Статус підключення
    window.addEventListener("online", () => {
      console.log("🌐 Підключення відновлено")
      this.isOnline = true
      this.showNotification("Підключення відновлено", "success")
      this.syncOfflineData()
    })

    window.addEventListener("offline", () => {
      console.log("📱 Перехід в офлайн режим")
      this.isOnline = false
      this.showNotification("Працюємо в офлайн режимі", "info")
    })

    // Обробка помилок
    window.addEventListener("error", (e) => {
      console.error("Глобальна помилка:", e.error)
    })

    window.addEventListener("unhandledrejection", (e) => {
      console.error("Необроблена помилка Promise:", e.reason)
    })
  }

  checkInstallability() {
    // Перевірка чи додаток вже встановлено
    if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true) {
      this.isInstalled = true
      console.log("📱 Додаток запущено як PWA")
    }

    // Показ кнопки встановлення для підтримуваних браузерів
    if (!this.isInstalled && this.isPWASupported()) {
      setTimeout(() => {
        if (!this.deferredPrompt) {
          this.showInstallPromotion()
        }
      }, 10000) // Показати через 10 секунд
    }
  }

  isPWASupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  }

  showInstallButton() {
    let installButton = document.getElementById("installButton")

    if (!installButton) {
      installButton = document.createElement("button")
      installButton.id = "installButton"
      installButton.className = "install-button"
      installButton.innerHTML = "📱 Встановити додаток"
      installButton.onclick = () => this.installPWA()

      // Додавання кнопки до header
      const header = document.querySelector(".header")
      if (header) {
        header.appendChild(installButton)
      }
    }

    installButton.style.display = "block"
  }

  hideInstallButton() {
    const installButton = document.getElementById("installButton")
    if (installButton) {
      installButton.style.display = "none"
    }
  }

  async installPWA() {
    if (!this.deferredPrompt) {
      this.showNotification("Встановлення недоступне", "error")
      return
    }

    try {
      this.deferredPrompt.prompt()
      const { outcome } = await this.deferredPrompt.userChoice

      if (outcome === "accepted") {
        console.log("✅ Користувач погодився встановити PWA")
      } else {
        console.log("❌ Користувач відхилив встановлення PWA")
      }

      this.deferredPrompt = null
      this.hideInstallButton()
    } catch (error) {
      console.error("Помилка встановлення PWA:", error)
      this.showNotification("Помилка встановлення", "error")
    }
  }

  showInstallPromotion() {
    const promotion = document.createElement("div")
    promotion.className = "install-promotion"
    promotion.innerHTML = `
      <div class="promotion-content">
        <div class="promotion-icon">📱</div>
        <div class="promotion-text">
          <h3>Встановити TO DO LIST</h3>
          <p>Отримайте швидкий доступ та працюйте офлайн</p>
        </div>
        <div class="promotion-actions">
          <button class="btn btn-primary" onclick="pwaManager.installPWA()">
            Встановити
          </button>
          <button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">
            Пізніше
          </button>
        </div>
      </div>
    `

    document.body.appendChild(promotion)

    // Автоматичне приховування через 30 секунд
    setTimeout(() => {
      if (promotion.parentElement) {
        promotion.remove()
      }
    }, 30000)
  }

  async initializePushNotifications() {
    if (!("Notification" in window) || !("PushManager" in window)) {
      console.log("❌ Push сповіщення не підтримуються")
      return
    }

    try {
      const permission = await Notification.requestPermission()

      if (permission === "granted") {
        console.log("✅ Дозвіл на сповіщення отримано")
        await this.subscribeToPush()
      } else {
        console.log("❌ Дозвіл на сповіщення відхилено")
      }
    } catch (error) {
      console.error("Помилка ініціалізації push сповіщень:", error)
    }
  }

  async subscribeToPush() {
    try {
      const registration = await navigator.serviceWorker.ready

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(
          "BEl62iUYgUivxIkv69yViEuiBIa40HI80YmqRcU", // Замініть на ваш VAPID ключ
        ),
      })

      console.log("✅ Підписка на push сповіщення:", subscription)

      // Відправка підписки на сервер
      await this.sendSubscriptionToServer(subscription)
    } catch (error) {
      console.error("Помилка підписки на push:", error)
    }
  }

  urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  async sendSubscriptionToServer(subscription) {
    try {
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
        body: JSON.stringify(subscription),
      })

      if (response.ok) {
        console.log("✅ Підписка відправлена на сервер")
      }
    } catch (error) {
      console.error("Помилка відправки підписки:", error)
    }
  }

  setupOfflineHandling() {
    // Перехоплення fetch запитів для офлайн обробки
    const originalFetch = window.fetch

    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args)
        return response
      } catch (error) {
        if (!this.isOnline) {
          // Додавання до черги синхронізації
          this.addToSyncQueue(args[0], args[1])

          // Повернення кешованих даних
          return this.getOfflineResponse(args[0])
        }
        throw error
      }
    }
  }

  addToSyncQueue(url, options) {
    this.syncQueue.push({
      url,
      options,
      timestamp: Date.now(),
    })

    // Збереження в localStorage
    localStorage.setItem("pwa_sync_queue", JSON.stringify(this.syncQueue))
  }

  async syncOfflineData() {
    const savedQueue = localStorage.getItem("pwa_sync_queue")
    if (savedQueue) {
      this.syncQueue = JSON.parse(savedQueue)
    }

    for (const item of this.syncQueue) {
      try {
        await fetch(item.url, item.options)
        console.log("✅ Синхронізовано:", item.url)
      } catch (error) {
        console.error("❌ Помилка синхронізації:", error)
      }
    }

    // Очищення черги після синхронізації
    this.syncQueue = []
    localStorage.removeItem("pwa_sync_queue")
  }

  async getOfflineResponse(url) {
    // Повернення кешованих даних або заглушки
    if (url.includes("/api/user/tasks")) {
      const cachedTasks = localStorage.getItem("cached_tasks")
      return new Response(cachedTasks || "[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ offline: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  handleURLParams() {
    const urlParams = new URLSearchParams(window.location.search)

    // Обробка швидких дій
    if (urlParams.get("action") === "add-task") {
      setTimeout(() => {
        const taskInput = document.getElementById("taskInput")
        if (taskInput) {
          taskInput.focus()
        }
      }, 1000)
    }

    if (urlParams.get("filter")) {
      const filter = urlParams.get("filter")
      setTimeout(() => {
        const filterBtn = document.querySelector(`[data-filter="${filter}"]`)
        if (filterBtn) {
          filterBtn.click()
        }
      }, 1000)
    }
  }

  showUpdateNotification() {
    const notification = document.createElement("div")
    notification.className = "update-notification"
    notification.innerHTML = `
      <div class="update-content">
        <span>🔄 Доступне оновлення додатку</span>
        <button onclick="window.location.reload()" class="btn btn-primary">
          Оновити
        </button>
      </div>
    `

    document.body.appendChild(notification)

    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove()
      }
    }, 10000)
  }

  showNotification(message, type = "info") {
    // Використання існуючої системи сповіщень
    if (window.todoApp && window.todoApp.showNotification) {
      window.todoApp.showNotification(message, type)
    } else if (window.authManager && window.authManager.showNotification) {
      window.authManager.showNotification(message, type)
    } else if (window.profileManager && window.profileManager.showNotification) {
      window.profileManager.showNotification(message, type)
    } else {
      console.log(`${type.toUpperCase()}: ${message}`)
    }
  }

  // Методи для роботи з даними
  async cacheUserData(data, key) {
    try {
      localStorage.setItem(`cached_${key}`, JSON.stringify(data))

      // Також зберігаємо в IndexedDB через Service Worker
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready
        registration.active.postMessage({
          type: "CACHE_DATA",
          key,
          data,
        })
      }
    } catch (error) {
      console.error("Помилка кешування даних:", error)
    }
  }

  getCachedUserData(key) {
    try {
      const cached = localStorage.getItem(`cached_${key}`)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.error("Помилка отримання кешованих даних:", error)
      return null
    }
  }

  // Аналітика використання PWA
  trackPWAUsage() {
    const usage = {
      isInstalled: this.isInstalled,
      isOnline: this.isOnline,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      displayMode: window.matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser",
    }

    console.log("📊 PWA Usage:", usage)

    // Відправка аналітики на сервер (якщо потрібно)
    if (this.isOnline) {
      fetch("/api/analytics/pwa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(usage),
      }).catch(() => {}) // Ігноруємо помилки аналітики
    }
  }
}

// Ініціалізація PWA Manager
let pwaManager

document.addEventListener("DOMContentLoaded", () => {
  pwaManager = new PWAManager()

  // Відстеження використання
  setTimeout(() => {
    pwaManager.trackPWAUsage()
  }, 5000)
})

// Експорт для глобального доступу
window.pwaManager = pwaManager
