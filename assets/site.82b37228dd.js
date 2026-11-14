
(() => {
  "use strict";

  const SITE = window.SITE;
  const CFG = SITE.config;
  const ROOT = window.SITE_ROOT || "./";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids) if (kid != null) n.append(kid);
    return n;
  };
  const fmt = (v) => (v === 0 ? "0.00" : (v > 0 ? "+" : "−") + Math.abs(v).toFixed(2));
  const spoken = (v) => (v === 0 ? "zero" : (v > 0 ? "plus " : "minus ") + Math.abs(v).toFixed(2));
  const img = (rel) => ROOT + rel;
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const paintVal = (node, v, text = fmt(v)) => {
    node.textContent = text;
    node.classList.toggle("is-pos", v > 0);
    node.classList.toggle("is-neg", v < 0);
  };
  const isLocal = !location.href.startsWith(CFG.base_url);
  const siteBase = isLocal ? new URL(ROOT, location.href).href : CFG.base_url;

  
  let toastTimer;
  function toast(msg) {
    const t = $("[data-toast]");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  async function copyText(text, okMsg = "Copied") {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg);
    } catch {
      const ta = el("textarea", { class: "sr-only" });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      toast(ok ? okMsg : "Copy failed. Select the text by hand.");
    }
  }

  
  function paintSigned(input) {
    const min = +input.min, max = +input.max, v = +input.value;
    const zeroAt = +(input.dataset.zero ?? 0);
    const pct = (x) => ((x - min) / (max - min)) * 100;
    const z = pct(zeroAt), p = pct(v);
    input.style.setProperty("--zero", z + "%");
    input.style.setProperty("--lo", Math.min(z, p) + "%");
    input.style.setProperty("--hi", Math.max(z, p) + "%");
    input.style.setProperty("--fill", v < zeroAt ? "var(--minus)" : "var(--plus)");
  }

  function signedSlider({ id, label, values, value, zero = 0, valueText, onInput }) {
    const input = el("input", {
      type: "range", class: "signed", id,
      min: values[0], max: values[values.length - 1],
      step: values[1] - values[0], value,
      "data-zero": zero, "aria-label": label,
    });
    const update = () => {
      paintSigned(input);
      input.setAttribute("aria-valuetext", valueText(+input.value));
    };
    input.addEventListener("input", () => { update(); onInput(+input.value); });
    update();
    return input;
  }

  
  function makeViewer(fig) {
    fig.replaceChildren();
    const before = el("img", { class: "before", width: 640, height: 640, alt: "", decoding: "async" });
    const after = el("img", { class: "after", width: 640, height: 640, alt: "", decoding: "async" });
    const tagL = el("span", { class: "tag l" });
    const tagR = el("span", { class: "tag r" });
    const split = el("input", {
      type: "range", class: "split-input", min: 0, max: 100, step: 1, value: 50,
      "aria-label": "Compare: move the divider between before and after",
    });
    const knob = el("span", { class: "knob" });
    knob.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6-6 6 6 6"/><path d="m15 6 6 6-6 6"/></svg>';
    const divider = el("span", { class: "divider", "aria-hidden": "true" }, knob);
    let shown = 50;
    const paint = (x) => { shown = x; fig.style.setProperty("--split", x + "%"); };
    const setSplit = (x) => {
      paint(x);
      split.setAttribute("aria-valuetext", `${Math.round(x)} percent before, ${Math.round(100 - x)} percent after`);
    };
    split.addEventListener("input", () => { cancelAnimationFrame(raf); setSplit(+split.value); });
    setSplit(50);
    let raf = 0, target = 50;
    const step = () => {
      const next = shown + (target - shown) * 0.22;
      if (Math.abs(target - next) < 0.15) { setSplit(target); split.value = Math.round(target); return; }
      paint(next);
      raf = requestAnimationFrame(step);
    };
    fig.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || e.buttons) return;
      const r = fig.getBoundingClientRect();
      target = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
      if (reducedMotion()) { setSplit(target); split.value = Math.round(target); return; }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(step);
    });

    fig.append(before, after, split, divider, tagL, tagR);
    return {
      split,
      sweep(from = 88, to = 50, ms = 1100) {
        if (reducedMotion()) return;
        const t0 = performance.now();
        const ease = (t) => 1 - Math.pow(2, -10 * t);
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / ms);
          if (t < 1) { setSplit(from + (to - from) * ease(t)); raf = requestAnimationFrame(tick); }
          else { setSplit(to); split.value = to; }
        };
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
      },
      set({ beforeSrc, afterSrc, beforeTag, afterTag, beforeAlt, afterAlt }) {
        if (before.getAttribute("src") !== beforeSrc) before.src = beforeSrc;
        if (after.getAttribute("src") !== afterSrc) after.src = afterSrc;
        before.alt = beforeAlt; after.alt = afterAlt;
        tagL.textContent = beforeTag; tagR.textContent = afterTag;
      },
      images: () => [before, after],
    };
  }

  const preloaded = new Set();
  function preload(srcs) {
    for (const s of srcs) {
      if (preloaded.has(s)) continue;
      preloaded.add(s);
      const i = new Image();
      i.decoding = "async";
      i.src = s;
    }
  }

  
  const KINDS = {
    strength: {
      init: (d, q) => ({ v: snap(d.values, q.has("s") ? +q.get("s") : d.default) }),
      frames(d, s) {
        const z = d.values.indexOf(0), i = d.values.indexOf(s.v);
        return {
          beforeSrc: img(`img/${d.id}/${z}.webp`), afterSrc: img(`img/${d.id}/${i}.webp`),
          beforeTag: "base", afterTag: `strength ${fmt(s.v)}`,
          beforeAlt: `Frame: base model without ${d.mod}`,
          afterAlt: `Frame: ${d.mod} at strength ${fmt(s.v)}`,
        };
      },
      caption: (d, s) => `${d.mod}, strength ${fmt(s.v)}`,
      params: (s) => ({ s: s.v }),
      all: (d) => d.values.map((_, i) => img(`img/${d.id}/${i}.webp`)),
      controls(d, s, rerender, uid) {
        const val = el("span", { class: "val" });
        paintVal(val, s.v);
        const row = el("div", { class: "mod-row" },
          el("span", { class: "order", text: "01" }),
          el("label", { for: `${uid}-s`, text: d.mod }), val,
          signedSlider({
            id: `${uid}-s`, label: `${d.mod} strength`, values: d.values, value: s.v,
            valueText: spoken, onInput: (v) => { s.v = v; paintVal(val, v); rerender(); },
          }));
        return [row, ticks(d.values.map(fmt))];
      },
    },

    depth: {
      init: (d, q) => ({ v: snap(d.values, q.has("d") ? +q.get("d") : d.default) }),
      frames(d, s) {
        const i = d.values.indexOf(s.v);
        return {
          beforeSrc: img(`img/${d.id}/0.webp`), afterSrc: img(`img/${d.id}/${i}.webp`),
          beforeTag: "0 passes", afterTag: `${s.v} pass${s.v === 1 ? "" : "es"}${s.v > d.trained[1] ? " · above trained" : ""}`,
          beforeAlt: "Frame: base model, 0 passes",
          afterAlt: `Frame: ${d.mod} with ${s.v} passes`,
        };
      },
      caption: (d, s) => `${d.mod}, ${s.v} passes`,
      params: (s) => ({ d: s.v }),
      all: (d) => d.values.map((_, i) => img(`img/${d.id}/${i}.webp`)),
      controls(d, s, rerender, uid) {
        const [lo, hi] = d.trained;
        const note = () => (s.v > hi ? " (above trained range)" : "");
        const val = el("span", { class: "val" });
        paintVal(val, s.v > hi ? 1 : 0, `${s.v}${note()}`);
        const row = el("div", { class: "mod-row" },
          el("span", { class: "order", text: "01" }),
          el("label", { for: `${uid}-d`, text: `${d.mod} · passes` }), val,
          signedSlider({
            id: `${uid}-d`, label: "Passes", values: d.values, value: s.v, zero: 0,
            valueText: (v) => `${v} passes${v > hi ? ", above trained range" : ""}`,
            onInput: (v) => { s.v = v; paintVal(val, v > hi ? 1 : 0, `${v}${note()}`); rerender(); },
          }));
        const t = ticks(d.values.map(String));
        Array.from(t.children).forEach((c, i) => { if (d.values[i] > hi) c.classList.add("beyond"); });
        t.setAttribute("aria-label", `Trained range ${lo} to ${hi}`);
        return [row, t];
      },
    },

    stack: {
      init(d, q) {
        const [a, b] = d.default;
        return {
          a: snap(d.values, q.has("a") ? +q.get("a") : a), b: snap(d.values, q.has("b") ? +q.get("b") : b),
          onA: q.get("ao") !== "0", onB: q.get("bo") !== "0",
        };
      },
      frames(d, s) {
        const z = d.values.indexOf(0);
        const a = s.onA ? s.a : 0, b = s.onB ? s.b : 0;
        const i = d.values.indexOf(a), j = d.values.indexOf(b);
        return {
          beforeSrc: img(`img/${d.id}/${z}-${z}.webp`), afterSrc: img(`img/${d.id}/${i}-${j}.webp`),
          beforeTag: "base", afterTag: `${fmt(a)} / ${fmt(b)}`,
          beforeAlt: "Frame: base model, no mods",
          afterAlt: `Frame: ${d.mods[0]} at ${fmt(a)} and ${d.mods[1]} at ${fmt(b)}`,
        };
      },
      caption: (d, s) => `${d.mods[0]} ${fmt(s.onA ? s.a : 0)}, ${d.mods[1]} ${fmt(s.onB ? s.b : 0)}`,
      params: (s) => ({ a: s.a, b: s.b, ...(s.onA ? {} : { ao: 0 }), ...(s.onB ? {} : { bo: 0 }) }),
      all: (d) => d.values.flatMap((_, i) => d.values.map((_, j) => img(`img/${d.id}/${i}-${j}.webp`))),
      controls(d, s, rerender, uid) {
        return ["a", "b"].map((k, n) => {
          const on = n === 0 ? "onA" : "onB";
          const val = el("span", { class: "val" });
          paintVal(val, s[k]);
          const box = el("input", { type: "checkbox", checked: s[on], "aria-label": `Enable ${d.mods[n]}` });
          const row = el("div", { class: "mod-row" + (s[on] ? "" : " off") },
            el("span", { class: "order", text: `0${n + 1}` }),
            el("label", { for: `${uid}-${k}` }, box, d.mods[n]), val,
            signedSlider({
              id: `${uid}-${k}`, label: `${d.mods[n]} strength`, values: d.values, value: s[k],
              valueText: spoken, onInput: (v) => { s[k] = v; paintVal(val, v); rerender(); },
            }));
          box.addEventListener("change", () => { s[on] = box.checked; row.classList.toggle("off", !box.checked); rerender(); });
          box.addEventListener("click", (e) => e.stopPropagation());
          return row;
        });
      },
    },

    grid: {
      init: (d, q) => ({ c: Math.min(d.cols - 1, Math.max(0, (+q.get("seed") || 1) - 1)) }),
      frames(d, s) {
        return {
          beforeSrc: img(`img/${d.id}/r1c${s.c}.webp`), afterSrc: img(`img/${d.id}/r2c${s.c}.webp`),
          beforeTag: d.rows[1], afterTag: d.rows[2],
          beforeAlt: `Frame: ${d.rows[1]}, seed ${s.c + 1}`,
          afterAlt: `Frame: ${d.rows[2]}, seed ${s.c + 1}`,
        };
      },
      caption: (d, s) => `${d.rows[1]} and ${d.rows[2]}, same seed`,
      params: (s) => ({ seed: s.c + 1 }),
      all: (d) => d.rows.flatMap((_, r) => Array.from({ length: d.cols }, (_, c) => img(`img/${d.id}/r${r}c${c}.webp`))),
      controls(d, s, rerender) {
        const btns = Array.from({ length: d.cols }, (_, c) => el("button", {
          type: "button", "aria-pressed": String(c === s.c), text: `seed ${c + 1}`,
          onclick: () => { s.c = c; btns.forEach((b, i) => b.setAttribute("aria-pressed", String(i === c))); rerender(); },
        }));
        return [el("div", { class: "ctl-label" }, el("span", { text: "Compare at" })), el("div", { class: "seedpick", role: "group", "aria-label": "Seed" }, ...btns)];
      },
      extra(d) {
        const cells = el("div", { class: "cells", role: "group", "aria-label": "Comparison grid" });
        cells.append(el("span"));
        for (let c = 0; c < d.cols; c++) cells.append(el("span", { class: "rl", text: `seed ${c + 1}` }));
        d.rows.forEach((label, r) => {
          cells.append(el("span", { class: "rl", text: label }));
          for (let c = 0; c < d.cols; c++) {
            cells.append(el("img", { src: img(`img/${d.id}/r${r}c${c}.webp`), width: 640, height: 640, loading: "lazy", alt: `Frame: ${label}, seed ${c + 1}` }));
          }
        });
        return cells;
      },
    },
  };

  function snap(values, v) {
    return values.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), values[0]);
  }

  function ticks(labels) {
    return el("div", { class: "ticks", "aria-hidden": "true" }, ...labels.map((t) => el("span", { text: t })));
  }

  function demoUrl(d, s) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(KINDS[d.kind].params(s))) p.set(k, String(v));
    if (s.x != null && s.x !== 50) p.set("x", String(s.x));
    return `${siteBase}d/${d.id}/?${p}`;
  }

  
  async function drawShareCard(d, s, viewer) {
    const W = 1200, H = 630, S = 470;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const css = getComputedStyle(document.documentElement);
    const col = (n) => css.getPropertyValue(n).trim();
    g.fillStyle = col("--paper"); g.fillRect(0, 0, W, H);
    const x0 = (W - (2 * S + 20)) / 2;
    const f = KINDS[d.kind].frames(d, s);
    const imgs = viewer.images();
    await Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = i.onerror = r; }))));
    const sans = getComputedStyle(document.body).fontFamily;
    [[imgs[0], f.beforeTag, col("--minus-soft")], [imgs[1], f.afterTag, col("--plus")]].forEach(([im, tag, accent], n) => {
      const x = x0 + n * (S + 20);
      g.drawImage(im, x, 40, S, S);
      g.font = `650 20px ${sans}`;
      const tw = g.measureText(tag).width;
      g.fillStyle = col("--ink"); g.beginPath(); g.roundRect(x + 14, 54, tw + 46, 36, 18); g.fill();
      g.fillStyle = accent; g.beginPath(); g.arc(x + 34, 72, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; g.fillText(tag, x + 48, 79);
    });
    const y = 40 + S + 62;
    g.font = `700 26px ${sans}`; g.fillStyle = col("--ink");
    g.fillText(KINDS[d.kind].caption(d, s), x0, y);
    const brand = `${CFG.name}  ·  ${CFG.base_url.replace(/^https:\/\//, "").replace(/\/$/, "")}`;
    g.font = `700 26px ${sans}`; g.fillStyle = col("--muted");
    g.fillText(brand, W - x0 - g.measureText(brand).width, y);
    return new Promise((r) => c.toBlob(r, "image/png"));
  }

  function fileName(d, s) {
    const p = KINDS[d.kind].params(s);
    return `${CFG.package}-${d.id}-${Object.entries(p).map(([k, v]) => k + v).join("-")}.png`.replace(/[^a-z0-9.+-]/gi, "_");
  }

  function shareBar(host, d, s, viewer, showLink) {
    host.replaceChildren();
    const link = el("span", { class: "permalink" });
    const copyBtn = el("button", { class: "btn btn-small", type: "button", text: "Copy link",
      onclick: () => copyText(demoUrl(d, s), "Link copied") });
    const saveBtn = el("button", { class: "btn btn-small", type: "button", text: "Save card",
      onclick: async () => {
        const blob = await drawShareCard(d, s, viewer);
        const a = el("a", { href: URL.createObjectURL(blob), download: fileName(d, s) });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast("Share card saved");
      } });
    host.append(copyBtn, saveBtn);
    if (navigator.share) {
      host.append(el("button", { class: "btn btn-small", type: "button", text: "Share",
        onclick: async () => {
          const url = demoUrl(d, s), text = `${KINDS[d.kind].caption(d, s)} · ${CFG.name}`;
          try {
            const blob = await drawShareCard(d, s, viewer);
            const file = new File([blob], fileName(d, s), { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text, url });
            else await navigator.share({ text, url });
          } catch (e) { if (e.name !== "AbortError") toast("Share failed"); }
        } }));
    }
    if (showLink) host.append(link);
    return () => { link.textContent = demoUrl(d, s); };
  }

  
  let uidN = 0;
  function mountDemo(panel, d, q = new URLSearchParams(), { syncUrl = false, showLink = true } = {}) {
    const kind = KINDS[d.kind];
    const s = kind.init(d, q);
    const uid = `${d.id}-${++uidN}`;
    const viewer = makeViewer($("[data-viewer]", panel));
    let updateLink = () => {};
    const syncAddress = () => {
      updateLink();
      if (syncUrl) history.replaceState(null, "", "?" + new URL(demoUrl(d, s)).searchParams);
    };
    const rerender = () => { viewer.set(kind.frames(d, s)); syncAddress(); };
    viewer.split.addEventListener("change", () => { s.x = +viewer.split.value; syncAddress(); });
    if (q.has("x")) {
      s.x = Math.min(100, Math.max(0, Math.round(+q.get("x")) || 50));
      viewer.split.value = s.x;
      viewer.split.dispatchEvent(new Event("input"));
    }
    $("[data-controls]", panel).replaceChildren(...kind.controls(d, s, rerender, uid));
    updateLink = shareBar($("[data-share]", panel), d, s, viewer, showLink);
    rerender();
    const warm = () => preload(kind.all(d));
    panel.addEventListener("pointerenter", warm, { once: true });
    panel.addEventListener("focusin", warm, { once: true });
    panel.addEventListener("touchstart", warm, { once: true, passive: true });
    return { s, panel, viewer };
  }

  
  function mountTabs() {
    const tabs = $("[data-tabs]"), host = $("[data-tabpanels]");
    if (!tabs || !host) return;
    const labels = { strength: "Strength", depth: "Passes", stack: "Stacking", grid: "vs. LoRA" };
    const entries = SITE.demos.map((d, i) => {
      const tab = el("button", {
        type: "button", role: "tab", class: "tab", id: `tab-${d.id}`, "aria-controls": `demo-${d.id}`,
        "aria-selected": "false", tabindex: "-1", text: labels[d.kind] || d.title,
      });
      const panel = el("div", { class: "panel" },
        el("div", { "data-controls": "" }), el("figure", { class: "viewer", "data-viewer": "" }), el("div", { class: "panel-foot", "data-share": "" }));
      const info = el("div", { class: "demo-info" },
        el("h3", { text: d.title }), el("p", { text: d.blurb }),
        el("dl", {},
          el("dt", { text: "prompt" }), el("dd", {}, el("span", { class: "note", text: d.prompt })),
          el("dt", { text: "seed" }), el("dd", {}, el("span", { class: "note", text: d.seed })),
          el("dt", { text: "frames" }), el("dd", { text: "" })));
      if (KINDS[d.kind].extra) info.append(KINDS[d.kind].extra(d));
      const wrap = el("div", { class: "demo-grid", role: "tabpanel", id: `demo-${d.id}`, "aria-labelledby": `tab-${d.id}`, hidden: true }, panel, info);
      tabs.append(tab); host.append(wrap);
      let mounted = false;
      return { d, tab, wrap, mount() { if (!mounted) { mountDemo(panel, d, new URLSearchParams(), { showLink: false }); mounted = true; } } };
    });
    const select = (i, focus) => {
      entries.forEach((e, n) => {
        const on = n === i;
        e.tab.setAttribute("aria-selected", String(on));
        e.tab.tabIndex = on ? 0 : -1;
        e.wrap.hidden = !on;
        if (on) e.mount();
      });
      if (focus) entries[i].tab.focus();
    };
    entries.forEach((e, i) => {
      e.tab.addEventListener("click", () => { select(i); history.replaceState(null, "", "#demo-" + e.d.id); });
      e.tab.addEventListener("keydown", (ev) => {
        const k = { ArrowRight: 1, ArrowLeft: -1, Home: "home", End: "end" }[ev.key];
        if (k == null) return;
        ev.preventDefault();
        const n = k === "home" ? 0 : k === "end" ? entries.length - 1 : (i + k + entries.length) % entries.length;
        select(n, true);
      });
    });
    window.addEventListener("hashchange", () => {
      const n = entries.findIndex((e) => location.hash === "#demo-" + e.d.id);
      if (n >= 0) { select(n); document.getElementById("demos").scrollIntoView(); }
    });
    const fromHash = entries.findIndex((e) => location.hash === "#demo-" + e.d.id);
    select(Math.max(0, fromHash));
    if (fromHash >= 0) document.getElementById("demos").scrollIntoView();
  }

  
  
  function mountLearn() {
    $$("[data-learn]").forEach((fig) => {
      const levels = JSON.parse(fig.dataset.learn), n = levels.length;
      const frames = $$(".learn-frames li", fig), rows = $$(".keep-row[data-one] i", fig);
      const styleBar = $(".keep-style i", fig), texts = $$(".learn-steps li", fig).map((li) => li.textContent);
      const caption = el("p", { class: "learn-now", "aria-live": "polite" });
      const playBtn = el("button", { type: "button", class: "btn btn-small" });
      const prev = el("button", { type: "button", class: "btn btn-small", "aria-label": "Previous image" }, "←");
      const next = el("button", { type: "button", class: "btn btn-small", "aria-label": "Next image" }, "→");
      const count = el("span", { class: "learn-count" });
      $(".learn-steps", fig).hidden = true;
      fig.classList.add("is-live");
      fig.insertBefore(el("div", { class: "learn-ctl" }, playBtn, prev, next, count), $(".learn-steps", fig));
      fig.insertBefore(caption, $(".learn-steps", fig));
      let step = 0, timer = null;
      const show = (k) => {
        step = (k + n) % n;
        const [style, one] = levels[step];
        styleBar.style.setProperty("--v", style);
        rows.forEach((r, i) => r.style.setProperty("--v", one[i]));
        frames.forEach((f, i) => { f.classList.toggle("is-now", i === step); f.classList.toggle("is-later", i > step); });
        caption.textContent = texts[step];
        count.textContent = `${step + 1} of ${n}`;
      };
      const setPlaying = (on) => {
        clearInterval(timer); timer = on ? setInterval(() => show(step + 1), 2600) : null;
        playBtn.textContent = on ? "Pause" : "Play";
        caption.setAttribute("aria-live", on ? "off" : "polite");
      };
      playBtn.addEventListener("click", () => setPlaying(!timer));
      prev.addEventListener("click", () => { setPlaying(false); show(step - 1); });
      next.addEventListener("click", () => { setPlaying(false); show(step + 1); });
      show(0);
      setPlaying(false);
      if (!reducedMotion() && "IntersectionObserver" in window) {
        new IntersectionObserver(([e]) => { if (!e.isIntersecting && timer) setPlaying(false); else if (e.isIntersecting && !fig.dataset.started) { fig.dataset.started = "1"; setPlaying(true); } },
          { threshold: 0.4 }).observe(fig);
      }
    });
  }

  function mountLiveMock() {
    const root = $("[data-live-mock]");
    if (!root) return;
    const MAX = 7;
    const viewer = makeViewer($("[data-live-viewer]", root));
    const status = $("[data-live-status]", root);
    const gallery = $("[data-gallery]", root);
    const genBtn = $("[data-generate]", root);
    const strength = $("[data-strength]", root), strengthOut = $("[data-strength-out]", root);
    const timeline = $("[data-timeline]", root);
    const history = [];
    let saved = null;
    const stateSrc = (n) => img(`img/live/state${n}.webp`);
    const learned = () => Math.min(MAX, history.length);

    function sync() {
      genBtn.disabled = history.length >= MAX;
      const s = +strength.value, n = Math.round(learned() * s);
      strengthOut.textContent = s.toFixed(2);
      strength.setAttribute("aria-valuetext", s.toFixed(2));
      viewer.set({ beforeSrc: stateSrc(0), afterSrc: stateSrc(n), beforeTag: "shipped",
        afterTag: history.length ? `after ${history.length} · ${s.toFixed(2)}` : "now",
        beforeAlt: "Frame: the mod as shipped", afterAlt: `Frame: the mod after ${history.length} generations at strength ${s.toFixed(2)}` });
      gallery.replaceChildren(...history.map((g) => el("img", { src: img(`img/live/g${(g - 1) % 6}.webp`), width: 640, height: 640, alt: `Generation ${g}` })));
      timeline.replaceChildren(...(history.length ? history.map((g, i) => ({ g, i })).reverse().map(({ g, i }) =>
        el("li", { class: i === history.length - 1 ? "current" : "" },
          el("span", {}, `Generation ${g}`, el("br"), el("span", { class: "kind", text: "live part updated" })),
          i === history.length - 1 ? el("span", { class: "kind", text: "latest" }) : null))
        : [el("li", {}, el("span", { class: "kind", text: "No generations yet. The mod is as shipped." }))]));
    }

    let count = 0;
    genBtn.addEventListener("click", () => {
      count++; history.push(count);
      status.textContent = `Generation ${count} done. The editor updated the live part, and the next image builds on it.`;
      sync();
    });
    $("[data-undo]", root).addEventListener("click", () => {
      if (!history.length) return toast("Nothing to undo");
      const g = history.pop(); status.textContent = `Undone: the update from generation ${g}.`; sync();
    });
    $("[data-reset]", root).addEventListener("click", () => { history.length = 0; status.textContent = "Reset to the shipped mod."; sync(); });
    $("[data-save]", root).addEventListener("click", () => {
      saved = history.slice(); toast(`Saved the learned state (${saved.length} updates) as a save point. Mock only.`);
    });
    $("[data-reload]", root).addEventListener("click", () => {
      if (!saved) return toast("Nothing saved yet");
      history.length = 0; history.push(...saved);
      status.textContent = "Loaded the save point."; sync();
    });
    strength.addEventListener("input", sync);
    sync();
  }
  function mountInstallBlocks() {
    $$("[data-install]").forEach((root) => {
      const tabs = $$("[role=tab]", root), panels = $$("[role=tabpanel]", root);
      const list = $("[role=tablist]", root);
      if (!list) return;
      list.hidden = false;
      root.classList.add("is-tabbed");
      const select = (i, focus) => {
        tabs.forEach((t, n) => { t.setAttribute("aria-selected", String(n === i)); t.tabIndex = n === i ? 0 : -1; });
        panels.forEach((p, n) => { p.hidden = n !== i; });
        if (focus) tabs[i].focus();
      };
      tabs.forEach((t, i) => {
        t.addEventListener("click", () => select(i));
        t.addEventListener("keydown", (e) => {
          const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
          if (!k) return;
          e.preventDefault();
          select((i + k + tabs.length) % tabs.length, true);
        });
      });
      select(0);
    });
  }
  function mountGalleryFilters() {
    const box = $("[data-filters]");
    if (!box) return;
    box.hidden = false;
    const cards = $$("[data-mod-grid] .mod-card");
    const empty = $("[data-empty]"), count = $("[data-fcount]");
    const state = { kind: "all", family: "all" };
    const apply = () => {
      let n = 0;
      cards.forEach((c) => {
        const show = (state.kind === "all" || c.dataset.kind === state.kind) && (state.family === "all" || c.dataset.family === state.family);
        c.hidden = !show; if (show) n++;
      });
      $$(".fchip", box).forEach((b) => b.setAttribute("aria-pressed", String(state[b.dataset.f] === b.dataset.v)));
      count.textContent = `${n} of ${cards.length} mods`;
      empty.hidden = n > 0;
    };
    $$(".fchip", box).forEach((b) => b.addEventListener("click", () => { state[b.dataset.f] = b.dataset.v; apply(); }));
    $("[data-fclear]").addEventListener("click", () => { state.kind = "all"; state.family = "all"; apply(); });
    apply();
  }
  function mountScrubbers() {
    $$("[data-scrubber]").forEach((fig) => {
      const d = JSON.parse(fig.dataset.scrubber), root = fig.dataset.root;
      const im = $("[data-scrub-img]", fig), gIn = $("[data-scrub-gen]", fig), sIn = $("[data-scrub-str]", fig);
      const gOut = $("[data-scrub-g]", fig), sOut = $("[data-scrub-s]", fig);
      const show = () => {
        const g = d.g[+gIn.value], s = d.s[+sIn.value];
        gOut.textContent = g; sOut.textContent = s;
        gIn.setAttribute("aria-valuetext", `generation ${g}`);
        sIn.setAttribute("aria-valuetext", `strength ${s}`);
        im.src = `${root}img/live/scrub-g${g}-s${+sIn.value}.webp`;
        im.alt = `Frame: generation ${g}, strength ${s}`;
      };
      gIn.addEventListener("input", show); sIn.addEventListener("input", show);
      const warm = () => d.g.forEach((g) => d.s.forEach((_, si) => preload([`${root}img/live/scrub-g${g}-s${si}.webp`])));
      fig.addEventListener("pointerenter", warm, { once: true });
      fig.addEventListener("focusin", warm, { once: true });
      show();
    });
  }
  function mountThemeToggle() {
    const btn = $("[data-theme-toggle]");
    if (!btn) return;
    const root = document.documentElement;
    const sync = () => {
      const dark = root.dataset.theme === "dark";
      btn.setAttribute("aria-pressed", String(dark));
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    };
    btn.addEventListener("click", () => {
      root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem("kilora-theme", root.dataset.theme); } catch {}
      sync();
    });
    sync();
  }
  function mountComparePage() {
    const page = $("[data-compare-page]");
    if (!page) return;
    const pairs = SITE.pairs || [];
    const root = page.dataset.root;
    const viewer = makeViewer($("[data-compare-stage]", page));
    const title = $("[data-cmp-title]", page), note = $("[data-cmp-note]", page), list = $("[data-cmp-list]", page);
    let cur = 0;
    const btns = pairs.map((p, i) => el("button", { type: "button", class: "cmp-item", "aria-pressed": "false", text: p.title, onclick: () => show(i) }));
    list.replaceChildren(...btns.map((b) => el("li", {}, b)));
    function show(i) {
      cur = (i + pairs.length) % pairs.length;
      const p = pairs[cur];
      viewer.set({ beforeSrc: root + p.before, afterSrc: root + p.after, beforeTag: p.beforeTag, afterTag: p.afterTag,
        beforeAlt: `${p.real ? "Frame" : "Frame"}: ${p.title}, ${p.beforeTag}`,
        afterAlt: `${p.real ? "Frame" : "Frame"}: ${p.title}, ${p.afterTag}` });
      title.textContent = p.title; note.textContent = p.note;
      btns.forEach((b, n) => b.setAttribute("aria-pressed", String(n === cur)));
      history.replaceState(null, "", "#" + p.id);
    }
    $("[data-cmp-prev]", page).addEventListener("click", () => show(cur - 1));
    $("[data-cmp-next]", page).addEventListener("click", () => show(cur + 1));
    const start = pairs.findIndex((p) => "#" + p.id === location.hash);
    show(start >= 0 ? start : 0);
  }
  function mountDisclosures() {
    $$("details.lang-switch").forEach((d) => {
      d.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && d.open) { d.open = false; $("summary", d).focus(); }
      });
      document.addEventListener("click", (e) => { if (d.open && !d.contains(e.target)) d.open = false; });
    });
  }

  function mountCopyButtons() {
    $$("[data-copy]").forEach((b) => b.addEventListener("click", () => copyText($("pre", b.parentElement).innerText.trim())));
    $$("[data-unset-link]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); toast("This link is not set yet"); }));
  }

  function mountSiteShare() {
    const host = $("[data-sitewide-share]");
    if (!host) return;
    const url = siteBase, text = `${CFG.name}: ${CFG.tagline}`;
    const enc = encodeURIComponent;
    host.append(
      el("button", { class: "btn", type: "button", text: "Copy link", onclick: () => copyText(url, "Link copied") }),
      el("a", { class: "btn", href: `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`, rel: "noopener", target: "_blank", text: "Post on X" }),
      el("a", { class: "btn", href: `https://bsky.app/intent/compose?text=${enc(text + " " + url)}`, rel: "noopener", target: "_blank", text: "Bluesky" }),
      el("a", { class: "btn", href: `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(text)}`, rel: "noopener", target: "_blank", text: "Reddit" }),
      el("a", { class: "btn", href: img("og/home.png"), download: `${CFG.package}-card.png`, text: "Download share image" }),
    );
  }

  function init() {
    $$("[data-demo]").forEach((panel) => {
      const d = SITE.demos.find((x) => x.id === panel.dataset.demo);
      if (!d) return;
      const page = panel.dataset.variant === "page";
      const q = page ? new URLSearchParams(location.search) : new URLSearchParams();
      const { viewer } = mountDemo(panel, d, q, { syncUrl: page, showLink: page });
      if (!q.has("x")) {
        const [a, b] = viewer.images();
        Promise.all([a, b].map((i) => i.decode().catch(() => {}))).then(() => viewer.sweep());
      }
    });
    $$("[data-compare]").forEach((fig) => {
      const v = makeViewer(fig), d = fig.dataset;
      v.set({ beforeSrc: img(d.before), afterSrc: img(d.after), beforeTag: d.beforeTag, afterTag: d.afterTag,
        beforeAlt: d.beforeAlt, afterAlt: d.afterAlt });
    });
    mountTabs();
    mountLiveMock();
    mountLearn();
    mountInstallBlocks();
    mountGalleryFilters();
    mountScrubbers();
    mountThemeToggle();
    mountComparePage();
    mountDisclosures();
    mountCopyButtons();
    mountSiteShare();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
document.querySelectorAll("[data-slider]").forEach((fig) => {
  const range = fig.querySelector("[data-slider-range]");
  const set = () => { fig.style.setProperty("--cut", range.value + "%"); range.setAttribute("aria-valuetext", range.value + "% stacked"); };
  range.addEventListener("input", set);
  set();
});
