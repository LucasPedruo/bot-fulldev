import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeEventostiCard, parseCards } from "./eventosti-dev.provider.js";

const sampleHtml = `
<html><body>
<section id="proximos-eventos-section">
  <div class="row">
    <div class="col-6 col-lg-3 mb-4">
      <div class="card rounded-0">
        <div class="card-body">
          <h5 class="card-title mb-2"><a href="https://gambiconf.dev/" target="_blank">GambiConf 2026</a></h5>
          <div class="card-text mb-3">
            <span class="badge bg-secondary">Híbrido</span>
            <span class="badge bg-primary">Pago</span>
            <div class="meta">De: 28/11/2026
                às 09:00:00 </div>
            <div class="meta">Até: 29/11/2026
                às 19:30:00 </div>
            <div class="meta">São Paulo - SP</div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-6 col-lg-3 mb-4">
      <div class="card rounded-0">
        <div class="card-body">
          <h5 class="card-title mb-2"><a href="https://weekend.developerslife.tech/" target="_blank">The Developer's Life Weekend</a></h5>
          <div class="card-text mb-3">
            <span class="badge bg-secondary">Online</span>
            <span class="badge bg-primary">Gratuito</span>
            <div class="meta">De: 06/11/2026
                às 18:00:00 </div>
            <div class="meta">Até: 07/11/2026
                às 18:00:00 </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
</body></html>
`;

void test("parseCards extracts title, url, modality label and meta lines for each card", () => {
  const cards = parseCards(sampleHtml);

  assert.equal(cards.length, 2);
  assert.equal(cards[0].title, "GambiConf 2026");
  assert.equal(cards[0].url, "https://gambiconf.dev/");
  assert.equal(cards[0].modalityLabel, "Híbrido");
  assert.equal(cards[0].metas.length, 3);
});

void test("normalizeEventostiCard maps a hybrid event with a location meta", () => {
  const [card] = parseCards(sampleHtml);
  const event = normalizeEventostiCard(card);

  assert.ok(event);
  assert.equal(event?.externalId, "2026-11-28-gambiconf-2026");
  assert.equal(event?.source, "EventostiDev");
  assert.equal(event?.title, "GambiConf 2026");
  assert.equal(event?.modality, "hybrid");
  assert.equal(event?.location, "São Paulo - SP");
  assert.equal(event?.startDate?.getFullYear(), 2026);
  assert.equal(event?.startDate?.getMonth(), 10);
  assert.equal(event?.startDate?.getDate(), 28);
});

void test("normalizeEventostiCard maps an online event with no location meta", () => {
  const cards = parseCards(sampleHtml);
  const event = normalizeEventostiCard(cards[1]);

  assert.ok(event);
  assert.equal(event?.modality, "online");
  assert.equal(event?.location, undefined);
});

void test("normalizeEventostiCard returns undefined when the date meta cannot be parsed", () => {
  const event = normalizeEventostiCard({
    title: "Evento Sem Data",
    url: "https://example.com/",
    modalityLabel: "Presencial",
    metas: ["Data a confirmar"]
  });

  assert.equal(event, undefined);
});
