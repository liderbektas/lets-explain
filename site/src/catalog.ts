import type { Course } from "@lets-explain/core/course/types";
import { l, type L } from "@lets-explain/core/i18n";
import { cicdCourse } from "@lets-explain/cicd";
import { dockerCourse } from "@lets-explain/docker";
import { gitCourse } from "@lets-explain/git";
import { kafkaCourse } from "@lets-explain/kafka";
import { rabbitmqCourse } from "@lets-explain/rabbitmq";
import { websocketCourse } from "@lets-explain/websocket";

/** Courses with lessons. Add a course here once its package exists under courses/. */
export const courses: Course[] = [kafkaCourse, gitCourse, rabbitmqCourse, dockerCourse, cicdCourse, websocketCourse];

/** Planned courses, shown on the hub as "soon". */
export const planned: { id: string; name: L; tagline: L }[] = [
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
