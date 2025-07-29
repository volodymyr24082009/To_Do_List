class NavigationManager {
  constructor() {
    this.init();
  }

  init() {
    this.setActiveNavigation();
  }

  setActiveNavigation() {
    // Отримуємо поточний шлях сторінки
    const currentPath = window.location.pathname;
    const currentPage = currentPath.split("/").pop() || "index.html";

    // Знаходимо всі навігаційні посилання
    const navLinks = document.querySelectorAll(".nav-link");

    // Спочатку прибираємо клас active з усіх посилань
    navLinks.forEach((link) => {
      link.classList.remove("active");
    });

    // Визначаємо, який пункт меню має бути активним
    let activeLink = null;

    navLinks.forEach((link) => {
      const href = link.getAttribute("href");

      // Перевіряємо відповідність поточної сторінки
      if (
        href === currentPage ||
        (currentPage === "" && href === "index.html") ||
        (currentPage === "index.html" && href === "index.html") ||
        (currentPage === "profile.html" && href === "profile.html") ||
        (currentPage === "auth.html" && href === "auth.html")
      ) {
        activeLink = link;
      }
    });

    // Якщо знайшли відповідне посилання, додаємо клас active
    if (activeLink) {
      activeLink.classList.add("active");
    } else {
      // Якщо не знайшли точної відповідності, активуємо головну сторінку за замовчуванням
      const homeLink = document.querySelector('.nav-link[href="index.html"]');
      if (homeLink) {
        homeLink.classList.add("active");
      }
    }
  }

  // Метод для програмного встановлення активної навігації
  setActivePage(pageName) {
    const navLinks = document.querySelectorAll(".nav-link");

    navLinks.forEach((link) => {
      link.classList.remove("active");

      if (link.getAttribute("href") === pageName) {
        link.classList.add("active");
      }
    });
  }
}

// Ініціалізуємо навігацію після завантаження DOM
document.addEventListener("DOMContentLoaded", () => {
  window.navigationManager = new NavigationManager();
});

// Експортуємо для використання в інших скриптах
window.NavigationManager = NavigationManager;
