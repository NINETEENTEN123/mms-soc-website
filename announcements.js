
const SUPABASE_URL = "https://amsfewfyznnkvdwpiuza.supabase.co";
const SUPABASE_KEY = "sb_publishable_1ruYE9Vu88_-BSO9Hiycug_QZ8vZgT1";
const ADMIN_FUNCTION = `${SUPABASE_URL}/functions/v1/admin-actions`;

// Demonstration only. This is visible to anyone inspecting the JavaScript.
const OVERRIDE_PIN = "0p3nthedoor";
const PIN_STORAGE_KEY = "mms-announcement-pins";

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

function getPostPins() {
  try {
    return JSON.parse(localStorage.getItem(PIN_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePostPin(id, pin) {
  const pins = getPostPins();
  pins[id] = pin;
  localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pins));
}

function canManagePost(id) {
  const enteredPin = prompt("Enter this post's PIN or the override PIN:");
  if (enteredPin === null) return false;

  const pins = getPostPins();
  if (enteredPin === OVERRIDE_PIN || enteredPin === pins[id]) {
    return true;
  }

  alert("Incorrect PIN.");
  return false;
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

// Public announcement form: visitors do not need to sign in.
list.insertAdjacentHTML("beforebegin", `
  <section class="public-post panel">
    <h2>Post an Announcement</h2>
    <p>Share club news or start a discussion. Keep your post PIN private.</p>
    <form id="public-post-form">
      <label>Your display name
        <input name="author_name" maxlength="60" required>
      </label>
      <label>Title
        <input name="title" maxlength="150" required>
      </label>
      <label>Announcement
        <textarea name="body" maxlength="10000" required></textarea>
      </label>
      <label>Create a PIN for editing or deleting this post
        <input name="pin" type="password" minlength="1" maxlength="100"
          autocomplete="new-password" required>
      </label>
      <button type="submit">Publish announcement</button>
      <p id="public-post-status" role="status"></p>
    </form>
  </section>
`);

function showAdminControls() {
  adminStatus.textContent = "Signed in as administrator.";
  adminLoginButton.textContent = "Sign out";

  let form = document.getElementById("publish-form");
  if (form) return;

  // Public posting is already available, so the admin form is unnecessary.
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

// Anyone can publish. The PIN is stored locally for this browser only.
document.getElementById("public-post-form").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const values = new FormData(form);
  const author_name = String(values.get("author_name") || "").trim();
  const title = String(values.get("title") || "").trim();
  const body = String(values.get("body") || "").trim();
  const pin = String(values.get("pin") || "");
  const status = document.getElementById("public-post-status");
  const button = form.querySelector('button[type="submit"]');

  if (!author_name || !title || !body || !pin) {
    status.textContent = "Complete every field.";
    return;
  }

  button.disabled = true;
  status.textContent = "Publishing...";

  try {
    const { data, error } = await db
      .from("announcements")
      .insert({ author_name, title, body })
      .select("id")
      .single();

    if (error) throw error;

    savePostPin(data.id, pin);
    form.reset();
    status.textContent =
      "Published! Keep your PIN safe. It is saved only in this browser.";
    await loadAnnouncements();
  } catch (error) {
    console.error(error);
    status.textContent =
      "Publishing failed. Check the Supabase policies and table permissions.";
  } finally {
    button.disabled = false;
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
    list.innerHTML = "<p>No announcements yet. Be the first to post!</p>";
    return;
  }

  list.innerHTML = data.map(a => `
    <article class="announcement">
      <div class="announcement-content">
        <h2>${escapeHTML(a.title)}</h2>
        <p class="meta">Posted by ${escapeHTML(a.author_name)} ·
          ${new Date(a.created_at).toLocaleString()}</p>
        <p>${escapeHTML(a.body).replace(/\n/g, "<br>")}</p>
        <div class="announcement-actions">
          <button type="button" data-edit-post="${a.id}">Edit post</button>
          <button type="button" data-delete-announcement="${a.id}">
            Delete post
          </button>
        </div>
        ${adminPassword ? `
          <button type="button" data-admin-delete-announcement="${a.id}">
            Admin delete
          </button>
        ` : ""}
      </div>

      <details class="replies-section">
        <summary>Replies and discussion</summary>
        <div id="replies-${a.id}" class="replies-list">
          <p>Loading replies...</p>
        </div>
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
      </details>
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
          Admin delete reply
        </button>
      ` : ""}
    </div>
  `).join("") || "<p>No replies yet.</p>";
}

// Public replies remain available without signing in.
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
  if (!button) return;

  const editId = button.dataset.editPost;
  const deleteId = button.dataset.deleteAnnouncement;
  const adminDeleteId = button.dataset.adminDeleteAnnouncement;
  const replyId = button.dataset.deleteReply;

  if (editId) {
    if (!canManagePost(editId)) return;

    const { data: post, error } = await db
      .from("announcements")
      .select("title, body")
      .eq("id", Number(editId))
      .single();

    if (error || !post) {
      alert("Could not load this announcement.");
      return;
    }

    const title = prompt("Edit announcement title:", post.title);
    if (title === null) return;

    const body = prompt("Edit announcement text:", post.body);
    if (body === null) return;

    if (!title.trim() || !body.trim()) {
      alert("Title and announcement cannot be empty.");
      return;
    }

    button.disabled = true;

    const { error: updateError } = await db
      .from("announcements")
      .update({ title: title.trim(), body: body.trim() })
      .eq("id", Number(editId));

    button.disabled = false;

    if (updateError) {
      alert("Could not save changes. Check Supabase permissions.");
      console.error(updateError);
      return;
    }

    await loadAnnouncements();
    return;
  }

  if (deleteId) {
    if (!canManagePost(deleteId)) return;
    if (!confirm("Delete this announcement? This cannot be undone.")) return;

    button.disabled = true;

    const { error } = await db
      .from("announcements")
      .delete()
      .eq("id", Number(deleteId));

    if (error) {
      button.disabled = false;
      alert("Could not delete this announcement. Check Supabase permissions.");
      console.error(error);
      return;
    }

    const pins = getPostPins();
    delete pins[deleteId];
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pins));
    await loadAnnouncements();
    return;
  }

  if (adminDeleteId && adminPassword) {
    if (!confirm("Administrator: permanently delete this announcement?")) return;

    button.disabled = true;
    try {
      await callAdmin({
        action: "delete_announcement",
        id: Number(adminDeleteId)
      });
      await loadAnnouncements();
    } catch (error) {
      button.disabled = false;
      alert(error.message);
    }
    return;
  }

  if (replyId && adminPassword) {
    if (!confirm("Administrator: delete this reply?")) return;

    button.disabled = true;
    try {
      await callAdmin({
        action: "delete_reply",
        id: Number(replyId)
      });

      const article = button.closest(".announcement");
      const replies = article?.querySelector('[id^="replies-"]');
      if (replies) {
        await loadReplies(Number(replies.id.replace("replies-", "")));
      }
    } catch (error) {
      button.disabled = false;
      alert(error.message);
    }
  }
});

loadAnnouncements();
