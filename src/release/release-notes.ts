import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Both files live at the project root. This module resolves to src/release/ in development (tsx)
// and dist/release/ in the built image, so two levels up lands on the root either way - which is
// also why the Dockerfile has to copy CHANGELOG.md into the runner stage.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export type ReleaseSection = {
  /** The "### Adicionado" style heading, when the entry has one. */
  title?: string;
  /** The bullet lines of the section, already stripped of their markdown markers. */
  changes: string[];
};

export type ReleaseNote = {
  version: string;
  date?: string;
  sections: ReleaseSection[];
};

export async function readCurrentVersion(root: string = projectRoot): Promise<string> {
  const raw = await readFile(path.join(root, "package.json"), "utf8");
  const parsed = JSON.parse(raw) as { version?: string };

  if (!parsed.version) {
    throw new Error("package.json has no version field");
  }

  return parsed.version;
}

export async function readReleaseNote(version: string, root: string = projectRoot): Promise<ReleaseNote | undefined> {
  let raw: string;

  try {
    raw = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
  } catch {
    // A missing changelog is not an error worth crashing the boot over - it just means there is
    // nothing to announce.
    return undefined;
  }

  return parseReleaseNote(raw, version);
}

// Keep a Changelog puts each release behind a "## [x.y.z] - date" heading and groups the bullets
// under "### Adicionado" / "### Removido" style sections. The brackets and the date are both
// optional here so a hand-written "## 0.2.0" still parses.
export function parseReleaseNote(changelog: string, version: string): ReleaseNote | undefined {
  const lines = changelog.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => matchVersionHeading(line) === version);

  if (headingIndex === -1) {
    return undefined;
  }

  const heading = lines[headingIndex];
  const dateMatch = /-\s*(\d{4}-\d{2}-\d{2})\s*$/.exec(heading);
  const sections: ReleaseSection[] = [];
  let current: ReleaseSection | undefined;

  for (const line of lines.slice(headingIndex + 1)) {
    // A "## " heading means the next release started. "### " is a section inside this one, so it
    // has to be excluded from that check.
    if (/^##\s/.test(line)) {
      break;
    }

    const sectionHeading = /^###+\s+(.*)$/.exec(line);
    if (sectionHeading) {
      current = { title: sectionHeading[1].trim(), changes: [] };
      sections.push(current);
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      // Supports a changelog that lists bullets straight under the version, with no section.
      if (!current) {
        current = { changes: [] };
        sections.push(current);
      }

      current.changes.push(bullet[1].trim());
      continue;
    }

    // A wrapped bullet is indented continuation text, not a new item - fold it into the previous
    // one so a line break in the markdown does not become a separate bullet in WhatsApp.
    if (current && current.changes.length > 0 && /^\s+\S/.test(line)) {
      const last = current.changes.length - 1;
      current.changes[last] = `${current.changes[last]} ${line.trim()}`;
    }
  }

  const populated = sections.filter((section) => section.changes.length > 0);

  if (populated.length === 0) {
    return undefined;
  }

  return { version, date: dateMatch?.[1], sections: populated };
}

function matchVersionHeading(line: string): string | undefined {
  const match = /^##\s+\[?v?([0-9]+\.[0-9]+\.[0-9]+[^\]\s]*)\]?/.exec(line);
  return match?.[1];
}

// WhatsApp renders no markdown, so the message is plain text with "•" bullets. The section
// headings are kept: without them, a bullet that sat under "Removido" reads in the group exactly
// like something that was just added.
export function formatReleaseAnnouncement(note: ReleaseNote): string {
  const blocks = note.sections.map((section) => {
    const bullets = section.changes.map((change) => `• ${change}`).join("\n");
    return section.title ? `${section.title}\n${bullets}` : bullets;
  });

  return [`🦆 Quackson atualizado — versão ${note.version}`, ...blocks].join("\n\n");
}
