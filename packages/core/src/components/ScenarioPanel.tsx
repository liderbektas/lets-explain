import { AnimatePresence, motion } from "motion/react";
import { useLang } from "@lets-explain/core/i18n";
import { ui } from "@lets-explain/core/i18n/ui";
import { scenarioStars, type Scenario } from "@lets-explain/core/course/types";
import { Icon } from "@lets-explain/core/components/Icon";
import { Rich } from "@lets-explain/core/components/Rich";
import { Stars } from "@lets-explain/core/components/MissionPanel";

interface Props<C, S> {
  scenarios: Scenario<C, S>[];
  /** Index of the scenario being played, or null for free play. */
  active: number | null;
  onSelect: (index: number | null) => void;
  moves: number;
  won: boolean;
  /** How many hints are showing for the active scenario. */
  hints: number;
  onHint: () => void;
  /** Best stars so far, by scenario id. */
  best: Record<string, number>;
}

/** The scenario picker and the card for the scenario being played, above the terminal. */
export function ScenarioPanel<C, S>({ scenarios, active, onSelect, moves, won, hints, onHint, best }: Props<C, S>) {
  const { t } = useLang();
  const scenario = active === null ? null : scenarios[active]!;
  const sawAnswer = Boolean(scenario && hints >= scenario.hints.length);
  const stars = scenario && won ? scenarioStars(moves, scenario.par, sawAnswer) : 0;
  const nextIndex = (() => {
    if (active === null) return null;
    for (let k = 1; k < scenarios.length; k++) {
      const i = (active + k) % scenarios.length;
      if (!best[scenarios[i]!.id]) return i;
    }
    return active + 1 < scenarios.length ? active + 1 : null;
  })();

  return (
    <div className="missions">
      <div className="mission-tabs" role="tablist" aria-label={t(ui.scenarios)}>
        {scenarios.map((s, i) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={active === i}
            className={`mission-tab ${active === i ? "is-active" : ""} ${best[s.id] ? "is-done" : ""}`}
            onClick={() => onSelect(i)}
          >
            <span className="mission-num">{i + 1}</span>
            <span className="mission-tab-text">
              <b>{t(s.title)}</b>
              <Stars count={best[s.id] ?? 0} size={12} />
            </span>
          </button>
        ))}
        <button role="tab" aria-selected={active === null} className={`mission-tab is-free ${active === null ? "is-active" : ""}`} onClick={() => onSelect(null)}>
          <b>{t(ui.freePlay)}</b>
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${active}-${won}`}
          className={`mission-card scenario-card ${won ? "is-won" : ""}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          role={won ? "status" : undefined}
        >
          {!scenario ? (
            <p className="mission-goal">
              <Rich text={t(ui.freeTerminalText)} />
            </p>
          ) : won ? (
            <>
              <div className="mission-win">
                <Stars count={stars} size={30} pop />
                <div>
                  <h4>{t(ui.missionWon)}</h4>
                  <p>
                    {sawAnswer ? t(ui.scenarioAnswerSeen) : `${moves} ${t(ui.scenarioWonIn)} ${stars < 3 ? t(ui.scenarioBetter) : ""}`}
                  </p>
                </div>
              </div>
              <div className="mission-actions">
                <button className="chip-btn" onClick={() => onSelect(active)}>
                  <Icon name="reset" size={15} /> {t(ui.playAgain)}
                </button>
                {nextIndex !== null ? (
                  <button className="chip-btn is-go" onClick={() => onSelect(nextIndex)}>
                    {t(ui.nextScenario)} <Icon name="arrowRight" size={15} />
                  </button>
                ) : (
                  <button className="chip-btn is-go" onClick={() => onSelect(null)}>
                    {t(ui.allScenariosDone)}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="scenario-story">
                <Rich text={t(scenario.story)} />
              </p>
              <p className="scenario-goal">
                <b>{t(ui.scenarioGoal)}:</b> <Rich text={t(scenario.goal)} />
              </p>
              <div className="mission-meta">
                <span className="move-count">
                  {t(ui.commands)} <b>{moves}</b>
                </span>
                <span className="par">
                  <Stars count={3} size={11} /> {t(ui.parFor3)} {scenario.par} {t(ui.commandsWord)}
                </span>
                {hints < scenario.hints.length && (
                  <button className="link-btn" onClick={onHint} title={hints === scenario.hints.length - 1 ? t(ui.hintAnswerNote) : undefined}>
                    <Icon name="bulb" size={15} /> {hints === 0 ? t(ui.hint) : hints === scenario.hints.length - 1 ? t(ui.hintAnswer) : t(ui.hintNext)}
                  </button>
                )}
              </div>
              {scenario.hints.slice(0, hints).map((h, i) => (
                <p key={i} className={`mission-hint ${i === scenario.hints.length - 1 ? "is-answer" : ""}`}>
                  {i === scenario.hints.length - 1 && <b>{t(ui.answer)}: </b>}
                  <Rich text={t(h)} />
                </p>
              ))}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
