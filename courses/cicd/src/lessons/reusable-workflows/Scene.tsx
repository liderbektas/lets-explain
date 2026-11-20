import { motion } from "motion/react";
import { l } from "@lets-explain/core/i18n";
import { cut, Sticker, Terminal, type Box } from "../../iso/parts";
import { makeSimScene, resolveSteps, type SandboxRow, type Spec, type ViewInfo } from "../shared/SimScene";
import { missions } from "./missions";
import { compositeYaml, copies, FILE, freshRw, nodeOf, PLACES, rwSim, testYaml, wfYaml, WFS, type Place, type RW, type RwAction, type RwEvent } from "./model";

export const SLUG = "reusable-workflows";
export const START: RW = freshRw();

const node = (where: Place | "composite", n: number): RwAction => ({ type: "setNode", where, node: n });
const use = (place: Place): RwAction => ({ type: "useComposite", place });
const run: RwAction = { type: "run" };

const specs: Spec<RW, RwAction>[][] = [
  [run],
  [node("ci", 22), node("release", 22), run],
  [{ type: "createComposite" }, node("composite", 22), use("ci"), use("release"), use("nightly"), run],
  [node("composite", 24), run],
  [{ type: "createReusable" }, { type: "callReusable", wf: "ci" }, { type: "callReusable", wf: "release" }, run],
  [],
  [],
  [],
];

export const steps = resolveSteps(rwSim, START, specs);

const short: Record<Place, string> = { ci: "ci.yml", release: "release.yml", nightly: "nightly.yml", test: "test.yml" };

function rows(s: RW, lang: "tr" | "en"): SandboxRow<RwAction>[] {
  const tr = lang === "tr";
  return [
    {
      label: "Node 22",
      buttons: [
        ...PLACES.filter((p) => s.places[p].exists).map((p) => ({ label: short[p], action: node(p, 22), tone: "producer" as const, disabled: s.places[p].setup !== "inline" || s.places[p].node === 22 })),
        ...(s.composite.exists ? [{ label: "action.yml", action: node("composite", 22), tone: "producer" as const, disabled: s.composite.node === 22 }] : []),
      ],
    },
    {
      label: "Composite",
      buttons: s.composite.exists
        ? PLACES.filter((p) => s.places[p].exists).map((p) => ({ label: tr ? `${short[p]} kullansın` : `use in ${short[p]}`, action: use(p), tone: "ok" as const, disabled: s.places[p].setup === "composite" }))
        : [{ label: tr ? "action.yml oluştur" : "create action.yml", action: { type: "createComposite" }, tone: "ok" }],
    },
    {
      label: "Reusable",
      buttons: s.places.test.exists || s.calls.ci || s.calls.release
        ? (["ci", "release"] as const).map((wf) => ({ label: tr ? `${short[wf]} test.yml'yi çağırsın` : `${short[wf]} calls test.yml`, action: { type: "callReusable", wf } as RwAction, tone: "ok" as const, disabled: s.calls[wf] }))
        : [{ label: tr ? "test.yml oluştur" : "create test.yml", action: { type: "createReusable" }, tone: "ok" }],
    },
    { label: tr ? "Çalıştır" : "Run", buttons: [{ label: tr ? "üç workflow'u çalıştır" : "run all three workflows", action: run, tone: "go" }] },
  ];
}

/** A small YAML card with a fixed, readable font; lines that are new since `prev` light up. */
function MiniYaml({ text, prev, box, title, node, max = 12 }: { text: string; prev?: string; box: Box; title: string; node?: number; max?: number }) {
  const lines = text.split("\n");
  const old = prev === undefined ? null : new Set(prev.split("\n"));
  const lh = Math.min(15, (box.h - 46) / lines.length);
  const size = Math.min(max, lh * 0.82);
  const chars = Math.floor((box.w - 24) / (size * 0.6));
  return (
    <g className="ci">
      <Terminal box={box} title={title}>
        {node !== undefined && (
          <text x={box.x + box.w - 14} y={box.y + 19.5} textAnchor="end" className={node >= 22 ? "mono-ok" : "mono-key"} style={{ fontSize: 11 }}>
            Node {node}
          </text>
        )}
        {lines.map((line, i) => {
          const y = box.y + 46 + i * lh;
          const fresh = old && line.trim() !== "" && !old.has(line);
          const key = /^(\s*-?\s*)([a-z_-]+:)(.*)$/i.exec(line);
          return (
            <g key={i}>
              {fresh && <rect x={box.x + 6} y={y - lh + 2.5} width={box.w - 12} height={lh} rx={3} className="yaml-new" />}
              <text x={box.x + 12} y={y} className={line.trim().startsWith("#") ? "mono-dim" : "mono-light"} style={{ fontSize: size, whiteSpace: "pre" }}>
                {key ? (
                  <>
                    <tspan>{key[1]}</tspan>
                    <tspan className="mono-key">{key[2]}</tspan>
                    <tspan>{cut(key[3]!, Math.max(4, chars - key[1]!.length - key[2]!.length))}</tspan>
                  </>
                ) : (
                  cut(line, chars)
                )}
              </text>
            </g>
          );
        })}
      </Terminal>
    </g>
  );
}

function Missing({ box, text }: { box: Box; text: string }) {
  return (
    <g className="ci">
      <Sticker x={box.x} y={box.y} w={box.w} h={box.h} fill="var(--paper-2)">
        <text x={box.x + box.w / 2} y={box.y + box.h / 2 + 4} textAnchor="middle" className="muted">
          {text}
        </text>
      </Sticker>
    </g>
  );
}

/** Where a workflow's setup really lives: in its own file, in action.yml, or in test.yml it calls. */
const sourceOf = (s: RW, wf: (typeof WFS)[number]): "composite" | "test" | null => (wf !== "nightly" && s.calls[wf] ? "test" : s.places[wf].setup === "composite" ? "composite" : null);

const WF_ANCHOR = (i: number): [number, number] => [16 + i * 280 + 134, 226];
const SHARED_ANCHOR = { composite: [220, 266] as [number, number], test: [642, 266] as [number, number] };

/**
 * The links: a workflow that uses the composite action, or calls test.yml, points at it; it no
 * longer holds those steps itself. On a run, GitHub reads the shared file and uses its content:
 * a copy travels from the shared file into every workflow that points at it, test.yml first
 * picking up action.yml if it uses it too.
 */
function Links({ s, info }: { s: RW; info: ViewInfo<RW, RwAction, RwEvent> }) {
  const runNow = info.last.some((e) => e.type === "ran");
  const testUsesComposite = s.places.test.exists && s.places.test.setup === "composite";
  return (
    <g className="ci">
      {WFS.map((wf, i) => {
        const src = sourceOf(s, wf);
        if (!src) return null;
        const [x1, y1] = WF_ANCHOR(i);
        const [x2, y2] = SHARED_ANCHOR[src];
        const chain = src === "test" && testUsesComposite;
        return (
          <g key={wf}>
            <path d={`M${x1} ${y1} L${x2} ${y2}`} className="edge is-dim" />
            {runNow && (
              <motion.g key={`run-${info.played.length}-${wf}`} initial={{ x: x2, y: y2, opacity: 0 }} animate={{ x: x1, y: y1, opacity: [0, 1, 1, 0] }} transition={{ delay: (chain ? 0.5 : 0) + i * 0.12, duration: 0.6 }}>
                <rect x={-34} y={-9} width={68} height={18} rx={6} className="sticker" style={{ fill: src === "test" ? "var(--sky-soft)" : "var(--lilac-soft)", strokeWidth: 1.3 }} />
                <text y={4} textAnchor="middle" className="mono" style={{ fontSize: 10 }}>
                  {src === "test" ? "test.yml" : "action.yml"}
                </text>
              </motion.g>
            )}
          </g>
        );
      })}
      {testUsesComposite && (
        <g>
          <path d={`M${SHARED_ANCHOR.test[0] - 204} ${SHARED_ANCHOR.test[1] + 90} L${SHARED_ANCHOR.composite[0] + 204} ${SHARED_ANCHOR.composite[1] + 90}`} className="edge is-dim" />
          {runNow && (
            <motion.g key={`run-${info.played.length}-chain`} initial={{ x: SHARED_ANCHOR.composite[0] + 204, y: SHARED_ANCHOR.composite[1] + 90, opacity: 0 }} animate={{ x: SHARED_ANCHOR.test[0] - 204, y: SHARED_ANCHOR.test[1] + 90, opacity: [0, 1, 1, 0] }} transition={{ duration: 0.5 }}>
              <rect x={-34} y={-9} width={68} height={18} rx={6} className="sticker" style={{ fill: "var(--lilac-soft)", strokeWidth: 1.3 }} />
              <text y={4} textAnchor="middle" className="mono" style={{ fontSize: 10 }}>
                action.yml
              </text>
            </motion.g>
          )}
        </g>
      )}
    </g>
  );
}

function View({ s, info }: { s: RW; info: ViewInfo<RW, RwAction, RwEvent> }) {
  const tr = info.lang === "tr";
  const p = info.prev;
  const ran = new Map(info.last.flatMap((e) => (e.type === "ran" ? [[e.wf, e.node] as const] : [])));
  return (
    <g>
      {WFS.map((wf, i) => (
        <MiniYaml key={wf} text={wfYaml(s, wf)} prev={wfYaml(p, wf)} box={{ x: 16 + i * 280, y: 14, w: 268, h: 212 }} title={short[wf]} node={ran.get(wf) ?? nodeOf(s, wf)} max={11} />
      ))}
      {s.composite.exists ? (
        <MiniYaml text={compositeYaml(s)} prev={p.composite.exists ? compositeYaml(p) : undefined} box={{ x: 16, y: 266, w: 408, h: 192 }} title={FILE.composite} />
      ) : (
        <Missing box={{ x: 16, y: 266, w: 408, h: 186 }} text={tr ? "Composite action yok" : "No composite action"} />
      )}
      {s.places.test.exists ? (
        <MiniYaml text={testYaml(s)} prev={p.places.test.exists ? testYaml(p) : undefined} box={{ x: 438, y: 266, w: 408, h: 192 }} title={FILE.test} />
      ) : (
        <Missing box={{ x: 438, y: 266, w: 408, h: 186 }} text={tr ? "Reusable workflow yok" : "No reusable workflow"} />
      )}
      {/* On top of the cards: the links run through the gaps between them. */}
      <Links s={s} info={info} />
    </g>
  );
}

export const scene = makeSimScene({
  slug: SLUG,
  sim: rwSim,
  start: START,
  steps,
  label: l("Üstte üç workflow dosyası ve her birinin çalıştığı Node sürümü; altta ortak dosyalar", "Three workflow files on top with the Node each one runs; the shared files below"),
  view: (s, info) => <View s={s} info={info} />,
  metrics: (s, t) => [
    { label: t(l("Setup kopyası", "Copies of the setup")), value: copies(s), tone: copies(s) > 1 ? ("warn" as const) : ("ok" as const) },
    { label: t(l("Node sürümleri", "Node versions")), value: [...new Set(WFS.map((wf) => nodeOf(s, wf)))].join(" / ") },
    { label: t(l("Dosya düzenlemesi", "File edits")), value: s.edits },
  ],
  sandbox: { start: () => freshRw(), rows, missions },
});
