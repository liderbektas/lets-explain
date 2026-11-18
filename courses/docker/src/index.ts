import { l } from "@lets-explain/core/i18n";
import type { Course } from "@lets-explain/core/course/types";
import { chapters } from "./course";
import { glossary } from "./glossary";
import { DockerHero } from "./Hero";

export const dockerCourse: Course = {
  id: "docker",
  name: "Docker",
  tagline: l(
    "Image, container, Dockerfile, layer cache, volume, network ve Compose: kendi projeni container'a koyup ayağa kaldırmayı adım adım öğren.",
    "Images, containers, Dockerfiles, the layer cache, volumes, networks and Compose: learn step by step to put your own project in containers and run it.",
  ),
  chapters,
  glossary,
  home: {
    title: [l("Docker'ı", "Learn Docker by"), l("çalıştırarak", "running it"), l("öğren.", "yourself.")],
    lead: l(
      "Bir image'ın katmanlarını, bir container'ın neden kapandığını, verinin nereye yazıldığını ve container'ların birbirini nasıl bulduğunu sahnede izlersin. Her dersin sonunda aynı şeyi kendi projende yapacağın komutlar ve Dockerfile parçaları var.",
      "You watch an image's layers, why a container stopped, where data is written and how containers find each other, right on stage. Every lesson ends with the commands and Dockerfile pieces to do the same in your own project.",
    ),
    Art: DockerHero,
  },
};
