import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const supabase = createClient(
  "https://yzcxlpxbgwgxtigexghm.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6Y3hscHhiZ3dneHRpZ2V4Z2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjU1MDIsImV4cCI6MjA5ODM0MTUwMn0.PiFdv0KNXNRyFxPeboBF4-1gc88OjdiHxk9F65RR2qA"
);

/* =========================================
   AUTH ACTIONS
========================================= */
export async function loginGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
}

export async function loginEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signupEmail(email, password, fullName) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || "" }
    }
  });
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = "/";
}

/* =========================================
   MODAL MARKUP + STYLES (inyectado una vez)
========================================= */
function injectModal() {
  if (document.getElementById("auth-modal-overlay")) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div id="auth-modal-overlay" class="auth-modal-overlay">
      <div class="auth-modal">
        <button id="auth-modal-close" class="auth-modal-close" aria-label="Cerrar">&times;</button>

        <h2 id="auth-modal-title">Iniciar sesión</h2>

        <button id="auth-google-btn" class="auth-google-btn" type="button">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.4 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.4 6.1 29.5 4 24 4c-7.4 0-13.8 4.1-17.1 10.1z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.4 26.7 36 24 36c-5.3 0-9.6-3.4-11.3-8.1l-6.5 5C9.9 39.8 16.4 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.2 5.2C40.5 36.3 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z"/>
          </svg>
          Continuar con Google
        </button>

        <div class="auth-divider"><span>o</span></div>

        <form id="auth-email-form">
          <div id="auth-name-field" style="display:none;">
            <label class="auth-label" for="auth-name-input">Nombre</label>
            <input class="auth-input" type="text" id="auth-name-input" autocomplete="name">
          </div>

          <label class="auth-label" for="auth-email-input">Email</label>
          <input class="auth-input" type="email" id="auth-email-input" required autocomplete="email">

          <label class="auth-label" for="auth-password-input">Contraseña</label>
          <input class="auth-input" type="password" id="auth-password-input" required autocomplete="current-password" minlength="6">

          <p id="auth-error" class="auth-error" style="display:none;"></p>

          <button type="submit" class="btn" id="auth-submit-btn">Iniciar sesión</button>
        </form>

        <p class="auth-switch">
          <span id="auth-switch-login">¿No tienes cuenta? <a href="#" id="auth-switch-to-register">Regístrate aquí</a></span>
          <span id="auth-switch-register" style="display:none;">¿Ya tienes cuenta? <a href="#" id="auth-switch-to-login">Inicia sesión</a></span>
        </p>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper.firstElementChild);

  let mode = "login"; // login | register

  const overlay = document.getElementById("auth-modal-overlay");
  const title = document.getElementById("auth-modal-title");
  const submitBtn = document.getElementById("auth-submit-btn");
  const errorBox = document.getElementById("auth-error");
  const form = document.getElementById("auth-email-form");
  const switchLogin = document.getElementById("auth-switch-login");
  const switchRegister = document.getElementById("auth-switch-register");
  const nameField = document.getElementById("auth-name-field");
  const nameInput = document.getElementById("auth-name-input");

  function setMode(newMode) {
    mode = newMode;
    errorBox.style.display = "none";
    if (mode === "login") {
      title.textContent = "Iniciar sesión";
      submitBtn.textContent = "Iniciar sesión";
      switchLogin.style.display = "inline";
      switchRegister.style.display = "none";
      nameField.style.display = "none";
      nameInput.required = false;
    } else {
      title.textContent = "Crear cuenta";
      submitBtn.textContent = "Registrarse";
      switchLogin.style.display = "none";
      switchRegister.style.display = "inline";
      nameField.style.display = "block";
      nameInput.required = true;
    }
  }

  document.getElementById("auth-switch-to-register").onclick = (e) => {
    e.preventDefault();
    setMode("register");
  };
  document.getElementById("auth-switch-to-login").onclick = (e) => {
    e.preventDefault();
    setMode("login");
  };

  document.getElementById("auth-modal-close").onclick = closeAuthModal;
  overlay.onclick = (e) => {
    if (e.target === overlay) closeAuthModal();
  };

  document.getElementById("auth-google-btn").onclick = () => loginGoogle();

  form.onsubmit = async (e) => {
    e.preventDefault();
    errorBox.style.display = "none";
    submitBtn.disabled = true;

    const email = document.getElementById("auth-email-input").value.trim();
    const password = document.getElementById("auth-password-input").value;

    if (mode === "login") {
      const { error } = await loginEmail(email, password);
      submitBtn.disabled = false;

      if (error) {
        errorBox.textContent = translateError(error.message);
        errorBox.style.display = "block";
        return;
      }

      closeAuthModal();
      window.location.reload();
      return;
    }

    // mode === "register"
    const fullName = nameInput.value.trim();
    const { data, error } = await signupEmail(email, password, fullName);
    submitBtn.disabled = false;

    if (error) {
      errorBox.textContent = translateError(error.message);
      errorBox.style.color = "#dc2626";
      errorBox.style.display = "block";
      return;
    }

    if (data.session) {
      // "Confirm email" desactivado en Supabase: sesión ya activa
      closeAuthModal();
      window.location.reload();
    } else {
      // "Confirm email" activado: hay que confirmar el correo antes de poder iniciar sesión
      errorBox.style.color = "#16a34a";
      errorBox.textContent = "Cuenta creada. Te hemos enviado un email de confirmación — revisa tu bandeja de entrada (y spam) antes de iniciar sesión.";
      errorBox.style.display = "block";
      form.reset();
    }
  };

  // reset al abrir
  overlay.addEventListener("auth-modal-opened", () => {
    form.reset();
    errorBox.style.display = "none";
    errorBox.style.color = "#dc2626";
    setMode("login");
  });
}

function translateError(msg) {
  if (/invalid login credentials/i.test(msg)) return "Email o contraseña incorrectos.";
  if (/user already registered/i.test(msg)) return "Ya existe una cuenta con ese email.";
  if (/password should be/i.test(msg)) return "La contraseña debe tener al menos 6 caracteres.";
  return msg;
}

export function openAuthModal() {
  injectModal();
  const overlay = document.getElementById("auth-modal-overlay");
  overlay.classList.add("open");
  overlay.dispatchEvent(new Event("auth-modal-opened"));
}

export function closeAuthModal() {
  const overlay = document.getElementById("auth-modal-overlay");
  if (overlay) overlay.classList.remove("open");
}

/* =========================================
   BOTÓN DE CABECERA (compartido en todas las páginas)
========================================= */
async function setupHeaderButton() {
  const btn = document.getElementById("auth-button");
  if (!btn) return;

  const { data } = await supabase.auth.getUser();

  if (data.user) {
    btn.textContent = "Cuenta";
    btn.href = "/account.html";
    btn.onclick = null;
  } else {
    btn.textContent = "Iniciar sesión";
    btn.href = "#";
    btn.onclick = (e) => {
      e.preventDefault();
      injectModal();
      openAuthModal();
    };
  }
}

injectModal();
setupHeaderButton();
supabase.auth.onAuthStateChange(() => {
  setupHeaderButton();
});

// Disponible globalmente por si alguna página quiere abrirlo manualmente
window.openAuthModal = openAuthModal;
window.NLSAuth = { supabase, loginGoogle, loginEmail, signupEmail, logout, openAuthModal, closeAuthModal };
