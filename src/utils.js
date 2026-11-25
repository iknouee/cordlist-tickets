export function slugify(value) {
  const slug = String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  return slug || "ticket";
}

export function parseQuestions(value = "") {
  const questions = value
    .split(";")
    .map((question) => question.trim())
    .filter(Boolean);

  if (questions.length > 5) {
    throw new Error("A category can have at most five intake questions.");
  }

  if (questions.some((question) => question.length > 45)) {
    throw new Error("Each intake question must be 45 characters or fewer.");
  }

  return questions;
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export function createTranscriptHtml(ticket, messages) {
  const rows = [...messages]
    .reverse()
    .map((message) => {
      const author = escapeHtml(message.author?.tag ?? "Unknown user");
      const timestamp = escapeHtml(
        message.createdAt?.toISOString?.() ?? new Date().toISOString(),
      );
      const content = escapeHtml(message.content || "(no text)").replace(
        /\r?\n/g,
        "<br>",
      );
      const attachments = [...(message.attachments?.values?.() ?? [])]
        .map(
          (attachment) =>
            `<li><a href="${escapeHtml(attachment.url)}">${escapeHtml(attachment.name || "Attachment")}</a></li>`,
        )
        .join("");

      return `<article><header><strong>${author}</strong><time>${timestamp}</time></header><p>${content}</p>${attachments ? `<ul>${attachments}</ul>` : ""}</article>`;
    })
    .join("\n");
  const category = escapeHtml(ticket.categoryName);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ticket transcript - ${category}</title>
<style>
body{background:#0d1117;color:#e6edf3;font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:900px;padding:24px}
h1{font-size:1.4rem}article{border-top:1px solid #30363d;padding:14px 0}header{display:flex;justify-content:space-between;gap:12px}time{color:#8b949e;font-size:.85rem}p{overflow-wrap:anywhere;white-space:normal}a{color:#58a6ff}
</style>
</head>
<body>
<h1>Ticket transcript: ${category}</h1>
<p>Opened by ${escapeHtml(ticket.userTag)} · Channel ${escapeHtml(ticket.channelId)}</p>
${rows || "<p>No messages were available for this transcript.</p>"}
</body>
</html>`;
}
