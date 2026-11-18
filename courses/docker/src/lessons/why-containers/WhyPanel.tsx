import { motion } from "motion/react";
import { l, type L } from "@lets-explain/core/i18n";
import "./why.css";

/**
 * The "why containers" drawings, in screen space so the stacks read like a diagram:
 * - mismatch: the app works on a laptop with Node 22 and breaks on a server with Node 18;
 * - package: the app shipped together with what it needs;
 * - vm / container / both: what each machine runs, layer by layer;
 * - desktop: Docker Desktop's Linux VM on macOS and Windows.
 */

export type WhyMode = "mismatch" | "package" | "vm" | "container" | "both" | "desktop";

const text = {
  laptop: l("Senin bilgisayarın", "Your laptop"),
  server: l("Sunucu", "The server"),
  works: l("çalışıyor", "works"),
  broken: l("çöktü: Node 18'de yok", "crashes: missing on Node 18"),
  app: l("Uygulama", "App"),
  libs: l("Kütüphaneler", "Libraries"),
  guest: l("Misafir OS (Linux)", "Guest OS (Linux)"),
  hyper: l("Hypervisor", "Hypervisor"),
  hostOs: l("Host OS + kernel", "Host OS + kernel"),
  hw: l("Donanım", "Hardware"),
  engine: l("Docker Engine", "Docker Engine"),
  vms: l("Sanal makineler (VM)", "Virtual machines"),
  ctrs: l("Container'lar", "Containers"),
  vmCost: l("her biri GB'larca, açılışı dakikalar", "GBs each, minutes to boot"),
  ctrCost: l("MB'larca, açılışı saniyeler", "MBs, seconds to start"),
  shared: l("kernel paylaşılır", "kernel is shared"),
  pack: l("Container = uygulama + ihtiyaç duyduğu her şey", "Container = the app + everything it needs"),
  same: l("Her yerde aynı paket", "The same package everywhere"),
  mac: l("macOS / Windows", "macOS / Windows"),
  linuxVm: l("Docker Desktop'ın Linux VM'i", "Docker Desktop's Linux VM"),
};

interface Props {
  mode: WhyMode;
  t: (x: L) => string;
}

export function WhyPanel({ mode, t }: Props) {
  if (mode === "mismatch") {
    return (
      <g>
        <Machine x={60} title={t(text.laptop)} rows={[{ label: "server.js", fill: "var(--mint)" }, { label: "Node 22", fill: "var(--sky)" }, { label: "macOS", fill: "var(--paper-2)" }]} badge={{ text: t(text.works), ok: true }} />
        <Machine x={480} title={t(text.server)} rows={[{ label: "server.js", fill: "var(--mint)" }, { label: "Node 18", fill: "var(--peach)" }, { label: "Ubuntu 22.04", fill: "var(--paper-2)" }]} badge={{ text: t(text.broken), ok: false }} />
        <path d="M380 220 h80" className="why-arrow" />
        <text x={420} y={208} textAnchor="middle" className="why-small">
          deploy
        </text>
      </g>
    );
  }
  if (mode === "package") {
    return (
      <g>
        <text x={430} y={60} textAnchor="middle" className="why-title">
          {t(text.pack)}
        </text>
        <Crate x={200} y={110} t={t} />
        <path d="M360 230 h140" className="why-arrow" />
        <text x={430} y={218} textAnchor="middle" className="why-small">
          {t(text.same)}
        </text>
        <Crate x={520} y={110} t={t} />
        <text x={280} y={410} textAnchor="middle" className="why-small">
          {t(text.laptop)}
        </text>
        <text x={600} y={410} textAnchor="middle" className="why-small">
          {t(text.server)}
        </text>
      </g>
    );
  }
  if (mode === "desktop") {
    return (
      <g>
        <rect x={150} y={60} width={560} height={360} rx={22} className="why-box" style={{ fill: "var(--paper-2)" }} />
        <text x={175} y={92} className="why-title">
          {t(text.mac)}
        </text>
        <rect x={210} y={115} width={440} height={270} rx={18} className="why-box" style={{ fill: "var(--sky-soft)" }} />
        <text x={235} y={145} className="why-title">
          {t(text.linuxVm)}
        </text>
        <Stack x={260} y={170} w={340} rows={[{ label: t(text.engine), fill: "var(--sky)" }, { label: "Linux kernel", fill: "var(--lilac)" }]} />
        {["web", "db", "cache"].map((n, i) => (
          <g key={n} transform={`translate(${290 + i * 110} 300)`}>
            <rect x={-42} y={-20} width={84} height={40} rx={10} className="why-box" style={{ fill: "var(--mint)" }} />
            <text y={5} textAnchor="middle" className="why-label">
              {n}
            </text>
          </g>
        ))}
      </g>
    );
  }
  const showVm = mode === "vm" || mode === "both";
  const showCtr = mode === "container" || mode === "both";
  const x1 = mode === "both" ? 40 : 230;
  const x2 = mode === "both" ? 450 : 230;
  return (
    <g>
      {showVm && (
        <motion.g initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <text x={x1 + 180} y={46} textAnchor="middle" className="why-title">
            {t(text.vms)}
          </text>
          {[0, 1].map((k) => (
            <Stack
              key={k}
              x={x1 + k * 185}
              y={70}
              w={175}
              rows={[
                { label: `${t(text.app)} ${k + 1}`, fill: "var(--mint)" },
                { label: t(text.libs), fill: "var(--sun-soft)" },
                { label: t(text.guest), fill: "var(--peach)", tall: true },
              ]}
            />
          ))}
          <Stack x={x1} y={292} w={360} rows={[{ label: t(text.hyper), fill: "var(--lilac-soft)" }, { label: t(text.hostOs), fill: "var(--lilac)" }, { label: t(text.hw), fill: "var(--paper-2)" }]} />
          <text x={x1 + 180} y={455} textAnchor="middle" className="why-small is-bad">
            {t(text.vmCost)}
          </text>
        </motion.g>
      )}
      {showCtr && (
        <motion.g initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <text x={x2 + 180} y={46} textAnchor="middle" className="why-title">
            {t(text.ctrs)}
          </text>
          {[0, 1, 2].map((k) => (
            <Stack key={k} x={x2 + k * 122} y={160} w={114} rows={[{ label: `${t(text.app)} ${k + 1}`, fill: "var(--mint)" }, { label: t(text.libs), fill: "var(--sun-soft)" }]} />
          ))}
          <Stack x={x2} y={292} w={360} rows={[{ label: t(text.engine), fill: "var(--sky)" }, { label: t(text.hostOs), fill: "var(--lilac)" }, { label: t(text.hw), fill: "var(--paper-2)" }]} />
          <text x={x2 + 180} y={455} textAnchor="middle" className="why-small is-ok">
            {t(text.ctrCost)} · {t(text.shared)}
          </text>
        </motion.g>
      )}
    </g>
  );
}

interface Row {
  label: string;
  fill: string;
  tall?: boolean;
}

function Stack({ x, y, w, rows }: { x: number; y: number; w: number; rows: Row[] }) {
  let at = y;
  return (
    <g>
      {rows.map((r, i) => {
        const h = r.tall ? 62 : 44;
        const top = at;
        at += h + 6;
        return (
          <g key={i}>
            <rect x={x} y={top + 4} width={w} height={h} rx={10} style={{ fill: "var(--ink)" }} />
            <rect x={x} y={top} width={w} height={h} rx={10} className="why-box" style={{ fill: r.fill }} />
            <text x={x + w / 2} y={top + h / 2 + 5} textAnchor="middle" className="why-label">
              {r.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Machine({ x, title, rows, badge }: { x: number; title: string; rows: Row[]; badge: { text: string; ok: boolean } }) {
  return (
    <g>
      <rect x={x} y={70} width={320} height={300} rx={20} className="why-box" style={{ fill: "var(--card)" }} />
      <text x={x + 160} y={104} textAnchor="middle" className="why-title">
        {title}
      </text>
      <Stack x={x + 30} y={124} w={260} rows={rows} />
      <rect x={x + 30} y={392} width={260} height={30} rx={15} className="why-box" style={{ fill: badge.ok ? "var(--mint)" : "var(--red-soft)" }} />
      <text x={x + 160} y={412} textAnchor="middle" className="why-label">
        {badge.text}
      </text>
    </g>
  );
}

function Crate({ x, y, t }: { x: number; y: number; t: (x: L) => string }) {
  return (
    <g>
      <rect x={x} y={y + 6} width={160} height={250} rx={16} style={{ fill: "var(--ink)" }} />
      <rect x={x} y={y} width={160} height={250} rx={16} className="why-box" style={{ fill: "var(--sky-soft)" }} />
      <Stack x={x + 16} y={y + 20} w={128} rows={[{ label: "server.js", fill: "var(--mint)" }, { label: "Node 22", fill: "var(--sky)" }, { label: t(text.libs), fill: "var(--sun-soft)" }, { label: "Debian slim", fill: "var(--paper-2)" }]} />
    </g>
  );
}
