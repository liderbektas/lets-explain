import type { LessonNarration } from "@lets-explain/core/course/narration";

/**
 * The lesson told aloud. Not the notes read out: the same ideas, said the way a teacher would
 * say them while pointing at the scene. One entry per lesson step; `cue` starts that scene action.
 */
export const narration: LessonNarration = {
  tr: [
    // 0 · Neden
    {
      lines: [
        { say: "Tekrar hoş geldin! Kursun son dersindeyiz ve bakışımızı biraz genişletiyoruz: Kubernetes'e kısa bir göz atacağız." },
        { say: "Compose ile bütün uygulamayı tek komutla açabiliyorsun, harika. Ama hepsi tek bir makinede. O makine çökerse her şey gider." },
        { say: "Trafik artınca ikinci bir makineye taşmanın da kolay yolu yok. Kubernetes tam burada devreye giriyor: container'ları bir makine grubunda, yani bir cluster'da çalıştırır." },
        { say: "Sağda üç makine görüyorsun. Kubernetes bunlara node der. Şu an üstlerinde hiçbir şey çalışmıyor." },
        { say: "Her şey kavram düzeyinde kalacak, ama kendi bilgisayarında denemek istersen kind ya da minikube ile küçük bir cluster açabilirsin. Hadi ilk uygulamamızı yerleştirelim." },
      ],
    },
    // 1 · Deployment (tahmin: pod'lar nereye?) · sahne: 3 kopyalı Deployment
    {
      lines: [
        { say: "Kubernetes'e bir Deployment vereceğiz. İçinde aslında tek bir cümle var: shop:v1 image'ından üç kopya çalışsın." },
        { say: "Üç node var. Sence pod'lar nereye yerleşir? Hepsi ilk node'a mı, node'lara dağılarak mı, yoksa her node'a hepsi kopyalanıp toplam dokuz mu?" },
      ],
      answer: {
        right: "Evet, dağıldılar!",
        wrong: "Olabilirdi, ama Kubernetes daha akıllı. Bak.",
        lines: [
          { say: "Deployment'ı oluşturuyoruz. Kubernetes üç pod açıyor ve her birini ayrı bir node'a koyuyor.", cue: 0 },
          { say: "Scheduler her pod'u yeri en uygun node'a koyar, ve aynı Deployment'ın kopyalarını dağıtmayı tercih eder. Neden? Bir node çökerse hepsi birden gitmesin diye." },
          { say: "Pod, Kubernetes'teki en küçük birim: bir ya da birkaç container'ın birlikte çalıştığı bir kutu. Burada her pod'da tek container var." },
          { say: "Bir de dikkat et: Kubernetes'e şunu çalıştır demedik, şöyle olsun dedik. Buna declarative, yani bildirimsel çalışma denir. Sol üstteki control plane bu istenen durumu tutar." },
          { say: "Pod'lar hazır. Peki onlara nasıl ulaşacağız? Sonraki sayfada." },
        ],
      },
    },
    // 2 · Service · sahne: expose, üç curl
    {
      lines: [
        { say: "Pod'larla ilgili bir sorun var: gelip giderler, ve her birinin adresi değişir. Uygulamanın geri kalanı onlara hangi adresle ulaşacak?" },
        { say: "Cevap Service. web adında bir Service açıyoruz; pod'ların önüne sabit bir ad ve adres koyuyor.", cue: 0 },
        { say: "Şimdi curl ile web'e bir istek atıyoruz. Bir pod cevap verdi.", cue: 1 },
        { say: "Bir tane daha… Bu sefer başka bir pod cevap veriyor.", cue: 2 },
        { say: "Ve üçüncüsü, yine başka bir pod. Service istekleri arkadaki pod'lara dağıtıyor.", cue: 3 },
        { say: "Compose'da servisleri adlarıyla çağırdığımızı hatırla; bu, onun cluster'daki karşılığı. Şimdi biraz yaramazlık yapalım, sonraki sayfaya geç." },
      ],
    },
    // 3 · Kendini onarır (tahmin: pod silinirse?) · sahne: bir pod'u sil
    {
      lines: [
        { say: "Şimdi bir pod'u kendi elimizle sileceğiz. Ama Deployment hâlâ üç kopya istiyor." },
        { say: "Sence ne olur? İki pod'la mı devam edilir, Kubernetes hemen yeni bir pod mu açar, yoksa bütün Deployment mı durur?" },
      ],
      answer: {
        right: "Tam olarak öyle!",
        wrong: "Mantıklı bir endişe, ama hayır. İzle.",
        lines: [
          { say: "Pod'u siliyoruz… ve birkaç an içinde aynı yerde, yeni bir adla yenisi başlıyor.", cue: 0 },
          { say: "Kubernetes sürekli iki şeyi karşılaştırır: istenen ve çalışan. Üç istenirken iki çalışıyorsa, farkı kapatmak için yeni bir pod açar." },
          { say: "Restart policy'yi hatırlıyor musun? Onun tek bir container için yaptığını, Kubernetes bütün uygulama için yapıyor." },
          { say: "Peki bir pod değil de koca bir makine giderse? Sonraki sayfada." },
        ],
      },
    },
    // 4 · Node çöktü (tahmin: node-2'deki pod'a ne olur?) · sahne: node-2 çöker
    {
      lines: [
        { say: "Şimdi daha büyük bir felaket: node-2 tamamen çökecek. Üstünde bir pod çalışıyor." },
        { say: "O pod'a ne olur sence? Kaybolup iki pod mu kalır, başka bir node'da mı yeniden açılır, yoksa node-2'nin geri gelmesini mi bekler?" },
      ],
      answer: {
        right: "Doğru, uygulama ayakta!",
        wrong: "Güzel düşünce, ama Kubernetes beklemiyor. Bak.",
        lines: [
          { say: "node-2 çöküyor, NotReady oluyor ve üstündeki pod onunla birlikte gidiyor. Kubernetes hemen yerine bir pod açıyor, bu sefer kalan iki node'dan birine.", cue: 0 },
          { say: "Çünkü Deployment hâlâ üç istiyor. Service de artık sadece ayaktaki pod'lara gönderiyor, o yüzden kullanıcılar bir şey fark etmiyor." },
          { say: "Dürüst olayım: sahnede bu anında oluyor. Gerçek bir cluster'da bir node'un öldüğüne karar vermek ve pod'ları taşımak çoğu zaman dakikalar sürer. Planlı bakımda bunu kubectl drain ile önceden yaparsın." },
          { say: "Şimdi trafik artarsa ne yaparız, ona bakalım. Sonraki sayfaya geç." },
        ],
      },
    },
    // 5 · Ölçekle · sahne: 5 kopyaya çıkar
    {
      lines: [
        { say: "Trafik arttı diyelim. Kubernetes'te ölçeklemek aslında tek bir sayıyı değiştirmek." },
        { say: "Kopya sayısını beşe çıkarıyoruz. Kubernetes iki yeni pod açıyor ve onları ayaktaki node'lara dağıtıyor.", cue: 0 },
        { say: "Azaltmak da aynı: sayıyı küçültürsün, fazlası kapanır. İkisini de kubectl scale komutuyla yaparsın." },
        { say: "Sayıyı yüke göre kendisi değiştirsin istersen Horizontal Pod Autoscaler var. Örneğin işlemci kullanımı yüzde 70'i geçince kopya ekler." },
        { say: "Sırada her ekibin biraz çekindiği an var: yeni sürümü yayınlamak. Sonraki sayfada." },
      ],
    },
    // 6 · Güncelle (tahmin: servis kesilir mi?) · sahne: image v2, curl
    {
      lines: [
        { say: "Beş pod v1 ile çalışıyor. Şimdi image'ı shop:v2 yapacağız." },
        { say: "Güncelleme sırasında servis kesilir mi sence? Bütün pod'lar aynı anda mı kapanır, yeniler açıldıkça eskiler mi kapanır, yoksa cluster'ı durdurmak mı gerekir?" },
      ],
      answer: {
        right: "Aynen, kesinti yok!",
        wrong: "Eski usul öyleydi. Bak şimdi.",
        lines: [
          { say: "Image'ı v2 yapıyoruz. Kubernetes pod'ları tek tek değiştiriyor; renklerin yeşilden maviye döndüğünü görüyorsun.", cue: 0 },
          { say: "Buna rolling update deniyor: önce yeni bir pod açılır, hazır olunca eski bir pod kapanır, böyle devam eder. Hiçbir an çalışan pod sayısı beşin altına düşmedi." },
          { say: "curl ile web'e soruyoruz: cevap artık v2.", cue: 1 },
          { say: "Bir sorun çıkarsa kubectl rollout undo ile tek komutta geri dönersin. Bunun işe yaraması için image'ları SHA gibi değişmeyen etiketlerle yayınlamak önemli; geçen dersten tanıdık, değil mi?" },
          { say: "Gerçekte aynı anda kaç pod'un değişeceğini maxSurge ve maxUnavailable belirler. Readiness probe da yeni pod hazır olmadan eskinin kapanmasını engeller. Sonraki sayfaya geçelim." },
        ],
      },
    },
    // 7 · YAML · sahne: node-2 geri gelir
    {
      lines: [
        { say: "Bu arada çöken makineyi tamir ettik." },
        { say: "node-2 geri geliyor. Ama bak, pod'lar ona kendiliğinden taşınmıyor.", cue: 0 },
        { say: "Neden? Çünkü çalışan pod sayısı zaten istenene eşit. Kubernetes sadece bir fark varsa harekete geçer." },
        { say: "Bir şey daha: bu derste her şeyi komutlarla yaptık, ama gerçek hayatta bunlar bir YAML dosyasında durur ve Git'te saklanır. Soldaki web.yaml'da Deployment ve Service birlikte duruyor." },
        { say: "kubectl apply dosyadaki durumu cluster'a uygular. Dosyayı değiştirip tekrar apply etmek, değişikliğin ta kendisi. Son bir konu kaldı, sonraki sayfaya geç." },
      ],
    },
    // 8 · Docker ile bağı
    {
      lines: [
        { say: "Peki bütün bunların Docker'la ilgisi ne? Kubernetes, senin Docker ile build ettiğin image'ları çalıştırır. Hepsi standart OCI image'ları." },
        { say: "Kubernetes 1.24'ten beri container'ları Docker Engine değil, doğrudan containerd ya da CRI-O çalıştırıyor; eski dockershim kaldırıldı. Ama senin için bir şey değişmiyor: build, push ve registry aynı." },
        { say: "Peki ne zaman hangisi? Tek sunucu, birkaç servis, küçük bir ekip varsa Compose yeter. Birden fazla makine, sık güncelleme, otomatik ölçekleme ve makine çökmesine dayanıklılık gerekiyorsa Kubernetes." },
        { say: "Çoğu ekip de Kubernetes'i kendisi kurmaz; EKS, GKE ya da AKS gibi bulut sağlayıcısının hazır hizmetini kullanır." },
        { say: "Son bir dürüstlük notu: sahnedeki model pod'ları hep eşit dağıtıyor ve her şeyi anında yapıyor. Gerçek scheduler işlemci ve bellek isteklerine bakar, pod'ların başlaması da zaman alır." },
        { say: "Anlatacaklarım bu kadar. Son sahne senin; sonraki sayfaya geç." },
      ],
    },
    // 9 · Sen dene
    {
      lines: [
        { say: "Ve kursun son sahnesi! Üç node'lu bir cluster ve klasöründe bir web.yaml var. Aşağıdaki terminalde gerçek işten alınmış beş senaryo seni bekliyor." },
        { say: "İlk kurulumdan sızdıran bir pod'a, yoğun bir geceden yeni sürüme ve geri dönmeye kadar. kubectl komutlarını kendin yazacaksın, istersen dosyayı nano ile düzenleyebilirsin." },
        { say: "Takılırsan kubectl get pods ve kubectl get nodes çok işine yarar. Cluster'a bilgisayarından kubectl port-forward ile ulaşırsın." },
        { say: "İpuçları adım adım açılıyor, ama önce kendin dene. Az komutla bitirirsen üç yıldız." },
        { say: "Buraya kadar geldiysen kocaman bir tebrik! Tek bir container'dan koca bir cluster'a kadar yürüdük. Şimdi bunları kendi projelerinde kullanma zamanı; yolun açık olsun!" },
      ],
    },
  ],
};
