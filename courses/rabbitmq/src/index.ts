import { l } from "@lets-explain/core/i18n";
import type { Course } from "@lets-explain/core/course/types";
import { chapters } from "./course";
import { glossary } from "./glossary";
import { RabbitHero } from "./Hero";

export const rabbitmqCourse: Course = {
  id: "rabbitmq",
  name: "RabbitMQ",
  tagline: l(
    "Exchange, binding, kuyruk, ack, prefetch, dead letter ve quorum queue: mesaj nereye, neden gider? Kendi projende kurarak öğren.",
    "Exchanges, bindings, queues, acks, prefetch, dead letters and quorum queues: where does a message go, and why? Learn it by setting it up in your own project.",
  ),
  chapters,
  glossary,
  home: {
    title: [l("RabbitMQ'yu", "Learn RabbitMQ by"), l("izleyerek", "watching"), l("ve kurarak öğren.", "and building it.")],
    lead: l(
      "Bir mesaj gönderildiğinde önce bir exchange'e uğrar, kurallara göre kuyruklara dağılır, bir consumer onu alır ve onaylar. Burada her adımı sahnede izler, kendin kurar ve bozarsın; her dersin sonunda aynı şeyi kendi projende kuracağın komutlar var.",
      "When a message is sent it first reaches an exchange, gets passed to queues by rules, and a consumer takes and acks it. Here you watch every step on stage, build and break it yourself, and every lesson ends with the commands to set up the same thing in your own project.",
    ),
    Art: RabbitHero,
  },
};
