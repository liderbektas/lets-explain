import { l } from "@lets-explain/core/i18n";
import type { GlossaryEntry } from "../../glossary";

export const terms: Record<string, GlossaryEntry> = {
  schema: {
    term: "Schema",
    def: l(
      "Bir kaydın hangi alanlardan oluştuğunu ve tiplerini anlatan tarif. Avro, Protobuf veya JSON Schema ile yazılır.",
      "A description of which fields a record has and their types. Written in Avro, Protobuf or JSON Schema.",
    ),
  },
  schemaRegistry: {
    term: "Schema Registry",
    def: l(
      "Şemaları sürüm sürüm saklayan ve yeni bir sürümün eskilerle uyumlu olup olmadığını kontrol eden ayrı bir servis. Apache Kafka'nın parçası değildir.",
      "A separate service that stores schemas version by version and checks whether a new version is compatible. It is not part of Apache Kafka.",
    ),
  },
  serializer: {
    term: "Serializer",
    def: l(
      "Producer'da bir nesneyi Kafka'ya yazılacak byte'lara çeviren parça. Consumer'daki karşılığı deserializer'dır.",
      "The piece in a producer that turns an object into the bytes Kafka stores. The consumer side is the deserializer.",
    ),
  },
  subject: {
    term: "Subject",
    def: l(
      "Registry'de bir şemanın sürümlerinin toplandığı isim. Varsayılan olarak `<topic>-value` ve `<topic>-key`.",
      "The name a schema's versions are kept under in the registry. By default `<topic>-value` and `<topic>-key`.",
    ),
  },
  compatibility: {
    term: "Compatibility mode",
    def: l(
      "Yeni bir şema sürümünün hangi kurala göre kabul edileceği: BACKWARD (varsayılan), FORWARD, FULL veya NONE.",
      "The rule a new schema version must pass: BACKWARD (the default), FORWARD, FULL or NONE.",
    ),
  },
};
