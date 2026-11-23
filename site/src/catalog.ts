import type { Course } from "@lets-explain/core/course/types";
import { l, type L } from "@lets-explain/core/i18n";
import { cicdCourse } from "@lets-explain/cicd";
import { dockerCourse } from "@lets-explain/docker";
import { gitCourse } from "@lets-explain/git";
import { kafkaCourse } from "@lets-explain/kafka";
import { rabbitmqCourse } from "@lets-explain/rabbitmq";
import { websocketCourse } from "@lets-explain/websocket";

/** Every course with lessons. Add a course here once its package exists under courses/. */
const written: Course[] = [dockerCourse, kafkaCourse, gitCourse, rabbitmqCourse, cicdCourse, websocketCourse];

/**
 * Courses open on the live site. The others are finished enough to work on but not released:
 * `npm run dev` opens every course, the production build only these.
 */
const RELEASED = new Set(["docker"]);

/** Courses the reader can open here. */
export const courses: Course[] = import.meta.env.DEV ? written : written.filter((c) => RELEASED.has(c.id));

/** Written courses that are not released yet; the live site shows them as "soon". */
export const unreleased: Course[] = written.filter((c) => !courses.includes(c));

/** Planned courses, shown on the hub as "soon". */
export const planned: { id: string; name: L; tagline: L }[] = [
  ...unreleased.map((c) => ({ id: c.id, name: l(c.name, c.name), tagline: c.tagline })),
  {
    id: "kubernetes",
    name: l("Kubernetes", "Kubernetes"),
    tagline: l("Pod, ReplicaSet, scheduler ve reconcile döngüsü: istediğin durumu sistem nasıl korur?", "Pods, ReplicaSets, the scheduler and the reconcile loop: how the system keeps what you asked for."),
  },
  {
    id: "transactions",
    name: l("Veritabanı transaction'ları", "Database transactions"),
    tagline: l("Isolation level'lar, dirty read, lost update ve phantom: iki işlem çakışınca ne olur?", "Isolation levels, dirty reads, lost updates and phantoms: what happens when two transactions collide."),
  },
];
