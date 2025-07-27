class TodoApp {
  constructor() {
    this.tasks = [];
    this.currentFilter = "all";
    this.editingTaskId = null;

    this.init();
  }

  init() {
    this.loadTasks();
    this.bindEvents();
    this.updateUI();
  }

  bindEvents() {
    // Додавання завдання
    document
      .getElementById("addTaskBtn")
      .addEventListener("click", () => this.addTask());
    document.getElementById("taskInput").addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.addTask();
    });

    // Фільтри
    document.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.addEventListener("click", (e) =>
        this.setFilter(e.target.dataset.filter)
      );
    });

    // Пошук
    document
      .getElementById("searchInput")
      .addEventListener("input", (e) => this.searchTasks(e.target.value));

    // Модальне вікно
    document
      .querySelector(".modal-close")
      .addEventListener("click", () => this.closeModal());
    document
      .getElementById("cancelEdit")
      .addEventListener("click", () => this.closeModal());
    document
      .getElementById("saveEdit")
      .addEventListener("click", () => this.saveEditedTask());

    // Закриття модального вікна при кліку поза ним
    document.getElementById("taskModal").addEventListener("click", (e) => {
      if (e.target.id === "taskModal") this.closeModal();
    });

    // Клавіша Escape для закриття модального вікна
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.closeModal();
    });
  }

  addTask() {
    const taskInput = document.getElementById("taskInput");
    const prioritySelect = document.getElementById("prioritySelect");
    const deadlineInput = document.getElementById("deadlineInput");
    const tagsInput = document.getElementById("tagsInput");

    const taskName = taskInput.value.trim();
    if (!taskName) {
      this.showNotification("Введіть назву завдання", "error");
      return;
    }

    const task = {
      id: Date.now(),
      name: taskName,
      description: "",
      priority: prioritySelect.value,
      deadline: deadlineInput.value || null,
      tags: tagsInput.value
        ? tagsInput.value
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag)
        : [],
      completed: false,
      createdAt: new Date().toISOString(),
    };

    this.tasks.push(task);
    this.saveTasks();
    this.updateUI();

    // Очищення форми
    taskInput.value = "";
    deadlineInput.value = "";
    tagsInput.value = "";
    prioritySelect.value = "medium";

    this.showNotification("Завдання додано успішно!", "success");
  }

  deleteTask(taskId) {
    if (confirm("Ви впевнені, що хочете видалити це завдання?")) {
      this.tasks = this.tasks.filter((task) => task.id !== taskId);
      this.saveTasks();
      this.updateUI();
      this.showNotification("Завдання видалено", "info");
    }
  }

  toggleTask(taskId) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (task) {
      task.completed = !task.completed;
      this.saveTasks();
      this.updateUI();

      const message = task.completed
        ? "Завдання виконано!"
        : "Завдання позначено як невиконане";
      this.showNotification(message, "success");
    }
  }

  editTask(taskId) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;

    this.editingTaskId = taskId;

    // Заповнення форми редагування
    document.getElementById("editTaskName").value = task.name;
    document.getElementById("editTaskDescription").value =
      task.description || "";
    document.getElementById("editTaskPriority").value = task.priority;
    document.getElementById("editTaskDeadline").value = task.deadline || "";
    document.getElementById("editTaskTags").value = task.tags.join(", ");

    this.showModal();
  }

  saveEditedTask() {
    if (!this.editingTaskId) return;

    const task = this.tasks.find((t) => t.id === this.editingTaskId);
    if (!task) return;

    const name = document.getElementById("editTaskName").value.trim();
    if (!name) {
      this.showNotification("Введіть назву завдання", "error");
      return;
    }

    task.name = name;
    task.description = document
      .getElementById("editTaskDescription")
      .value.trim();
    task.priority = document.getElementById("editTaskPriority").value;
    task.deadline = document.getElementById("editTaskDeadline").value || null;
    task.tags = document
      .getElementById("editTaskTags")
      .value.split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag);

    this.saveTasks();
    this.updateUI();
    this.closeModal();
    this.showNotification("Завдання оновлено!", "success");
  }

  showModal() {
    document.getElementById("taskModal").classList.add("show");
    document.body.style.overflow = "hidden";
  }

  closeModal() {
    document.getElementById("taskModal").classList.remove("show");
    document.body.style.overflow = "";
    this.editingTaskId = null;
  }

  setFilter(filter) {
    this.currentFilter = filter;

    // Оновлення активної кнопки фільтра
    document.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    document.querySelector(`[data-filter="${filter}"]`).classList.add("active");

    this.updateUI();
  }

  searchTasks(query) {
    this.searchQuery = query.toLowerCase();
    this.updateUI();
  }

  getFilteredTasks() {
    let filteredTasks = [...this.tasks];

    // Фільтрація за статусом
    switch (this.currentFilter) {
      case "active":
        filteredTasks = filteredTasks.filter((task) => !task.completed);
        break;
      case "completed":
        filteredTasks = filteredTasks.filter((task) => task.completed);
        break;
      case "overdue":
        filteredTasks = filteredTasks.filter((task) => {
          if (!task.deadline || task.completed) return false;
          return new Date(task.deadline) < new Date();
        });
        break;
    }

    // Пошук
    if (this.searchQuery) {
      filteredTasks = filteredTasks.filter(
        (task) =>
          task.name.toLowerCase().includes(this.searchQuery) ||
          (task.description &&
            task.description.toLowerCase().includes(this.searchQuery)) ||
          task.tags.some((tag) => tag.toLowerCase().includes(this.searchQuery))
      );
    }

    return filteredTasks;
  }

  updateUI() {
    this.updateStats();
    this.renderTasks();
  }

  updateStats() {
    const total = this.tasks.length;
    const completed = this.tasks.filter((task) => task.completed).length;
    const active = total - completed;
    const overdue = this.tasks.filter((task) => {
      if (!task.deadline || task.completed) return false;
      return new Date(task.deadline) < new Date();
    }).length;

    document.getElementById("totalTasks").textContent = total;
    document.getElementById("activeTasks").textContent = active;
    document.getElementById("completedTasks").textContent = completed;
    document.getElementById("overdueTasks").textContent = overdue;
  }

  renderTasks() {
    const tasksList = document.getElementById("tasksList");
    const emptyState = document.getElementById("emptyState");
    const filteredTasks = this.getFilteredTasks();

    if (filteredTasks.length === 0) {
      tasksList.style.display = "none";
      emptyState.style.display = "block";
      return;
    }

    tasksList.style.display = "block";
    emptyState.style.display = "none";

    tasksList.innerHTML = filteredTasks
      .map((task) => this.renderTask(task))
      .join("");
  }

  renderTask(task) {
    const isOverdue =
      task.deadline && !task.completed && new Date(task.deadline) < new Date();
    const deadlineText = task.deadline
      ? new Date(task.deadline).toLocaleDateString("uk-UA")
      : "";

    return `
            <div class="task-item ${task.completed ? "completed" : ""} ${
      isOverdue ? "overdue" : ""
    }">
                <input type="checkbox" class="task-checkbox" ${
                  task.completed ? "checked" : ""
                } 
                       onchange="todoApp.toggleTask(${task.id})">
                
                <div class="task-content">
                    <div class="task-name">${this.escapeHtml(task.name)}</div>
                    ${
                      task.description
                        ? `<div class="task-description">${this.escapeHtml(
                            task.description
                          )}</div>`
                        : ""
                    }
                    
                    <div class="task-meta">
                        <span class="task-priority priority-${
                          task.priority
                        }">${this.getPriorityText(task.priority)}</span>
                        ${
                          deadlineText
                            ? `<span class="task-deadline">📅 ${deadlineText}</span>`
                            : ""
                        }
                        ${
                          task.tags.length > 0
                            ? `
                            <div class="task-tags">
                                ${task.tags
                                  .map(
                                    (tag) =>
                                      `<span class="task-tag">${this.escapeHtml(
                                        tag
                                      )}</span>`
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
  }

  getPriorityText(priority) {
    const priorities = {
      low: "Низький",
      medium: "Середній",
      high: "Високий",
    };
    return priorities[priority] || priority;
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
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

  saveTasks() {
    try {
      localStorage.setItem("todoTasks", JSON.stringify(this.tasks));
    } catch (error) {
      console.error("Помилка збереження завдань:", error);
      this.showNotification("Помилка збереження даних", "error");
    }
  }

  loadTasks() {
    try {
      const savedTasks = localStorage.getItem("todoTasks");
      if (savedTasks) {
        this.tasks = JSON.parse(savedTasks);
      }
    } catch (error) {
      console.error("Помилка завантаження завдань:", error);
      this.tasks = [];
      this.showNotification("Помилка завантаження даних", "error");
    }
  }
}

// Ініціалізація додатку
let todoApp;

document.addEventListener("DOMContentLoaded", () => {
  todoApp = new TodoApp();
});

// Експорт для глобального доступу
window.todoApp = todoApp;
