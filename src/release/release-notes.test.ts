import assert from "node:assert/strict";
import { test } from "node:test";
import { formatReleaseAnnouncement, parseReleaseNote } from "./release-notes.js";

const changelog = `# Changelog

Preamble text that must never be picked up as a change.

## [0.3.0] - 2026-10-01

### Adicionado

- Recurso novo da versao mais recente.

## [0.2.0] - 2026-09-10

### Adicionado

- Primeira mudanca.
- Uma mudanca com texto que continua
  em outra linha do markdown.

### Removido

- Mensagem de despedida.

## [0.1.0] - 2026-08-01

- Versao inicial.
`;

void test("parses the entry of the requested version only", () => {
  const note = parseReleaseNote(changelog, "0.2.0");

  assert.ok(note);
  assert.equal(note.version, "0.2.0");
  assert.equal(note.date, "2026-09-10");
  assert.deepEqual(note.sections, [
    {
      title: "Adicionado",
      changes: ["Primeira mudanca.", "Uma mudanca com texto que continua em outra linha do markdown."]
    },
    { title: "Removido", changes: ["Mensagem de despedida."] }
  ]);
});

void test("stops at the next release heading", () => {
  const note = parseReleaseNote(changelog, "0.3.0");

  assert.deepEqual(note?.sections, [{ title: "Adicionado", changes: ["Recurso novo da versao mais recente."] }]);
});

void test("reads an entry whose bullets have no section heading", () => {
  const note = parseReleaseNote(changelog, "0.1.0");

  assert.deepEqual(note?.sections, [{ changes: ["Versao inicial."] }]);
});

void test("returns undefined for a version with no entry", () => {
  assert.equal(parseReleaseNote(changelog, "9.9.9"), undefined);
});

void test("returns undefined when the entry has only empty sections", () => {
  assert.equal(parseReleaseNote("## [1.0.0] - 2026-01-01\n\n### Adicionado\n", "1.0.0"), undefined);
});

void test("accepts headings without brackets, without a date and with a v prefix", () => {
  assert.deepEqual(parseReleaseNote("## 1.2.3\n- Mudanca.\n", "1.2.3")?.sections, [{ changes: ["Mudanca."] }]);
  assert.deepEqual(parseReleaseNote("## [v1.2.3]\n- Mudanca.\n", "1.2.3")?.sections, [{ changes: ["Mudanca."] }]);
});

void test("does not confuse a version with a prefix of another", () => {
  const note = parseReleaseNote("## [0.2.10]\n- Dez.\n\n## [0.2.1]\n- Um.\n", "0.2.1");

  assert.deepEqual(note?.sections, [{ changes: ["Um."] }]);
});

void test("keeps the section heading so a removal does not read like an addition", () => {
  const note = parseReleaseNote(changelog, "0.2.0");
  const text = formatReleaseAnnouncement(note!);

  // The bug this guards: dropping the headings turned "Removido: mensagem de despedida" into a
  // bullet that reads as a brand new feature.
  const removidoIndex = text.indexOf("Removido");
  assert.ok(removidoIndex > -1);
  assert.ok(text.indexOf("• Mensagem de despedida.") > removidoIndex);
  assert.ok(text.indexOf("• Primeira mudanca.") < removidoIndex);
});

void test("formats the announcement as plain text with bullets", () => {
  const text = formatReleaseAnnouncement({
    version: "0.2.0",
    sections: [{ title: "Adicionado", changes: ["Uma coisa.", "Outra coisa."] }]
  });

  assert.match(text, /versão 0\.2\.0/);
  assert.ok(text.includes("• Uma coisa."));
  assert.ok(text.includes("• Outra coisa."));
  // WhatsApp renders no markdown, so none must leak into the message.
  assert.ok(!text.includes("#"));
  assert.ok(!text.includes("**"));
});

void test("formats an entry that has no section heading", () => {
  const text = formatReleaseAnnouncement({ version: "1.0.0", sections: [{ changes: ["Só isso."] }] });

  assert.equal(text, "🦆 Quackson atualizado — versão 1.0.0\n\n• Só isso.");
});
