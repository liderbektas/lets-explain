import { motion } from "motion/react";
import { l } from "@lets-explain/core/i18n";
import { YamlPanel } from "../../iso/panels";
import { cut, StatusDot, Sticker } from "../../iso/parts";
import { makeSimScene, resolveSteps, type Spec, type ViewInfo } from "../shared/SimScene";
import { scenarios } from "./scenarios";
import { lpTyped } from "./shell";
import { BAD_SHA, codeOf, freshLp, GOOD_SHA, lpSim, lpYaml, scopes, type LP, type LpAction, type LpEvent, type Perms } from "./model";

export const SLUG = "least-privilege";
export const START: LP = freshLp();

const push: LpAction = { type: "push" };
export const perms = (p: Perms): LpAction => ({ type: "setPerms", perms: p });
export const pin = (pinned: boolean): LpAction => ({ type: "pin", pinned });

const specs: Spec<LP, LpAction>[][] = [
  [push],
  [{ type: "moveTag" }, push],
  [{ type: "cleanup" }, pin(true), push],
  [perms("read-all"), push],
  [perms("per-job"), push, pin(false), push],
  [],
  [],
];

export const steps = resolveSteps(lpSim, START, specs);

function Row({ x, y, ok, text }: { x: number; y: number; ok: boolean | null; text: string }) {
  return (
    <g>
      <StatusDot status={ok === null ? "skipped" : ok ? "success" : "failure"} x={x + 8} y={y - 4} r={7} />
      <text x={x + 22} y={y} className="mono" style={{ fontSize: 11.5 }}>
        {cut(text, 52)}
      </text>
    </g>
  );
}

/** The door a right opens: write opens it both ways, read only lets you look in, none keeps it shut. */
const RIGHT_FILL = { write: "var(--coral)", read: "var(--sky)", none: "#e9e5ec" } as const;

/**
 * A job's keycard: the doors its GITHUB_TOKEN opens. One slot per door (the repository's
 * contents, the package registry), coloured by the right on the card.
 */
function KeyCard({ x, y, job, sc, ok }: { x: number; y: number; job: string; sc: { contents: string; packages: string }; ok: boolean }) {
  const w = 208;
  const slot = (dx: number, name: string, right: string) => (
    <g>
      <rect x={x + dx} y={y + 25} width={90} height={32} rx={5} style={{ fill: RIGHT_FILL[right as keyof typeof RIGHT_FILL], stroke: "var(--ink)", strokeWidth: 1.3, strokeDasharray: right === "none" ? "3 3" : undefined }} />
      <text x={x + dx + 8} y={y + 37} className="sub" style={{ fontSize: 10 }}>
        {name}
      </text>
      <text x={x + dx + 8} y={y + 52} className="mono" style={{ fontSize: 12.5, fill: right === "none" ? "var(--ink-3)" : undefined }}>
        {right}
      </text>
    </g>
  );
  return (
    <g>
      <rect x={x} y={y + 3} width={w} height={62} rx={9} className="sticker-shadow" />
      <rect x={x} y={y} width={w} height={62} rx={9} className="sticker" style={{ fill: "var(--card)" }} />
      <rect x={x + 1} y={y + 1} width={8} height={60} rx={4} style={{ fill: "var(--lilac)" }} />
      <circle cx={x + 22} cy={y + 14} r={4} style={{ fill: "var(--paper-2)", stroke: "var(--ink)", strokeWidth: 1.2 }} />
      <text x={x + 34} y={y + 18} className="mono" style={{ fontSize: 12.5 }}>
        {job}
      </text>
      <StatusDot status={ok ? "success" : "failure"} x={x + w - 16} y={y + 14} r={7} />
      {slot(14, "contents", sc.contents)}
      {slot(108, "packages", sc.packages)}
    </g>
  );
}

/**
 * The action's repository as two commits and a tag. `v1` is just a pointer: when the attacker
 * moves it, it slides from the known commit to the bad one. The workflow's reference follows the
 * tag, or, once pinned, points at the known commit directly; the commit it reaches is what runs.
 */
function TagDiagram({ s, x, y, tr }: { s: LP; x: number; y: number; tr: boolean }) {
  const good = { x: x + 190, y };
  const bad = { x: x + 330, y };
  const tagAt = s.tagMoved ? bad : good;
  const runs = codeOf(s) === "good" ? good : bad;
  // The workflow's `uses:` reference: to the tag, or straight to the commit when pinned.
  const target = s.pinned ? { x: good.x - 11, y: good.y } : { x: tagAt.x - 16, y: tagAt.y - 24 };
  return (
    <g>
      <text x={x + 16} y={y + 4} className="mono" style={{ fontSize: 11.5 }}>
        ci.yml
      </text>
      <motion.path initial={false} animate={{ d: `M${x + 66} ${y} C ${x + 110} ${y}, ${target.x - 40} ${target.y}, ${target.x} ${target.y}` }} transition={{ duration: 0.5 }} className="edge" />
      <line x1={good.x} x2={bad.x} y1={y} y2={y} className="edge is-dim" />
      {[good, ...(s.tagMoved ? [bad] : [])].map((c, i) => (
        <motion.g key={i} initial={i === 1 ? { opacity: 0, scale: 0.6 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
          <circle cx={c.x} cy={c.y} r={9} className="dot" style={{ fill: i === 0 ? "var(--mint)" : "var(--red)" }} />
          <text x={c.x} y={c.y + 24} textAnchor="middle" className="sub" style={{ fontSize: 10 }}>
            {(i === 0 ? GOOD_SHA : BAD_SHA).slice(0, 7)}
          </text>
        </motion.g>
      ))}
      {/* the tag slides when it is moved */}
      <motion.g initial={false} animate={{ x: tagAt.x, y: tagAt.y - 24 }} transition={{ duration: 0.6 }}>
        <rect x={-16} y={-10} width={32} height={18} rx={9} className="sticker" style={{ fill: "var(--sun)", strokeWidth: 1.3 }} />
        <text y={3.5} textAnchor="middle" className="mono" style={{ fontSize: 10.5 }}>
          v1
        </text>
        <line x1={0} x2={0} y1={8} y2={14} className="edge" />
      </motion.g>
      {/* the commit that will run */}
      <motion.circle initial={false} animate={{ cx: runs.x }} cy={y} r={14} transition={{ duration: 0.6 }} style={{ fill: "none", stroke: codeOf(s) === "good" ? "#3fd07f" : "var(--red)", strokeWidth: 3 }} />
      <text x={x + 16} y={y + 26} className="sub" style={{ fontSize: 10 }}>
        {codeOf(s) === "good" ? (tr ? "çalışacak: bilinen kod" : "will run: known code") : tr ? "çalışacak: KÖTÜ kod" : "will run: BAD code"}
      </text>
    </g>
  );
}

function View({ s, info }: { s: LP; info: ViewInfo<LP, LpAction, LpEvent> }) {
  const tr = info.lang === "tr";
  const run = s.runs[s.runs.length - 1];
  const lint = scopes(s.perms, "lint");
  const pub = scopes(s.perms, "publish");
  const x = 384;
  const w = 462;
  return (
    <g className="ci">
      <YamlPanel yaml={lpYaml(s)} prev={lpYaml(info.prev)} box={{ x: 16, y: 14, w: 350, h: 444 }} title=".github/workflows/ci.yml" />

      <Sticker x={x} y={14} w={w} h={112} head="var(--lilac-soft)" headH={32}>
        <text x={x + 16} y={36} className="title" style={{ fontSize: 14 }}>
          acme/lint-action
        </text>
        <text x={x + w - 14} y={36} textAnchor="end" className="sub">
          {s.pinned ? (tr ? "SHA'ya sabit" : "pinned to a SHA") : tr ? "etiketle: @v1" : "by tag: @v1"}
        </text>
        <TagDiagram s={s} x={x} y={84} tr={tr} />
      </Sticker>

      <Sticker x={x} y={136} w={w} h={118} head="var(--sun-soft)" headH={32}>
        <text x={x + 16} y={158} className="title" style={{ fontSize: 14 }}>
          GITHUB_TOKEN
        </text>
        <text x={x + w - 14} y={158} textAnchor="end" className="sub">
          permissions: {s.perms}
        </text>
        <KeyCard x={x + 14} y={180} job="lint" sc={lint} ok={lint.contents === "read" && lint.packages !== "write"} />
        <KeyCard x={x + w / 2 + 4} y={180} job="publish" sc={pub} ok={pub.packages === "write"} />
      </Sticker>

      <Sticker x={x} y={266} w={w} h={192} head={run ? (run.attack?.repo || run.attack?.registry ? "var(--red-soft)" : run.publish === "denied" ? "var(--sun-soft)" : "var(--mint-soft)") : "var(--paper-2)"} headH={32}>
        <text x={x + 16} y={288} className="title" style={{ fontSize: 14 }}>
          {run ? (tr ? `Son run #${run.id}` : `Last run #${run.id}`) : tr ? "Henüz run yok" : "No run yet"}
        </text>
        <text x={x + w - 14} y={288} textAnchor="end" className="sub">
          main: {s.tampered ? (tr ? "kötü commit var" : "has a bad commit") : tr ? "temiz" : "clean"}
        </text>
        {run && (
          <g>
            <Row x={x + 14} y={320} ok={run.code === "good"} text={`lint: ${run.code === "good" ? (tr ? "bilinen kod çalıştı" : "ran known code") : tr ? "KÖTÜ kod çalıştı" : "ran BAD code"}`} />
            <Row x={x + 14} y={348} ok={run.attack ? !run.attack.repo : null} text={run.attack ? (run.attack.repo ? (tr ? "main'e push: başarılı (kötü commit)" : "push to main: succeeded (bad commit)") : tr ? "main'e push: 403, token salt okunur" : "push to main: 403, read-only token") : tr ? "main'e push denemesi yok" : "no push to main attempted"} />
            <Row x={x + 14} y={376} ok={run.attack ? !run.attack.registry : null} text={run.attack ? (run.attack.registry ? (tr ? "registry: kötü image gönderildi" : "registry: bad image pushed") : tr ? "registry'ye push: 403" : "registry push: 403") : tr ? "registry'ye kötü push denemesi yok" : "no bad registry push attempted"} />
            <Row x={x + 14} y={404} ok={run.publish === "pushed"} text={run.publish === "pushed" ? (tr ? "publish: ghcr.io/ada/shop gönderildi" : "publish: pushed ghcr.io/ada/shop") : tr ? "publish: denied (packages: write yok)" : "publish: denied (no packages: write)"} />
          </g>
        )}
      </Sticker>
    </g>
  );
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: lpSim,
  start: START,
  steps,
  label: l("Solda workflow; sağda üçüncü parti action'ın hangi kodu çalıştırdığı, token'ın yetkileri ve son run'da ne olduğu", "The workflow on the left; on the right, which code the third-party action runs, the token's rights, and what the last run did"),
  view: (s, info) => <View s={s} info={info} />,
  metrics: (s, t) => [
    { label: "permissions", value: s.perms },
    { label: t(l("Action", "Action")), value: s.pinned ? `@${GOOD_SHA.slice(0, 7)}` : "@v1" },
    { label: "main", value: s.tampered ? t(l("kirli", "tampered")) : t(l("temiz", "clean")), tone: s.tampered ? ("danger" as const) : ("ok" as const) },
  ],
  // Typed: the workflow is a real file; a push runs it against this model.
  sandbox: { typed: lpTyped(scenarios) },
});
