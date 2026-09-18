/**
 * Versioned HOT2000 field catalog loader, behavior engine, and section renderer.
 * Project values stay in xmlDoc; definitions live in catalog/*.json.
 */
(function initH2kCatalog(global) {
  const CATALOG_BASE = "catalog/";
  let manifest = null;
  let sectionsIndex = null;
  const sections = new Map();
  const options = new Map();
  const sectionLoadPromises = new Map();
  const optionLoadPromises = new Map();
  let indexLoaded = false;
  let helpers = null;
  let schemaRenderer = null;
  const customRenderers = new Map();
  const beforeRenderHooks = new Map();
  const behaviorActions = new Map();
  let changedPathTracker = null;

  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Catalog load failed: ${path} (${res.status})`);
    return res.json();
  }

  function optionsAsCodedDict(refId) {
    const entry = options.get(refId);
    if (!entry?.options) return null;
    return Object.fromEntries(
      Object.entries(entry.options).map(([code, labels]) => [
        code,
        [labels.en ?? labels, labels.fr ?? labels.en ?? labels],
      ]),
    );
  }

  function getDependentLocationRecords(field) {
    return schemaRenderer?.getDependentRecords(field) || [];
  }

  function registerCustomRenderer(name, fn) {
    customRenderers.set(name, fn);
  }

  function registerBeforeRenderHook(name, fn) {
    beforeRenderHooks.set(name, fn);
  }

  function registerBehaviorAction(name, fn) {
    behaviorActions.set(name, fn);
  }

  function runBeforeRender(section) {
    for (const hook of section.beforeRender || []) {
      beforeRenderHooks.get(hook)?.();
    }
  }

  function getProgramMode() {
    const el = document.getElementById("programMode");
    return el?.value || "general";
  }

  function rerenderSection(sectionId) {
    const section = sections.get(sectionId);
    const containerId = section?.route?.containerId;
    const container = containerId ? document.getElementById(containerId) : null;
    if (section && container) renderSection(sectionId, container);
  }

  function ensureSchemaRenderer() {
    if (schemaRenderer) return schemaRenderer;
    if (!global.H2kSchemaRenderer) throw new Error("H2kSchemaRenderer is not loaded");
    schemaRenderer = global.H2kSchemaRenderer.createRenderer({
      helpers: {
        ...helpers,
        trackPathChange,
        fromSI: helpers.fromSI,
        postalFieldHTML: helpers.postalFieldHTML,
        listRepeaterItems: helpers.listRepeaterItems,
      },
      options,
      customRenderers,
      behaviorActions,
      getProgramMode,
      rerenderSection,
    });
    return schemaRenderer;
  }

  function renderSection(sectionId, container) {
    if (!helpers) throw new Error("H2kCatalog.init() must run before rendering.");
    const section = sections.get(sectionId);
    if (!section) throw new Error(`Unknown catalog section: ${sectionId}`);
    if (!container) throw new Error(`Missing container for section ${sectionId}`);

    runBeforeRender(section);
    ensureSchemaRenderer().renderSection(section, container);
    return container;
  }

  function applyBehaviorTriggers(changedPath) {
    for (const section of sections.values()) {
      for (const rule of section.behaviors || []) {
        const triggerPath = rule.trigger?.path;
        if (!triggerPath || triggerPath !== changedPath) continue;
        behaviorActions.get(rule.action)?.();
      }
    }
  }

  function wrapSaveSession(originalSave) {
    return function wrappedSaveSession() {
      originalSave?.();
      if (helpers?.getPath && changedPathTracker) {
        for (const path of changedPathTracker) applyBehaviorTriggers(path);
        changedPathTracker.clear();
      }
    };
  }

  function trackPathChange(path) {
    if (changedPathTracker) changedPathTracker.add(path);
  }

  function collectOptionRefsFromSection(section) {
    const ids = new Set();
    for (const group of section.groups || []) {
      for (const field of group.fields || []) {
        if (field.optionsRef) ids.add(field.optionsRef);
        if (field.bind?.dictFor) ids.add(field.bind.dictFor);
        for (const dep of field.dependsOn || []) {
          if (dep.optionsRef) ids.add(dep.optionsRef);
        }
      }
    }
    return ids;
  }

  async function loadOptionPack(id) {
    try {
      options.set(id, await fetchJson(`${CATALOG_BASE}options/${id}.json`));
    } catch (_err) {
      /* optional option packs */
    }
  }

  async function ensureOptionPack(id) {
    if (options.has(id)) return options.get(id);
    if (!optionLoadPromises.has(id)) {
      optionLoadPromises.set(id, loadOptionPack(id));
    }
    await optionLoadPromises.get(id);
    return options.get(id);
  }

  function getSectionEntry(id) {
    return sectionsIndex?.entries?.find((entry) => entry.id === id) || null;
  }

  async function loadCatalogIndex() {
    if (indexLoaded) return { manifest, sectionsIndex };
    manifest = await fetchJson(`${CATALOG_BASE}manifest.json`);
    sectionsIndex = await fetchJson(`${CATALOG_BASE}${manifest.sectionsIndex}`);
    indexLoaded = true;
    return { manifest, sectionsIndex };
  }

  async function ensureSection(id) {
    if (sections.has(id)) return sections.get(id);
    if (!indexLoaded) await loadCatalogIndex();
    const entry = getSectionEntry(id);
    if (!entry) throw new Error(`Unknown catalog section: ${id}`);
    if (!sectionLoadPromises.has(id)) {
      sectionLoadPromises.set(
        id,
        (async () => {
          const section = await fetchJson(`${CATALOG_BASE}${entry.file}`);
          sections.set(id, section);
          await Promise.all(
            [...collectOptionRefsFromSection(section)].map((optionId) => ensureOptionPack(optionId)),
          );
          return section;
        })(),
      );
    }
    return sectionLoadPromises.get(id);
  }

  async function ensureSections(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    await Promise.all(unique.map((id) => ensureSection(id)));
    return unique.map((id) => sections.get(id));
  }

  async function preloadRemainingSections() {
    if (!indexLoaded) await loadCatalogIndex();
    const pending = sectionsIndex.entries
      .map((entry) => entry.id)
      .filter((id) => !sections.has(id));
    await Promise.all(pending.map((id) => ensureSection(id)));
    if (manifest?.optionPacks) {
      await Promise.all(manifest.optionPacks.map((id) => ensureOptionPack(id)));
    }
    return { manifest, sectionsIndex, sections, options };
  }

  async function loadCatalog() {
    await loadCatalogIndex();
    await Promise.all(sectionsIndex.entries.map((entry) => ensureSection(entry.id)));
    if (manifest.optionPacks) {
      await Promise.all(manifest.optionPacks.map((id) => ensureOptionPack(id)));
    }
    return { manifest, sectionsIndex, sections, options };
  }

  function init(h) {
    helpers = h;
    changedPathTracker = new Set();
    schemaRenderer = null;
  }

  function getManifest() {
    return manifest;
  }
  function getSection(id) {
    return sections.get(id);
  }
  function isSectionLoaded(id) {
    return sections.has(id);
  }
  function getOptions(id) {
    return options.get(id);
  }
  function getOptionsDict(id) {
    return optionsAsCodedDict(id);
  }
  function getLocationRecords(region) {
    return options.get("weather-locations")?.recordsByRegion?.[region] || [];
  }
  function listSections() {
    return sectionsIndex?.entries || [];
  }
  function coverageReport() {
    return manifest?.coverage || null;
  }
  function unresolvedRules() {
    return manifest?.unresolvedRules || [];
  }
  function isCatalogDriven(sectionId) {
    const entry = sectionsIndex?.entries?.find((e) => e.id === sectionId);
    return entry?.migration === "catalog-driven";
  }

  global.H2kCatalog = {
    loadCatalog,
    loadCatalogIndex,
    ensureSection,
    ensureSections,
    preloadRemainingSections,
    init,
    renderSection,
    registerCustomRenderer,
    registerBeforeRenderHook,
    registerBehaviorAction,
    trackPathChange,
    wrapSaveSession,
    getManifest,
    getSection,
    isSectionLoaded,
    getOptions,
    getOptionsDict,
    getLocationRecords,
    listSections,
    coverageReport,
    unresolvedRules,
    optionsAsCodedDict,
    isCatalogDriven,
    rerenderSection,
  };
})(typeof window !== "undefined" ? window : globalThis);
