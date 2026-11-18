import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@lets-explain/core/components/Icon";
import { MissionPanel } from "@lets-explain/core/components/MissionPanel";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { l, useLang, type L } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { NameTag } from "../../iso/PartitionStage";
import { Belt, Building, IsoBox, Parcel, Person, Pill, TINTS, type Shades } from "@lets-explain/core/iso/shapes";
import { usePlayback, useTicker } from "@lets-explain/core/lib/playback";
import { useGame } from "@lets-explain/core/lib/storage";
import { starsFor, type SceneProps } from "@lets-explain/core/course/types";
import { missions } from "./missions";
import {
  applyMove,
  BATCHES,
  knobsAfter,
  measure,
  SANDBOX_STEP,
  settingsOf,
  START_KNOBS,
  steps,
  type Measure,
  type SandboxMove,
  type Settings,
} from "./model";
import "./scene.css";

const SLUG = "why-fast";
const W = 860;
const H = 470;

const text = {
  label: l(
    "Producer'dan broker'a, oradan partition'lar üzerinden consumer'lara giden kayıtlar",
    "Records going from the producer to the broker, and through partitions to consumers",
  ),
  producer: l("Producer", "Producer"),
  broker: l("Broker", "Broker"),
  consumer: l("Consumer", "Consumer"),
  idle: l("boşta", "idle"),
  cache: l("page cache (RAM)", "page cache (RAM)"),
  disk: l("disk", "disk"),
  produce: l("Yazma /sn", "Writes /s"),
  requests: l("İstek /sn", "Requests /s"),
  network: l("Ağ MB/sn", "Network MB/s"),
  consume: l("Okuma /sn", "Reads /s"),
  netFull: l("ağ dolu", "network full"),
  seq: l("Sıralı yazma: hep sona", "Sequential: always at the end"),
  rnd: l("Rastgele yazma: oraya buraya", "Random: here and there"),
  seqSpeed: l("HDD'de ~150 MB/sn", "~150 MB/s on an HDD"),
  rndSpeed: l("HDD'de ~1 MB/sn", "~1 MB/s on an HDD"),
  readsFrom: l("bellekten okundu", "read from memory"),
  where: l("nereden okunacak?", "read from where?"),
  flush: l("işletim sistemi sonra diske yazar", "the OS writes it to disk later"),
  boxDisk: l("Disk", "Disk"),
  boxCache: l("Page cache", "Page cache"),
  boxJvm: l("Kafka (JVM)", "Kafka (JVM)"),
  boxSocket: l("Socket buffer", "Socket buffer"),
  boxNic: l("Ağ kartı", "Network card"),
  classic: l("klasik yol: 4 kopya", "classic path: 4 copies"),
  zero: l("sendfile: JVM'e hiç girmez", "sendfile: never enters the JVM"),
  copies: l("kaç kopya?", "how many copies?"),
  legendParcel: l("kayıt", "record"),
  legendCrate: l("paket (batch), üstünde kayıt sayısı", "batch, with its record count"),
  legendLz4: l("lz4 ile sıkıştırılmış paket", "batch compressed with lz4"),
  legendBelt: l("bant = bir partition", "belt = one partition"),
  rowBatch: l("Batch", "Batch"),
  rowComp: l("Sıkıştırma", "Compression"),
  rowParts: l("Partition", "Partitions"),
  rowCons: l("Consumer", "Consumers"),
  perReq: l("kayıt/istek", "records/request"),
  none: l("yok", "none"),
  undo: l("Geri al", "Undo"),
  reset: l("Sıfırla", "Reset"),
  latest: l("Son değişiklikler (en yenisi üstte)", "Latest changes (newest first)"),
  nothing: l("Bir ayarı değiştir, etkisini burada gör.", "Change a setting and see its effect here."),
};

export function WhyFastScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const fmt = (n: number) => n.toLocaleString(lang === "tr" ? "tr-TR" : "en-US");
  const sandbox = step === SANDBOX_STEP;
  const view = steps[step]!;
  const cursor = usePlayback(sandbox ? 0 : 1, paused, `${step}-${replayKey}`);
  const revealed = cursor >= 1;
  const tick = useTicker(!sandbox && view.mode !== "pipeline", paused, 900, `${step}-${replayKey}`);

  const [moves, setMoves] = useState<SandboxMove[]>([]);
  const { game, setMissionStars } = useGame();
  const best = game.missions[SLUG] ?? {};
  const [missionIndex, setMissionIndex] = useState<number | null>(() => {
    const i = missions.findIndex((m) => !best[m.id]);
    return i < 0 ? 0 : i;
  });
  const knobs = useMemo(() => knobsAfter(moves), [moves]);

  const settings: Settings = sandbox ? settingsOf(knobs) : revealed ? view.after : view.before;
  const m = measure(settings);

  const mission = sandbox && missionIndex !== null ? missions[missionIndex]! : null;
  const won = Boolean(mission && mission.check({ knobs, m }));
  const missionId = mission?.id;
  useEffect(() => {
    if (won && missionId) setMissionStars(SLUG, missionId, starsFor(moves.length, missions[missionIndex!]!.par));
  }, [won, missionId, missionIndex, moves.length, setMissionStars]);
  const locked = won;
  const selectMission = (i: number | null) => {
    setMissionIndex(i);
    setMoves([]);
  };
  const act = (mv: SandboxMove) => {
    if (!locked && applyMove(knobs, mv)) setMoves((xs) => [...xs, mv]);
  };
  const can = (mv: SandboxMove) => !locked && applyMove(knobs, mv) !== null;

  const pipeline = view.mode === "pipeline" || sandbox;
  const metrics: Metric[] = pipeline
    ? [
        { label: t(text.produce), value: fmt(m.produce), tone: m.networkBound ? "warn" : "plain" },
        { label: t(text.requests), value: fmt(m.requests >= 10 ? Math.round(m.requests) : m.requests) },
        { label: t(text.network), value: fmt(m.networkMB), tone: m.networkBound ? "warn" : "plain" },
        { label: t(text.consume), value: fmt(m.consume), tone: m.consume < m.produce ? "danger" : "ok" },
      ]
    : [];

  const legend: LegendItem[] = [
    { swatch: <MiniCube fill="var(--mint)" />, label: t(text.legendParcel) },
    ...(pipeline
      ? [
          { swatch: <MiniCube fill="var(--sun)" />, label: t(text.legendCrate) },
          ...(settings.compression === "lz4" ? [{ swatch: <MiniCube fill="var(--sky)" />, label: t(text.legendLz4) }] : []),
          { swatch: <polygon points="-10,0 0,-5 10,0 0,5" fill="#ece2cf" stroke="var(--ink)" strokeWidth="1.5" />, label: t(text.legendBelt) },
        ]
      : []),
  ];

  // The change log for the try-it step: what each move did to the numbers.
  const changeLines = useMemo(() => {
    const out: { text: string; tone: "ok" | "bad" | "plain" }[] = [];
    let k = START_KNOBS;
    for (const mv of moves) {
      const next = applyMove(k, mv) ?? k;
      const a = measure(settingsOf(k));
      const b = measure(settingsOf(next));
      const name = describeKnob(mv, settingsOf(k), settingsOf(next), t);
      const parts = [`${t(text.produce)} ${fmt(a.produce)} → ${fmt(b.produce)}`];
      if (a.consume !== b.consume) parts.push(`${t(text.consume)} ${fmt(a.consume)} → ${fmt(b.consume)}`);
      if (b.idle > a.idle) parts.push(`${b.idle} ${t(text.consumer).toLowerCase()} ${t(text.idle)}`);
      out.push({ text: `${name}: ${parts.join(", ")}`, tone: b.produce > a.produce || b.consume > a.consume ? "ok" : b.produce < a.produce || b.consume < a.consume ? "bad" : "plain" });
      k = next;
    }
    return out;
  }, [moves, t, fmt]);

  const footer = sandbox ? (
    <div className="sandbox">
      <MissionPanel missions={missions} active={missionIndex} onSelect={selectMission} moves={moves.length} won={won} best={best} />
      <div className="sandbox-controls" title={locked ? t(ui.locked) : undefined}>
        <Knob name={t(text.rowBatch)} color="var(--sun)" value={`${fmt(settings.batch)} ${t(text.perReq)}`} onMinus={() => act("batch-")} onPlus={() => act("batch+")} minus={can("batch-")} plus={can("batch+")} />
        <div className="control-row knob-row">
          <span className="control-name">
            <i style={{ background: "var(--sky)" }} />
            {t(text.rowComp)}
          </span>
          <button className={`chip-btn ${!knobs.lz4 ? "is-selected" : ""}`} disabled={!can("none")} onClick={() => act("none")}>
            {t(text.none)}
          </button>
          <button className={`chip-btn ${knobs.lz4 ? "is-selected" : ""}`} disabled={!can("lz4")} onClick={() => act("lz4")}>
            lz4
          </button>
        </div>
        <Knob name={t(text.rowParts)} color="#d9caae" value={String(settings.partitions)} onMinus={() => act("part-")} onPlus={() => act("part+")} minus={can("part-")} plus={can("part+")} />
        <Knob name={t(text.rowCons)} color="var(--lilac)" value={String(settings.consumers)} onMinus={() => act("cons-")} onPlus={() => act("cons+")} minus={can("cons-")} plus={can("cons+")} />
        <div className="control-row">
          <button className="chip-btn" disabled={moves.length === 0} onClick={() => setMoves((xs) => xs.slice(0, -1))}>
            <Icon name="undo" size={15} /> {t(text.undo)}
          </button>
          <button className="chip-btn" disabled={moves.length === 0} onClick={() => setMoves([])}>
            <Icon name="reset" size={15} /> {t(text.reset)}
          </button>
        </div>
      </div>
      <div className="events" aria-live="polite">
        <h3>{t(text.latest)}</h3>
        {changeLines.length === 0 ? (
          <p>{t(text.nothing)}</p>
        ) : (
          <ol>
            {[...changeLines].reverse().map((line, i) => (
              <li key={`${moves.length}-${i}`} className={`ev-${line.tone}`}>
                <span className="ev-dot" />
                <span>{line.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  ) : null;

  let drawing: ReactNode;
  if (pipeline) drawing = <Pipeline settings={settings} m={m} t={t} fmt={fmt} />;
  else if (view.mode === "disk") drawing = <DiskDiorama tick={tick} revealed={revealed} t={t} />;
  else if (view.mode === "cache") drawing = <CacheDiorama tick={tick} revealed={revealed} t={t} />;
  else drawing = <ZeroCopyDiorama revealed={revealed} t={t} />;

  return (
    <SceneFrame metrics={metrics} controls={controls} legend={legend} paused={paused} width={W} height={H} label={t(text.label)} footer={footer}>
      {drawing}
    </SceneFrame>
  );
}

function describeKnob(mv: SandboxMove, a: Settings, b: Settings, t: (x: L) => string) {
  if (mv.startsWith("batch")) return `${t(text.rowBatch)} ${a.batch} → ${b.batch}`;
  if (mv === "lz4" || mv === "none") return `${t(text.rowComp)}: ${b.compression === "lz4" ? "lz4" : t(text.none)}`;
  if (mv.startsWith("part")) return `${t(text.rowParts)} ${a.partitions} → ${b.partitions}`;
  return `${t(text.rowCons)} ${a.consumers} → ${b.consumers}`;
}

function Knob(props: { name: string; color: string; value: string; onMinus: () => void; onPlus: () => void; minus: boolean; plus: boolean }) {
  return (
    <div className="control-row knob-row">
      <span className="control-name">
        <i style={{ background: props.color }} />
        {props.name}
      </span>
      <button className="chip-btn knob-btn" disabled={!props.minus} onClick={props.onMinus} aria-label={`${props.name} −`}>
        −
      </button>
      <span className="knob-value">{props.value}</span>
      <button className="chip-btn knob-btn" disabled={!props.plus} onClick={props.onPlus} aria-label={`${props.name} +`}>
        +
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- pipeline */

const BELT_S = 22;
const BELT_LEN = 4.5;
const CRATE: Shades = ["var(--sun)", "#f0c24f", "#d9a826"];

/** Producer → road → broker → one belt per partition → consumers. Flow speed follows the numbers. */
function Pipeline({ settings, m, t, fmt }: { settings: Settings; m: Measure; t: (x: L) => string; fmt: (n: number) => string }) {
  const producer: [number, number] = [86, 360];
  const broker: [number, number] = [330, 262];
  const road = `M${producer[0] + 30} ${producer[1] - 6} L${broker[0] - 48} ${broker[1] + 22}`;
  // Faster writes, shorter trips: 1.2 s at 100,000/s up to 4 s at a trickle.
  const trip = Math.max(1.1, 4 - Math.log10(Math.max(m.produce, 10)) * 0.6);
  const crateSize = [0.42, 0.55, 0.7, 0.86][BATCHES.indexOf(settings.batch)] ?? 0.7;
  const lz4 = settings.compression === "lz4";

  const slots = Math.max(settings.partitions, settings.consumers);
  const beltAt = (k: number): [number, number] => [440 + k * 30.8, 318 - k * 15.4];
  const order = Array.from({ length: slots }, (_, k) => slots - 1 - k);
  const perConsumerTrip = Math.max(1.2, 4.2 - Math.log10(Math.max(m.consume / Math.max(m.working, 1), 10)) * 0.65);

  return (
    <g>
      <path d={road} className="wf-road" />
      <path d={road} className="wf-road-line" />
      {[0, 1].map((i) => (
        <g key={`${settings.batch}-${lz4}-${i}`}>
          <g>
            <IsoBox s={32} at={[-crateSize / 2, -crateSize / 2, 0]} size={[crateSize, crateSize, lz4 ? crateSize * 0.55 : crateSize]} shades={lz4 ? ["var(--sky)", "var(--sky-mid)", "var(--sky-deep)"] : CRATE} />
            <text y={-crateSize * 32 * (lz4 ? 0.8 : 1.15) - 6} textAnchor="middle" className="wf-crate-label">
              ×{fmt(settings.batch)}
            </text>
            <animateMotion dur={`${trip}s`} begin={`${(-i * trip) / 2}s`} repeatCount="indefinite" path={road} />
          </g>
        </g>
      ))}

      <g transform={`translate(${producer[0]} ${producer[1]})`}>
        <Person tint={TINTS.sky} scale={1.2} state="idle" />
        <NameTag y={22} text={t(text.producer)} tint={TINTS.sky} />
      </g>

      {/* The broker with its page cache shelf and disk. */}
      <g transform={`translate(${broker[0]} ${broker[1]})`}>
        <g transform="translate(-118 -26)">
          <IsoBox s={26} at={[-0.7, -0.7, 0]} size={[1.4, 1.4, 0.7]} shades={["#8d8796", "#6e6878", "#5b5664"]} />
          <text x={-40} y={4} textAnchor="end" className="label-soft">
            {t(text.disk)}
          </text>
        </g>
        <Building s={36} roof={TINTS.sun} w={2.1} h={1.35} />
        <g transform="translate(0 -112)">
          <IsoBox s={28} at={[-1, -0.45, 0]} size={[2, 0.9, 0.3]} shades={["var(--mint-soft)", "var(--mint-mid)", "var(--mint-deep)"]} />
          <text y={-16} textAnchor="middle" className="wf-small">
            {t(text.cache)}
          </text>
        </g>
        <NameTag y={74} text={t(text.broker)} tint={TINTS.sun} />
      </g>
      {m.networkBound && <Pill x={222} y={352} text={t(text.netFull)} tone="warn" size={12} />}

      {order.map((k) => {
        const [bx, by] = beltAt(k);
        const hasBelt = k < settings.partitions;
        const hasConsumer = k < settings.consumers;
        const working = hasBelt && hasConsumer;
        const end: [number, number] = [bx + BELT_LEN * BELT_S, by + (BELT_LEN / 2) * BELT_S];
        const flow = `M${bx + 8} ${by + 2} L${end[0] - 6} ${end[1] - 2}`;
        return (
          <g key={k}>
            {hasBelt && (
              <g transform={`translate(${bx} ${by})`}>
                <Belt s={BELT_S} from={0} to={BELT_LEN} slot={1.1} />
              </g>
            )}
            {hasBelt &&
              [0, 1].map((i) => (
                <g key={i} opacity={working ? 1 : 0.55}>
                  <g>
                    <Parcel s={BELT_S} size={0.6} kind="order" />
                    <animateMotion dur={`${working ? perConsumerTrip : 6}s`} begin={`${(-i * perConsumerTrip) / 2}s`} repeatCount="indefinite" path={flow} />
                  </g>
                </g>
              ))}
            {hasConsumer && (
              <g transform={`translate(${end[0] + 26} ${end[1] + 14})`}>
                <Person tint={working ? TINTS.lilac : TINTS.grey} scale={0.85} state={working ? "busy" : "idle"} />
                {!working && <Pill x={0} y={-66} text={t(text.idle)} size={10} animate={false} />}
              </g>
            )}
          </g>
        );
      })}
      <g transform={`translate(${beltAt(0)[0] + BELT_LEN * BELT_S + 26} ${beltAt(0)[1] + (BELT_LEN / 2) * BELT_S + 52})`}>
        <NameTag y={0} text={`${settings.consumers} ${t(text.consumer).toLowerCase()} · ${settings.partitions} partition`} tint={TINTS.lilac} />
      </g>
    </g>
  );
}

/* ------------------------------------------------------------ dioramas */

/** Two disks: one always writes at the end, the other jumps around. */
function DiskDiorama({ tick, revealed, t }: { tick: number; revealed: boolean; t: (x: L) => string }) {
  const n = tick % 7;
  const seqOrigin: [number, number] = [120, 250];
  const RND = [5, 0, 9, 3, 11, 6, 1, 8, 2, 10, 4, 7];
  const cell = (i: number): [number, number] => {
    const c = i % 4;
    const r = Math.floor(i / 4);
    return [600 + (c - r) * 46, 196 + (c + r) * 23];
  };
  const shown = RND.slice(0, n);
  const head = shown.length ? cell(shown[shown.length - 1]!) : cell(0);
  return (
    <g>
      <text x={210} y={150} textAnchor="middle" className="wf-title">
        {t(text.seq)}
      </text>
      <g transform={`translate(${seqOrigin[0]} ${seqOrigin[1]})`}>
        <Belt s={34} from={0} to={6.6} slot={1.1} />
        {Array.from({ length: n }, (_, i) => {
          const x = (0.55 + i * 1.1) * 34;
          return (
            <g key={i} transform={`translate(${x} ${x / 2})`}>
              <Parcel s={34} size={0.7} kind="order" label={i} />
            </g>
          );
        })}
        <g transform={`translate(${(0.55 + n * 1.1) * 34} ${((0.55 + n * 1.1) * 34) / 2 - 46})`} className="wf-head">
          <path d="M-8 -10 h16 l-8 12 z" className="ink" style={{ fill: "var(--tangerine)" }} />
        </g>
      </g>
      {revealed && <Pill x={240} y={420} text={t(text.seqSpeed)} tone="ok" />}

      <text x={600} y={140} textAnchor="middle" className="wf-title">
        {t(text.rnd)}
      </text>
      {Array.from({ length: 12 }, (_, i) => {
        const [x, y] = cell(i);
        return <polygon key={i} points={`${x - 44},${y} ${x},${y - 22} ${x + 44},${y} ${x},${y + 22}`} className="wf-cell" />;
      })}
      {shown.map((slot, i) => {
        const [x, y] = cell(slot);
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <Parcel s={28} size={0.7} kind="order" label={i} />
          </g>
        );
      })}
      {shown.slice(1).map((slot, i) => {
        const [x1, y1] = cell(shown[i]!);
        const [x2, y2] = cell(slot);
        return <line key={i} x1={x1} y1={y1 - 30} x2={x2} y2={y2 - 30} className="dashed-arrow wf-jump" />;
      })}
      <g transform={`translate(${head[0]} ${head[1] - 52})`} className="wf-head">
        <path d="M-8 -10 h16 l-8 12 z" className="ink" style={{ fill: "var(--tangerine)" }} />
      </g>
      {revealed && <Pill x={610} y={420} text={t(text.rndSpeed)} tone="danger" />}
    </g>
  );
}

/** New records land in memory first; the OS writes them to disk later; readers take them from memory. */
function CacheDiorama({ tick, revealed, t }: { tick: number; revealed: boolean; t: (x: L) => string }) {
  const written = 3 + (tick % 6);
  const onDisk = Math.max(0, written - 3);
  const ram: [number, number] = [420, 170];
  const disk: [number, number] = [420, 330];
  const slotRam = (i: number): [number, number] => [ram[0] - 66 + i * 30, ram[1] - 33 + i * 15];
  const slotDisk = (i: number): [number, number] => [disk[0] - 80 + i * 26, disk[1] - 40 + i * 13];
  const reader: [number, number] = [720, 250];
  const latest = slotRam(Math.min(written, 3) - 1);
  return (
    <g>
      <g transform={`translate(${ram[0]} ${ram[1]})`}>
        <IsoBox s={30} at={[-2.4, -0.8, 0]} size={[4.8, 1.6, 0.35]} shades={["var(--mint-soft)", "var(--mint-mid)", "var(--mint-deep)"]} />
      </g>
      <text x={ram[0] - 150} y={ram[1] - 60} className="wf-title">
        {t(text.cache)}
      </text>
      <g transform={`translate(${disk[0]} ${disk[1]})`}>
        <IsoBox s={30} at={[-2.6, -0.9, -0.2]} size={[5.2, 1.8, 0.55]} shades={["#8d8796", "#6e6878", "#5b5664"]} />
      </g>
      <text x={disk[0] - 200} y={disk[1] + 4} className="wf-title">
        {t(text.disk)}
      </text>
      <Pill x={disk[0] + 40} y={disk[1] + 104} text={t(text.flush)} size={11} />

      {Array.from({ length: Math.min(written, 3) }, (_, i) => {
        const [x, y] = slotRam(i);
        return (
          <g key={`r-${written}-${i}`} transform={`translate(${x} ${y + 10})`}>
            <Parcel s={30} size={0.7} kind="order" label={written - Math.min(written, 3) + i} />
          </g>
        );
      })}
      {Array.from({ length: Math.min(onDisk, 6) }, (_, i) => {
        const [x, y] = slotDisk(i);
        return (
          <g key={`d-${i}`} transform={`translate(${x} ${y + 6})`}>
            <Parcel s={26} size={0.66} kind="neutral" label={i} />
          </g>
        );
      })}

      <g transform="translate(110 250)">
        <Person tint={TINTS.sky} scale={1.05} />
        <NameTag y={20} text={t(text.producer)} tint={TINTS.sky} />
      </g>
      <path d={`M150 222 Q 230 140 ${ram[0] - 90} ${ram[1] - 20}`} className="dashed-arrow" markerEnd="url(#arrow)" />

      <g transform={`translate(${reader[0]} ${reader[1]})`}>
        <Person tint={TINTS.lilac} scale={1.05} state={revealed ? "happy" : "idle"} />
        <NameTag y={20} text={t(text.consumer)} tint={TINTS.lilac} />
      </g>
      {revealed ? (
        <>
          <path d={`M${latest[0] + 20} ${latest[1] - 10} Q 640 120 ${reader[0] - 14} ${reader[1] - 70}`} className="wf-read" markerEnd="url(#arrow)" />
          <Pill x={640} y={128} text={t(text.readsFrom)} tone="ok" />
        </>
      ) : (
        <Pill x={reader[0]} y={reader[1] - 92} text={t(text.where)} tone="sun" />
      )}
    </g>
  );
}

/** The classic copy path through the application versus sendfile straight from the page cache. */
function ZeroCopyDiorama({ revealed, t }: { revealed: boolean; t: (x: L) => string }) {
  const boxes: { label: L; at: [number, number]; shades: Shades }[] = [
    { label: text.boxDisk, at: [110, 330], shades: ["#8d8796", "#6e6878", "#5b5664"] },
    { label: text.boxCache, at: [270, 250], shades: ["var(--mint-soft)", "var(--mint-mid)", "var(--mint-deep)"] },
    { label: text.boxJvm, at: [440, 150], shades: ["var(--sun-soft)", "#f3dc93", "var(--sun)"] },
    { label: text.boxSocket, at: [600, 250], shades: ["var(--lilac-soft)", "#d7cdf7", "var(--lilac)"] },
    { label: text.boxNic, at: [740, 330], shades: ["var(--sky-soft)", "var(--sky-mid)", "var(--sky-deep)"] },
  ];
  const c = (i: number): [number, number] => [boxes[i]!.at[0], boxes[i]!.at[1] - 18];
  const classic = `M${c(0)[0]} ${c(0)[1]} L${c(1)[0]} ${c(1)[1]} L${c(2)[0]} ${c(2)[1]} L${c(3)[0]} ${c(3)[1]} L${c(4)[0]} ${c(4)[1]}`;
  const zero = `M${c(0)[0]} ${c(0)[1]} L${c(1)[0]} ${c(1)[1]} Q 505 360 ${c(4)[0]} ${c(4)[1]}`;
  return (
    <g>
      {revealed && <path d={classic} className="wf-path-classic" />}
      {revealed && <path d={zero} className="wf-path-zero" />}
      {boxes.map((b) => (
        <g key={b.label.en} transform={`translate(${b.at[0]} ${b.at[1]})`}>
          <IsoBox s={30} at={[-0.8, -0.8, 0]} size={[1.6, 1.6, 0.9]} shades={b.shades} />
          <NameTag y={30} text={t(b.label)} tint={TINTS.grey} />
        </g>
      ))}
      {revealed ? (
        <>
          <g>
            <Parcel s={26} size={0.6} kind="order" />
            <animateMotion dur="2.4s" repeatCount="indefinite" path={zero} />
          </g>
          <Pill x={440} y={86} text={t(text.classic)} tone="plain" />
          <Pill x={505} y={402} text={t(text.zero)} tone="ok" />
        </>
      ) : (
        <Pill x={440} y={86} text={t(text.copies)} tone="sun" />
      )}
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
