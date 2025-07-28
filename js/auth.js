class AuthManager {
  constructor() {
    this.apiUrl = window.location.origin;
    this.currentForm = "login";
    this.init();
  }

  init() {
    this.checkAuthStatus();
    this.bindEvents();
    this.setupPasswordStrength();
  }

  checkAuthStatus() {
    const token = localStorage.getItem("authToken");
    if (token) {
      // Перевірка валідності токена
      this.verifyToken(token);
    }
  }

  async verifyToken(token) {
    try {
      const response = await fetch(`${this.apiUrl}/api/auth/verify`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        // Токен валідний, перенаправляємо на головну сторінку
        window.location.href = "index.html";
      } else {
        // Токен недійсний, видаляємо його
        localStorage.removeItem("authToken");
        localStorage.removeItem("userProfile");
      }
    } catch (error) {
      console.error("Помилка перевірки токена:", error);
      localStorage.removeItem("authToken");
      localStorage.removeItem("userProfile");
    }
  }

  bindEvents() {
    // Форма входу
    document
      .getElementById("loginFormElement")
      .addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleLogin();
      });

    // Форма реєстрації
    document
      .getElementById("registerFormElement")
      .addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleRegister();
      });

    // Форма відновлення пароля
    document
      .getElementById("forgotFormElement")
      .addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleForgotPassword();
      });

    // Валідація в реальному часі
    document.getElementById("registerEmail").addEventListener("blur", () => {
      this.validateEmail("registerEmail", "registerEmailError");
    });

    document.getElementById("registerName").addEventListener("blur", () => {
      this.validateName();
    });

    document.getElementById("confirmPassword").addEventListener("input", () => {
      this.validatePasswordMatch();
    });

    // Закриття модального вікна при кліку поза ним
    document.getElementById("termsModal").addEventListener("click", (e) => {
      if (e.target.id === "termsModal") {
        this.closeTermsModal();
      }
    });
  }

  setupPasswordStrength() {
    const passwordInput = document.getElementById("registerPassword");
    const strengthIndicator = document.getElementById("passwordStrength");

    passwordInput.addEventListener("input", () => {
      const password = passwordInput.value;
      const strength = this.calculatePasswordStrength(password);

      strengthIndicator.className = `password-strength ${strength}`;
    });
  }

  calculatePasswordStrength(password) {
    let score = 0;

    if (password.length >= 8) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score < 3) return "weak";
    if (score < 5) return "medium";
    return "strong";
  }

  async handleLogin() {
    const form = document.getElementById("loginFormElement");
    const formData = new FormData(form);
    const loginBtn = document.getElementById("loginBtn");

    // Очищення попередніх помилок
    this.clearErrors(["loginEmailError", "loginPasswordError"]);

    // Валідація
    const email = formData.get("email");
    const password = formData.get("password");

    if (
      !this.validateEmail("loginEmail", "loginEmailError") ||
      !this.validateRequired(
        "loginPassword",
        "loginPasswordError",
        "Введіть пароль"
      )
    ) {
      return;
    }

    // Показати завантаження
    this.setButtonLoading(loginBtn, true);

    try {
      const response = await fetch(`${this.apiUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Успішний вхід
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("userProfile", JSON.stringify(data.user));

        this.showNotification("Успішний вхід! Перенаправлення...", "success");

        // Перенаправлення через 1 секунду
        setTimeout(() => {
          window.location.href = "index.html";
        }, 1000);
      } else {
        // Помилка входу
        if (data.field) {
          this.showFieldError(data.field, data.error);
        } else {
          this.showNotification(data.error || "Помилка входу", "error");
        }
      }
    } catch (error) {
      console.error("Помилка входу:", error);
      this.showNotification("Помилка з'єднання з сервером", "error");
    } finally {
      this.setButtonLoading(loginBtn, false);
    }
  }

  async handleRegister() {
    const form = document.getElementById("registerFormElement");
    const formData = new FormData(form);
    const registerBtn = document.getElementById("registerBtn");

    // Очищення попередніх помилок
    this.clearErrors([
      "registerNameError",
      "registerEmailError",
      "registerPasswordError",
      "confirmPasswordError",
    ]);

    // Валідація
    const name = formData.get("name");
    const email = formData.get("email");
    const password = formData.get("password");
    const confirmPassword = formData.get("confirmPassword");

    let isValid = true;

    if (!this.validateName()) isValid = false;
    if (!this.validateEmail("registerEmail", "registerEmailError"))
      isValid = false;
    if (!this.validatePassword()) isValid = false;
    if (!this.validatePasswordMatch()) isValid = false;
    if (!this.validateTermsAgreement()) isValid = false;

    if (!isValid) return;

    // Показати завантаження
    this.setButtonLoading(registerBtn, true);

    try {
      const response = await fetch(`${this.apiUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Успішна реєстрація
        this.showNotification(
          "Акаунт створено успішно! Увійдіть в систему.",
          "success"
        );

        // Перехід до форми входу
        setTimeout(() => {
          this.switchToLogin();
          // Заповнення email в формі входу
          document.getElementById("loginEmail").value = email;
        }, 1500);
      } else {
        // Помилка реєстрації
        if (data.field) {
          this.showFieldError(data.field, data.error);
        } else {
          this.showNotification(data.error || "Помилка реєстрації", "error");
        }
      }
    } catch (error) {
      console.error("Помилка реєстрації:", error);
      this.showNotification("Помилка з'єднання з сервером", "error");
    } finally {
      this.setButtonLoading(registerBtn, false);
    }
  }

  async handleForgotPassword() {
    const form = document.getElementById("forgotFormElement");
    const formData = new FormData(form);
    const forgotBtn = document.getElementById("forgotBtn");

    // Очищення попередніх помилок
    this.clearErrors(["forgotEmailError"]);

    const email = formData.get("email");

    if (!this.validateEmail("forgotEmail", "forgotEmailError")) {
      return;
    }

    // Показати завантаження
    this.setButtonLoading(forgotBtn, true);

    try {
      const response = await fetch(`${this.apiUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        this.showNotification("Інструкції надіслано на ваш email", "success");
        setTimeout(() => {
          this.switchToLogin();
        }, 2000);
      } else {
        if (data.field) {
          this.showFieldError(data.field, data.error);
        } else {
          this.showNotification(
            data.error || "Помилка відновлення пароля",
            "error"
          );
        }
      }
    } catch (error) {
      console.error("Помилка відновлення пароля:", error);
      this.showNotification("Помилка з'єднання з сервером", "error");
    } finally {
      this.setButtonLoading(forgotBtn, false);
    }
  }

  // Валідація
  validateEmail(inputId, errorId) {
    const input = document.getElementById(inputId);
    const error = document.getElementById(errorId);
    const email = input.value.trim();

    if (!email) {
      this.showFieldError(inputId, "Введіть email");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this.showFieldError(inputId, "Введіть коректний email");
      return false;
    }

    this.clearFieldError(inputId);
    return true;
  }

  validateName() {
    const input = document.getElementById("registerName");
    const name = input.value.trim();

    if (!name) {
      this.showFieldError("registerName", "Введіть ваше ім'я");
      return false;
    }

    if (name.length < 2) {
      this.showFieldError(
        "registerName",
        "Ім'я повинно містити мінімум 2 символи"
      );
      return false;
    }

    this.clearFieldError("registerName");
    return true;
  }

  validatePassword() {
    const input = document.getElementById("registerPassword");
    const password = input.value;

    if (!password) {
      this.showFieldError("registerPassword", "Введіть пароль");
      return false;
    }

    if (password.length < 6) {
      this.showFieldError(
        "registerPassword",
        "Пароль повинен містити мінімум 6 символів"
      );
      return false;
    }

    this.clearFieldError("registerPassword");
    return true;
  }

  validatePasswordMatch() {
    const password = document.getElementById("registerPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!confirmPassword) {
      this.showFieldError("confirmPassword", "Підтвердіть пароль");
      return false;
    }

    if (password !== confirmPassword) {
      this.showFieldError("confirmPassword", "Паролі не співпадають");
      return false;
    }

    this.clearFieldError("confirmPassword");
    return true;
  }

  validateTermsAgreement() {
    const checkbox = document.getElementById("agreeTerms");

    if (!checkbox.checked) {
      this.showNotification("Погодьтеся з умовами використання", "warning");
      return false;
    }

    return true;
  }

  validateRequired(inputId, errorId, message) {
    const input = document.getElementById(inputId);
    const value = input.value.trim();

    if (!value) {
      this.showFieldError(inputId, message);
      return false;
    }

    this.clearFieldError(inputId);
    return true;
  }

  // Утилітарні методи
  showFieldError(inputId, message) {
    const input = document.getElementById(inputId);
    const errorElement = document.getElementById(
      inputId.replace(/([A-Z])/g, "$1") + "Error"
    );

    input.classList.add("error");
    input.classList.remove("success");

    if (errorElement) {
      errorElement.textContent = message;
    }
  }

  clearFieldError(inputId) {
    const input = document.getElementById(inputId);
    const errorElement = document.getElementById(
      inputId.replace(/([A-Z])/g, "$1") + "Error"
    );

    input.classList.remove("error");
    input.classList.add("success");

    if (errorElement) {
      errorElement.textContent = "";
    }
  }

  clearErrors(errorIds) {
    errorIds.forEach((errorId) => {
      const errorElement = document.getElementById(errorId);
      if (errorElement) {
        errorElement.textContent = "";
      }

      const inputId = errorId.replace("Error", "");
      const input = document.getElementById(inputId);
      if (input) {
        input.classList.remove("error", "success");
      }
    });
  }

  setButtonLoading(button, loading) {
    const btnText = button.querySelector(".btn-text");
    const btnLoader = button.querySelector(".btn-loader");

    if (loading) {
      button.disabled = true;
      btnText.style.display = "none";
      btnLoader.style.display = "inline";
    } else {
      button.disabled = false;
      btnText.style.display = "inline";
      btnLoader.style.display = "none";
    }
  }

  showNotification(message, type = "info") {
    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add("show");

    setTimeout(() => {
      notification.classList.remove("show");
    }, 4000);
  }

  // Перемикання форм
  switchToLogin() {
    this.hideAllForms();
    document.getElementById("loginForm").classList.add("active");
    this.currentForm = "login";
  }

  switchToRegister() {
    this.hideAllForms();
    document.getElementById("registerForm").classList.add("active");
    this.currentForm = "register";
  }

  showForgotPassword() {
    this.hideAllForms();
    document.getElementById("forgotForm").classList.add("active");
    this.currentForm = "forgot";
  }

  hideAllForms() {
    document.querySelectorAll(".auth-form").forEach((form) => {
      form.classList.remove("active");
    });
  }

  // Модальні вікна
  showTerms() {
    document.getElementById("termsModal").classList.add("show");
    document.body.style.overflow = "hidden";
  }

  closeTermsModal() {
    document.getElementById("termsModal").classList.remove("show");
    document.body.style.overflow = "";
  }
}

// Глобальні функції
function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  const button = input.nextElementSibling;

  if (input.type === "password") {
    input.type = "text";
    button.textContent = "🙈";
  } else {
    input.type = "password";
    button.textContent = "👁️";
  }
}

function switchToLogin() {
  authManager.switchToLogin();
}

function switchToRegister() {
  authManager.switchToRegister();
}

function showForgotPassword() {
  authManager.showForgotPassword();
}

function showTerms() {
  authManager.showTerms();
}

function closeTermsModal() {
  authManager.closeTermsModal();
}

// Ініціалізація
let authManager;

document.addEventListener("DOMContentLoaded", () => {
  authManager = new AuthManager();
});
