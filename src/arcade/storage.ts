export const STORAGE_KEY = 'chopsticks.arcade.v1';
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface RunRecord { score: number; level: number; longestStreak: number; bestCatch: number; daily: boolean; date: string }
export interface ArcadeSave {
  bestScore: number; bestLevel: number; longestStreak: number; muted: boolean;
  topScores: RunRecord[]; daily: { date: string; score: number };
}
const count = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
const dateValid = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
function local(): StoragePort | null { try { return window.localStorage; } catch { return null; } }

export class ArcadeStorage {
  readonly data: ArcadeSave = { bestScore: 0, bestLevel: 1, longestStreak: 0, muted: false,
    topScores: [], daily: { date: '', score: 0 } };
  constructor(private readonly port: StoragePort | null = local()) {
    try {
      const saved = JSON.parse(port?.getItem(STORAGE_KEY) ?? 'null');
      if (!saved || typeof saved !== 'object') return;
      this.data.bestScore = count(saved.bestScore);
      this.data.bestLevel = Math.max(1, count(saved.bestLevel, 1));
      this.data.longestStreak = count(saved.longestStreak);
      this.data.muted = saved.muted === true;
      if (Array.isArray(saved.topScores)) this.data.topScores = saved.topScores
        .filter((r: RunRecord) => r && count(r.score, -1) >= 0 && count(r.level, -1) > 0
          && count(r.longestStreak, -1) >= 0 && count(r.bestCatch, -1) >= 0 && dateValid(r.date) && r.daily === false)
        .map((r: RunRecord) => ({ score: r.score, level: r.level, longestStreak: r.longestStreak,
          bestCatch: r.bestCatch, daily: false, date: r.date }))
        .sort((a: RunRecord, b: RunRecord) => b.score - a.score).slice(0, 10);
      if (dateValid(saved.daily?.date)) this.data.daily = { date: saved.daily.date, score: count(saved.daily.score) };
    } catch { /* Private browsing, corrupt saves and quota errors never block play. */ }
  }
  dailyBest(date: string): number { return this.data.daily.date === date ? this.data.daily.score : 0; }
  record(run: RunRecord): void {
    if (count(run.score, -1) < 0 || !dateValid(run.date)) return;
    if (run.daily) {
      this.data.daily = { date: run.date, score: Math.max(run.score, this.dailyBest(run.date)) };
    } else {
      this.data.bestScore = Math.max(this.data.bestScore, run.score);
      this.data.bestLevel = Math.max(this.data.bestLevel, run.level);
      this.data.longestStreak = Math.max(this.data.longestStreak, run.longestStreak);
      this.data.topScores.push({ ...run });
      this.data.topScores.sort((a, b) => b.score - a.score);
      this.data.topScores.length = Math.min(10, this.data.topScores.length);
    }
    this.save();
  }
  setMuted(muted: boolean): void { this.data.muted = muted; this.save(); }
  private save(): void { try { this.port?.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch { /* In-memory records remain usable. */ } }
}
