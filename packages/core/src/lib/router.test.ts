import { describe, expect, it } from "vitest";
import { lessonHref, parseHash } from "./router";

describe("router", () => {
  it("reads the hub, a course and a lesson", () => {
    expect(parseHash("")).toEqual({ name: "hub" });
    expect(parseHash("#/kafka")).toEqual({ name: "course", course: "kafka" });
    expect(parseHash("#/kafka/log-and-offset/3")).toEqual({ name: "lesson", course: "kafka", slug: "log-and-offset", step: 2 });
  });

  it("keeps old single-course links working", () => {
    expect(parseHash("#/learn/why-kafka/2")).toEqual({ name: "lesson", course: "kafka", slug: "why-kafka", step: 1 });
  });

  it("round-trips a lesson link", () => {
    expect(parseHash(lessonHref("kafka", "replication", 4))).toMatchObject({ slug: "replication", step: 4 });
  });
});
