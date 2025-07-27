class ProfileManager {
  constructor() {
    this.init();
  }

  init() {
    this.loadProfile();
    this.loadStats();
    this.bindEvents();
  }

  bindEvents() {
    // Форма профілю
    document.getElementById("profileForm").addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveProfile();
    });

    // Завантаження аватара
    document.getElementById("avatarInput").addEventListener("change", (e) => {
      this.handleAvatarUpload(e);
    });

    // Імпорт даних
    document.getElementById("importInput").addEventListener("change", (e) => {
      this.handleImport(e);
    });
  }

  loadProfile() {
    // Завантаження даних профілю з localStorage
    const profile = this.getStoredProfile();

    document.getElementById("userName").textContent = profile.name;
    document.getElementById("userEmail").textContent = profile.email;
    document.getElementById("registrationDate").textContent =
      profile.registrationDate;
    document.getElementById("userAvatar").src = profile.avatar;

    // Заповнення форми
    document.getElementById("profileName").value = profile.name;
    document.getElementById("profileEmail").value = profile.email;
  }

  loadStats() {
    const tasks = this.getTasks();
    const total = tasks.length;
    const completed = tasks.filter((task) => task.completed).length;
    const completionRate =
      total > 0 ? Math.round((completed / total) * 100) : 0;

    document.getElementById("profileTotalTasks").textContent = total;
    document.getElementById("profileCompletedTasks").textContent = completed;
    document.getElementById(
      "completionRate"
    ).textContent = `${completionRate}%`;
  }

  saveProfile() {
    const name = document.getElementById("profileName").value.trim();
    const email = document.getElementById("profileEmail").value.trim();

    if (!name || !email) {
      this.showNotification("Заповніть всі поля", "error");
      return;
    }

    if (!this.isValidEmail(email)) {
      this.showNotification("Введіть коректний email", "error");
      return;
    }

    const profile = this.getStoredProfile();
    profile.name = name;
    profile.email = email;

    this.saveStoredProfile(profile);
    this.loadProfile();
    this.showNotification("Профіль оновлено успішно!", "success");
  }

  handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Перевірка типу файлу
    if (!file.type.startsWith("image/")) {
      this.showNotification("Оберіть файл зображення", "error");
      return;
    }

    // Перевірка розміру файлу (максимум 5MB)
    if (file.size > 5 * 1024 * 1024) {
      this.showNotification("Файл занадто великий (максимум 5MB)", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const avatarUrl = e.target.result;

      // Оновлення аватара в профілі
      const profile = this.getStoredProfile();
      profile.avatar = avatarUrl;
      this.saveStoredProfile(profile);

      // Оновлення відображення
      document.getElementById("userAvatar").src = avatarUrl;
      this.showNotification("Аватар оновлено!", "success");
    };

    reader.readAsDataURL(file);
  }

  handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let importedData;

        if (file.type === "application/json") {
          importedData = JSON.parse(e.target.result);
          this.importFromJSON(importedData);
        } else if (file.type === "text/csv") {
          this.importFromCSV(e.target.result);
        } else {
          this.showNotification("Непідтримуваний формат файлу", "error");
          return;
        }

        this.loadStats();
        this.showNotification("Дані імпортовано успішно!", "success");
      } catch (error) {
        console.error("Помилка імпорту:", error);
        this.showNotification("Помилка обробки файлу", "error");
      }
    };

    reader.readAsText(file);
    event.target.value = ""; // Очищення input
  }

  importFromJSON(data) {
    if (data.tasks && Array.isArray(data.tasks)) {
      const existingTasks = this.getTasks();
      const mergedTasks = [...existingTasks, ...data.tasks];
      localStorage.setItem("todoTasks", JSON.stringify(mergedTasks));
    }
  }

  importFromCSV(csvText) {
    const lines = csvText.split("\n");
    const tasks = [];

    // Пропускаємо заголовок
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = this.parseCSVLine(line);
      if (values.length >= 6) {
        const task = {
          id: Date.now() + Math.random(),
          name: values[0],
          description: values[1] || "",
          deadline: values[2] || null,
          priority: values[3] || "medium",
          tags: values[4] ? values[4].split("; ") : [],
          completed: values[5] === "Так",
          createdAt: values[6] || new Date().toISOString(),
        };
        tasks.push(task);
      }
    }

    if (tasks.length > 0) {
      const existingTasks = this.getTasks();
      const mergedTasks = [...existingTasks, ...tasks];
      localStorage.setItem("todoTasks", JSON.stringify(mergedTasks));
    }
  }

  parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result.map((value) => value.replace(/^"|"$/g, ""));
  }

  getStoredProfile() {
    const defaultProfile = {
      name: "Користувач",
      email: "user@example.com",
      avatar: "/placeholder.svg?height=120&width=120",
      registrationDate: "2024-01-01",
    };

    try {
      const stored = localStorage.getItem("userProfile");
      return stored
        ? { ...defaultProfile, ...JSON.parse(stored) }
        : defaultProfile;
    } catch (error) {
      console.error("Помилка завантаження профілю:", error);
      return defaultProfile;
    }
  }

  saveStoredProfile(profile) {
    try {
      localStorage.setItem("userProfile", JSON.stringify(profile));
    } catch (error) {
      console.error("Помилка збереження профілю:", error);
      this.showNotification("Помилка збереження профілю", "error");
    }
  }

  getTasks() {
    try {
      const tasks = localStorage.getItem("todoTasks");
      return tasks ? JSON.parse(tasks) : [];
    } catch (error) {
      console.error("Помилка завантаження завдань:", error);
      return [];
    }
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  showNotification(message, type = "info") {
    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add("show");

    setTimeout(() => {
      notification.classList.remove("show");
    }, 3000);
  }
}

// Глобальні функції для кнопок
function exportData(format) {
  const tasks = JSON.parse(localStorage.getItem("todoTasks") || "[]");
  const profile = JSON.parse(localStorage.getItem("userProfile") || "{}");

  const exportData = {
    user: profile,
    tasks: tasks,
    exportDate: new Date().toISOString(),
  };

  if (format === "json") {
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `todo-backup-${
      new Date().toISOString().split("T")[0]
    }.json`;
    link.click();

    URL.revokeObjectURL(url);
  } else if (format === "csv") {
    const csvHeaders = [
      "Назва",
      "Опис",
      "Дедлайн",
      "Пріоритет",
      "Теги",
      "Виконано",
      "Дата створення",
    ];
    const csvRows = tasks.map((task) => [
      task.name,
      task.description || "",
      task.deadline || "",
      task.priority,
      (task.tags || []).join("; "),
      task.completed ? "Так" : "Ні",
      task.createdAt,
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map((row) => row.map((field) => `"${field}"`).join(","))
      .join("\n");

    const dataBlob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `todo-tasks-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  profileManager.showNotification(
    `Дані експортовано у форматі ${format.toUpperCase()}`,
    "success"
  );
}

function clearAllData() {
  if (
    confirm(
      "Ви впевнені, що хочете видалити всі дані? Цю дію неможливо скасувати."
    )
  ) {
    if (
      confirm(
        "Це остаточно видалить всі ваші завдання та налаштування. Продовжити?"
      )
    ) {
      localStorage.removeItem("todoTasks");
      localStorage.removeItem("userProfile");

      profileManager.loadProfile();
      profileManager.loadStats();
      profileManager.showNotification("Всі дані видалено", "info");
    }
  }
}

// Ініціалізація
let profileManager;

document.addEventListener("DOMContentLoaded", () => {
  profileManager = new ProfileManager();
});
