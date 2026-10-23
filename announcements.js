
const SUPABASE_URL = "https://amsfewfyznnkvdwpiuza.supabase.co";
const SUPABASE_KEY = "sb_publishable_1ruYE9Vu88_-BSO9Hiycug_QZ8vZgT1";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const list = document.getElementById("announcement-list");

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

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
      <div id="replies-${a.id}">Loading replies...</div>
      <form class="reply-form" data-id="${a.id}">
        <label>Your display name
          <input name="author_name" maxlength="60" required>
        </label>
        <label>Your reply
          <textarea name="body" maxlength="2000" required></textarea>
        </label>
        <button type="submit">Post reply</button>
      </form>
    </article>
  `).join("");

  for (const a of data) {
    await loadReplies(a.id);
  }
}

async function loadReplies(id) {
  const target = document.getElementById(`replies-${id}`);

  const { data, error } = await db
    .from("replies")
    .select("id, author_name, body, created_at")
    .eq("announcement_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    target.textContent = "Replies could not be loaded.";
    return;
  }

  target.innerHTML = data.map(r => `
    <div class="reply">
      <strong>${escapeHTML(r.author_name)}</strong>
      <p>${escapeHTML(r.body).replace(/\n/g, "<br>")}</p>
    </div>
  `).join("") || "<p>No replies yet.</p>";
}

list.addEventListener("submit", async event => {
  if (!event.target.matches(".reply-form")) return;
  event.preventDefault();

  const form = event.target;
  const values = new FormData(form);
  const author_name = String(values.get("author_name")).trim();
  const body = String(values.get("body")).trim();
  const announcement_id = Number(form.dataset.id);

  const { error } = await db.from("replies").insert({
    announcement_id,
    author_name,
    body
  });

  if (error) {
    alert("Reply failed. We still need to configure guest-posting permissions.");
    console.error(error);
    return;
  }

  form.reset();
  await loadReplies(announcement_id);
});

loadAnnouncements();
