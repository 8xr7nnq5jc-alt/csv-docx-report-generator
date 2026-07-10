const loginPanel = document.querySelector("#loginPanel");
const toolPanel = document.querySelector("#toolPanel");
const loginForm = document.querySelector("#loginForm");
const loginStatus = document.querySelector("#loginStatus");
const reportForm = document.querySelector("#reportForm");
const statusText = document.querySelector("#statusText");
const logList = document.querySelector("#logList");
const logoutButton = document.querySelector("#logoutButton");
const refreshLogs = document.querySelector("#refreshLogs");
const generateButton = document.querySelector("#generateButton");
const csvFile = document.querySelector("#csvFile");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(element, message, tone = "neutral") {
  element.textContent = message;
  element.dataset.tone = tone;
}

function setLoggedIn(isLoggedIn) {
  loginPanel.classList.toggle("hidden", isLoggedIn);
  toolPanel.classList.toggle("hidden", !isLoggedIn);
  logoutButton.classList.toggle("hidden", !isLoggedIn);
  if (isLoggedIn) loadLogs();
}

async function loadLogs() {
  try {
    const response = await fetch("/api/logs");
    if (!response.ok) throw new Error("Could not load activity log.");
    const logs = await response.json();
    logList.innerHTML = logs.length
      ? logs.map((item) => `
          <article class="logItem">
            <div class="logItemTop">
              <strong>${escapeHtml(item.reportType)} report</strong>
              <span class="badge subtle">${escapeHtml(item.rows)} rows</span>
            </div>
            <span>${escapeHtml(item.fileName)}</span>
            <small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small>
          </article>
        `).join("")
      : '<p class="hint emptyState">No reports generated yet.</p>';
  } catch (error) {
    logList.innerHTML = `<p class="status" data-tone="error">${escapeHtml(error.message)}</p>`;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector("button[type=submit]");
  submitButton.disabled = true;
  setStatus(loginStatus, "Signing in...", "neutral");
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(loginForm)))
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not sign in.");
    loginForm.reset();
    setLoggedIn(true);
  } catch (error) {
    setStatus(loginStatus, error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  generateButton.disabled = true;
  setStatus(statusText, "Generating report...", "neutral");
  try {
    const response = await fetch("/api/report", {
      method: "POST",
      body: new FormData(reportForm)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Could not generate report." }));
      throw new Error(error.error || "Could not generate report.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = reportForm.reportType.value === "team" ? "team-report.docx" : "individual-report.docx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setStatus(statusText, "Report downloaded successfully.", "success");
    reportForm.reset();
    await loadLogs();
  } catch (error) {
    setStatus(statusText, error.message, "error");
  } finally {
    generateButton.disabled = false;
  }
});

csvFile.addEventListener("change", () => {
  const file = csvFile.files?.[0];
  if (file) setStatus(statusText, `${file.name} selected. Ready to generate.`, "neutral");
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  setLoggedIn(false);
});

refreshLogs.addEventListener("click", loadLogs);

try {
  const statusResponse = await fetch("/api/status");
  const status = await statusResponse.json();
  setLoggedIn(status.loggedIn);
} catch {
  setStatus(loginStatus, "Could not connect to the server.", "error");
}

