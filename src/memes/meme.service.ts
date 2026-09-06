import { env } from "../config/env.js";
import { MemeRepository, type Meme } from "./meme.repository.js";

export type MemeRepositoryLike = Pick<MemeRepository, "pickLeastRecentlyUsed" | "markUsed" | "count">;
export type MemeContent = { filename: string; caption?: string };

export class MemeService {
  constructor(
    private readonly repository: MemeRepositoryLike = new MemeRepository(),
    private readonly now: () => Date = () => new Date(),
    private readonly sendEnabled: () => boolean = () => env.MEMES_SEND_ENABLED
  ) {}

  async pickMemeContent(): Promise<MemeContent | undefined> {
    if (!this.sendEnabled()) {
      return undefined;
    }

    const count = await this.repository.count();
    if (count === 0) {
      return undefined;
    }

    const meme = await this.repository.pickLeastRecentlyUsed();
    if (!meme) {
      return undefined;
    }

    await this.repository.markUsed(meme.id, this.now());
    return toMemeContent(meme);
  }
}

export const memeService = new MemeService();

function toMemeContent(meme: Meme): MemeContent {
  return { filename: meme.filename, caption: meme.caption ?? undefined };
}
