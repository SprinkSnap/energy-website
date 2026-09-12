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

  async function loadOptionPack(id) {
    try {
      options.set(id, await fetchJson(`${CATALOG_BASE}options/${id}.json`));
    } catch (_err) {
      /* optional option packs */
    }
  }

  async function loadCatalog() {
    manifest = await fetchJson(`${CATALOG_BASE}manifest.json`);
    sectionsIndex = await fetchJson(`${CATALOG_BASE}${manifest.sectionsIndex}`);
    for (const entry of sectionsIndex.entries) {
      sections.set(entry.id, await fetchJson(`${CATALOG_BASE}${entry.file}`));
    }

    const optionIds = new Set();
    if (manifest.optionPacks) {
      for (const id of manifest.optionPacks) optionIds.add(id);
    }
    for (const section of sections.values()) {
      for (const group of section.groups || []) {
        for (const field of group.fields || []) {
          if (field.optionsRef) optionIds.add(field.optionsRef);
          for (const dep of field.dependsOn || []) {
            if (dep.optionsRef) optionIds.add(dep.optionsRef);
          }
          if (field.bind?.dictFor) optionIds.add(field.bind.dictFor);
        }
      }
    }

    for (const id of optionIds) await loadOptionPack(id);
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
    init,
    renderSection,
    registerCustomRenderer,
    registerBeforeRenderHook,
    registerBehaviorAction,
    trackPathChange,
    wrapSaveSession,
    getManifest,
    getSection,
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
