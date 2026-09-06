import { readdir } from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { db } from "../../database/client.js";
import { memes } from "../../database/schema.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

let inserted = 0;
let skipped = 0;

const categoryEntries = await readdir(env.MEMES_DIR, { withFileTypes: true }).catch(() => []);

for (const entry of categoryEntries) {
  if (!entry.isDirectory()) {
    continue;
  }

  const category = entry.name;
  const categoryDir = path.join(env.MEMES_DIR, category);
  const files = await readdir(categoryDir);

  for (const file of files) {
    if (!IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) {
      continue;
    }

    const filename = `${category}/${file}`;
    const [row] = await db.insert(memes).values({ category, filename }).onConflictDoNothing({ target: memes.filename }).returning({ id: memes.id });

    if (row) {
      inserted += 1;
    } else {
      skipped += 1;
    }
  }
}

console.log(`Memes sync: ${inserted} novo(s), ${skipped} ja registrado(s), pasta: ${env.MEMES_DIR}`);
process.exit(0);
