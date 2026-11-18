import { l, useLang, type L } from "../i18n";
import { rel } from "../iso/geometry";
import { Belt, Parcel } from "../iso/shapes";
import { Rich } from "./Rich";

const steps: { title: L; text: L; tint: string; Art: () => React.JSX.Element }[] = [
  {
    title: l("İzle", "Watch"),
    text: l(
      "Her adımda sahne bir şey gösterir: bir mesajın nereye gittiğini, bir servis çökünce ne olduğunu. Acele yok, istediğin kadar geri dön.",
      "Every step the scene shows something happen: where a message goes, what a crash does. No rush: go back as often as you like.",
    ),
    tint: "var(--sky-soft)",
    Art: WatchArt,
  },
  {
    title: l("Tahmin et", "Predict"),
    text: l(
      "Bazı adımlarda sahne durur ve önce **senin tahminini** sorar. Sonra gerçekte ne olduğunu oynatır.",
      "On some steps the scene stops and asks for **your guess** first. Then it plays what really happens.",
    ),
    tint: "var(--tangerine-soft)",
    Art: PredictArt,
  },
  {
    title: l("Dene", "Try"),
    text: l(
      "Her ders **görevlerle** biter. Sistemi kendin kurar, bozarsın. Az hamleyle çözersen 3 yıldız.",
      "Every lesson ends with **missions**. You build and break the system yourself. Few moves earn 3 stars.",
    ),
    tint: "var(--mint-soft)",
    Art: TryArt,
  },
];

/** The three-part learning loop, with a small drawing for each part. */
export function HowItWorks({ title }: { title: L }) {
  const { t } = useLang();
  return (
    <section className="how" id="how">
      <h2>{t(title)}</h2>
      <ol className="how-grid">
        {steps.map(({ title: name, text, tint, Art }, i) => (
          <li key={i} className="how-item card">
            <div className="how-art" style={{ background: tint }}>
              <Art />
            </div>
            <div className="how-text">
              <h3>
                <span className="num">{i + 1}</span>
                {t(name)}
              </h3>
              <p>
                <Rich text={t(text)} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function WatchArt() {
  const s = 18;
  return (
    <svg viewBox="-120 -50 240 90" aria-hidden="true">
      <g transform="translate(-20 0)">
        <Belt s={s} from={-2.6} to={2.6} slot={1.1} />
        {[0, 1, 2].map((i) => {
          const [x, y] = rel(s, -1.6 + i * 1.1, 0, 0);
          return (
            // The animation sits on an inner group: a CSS transform would replace the position.
            <g key={i} transform={`translate(${x} ${y})`}>
              <g className={i === 2 ? "how-arrive" : undefined}>
                <Parcel s={s} label={i} size={0.7} />
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function PredictArt() {
  return (
    <svg viewBox="-120 -50 240 90" aria-hidden="true">
      <g transform="translate(-72 -30)">
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(0 ${i * 22})`}>
            <rect width={116} height={17} rx={8.5} className="ink" style={{ fill: i === 1 ? "var(--tangerine)" : "var(--card)" }} />
            <rect x={5} y={3} width={11} height={11} rx={3} className="ink" style={{ fill: i === 1 ? "var(--card)" : "var(--tangerine-soft)" }} />
            <rect x={24} y={7} width={i === 1 ? 70 : 56 + i * 6} height={3} rx={1.5} style={{ fill: "var(--ink)", opacity: 0.35 }} />
          </g>
        ))}
      </g>
      <g transform="translate(84 -8)">
        <g className="how-bob">
          <circle r={19} className="ink" style={{ fill: "var(--sun)" }} />
          <text y={9} textAnchor="middle" className="how-q">
            ?
          </text>
        </g>
      </g>
    </svg>
  );
}

const STAR = "M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z";

function TryArt() {
  return (
    <svg viewBox="-120 -50 240 90" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${-62 + i * 44} ${i === 1 ? -44 : -36}) scale(${i === 1 ? 1.75 : 1.45})`}>
          <path d={STAR} className="star-on" strokeWidth={1.6} strokeLinejoin="round" />
        </g>
      ))}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${-84 + i * 58} 14)`}>
          <rect y={2} width={50} height={20} rx={10} style={{ fill: "var(--ink)" }} />
          <rect width={50} height={20} rx={10} className="ink" style={{ fill: ["var(--sky-soft)", "var(--mint-soft)", "var(--red-soft)"][i] }} />
          <rect x={12} y={8.5} width={26} height={3} rx={1.5} style={{ fill: "var(--ink)", opacity: 0.4 }} />
        </g>
      ))}
    </svg>
  );
}
