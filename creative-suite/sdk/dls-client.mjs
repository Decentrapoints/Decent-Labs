// Shared contract client for future DLS adapters. Node 24 or browser fetch.
// Credentials stay in memory. Never put account secrets in source or URLs.
export class DlsClient {
  constructor(baseUrl, fetchImpl = globalThis.fetch) {
    this.base = new URL(baseUrl);
    if (
      !["http:", "https:"].includes(this.base.protocol) ||
      this.base.username ||
      this.base.password
    )
      throw new Error("Use a DLS host URL without credentials.");
    this.fetch = fetchImpl;
    this.cookie = null;
  }
  async request(path, method = "GET", body) {
    const response = await this.fetch(new URL(`/api${path}`, this.base), {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    // Browser cookie handling remains HttpOnly; this is readable only in Node.
    const cookie = response.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    const result = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(result.error || "DLS request failed"), {
        status: response.status,
      });
    return result;
  }
  login(name, password) {
    return this.request("/auth/login", "POST", { name, password });
  }
  async logout() {
    await this.request("/auth/logout", "POST", {});
    this.cookie = null;
  }
  capabilities() {
    return this.request("/capabilities");
  }
  score(id) {
    return this.request(`/scores/${encodeURIComponent(id)}`);
  }
  connections() {
    return this.request("/connections");
  }
  advice(app, resource, prompt, selection) {
    return this.request("/satsu/ask", "POST", {
      app,
      resource,
      prompt,
      selection,
    });
  }
  prepare(app, resource, operation) {
    return this.request("/actions/prepare", "POST", {
      app,
      resource,
      operation,
    });
  }
  applyReviewed(id) {
    return this.request(`/actions/${encodeURIComponent(id)}/apply`, "POST", {});
  }
  cancel(id) {
    return this.request(
      `/actions/${encodeURIComponent(id)}/cancel`,
      "POST",
      {},
    );
  }
  receipt(id) {
    return this.request(`/actions/${encodeURIComponent(id)}`);
  }
  handoff(id) {
    return this.request(
      `/scores/${encodeURIComponent(id)}/handoff`,
      "POST",
      {},
    );
  }
}
