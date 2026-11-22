import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Tek stage · sahne: build shop:single (node:22)
    {
      lines: [
        { say: "Hoş geldin yeniden! Bu derste image'ları nasıl küçülteceğimizi göreceğiz: multi-stage build ve küçük taban image'lar." },
        { say: "Elimizde bir TypeScript servisi var. Çalışmadan önce derlenmesi lazım: npm ci geliştirme araçlarını da kuruyor, npm run build da kodu tek bir dist/server.js dosyasına paketliyor." },
        { say: "Hepsini tek bir FROM node:22 üstünde build ediyoruz. Sonuca bak: yaklaşık 1.400 megabayt.", cue: 0 },
        { say: "İçinde tam bir Debian, derleyiciler, 300 megabaytlık node_modules ve kaynak kod var. Oysa çalışırken bunların neredeyse hiçbirine ihtiyaç yok." },
        { say: "Kısacası derlemek için gereken her şeyi, çalışan uygulamayla birlikte üretime taşıyoruz." },
        { say: "Bu kadar yükün neyden oluştuğunu merak ediyorsan, sonraki sayfada içini açıp bakalım." },
      ],
    },
    // 1 · İçinde ne var? (tahmin: ls /app) · sahne: run big, exec ls /app
    {
      lines: [
        { say: "Bu image'dan bir container çalıştıracağız. Container'ın tek işi dist/server.js'i çalıştırmak." },
        { say: "Sonra docker exec ile, çalışan container'ın içinde ls komutunu çalıştırıp neler olduğuna bakacağız." },
        { say: "İçinde app klasörünü listelersek ne görürüz sence? Sadece dist mi, dist'in yanında src, node_modules, package.json gibi şeyler mi, yoksa boş bir klasör mü?" },
      ],
      answer: {
        right: "Doğru, gözün keskin!",
        wrong: "Keşke öyle olsaydı. Bakalım.",
        lines: [
          { say: "Container'ı big adıyla arka planda başlatıyoruz.", cue: 0 },
          { say: "Şimdi içinde app klasörünü listeliyoruz. dist var, ama yanında src, node_modules ve package.json da duruyor.", cue: 1 },
          { say: "Tek stage'de build için kopyalanan ve kurulan her şey image'da kalır: kaynak kod, geliştirme paketleri, derleme çıktısı." },
          { say: "Bunların hepsi her sunucuya indirilecek ve her güvenlik taramasında karşına çıkacak. Image büyüdükçe saldırı yüzeyi de genişler." },
          { say: "Peki derleme araçlarını geride bırakmanın bir yolu var mı? Var, sonraki sayfada." },
        ],
      },
    },
    // 2 · Multi-stage (tahmin: son image kaç MB?) · sahne: build shop:slim
    {
      lines: [
        { say: "Fikir şu: aynı Dockerfile'a ikinci bir stage ekliyoruz. İlk stage'e build adını veriyoruz, derlemeyi o yapıyor." },
        { say: "O stage'de her şey eskisi gibi: bağımlılıkları kuruyor, kodu kopyalıyor, npm run build ile derliyor." },
        { say: "İkinci stage temiz bir node:22-slim ile başlıyor ve COPY from build ile sadece dist klasörünü alıyor." },
        { say: "Sence son image yaklaşık kaç megabayt olur? 1.400 mü, 540 mı, yoksa 240 civarı mı?" },
      ],
      answer: {
        right: "Harika, tam bildin!",
        wrong: "Olsun, sonuç seni şaşırtabilir. İzle.",
        lines: [
          { say: "Build'i başlatıyoruz. İlk stage'in satırları cache'ten geldi, derleme zaten bir kez yapılmıştı. Sadece son stage yeniden kuruldu.", cue: 0 },
          { say: "Sonuç yaklaşık 242 megabayt. Sağdaki boyut çubuklarına bak, aradaki fark kocaman." },
          { say: "Çünkü son image sadece son stage'den oluşur: yaklaşık 240 megabaytlık node:22-slim, artı 2 megabaytlık dist. İlk stage'deki araçlar build bitince atılır." },
          { say: "Her FROM temiz bir sayfa açar. Önceki stage'den sadece COPY from ile açıkça istediğini alırsın; docker history'de de son image'da ilk stage'in hiçbir satırı görünmez." },
          { say: "Uygulaman çalışırken paket istiyorsa, son stage'de sadece üretim bağımlılıklarını kurarsın. Sonraki sayfada tabanı biraz daha inceltelim." },
        ],
      },
    },
    // 3 · alpine · sahne: build shop:alpine
    {
      lines: [
        { say: "Son stage'in tabanını değiştiriyoruz: slim yerine node:22-alpine." },
        { say: "Build ediyoruz. Yaklaşık 162 megabayt, slim'den de küçük. 1.400'den başlamıştık, hatırlarsın.", cue: 0 },
        { say: "Alpine Linux çok küçük bir dağıtım. Önemli bir farkı var: glibc yerine musl kullanıyor." },
        { say: "Çoğu Node ve Python uygulaması alpine'da sorunsuz çalışır. Ama yerel modül derleyen bazı paketler, mesela bazı resim işleme kütüphaneleri ya da veritabanı sürücüleri, musl yüzünden sorun çıkarabilir." },
        { say: "Yani tabanı seçerken sadece boyuta değil, uygulamanın neye ihtiyaç duyduğuna da bakman gerekiyor." },
        { say: "Öyle bir durumda slim daha güvenli seçim. Şimdi sonraki sayfaya geç, en küçüğüne geliyoruz." },
      ],
    },
    // 4 · distroless (tahmin: sh açılır mı?) · sahne: build shop:distroless, run tiny, exec sh
    {
      lines: [
        { say: "Bu sefer son stage'in tabanı distroless'ın Node 22 image'ı. Uygulama bu image'la da çalışıyor." },
        { say: "Şimdi docker exec ile içinde sh açmayı deneyeceğiz. Sence ne olur? Normal bir shell mi açılır, sh bulunamadı diye hata mı alırız, yoksa container çöker mi?" },
      ],
      answer: {
        right: "Evet, bildin!",
        wrong: "Mantıklı, ama değil. İzle.",
        lines: [
          { say: "Önce distroless tabanlı image'ı build ediyoruz. Yaklaşık 132 megabayt.", cue: 0 },
          { say: "Onu tiny adıyla arka planda çalıştırıyoruz, uygulama ayakta. node zaten image'ın entrypoint'i, o yüzden CMD'de sadece betiğin yolu var.", cue: 1 },
          { say: "Şimdi içinde sh açmayı deniyoruz… ve hata. sh bulunamadı, exec 127 ile döndü.", cue: 2 },
          { say: "distroless image'larda sadece uygulamanın çalışması için gerekenler var. Shell yok, paket yöneticisi yok." },
          { say: "Bu bir güvenlik kazancı: saldırgan içeri girse bile kullanacak aracı yok. Bedeli de hata ayıklamanın zorlaşması; çoğu ekip geliştirmede slim, üretimde distroless kullanır." },
          { say: "Gerekirse distroless'ın debug tag'li sürümleri küçük bir busybox shell'i içerir. Sonraki sayfada tek bir stage'i build etmeyi göreceğiz." },
        ],
      },
    },
    // 5 · --target · sahne: build --target build
    {
      lines: [
        { say: "Bazen son image'ı değil, aradaki bir stage'i istersin. Bunun için docker build'in target seçeneği var." },
        { say: "Target olarak build stage'ini veriyoruz. Docker, Dockerfile'ı o stage'in sonunda durdurdu. Ortaya çıkan image tüm derleme araçlarını taşıyor: yaklaşık 1.400 megabayt.", cue: 0 },
        { say: "Bu da testleri çalıştırmak için çok kullanışlı. CI'da testleri bu araçlarla dolu image'da koşturursun, üretime ise son stage gider." },
        { say: "Mesela bu image'a shop:test adını verirsin, sonra docker run ile içinde npm test çalıştırırsın. Geliştirme araçlarının hepsi orada, elinin altında." },
        { say: "Tek dosya, iki amaç. Ayrı bir test Dockerfile'ı yazmana gerek kalmaz." },
        { say: "Sonraki sayfaya geçelim, hangi tabanı ne zaman seçeceğimizi toparlayalım." },
      ],
    },
    // 6 · Gerçekte
    {
      lines: [
        { say: "Şimdi elimizdeki tabanları kabaca bir sıraya koyalım. Tam image, yani node:22 ya da python:3.12, build stage'i için." },
        { say: "Slim, çoğu uygulamanın son stage'i için güvenli varsayılan. Alpine daha küçük ama musl'a dikkat." },
        { say: "Distroless üretimde en küçük ve en güvenli seçenek, ama içine giremezsin." },
        { say: "Go ya da Rust gibi tek bir statik binary üreten dillerde son stage FROM scratch bile olabilir: bomboş bir image, içinde sadece senin programın." },
        { say: "Bir dürüstlük notu: buradaki boyutlar yaklaşık, sıkıştırılmamış ve sürümden sürüme değişir. Registry'ye gönderilen ve indirilen boyut sıkıştırılmış olduğu için daha küçüktür." },
        { say: "Anlatacaklarım bu kadar. Hadi sonraki sayfaya, sıra sende." },
      ],
    },
    // 7 · Sen dene
    {
      lines: [
        { say: "Ve terminal senin. Proje bir TypeScript servisi, Dockerfile şu an tek stage ve node:22 üstünde." },
        { say: "Gerçek işten dört senaryo var: 1 gigabaytlık bir image'ı 200 megabaytın altına indirmek, daha da küçültmek, testler için bir stage çıkarmak ve kimsenin içeri giremediğinden emin olmak." },
        { say: "Dockerfile'ı nano ile kendin düzenleyip docker build ile build edeceksin. Sahne her stage'in layer'larını ve image'ın boyutunu gösterecek; docker images da boyutları listeler." },
        { say: "Her build'den sonra sağdaki çubuklara bak; image'ın ne kadar inceldiğini orada göreceksin." },
        { say: "Küçük bir ipucu: distroless'ın ENTRYPOINT'i zaten node, o yüzden CMD'ye sadece betiğin yolunu yazman yeter." },
        { say: "İpuçları adım adım açılıyor. Az komutla bitirirsen üç yıldız. Hadi bakalım, o image'ı incelt!" },
      ],
    },
  ],
};
