export function buildShareUrl(publicUrl: string, ref: string) {
  const url = new URL(publicUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("ref", ref.trim());
  return url.toString();
}

export function formatIssueEmbed(issue: {
  identifier: string;
  title: string;
  statusName: string;
  priority: string;
  assigneeName: string | null;
  description?: string | null;
}) {
  const lines = [
    `**${issue.identifier}** — ${issue.title}`,
    `Status: ${issue.statusName}`,
    `Priority: ${issue.priority}`,
  ];
  if (issue.assigneeName) {
    lines.push(`Assignee: ${issue.assigneeName}`);
  }
  if (issue.description?.trim()) {
    const preview =
      issue.description.length > 400
        ? `${issue.description.slice(0, 397)}…`
        : issue.description;
    lines.push("", preview);
  }
  return lines.join("\n");
}
