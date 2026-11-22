import { describe, expect, it } from "vitest";
import { allLines, clipName, narrationProblems, spoken, type StepNarration } from "./narration";

describe("clip names", () => {
  it("are stable, short and change with the words or the language", () => {
    const a = clipName("Selam! Docker'a hoş geldin.", "tr");
    expect(a).toBe(clipName("Selam! Docker'a hoş geldin.", "tr"));
    expect(a).toMatch(/^[0-9a-z]{6,11}$/);
    expect(clipName("Selam! Docker'a hoş geldin!", "tr")).not.toBe(a);
    expect(clipName("Selam! Docker'a hoş geldin.", "en")).not.toBe(a);
  });
});

const step = (lines: StepNarration["lines"], answer?: StepNarration["answer"]): StepNarration => ({ lines, ...(answer ? { answer } : {}) });

describe("narration checks", () => {
  const lesson = [{}, { predict: {} }];
  const good = [step([{ say: "a" }]), step([{ say: "q?" }], { right: "yes", wrong: "no", lines: [{ say: "go", cue: 0 }, { say: "on", cue: 1 }] })];

  it("accept a narration that fits the lesson", () => {
    expect(narrationProblems({ tr: good }, lesson, [0, 2])).toEqual([]);
    expect(allLines(good)).toEqual(["a", "q?", "yes", "no", "go", "on"]);
  });

  it("catch a missing step, a missing answer part and cues out of order", () => {
    expect(narrationProblems({ tr: good.slice(0, 1) }, lesson, [0, 2])).toHaveLength(1);
    expect(narrationProblems({ tr: [good[0]!, step([{ say: "q?" }])] }, lesson, [0, 0])).toHaveLength(1);
    const swapped = [good[0]!, step([{ say: "q?" }], { right: "y", wrong: "n", lines: [{ say: "x", cue: 1 }, { say: "z", cue: 0 }] })];
    expect(narrationProblems({ tr: swapped }, lesson, [0, 2])).toHaveLength(1);
  });

  it("do not let the scene move before the question is answered", () => {
    const early = [good[0]!, step([{ say: "q?", cue: 0 }], { right: "y", wrong: "n", lines: [{ say: "x", cue: 1 }] })];
    expect(narrationProblems({ tr: early }, lesson, [0, 2]).some((p) => p.includes("before the answer"))).toBe(true);
  });
});

describe("how Turkish narration is said", () => {
  it.each([
    ["docker run -d -p 8080:80 nginx:1.27 ile", "docker run tire de tire pe 8080 iki nokta 80 nginx 1.27 ile"],
    ["docker ps -a yaz.", "docker ps tire a yaz."],
    ["docker exec -it web sh", "docker exec tire i te web sh"],
    ["--mount ya da -v", "tire tire mount ya da tire ve"],
    ["Büyük -P", "Büyük tire büyük pe"],
    ["-p 127.0.0.1:8080:80", "tire pe 127.0.0.1 iki nokta 8080 iki nokta 80"],
    ["localhost:8080 ve node:22-slim", "localhost 8080 ve node 22-slim"],
    ["acme/greet ve ghcr.io/ada/shop", "acme slash greet ve ghcr.io slash ada slash shop"],
    ["DATABASE_URL ve shop_default", "DATABASE URL ve shop default"],
    ["dev/prod ayrımı", "dev ve prod ayrımı"],
    ["10-15 saniye, yeniden-başlat", "10-15 saniye, yeniden-başlat"],
  ])("%s", (written, said) => {
    expect(spoken(written, "tr")).toBe(said);
  });
});
