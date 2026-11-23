import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { useLang } from "@lets-explain/core/i18n";
import { Person, Pill, TINTS } from "@lets-explain/core/iso/shapes";
import { METAL, OBox, THIN } from "../../iso/factory";
import { StatusDot } from "../../iso/parts";
import { Sticker } from "../../iso/parts";
import { phaseText, STRATEGY_NAME, weights, type Fleet, type Server } from "./model";

/**
 * Users on the left, a load balancer in the middle, servers on the right. Blue servers stand in
 * the left column, green (or the canary) in the right one. A line's thickness is the traffic it
 * carries; each server is a machine with its version on its screen, and a broken v2 that gets
 * traffic shows a red lamp and 500.
 * Requests travel as dots: users to the balancer, then down each line in proportion to its
 * share (red on a server that answers 500). A server that changes version is replaced in place.
 */

/** Dots on a line for a traffic share: one per ~20%, at least one while it gets traffic. */
const dotsFor = (share: number) => (share > 0 ? Math.max(1, Math.round(share / 20)) : 0);

/** Requests moving along a path, evenly spaced, forever (SVG animation: the scene's pause stops it). */
function Flow({ d, n, bad, dur = 1.4 }: { d: string; n: number; bad?: boolean; dur?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} r={4} style={{ fill: bad ? "var(--red)" : "var(--tangerine)", stroke: "var(--ink)", strokeWidth: 1.2 }}>
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(-dur * i) / n}s`} path={d} />
        </circle>
      ))}
    </g>
  );
}

const ROUTER: [number, number] = [300, 262];
const COLS = { left: 540, right: 720 };
const ROWS = [140, 215, 290, 365];
const faceOf = (s: Server, bad: boolean) => (s.version === 1 ? "var(--sky-soft)" : bad ? "var(--coral-soft)" : "var(--mint-soft)");

/** A server as a machine on the line: its version on the screen, a lamp for how it answers. */
function ServerBox({ s, bad }: { s: Server; bad: boolean }) {
  return (
    <g opacity={s.up ? 1 : 0.55}>
      <OBox x={-24} y={-36} w={44} h={34} d={14} front={faceOf(s, bad)} top={METAL.top} side={METAL.side} />
      <rect x={-20} y={-32} width={30} height={15} rx={3} style={{ fill: "#2b2a33", ...THIN }} />
      <text x={-5} y={-20.5} textAnchor="middle" className="mono-light" style={{ fontSize: 11 }}>
        {s.up ? `v${s.version}` : "—"}
      </text>
      <StatusDot status={!s.up ? "skipped" : s.version === 2 && bad ? "failure" : "success"} x={-12} y={-9} r={5} />
      {[0, 1].map((v) => (
        <line key={v} x1={0} x2={14} y1={-10 + v * 4} y2={-10 + v * 4} style={{ stroke: "#8f86a0", strokeWidth: 1.4 }} />
      ))}
    </g>
  );
}

function place(f: Fleet, s: Server): [number, number] {
  const blues = f.servers.filter((x) => x.group === "blue");
  const others = f.servers.filter((x) => x.group !== "blue");
  if (s.group === "blue") return [COLS.left, ROWS[blues.indexOf(s)]!];
  return [COLS.right, ROWS[others.indexOf(s)]!];
}

export function FleetStage({ fleet }: { fleet: Fleet }) {
  const { lang } = useLang();
  const tr = lang === "tr";
  const w = weights(fleet);
  const r = fleet.round;
  const title = fleet.strategy ? STRATEGY_NAME[fleet.strategy][tr ? 0 : 1] : tr ? "Strateji seçilmedi" : "No strategy yet";
  const caption = fleet.strategy
    ? fleet.rolledBack
      ? tr ? "Geri alındı: trafik yine v1'de" : "Rolled back: traffic is on v1 again"
      : fleet.phase === 0
        ? tr ? "Herkes v1'de. Bir sonraki adım deploy'u başlatır." : "Everyone is on v1. The next move starts the deploy."
        : phaseText(fleet.strategy, fleet.phase, tr)
    : tr ? "Dört sunucu v1 çalıştırıyor." : "Four servers run v1.";
  const hasRow2 = fleet.servers.some((s) => s.group !== "blue");
  const still = useReducedMotion();
  // Servers already there when the scene opens are not "replaced"; only later changes animate.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  const anyUp = fleet.servers.some((s) => s.up && (w.get(s.id) ?? 0) > 0);
  return (
    <g className="ci">
      <Sticker x={16} y={12} w={828} h={52} head="var(--paper-2)" headH={52}>
        <text x={34} y={44} className="title" style={{ fontSize: 17 }}>
          {title}
        </text>
        <text x={34 + title.length * 10 + 20} y={43} className="sub" style={{ fontSize: 12.5 }}>
          {caption}
        </text>
        {fleet.bad && (
          <text x={826} y={43} textAnchor="end" className="sub" style={{ fontSize: 12, fill: "var(--coral-deep)" }}>
            {tr ? "v2'de hata var" : "v2 has a bug"}
          </text>
        )}
      </Sticker>

      {/* row labels */}
      <text x={COLS.left} y={84} textAnchor="middle" className="sub" style={{ fontSize: 12 }}>
        {fleet.strategy === "blue-green" ? (fleet.live === "blue" ? (tr ? "blue (canlı)" : "blue (live)") : "blue") : tr ? "sunucular" : "servers"}
      </text>
      {hasRow2 && (
        <text x={COLS.right} y={84} textAnchor="middle" className="sub" style={{ fontSize: 12 }}>
          {fleet.strategy === "blue-green" ? (fleet.live === "green" ? (tr ? "green (canlı)" : "green (live)") : "green") : "canary"}
        </text>
      )}

      {/* traffic lines; their width follows the share as it shifts */}
      {fleet.servers.map((s) => {
        const [x, y] = place(fleet, s);
        const share = w.get(s.id) ?? 0;
        const errors = share > 0 && s.version === 2 && fleet.bad;
        const d = `M${ROUTER[0] + 34} ${ROUTER[1] - 14} C ${ROUTER[0] + 120} ${ROUTER[1] - 14}, ${x - 120} ${y - 6}, ${x - 30} ${y - 6}`;
        return (
          <g key={`l-${s.id}`}>
            <motion.path
              d={d}
              initial={false}
              animate={{ strokeWidth: share > 0 ? 1.5 + share / 6 : 1.5 }}
              transition={{ duration: 0.5 }}
              style={{ fill: "none", stroke: share > 0 ? (errors ? "var(--red)" : "var(--ink)") : "#c9c2cf", strokeDasharray: share > 0 ? undefined : "4 6", strokeLinecap: "round", opacity: share > 0 ? 0.85 : 1 }}
            />
            {!still && s.up && <Flow d={d} n={dotsFor(share)} bad={errors} />}
          </g>
        );
      })}
      {/* users to the balancer: requests keep coming; with no server up they pile up there */}
      {!still && <Flow d={`M160 ${ROUTER[1] - 2} L${ROUTER[0] - 36} ${ROUTER[1] - 14}`} n={3} bad={!anyUp && Boolean(fleet.strategy)} dur={1} />}

      {/* users */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${80 + i * 38} ${250 + (i % 2) * 34})`}>
          <Person tint={[TINTS.coral, TINTS.lilac, TINTS.sun][i]!} state={r?.down ? "crashed" : r && r.failed > 0 && i === 0 ? "busy" : "idle"} scale={0.8} />
        </g>
      ))}
      <text x={118} y={330} textAnchor="middle" className="sub" style={{ fontSize: 11.5 }}>
        {tr ? "kullanıcılar" : "users"}
      </text>

      {/* load balancer */}
      {/* The load balancer: a splitter that sends each request down one of the lines. */}
      <g transform={`translate(${ROUTER[0]} ${ROUTER[1]})`}>
        <OBox x={-34} y={-30} w={60} h={30} d={18} front="var(--lilac)" top="var(--lilac-soft)" side="var(--lilac-deep)" />
        {[0, 1, 2].map((v) => (
          <circle key={v} cx={-22 + v * 14} cy={-15} r={4} style={{ fill: "#fffdf8", ...THIN }} />
        ))}
      </g>
      <text x={ROUTER[0]} y={ROUTER[1] + 40} textAnchor="middle" className="sub" style={{ fontSize: 11.5 }}>
        load balancer
      </text>

      {/* servers */}
      {fleet.servers.map((s) => {
        const [x, y] = place(fleet, s);
        const share = w.get(s.id) ?? 0;
        const errors = share > 0 && s.version === 2 && fleet.bad;
        return (
          <g key={s.id}>
            {/* A new version (or a stop/start) replaces the server in place. */}
            <motion.g key={`${s.id}-${s.version}-${s.up}`} initial={mounted.current ? { x, y: y - 14, opacity: 0 } : { x, y, opacity: 1 }} animate={{ x, y, opacity: 1 }} transition={{ duration: 0.4 }}>
              <g transform="translate(0 8) scale(1.25)">
                <ServerBox s={s} bad={fleet.bad} />
              </g>
            </motion.g>
            {!s.up && (
              <text x={x + 34} y={y - 2} className="mono" style={{ fontSize: 12.5 }}>
                {tr ? "kapalı" : "stopped"}
              </text>
            )}
            {share > 0 && <Pill x={x + 92} y={y - 6} text={`${Math.round(share)}%`} tone={errors ? "danger" : "plain"} size={11} animate={false} />}
            {errors && <Pill x={x + 92} y={y + 20} text="500" tone="danger" size={10} animate={false} />}
          </g>
        );
      })}

      {/* this round */}
      <Sticker x={16} y={412} w={828} h={46} fill="var(--card)">
        <text x={34} y={441} className="title" style={{ fontSize: 13.5 }}>
          {tr ? "Son tur, 100 istek:" : "Last round, 100 requests:"}
        </text>
        {r ? (
          <text x={210} y={441} className="mono" style={{ fontSize: 12.5 }}>
            {r.down
              ? tr ? "hiçbir sunucu ayakta değil: 100 hata (kesinti)" : "no server is up: 100 errors (downtime)"
              : `v1: ${r.v1}   v2: ${r.v2}   ${tr ? "hata" : "errors"}: ${r.failed}`}
          </text>
        ) : (
          <text x={210} y={441} className="muted" style={{ fontSize: 12 }}>
            {tr ? "Henüz tur yok." : "No round yet."}
          </text>
        )}
        <text x={826} y={441} textAnchor="end" className="sub" style={{ fontSize: 12 }}>
          {tr ? `toplam hata ${fleet.failed} · kesinti ${fleet.downRounds} tur` : `errors ${fleet.failed} · downtime ${fleet.downRounds} rounds`}
        </text>
      </Sticker>
    </g>
  );
}
