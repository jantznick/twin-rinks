const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export function getApiBase() {
  return API_BASE;
}

/**
 * fetch wrapper that always sends session cookies.
 */
export async function apiFetch(path, options = {}) {
  const { headers, body, ...rest } = options;
  const config = {
    credentials: "include",
    ...rest,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers
    }
  };
  if (body !== undefined && typeof body !== "string") {
    config.body = JSON.stringify(body);
  } else if (body !== undefined) {
    config.body = body;
  }

  const response = await fetch(`${API_BASE}${path}`, config);
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  // apiFetch throws on non-OK; preserve body for uploading / codes
  if (!response.ok) {
    const err = new Error(data?.error || data?.message || "Request failed");
    err.status = response.status;
    err.code = data?.code;
    err.data = data;
    if (data?.error === "uploading") {
      err.message = "uploading";
    }
    throw err;
  }

  return { response, data };
}

export const authApi = {
  async register(email, password) {
    const { data } = await apiFetch("/auth/register", {
      method: "POST",
      body: { email, password }
    });
    return data;
  },
  async login(email, password) {
    const { data } = await apiFetch("/auth/login", {
      method: "POST",
      body: { email, password }
    });
    return data;
  },
  async logout() {
    const { data } = await apiFetch("/auth/logout", { method: "POST" });
    return data;
  },
  async me() {
    const { data } = await apiFetch("/auth/me");
    return data;
  },
  async requestMagicLink(email, intent) {
    const { data } = await apiFetch("/auth/magic-link/request", {
      method: "POST",
      body: intent ? { email, intent } : { email }
    });
    return data;
  },
  async verifyMagicLink(token) {
    const { data } = await apiFetch(
      `/auth/magic-link/verify?token=${encodeURIComponent(token)}`
    );
    return data;
  },
  async verifyMagicCode(email, code) {
    const { data } = await apiFetch("/auth/magic-code/verify", {
      method: "POST",
      body: { email, code }
    });
    return data;
  },
  async verifyEmail(token) {
    const { data } = await apiFetch(
      `/auth/verify-email?token=${encodeURIComponent(token)}`
    );
    return data;
  },
  async resendVerification() {
    const { data } = await apiFetch("/auth/verify-email/resend", {
      method: "POST"
    });
    return data;
  },
  async forgotPassword(email) {
    const { data } = await apiFetch("/auth/forgot-password", {
      method: "POST",
      body: { email }
    });
    return data;
  },
  async resetPassword(token, password) {
    const { data } = await apiFetch("/auth/reset-password", {
      method: "POST",
      body: { token, password }
    });
    return data;
  }
};

export const twinRinksApi = {
  async status() {
    const { data } = await apiFetch("/user/twin-rinks/status");
    return data;
  },
  async link(username, password) {
    const { data } = await apiFetch("/user/twin-rinks/link", {
      method: "POST",
      body: { username, password }
    });
    return data;
  },
  async unlink() {
    const { data } = await apiFetch("/user/twin-rinks/link", {
      method: "DELETE"
    });
    return data;
  }
};
