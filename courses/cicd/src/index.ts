import { l } from "@lets-explain/core/i18n";
import type { Course } from "@lets-explain/core/course/types";
import { chapters } from "./course";
import { glossary } from "./glossary";
import { CicdHero } from "./Hero";

export const cicdCourse: Course = {
  id: "cicd",
  name: "CI/CD",
  tagline: l(
    "Workflow, job, runner, cache, matrix, PR check'leri, secret'lar ve deploy: kodunun commit'ten prod'a nasıl gittiğini GitHub Actions ile adım adım öğren.",
    "Workflows, jobs, runners, caching, matrix, PR checks, secrets and deploys: learn step by step how your code goes from a commit to production, with GitHub Actions.",
  ),
  chapters,
  glossary,
  home: {
    title: [l("Kodunu", "Get your code"), l("commit'ten prod'a", "from commit to prod"), l("kendin taşı.", "yourself.")],
    lead: l(
      "Bir push'un hangi job'ları başlattığını, bir adımın neden kırmızı olduğunu, cache'in neden tutmadığını ve bir deploy'un nasıl geri alındığını sahnede izlersin. Her dersin sonunda kendi projene koyacağın workflow parçaları var.",
      "You watch which jobs a push starts, why a step went red, why the cache missed and how a deploy is rolled back, right on stage. Every lesson ends with workflow pieces to put in your own project.",
    ),
    Art: CicdHero,
  },
};
