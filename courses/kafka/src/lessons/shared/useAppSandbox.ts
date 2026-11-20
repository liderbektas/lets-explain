import { useTypedSandbox, type CommandLine } from "@lets-explain/core/components/TypedSandbox";
import type { Scenario } from "@lets-explain/core/course/types";
import { appCtx, finalBox, replayApp, type AppAction, type AppBox, type AppCtx, type AppLesson, type AppRun } from "./appShell";

/**
 * The try-it step of a lesson with its own model, played by typing. Hands back the model's
 * states and events the way the lesson's scene already draws them.
 */
export function useAppSandbox<M, A, E>(o: {
  slug: string;
  active: boolean;
  lesson: AppLesson<M, A, E>;
  shell: CommandLine<AppAction<A>, AppBox<M>>;
  scenarios: Scenario<AppCtx<M, A, E>, AppBox<M>>[];
  free: AppBox<M>;
}) {
  const box = useTypedSandbox<AppAction<A>, AppBox<M>, AppRun<M, E>, AppCtx<M, A, E>>({
    slug: o.slug,
    active: o.active,
    scenarios: o.scenarios,
    freeStart: o.free,
    shell: o.shell,
    replay: (start, actions) => replayApp(o.lesson, start, actions),
    final: finalBox,
    context: appCtx,
  });
  return {
    ...box,
    /** The model's run in the old shape: every state from the start, events per model action. */
    sandboxRun: box.run ? { states: box.run.states, events: box.run.events } : null,
    /** Model where the scenario (or free play) began. */
    startModel: box.start.model,
    files: box.state?.files ?? {},
  };
}
