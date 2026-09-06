import assert from "node:assert/strict";
import { test } from "node:test";
import type { Meme } from "./meme.repository.js";
import { MemeService, type MemeRepositoryLike } from "./meme.service.js";

const fixedNow = new Date("2026-09-06T12:00:00");

class FakeRepository implements MemeRepositoryLike {
  public marked: Array<{ id: string; at: Date }> = [];

  constructor(
    private readonly total: number,
    private readonly next: Meme | undefined
  ) {}

  async count(): Promise<number> {
    await Promise.resolve();
    return this.total;
  }

  async pickLeastRecentlyUsed(): Promise<Meme | undefined> {
    await Promise.resolve();
    return this.next;
  }

  async markUsed(id: string, at: Date = new Date()): Promise<void> {
    await Promise.resolve();
    this.marked.push({ id, at });
  }
}

const sampleMeme: Meme = {
  id: "meme-1",
  category: "backend",
  filename: "bug-in-prod.jpg",
  caption: "Sexta-feira, deploy na prod",
  lastUsedAt: null
};

void test("pickMemeContent returns undefined when meme sending is disabled", async () => {
  const repository = new FakeRepository(5, sampleMeme);
  const service = new MemeService(repository, () => fixedNow, () => false);

  const content = await service.pickMemeContent();

  assert.equal(content, undefined);
  assert.deepEqual(repository.marked, []);
});

void test("pickMemeContent returns undefined when the catalog is empty", async () => {
  const repository = new FakeRepository(0, undefined);
  const service = new MemeService(repository, () => fixedNow, () => true);

  const content = await service.pickMemeContent();

  assert.equal(content, undefined);
});

void test("pickMemeContent marks the chosen meme as used and returns its content", async () => {
  const repository = new FakeRepository(5, sampleMeme);
  const service = new MemeService(repository, () => fixedNow, () => true);

  const content = await service.pickMemeContent();

  assert.deepEqual(content, { filename: "bug-in-prod.jpg", caption: "Sexta-feira, deploy na prod" });
  assert.deepEqual(repository.marked, [{ id: "meme-1", at: fixedNow }]);
});
