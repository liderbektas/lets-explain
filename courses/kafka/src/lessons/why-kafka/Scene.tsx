import { AnimatePresence, motion } from "motion/react";
import { SceneFrame, type LegendItem, type Metric } from "@lets-explain/core/components/SceneFrame";
import { l, useLang, type L, type Lang } from "@lets-explain/core/i18n";
import { project, type Frame } from "@lets-explain/core/iso/geometry";
import { NameTag } from "../../iso/PartitionStage";
import { Belt, Building, Parcel, Pill, TINTS, type BuildingStatus } from "@lets-explain/core/iso/shapes";
import { useTicker } from "@lets-explain/core/lib/playback";
import type { SceneProps } from "@lets-explain/core/course/types";
import { connections as linkCount, type WorldEvent } from "./model";
import { useAppSandbox } from "../shared/useAppSandbox";
import { FREE, scenarios } from "./scenarios";
import { lesson, shell } from "./shell";

export const SANDBOX_STEP = 9;
const SLUG = "why-kafka";

const W = 860;
const H = 520;
const SRC_X = 196;
const DST_X = 660;
const BS = 24; // building scale

interface Service {
  id: string;
  name: L;
}

const sources: Service[] = [
  { id: "cart", name: l("Sepet", "Cart") },
  { id: "order", name: l("Sipariş", "Orders") },
  { id: "users", name: l("Üyelik", "Accounts") },
];

const targets: Service[] = [
  { id: "payment", name: l("Ödeme", "Payments") },
  { id: "stock", name: l("Stok", "Inventory") },
  { id: "email", name: l("E-posta", "Email") },
  { id: "analytics", name: l("Analitik", "Analytics") },
  { id: "fraud", name: l("Dolandırıcılık", "Fraud check") },
  { id: "shipping", name: l("Kargo", "Shipping") },
];

const text = {
  label: l("Servisler küçük binalar, aralarında event taşıyan yollar", "Services as little buildings, with roads carrying events between them"),
  connections: l("Bağlantı", "Connections"),
  services: l("Servis", "Services"),
  status: l("Durum", "Status"),
  allGood: l("her şey yolunda", "all good"),
  emailDown: l("e-posta çöktü", "email is down"),
  spike: l("trafik ×50", "traffic ×50"),
  catchingUp: l("e-posta yetişiyor", "email catching up"),
  noAnswer: l("cevap yok…", "no answer…"),
  waiting: l("bekliyor…", "waiting…"),
  behind: l("yetişemiyor!", "can't keep up!"),
  log: l("ortak log", "shared log"),
  kafka: l("Apache Kafka", "Apache Kafka"),
  lagging: l("geride", "behind"),
  caughtUp: l("güncel", "up to date"),
  props1: l("diske yazar", "writes to disk"),
  props2: l("sırayı korur", "keeps order"),
  props3: l("çok okuyuculu", "many readers"),
  legendProducer: l("mavi çatı: olay üretir", "blue roof: produces events"),
  legendConsumer: l("turuncu çatı: olayı dinler", "coral roof: listens"),
  legendParcel: l("koli = event", "parcel = event"),
  record: l("bir record", "one record"),
  sent: l("Giden e-posta", "Emails sent"),
  lost: l("Kaybolan", "Lost"),
  waitingCount: l("Log'da bekleyen", "Waiting in log"),
  lostPill: l("kayıp", "lost"),
  queuedPill: l("bekliyor", "waiting"),
  latest: l("Son olaylar (en yenisi üstte)", "Latest events (newest first)"),
  nothing: l("Bir komut yaz; servislerin ne yaptığını burada gör.", "Type a command; see what the services did here."),
};

/** In the try-it step the order service comes first, then the others are added. */
const sandboxSources = ["order", "cart", "users"].map((id) => sources.find((s) => s.id === id)!);

function describe(e: WorldEvent, lang: Lang): { text: string; tone: "plain" | "bad" | "ok" | "read" } {
  const tr = lang === "tr";
  switch (e.type) {
    case "mode":
      return {
        text: e.mode === "kafka"
          ? tr ? `Araya Kafka girdi. Bağlantı: ${e.connections}` : `Kafka sits in the middle. Connections: ${e.connections}`
          : tr ? `Servisler yine doğrudan konuşuyor. Bağlantı: ${e.connections}` : `Services call each other directly again. Connections: ${e.connections}`,
        tone: "plain",
      };
    case "added":
      return {
        text: tr
          ? `Yeni ${e.side === "source" ? "kaynak" : "hedef"} servis eklendi. Bağlantı: ${e.connections}`
          : `A new ${e.side} service was added. Connections: ${e.connections}`,
        tone: "plain",
      };
    case "sent":
      return {
        text: e.late
          ? tr ? `E-posta servisi kaldığı yerden okudu: bekleyen ${e.count} e-posta gönderildi` : `Email read from where it stopped: ${e.count} waiting email${e.count > 1 ? "s" : ""} sent`
          : tr ? "Sipariş geldi, e-postası gönderildi" : "Order placed, its email was sent",
        tone: e.late ? "ok" : "read",
      };
    case "lost":
      return {
        text: tr
          ? "Sipariş geldi ama e-posta servisi cevap vermedi: bu e-posta kayboldu"
          : "Order placed, but the email service did not answer: that email is lost",
        tone: "bad",
      };
    case "queued":
      return {
        text: tr
          ? `Sipariş log'a yazıldı. E-posta servisi kapalı, event bekliyor (${e.waiting})`
          : `Order written to the log. Email is down, so the event waits (${e.waiting})`,
        tone: "plain",
      };
    case "crashed":
      return { text: tr ? "E-posta servisi çöktü" : "The email service crashed", tone: "bad" };
    case "started":
      return { text: tr ? "E-posta servisi yeniden başladı" : "The email service restarted", tone: "ok" };
  }
}

function column(n: number, gap: number): number[] {
  const total = (n - 1) * gap;
  const start = H / 2 + 10 - total / 2;
  return Array.from({ length: n }, (_, i) => start + i * gap);
}

const EMAIL_LAG = [1, 2, 3, 4, 3, 2, 1, 0];
const EMAIL_ROW = targets.findIndex((d) => d.id === "email");

const LOG_FRAME: Frame = { ox: 328, oy: 196, s: 29 };
const LOG_LEN = 7.2;
const logIn: [number, number] = project(LOG_FRAME, 0.2, 0, 0);
const logOut: [number, number] = project(LOG_FRAME, LOG_LEN - 0.2, 0, 0);

export function WhyKafkaScene({ step, paused, replayKey, controls }: SceneProps) {
  const { t, lang } = useLang();
  const sandbox = step === SANDBOX_STEP;

  // The try-it step: every typed command is replayed through the model.
  const typed = useAppSandbox({ slug: SLUG, active: sandbox, lesson, shell, scenarios, free: FREE });
  const world = typed.sandboxRun ?? { states: [FREE.model], events: [] as WorldEvent[][] };
  const ws = world.states[world.states.length - 1]!;

  const usesLog = sandbox ? ws.mode === "kafka" : step >= 5;
  const anatomy = step === 8;
  const tick = useTicker(!sandbox && (step === 4 || (usesLog && !anatomy)), paused, 1000, `${step}-${replayKey}`);
  const phase = tick % 8;

  const srcList = sandbox ? sandboxSources.slice(0, ws.sources) : step <= 1 ? sources.filter((s) => s.id === "order") : sources;
  const dstList = sandbox ? targets.slice(0, ws.targets) : step === 0 ? targets.slice(0, 3) : targets;
  const srcY = column(srcList.length, 130);
  const dstY = column(dstList.length, 76);

  const emailDown = sandbox ? !ws.emailUp : step === 3 || (step === 6 && phase < 4);
  const spike = !sandbox && step === 4;

  const statusOf = (id: string): BuildingStatus => {
    if (id === "email" && emailDown) return "down";
    if (spike && (id === "analytics" || id === "order")) return "busy";
    if (step === 3 && id === "order") return "busy";
    return "ok";
  };

  const connections = sandbox ? linkCount(ws) : usesLog ? srcList.length + dstList.length : srcList.length * dstList.length;
  const status = emailDown ? text.emailDown : spike ? text.spike : step === 6 ? text.catchingUp : text.allGood;
  const metrics: Metric[] = sandbox
    ? [
        { label: t(text.connections), value: connections, tone: usesLog ? "ok" : connections > 10 ? "danger" : "plain" },
        { label: t(text.sent), value: ws.sent, tone: "plain" },
        { label: t(text.lost), value: ws.lost, tone: ws.lost > 0 ? "danger" : "plain" },
        ...(usesLog ? [{ label: t(text.waitingCount), value: ws.waiting, tone: ws.waiting > 0 ? ("warn" as const) : ("plain" as const) }] : []),
      ]
    : [
        { label: t(text.connections), value: connections, tone: usesLog ? "ok" : connections > 10 ? "danger" : "plain" },
        { label: t(text.services), value: srcList.length + dstList.length },
        { label: t(text.status), value: t(status), tone: emailDown ? "danger" : spike ? "warn" : "plain" },
      ];

  const legend: LegendItem[] = [
    { swatch: <MiniHouse roof="var(--sky)" />, label: t(text.legendProducer) },
    { swatch: <MiniHouse roof="var(--coral)" />, label: t(text.legendConsumer) },
    {
      swatch: (
        <g transform="translate(0 2)">
          <Parcel s={9} />
        </g>
      ),
      label: t(text.legendParcel),
    },
  ];

  const orderIndex = srcList.findIndex((s) => s.id === "order");
  const srcPoint = (i: number): [number, number] => [SRC_X + 38, srcY[i]! - 8];
  const dstPoint = (j: number): [number, number] => [DST_X - 38, dstY[j]! - 8];
  const dim = anatomy ? 0.22 : 1;

  return (
    <SceneFrame
      metrics={metrics}
      controls={controls}
      legend={legend}
      paused={paused}
      width={W}
      height={H}
      label={t(text.label)}
      footer={
        sandbox ? (
          <div className="sandbox">
            {typed.panel}
            {typed.terminal}
            <div className="events" aria-live="polite">
              <h3>{t(text.latest)}</h3>
              {world.events.length === 0 ? (
                <p>{t(text.nothing)}</p>
              ) : (
                <ol>
                  {world.events
                    .flat()
                    .map((e) => describe(e, lang))
                    .reverse()
                    .map((line, i) => (
                      <li key={`${world.events.length}-${i}`} className={`ev-${line.tone}`}>
                        <span className="ev-dot" />
                        <span>{line.text}</span>
                      </li>
                    ))}
                </ol>
              )}
            </div>
          </div>
        ) : null
      }
    >
      <motion.g animate={{ opacity: dim }} transition={{ duration: 0.4 }}>
        {/* Roads first, so buildings sit on top of them. */}
        {!usesLog &&
          srcList.flatMap((s, i) =>
            dstList.map((d, j) => {
              const broken = d.id === "email" && emailDown;
              const fast = spike && s.id === "order";
              return (
                <Road
                  key={`${s.id}-${d.id}-${step}`}
                  from={srcPoint(i)}
                  to={dstPoint(j)}
                  state={anatomy ? "idle" : broken ? "broken" : fast ? "fast" : "flow"}
                  seed={i * 7 + j}
                />
              );
            }),
          )}
        {usesLog &&
          srcList.map((s, i) => (
            <Road key={`${s.id}-log`} from={srcPoint(i)} to={logIn} state={anatomy ? "idle" : "flow"} seed={i} />
          ))}
        {usesLog &&
          dstList.map((d, j) => {
            const down = d.id === "email" && emailDown;
            const catching = d.id === "email" && step === 6 && !down && EMAIL_LAG[phase]! > 0;
            return (
              <Road
                key={`log-${d.id}-${step}-${down ? "d" : catching ? "c" : "n"}`}
                from={logOut}
                to={dstPoint(j)}
                state={anatomy ? "idle" : down ? "idle" : catching ? "fast" : "flow"}
                seed={j + 3}
              />
            );
          })}

        {usesLog && (
          <SharedLog tick={sandbox ? ws.orders - 1 : tick} title={t(step >= 7 ? text.kafka : text.log)} named={step >= 7} />
        )}

        <AnimatePresence>
          {srcList.map((s, i) => (
            <motion.g
              key={s.id}
              initial={{ opacity: 0, x: SRC_X, y: srcY[i]! }}
              animate={{ opacity: 1, x: SRC_X, y: srcY[i]! }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 160, damping: 22 }}
            >
              <Building s={BS} roof={TINTS.sky} status={statusOf(s.id)} />
              <g transform="translate(-104 -10)">
                <NameTag y={0} text={t(s.name)} tint={TINTS.sky} />
              </g>
            </motion.g>
          ))}
          {dstList.map((d, j) => (
            <motion.g
              key={d.id}
              initial={{ opacity: 0, x: DST_X, y: dstY[j]! }}
              animate={{ opacity: 1, x: DST_X, y: dstY[j]! }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 160, damping: 22 }}
            >
              <Building s={BS} roof={TINTS.coral} status={statusOf(d.id)} />
              <g transform="translate(110 -10)">
                <NameTag y={0} text={t(d.name)} tint={statusOf(d.id) === "down" ? TINTS.grey : TINTS.coral} />
              </g>
            </motion.g>
          ))}
        </AnimatePresence>

        {spike && <Backlog x={DST_X - 70} y={dstY[3]! + 6} count={Math.min(2 + tick, 7)} />}

        <AnimatePresence>
          {step === 3 && <Pill key="no-answer" x={SRC_X} y={srcY[orderIndex]! - 70} text={t(text.noAnswer)} tone="danger" />}
          {spike && <Pill key="waiting" x={SRC_X} y={srcY[orderIndex]! - 70} text={t(text.waiting)} tone="warn" />}
          {spike && <Pill key="behind" x={DST_X - 84} y={dstY[3]! - 44} text={t(text.behind)} tone="danger" />}
          {step === 6 && (
            <Pill
              key={phase < 4 ? "down" : EMAIL_LAG[phase] ? "lag" : "ok"}
              x={DST_X - 92}
              y={dstY[2]! - 34}
              text={EMAIL_LAG[phase] ? `${t(text.lagging)}: ${EMAIL_LAG[phase]}` : t(text.caughtUp)}
              tone={phase < 4 ? "danger" : EMAIL_LAG[phase] ? "warn" : "ok"}
            />
          )}
          {sandbox && ws.lost > 0 && (
            <Pill key={`lost-${ws.lost}`} x={SRC_X} y={srcY[0]! - 70} text={`${t(text.lostPill)}: ${ws.lost}`} tone="danger" />
          )}
          {sandbox && usesLog && ws.waiting > 0 && (
            <Pill key={`wait-${ws.waiting}`} x={DST_X - 92} y={dstY[EMAIL_ROW]! - 34} text={`${t(text.queuedPill)}: ${ws.waiting}`} tone="warn" />
          )}
          {step === 7 && <Pill key="p1" x={logIn[0] + 4} y={logOut[1] + 52} text={t(text.props1)} tone="ok" />}
          {step === 7 && <Pill key="p2" x={(logIn[0] + logOut[0]) / 2 + 30} y={logOut[1] + 86} text={t(text.props2)} tone="ok" />}
          {step === 7 && <Pill key="p3" x={logOut[0] + 40} y={logOut[1] + 52} text={t(text.props3)} tone="ok" />}
        </AnimatePresence>
      </motion.g>

      <AnimatePresence>{anatomy && <EventCard key="card" />}</AnimatePresence>
    </SceneFrame>
  );
}

/* ----------------------------------------------------------------- pieces */

type RoadState = "idle" | "flow" | "fast" | "broken";

/** A curved road between two places. Parcels travel along it with native SVG motion. */
function Road({ from, to, state, seed }: { from: [number, number]; to: [number, number]; state: RoadState; seed: number }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  const d = `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  const count = state === "fast" ? 3 : state === "flow" ? 1 : 0;
  const dur = state === "fast" ? 1.3 : 2.6;
  return (
    <g>
      <path d={d} className={`link ${state === "broken" ? "is-broken" : state === "fast" ? "is-hot" : ""}`} />
      {Array.from({ length: count }, (_, i) => (
        <g key={i} opacity={0}>
          <Parcel s={9} />
          <animateMotion
            dur={`${dur}s`}
            repeatCount="indefinite"
            path={d}
            begin={`${(((seed * 0.37) % 1) * dur + (i * dur) / count).toFixed(2)}s`}
          />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.12;0.85;1"
            dur={`${dur}s`}
            repeatCount="indefinite"
            begin={`${(((seed * 0.37) % 1) * dur + (i * dur) / count).toFixed(2)}s`}
          />
        </g>
      ))}
      {state === "broken" && (
        <g transform={`translate(${mx} ${(y1 + y2) / 2})`}>
          <g className="pop">
            <circle r={10} className="badge-down" />
            <path d="M-3.5 -3.5l7 7m0 -7l-7 7" className="badge-x" />
          </g>
        </g>
      )}
    </g>
  );
}

/** Parcels piling up in front of a service that cannot keep up. */
function Backlog({ x, y, count }: { x: number; y: number; count: number }) {
  const spots: [number, number][] = [
    [0, 0],
    [-14, 7],
    [14, 7],
    [0, 14],
    [-7, -9],
    [7, -9],
    [0, -18],
  ];
  return (
    <g transform={`translate(${x} ${y})`}>
      <AnimatePresence>
        {spots.slice(0, count).map(([dx, dy], i) => (
          <motion.g
            key={i}
            initial={{ x: dx + 40, y: dy - 30, opacity: 0 }}
            animate={{ x: dx, y: dy, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
          >
            <Parcel s={9} />
          </motion.g>
        ))}
      </AnimatePresence>
    </g>
  );
}

/** The shared log in the middle: a short belt where parcels keep arriving. */
function SharedLog({ tick, title, named }: { tick: number; title: string; named: boolean }) {
  const visible = 5;
  // Offsets start at 0 like in Kafka: the belt fills up first, then keeps scrolling.
  const offsets = Array.from({ length: Math.min(tick + 1, visible) }, (_, i) => Math.max(0, tick + 1 - visible) + i);
  const s = LOG_FRAME.s;
  const [lx, ly] = project(LOG_FRAME, LOG_LEN / 2, 0, 0);
  return (
    <motion.g initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} style={{ originX: `${lx}px`, originY: `${ly}px` }}>
      <g transform={`translate(${LOG_FRAME.ox} ${LOG_FRAME.oy})`}>
        <Belt s={s} from={0} to={LOG_LEN} slot={1.3} />
      </g>
      <AnimatePresence initial={false}>
        {offsets.map((offset, i) => {
          const [x, y] = project(LOG_FRAME, 0.85 + i * 1.3, 0, 0);
          const [ex, ey] = project(LOG_FRAME, LOG_LEN + 1, 0, 0);
          const [gx, gy] = project(LOG_FRAME, -0.6, 0, 0);
          return (
            <motion.g
              key={offset}
              initial={{ x: ex, y: ey - 20, opacity: 0 }}
              animate={{ x, y, opacity: 1 }}
              exit={{ x: gx, y: gy, opacity: 0 }}
              transition={{ type: "spring", stiffness: 160, damping: 22 }}
            >
              <Parcel s={s} label={offset} />
            </motion.g>
          );
        })}
      </AnimatePresence>
      <Pill x={lx} y={ly - 96} text={title} tone={named ? "sun" : "plain"} size={named ? 16 : 14} animate={false} />
    </motion.g>
  );
}

function EventCard() {
  const { t } = useLang();
  const rows: { name: string; value: string; note: L }[] = [
    { name: "key", value: "\"order-1042\"", note: l("neye ait", "what it's about") },
    { name: "value", value: "{\"id\":1042,\"total\":349.9}", note: l("asıl içerik", "the content") },
    { name: "timestamp", value: "2026-11-17 21:40:12", note: l("ne zaman", "when") },
    { name: "headers", value: "source=checkout", note: l("isteğe bağlı", "optional") },
  ];
  const cx = 455;
  const cy = 110;
  const cw = 330;
  return (
    <motion.g initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 160, damping: 20 }}>
      <g transform="translate(250 330)">
        <Parcel s={58} />
      </g>
      <path d={`M262 252 C 330 230, 380 200, ${cx} ${cy + 40}`} className="dashed-arrow" />
      <rect x={cx} y={cy + 5} width={cw} height={292} rx={16} className="pill-shadow" />
      <rect x={cx} y={cy} width={cw} height={292} rx={16} className="ink" style={{ fill: "var(--card)" }} />
      <circle cx={cx + 22} cy={cy + 22} r={6} className="ink" style={{ fill: "var(--paper-2)" }} />
      <text x={cx + 40} y={cy + 28} style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600 }}>
        OrderPlaced
      </text>
      <text x={cx + cw - 18} y={cy + 27} textAnchor="end" className="label-soft">
        {t(text.record)}
      </text>
      {rows.map((row, i) => {
        const ry = cy + 50 + i * 59;
        return (
          <g key={row.name}>
            <line x1={cx + 16} x2={cx + cw - 16} y1={ry} y2={ry} stroke="var(--line)" strokeWidth={2} strokeDasharray="4 4" />
            <text x={cx + 20} y={ry + 22} style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800 }}>
              {row.name}
            </text>
            <text x={cx + cw - 20} y={ry + 22} textAnchor="end" className="label-soft">
              {t(row.note)}
            </text>
            <text x={cx + 20} y={ry + 44} style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
              {row.value}
            </text>
          </g>
        );
      })}
    </motion.g>
  );
}

function MiniHouse({ roof }: { roof: string }) {
  return (
    <g stroke="var(--ink)" strokeWidth="1.4" strokeLinejoin="round" transform="translate(0 2)">
      <polygon points="-7,-2 0,2 0,8 -7,4" fill="#f3ebdc" />
      <polygon points="0,2 7,-2 7,4 0,8" fill="#e2d6c1" />
      <polygon points="-8,-3 0,-7 8,-3 0,1" style={{ fill: roof }} />
    </g>
  );
}
