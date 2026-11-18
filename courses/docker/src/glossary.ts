import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "@lets-explain/core/course/types";

export type { GlossaryEntry };

/** Terms stay in English in both languages: that is what Docker prints and what docs use. */
const core: Record<string, GlossaryEntry> = {
  image: {
    term: "Image",
    def: l("Bir uygulamayı çalıştırmak için gereken her şeyin salt okunur paketi: dosyalar, kütüphaneler, ayarlar. Katmanlardan oluşur.", "A read-only package of everything an app needs to run: files, libraries, settings. Made of layers."),
  },
  container: {
    term: "Container",
    def: l("Bir image'dan başlatılan, kendi dosya sistemi ve ağı olan yalıtılmış süreç. Bir image'dan istediğin kadar container açabilirsin.", "An isolated process started from an image, with its own filesystem and network. One image can start many containers."),
  },
  layer: {
    term: "Layer",
    def: l("Image'ın bir katmanı: Dockerfile'daki RUN, COPY ya da ADD satırının yaptığı değişiklik. Katmanlar paylaşılır ve cache'lenir.", "One slice of an image: the change made by a RUN, COPY or ADD line. Layers are shared and cached."),
  },
  dockerfile: {
    term: "Dockerfile",
    def: l("Bir image'ın nasıl kurulacağını adım adım anlatan metin dosyası.", "A text file that describes, step by step, how to build an image."),
  },
  registry: {
    term: "Registry",
    def: l("Image'ların saklandığı ve paylaşıldığı sunucu, örneğin Docker Hub ya da GHCR.", "A server that stores and shares images, such as Docker Hub or GHCR."),
  },
  daemon: {
    term: "Docker daemon",
    def: l("Arka planda çalışan ve container'ları gerçekten yöneten servis (`dockerd`). `docker` komutu ona istek gönderir.", "The background service that actually runs containers (`dockerd`). The `docker` command sends it requests."),
  },
  volume: {
    term: "Volume",
    def: l("Docker'ın yönettiği, container'dan bağımsız yaşayan veri alanı. Container silinse de içindeki veri kalır.", "A data area managed by Docker that lives apart from containers. The data stays when the container is removed."),
  },
  bindMount: {
    term: "Bind mount",
    def: l("Host'taki bir klasörü container'ın içine açmak. İki taraf aynı dosyaları görür.", "Opening a host folder inside a container. Both sides see the same files."),
  },
  portMapping: {
    term: "Port mapping",
    def: l("Host'taki bir portu container'daki bir porta bağlamak: `-p 8080:80` host:container.", "Connecting a host port to a container port: `-p 8080:80` is host:container."),
  },
  compose: {
    term: "Docker Compose",
    def: l("Birden fazla container'ı tek bir `compose.yaml` dosyasıyla tanımlayıp birlikte başlatma aracı.", "A tool to describe several containers in one `compose.yaml` file and start them together."),
  },
  exitCode: {
    term: "Exit code",
    def: l("Ana sürecin kapanırken bıraktığı sayı: 0 başarı, 1 hata, 127 komut yok, 137 öldürüldü (çoğu zaman bellek).", "The number the main process leaves when it ends: 0 success, 1 error, 127 command not found, 137 killed (often memory)."),
  },
};

const extra = import.meta.glob<{ terms?: Record<string, GlossaryEntry> }>("./lessons/*/terms.ts", { eager: true });

export const glossary: Record<string, GlossaryEntry> = Object.assign({}, ...Object.values(extra).map((m) => m.terms ?? {}), core);
