import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · CMD · sahne: run acme/greet:cmd
    {
      lines: [
        { say: "Tekrar hoş geldin! Bu derste container başlarken tam olarak neyin çalıştığına bakacağız: CMD ve ENTRYPOINT." },
        { say: "Elimizde acme/greet:cmd diye küçük bir image var. Dockerfile'ında tek bir satır duruyor: CMD, echo Merhaba." },
        { say: "Şimdi docker run ile, image adından başka hiçbir şey yazmadan çalıştırıyoruz. Bak, ekrana Merhaba yazdı.", cue: 0 },
        { say: "Neden? Çünkü sen başka bir şey söylemedin, Docker da Dockerfile'daki varsayılan komutu çalıştırdı." },
        { say: "Sağdaki kartta üç parça var: image'ın Dockerfile'ı, senin yazdığın komut ve container'da gerçekten PID 1 olarak çalışan süreç. Ders boyunca hep bu üçünü karşılaştıracağız." },
        { say: "Hazırsan sonraki sayfaya geç, bu varsayılanı biraz kurcalayalım." },
      ],
    },
    // 1 · CMD ezilir (tahmin: Ada ne olur?) · sahne: run acme/greet:cmd Ada
    {
      lines: [
        { say: "CMD hâlâ echo Merhaba. Şimdi image adının arkasına bir isim ekleyeceğiz: docker run acme/greet:cmd Ada." },
        { say: "Sence ne olur? Ekrana Merhaba Ada mı yazar, Ada'yı yok sayıp yine Merhaba mı der, yoksa Ada diye bir program arayıp bulamaz ve 127 ile mi çıkar?" },
      ],
      answer: {
        right: "Bingo, aynen öyle!",
        wrong: "Çok mantıklı bir tahmin ama hayır. Birlikte bakalım.",
        lines: [
          { say: "Komutu çalıştırıyoruz. Kartta PID 1'e bak: orada artık echo yok, sadece Ada var.", cue: 0 },
          { say: "Container Ada diye bir program aradı, bulamadı ve exit code 127 ile kapandı. 127, komut bulunamadı demek." },
          { say: "Olay şu: image adından sonra yazdığın her şey CMD'nin bir parçasına değil, tamamına geçer. Ada eklenmedi, echo Merhaba'nın yerine oturdu." },
          { say: "Yani CMD bir varsayılan. Kimse bir şey demezse çalışır, biri bir şey derse tamamen kenara bırakılır. Sonraki sayfada bunu bilerek kullanalım." },
        ],
      },
    },
    // 2 · Doğru ezme · sahne: run acme/greet:cmd echo Selam
    {
      lines: [
        { say: "Madem CMD tamamen değişiyor, o zaman ona baştan sona tam bir komut verelim." },
        { say: "Bu sefer docker run acme/greet:cmd echo Selam yazıyoruz. PID 1 echo Selam oldu, çıktı da Selam.", cue: 0 },
        { say: "Program dahil her şeyi kendin söyledin, Docker da sorgusuz sualsiz onu çalıştırdı." },
        { say: "Gerçek hayatta bunu çok yaparsın. Mesela node:22 image'ında node --version ile sürüme bakarsın, ya da bir web image'ından tek seferlik bir migrate komutu çalıştırırsın." },
        { say: "Image aynı, iş farklı. Şimdi sonraki sayfaya geçelim, sahneye ENTRYPOINT giriyor." },
      ],
    },
    // 3 · ENTRYPOINT · sahne: run acme/greet:ep
    {
      lines: [
        { say: "İkinci image'ımız acme/greet:ep. Bunun Dockerfile'ında iki satır var: ENTRYPOINT echo Merhaba, CMD de dünya." },
        { say: "Argüman vermeden çalıştırıyoruz. Bak, Docker ikisini uç uca ekledi: PID 1 echo Merhaba dünya.", cue: 0 },
        { say: "Burada roller değişiyor. ENTRYPOINT programın kendisi, CMD ise ona verilen varsayılan argümanlar." },
        { say: "Yani artık CMD tek başına bir komut değil. Sadece ENTRYPOINT'in arkasına eklenecek kelimeleri söylüyor." },
        { say: "Peki bu image'a da Ada dersek ne olur? Cevabı sonraki sayfada." },
      ],
    },
    // 4 · Argüman ekle (tahmin: ep'e Ada) · sahne: run acme/greet:ep Ada
    {
      lines: [
        { say: "Aynı deneyi tekrarlıyoruz: aynı Ada argümanı, ama bu sefer ENTRYPOINT'li image'a." },
        { say: "Sence ne çıkar? Yine exit 127 mi, Merhaba Ada mı, yoksa Merhaba dünya Ada mı?" },
      ],
      answer: {
        right: "Süper, doğru!",
        wrong: "Olsun, bu kısım herkesin kafasını karıştırır. İzle.",
        lines: [
          { say: "docker run acme/greet:ep Ada diyoruz. Çıktı: Merhaba Ada.", cue: 0 },
          { say: "Ada yine CMD'nin yerini aldı, yani dünya gitti. Ama ENTRYPOINT yerinde kaldı ve Ada onun arkasına eklendi: echo Merhaba, artı Ada." },
          { say: "Bu, araç gibi davranan image'lar için biçilmiş kaftan. Kullanıcı programı seçmez, sadece ona ne vereceğini söyler." },
          { say: "Mesela bir acme/backup image'ı düşün: ENTRYPOINT backup, CMD ise help. Arkasına db shop yazarsan program aynı kalır, sadece argümanlar değişir." },
          { say: "Peki programın kendisini değiştirmek istersek? Sonraki sayfada onun da yolu var." },
        ],
      },
    },
    // 5 · --entrypoint · sahne: run --entrypoint ls acme/greet:ep /
    {
      lines: [
        { say: "Bazen ENTRYPOINT'in kendisini değiştirmen gerekir. Bunun için docker run'ın entrypoint seçeneği var." },
        { say: "Entrypoint olarak ls veriyoruz, image adından sonra da kök dizini. PID 1 artık ls, ve kök dizini listeledi.", cue: 0 },
        { say: "Bir noktaya dikkat: entrypoint seçeneği image'ın CMD'sini de siler. O yüzden ls'in argümanını, yani kök dizini, image adından sonra kendimiz yazdık." },
        { say: "En sık kullanımı bir image'ın içine bakmak. Entrypoint olarak sh verirsin, içeride bir kabuk açılır, etrafı gezersin." },
        { say: "Sonraki sayfada işin biraz daha derin tarafına, sinyallere bakacağız." },
      ],
    },
    // 6 · Shell form (tahmin: hangisi 137?) · sahne: run shell, run exec, stop exec, kill shell
    {
      lines: [
        { say: "Şimdi iki nginx image'ımız var. İkisi de aynı siteyi sunuyor, tek fark CMD'nin yazılışı." },
        { say: "Birinde CMD shell form ile, düz bir metin olarak yazılmış. Diğerinde exec form ile, yani bir JSON dizisi olarak." },
        { say: "İkisine de docker stop diyeceğiz. Sence hangisi seni 10 saniye bekletip 137 ile kapanır? Shell form mu, exec form mu, yoksa ikisi de mi?" },
      ],
      answer: {
        right: "Harika, tam isabet!",
        wrong: "Yaklaştın ama değil. Şimdi göstereyim.",
        lines: [
          { say: "Önce shell form'lu container'ı arka planda başlatıyoruz. Soldaki kartta PID 1'e bak: nginx değil, bin sh.", cue: 0 },
          { say: "Sonra exec form'lu olanı başlatıyoruz. Sağdakinde PID 1 doğrudan nginx.", cue: 1 },
          { say: "Exec form'lu olanı durduruyoruz. SIGTERM doğrudan nginx'e gitti, nginx temiz kapandı: exit 0.", cue: 2 },
          { say: "Shell form'da ise sh sinyali nginx'e iletmez. Gerçekte Docker 10 saniye bekler, sonra SIGKILL gönderir; burada beklemeyi atlayıp sonucu doğrudan kill ile gösteriyoruz: 137.", cue: 3 },
          { say: "137 demek yarım kalan istekler, yazılmamış dosyalar demek. Kural basit: CMD ve ENTRYPOINT'i JSON dizisi olarak, çift tırnakla yaz." },
          { say: "Bir de şunu bil: shell form'da yazılmış bir ENTRYPOINT, CMD'yi ve docker run argümanlarını tamamen yok sayar. Hadi sonraki sayfaya, bir hata kodunu yakından tanıyalım." },
        ],
      },
    },
    // 7 · 127 · sahne: run acme/greet:cmd ehco merhaba
    {
      lines: [
        { say: "Biraz önce 127 ile tanıştık. Şimdi onu gerçek hayatta en sık nasıl göreceğine bakalım." },
        { say: "docker run acme/greet:cmd ehco merhaba yazıyoruz. Gözünden kaçtı mı? echo yerine ehco. Container anında 127 ile kapandı.", cue: 0 },
        { say: "Tek harflik bir yazım hatası yetti, çünkü ehco diye bir program yok." },
        { say: "127 gördüğünde üç şeye bak. Önce yazıma. Sonra image'da o program gerçekten var mı; küçük image'larda bash ya da curl çoğu zaman yoktur. En son da script'in dosya yoluna." },
        { say: "docker logs da işini kolaylaştırır, executable file not found satırını orada bulursun. Şimdi sonraki sayfaya geç, gerçek projelere bakalım." },
      ],
    },
    // 8 · Gerçekte
    {
      lines: [
        { say: "Peki gerçek projelerde bunlar nasıl yazılıyor? Çoğu uygulama için tek bir exec form CMD yeter, mesela node server.js. Kullanıcı gerekirse komutu tamamen değiştirebilir." },
        { say: "Başlamadan önce hazırlık gerekiyorsa, mesela bir şeyi beklemek ya da ayar dosyası üretmek, bir giriş script'i yazılır." },
        { say: "Script işini bitirince son satırda exec ile CMD'deki komuta devreder. Buradaki exec çok önemli: sayesinde asıl program PID 1 olur ve sinyalleri alır." },
        { say: "Bir image ne çalıştıracak diye merak ediyorsan Dockerfile'ını aramana gerek yok. docker inspect, image'ın Entrypoint ve Cmd alanlarını gösterir." },
        { say: "Anlatacaklarım bu kadar. Şimdi sıra sende, sonraki sayfaya geç." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Geldik senin sahana. Aşağıda bir terminal var, makinede de acme/greet:cmd ve acme/greet:ep hazır bekliyor." },
        { say: "Gerçek işten dört senaryo var: Ada'ya selam vermek, bir exit 127'yi düzeltmek, bir image'ın içine bakmak ve sonunda kendi selamlayıcı image'ını yazmak." },
        { say: "docker run komutlarını kendin yazacaksın, gerekirse nano ile Dockerfile'ı da. Sahne her seferinde Dockerfile'ı, yazdığını ve gerçekten çalışanı gösterecek." },
        { say: "Takılırsan docker inspect ile image'ın Entrypoint ve Cmd ayarlarına bak; cevap çoğu zaman oradadır." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız. Haydi, kolay gelsin!" },
      ],
    },
  ],
};
