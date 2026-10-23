
const SUPABASE_URL = "https://amsfewfyznnkvdwpiuza.supabase.co";
const SUPABASE_KEY = "sb_publishable_1ruYE9Vu88_-BSO9Hiycug_QZ8vZgT1";
const ADMIN_FUNCTION = `${SUPABASE_URL}/functions/v1/admin-actions`;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const list = document.getElementById("announcement-list");
const adminPanel = document.getElementById("admin-panel");
const adminStatus = document.getElementById("admin-status");
const adminLoginButton = document.getElementById("admin-login");

let adminPassword = null;

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

async function callAdmin(payload) {
  const response = await fetch(ADMIN_FUNCTION, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "x-admin-password": adminPassword
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    throw new Error(result.error || "The admin request failed.");
  }

  return result;
}

function showAdminControls() {
  adminStatus.textContent = "Signed in as administrator.";
  adminLoginButton.textContent = "Sign out";
  
  let form = document.getElementById("publish-form");
  if (form) return;

  form = document.createElement("form");
  form.id = "publish-form";
  form.innerHTML = `
    <h3>Publish an announcement</h3>
    <label>Title
      <input name="title" maxlength="150" required>
    </label>
    <label>Announcement
      <textarea name="body" maxlength="10000" required></textarea>
    </label>
    <button type="submit">Publish announcement</button>
    <p id="publish-status" role="status"></p>
  `;
  adminPanel.appendChild(form);
}

function hideAdminControls() {
  adminPassword = null;
  document.getElementById("publish-form")?.remove();
  adminStatus.textContent = "Signed out.";
  adminLoginButton.textContent = "Admin sign in";
  loadAnnouncements();
}

adminLoginButton.addEventListener("click", async () => {
  if (adminPassword) {
    hideAdminControls();
    return;
  }

  const password = prompt("Enter the administrator password:");
  if (!password) return;

  adminStatus.textContent = "Verifying password...";

  // Keep the password in memory only; do not save it in browser storage.
  adminPassword = password;

  try {
    await callAdmin({ action: "verify_admin" });
    showAdminControls();
    await loadAnnouncements();
  } catch (error) {
    adminPassword = null;
    adminStatus.textContent = error.message;
  }
});

adminPanel.addEventListener("submit", async event => {
  if (event.target.id !== "publish-form") return;
  event.preventDefault();

  const form = event.target;
  const values = new FormData(form);
  const title = String(values.get("title") || "").trim();
  const body = String(values.get("body") || "").trim();
  const status = document.getElementById("publish-status");

  if (!title || !body) {
    status.textContent = "Enter both a title and announcement.";
    return;
  }

  status.textContent = "Publishing...";

  try {
    await callAdmin({
      action: "create_announcement",
      title,
      body
    });
    form.reset();
    status.textContent = "Announcement published.";
    await loadAnnouncements();
  } catch (error) {
    status.textContent = error.message;
  }
});

async function loadAnnouncements() {
  list.innerHTML = "<p>Loading announcements...</p>";

  const { data, error } = await db
    .from("announcements")
    .select("id, title, body, author_name, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = "<p>Could not load announcements. Check the database setup.</p>";
    console.error(error);
    return;
  }

  if (!data.length) {
    list.innerHTML = "<p>No announcements yet. Check back soon!</p>";
    return;
  }

  list.innerHTML = data.map(a => `
    <article class="announcement">
      <h2>${escapeHTML(a.title)}</h2>
      <p class="meta">Posted by ${escapeHTML(a.author_name)} ·
        ${new Date(a.created_at).toLocaleString()}</p>
      <p>${escapeHTML(a.body).replace(/\n/g, "<br>")}</p>
      ${adminPassword ? `
        <button type="button" data-delete-announcement="${a.id}">
          Delete announcement
        </button>
      ` : ""}
      <div id="replies-${a.id}">Loading replies...</div>
      <form class="reply-form" data-id="${a.id}">
        <label>Your display name
          <input name="author_name" maxlength="60" required>
        </label>
        <label>Your reply
          <textarea name="body" maxlength="2000" required></textarea>
        </label>
        <button type="submit">Post reply</button>
        <p class="reply-status" role="status"></p>
      </form>
    </article>
  `).join("");

  for (const a of data) {
    await loadReplies(a.id);
  }
}

async function loadReplies(announcementId) {
  const target = document.getElementById(`replies-${announcementId}`);
  if (!target) return;

  const { data, error } = await db
    .from("replies")
    .select("id, author_name, body, created_at")
    .eq("announcement_id", announcementId)
    .order("created_at", { ascending: true });

  if (error) {
    target.textContent = "Replies could not be loaded.";
    console.error(error);
    return;
  }

  target.innerHTML = data.map(reply => `
    <div class="reply">
      <strong>${escapeHTML(reply.author_name)}</strong>
      <p>${escapeHTML(reply.body).replace(/\n/g, "<br>")}</p>
      <small>${new Date(reply.created_at).toLocaleString()}</small>
      ${adminPassword ? `
        <button type="button" data-delete-reply="${reply.id}">
          Delete reply
        </button>
      ` : ""}
    </div>
  `).join("") || "<p>No replies yet.</p>";
}

list.addEventListener("submit", async event => {
  if (!event.target.matches(".reply-form")) return;
  event.preventDefault();

  const form = event.target;
  const values = new FormData(form);
  const author_name = String(values.get("author_name") || "").trim();
  const body = String(values.get("body") || "").trim();
  const announcement_id = Number(form.dataset.id);
  const status = form.querySelector(".reply-status");
  const submitButton = form.querySelector('button[type="submit"]');

  if (!author_name || !body) {
    status.textContent = "Enter your name and reply.";
    return;
  }

  submitButton.disabled = true;
  status.textContent = "Posting...";

  const { error } = await db.from("replies").insert({
    announcement_id,
    author_name,
    body
  });

  submitButton.disabled = false;

  if (error) {
    status.textContent = "Reply failed. Please try again.";
    console.error(error);
    return;
  }

  form.reset();
  status.textContent = "Reply posted.";
  await loadReplies(announcement_id);
});

list.addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || !adminPassword) return;

  const announcementId = button.dataset.deleteAnnouncement;
  const replyId = button.dataset.deleteReply;

  if (!announcementId && !replyId) return;

  const itemType = announcementId ? "announcement" : "reply";
  if (!confirm(`Delete this ${itemType}? This cannot be undone.`)) return;

  button.disabled = true;

  try {
    if (announcementId) {
      await callAdmin({
        action: "delete_announcement",
        id: Number(announcementId)
      });
      await loadAnnouncements();
    } else {
      await callAdmin({
        action: "delete_reply",
        id: Number(replyId)
      });
      const article = button.closest(".announcement");
      if (article) {
        const match = article.querySelector('[id^="replies-"]');
        if (match) {
          await loadReplies(Number(match.id.replace("replies-", "")));
        }
      }
    }
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
});

loadAnnouncements();
