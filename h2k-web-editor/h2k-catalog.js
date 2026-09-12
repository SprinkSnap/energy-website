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
  const customRenderers = new Map();
  const beforeRenderHooks = new Map();
  const behaviorActions = new Map();

  function colClass(span) {
    const n = Number(span) || 12;
    if (n >= 12) return "span-12";
    if (n >= 6) return "span-6";
    if (n >= 4) return "span-4";
    if (n >= 3) return "span-3";
    if (n >= 2) return "span-2";
    return "span-1";
  }

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
    const dep = field.dependsOn?.[0];
    if (!dep || !helpers?.getPath) return [];
    const region = helpers.getPath(dep.path);
    const entry = options.get(dep.optionsRef);
    const list = entry?.[dep.optionsKey || "recordsByRegion"]?.[region];
    return Array.isArray(list) ? list : [];
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

  function renderOrdinaryField(field) {
    const cls = colClass(field.layout?.colSpan);
    const disabled = Boolean(field.disabled);
    const path = field.path;
    const control = field.control || "text";

    if (control === "coded-select") {
      const dict = optionsAsCodedDict(field.optionsRef);
      return helpers.selectHTML(path, field.label, dict || {}, cls, true, disabled);
    }
    if (control === "checkbox") {
      return helpers.fieldHTML(path, field.label, "checkbox", cls, "", 0, null, disabled);
    }
    return helpers.fieldHTML(
      path,
      field.label,
      control === "number" ? "number" : "text",
      cls,
      field.measure || "",
      field.maxLength || 0,
      field.decimals ?? null,
      disabled,
    );
  }

  function renderField(field) {
    if (field.control === "custom") {
      const fn = customRenderers.get(field.renderer);
      if (!fn) {
        return `<p class="catalog-error">Missing custom renderer: ${helpers.esc(field.renderer)}</p>`;
      }
      const cls = colClass(field.layout?.colSpan);
      const inner = fn(field, { options, helpers, getDependentLocationRecords });
      return `<div class="catalog-field ${cls}">${inner}</div>`;
    }
    return renderOrdinaryField(field);
  }

  function renderGroup(group) {
    const help = group.help
      ? `<p class="tab-help">${group.help}</p>`
      : "";
    const fields = (group.fields || [])
      .map((field) => renderField(field))
      .join("");
    const groupClass = group.class ? ` ${group.class}` : "";
    return `<section class="spec-group${groupClass}">
      <h4>${helpers.esc(group.title || "")}</h4>
      ${help}
      <div class="h2k-row">${fields}</div>
    </section>`;
  }

  function renderSection(sectionId, container) {
    if (!helpers) throw new Error("H2kCatalog.init() must run before rendering.");
    const section = sections.get(sectionId);
    if (!section) throw new Error(`Unknown catalog section: ${sectionId}`);
    if (!container) throw new Error(`Missing container for section ${sectionId}`);

    runBeforeRender(section);
    const sectionClass = section.class ? ` ${section.class}` : "";
    container.innerHTML = `<article class="section-card${sectionClass}"><h3>${helpers.esc(section.title)}</h3>
      <div class="${section.layout || "form-grid"}">
        ${(section.groups || []).map(renderGroup).join("")}
      </div>
    </article>`;

    bindSection(section, container);
    return container;
  }

  function dictForField(field, el, path) {
    if (field.bind?.dictFor) {
      return optionsAsCodedDict(field.bind.dictFor);
    }
    if (path.endsWith("/Region")) {
      return optionsAsCodedDict("weather-regions");
    }
    return null;
  }

  function bindSection(section, root) {
    const flatFields = (section.groups || []).flatMap((g) => g.fields || []);
    helpers.bindXml(root, (el, path) => {
      const field = flatFields.find((f) => f.path && (path === f.path || path.startsWith(`${f.path}/`)));
      if (field) return dictForField(field, el, path);
      if (path.endsWith("/Region")) return optionsAsCodedDict("weather-regions");
      return null;
    });

    for (const field of flatFields) {
      if (field.control === "custom" && field.renderer) {
        customRenderers.get(`${field.renderer}:bind`)?.(root, field, { options, helpers });
      }
    }
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
      originalSaveSession?.();
      if (helpers?.getPath && changedPathTracker) {
        for (const path of changedPathTracker) applyBehaviorTriggers(path);
        changedPathTracker.clear();
      }
    };
  }

  let changedPathTracker = null;
  function trackPathChange(path) {
    if (changedPathTracker) changedPathTracker.add(path);
  }

  async function loadCatalog() {
    manifest = await fetchJson(`${CATALOG_BASE}manifest.json`);
    sectionsIndex = await fetchJson(`${CATALOG_BASE}${manifest.sectionsIndex}`);
    for (const entry of sectionsIndex.entries) {
      sections.set(entry.id, await fetchJson(`${CATALOG_BASE}${entry.file}`));
    }
    const optionFiles = [
      "weather-regions",
      "weather-locations",
      "ownership",
      "owner-occupied",
      "house-types",
      "plan-shapes",
      "storeys",
      "dirs",
      "window-tightness",
      "fuels",
      "thermal-mass",
      "soil",
      "water-level",
      "colours",
    ];
    for (const id of optionFiles) {
      try {
        options.set(id, await fetchJson(`${CATALOG_BASE}options/${id}.json`));
      } catch (_err) {
        /* optional option packs */
      }
    }
    return { manifest, sectionsIndex, sections, options };
  }

  function init(h) {
    helpers = h;
    changedPathTracker = new Set();
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
  };
})(typeof window !== "undefined" ? window : globalThis);
