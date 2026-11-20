import { describe, expect, it } from "vitest";
import { canonicalHref, courseHref, lessonHref, parseLocation } from "./router";

describe("router", () => {
  it("reads the hub, a course and a lesson from the path", () => {
    expect(parseLocation("/")).toEqual({ name: "hub" });
    expect(parseLocation("/kafka")).toEqual({ name: "course", course: "kafka" });
    expect(parseLocation("/kafka/log-and-offset/3")).toEqual({ name: "lesson", course: "kafka", slug: "log-and-offset", step: 2 });
  });

  it("builds links without a hash", () => {
    expect(courseHref("cicd")).toBe("/cicd");
    expect(lessonHref("cicd", "secrets", 0)).toBe("/cicd/secrets/1");
  });

  it("keeps old hash links working and rewrites them to paths", () => {
    const old = parseLocation("/", "#/git/rebase/2");
    expect(old).toEqual({ name: "lesson", course: "git", slug: "rebase", step: 1 });
    expect(canonicalHref(old, "/", "#/git/rebase/2")).toBe("/git/rebase/2");
    expect(canonicalHref(parseLocation("/", "#/docker"), "/", "#/docker")).toBe("/docker");
  });

  it("keeps old single-course links working", () => {
    const route = parseLocation("/", "#/learn/why-kafka/2");
    expect(route).toEqual({ name: "lesson", course: "kafka", slug: "why-kafka", step: 1 });
    expect(canonicalHref(route, "/", "#/learn/why-kafka/2")).toBe("/kafka/why-kafka/2");
  });

  it("leaves current links alone and ignores in-page anchors", () => {
    expect(canonicalHref(parseLocation("/kafka"), "/kafka", "")).toBeNull();
    expect(parseLocation("/", "#how")).toEqual({ name: "hub" });
  });

  it("round-trips a lesson link", () => {
    expect(parseLocation(lessonHref("kafka", "replication", 4))).toMatchObject({ slug: "replication", step: 4 });
  });
});
