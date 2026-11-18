import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useLang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { starsFor, type Mission } from "@lets-explain/core/course/types";
import { Icon } from "@lets-explain/core/components/Icon";
import { Rich } from "@lets-explain/core/components/Rich";

interface Props<C> {
  missions: Mission<C>[];
  /** Index of the mission being played, or null for free play. */
  active: number | null;
  onSelect: (index: number | null) => void;
  moves: number;
  won: boolean;
  /** Best stars so far, by mission id. */
  best: Record<string, number>;
}

/** The mission picker and the card for the mission being played, above a lesson's try-it buttons. */
export function MissionPanel<C>({ missions, active, onSelect, moves, won, best }: Props<C>) {
  const { t } = useLang();
  const [hintFor, setHintFor] = useState<string | null>(null);
  const mission = active === null ? null : missions[active]!;
  const stars = mission && won ? starsFor(moves, mission.par) : 0;
  // Next comes the first unfinished mission after this one, wrapping round; none left means free play.
  const nextIndex = (() => {
    if (active === null) return null;
    for (let k = 1; k < missions.length; k++) {
      const i = (active + k) % missions.length;
      if (!best[missions[i]!.id]) return i;
    }
    return active + 1 < missions.length ? active + 1 : null;
  })();

  return (
    <div className="missions">
      <div className="mission-tabs" role="tablist" aria-label={t(ui.missions)}>
        {missions.map((m, i) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={active === i}
            className={`mission-tab ${active === i ? "is-active" : ""} ${best[m.id] ? "is-done" : ""}`}
            onClick={() => onSelect(i)}
          >
            <span className="mission-num">{i + 1}</span>
            <span className="mission-tab-text">
              <b>{t(m.title)}</b>
              <Stars count={best[m.id] ?? 0} size={12} />
            </span>
          </button>
        ))}
        <button
          role="tab"
          aria-selected={active === null}
          className={`mission-tab is-free ${active === null ? "is-active" : ""}`}
          onClick={() => onSelect(null)}
        >
          <b>{t(ui.freePlay)}</b>
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${active}-${won}`}
          className={`mission-card ${won ? "is-won" : ""}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          role={won ? "status" : undefined}
        >
          {!mission ? (
            <p className="mission-goal">{t(ui.freePlayText)}</p>
          ) : won ? (
            <>
              <div className="mission-win">
                <Stars count={stars} size={30} pop />
                <div>
                  <h4>{t(ui.missionWon)}</h4>
                  <p>
                    {moves} {t(ui.missionWonIn)} {stars < 3 && t(ui.missionBetter)}
                  </p>
                </div>
              </div>
              <div className="mission-actions">
                <button className="chip-btn" onClick={() => onSelect(active)}>
                  <Icon name="reset" size={15} /> {t(ui.playAgain)}
                </button>
                {nextIndex !== null ? (
                  <button className="chip-btn is-go" onClick={() => onSelect(nextIndex)}>
                    {t(ui.nextMission)} <Icon name="arrowRight" size={15} />
                  </button>
                ) : (
                  <button className="chip-btn is-go" onClick={() => onSelect(null)}>
                    {t(ui.allMissionsDone)}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mission-goal">
                <b>
                  {t(ui.mission)} {(active ?? 0) + 1}:
                </b>{" "}
                <Rich text={t(mission.goal)} />
              </p>
              <div className="mission-meta">
                <span className="move-count">
                  {t(ui.moves)} <b>{moves}</b>
                </span>
                <span className="par">
                  <Stars count={3} size={11} /> {t(ui.parFor3)} {mission.par} {t(ui.movesWord)}
                </span>
                <button className="link-btn" onClick={() => setHintFor(hintFor === mission.id ? null : mission.id)}>
                  <Icon name="bulb" size={15} /> {t(ui.hint)}
                </button>
              </div>
              {hintFor === mission.id && (
                <p className="mission-hint">
                  <Rich text={t(mission.hint)} />
                </p>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const STAR = "M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z";

export function Stars({ count, size = 14, pop = false }: { count: number; size?: number; pop?: boolean }) {
  return (
    <span className="stars" aria-label={`${count}/3`}>
      {[0, 1, 2].map((i) => (
        <motion.svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          aria-hidden="true"
          initial={pop ? { scale: 0, rotate: -30 } : false}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 14, delay: pop ? 0.12 + i * 0.14 : 0 }}
        >
          <path
            d={STAR}
            className={i < count ? "star-on" : "star-off"}
            strokeWidth={size > 20 ? 1.6 : 2}
            strokeLinejoin="round"
          />
        </motion.svg>
      ))}
    </span>
  );
}
