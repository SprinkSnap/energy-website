/**
 * Generic HOT2000 catalog schema renderer.
 * Renders section definitions from catalog/sections/*.json without hard-coded field values.
 */
(function initH2kSchemaRenderer(global) {
  const CONTROL_TYPES = new Set([
    "text",
    "number",
    "date",
    "checkbox",
    "radio",
    "coded-select",
    "searchable-select",
    "readonly",
    "repeater",
    "dialog",
    "custom",
  ]);

  function colClass(span) {
    const n = Number(span) || 12;
    if (n >= 12) return "span-12";
    if (n >= 6) return "span-6";
    if (n >= 4) return "span-4";
    if (n >= 3) return "span-3";
    if (n >= 2) return "span-2";
    return "span-1";
  }

  function sortByOrder(items) {
    return [...items].sort((a, b) => (a.order ?? a.layout?.order ?? 0) - (b.order ?? b.layout?.order ?? 0));
  }

  function createRenderer(deps) {
    const {
      helpers,
      options,
      customRenderers,
      getProgramMode,
      evaluateCondition: customEvaluateCondition,
    } = deps;

    function getPath(path) {
      return helpers.getPath?.(path);
    }

    function setPath(path, value) {
      helpers.setPath?.(path, value);
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

    function optionsAsPlainList(refId) {
      const entry = options.get(refId);
      if (!entry?.options) return [];
      return Object.entries(entry.options).map(([code, labels]) => ({
        code,
        label: labels.en ?? labels,
      }));
    }

    function getOptionEntry(refId, code) {
      return options.get(refId)?.options?.[String(code)] ?? null;
    }

    function evaluateCondition(cond, ctx = {}) {
      if (!cond) return true;
      if (customEvaluateCondition) {
        const custom = customEvaluateCondition(cond, ctx);
        if (custom !== undefined) return custom;
      }
      if (cond.all) return cond.all.every((c) => evaluateCondition(c, ctx));
      if (cond.any) return cond.any.some((c) => evaluateCondition(c, ctx));
      if (!cond.path) return true;
      const raw = getPath(cond.path);
      const val = raw == null ? "" : String(raw);
      if (cond.equals !== undefined) return val === String(cond.equals);
      if (cond.notEquals !== undefined) return val !== String(cond.notEquals);
      if (cond.in) return cond.in.map(String).includes(val);
      if (cond.notIn) return !cond.notIn.map(String).includes(val);
      if (cond.truthy !== undefined) {
        const truthy = val === "true" || val === "1" || Boolean(raw);
        return cond.truthy ? truthy : !truthy;
      }
      return true;
    }

    function matchesProgramMode(fieldOrGroup) {
      const modes = fieldOrGroup.programModeWhen;
      if (!modes?.length) return true;
      const current = getProgramMode?.() || "general";
      return modes.includes(current);
    }

    function isVisible(fieldOrGroup) {
      return matchesProgramMode(fieldOrGroup) && evaluateCondition(fieldOrGroup.visibleWhen);
    }

    function isEnabled(field) {
      if (field.disabled || field.readOnly) return false;
      if (!evaluateCondition(field.enabledWhen)) return false;
      return true;
    }

    function getDependentRecords(field) {
      const dep = field.dependsOn?.[0];
      if (!dep) return [];
      const key = getPath(dep.path);
      const entry = options.get(dep.optionsRef);
      const list = entry?.[dep.optionsKey || "recordsByRegion"]?.[key];
      return Array.isArray(list) ? list : [];
    }

    function renderReadonly(field) {
      const cls = colClass(field.layout?.colSpan);
      const path = field.path;
      const raw = getPath(path);
      const measure = field.units || field.measure || "";
      const val = measure ? helpers.fromSI?.(raw, measure) ?? raw : raw;
      return `<div class="field field-readonly ${cls}" data-field-id="${helpers.esc(field.id)}">
        <span>${helpers.esc(field.label || "")}</span>
        <output data-xml-path="${helpers.esc(path)}" class="readonly-value">${helpers.esc(val ?? "")}</output>
      </div>`;
    }

    function renderRadio(field) {
      const cls = colClass(field.layout?.colSpan);
      const dict = optionsAsCodedDict(field.optionsRef) || {};
      const cur = field.path?.includes("/@")
        ? getPath(field.path)
        : getPath(`${field.path}/@code`);
      const disabled = !isEnabled(field);
      const opts = Object.entries(dict)
        .map(([code, labels]) => {
          const text = Array.isArray(labels) ? labels[0] : labels;
          const checked = String(code) === String(cur) ? " checked" : "";
          return `<label class="radio-option"><input type="radio" name="${helpers.esc(field.id)}" data-xml-path="${helpers.esc(field.path)}" data-xml-type="coded" value="${helpers.esc(code)}"${checked}${disabled ? " disabled" : ""}> ${helpers.esc(text)}</label>`;
        })
        .join("");
      return `<fieldset class="field field-radio ${cls}" data-field-id="${helpers.esc(field.id)}">
        <legend>${helpers.esc(field.label || "")}</legend>
        <div class="radio-group">${opts}</div>
      </fieldset>`;
    }

    function renderSearchableSelect(field) {
      const cls = colClass(field.layout?.colSpan);
      const records = getDependentRecords(field);
      const path = field.path;
      const curCode = getPath(`${path}/@code`) ?? getPath(path);
      const curLabel = getPath(`${path}/English`) || records.find((r) => String(r.code) === String(curCode))?.name || "";
      const listId = `catalog-search-${field.id}`;
      return `<label class="field catalog-searchable-select ${cls}" data-field-id="${helpers.esc(field.id)}">
        <span>${helpers.esc(field.label || "")}</span>
        <div class="catalog-search-control">
          <input type="text" class="catalog-search-input" data-xml-path="${helpers.esc(path)}" data-xml-type="searchable-coded" value="${helpers.esc(curLabel)}" autocomplete="off" aria-expanded="false" aria-controls="${listId}"${!isEnabled(field) ? " disabled" : ""}>
          <button type="button" class="catalog-search-toggle" aria-label="Open list" tabindex="-1"${!isEnabled(field) ? " disabled" : ""}>▾</button>
          <ul id="${listId}" class="catalog-search-list" role="listbox" hidden></ul>
        </div>
        <input type="hidden" data-xml-path="${helpers.esc(path)}/@code" data-xml-type="text" value="${helpers.esc(curCode ?? "")}">
      </label>`;
    }

    function renderRepeater(field) {
      const cls = colClass(field.layout?.colSpan);
      const rep = field.repeater || {};
      const itemPath = rep.itemPath || field.path;
      const items = helpers.listRepeaterItems?.(itemPath, rep.itemTag) || [];
      const cards = items
        .map((item, index) => {
          const itemFields = sortByOrder(rep.fields || [])
            .filter(isVisible)
            .map((f) => renderField({ ...f, path: f.path?.replace(/\{index\}/g, String(index)) || f.path }, { index }))
            .join("");
          return `<article class="catalog-repeater-card" data-repeater-index="${index}">
            <header class="catalog-repeater-card-head"><strong>Item ${index + 1}</strong></header>
            <div class="h2k-row">${itemFields}</div>
          </article>`;
        })
        .join("");
      const addBtn = rep.allowAdd
        ? `<button type="button" class="button secondary catalog-repeater-add" data-repeater-path="${helpers.esc(itemPath)}">Add</button>`
        : "";
      return `<section class="catalog-repeater ${cls}" data-field-id="${helpers.esc(field.id)}">
        <h5 class="catalog-repeater-title">${helpers.esc(field.label || "")}</h5>
        <div class="catalog-repeater-items">${cards || `<p class="tab-help">No items.</p>`}</div>
        ${addBtn}
      </section>`;
    }

    function renderDialogTrigger(field) {
      const cls = colClass(field.layout?.colSpan);
      const dlg = field.dialog || {};
      return `<div class="field catalog-dialog-trigger ${cls}" data-field-id="${helpers.esc(field.id)}">
        <button type="button" class="button secondary" data-dialog-id="${helpers.esc(dlg.dialogId || "")}">${helpers.esc(dlg.triggerLabel || field.label || "Open")}</button>
      </div>`;
    }

    function renderOrdinaryField(field) {
      const cls = colClass(field.layout?.colSpan);
      const path = field.path;
      const control = field.control || "text";
      const disabled = !isEnabled(field);
      const measure = field.units || field.measure || "";
      const maxLength = field.maxLength || 0;
      const decimals = field.decimals ?? null;

      if (control === "coded-select") {
        const dict = optionsAsCodedDict(field.optionsRef);
        return helpers.selectHTML(path, field.label, dict || {}, cls, true, disabled);
      }
      if (control === "checkbox") {
        return helpers.fieldHTML(path, field.label, "checkbox", cls, "", 0, null, disabled);
      }
      if (control === "date") {
        return helpers.fieldHTML(path, field.label, "date", cls, "", 0, null, disabled);
      }
      if (control === "number") {
        return helpers.fieldHTML(path, field.label, "number", cls, measure, maxLength, decimals, disabled);
      }
      if (field.datatype === "postal-ontario" && helpers.postalFieldHTML) {
        return helpers.postalFieldHTML(path, field.label, cls);
      }
      if (control === "text" && field.optionsRef && !field.dependsOn?.length) {
        const list = optionsAsPlainList(field.optionsRef);
        if (list.length) {
          const cur = getPath(path);
          const opts = list
            .map((o) => `<option value="${helpers.esc(o.code)}" ${String(o.code) === String(cur) ? "selected" : ""}>${helpers.esc(o.label)}</option>`)
            .join("");
          return `<label class="field ${cls}"><span>${helpers.esc(field.label || "")}</span><select data-xml-path="${helpers.esc(path)}" data-xml-type="text"${disabled ? " disabled" : ""}>${opts}</select></label>`;
        }
      }
      return helpers.fieldHTML(path, field.label, "text", cls, measure, maxLength, decimals, disabled);
    }

    function renderField(field, ctx = {}) {
      if (!isVisible(field)) return "";
      if (field.control === "custom") {
        const fn = customRenderers.get(field.renderer);
        if (!fn) {
          return `<p class="catalog-error">Missing custom renderer: ${helpers.esc(field.renderer)}</p>`;
        }
        return fn(field, { options, helpers, getDependentRecords, ctx });
      }
      if (field.control === "readonly") return renderReadonly(field);
      if (field.control === "radio") return renderRadio(field);
      if (field.control === "searchable-select") return renderSearchableSelect(field);
      if (field.control === "repeater") return renderRepeater(field);
      if (field.control === "dialog") return renderDialogTrigger(field);
      return renderOrdinaryField(field);
    }

    function renderGroupRows(fields) {
      const visible = sortByOrder(fields).filter(isVisible);
      const rows = [];
      let current = { rowClass: "", fields: [] };

      for (const field of visible) {
        const nextRowClass = field.layout?.rowClass || "";
        if (field.layout?.newRow && current.fields.length) {
          rows.push(current);
          current = { rowClass: nextRowClass, fields: [] };
        } else if (current.fields.length && nextRowClass && current.rowClass !== nextRowClass) {
          rows.push(current);
          current = { rowClass: nextRowClass, fields: [] };
        } else if (!current.rowClass && nextRowClass) {
          current.rowClass = nextRowClass;
        }
        current.fields.push(field);
      }
      if (current.fields.length) rows.push(current);

      return rows
        .map((row) => {
          const rowCls = row.rowClass ? ` ${row.rowClass}` : "";
          const cells = row.fields.map((field) => renderField(field)).join("");
          return `<div class="h2k-row${rowCls}">${cells}</div>`;
        })
        .join("");
    }

    function renderGroup(group) {
      if (!isVisible(group)) return "";
      const help = group.help ? `<p class="tab-help">${group.help}</p>` : "";
      const groupClass = group.class ? ` ${group.class}` : "";
      const rows = renderGroupRows(group.fields || []);
      return `<section class="spec-group${groupClass}" data-group-id="${helpers.esc(group.id || "")}">
        ${group.title ? `<h4>${helpers.esc(group.title)}</h4>` : ""}
        ${help}
        ${rows}
      </section>`;
    }

    function renderSection(section, container) {
      if (!container) throw new Error(`Missing container for section ${section.id}`);
      const groups = sortByOrder(section.groups || [])
        .map(renderGroup)
        .join("");
      const sectionClass = section.class ? ` ${section.class}` : "";
      container.innerHTML = `<article class="section-card catalog-section${sectionClass}" data-section-id="${helpers.esc(section.id)}">
        <h3>${helpers.esc(section.title)}</h3>
        ${section.lead ? `<p class="tab-help">${section.lead}</p>` : ""}
        <div class="${section.layout || "form-grid"}">${groups}</div>
      </article>`;
      bindSection(section, container);
      return container;
    }

    function dictForField(field, path) {
      if (field.fuelTag && path.endsWith("/Units")) {
        return deps.helpers.fuelUnitsDict?.(field.fuelTag) ?? null;
      }
      if (field.bind?.dictFor) return optionsAsCodedDict(field.bind.dictFor);
      if (field.optionsRef) return optionsAsCodedDict(field.optionsRef);
      if (path.endsWith("/Region")) return optionsAsCodedDict("weather-regions");
      if (path.endsWith("/Ownership")) return optionsAsCodedDict("ownership");
      if (path.endsWith("/OwnerOccupied")) return optionsAsCodedDict("owner-occupied");
      if (path.endsWith("/WindowTightness")) return optionsAsCodedDict("window-tightness");
      return null;
    }

    function applyFieldSideEffects(field, root) {
      for (const effect of field.sideEffects || []) {
        if (effect.trigger && effect.trigger !== "change") continue;
        if (!evaluateCondition(effect.when)) continue;
        if (effect.action) {
          deps.behaviorActions?.get(effect.action)?.(field, root);
          continue;
        }
        if (effect.set?.path) {
          let value = effect.set.value;
          if (effect.set.fromOption && field.optionsRef) {
            const code = getPath(`${field.path}/@code`) ?? getPath(field.path);
            const opt = getOptionEntry(field.optionsRef, code);
            value = opt?.sideEffect?.[effect.set.fromOption] ?? opt?.sideEffect?.value ?? value;
          }
          if (value !== undefined) setPath(effect.set.path, value);
        }
      }
    }

    function bindSearchableSelect(root, field) {
      const wrap = root.querySelector(`[data-field-id="${field.id}"]`);
      if (!wrap) return;
      const input = wrap.querySelector(".catalog-search-input");
      const list = wrap.querySelector(".catalog-search-list");
      const codeInput = wrap.querySelector('[data-xml-path$="/@code"]');
      if (!input || !list) return;

      const records = getDependentRecords(field);
      const renderList = (filter = "") => {
        const q = filter.trim().toLowerCase();
        const matches = records.filter((r) => !q || String(r.name).toLowerCase().includes(q)).slice(0, 200);
        list.innerHTML = matches.length
          ? matches
              .map(
                (r) =>
                  `<li role="option" data-code="${helpers.esc(r.code)}" data-label="${helpers.esc(r.name)}">${helpers.esc(r.name)}</li>`,
              )
              .join("")
          : `<li class="catalog-search-empty">No matches</li>`;
      };

      const openList = () => {
        renderList(input.value);
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
      };
      const closeList = () => {
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
      };

      input.addEventListener("focus", openList);
      input.addEventListener("input", () => {
        openList();
        helpers.trackPathChange?.(field.path);
      });
      wrap.querySelector(".catalog-search-toggle")?.addEventListener("click", () => {
        if (list.hidden) openList();
        else closeList();
      });
      list.addEventListener("click", (e) => {
        const li = e.target.closest("li[data-code]");
        if (!li) return;
        input.value = li.dataset.label || "";
        if (codeInput) codeInput.value = li.dataset.code || "";
        setPath(`${field.path}/@code`, li.dataset.code || "");
        setPath(`${field.path}/English`, li.dataset.label || "");
        helpers.saveSession?.();
        closeList();
        applyFieldSideEffects(field, root);
        helpers.trackPathChange?.(`${field.path}/@code`);
      });
      document.addEventListener(
        "click",
        (e) => {
          if (!wrap.contains(e.target)) closeList();
        },
        true,
      );
    }

    function bindSection(section, root) {
      const flatFields = (section.groups || []).flatMap((g) => g.fields || []);
      helpers.bindXml(root, (el, path) => {
        const field = flatFields.find((f) => f.path && (path === f.path || path.startsWith(`${f.path}/`)));
        if (field) return dictForField(field, path);
        return dictForField({ optionsRef: null }, path);
      });

      for (const field of flatFields) {
        if (field.control === "custom" && field.renderer) {
          customRenderers.get(`${field.renderer}:bind`)?.(root, field, { options, helpers });
        }
        if (field.control === "searchable-select") bindSearchableSelect(root, field);
        if (field.control === "coded-select" || field.control === "radio") {
          const sel = root.querySelector(`[data-xml-path="${field.path}"]`);
          sel?.addEventListener("change", () => {
            applyFieldSideEffects(field, root);
            helpers.trackPathChange?.(field.path);
            if (field.rerenderOnChange) deps.rerenderSection?.(section.id);
          });
        }
      }

      root.querySelectorAll(".catalog-dialog-trigger button[data-dialog-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.dialogId;
          const dlg = id ? document.getElementById(id) : null;
          if (dlg?.showModal) dlg.showModal();
        });
      });
    }

    return {
      renderField,
      renderGroup,
      renderSection,
      bindSection,
      evaluateCondition,
      isVisible,
      isEnabled,
      optionsAsCodedDict,
      getDependentRecords,
      applyFieldSideEffects,
      CONTROL_TYPES,
    };
  }

  global.H2kSchemaRenderer = { createRenderer, colClass, sortByOrder, CONTROL_TYPES };
})(typeof window !== "undefined" ? window : globalThis);
