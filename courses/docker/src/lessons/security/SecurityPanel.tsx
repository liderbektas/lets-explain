import type { L } from "@lets-explain/core/i18n";
import type { Container, DockerEvent, Image } from "../../engine/docker";

/**
 * Two cards: on the left the image's history, layer by layer, with any layer that carries a
 * secret flagged in red; on the right the container: which user it runs as, whether its image
 * even has a shell, and the settings it got from outside.
 */

export const secretIn = (files: Record<string, string>) => Object.entries(files).some(([p, v]) => p.endsWith(".env") || v.includes("API_KEY="));
export const hasSecret = (img: Image | undefined) => Boolean(img?.layers.some((layer) => secretIn(layer.files)));

interface Props {
  image?: Image;
  tag?: string;
  container?: Container;
  last: DockerEvent[];
  t: (x: L) => string;
}

const T = {
  history: { tr: "docker history", en: "docker history" },
  noImage: { tr: "Henüz image yok", en: "No image yet" },
  secret: { tr: "SIR!", en: "SECRET!" },
  user: { tr: "kullanıcı", en: "user" },
  shell: { tr: "kabuk (sh)", en: "shell (sh)" },
  yes: { tr: "var", en: "yes" },
  no: { tr: "yok", en: "none" },
  tools: { tr: "programlar", en: "programs" },
  container: { tr: "Container", en: "Container" },
  noContainer: { tr: "Çalışan container yok", en: "No container running" },
  env: { tr: "dışarıdan gelen ayarlar", en: "settings from outside" },
  clean: { tr: "image'da sır yok", en: "no secrets in the image" },
  leak: { tr: "sır image'ın içinde!", en: "a secret is inside the image!" },
} satisfies Record<string, L>;

const mono = { fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700 } as const;
const display = { fontFamily: "var(--font-display)", fontWeight: 800 } as const;

export function SecurityPanel({ image, tag, container, last, t }: Props) {
  const layers = image ? [...image.layers].reverse().slice(0, 9) : [];
  const leak = hasSecret(image);
  const exec = last.find((e): e is Extract<DockerEvent, { type: "execOutput" }> => e.type === "execOutput");
  const hasShell = image?.config.binaries.includes("sh") ?? false;

  return (
    <g>
      {/* History card */}
      <rect x={20} y={24} width={480} height={420} rx={18} style={{ fill: "var(--ink)" }} />
      <rect x={20} y={20} width={480} height={420} rx={18} style={{ fill: "#2b2a33", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text x={40} y={50} style={{ ...display, fontSize: 15, fill: "#fffdf8" }}>
        $ {t(T.history)} {tag ?? ""}
      </text>
      {!image && (
        <text x={40} y={84} style={{ ...mono, fill: "#b9b2c2" }}>
          {t(T.noImage)}
        </text>
      )}
      {layers.map((layer, i) => {
        const y = 84 + i * 32;
        const bad = secretIn(layer.files);
        return (
          <g key={`${layer.id}-${i}`}>
            <rect x={34} y={y - 16} width={452} height={26} rx={8} style={{ fill: bad ? "#5a2f33" : "#34333d" }} />
            <text x={46} y={y + 2} style={{ ...mono, fill: bad ? "#ffb1a8" : "#fffdf8" }}>
              {clip(layer.instruction, 40)}
            </text>
            <text x={400} y={y + 2} textAnchor="end" style={{ ...mono, fill: "#b9b2c2" }}>
              {layer.size}MB
            </text>
            {bad && (
              <g transform={`translate(${448} ${y - 3})`}>
                <rect x={-32} y={-10} width={64} height={20} rx={10} style={{ fill: "var(--red)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
                <text y={4} textAnchor="middle" style={{ ...display, fontSize: 11, fill: "#fffdf8" }}>
                  {t(T.secret)}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {image && (
        <g transform="translate(40 416)">
          <rect x={0} y={-14} width={210} height={24} rx={12} style={{ fill: leak ? "var(--red-soft)" : "var(--mint)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
          <text x={105} y={3} textAnchor="middle" style={{ ...display, fontSize: 12, fill: "var(--ink)" }}>
            {t(leak ? T.leak : T.clean)}
          </text>
        </g>
      )}

      {/* Container card */}
      <rect x={520} y={24} width={320} height={420} rx={18} style={{ fill: "var(--ink)" }} />
      <rect x={520} y={20} width={320} height={420} rx={18} style={{ fill: "var(--card)", stroke: "var(--ink)", strokeWidth: 2 }} />
      <text x={540} y={50} style={{ ...display, fontSize: 15, fill: "var(--ink)" }}>
        {t(T.container)}
      </text>
      {!container ? (
        <text x={540} y={84} style={{ ...mono, fill: "var(--ink-3)" }}>
          {t(T.noContainer)}
        </text>
      ) : (
        <g>
          <text x={540} y={84} style={{ ...display, fontSize: 18, fill: "var(--ink)" }}>
            {container.name}
          </text>
          <text x={540} y={104} style={{ ...mono, fill: "var(--ink-2)" }}>
            {clip(container.ref.replace(/:latest$/, ""), 30)} · {container.state}
          </text>
          <Row y={144} label={t(T.user)} value={container.user} bad={container.user === "root"} />
          <Row y={180} label={t(T.shell)} value={hasShell ? t(T.yes) : t(T.no)} bad={hasShell} />
          <Row y={216} label={t(T.tools)} value={String(image?.config.binaries.length ?? 0)} bad={(image?.config.binaries.length ?? 0) > 3} />
          <text x={540} y={262} style={{ ...display, fontSize: 13, fill: "var(--ink-2)" }}>
            {t(T.env)}
          </text>
          {Object.keys(container.env)
            .filter((k) => !(image?.config.env ?? {})[k])
            .slice(0, 3)
            .map((k, i) => (
              <text key={k} x={540} y={284 + i * 20} style={{ ...mono, fill: "var(--ink)" }}>
                {k}=••••
              </text>
            ))}
        </g>
      )}
      {exec && (
        <g transform="translate(540 380)">
          <rect x={0} y={-16} width={280} height={44} rx={10} style={{ fill: "#2b2a33", stroke: "var(--ink)", strokeWidth: 1.5 }} />
          <text x={12} y={0} style={{ ...mono, fontSize: 11.5, fill: "#cfc8d6" }}>
            $ docker exec {exec.name} {exec.cmd}
          </text>
          <text x={12} y={18} style={{ ...mono, fontSize: 11.5, fill: exec.code === 0 ? "#a8e6cf" : "#ffb1a8" }}>
            {clip(exec.output.join(" ") || "(ok)", 38)}
          </text>
        </g>
      )}
    </g>
  );
}

function Row({ y, label, value, bad }: { y: number; label: string; value: string; bad: boolean }) {
  return (
    <g>
      <text x={540} y={y} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, fill: "var(--ink-2)" }}>
        {label}
      </text>
      <g transform={`translate(800 ${y - 5})`}>
        <rect x={-70} y={-11} width={86} height={22} rx={11} style={{ fill: bad ? "var(--red-soft)" : "var(--mint)", stroke: "var(--ink)", strokeWidth: 1.5 }} />
        <text x={-27} y={4} textAnchor="middle" style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 800, fill: "var(--ink)" }}>
          {value}
        </text>
      </g>
    </g>
  );
}

function clip(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}
