import * as H2kTemplateSerializer from "./h2k-template-serializer.mjs";

globalThis.H2kTemplateSerializer = H2kTemplateSerializer;

H2kTemplateSerializer.ensureTemplateLoaded().catch(() => {}).finally(() => {
  globalThis.dispatchEvent(new Event("h2k-serializer-ready"));
});
