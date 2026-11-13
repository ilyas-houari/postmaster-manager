const FILE = "allowed_emails.json";

function githubConfig() {
  const token = process.env.GITHUB_ACCESS_TOKEN;
  const owner = process.env.GITHUB_ACCESS_OWNER;
  const repo = process.env.GITHUB_ACCESS_REPO;

  if (!token || !owner || !repo) {
    throw new Error("GitHub configuration missing");
  }

  return {
    url: `https://api.github.com/repos/${owner}/${repo}/contents/${FILE}`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  };
}

export async function getAllowedEmails(): Promise<string[]> {
  const { url, headers } = githubConfig();

  const response = await fetch(url, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitHub read failed: ${response.status}`);
  }

  const file = await response.json();
  const decoded = Buffer.from(file.content, "base64").toString("utf8");
  const data = JSON.parse(decoded);

  if (!Array.isArray(data.emails)) {
    throw new Error("Invalid allowed_emails.json");
  }

  return data.emails;
}

export async function approveEmail(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Invalid email");
  }

  const { url, headers } = githubConfig();

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`GitHub read failed: ${response.status}`);
    }

    const file = await response.json();
    const data = JSON.parse(
      Buffer.from(file.content, "base64").toString("utf8")
    );

    if (!Array.isArray(data.emails)) {
      throw new Error("Invalid allowed_emails.json");
    }

    const emails = [...new Set(
      [...data.emails, normalized].map((e: string) =>
        e.trim().toLowerCase()
      )
    )];

    if (data.emails.includes(normalized)) return;

    const content = Buffer.from(
      JSON.stringify({ emails }, null, 2) + "\n"
    ).toString("base64");

    const update = await fetch(url, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Approve access: ${normalized}`,
        content,
        sha: file.sha,
      }),
      cache: "no-store",
    });

    if (update.ok) return;
    if (update.status !== 409) {
      throw new Error(`GitHub update failed: ${update.status}`);
    }
  }

  throw new Error("GitHub update conflict");
}
