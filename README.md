# Let's explain

Yazılım teknolojilerini adım adım ilerleyen canlı sahnelerle anlatan interaktif kurslar. Türkçe ve İngilizce.

*Interactive courses that explain software technologies with live, step-by-step scenes. Turkish and English.*

Her ders aynı düzende ilerler:

- **İzle:** Her adımda sahne bir şey gösterir: bir mesajın nereye gittiğini, bir servis çökünce ne olduğunu.
- **Tahmin et:** Bazı adımlarda sahne durur ve önce senin tahminini sorar, sonra gerçekte ne olduğunu oynatır.
- **Dene:** Her ders görevlerle biter. Düğmelerle sistemi kendin kurar ve bozarsın; ne kadar az hamleyle çözersen o kadar çok yıldız alırsın.

## Kurslar

| Kurs | Durum |
|---|---|
| Apache Kafka | 20 ders, 7 bölüm |
| RabbitMQ, Kubernetes, Git, veritabanı transaction'ları | Planlanıyor |

## Çalıştırmak

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # simülasyon ve görev testleri
npm run build      # dist/ altına statik site
```

Site sadece statik dosyalardan oluşur ve hash ile yönlenir (`#/kafka/log-and-offset/3`), bu yüzden GitHub Pages gibi herhangi bir statik barınakta çalışır.

## Yapı

```text
packages/core/     her kursun ortak parçaları
  components/      ders oynatıcı, tahmin, görev paneli, özet ve quiz
  course/          Course ve Lesson tipleri, kurs context'i
  iso/             izometrik çizim parçaları (kutu, bant, karakter, bina)
  i18n/            TR/EN metin yardımcıları
  lib/             yönlendirme, ilerleme kaydı, animasyon zamanlayıcıları
  styles/          renkler, yazı tipleri, genel stil
courses/kafka/     Kafka kursu
  engine/          tarayıcıda çalışan küçük, deterministik bir Kafka modeli
  iso/             Kafka'ya özel sahneler (partition bandı, broker'lar, segment'ler)
  lessons/<slug>/  her ders: metin, sahne, model, görevler, testler
site/              kurs listesi (hub) ve uygulama kabuğu
```

Kurslar birbirini import etmez; hepsi `@lets-explain/core`'u kullanır. İlerleme ve yıldızlar tarayıcıda, kurs başına ayrı anahtarlarla tutulur.

## Bir ders nasıl yazılır?

`courses/<kurs>/src/lessons/<slug>/` altında:

| Dosya | İçinde ne var |
|---|---|
| `lesson.ts` | Adımlar (TR+EN), tahmin soruları, özet, quiz. Tek bir `Lesson` export eder; kurs onu slug'ından otomatik bulur. |
| `model.ts` | Dersin küçük, deterministik simülasyonu. Aynı hamleler her zaman aynı sonucu verir. |
| `Scene.tsx` | Sahne: `step` alır, o adımın görüntüsünü çizer. Son adımda görevli deneme alanı. |
| `missions.ts` | Görevler: hedef, ipucu, 3 yıldız için gereken hamle sayısı (`par`). |
| `missions.test.ts` | Her görevin `par` hamlede çözülebildiğini ve daha kısa bir çözümün olmadığını tüm olasılıkları deneyerek kanıtlar. |
| `terms.ts` | İsteğe bağlı: metinde `[[terim]]` olarak geçen sözlük terimleri. |

Ders metninde işaretler: `**kalın**`, `` `kod` ``, `[[terim]]` ya da `[[terim|gösterilen metin]]`.

## Yeni bir kurs eklemek

1. `courses/<kurs>/src/index.ts` içinde bir `Course` nesnesi export et (ad, kısa tanım, bölümler, sözlük, ana sayfa sahnesi). Örnek: `courses/kafka/src/index.ts`.
2. `tsconfig.json` ve `vite.config.ts` içine `@lets-explain/<kurs>` takma adını ekle.
3. `site/src/catalog.ts` içinde kursu `courses` listesine ekle (ve `planned` listesinden çıkar).

## Doğruluk hakkında

Simülasyonlar öğretmek için sadeleştirilmiştir; her sadeleştirme derste bir "Gerçekte" notuyla belirtilir. Bir hata görürsen issue açman çok makbule geçer.
