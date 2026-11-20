import { describe, expect, it } from "vitest";
import { latestRun } from "../../engine/ci";
import { typeInto } from "../shared/missionHelpers";
import { scenarios } from "./scenarios";
import { cacheResult, installTime, scene, steps } from "./Scene";

type Way = { typed: string[]; edits: ((t: string) => string)[] };

const CI = "nano .github/workflows/ci.yml";
const SETUP_BLOCK = "      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n";

/** Adds an actions/cache step for ~/.npm right after setup-node. */
const addCache = (key: string) => (t: string) => t.replace(SETUP_BLOCK, `${SETUP_BLOCK}      - uses: actions/cache@v4\n        with:\n          path: ~/.npm\n          key: ${key}\n`);
const npmCache = addCache("npm-${{ hashFiles('package-lock.json') }}");
/** The one-line way: setup-node keeps ~/.npm itself. */
const setupNodeCache = (t: string) => t.replace("          node-version: 22\n", "          node-version: 22\n          cache: npm\n");
const keyOnLock = (t: string) => t.replace("key: node_modules-deps", "key: node_modules-${{ hashFiles('package-lock.json') }}");
const alwaysInstall = (t: string) => t.replace("        if: steps.cache.outputs.cache-hit != 'true'\n", "");
const shaToLock = (t: string) => t.replace("key: npm-${{ github.sha }}", "key: npm-${{ hashFiles('package-lock.json') }}");

/** What a reader would type, and how each editor is saved. Exactly par commands. */
const solutions: Record<string, Way> = {
  warm: { typed: [CI, 'git commit -am "ci: cache npm"', "git push", "gh run list", "gh run rerun 2"], edits: [npmCache] },
  "new-dependency": { typed: ["npm install dayjs", 'git commit -am "add dayjs for dates"', "git push"], edits: [] },
  stale: { typed: ["gh run view --log-failed", CI, 'git commit -am "ci: key the cache on the lockfile"', "git push"], edits: [keyOnLock] },
  "never-hits": { typed: ["cat .github/workflows/ci.yml", CI, 'git commit -am "ci: key the cache on the lockfile"', "git push", 'echo "// tidy" >> src/app.ts', 'git commit -am "tidy"', "git push"], edits: [shaToLock] },
};

/** Other ways people really do it, which must count too. */
const alternatives: Record<string, Way[]> = {
  warm: [
    { typed: [CI, 'git commit -am "ci: setup-node cache"', "git push", "gh run rerun 2"], edits: [setupNodeCache] },
    { typed: [CI, 'git commit -am "ci: cache npm"', "git push", 'echo "// tidy" >> src/app.ts', 'git commit -am "tidy"', "git push"], edits: [npmCache] },
  ],
  "new-dependency": [{ typed: ["npm i dayjs", "git add package.json package-lock.json", 'git commit -m "deps: dayjs"', "git push origin main"], edits: [] }],
  stale: [
    { typed: [CI, 'git commit -am "ci: always run npm ci"', "git push"], edits: [alwaysInstall] },
    { typed: [CI, "git add .github/workflows/ci.yml", 'git commit -m "ci: fix the cache key"', "git push"], edits: [(t) => alwaysInstall(keyOnLock(t))] },
  ],
  "never-hits": [{ typed: [CI, 'git commit -am "ci: cache via setup-node"', "git push", 'echo "// tidy" >> src/app.ts', 'git commit -am "tidy"', "git push"], edits: [(t) => setupNodeCache(t.replace(/      - id: cache\n        uses: actions\/cache@v4\n        with:\n          path: ~\/.npm\n          key: .*\n/, ""))] }],
};

/** Tempting wrong moves that must not pass. */
const wrong: Record<string, Way> = {
  // The cache is saved by this run; nothing has used it yet.
  warm: { typed: [CI, 'git commit -am "ci: cache npm"', "git push"], edits: [npmCache] },
  // package.json by hand, lockfile untouched: same key, same old packages.
  "new-dependency": { typed: ["nano package.json", 'git commit -am "add dayjs"', "git push"], edits: [(t) => t.replace('"name": "shop",', '"name": "shop",\n  "dependencies": { "dayjs": "^1.11.13" },')] },
  // A fresh fixed key fixes today and walks into the same trap tomorrow.
  stale: { typed: [CI, 'git commit -am "ci: new cache"', "git push"], edits: [(t) => t.replace("key: node_modules-deps", "key: node_modules-v2")] },
  // A re-run hits the sha key of the same commit; the next commit would still miss.
  "never-hits": { typed: ["gh run rerun 2"], edits: [] },
};

describe("caching", () => {
  it("the story: no cache, miss and save, hit, new key, the stale trap, the fix", () => {
    expect(steps).toHaveLength(9);
    const r = (s: number) => latestRun(scene.at(s));
    expect(scene.at(0).runs.map((x) => installTime(x))).toEqual([45, 45]);
    expect([cacheResult(r(1)), installTime(r(1))]).toEqual(["miss", 45]);
    expect([cacheResult(r(2)), installTime(r(2))]).toEqual(["hit", 12]);
    expect([cacheResult(r(3)), installTime(r(3)), r(3)!.status]).toEqual(["miss", 45, "success"]);
    expect([cacheResult(r(4)), installTime(r(4)), r(4)!.status]).toEqual(["miss", 45, "success"]);
    expect([cacheResult(r(5)), installTime(r(5)), r(5)!.status]).toEqual(["hit", "skipped", "failure"]);
    expect([cacheResult(r(6)), r(6)!.status]).toEqual(["miss", "success"]);
  });

  it("setup-node's own cache misses, saves, then hits like actions/cache", () => {
    const s = scenarios.find((x) => x.id === "warm")!;
    const r = typeInto(s.start, [CI, 'git commit -am "ci"', "git push", "gh run rerun 2"], [setupNodeCache]);
    const runs = r.ctx.state.world.runs.slice(1);
    expect(runs.map((x) => [cacheResult(x), installTime(x)])).toEqual([
      ["miss", 45],
      ["hit", 12],
    ]);
  });

  for (const s of scenarios) {
    it(`${s.id}: not done at the start`, () => {
      expect(s.check(typeInto(s.start, []).ctx)).toBe(false);
    });

    it(`${s.id}: the intended commands win in exactly par`, () => {
      const { typed, edits } = solutions[s.id]!;
      const r = typeInto(s.start, typed, [...edits]);
      expect(r.output.filter((x) => /^(fatal|error|Invalid)/.test(x)), r.output.join("\n")).toEqual([]);
      expect(r.moves).toBe(s.par);
      expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
    });

    for (const [i, alt] of (alternatives[s.id] ?? []).entries()) {
      it(`${s.id}: also wins another way (${i + 1})`, () => {
        const r = typeInto(s.start, alt.typed, [...alt.edits]);
        expect(s.check(r.ctx), r.output.join("\n")).toBe(true);
      });
    }

    it(`${s.id}: a tempting wrong move does not win`, () => {
      const { typed, edits } = wrong[s.id]!;
      expect(s.check(typeInto(s.start, typed, [...edits]).ctx)).toBe(false);
    });
  }
});
