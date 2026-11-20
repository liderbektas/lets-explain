import type { Change } from "@lets-explain/core/course/types";
import { l, type Lang } from "@lets-explain/core/i18n";
import type { Line } from "../../engine/describe";
import type { Sim } from "../shared/SimScene";

/**
 * A workflow with two jobs: `lint` uses a third-party action, `publish` pushes an image.
 * The third-party action is referenced by tag (`@v1`) or pinned to a commit SHA. An attacker
 * who gets into the action's repo can move the `v1` tag to bad code; a pinned SHA cannot move.
 * The bad code tries to push to our repo and our registry with the job's GITHUB_TOKEN, and
 * gets as far as that token's permissions allow.
 */

export type Perms = "write-all" | "read-all" | "per-job";

export const GOOD_SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
export const BAD_SHA = "6e6f7a8b9c0d1e2f3a4b5c6d7e8f90a1b2c3d4e5";

export interface LpRun {
  id: number;
  /** Which code the lint action really ran. */
  code: "good" | "bad";
  /** The bad code's attempts, and whether the token let them through. */
  attack: null | { repo: boolean; registry: boolean };
  publish: "pushed" | "denied";
  /** The settings the run started with. */
  perms: Perms;
  pinned: boolean;
}

export interface LP {
  perms: Perms;
  pinned: boolean;
  /** The attacker has moved `v1` to the bad commit. */
  tagMoved: boolean;
  /** A commit the bad code pushed is sitting on main. */
  tampered: boolean;
  runs: LpRun[];
}

export type LpAction =
  | { type: "setPerms"; perms: Perms }
  | { type: "pin"; pinned: boolean }
  | { type: "moveTag" }
  | { type: "cleanup" }
  | { type: "push" };

export type LpEvent =
  | { type: "config"; what: "perms" | "pin"; value: string }
  | { type: "tagMoved" }
  | { type: "cleaned" }
  | { type: "ran"; run: number; code: "good" | "bad"; ref: string }
  | { type: "attack"; run: number; target: "repo" | "registry"; ok: boolean }
  | { type: "publish"; run: number; ok: boolean }
  | { type: "error" };

export const freshLp = (o: Partial<LP> = {}): LP => ({ perms: "write-all", pinned: false, tagMoved: false, tampered: false, runs: [], ...o });

/** What each job's token may do. */
export function scopes(perms: Perms, job: "lint" | "publish"): { contents: "read" | "write"; packages: "read" | "write" | "none" } {
  if (perms === "write-all") return { contents: "write", packages: "write" };
  if (perms === "read-all") return { contents: "read", packages: "read" };
  return job === "lint" ? { contents: "read", packages: "none" } : { contents: "read", packages: "write" };
}

export const refOf = (s: LP) => (s.pinned ? GOOD_SHA : "v1");
export const codeOf = (s: LP): "good" | "bad" => (!s.pinned && s.tagMoved ? "bad" : "good");

const refuse = (s: LP) => ({ state: s, events: [{ type: "error" } as LpEvent] });

export function applyLp(s: LP, a: LpAction): { state: LP; events: LpEvent[] } {
  switch (a.type) {
    case "setPerms":
      if (s.perms === a.perms) return refuse(s);
      return { state: { ...s, perms: a.perms }, events: [{ type: "config", what: "perms", value: a.perms }] };
    case "pin":
      if (s.pinned === a.pinned) return refuse(s);
      return { state: { ...s, pinned: a.pinned }, events: [{ type: "config", what: "pin", value: a.pinned ? GOOD_SHA.slice(0, 7) : "v1" }] };
    case "moveTag":
      if (s.tagMoved) return refuse(s);
      return { state: { ...s, tagMoved: true }, events: [{ type: "tagMoved" }] };
    case "cleanup":
      if (!s.tampered) return refuse(s);
      return { state: { ...s, tampered: false }, events: [{ type: "cleaned" }] };
    case "push": {
      const id = s.runs.length + 1;
      const code = codeOf(s);
      const lint = scopes(s.perms, "lint");
      const pub = scopes(s.perms, "publish");
      const events: LpEvent[] = [{ type: "ran", run: id, code, ref: s.pinned ? GOOD_SHA.slice(0, 7) : "v1" }];
      let attack: LpRun["attack"] = null;
      if (code === "bad") {
        attack = { repo: lint.contents === "write", registry: lint.packages === "write" };
        events.push({ type: "attack", run: id, target: "repo", ok: attack.repo }, { type: "attack", run: id, target: "registry", ok: attack.registry });
      }
      const publish: LpRun["publish"] = pub.packages === "write" ? "pushed" : "denied";
      events.push({ type: "publish", run: id, ok: publish === "pushed" });
      return { state: { ...s, tampered: s.tampered || Boolean(attack?.repo), runs: [...s.runs, { id, code, attack, publish, perms: s.perms, pinned: s.pinned }] }, events };
    }
  }
}

function describeLp(e: LpEvent, lang: Lang): Line {
  const tr = lang === "tr";
  switch (e.type) {
    case "config":
      return { text: e.what === "perms" ? `permissions: ${e.value}` : tr ? `acme/lint-action artık @${e.value}` : `acme/lint-action is now @${e.value}`, tone: "plain" };
    case "tagMoved":
      return { text: tr ? "Saldırgan acme/lint-action'ın v1 etiketini kötü commit'e taşıdı" : "An attacker moved acme/lint-action's v1 tag to a bad commit", tone: "bad" };
    case "cleaned":
      return { text: tr ? "Kötü commit geri alındı, token'lar yenilendi" : "The bad commit was reverted and tokens rotated", tone: "read" };
    case "ran":
      return { text: tr ? `#${e.run} lint: acme/lint-action@${e.ref} → ${e.code === "good" ? "bilinen kod" : "KÖTÜ kod"}` : `#${e.run} lint: acme/lint-action@${e.ref} → ${e.code === "good" ? "known code" : "BAD code"}`, tone: e.code === "good" ? "plain" : "bad" };
    case "attack":
      return {
        text:
          e.target === "repo"
            ? e.ok ? (tr ? "  main'e kötü bir commit push'landı" : "  a bad commit was pushed to main") : tr ? "  main'e push denemesi: 403 (token salt okunur)" : "  push to main attempt: 403 (read-only token)"
            : e.ok ? (tr ? "  registry'ye kötü bir image gönderildi" : "  a bad image was pushed to the registry") : tr ? "  registry'ye push denemesi: 403" : "  registry push attempt: 403",
        tone: e.ok ? "bad" : "ok",
      };
    case "publish":
      return { text: e.ok ? (tr ? "  publish: image gönderildi" : "  publish: image pushed") : tr ? "  publish: denied, packages: write izni yok" : "  publish: denied, no packages: write", tone: e.ok ? "ok" : "bad" };
    case "error":
      return { text: tr ? "Bu hamle şu an bir şey değiştirmez." : "That move changes nothing now.", tone: "bad" };
  }
}

function lpChanges(before: LP, after: LP): Change[] {
  const out: Change[] = [];
  if (before.perms !== after.perms) out.push({ kind: "change", text: l(`İzinler: \`${after.perms}\``, `Permissions: \`${after.perms}\``) });
  if (before.pinned !== after.pinned) out.push({ kind: "change", text: after.pinned ? l("Action bir commit SHA'sına sabitlendi", "The action is pinned to a commit SHA") : l("Action yine `@v1` etiketiyle", "The action uses the `@v1` tag again") });
  if (!before.tagMoved && after.tagMoved) out.push({ kind: "bad", text: l("`v1` etiketi artık kötü kodu gösteriyor", "The `v1` tag now points at bad code") });
  for (const r of after.runs.slice(before.runs.length)) {
    if (r.attack?.repo) out.push({ kind: "bad", text: l(`Run #${r.id}: main'e kötü commit girdi`, `Run #${r.id}: a bad commit landed on main`) });
    if (r.attack?.registry) out.push({ kind: "bad", text: l(`Run #${r.id}: registry'ye kötü image girdi`, `Run #${r.id}: a bad image landed in the registry`) });
    if (r.attack && !r.attack.repo && !r.attack.registry) out.push({ kind: "good", text: l(`Run #${r.id}: kötü kod çalıştı ama token hiçbir şeye yazamadı`, `Run #${r.id}: bad code ran but the token could write nothing`) });
    if (!r.attack) out.push({ kind: "good", text: l(`Run #${r.id}: lint bilinen kodla çalıştı`, `Run #${r.id}: lint ran known code`) });
    out.push(r.publish === "pushed" ? { kind: "good", text: l(`Run #${r.id}: image yayınlandı`, `Run #${r.id}: image published`) } : { kind: "bad", text: l(`Run #${r.id}: publish reddedildi (403)`, `Run #${r.id}: publish denied (403)`) });
  }
  if (before.tampered && !after.tampered) out.push({ kind: "good", text: l("Repo temizlendi", "The repo is clean again") });
  return out;
}

export const lpSim: Sim<LP, LpAction, LpEvent> = { apply: applyLp, describe: describeLp, changes: lpChanges };

/* ------------------------------------------------------------------ YAML */

export function lpYaml(s: LP, fullSha = false): string {
  const perm =
    s.perms === "write-all" ? ["permissions: write-all"] : s.perms === "read-all" ? ["permissions: read-all"] : ["permissions:", "  contents: read"];
  const ref = s.pinned ? `${fullSha ? GOOD_SHA : `${GOOD_SHA.slice(0, 12)}…`} # v1.4.2` : "v1";
  return [
    "name: CI",
    "on:",
    "  push:",
    "    branches: [main]",
    "",
    ...perm,
    "",
    "jobs:",
    "  lint:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    `      - uses: acme/lint-action@${ref}`,
    "  publish:",
    "    needs: lint",
    "    runs-on: ubuntu-latest",
    ...(s.perms === "per-job" ? ["    permissions:", "      contents: read", "      packages: write"] : []),
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: docker/build-push-action@v6",
    "        with:",
    "          push: true",
    "          tags: ghcr.io/ada/shop:sha-${{ github.sha }}",
  ].join("\n");
}
