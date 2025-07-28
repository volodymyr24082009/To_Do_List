class TodoApp {
  constructor() {
    this.tasks = JSON.parse(localStorage.getItem("tasks")) || [];
    this.currentFilter = "all";
    this.currentEditId = null;
    this.isDarkTheme = localStorage.getItem("darkTheme") === "true";

    this.init();
  }

  init() {
    this.initializeTheme();
    this.bindEvents();
    this.renderTasks();
    this.updateStats();
    this.showEmptyState();
    this.initDeadlineFeatures();
  }

  initDeadlineFeatures() {
    // Ініціалізація функцій дедлайнів
    this.checkDeadlines();

    // Перевірка дедлайнів кожні 5 хвилин
    setInterval(() => this.checkDeadlines(), 5 * 60 * 1000);
  }

  checkDeadlines() {
    const now = new Date();

    this.tasks.forEach((task) => {
      if (task.deadline && !task.completed) {
        const deadline = new Date(task.deadline);
        const timeDiff = deadline.getTime() - now.getTime();

        // Позначаємо прострочені завдання
        if (timeDiff < 0 && !task.isOverdue) {
          task.isOverdue = true;
          this.showNotification(
            `⚠️ Завдання "${task.text}" прострочене!`,
            "error"
          );
        }

        // Нагадування за день до дедлайну
        if (
          timeDiff > 0 &&
          timeDiff < 24 * 60 * 60 * 1000 &&
          !task.notifiedDayBefore
        ) {
          task.notifiedDayBefore = true;
          this.showNotification(
            `📅 Завдання "${task.text}" має дедлайн завтра!`,
            "warning"
          );
        }
      }
    });

    this.saveTasks();
  }

  initializeTheme() {
    const themeToggle = document.getElementById("cyber-toggle");

    if (this.isDarkTheme) {
      document.documentElement.setAttribute("data-theme", "dark");
      themeToggle.checked = true;
    }

    themeToggle.addEventListener("change", () => {
      this.isDarkTheme = themeToggle.checked;
      localStorage.setItem("darkTheme", this.isDarkTheme);

      if (this.isDarkTheme) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }

      this.showNotification(
        this.isDarkTheme ? "Темна тема увімкнена" : "Світла тема увімкнена",
        "info"
      );
    });
  }

  bindEvents() {
    // Add task
    document
      .getElementById("addTaskBtn")
      .addEventListener("click", () => this.addTask());
    document.getElementById("taskInput").addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.addTask();
    });

    // Filter buttons
    document.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.setFilter(e.target.dataset.filter);
      });
    });

    // Search
    document.getElementById("searchInput").addEventListener("input", (e) => {
      this.searchTasks(e.target.value);
    });

    // Modal events
    document
      .querySelector(".modal-close")
      .addEventListener("click", () => this.closeModal());
    document
      .getElementById("cancelEdit")
      .addEventListener("click", () => this.closeModal());
    document
      .getElementById("saveEdit")
      .addEventListener("click", () => this.saveEdit());

    // Close modal on outside click
    document.getElementById("taskModal").addEventListener("click", (e) => {
      if (e.target.id === "taskModal") this.closeModal();
    });
  }

  async addTask() {
    const taskInput = document.getElementById("taskInput");
    const prioritySelect = document.getElementById("prioritySelect");
    const deadlineInput = document.getElementById("deadlineInput");
    const tagsInput = document.getElementById("tagsInput");

    const taskText = taskInput.value.trim();
    if (!taskText) {
      this.showNotification("Введіть текст завдання", "error");
      return;
    }

    const task = {
      id: Date.now(),
      text: taskText,
      completed: false,
      priority: prioritySelect.value,
      deadline: deadlineInput.value || null,
      tags: tagsInput.value
        ? tagsInput.value
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag)
        : [],
      createdAt: new Date().toISOString(),
      description: "",
      isOverdue: false,
      notifiedDayBefore: false,
      notifiedToday: false,
    };

    // Планування нагадувань
    if (task.deadline && window.deadlineManager) {
      window.deadlineManager.scheduleTaskReminders(task);
    }

    this.tasks.unshift(task);
    await this.saveTasks();
    this.renderTasks();
    this.updateStats();
    this.clearInputs();
    this.showNotification("Завдання додано успішно!", "success");
  }

  clearInputs() {
    document.getElementById("taskInput").value = "";
    document.getElementById("prioritySelect").value = "medium";
    document.getElementById("deadlineInput").value = "";
    document.getElementById("tagsInput").value = "";
  }

  toggleTask(id) {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.completed = !task.completed;
      this.saveTasks();
      this.renderTasks();
      this.updateStats();
      this.showNotification(
        task.completed ? "Завдання виконано!" : "Завдання відновлено",
        task.completed ? "success" : "info"
      );
    }
  }

  deleteTask(id) {
    if (confirm("Ви впевнені, що хочете видалити це завдання?")) {
      this.tasks = this.tasks.filter((t) => t.id !== id);
      this.saveTasks();
      this.renderTasks();
      this.updateStats();
      this.showNotification("Завдання видалено", "info");
    }
  }

  editTask(id) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;

    this.currentEditId = id;

    // Fill modal with task data
    document.getElementById("editTaskName").value = task.text;
    document.getElementById("editTaskDescription").value =
      task.description || "";
    document.getElementById("editTaskPriority").value = task.priority;
    document.getElementById("editTaskDeadline").value = task.deadline || "";
    document.getElementById("editTaskTags").value = task.tags.join(", ");

    this.openModal();
  }

  saveEdit() {
    if (!this.currentEditId) return;

    const task = this.tasks.find((t) => t.id === this.currentEditId);
    if (!task) return;

    const name = document.getElementById("editTaskName").value.trim();
    if (!name) {
      this.showNotification("Введіть назву завдання", "error");
      return;
    }

    task.text = name;
    task.description = document
      .getElementById("editTaskDescription")
      .value.trim();
    task.priority = document.getElementById("editTaskPriority").value;
    task.deadline = document.getElementById("editTaskDeadline").value || null;
    task.tags = document.getElementById("editTaskTags").value
      ? document
          .getElementById("editTaskTags")
          .value.split(",")
          .map((tag) => tag.trim())
      : [];

    this.saveTasks();
    this.renderTasks();
    this.updateStats();
    this.closeModal();
    this.showNotification("Завдання оновлено!", "success");
  }

  openModal() {
    document.getElementById("taskModal").classList.add("show");
    document.body.style.overflow = "hidden";
  }

  closeModal() {
    document.getElementById("taskModal").classList.remove("show");
    document.body.style.overflow = "";
    this.currentEditId = null;
  }

  setFilter(filter) {
    this.currentFilter = filter;

    // Update active button
    document.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    document.querySelector(`[data-filter="${filter}"]`).classList.add("active");

    this.renderTasks();
  }

  searchTasks(query) {
    this.searchQuery = query.toLowerCase();
    this.renderTasks();
  }

  getFilteredTasks() {
    let filtered = [...this.tasks];

    // Apply filter
    switch (this.currentFilter) {
      case "active":
        filtered = filtered.filter((task) => !task.completed);
        break;
      case "completed":
        filtered = filtered.filter((task) => task.completed);
        break;
      case "overdue":
        filtered = filtered.filter((task) => {
          if (!task.deadline || task.completed) return false;
          return new Date(task.deadline) < new Date();
        });
        break;
    }

    // Apply search
    if (this.searchQuery) {
      filtered = filtered.filter(
        (task) =>
          task.text.toLowerCase().includes(this.searchQuery) ||
          task.tags.some((tag) => tag.toLowerCase().includes(this.searchQuery))
      );
    }

    return filtered;
  }

  renderTasks() {
    const tasksList = document.getElementById("tasksList");
    const filteredTasks = this.getFilteredTasks();

    if (filteredTasks.length === 0) {
      this.showEmptyState();
      return;
    }

    this.hideEmptyState();

    tasksList.innerHTML = filteredTasks
      .map((task) => {
        const isOverdue =
          task.deadline &&
          !task.completed &&
          new Date(task.deadline) < new Date();
        const deadlineText = task.deadline
          ? new Date(task.deadline).toLocaleDateString("uk-UA")
          : "";

        return `
        <div class="task-item ${task.completed ? "completed" : ""} ${
          isOverdue ? "overdue" : ""
        }">
          <label class="task-checkbox-container">
            <input type="checkbox" ${task.completed ? "checked" : ""} 
                   onchange="todoApp.toggleTask(${task.id})">
            <div class="task-checkmark"></div>
          </label>
          
          <div class="task-content">
            <div class="task-name">${this.escapeHtml(task.text)}</div>
            <div class="task-meta">
              <span class="task-priority priority-${task.priority}">
                ${this.getPriorityText(task.priority)}
              </span>
              ${deadlineText ? `<span>📅 ${deadlineText}</span>` : ""}
              ${
                isOverdue
                  ? '<span style="color: #ef4444;">⚠️ Прострочено</span>'
                  : ""
              }
              ${
                task.tags.length > 0
                  ? `
                <div class="task-tags">
                  ${task.tags
                    .map(
                      (tag) =>
                        `<span class="task-tag">${this.escapeHtml(tag)}</span>`
                    )
                    .join("")}
                </div>
              `
                  : ""
              }
            </div>
          </div>
          
          <div class="task-actions">
            <button class="task-action-btn edit-btn" onclick="todoApp.editTask(${
              task.id
            })" title="Редагувати">
              ✏️
            </button>
            <button class="task-action-btn delete-btn" onclick="todoApp.deleteTask(${
              task.id
            })" title="Видалити">
              🗑️
            </button>
          </div>
        </div>
      `;
      })
      .join("");
  }

  getPriorityText(priority) {
    const priorities = {
      low: "Низький",
      medium: "Середній",
      high: "Високий",
    };
    return priorities[priority] || priority;
  }

  getDeadlineStats() {
    if (!window.deadlineManager) return null;

    return window.deadlineManager.analyzeDeadlines(this.tasks);
  }

  updateStats() {
    const total = this.tasks.length;
    const completed = this.tasks.filter((t) => t.completed).length;
    const active = total - completed;
    const overdue = this.tasks.filter((t) => {
      if (!t.deadline || t.completed) return false;
      return new Date(t.deadline) < new Date();
    }).length;

    document.getElementById("totalTasks").textContent = total;
    document.getElementById("activeTasks").textContent = active;
    document.getElementById("completedTasks").textContent = completed;
    document.getElementById("overdueTasks").textContent = overdue;

    // Додати статистику дедлайнів, якщо є контейнер
    const deadlineStatsContainer = document.getElementById("deadlineStats");
    if (deadlineStatsContainer && window.deadlineManager) {
      const stats = this.getDeadlineStats();
      this.renderDeadlineStats(stats);
    }
  }

  renderDeadlineStats(stats) {
    const container = document.getElementById("deadlineStats");
    if (!container || !stats) return;

    container.innerHTML = `
    <div class="deadline-stats">
      <div class="deadline-stat-card stat-overdue">
        <div class="deadline-stat-number">${stats.overdue}</div>
        <div class="deadline-stat-label">Прострочені</div>
      </div>
      <div class="deadline-stat-card stat-today">
        <div class="deadline-stat-number">${stats.today}</div>
        <div class="deadline-stat-label">Сьогодні</div>
      </div>
      <div class="deadline-stat-card stat-week">
        <div class="deadline-stat-number">${stats.thisWeek}</div>
        <div class="deadline-stat-label">На тижні</div>
      </div>
      <div class="deadline-stat-card stat-upcoming">
        <div class="deadline-stat-number">${stats.upcoming}</div>
        <div class="deadline-stat-label">Майбутні</div>
      </div>
    </div>
  `;
  }

  showEmptyState() {
    document.getElementById("emptyState").style.display = "block";
    document.getElementById("tasksList").style.display = "none";
  }

  hideEmptyState() {
    document.getElementById("emptyState").style.display = "none";
    document.getElementById("tasksList").style.display = "block";
  }

  saveTasks() {
    localStorage.setItem("tasks", JSON.stringify(this.tasks));

    // Cache for PWA
    if (window.pwaManager) {
      window.pwaManager.cacheUserData(this.tasks, "tasks");
    }
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

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Export/Import methods for data management
  exportData(format = "json") {
    const data = {
      tasks: this.tasks,
      exportDate: new Date().toISOString(),
      version: "1.0",
    };

    let content, filename, mimeType;

    if (format === "json") {
      content = JSON.stringify(data, null, 2);
      filename = `todo-backup-${new Date().toISOString().split("T")[0]}.json`;
      mimeType = "application/json";
    } else if (format === "csv") {
      const headers = [
        "ID",
        "Text",
        "Completed",
        "Priority",
        "Deadline",
        "Tags",
        "Created",
      ];
      const rows = this.tasks.map((task) => [
        task.id,
        `"${task.text.replace(/"/g, '""')}"`,
        task.completed,
        task.priority,
        task.deadline || "",
        `"${task.tags.join(", ")}"`,
        task.createdAt,
      ]);

      content = [headers, ...rows].map((row) => row.join(",")).join("\n");
      filename = `todo-backup-${new Date().toISOString().split("T")[0]}.csv`;
      mimeType = "text/csv";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    this.showNotification(
      `Дані експортовано в ${format.toUpperCase()}`,
      "success"
    );
  }

  importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        let importedTasks = [];

        if (file.name.endsWith(".json")) {
          const data = JSON.parse(content);
          importedTasks = data.tasks || data;
        } else if (file.name.endsWith(".csv")) {
          const lines = content.split("\n");
          const headers = lines[0].split(",");

          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(",");
            if (values.length >= headers.length) {
              importedTasks.push({
                id: Number.parseInt(values[0]) || Date.now() + i,
                text: values[1].replace(/^"|"$/g, "").replace(/""/g, '"'),
                completed: values[2] === "true",
                priority: values[3] || "medium",
                deadline: values[4] || null,
                tags: values[5]
                  ? values[5]
                      .replace(/^"|"$/g, "")
                      .split(", ")
                      .filter((t) => t)
                  : [],
                createdAt: values[6] || new Date().toISOString(),
              });
            }
          }
        }

        if (importedTasks.length > 0) {
          this.tasks = [...this.tasks, ...importedTasks];
          this.saveTasks();
          this.renderTasks();
          this.updateStats();
          this.showNotification(
            `Імпортовано ${importedTasks.length} завдань`,
            "success"
          );
        } else {
          this.showNotification("Не знайдено завдань для імпорту", "error");
        }
      } catch (error) {
        console.error("Import error:", error);
        this.showNotification("Помилка імпорту файлу", "error");
      }
    };
    reader.readAsText(file);
  }
}

// Initialize app
let todoApp;
document.addEventListener("DOMContentLoaded", () => {
  todoApp = new TodoApp();
});

// Global functions for inline event handlers
window.todoApp = todoApp;
