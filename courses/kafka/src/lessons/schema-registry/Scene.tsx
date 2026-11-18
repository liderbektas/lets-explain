import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import "./scene.css";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { project, type Frame } from "@lets-explain/core/iso/geometry";
import { NameTag } from "../../iso/PartitionStage";
import { Belt, Building, Flag, GhostSlot, Parcel, Person, Pill, TINTS, type PersonState } from "@lets-explain/core/iso/shapes";
import { usePlayback } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import type { EventLine } from "../shared/describe";
import { starsFor, type Change, type SceneProps } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import {
  base,
  fieldLabel,
  MODES,
  movesIn,
  SANDBOX_STEP,
  sandboxStart,
  simulate,
  type Action,
  type Edit,
  type Schema,
  type SREvent,
  type SRState,
} from "./model";

const SLUG = "schema-registry";
const W = 860;
const H = 470;
const F: Frame = { ox: 200, oy: 140, s: 38 };
const SLOT = 1.1;
const WINDOW = 8;
const BELT_END = WINDOW * SLOT + 0.75;
const LANE = 2.3;
const at = (x: number, y: number, z = 0) => project(F, x, y, z);
const spring = { type: "spring", stiffness: 170, damping: 22 } as const;

const text = {
  label: l(
    "Sipariş servisi bir banda kayıt yazıyor, Fatura okuyor, sağ üstte Schema Registry şemaları tutuyor",
    "The order service writes records onto a belt, billing reads them, and the Schema Registry at the top right keeps the schemas",
  ),
  producer: l("Sipariş servisi", "Order service"),
  reader: l("Fatura", "Billing"),
  registry: l("Schema Registry", "Schema Registry"),
  producerSchema: l("Yazdığı şema", "Schema it writes"),
  readerSchema: l("okuduğu", "reads"),
  noRegistry: l("registry yok: düz JSON", "no registry: plain JSON"),
  next: l("sıradaki", "next"),
  records: l("Kayıt", "Records"),
  ok: l("Okunan", "Read"),
  failed: l("Okunamayan", "Failed"),
  versions: l("Şema sürümü", "Schema versions"),
  mode: l("Mod", "Mode"),
  rejected: l("409 · uyumsuz", "409 · incompatible"),
  accepted: l("kabul: yeni sürüm", "accepted: new version"),
  fetch: l("şemayı getir", "fetch schema"),
  wire: l("Kafka'ya giden mesaj", "The message Kafka gets"),
  magic: l("sihirli byte", "magic byte"),
  schemaId: l("şema id (4 byte)", "schema id (4 bytes)"),
  payload: l("veri (Avro)", "data (Avro)"),
  legendRaw: l("şemasız JSON", "JSON, no schema"),
  legendId: l("renk ve # = şema id", "colour and # = schema id"),
  legendFailed: l("okunamadı", "could not read"),
  legendFlag: l("Fatura'nın sıradaki offset'i", "billing's next offset"),
  log: l("Sipariş servisi", "Order service"),
  write: l("Sipariş yaz", "Write order"),
  addCoupon: l("+ coupon (default'lu)", "+ coupon (with default)"),
  addCouponRequired: l("+ coupon (default'suz)", "+ coupon (no default)"),
  removeTotal: l("− total", "− total"),
  readOne: l("1 oku", "Read 1"),
  upgrade: l("Kodu güncelle", "Update code"),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
  thisStep: l("Bu adımda olanlar", "What happened in this step"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  waiting: l("Birazdan başlıyor…", "Starting…"),
  nothing: l("Bir düğmeye bas, sonucu burada gör.", "Press a button and see the result here."),
};

const KIND: Record<number, "order" | "payment" | "cancel"> = { 1: "order", 2: "payment", 3: "cancel" };
const kindFor = (id: number | null) => (id === null ? "neutral" : (KIND[((id - 1) % 3) + 1] ?? "order"));

const COLOURS = { order: "var(--mint)", payment: "var(--sky)", cancel: "var(--peach)", neutral: "#efe7d8" };
const colourFor = (id: number | null) => COLOURS[kindFor(id)];

const schemaText = (s: Schema) => s.map(fieldLabel).join(", ");

export function SchemaRegistryScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX_STEP;
  const [extra, setExtra] = useState<Action[]>([]);
  const { game, setMissionStars } = useGame();
  const best = game.missions[SLUG] ?? {};
  const [missionIndex, setMissionIndex] = useState<number | null>(() => {
    const i = missions.findIndex((m) => !best[m.id]);
    return i < 0 ? 0 : i;
  });

  const cursor = usePlayback(sandbox ? 0 : base.ends[step]! - base.startOf(step), paused, `${step}-${replayKey}`);
  const sandboxRun = useMemo(() => (sandbox ? simulate(extra, sandboxStart) : null), [sandbox, extra]);

  let state: SRState;
  let lastEvents: SREvent[];
  let shown: SREvent[];
  let history: SREvent[];
  if (sandboxRun) {
    state = sandboxRun.states[sandboxRun.states.length - 1]!;
    lastEvents = sandboxRun.events[sandboxRun.events.length - 1] ?? [];
    shown = sandboxRun.events.flat();
    history = shown;
  } else {
    const start = base.startOf(step);
    state = base.run.states[start + cursor]!;
    lastEvents = cursor > 0 ? base.run.events[start + cursor - 1]! : [];
    shown = base.run.events.slice(start, start + cursor).flat();
    history = base.run.events.slice(0, start + cursor).flat();
  }

  const mission = sandbox && missionIndex !== null ? missions[missionIndex]! : null;
  const won = Boolean(
    mission && sandboxRun && mission.check({ start: sandboxStart, state, actions: extra, events: sandboxRun.events }),
  );
  const missionId = mission?.id;
  useEffect(() => {
    if (won && missionId) setMissionStars(SLUG, missionId, starsFor(extra.length, missions[missionIndex!]!.par));
  }, [won, missionId, missionIndex, extra.length, setMissionStars]);
  const locked = won;
  const allowed = movesIn(state);
  const can = (a: Action) => !locked && allowed.some((m) => JSON.stringify(m) === JSON.stringify(a));
  const act = (a: Action) => {
    if (can(a)) setExtra((xs) => [...xs, a]);
  };
  const selectMission = (i: number | null) => {
    setMissionIndex(i);
    setExtra([]);
  };

  const failedOffsets = new Set(history.flatMap((e) => (e.type === "failed" ? [e.offset] : [])));
  const readNow = new Set(lastEvents.flatMap((e) => (e.type === "read" ? [e.offset] : [])));
  const rejectedNow = (sandbox ? lastEvents : shown).find((e) => e.type === "rejected");
  const registeredNow = lastEvents.some((e) => e.type === "registered");
  const fetchedNow = lastEvents.some((e) => e.type === "fetched");
  const producedNow = lastEvents.some((e) => e.type === "produced");
  const failedNow = lastEvents.some((e) => e.type === "failed");
  const pulse = sandbox ? extra.length : cursor;

  const failedCount = sandbox ? state.reader.failed - sandboxStart.reader.failed : state.reader.failed;
  const metrics: Metric[] = [
    { label: t(text.records), value: state.records.length },
    { label: t(text.ok), value: sandbox ? state.reader.ok - sandboxStart.reader.ok : state.reader.ok, tone: "ok" },
    { label: t(text.failed), value: failedCount, tone: failedCount > 0 ? "danger" : "plain" },
  ];
  if (state.registry) {
    metrics.push({ label: t(text.versions), value: state.versions.length });
    metrics.push({ label: t(text.mode), value: state.mode, tone: state.mode === "NONE" ? "warn" : "plain" });
  }

  const legend: LegendItem[] = [
    { swatch: <MiniCube fill="#efe7d8" />, label: t(text.legendRaw) },
    { swatch: <MiniCube fill="var(--sky)" />, label: t(text.legendId) },
    { swatch: <FailBadge r={7} />, label: t(text.legendFailed) },
    {
      swatch: (
        <g transform="translate(-6 5)">
          <line x1={0} y1={0} x2={0} y2={-15} className="flag-pole" />
          <path d="M0 -15h12l-2 3 2 3H0z" fill="var(--coral)" className="ink" />
        </g>
      ),
      label: t(text.legendFlag),
    },
  ];

  // Belt: the last few records, newest nearest the producer.
  const first = Math.max(0, state.records.length - WINDOW);
  const xOf = (offset: number) => 0.55 + (Math.max(offset, first) - first) * SLOT;
  const visible = state.records.filter((r) => r.offset >= first);
  const producerAt = at(BELT_END + 0.7, -1.0);
  const readerAt = at(xOf(state.reader.position), LANE);
  const [lookX, lookY] = at(xOf(state.reader.position), 0.68);
  const readerState: PersonState = failedNow ? "busy" : readNow.size > 0 ? "hop" : "idle";
  const REG: [number, number] = [712, 80];

  const lines = describe(shown, lang);
  const eventList = (
    <div className={`events ${sandbox ? "" : "is-short"}`} aria-live="polite">
      <h3>{t(sandbox ? text.latest : text.thisStep)}</h3>
      {lines.length === 0 ? (
        <p>{t(sandbox ? text.nothing : text.waiting)}</p>
      ) : (
        <ol>
          {(sandbox ? [...lines].reverse() : lines).map((line, i) => (
            <li key={`${pulse}-${i}`} className={`ev-${line.tone}`}>
              <span className="ev-dot" />
              <span>{line.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  const editBtn = (e: Edit, label: L) => (
    <button className="chip-btn is-producer" disabled={!can({ type: "edit", edit: e })} onClick={() => act({ type: "edit", edit: e })}>
      {t(label)}
    </button>
  );

  const footer = sandbox ? (
    <div className="sandbox">
      <MissionPanel missions={missions} active={missionIndex} onSelect={selectMission} moves={extra.length} won={won} best={best} />
      <div className="sandbox-controls" title={locked ? t(ui.locked) : undefined}>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: "var(--sky)" }} />
            {t(text.producer)}
          </span>
          <button className="chip-btn is-producer" disabled={!can({ type: "produce" })} onClick={() => act({ type: "produce" })}>
            {t(text.write)}
          </button>
          {editBtn("addCoupon", text.addCoupon)}
          {editBtn("addCouponRequired", text.addCouponRequired)}
          {editBtn("removeTotal", text.removeTotal)}
        </div>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: "var(--sun)" }} />
            {t(text.mode)}
          </span>
          {MODES.map((m) => (
            <button
              key={m}
              className={`chip-btn ${state.mode === m ? "is-ok" : ""}`}
              aria-pressed={state.mode === m}
              disabled={locked || state.mode === m}
              onClick={() => act({ type: "setMode", mode: m })}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="control-row">
          <span className="control-name">
            <i style={{ background: "var(--coral)" }} />
            {t(text.reader)}
          </span>
          <button className="chip-btn" disabled={!can({ type: "poll" })} onClick={() => act({ type: "poll" })}>
            {t(text.readOne)}
          </button>
          <button className="chip-btn is-ok" disabled={!can({ type: "upgradeReader" })} onClick={() => act({ type: "upgradeReader" })}>
            {t(text.upgrade)}
          </button>
        </div>
        <div className="control-row">
          <button className="chip-btn" disabled={extra.length === 0} onClick={() => setExtra((xs) => xs.slice(0, -1))}>
            <Icon name="undo" size={15} /> {t(text.undo)}
          </button>
          <button className="chip-btn" disabled={extra.length === 0} onClick={() => setExtra([])}>
            <Icon name="reset" size={15} /> {t(text.reset)}
          </button>
        </div>
      </div>
      {eventList}
    </div>
  ) : null;

  return (
    <SceneFrame metrics={metrics} controls={controls} legend={legend} paused={paused} width={W} height={H} label={t(text.label)} footer={footer}>
      {/* Registry: a service of its own, next to Kafka rather than inside it. */}
      <AnimatePresence>
        {state.registry && (
          <motion.g key="registry" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
            <RegistryLink from={producerAt} to={[REG[0] - 30, REG[1] + 130]} active={registeredNow || Boolean(rejectedNow)} bad={Boolean(rejectedNow)} />
            <RegistryLink from={[readerAt[0], readerAt[1] - 60]} to={[REG[0] - 112, REG[1] + 90]} active={fetchedNow} />
            <g transform={`translate(${REG[0]} ${REG[1]})`}>
              <Building s={26} roof={TINTS.sun} w={1.6} h={1.1} />
            </g>
            <RegistryCard x={598} y={REG[1] + 36} state={state} title={t(text.registry)} />
          </motion.g>
        )}
      </AnimatePresence>

      <g transform={`translate(${F.ox} ${F.oy})`}>
        <Belt s={F.s} from={-0.05} to={BELT_END} slot={SLOT} />
      </g>
      <motion.g initial={false} animate={{ x: at(xOf(state.records.length), 0)[0], y: at(xOf(state.records.length), 0)[1] }} transition={spring}>
        <GhostSlot s={F.s} />
      </motion.g>

      <AnimatePresence initial={false}>
        {visible.map((r) => {
          const [x, y] = at(xOf(r.offset), 0);
          const failed = failedOffsets.has(r.offset);
          return (
            <motion.g
              key={r.offset}
              initial={{ x: producerAt[0], y: producerAt[1] - 40, opacity: 0, scale: 0.6 }}
              animate={{ x, y, opacity: 1, scale: 1 }}
              exit={{ x: at(-0.5, 0)[0], y: at(-0.5, 0)[1], opacity: 0 }}
              transition={spring}
            >
              <Parcel
                s={F.s}
                kind={kindFor(r.schemaId)}
                label={r.schemaId === null ? "{ }" : `#${r.schemaId}`}
                state={readNow.has(r.offset) ? "read" : "normal"}
                readTint={TINTS.coral}
              />
              {failed && (
                <g transform={`translate(0 ${-F.s * 1.6})`}>
                  <g className="pop">
                    <FailBadge r={10} />
                  </g>
                </g>
              )}
            </motion.g>
          );
        })}
      </AnimatePresence>

      {/* Billing, standing at the offset it reads next. */}
      <motion.line initial={false} animate={{ x1: lookX, y1: lookY, x2: readerAt[0] + 4, y2: readerAt[1] - 92 }} transition={spring} className="sight-line" style={{ stroke: TINTS.coral.deep }} />
      <motion.g initial={false} animate={{ x: readerAt[0], y: readerAt[1] }} transition={spring}>
        <Person key={readerState === "hop" ? pulse : "steady"} tint={TINTS.coral} state={readerState} scale={1.15} />
        <g transform="translate(19 -8)">
          <Flag tint={TINTS.coral} label={state.reader.position} height={82} />
        </g>
        <NameTag y={22} text={t(text.reader)} tint={TINTS.coral} />
        <SchemaChip y={48} text={`${t(text.readerSchema)}: ${schemaText(state.reader.schema)}`} />
      </motion.g>

      <g transform={`translate(${producerAt[0]} ${producerAt[1]})`}>
        <Person
          key={producedNow ? pulse : "steady"}
          tint={TINTS.sky}
          state={producedNow ? "hop" : rejectedNow && lastEvents.includes(rejectedNow) ? "busy" : "idle"}
          scale={1.15}
          carrying={
            <g transform="scale(0.55)">
              <Parcel s={F.s} kind={state.registry ? "payment" : "neutral"} />
            </g>
          }
        />
        <NameTag y={22} text={t(text.producer)} tint={TINTS.sky} />
      </g>
      <ProducerCard x={648} y={352} title={t(text.producerSchema)} schema={state.producer} note={state.registry ? null : t(text.noRegistry)} />

      <AnimatePresence>
        {rejectedNow && rejectedNow.type === "rejected" && (
          <Pill key={`rej-${pulse}`} x={REG[0] - 4} y={REG[1] - 48} text={`${t(text.rejected)}: ${rejectedNow.reason}`} tone="danger" size={13} />
        )}
        {registeredNow && <Pill key={`acc-${pulse}`} x={REG[0] - 4} y={REG[1] - 48} text={t(text.accepted)} tone="ok" size={13} />}
        {fetchedNow && <Pill key={`f-${pulse}`} x={readerAt[0] + 70} y={readerAt[1] - 120} text={t(text.fetch)} tone="sun" />}
      </AnimatePresence>

      <AnimatePresence>{step === 4 && cursor > 0 && <WireCard key="wire" t={t} />}</AnimatePresence>
    </SceneFrame>
  );
}

/* ------------------------------------------------------------- pieces */

function RegistryLink({ from, to, active, bad }: { from: [number, number]; to: [number, number]; active: boolean; bad?: boolean }) {
  const d = `M${from[0]} ${from[1] - 70} C ${from[0]} ${(from[1] + to[1]) / 2 - 40}, ${to[0]} ${to[1] + 40}, ${to[0]} ${to[1]}`;
  return <path d={d} className={`link sr-link ${active ? (bad ? "is-broken" : "is-hot") : ""}`} />;
}

function RegistryCard({ x, y, state, title }: { x: number; y: number; state: SRState; title: string }) {
  const rows = state.versions.slice(-3);
  const w = 236;
  const h = 58 + Math.max(rows.length, 1) * 22;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect y={4} width={w} height={h} rx={14} className="pill-shadow" />
      <rect width={w} height={h} rx={14} className="ink" style={{ fill: "var(--card)" }} />
      <text x={14} y={22} className="sr-title">
        {title}
      </text>
      <rect x={w - 92} y={9} width={80} height={20} rx={10} className="ink" style={{ fill: state.mode === "NONE" ? "var(--red-soft)" : "var(--sun-soft)" }} />
      <text x={w - 52} y={23} textAnchor="middle" className="sr-mono">
        {state.mode}
      </text>
      <text x={14} y={44} className="label-soft">
        subject: orders-value
      </text>
      {rows.length === 0 && (
        <text x={14} y={68} className="label-soft">
          —
        </text>
      )}
      <AnimatePresence initial={false}>
        {rows.map((v, i) => (
          <motion.g key={v.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={spring}>
            <g transform={`translate(14 ${60 + i * 22})`}>
              <rect width={34} height={17} rx={8} className="ink" style={{ fill: colourFor(v.id) }} />
              <text x={17} y={12.5} textAnchor="middle" className="sr-mono">
                #{v.id}
              </text>
              <text x={42} y={13} className="sr-row">
                v{v.version}: {schemaText(v.schema)}
              </text>
            </g>
          </motion.g>
        ))}
      </AnimatePresence>
    </g>
  );
}

function ProducerCard({ x, y, title, schema, note }: { x: number; y: number; title: string; schema: Schema; note: string | null }) {
  const w = 196;
  const h = note ? 82 : 64;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect y={4} width={w} height={h} rx={14} className="pill-shadow" />
      <rect width={w} height={h} rx={14} className="ink" style={{ fill: "var(--sky-soft)" }} />
      <text x={12} y={20} className="label-soft">
        {title}
      </text>
      <AnimatePresence initial={false} mode="popLayout">
        {schema.map((f, i) => (
          <motion.g key={f.name + f.def} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
            <g transform={`translate(${12 + i * 62} 30)`}>
              <rect width={58} height={22} rx={11} className="ink" style={{ fill: f.def ? "var(--paper-2)" : "var(--card)" }} strokeDasharray={f.def ? "4 3" : undefined} />
              <text x={29} y={15.5} textAnchor="middle" className="sr-mono">
                {fieldLabel(f)}
              </text>
            </g>
          </motion.g>
        ))}
      </AnimatePresence>
      {note && (
        <text x={12} y={72} className="label-soft">
          {note}
        </text>
      )}
    </g>
  );
}

function SchemaChip({ y, text }: { y: number; text: string }) {
  const w = Math.round(text.length * 6.6 + 18);
  return (
    <g transform={`translate(0 ${y})`}>
      <rect x={-w / 2} y={-10} width={w} height={20} rx={10} className="ink" style={{ fill: "var(--card)" }} strokeDasharray="4 3" />
      <text y={4} textAnchor="middle" className="sr-mono">
        {text}
      </text>
    </g>
  );
}

function WireCard({ t }: { t: (x: L) => string }) {
  const cells: { w: number; fill: string; top: string; bottom: L }[] = [
    { w: 46, fill: "var(--paper-2)", top: "0", bottom: text.magic },
    { w: 120, fill: "var(--mint)", top: "00 00 00 01", bottom: text.schemaId },
    { w: 118, fill: "var(--card)", top: "02 a2 10 …", bottom: text.payload },
  ];
  let x = 14;
  return (
    <motion.g initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
      <g transform="translate(318 10)">
        <rect y={4} width={318} height={96} rx={14} className="pill-shadow" />
        <rect width={318} height={96} rx={14} className="ink" style={{ fill: "var(--card)" }} />
        <text x={14} y={22} className="sr-title">
          {t(text.wire)}
        </text>
        {cells.map((c) => {
          const cx = x;
          x += c.w + 6;
          return (
            <g key={c.top} transform={`translate(${cx} 34)`}>
              <rect width={c.w} height={30} rx={8} className="ink" style={{ fill: c.fill }} />
              <text x={c.w / 2} y={20} textAnchor="middle" className="sr-mono">
                {c.top}
              </text>
              <text x={c.w / 2} y={50} textAnchor="middle" className="label-soft">
                {t(c.bottom)}
              </text>
            </g>
          );
        })}
      </g>
    </motion.g>
  );
}

function FailBadge({ r }: { r: number }) {
  return (
    <g>
      <circle r={r} className="badge-down" />
      <text y={r * 0.42} textAnchor="middle" style={{ fill: "#fff", fontWeight: 900, fontSize: r * 1.3 }}>
        !
      </text>
    </g>
  );
}

function MiniCube({ fill }: { fill: string }) {
  return (
    <g stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="-7,-4 0,0 0,7 -7,3" style={{ fill }} />
      <polygon points="0,0 7,-4 7,3 0,7" style={{ fill }} opacity="0.75" />
      <polygon points="-7,-4 0,-8 7,-4 0,0" style={{ fill }} />
    </g>
  );
}

/* ------------------------------------------------------- event wording */

const orderName = (n: number, lang: Lang) => (lang === "tr" ? `sipariş ${n}` : `order ${n}`);

export function describe(events: SREvent[], lang: Lang): EventLine[] {
  const tr = lang === "tr";
  const out: EventLine[] = [];
  for (const e of events) {
    switch (e.type) {
      case "produced":
        out.push({
          tone: "produce",
          text:
            e.schemaId === null
              ? tr
                ? `Yazıldı: ${orderName(e.order, lang)} → offset ${e.offset} (düz JSON, şema yok)`
                : `Written: ${orderName(e.order, lang)} → offset ${e.offset} (plain JSON, no schema)`
              : tr
                ? `Yazıldı: ${orderName(e.order, lang)} → offset ${e.offset}, şema #${e.schemaId}`
                : `Written: ${orderName(e.order, lang)} → offset ${e.offset}, schema #${e.schemaId}`,
        });
        break;
      case "registered":
        out.push({
          tone: "ok",
          text: tr
            ? `Registry yeni şemayı kabul etti: v${e.version}, id #${e.id}`
            : `The registry accepted the new schema: v${e.version}, id #${e.id}`,
        });
        break;
      case "rejected":
        out.push({
          tone: "bad",
          text: tr
            ? `Registry reddetti (${e.mode}): "${e.reason}" alanı bir tarafta yok ve default'u da yok. Hiçbir şey yazılmadı.`
            : `The registry refused (${e.mode}): field "${e.reason}" is missing on one side and has no default. Nothing was written.`,
        });
        break;
      case "edited":
        out.push({
          tone: "plain",
          text: tr ? `Sipariş servisinin şeması: ${schemaText(e.schema)}` : `Order service schema: ${schemaText(e.schema)}`,
        });
        break;
      case "registryOn":
        out.push({
          tone: "ok",
          text: tr ? "İki taraf da artık registry serializer'ını kullanıyor" : "Both sides now use the registry serializer",
        });
        break;
      case "modeSet":
        out.push({ tone: "plain", text: tr ? `Uyumluluk modu: ${e.mode}` : `Compatibility mode: ${e.mode}` });
        break;
      case "fetched":
        out.push({
          tone: "plain",
          text: tr ? `Fatura registry'den şema #${e.id}'i aldı ve önbelleğe koydu` : `Billing fetched schema #${e.id} from the registry and cached it`,
        });
        break;
      case "read": {
        const prev = out[out.length - 1];
        if (prev && prev.tone === "read" && prev.text.startsWith(tr ? "Fatura okudu" : "Billing read")) {
          prev.text += `, ${e.offset}`;
        } else {
          out.push({ tone: "read", text: tr ? `Fatura okudu: offset ${e.offset}` : `Billing read: offset ${e.offset}` });
        }
        break;
      }
      case "failed":
        out.push({
          tone: "bad",
          text: tr
            ? `Fatura offset ${e.offset}'i okuyamadı: "${e.missing}" alanı yok!`
            : `Billing could not read offset ${e.offset}: field "${e.missing}" is missing!`,
        });
        break;
      case "readerUpgraded":
        out.push({
          tone: "ok",
          text: tr ? `Fatura'nın kodu güncellendi: artık v${e.version} ile okuyor` : `Billing's code was updated: it now reads with v${e.version}`,
        });
        break;
      case "nothing":
        out.push({ tone: "plain", text: tr ? "Yapılacak bir şey yok" : "Nothing to do" });
        break;
    }
  }
  return out;
}

/* ------------------------------------------------- "what changed" per step */

const both = (tr: string, en: string): L => ({ tr, en });

export function changesFor(step: number): Change[] {
  if (step >= SANDBOX_STEP) return [];
  const events = base.run.events.slice(base.startOf(step), base.ends[step]!).flat();
  const out: Change[] = [];
  const produced = events.filter((e) => e.type === "produced");
  const reads = events.filter((e) => e.type === "read").length;
  const fails = events.filter((e) => e.type === "failed");
  for (const e of events) {
    if (e.type === "edited") out.push({ kind: "change", text: both(`Şema: ${schemaText(e.schema)}`, `Schema: ${schemaText(e.schema)}`) });
    if (e.type === "registryOn") out.push({ kind: "add", text: both("Schema Registry devrede", "Schema Registry in use") });
    if (e.type === "registered") out.push({ kind: "good", text: both(`Kabul edildi: v${e.version} → id #${e.id}`, `Accepted: v${e.version} → id #${e.id}`) });
    if (e.type === "rejected") out.push({ kind: "bad", text: both(`Reddedildi (${e.mode}): \`${e.reason}\``, `Rejected (${e.mode}): \`${e.reason}\``) });
    if (e.type === "fetched") out.push({ kind: "change", text: both(`Fatura şema #${e.id}'i registry'den aldı`, `Billing fetched schema #${e.id}`) });
    if (e.type === "readerUpgraded") out.push({ kind: "good", text: both(`Fatura artık v${e.version} ile okuyor`, `Billing now reads with v${e.version}`) });
  }
  if (produced.length > 0) {
    const n = produced.length;
    out.push({ kind: "add", text: both(`+${n} kayıt yazıldı`, `+${n} record${n > 1 ? "s" : ""} written`) });
  } else if (events.some((e) => e.type === "rejected")) {
    out.push({ kind: "good", text: both("Kafka'ya hiçbir bozuk kayıt gitmedi", "No broken record reached Kafka") });
  }
  if (reads > 0) out.push({ kind: "good", text: both(`Fatura ${reads} kaydı sorunsuz okudu`, `Billing read ${reads} record${reads > 1 ? "s" : ""} fine`) });
  if (fails.length > 0) {
    out.push({
      kind: "bad",
      text: both(
        `Fatura ${fails.length} kaydı okuyamadı (\`${fails[0]!.type === "failed" ? fails[0]!.missing : ""}\` yok)`,
        `Billing failed on ${fails.length} record${fails.length > 1 ? "s" : ""} (\`${fails[0]!.type === "failed" ? fails[0]!.missing : ""}\` missing)`,
      ),
    });
  }
  return out;
}
