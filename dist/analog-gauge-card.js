const ANALOG_GAUGE_V4_VERSION = "4.1.2";
const ANALOG_GAUGE_V4_ASSET_BASE = new URL("./assets/", import.meta.url);

class AnalogGaugeCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._stateObj = null;
    this._value = null;
    this._rendered = false;
    this._lastGeometryWarning = "";
  }

  static getStubConfig() {
    return {
      type: "custom:analog-gauge-card",
      entity: "sensor.cpu_temperature",

      // ==================================================
      // 1) VALUE DOMAIN AND LABELLING
      // ==================================================
      min: 0,
      max: 100,
      unit: "°C",
      title: "CPU TEMPERATURE",
      subtitle: "CLASS 2.5",
      decimals: 0,

      // ==================================================
      // 2) SCALE DENSITY
      // ==================================================
      major_ticks: 6,
      minor_ticks: 4,

      // ==================================================
      // 3) NEEDLE PIVOT
      // ==================================================
      pivot_x: 512,
      pivot_y: 700,

      // ==================================================
      // 4) SCALE GEOMETRY
      // ==================================================
      scale_center_x: 512,
      scale_center_y: 500,
      scale_radius: 350,
      scale_start_angle: -100,
      scale_end_angle: 100,

      // ==================================================
      // 5) AUTOMATIC SCALE FIT
      // ==================================================
      scale_fit: "auto",
      dial_center_x: 512,
      dial_center_y: 500,
      dial_radius: 400,
      dial_margin: 14,

      // ==================================================
      // 6) SCALE VISUAL DIMENSIONS
      // label_radial_adjust:
      //   positive -> numbers move outward towards the rim
      //   negative -> numbers move inward towards the centre
      // ==================================================
      zone_width: 24,
      major_tick_length: 54,
      minor_tick_length: 32,
      tick_outset: 10,
      label_offset: 18,
      label_radial_adjust: 4,
      // Extra inward shift for the first and last scale number (e.g. 0 / 100).
      label_end_inset: 28,
      label_safety: 28,

      // ==================================================
      // 7) NEEDLE BEHAVIOUR
      // ==================================================
      needle_length_mode: "touch",
      needle_length: 560,
      needle_reach: -5,

      // ==================================================
      // 8) VALUE / UNIT POSITIONING
      // value_position: auto = value jumps left/right to avoid the needle
      // unit_position: relative = the unit moves together with the value
      // ==================================================
      value_position: "auto",
      value_left_x: 410,
      value_right_x: 614,
      value_y: 435,
      unit_position: "relative",
      unit_x: "auto",
      unit_y: 435,
      unit_offset_x: 92,
      unit_offset_y: 0,

      // ==================================================
      // 9) LEGENDS
      // ==================================================
      title_x: 235,
      subtitle_x: 790,
      text_y: 570,

      // ==================================================
      // 10) GEAR HOUSING / CARD SIZE
      // ==================================================
      gear_y: 770,
      gear_turns: 2,
      max_width: 720,

      zones: [
        { from: 0, to: 40, color: "#4caf50" },
        { from: 40, to: 70, color: "#f6c343" },
        { from: 70, to: 100, color: "#df4332" }
      ]
    };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("analog-gauge-card: 'entity' is required");
    const min = Number(config.min ?? 0);
    const max = Number(config.max ?? 100);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      throw new Error("analog-gauge-card: 'max' must be greater than 'min'");
    }

    this._config = {
      ...AnalogGaugeCard.getStubConfig(),
      show_value: true,
      animate: true,
      tap_action: "more-info",
      ...config,
      min,
      max
    };

    if (!config.zones) {
      this._config.zones = [
        { from: min, to: min + (max - min) * 0.4, color: "#4caf50" },
        { from: min + (max - min) * 0.4, to: min + (max - min) * 0.7, color: "#f6c343" },
        { from: min + (max - min) * 0.7, to: max, color: "#df4332" }
      ];
    }

    this._validateConfig();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    this._stateObj = hass.states[this._config.entity] || null;
    const parsed = Number(this._stateObj?.state);
    this._value = Number.isFinite(parsed) ? parsed : null;
    if (!this._rendered) this._render();
    this._updateDynamic();
  }

  getCardSize() { return 6; }

  _validateConfig() {
    const cfg = this._config;
    const numericFields = [
      "pivot_x","pivot_y","scale_center_x","scale_center_y",
      "scale_radius","scale_start_angle","scale_end_angle",
      "dial_center_x","dial_center_y","dial_radius","dial_margin",
      "zone_width","major_tick_length","minor_tick_length",
      "tick_outset","label_offset","label_radial_adjust","label_end_inset","label_safety",
      "needle_length","needle_reach",
      "value_left_x","value_right_x","value_y",
      "unit_y","unit_offset_x","unit_offset_y",
      "title_x","subtitle_x","text_y","gear_y","gear_turns","max_width"
    ];
    for (const field of numericFields) {
      if (!Number.isFinite(Number(cfg[field]))) throw new Error(`analog-gauge-card: '${field}' must be numeric`);
    }
    if (Number(cfg.scale_radius) <= 80) throw new Error("analog-gauge-card: 'scale_radius' must be greater than 80");
    if (Number(cfg.scale_end_angle) <= Number(cfg.scale_start_angle)) throw new Error("analog-gauge-card: 'scale_end_angle' must be greater than 'scale_start_angle'");

    const fit = String(cfg.scale_fit || "auto").toLowerCase();
    if (!["auto", "none"].includes(fit)) throw new Error("analog-gauge-card: 'scale_fit' must be 'auto' or 'none'");
    const needleMode = String(cfg.needle_length_mode || "touch").toLowerCase();
    if (!["touch", "fixed"].includes(needleMode)) throw new Error("analog-gauge-card: 'needle_length_mode' must be 'touch' or 'fixed'");
    const unitPosition = String(cfg.unit_position || "relative").toLowerCase();
    if (!["relative","absolute","auto"].includes(unitPosition)) throw new Error("analog-gauge-card: 'unit_position' must be 'relative', 'absolute', or 'auto'");
  }

  _escape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  _clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

  _fraction(value) {
    const { min, max } = this._config;
    return (this._clamp(value, min, max) - min) / (max - min);
  }

  _polar(cx, cy, radius, angleDeg) {
    const radians = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
  }

  _arcPath(cx, cy, radius, startAngle, endAngle) {
    const start = this._polar(cx, cy, radius, endAngle);
    const end = this._polar(cx, cy, radius, startAngle);
    const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  _formatScale(value) {
    if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
    return Number(value).toFixed(Math.min(2, Math.max(0, Number(this._config.decimals) || 0)));
  }

  _pointInsideDial(x, y, extraMargin = 0) {
    const cfg = this._config;
    const dx = x - Number(cfg.dial_center_x);
    const dy = y - Number(cfg.dial_center_y);
    const allowedRadius = Number(cfg.dial_radius) - Number(cfg.dial_margin) - extraMargin;
    return dx * dx + dy * dy <= allowedRadius * allowedRadius;
  }

  _radiusFits(radius) {
    const cfg = this._config;
    const cx = Number(cfg.scale_center_x);
    const cy = Number(cfg.scale_center_y);
    const start = Number(cfg.scale_start_angle);
    const end = Number(cfg.scale_end_angle);
    const outerExtra = Math.max(
      Number(cfg.zone_width) / 2,
      Number(cfg.tick_outset) + 8,
      Number(cfg.label_offset) + Number(cfg.label_radial_adjust) + Number(cfg.label_safety)
    );
    const samples = Math.max(80, Math.ceil(Math.abs(end - start) * 1.5));
    for (let i = 0; i <= samples; i += 1) {
      const f = i / samples;
      const angle = start + f * (end - start);
      const point = this._polar(cx, cy, radius + outerExtra, angle);
      if (!this._pointInsideDial(point.x, point.y, 0)) return false;
    }
    return true;
  }

  _effectiveGeometry() {
    const cfg = this._config;
    const requestedRadius = Number(cfg.scale_radius);
    let radius = requestedRadius;
    if (String(cfg.scale_fit || "auto").toLowerCase() === "auto" && !this._radiusFits(radius)) {
      let low = 80, high = radius;
      for (let i = 0; i < 40; i += 1) {
        const mid = (low + high) / 2;
        if (this._radiusFits(mid)) low = mid; else high = mid;
      }
      radius = low;
      const warning = `radius ${requestedRadius}px → ${Math.floor(radius)}px`;
      if (warning !== this._lastGeometryWarning) {
        console.warn(`[analog-gauge-card] Scale auto-fitted: ${warning}`);
        this._lastGeometryWarning = warning;
      }
    }
    return {
      scaleCx: Number(cfg.scale_center_x),
      scaleCy: Number(cfg.scale_center_y),
      pivotX: Number(cfg.pivot_x),
      pivotY: Number(cfg.pivot_y),
      radius,
      start: Number(cfg.scale_start_angle),
      end: Number(cfg.scale_end_angle)
    };
  }

  _scaleAngleForFraction(fraction) {
    const g = this._effectiveGeometry();
    return g.start + fraction * (g.end - g.start);
  }

  _scalePointForFraction(fraction) {
    const g = this._effectiveGeometry();
    return this._polar(g.scaleCx, g.scaleCy, g.radius, this._scaleAngleForFraction(fraction));
  }

  _needleGeometryForFraction(fraction) {
    const cfg = this._config;
    const g = this._effectiveGeometry();
    const target = this._scalePointForFraction(fraction);
    const dx = target.x - g.pivotX;
    const dy = target.y - g.pivotY;
    const angle = Math.atan2(dx, -dy) * 180 / Math.PI;
    const targetDistance = Math.hypot(dx, dy);
    const mode = String(cfg.needle_length_mode || "touch").toLowerCase();
    const length = mode === "fixed" ? Number(cfg.needle_length) : targetDistance + Number(cfg.needle_reach);
    return { angle, length, target };
  }

  _scaleGeometry() {
    const cfg = this._config;
    const g = this._effectiveGeometry();
    return {
      ...g,
      zoneWidth: Number(cfg.zone_width),
      tickOuterRadius: g.radius + Number(cfg.tick_outset),
      majorInnerRadius: g.radius + Number(cfg.tick_outset) - Number(cfg.major_tick_length),
      minorInnerRadius: g.radius + Number(cfg.tick_outset) - Number(cfg.minor_tick_length),
      labelRadius: g.radius + Number(cfg.label_offset) + Number(cfg.label_radial_adjust)
    };
  }

  _zonesSvg() {
    const cfg = this._config;
    const g = this._scaleGeometry();
    return (Array.isArray(cfg.zones) ? cfg.zones : []).map((zone) => {
      const from = this._clamp(Number(zone.from), cfg.min, cfg.max);
      const to = this._clamp(Number(zone.to), cfg.min, cfg.max);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return "";
      const start = g.start + this._fraction(from) * (g.end - g.start);
      const end = g.start + this._fraction(to) * (g.end - g.start);
      return `<path class="zone" d="${this._arcPath(g.scaleCx, g.scaleCy, g.radius, start, end)}" stroke="${this._escape(zone.color || "#888888")}" stroke-width="${g.zoneWidth}" />`;
    }).join("");
  }


  _fitLabelPoint(point, text, isEndpoint = false) {
    const cfg = this._config;
    const scaleCx = Number(cfg.scale_center_x);
    const scaleCy = Number(cfg.scale_center_y);
    const dialCx = Number(cfg.dial_center_x);
    const dialCy = Number(cfg.dial_center_y);
    const dialRadius = Number(cfg.dial_radius) - Number(cfg.dial_margin) - 3;

    let x = point.x;
    let y = point.y;

    // End labels need additional space because their text extends sideways.
    if (isEndpoint) {
      const dx = x - scaleCx;
      const dy = y - scaleCy;
      const length = Math.hypot(dx, dy) || 1;
      const inset = Math.max(0, Number(cfg.label_end_inset) || 0);
      x -= (dx / length) * inset;
      y -= (dy / length) * inset;
    }

    // Approximate the rendered 34px bold label rectangle and pull it inward
    // until all four corners remain inside the physical white dial.
    const labelText = String(text);
    const halfWidth = Math.max(13, labelText.length * 10.7);
    const halfHeight = 19;

    const fits = () => {
      const corners = [
        [x - halfWidth, y - halfHeight],
        [x + halfWidth, y - halfHeight],
        [x - halfWidth, y + halfHeight],
        [x + halfWidth, y + halfHeight]
      ];
      return corners.every(([cx, cy]) => {
        const dx = cx - dialCx;
        const dy = cy - dialCy;
        return dx * dx + dy * dy <= dialRadius * dialRadius;
      });
    };

    for (let iteration = 0; iteration < 30 && !fits(); iteration += 1) {
      x = dialCx + (x - dialCx) * 0.965;
      y = dialCy + (y - dialCy) * 0.965;
    }

    return { x, y };
  }

  _ticksSvg() {
    const cfg = this._config;
    const g = this._scaleGeometry();
    const majorCount = Math.max(2, Number(cfg.major_ticks) || 6);
    const minorPerInterval = Math.max(0, Number(cfg.minor_ticks) || 0);
    const intervals = majorCount - 1;
    let major = "", minor = "", labels = "";
    for (let i = 0; i < majorCount; i += 1) {
      const fraction = i / intervals;
      const value = cfg.min + fraction * (cfg.max - cfg.min);
      const angle = g.start + fraction * (g.end - g.start);
      const inner = this._polar(g.scaleCx, g.scaleCy, g.majorInnerRadius, angle);
      const outer = this._polar(g.scaleCx, g.scaleCy, g.tickOuterRadius, angle);
      major += `<line class="tick-major" x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}" />`;
      const labelText = this._formatScale(value);
      const rawLabel = this._polar(g.scaleCx, g.scaleCy, g.labelRadius, angle);
      const label = this._fitLabelPoint(rawLabel, labelText, i === 0 || i === majorCount - 1);
      labels += `<text class="scale-label" x="${label.x}" y="${label.y}" text-anchor="middle" dominant-baseline="middle">${this._escape(labelText)}</text>`;
      if (i < intervals) {
        for (let j = 1; j <= minorPerInterval; j += 1) {
          const mf = (i + j / (minorPerInterval + 1)) / intervals;
          const ma = g.start + mf * (g.end - g.start);
          const mi = this._polar(g.scaleCx, g.scaleCy, g.minorInnerRadius, ma);
          const mo = this._polar(g.scaleCx, g.scaleCy, g.tickOuterRadius, ma);
          minor += `<line class="tick-minor" x1="${mi.x}" y1="${mi.y}" x2="${mo.x}" y2="${mo.y}" />`;
        }
      }
    }
    return `${minor}${major}${labels}`;
  }

  _renderGlassHighlights() {
    const cfg = this._config;
    return `
      <svg class="ornament-svg" viewBox="0 0 1024 1024" aria-hidden="true">
        <defs>
          <clipPath id="dial-clip-ornament">
            <circle cx="${Number(cfg.dial_center_x)}" cy="${Number(cfg.dial_center_y)}" r="${Number(cfg.dial_radius)}" />
          </clipPath>
          <linearGradient id="glass-band-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="rgba(255,255,255,.18)"/>
            <stop offset="55%" stop-color="rgba(255,255,255,.03)"/>
            <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
          </linearGradient>
          <linearGradient id="glass-band-b" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(255,255,255,.12)"/>
            <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
          </linearGradient>
        </defs>
        <g clip-path="url(#dial-clip-ornament)">
          <path d="M 150 210 C 280 105, 710 102, 860 203" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="7" stroke-linecap="round" />
          <path d="M 210 172 C 315 138, 430 130, 600 137 C 540 166, 435 192, 306 202 C 255 206, 227 196, 210 172 Z" fill="url(#glass-band-a)" opacity=".45" />
          <path d="M 154 122 C 223 96, 811 96, 876 122 C 902 153, 908 179, 900 219 C 847 176, 806 149, 739 136 C 640 117, 384 116, 282 136 C 220 149, 181 170, 131 219 C 123 178, 129 150, 154 122 Z"
                fill="url(#glass-band-b)" opacity=".18" />
        </g>
      </svg>`;
  }

  _asset(name) {
    return new URL(name, ANALOG_GAUGE_V4_ASSET_BASE).href;
  }

  _render() {
    if (!this._config) return;
    const cfg = this._config;
    const geometry = this._effectiveGeometry();
    const maxWidth = Math.max(280, Number(cfg.max_width) || 720);
    const transition = cfg.animate === false ? "none" : "transform .7s cubic-bezier(.22,1,.36,1)";
    const gearY = Number(cfg.gear_y);
    const gearLeft = { x: 401, y: gearY, w: 112, h: 112 };
    const gearCenter = { x: 512, y: gearY, w: 142, h: 142 };
    const gearRight = { x: 625, y: gearY, w: 116, h: 116 };
    const sourceNeedle = { w: 150, h: 480, pivotX: 75, pivotY: 430, tipY: 18 };
    const sourceTipDistance = sourceNeedle.pivotY - sourceNeedle.tipY;
    const initialNeedle = this._needleGeometryForFraction(0.5);
    const initialScale = initialNeedle.length / sourceTipDistance;
    const needleAsset = { w: 80, h: 520, pivotX: 40, pivotY: 500 };
    const pivotAsset = { w: 96, h: 96 };
    this._needleBaseTipDistance = initialNeedle.length;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { width: 100%; display: flex; justify-content: center; align-items: center; background: transparent; border: 0; box-shadow: none; overflow: visible; }
        .gauge-shell { position: relative; width: min(100%, ${maxWidth}px); aspect-ratio: 1 / 1; margin: 0 auto; cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; }
        .layer,.moving,.scale-svg,.ornament-svg { position: absolute; display: block; pointer-events: none; }
        .layer,.scale-svg,.ornament-svg { inset: 0; width: 100%; height: 100%; }
        .base { z-index: 1; filter: saturate(.95) contrast(1.04) brightness(.99); }
        .scale-svg { z-index: 2; overflow: hidden; }
        .gear { z-index: 3; transition: ${transition}; will-change: transform; filter: saturate(.96) contrast(1.03) drop-shadow(0 2px 2px rgba(0,0,0,.30)) drop-shadow(0 6px 8px rgba(0,0,0,.18)); }
        .needle { z-index: 4; transition: ${transition}; will-change: transform; filter: drop-shadow(0 2px 2px rgba(0,0,0,.18)) drop-shadow(0 6px 7px rgba(0,0,0,.18)); }
        .pivot { z-index: 5; filter: drop-shadow(0 2px 4px rgba(0,0,0,.32)); }
        .ornament-svg { z-index: 6; overflow: hidden; }
        .glass { z-index: 7; opacity: .985; filter: contrast(1.03) saturate(.94); }
        .zone { fill: none; stroke-linecap: butt; }
        .tick-major { stroke: #181818; stroke-width: 8.4; stroke-linecap: round; filter: url(#tick-shadow); }
        .tick-minor { stroke: #292929; stroke-width: 4.05; stroke-linecap: round; opacity: .97; }
        .scale-label { fill: #252525; font: 700 34px/1 Arial, Helvetica, sans-serif; letter-spacing: .1px; filter: url(#text-soft-shadow); }
        .value-text { fill: #111; font: 400 92px/1 Arial, Helvetica, sans-serif; filter: url(#text-soft-shadow); }
        .unit-text { fill: #111; font: 700 42px/1 Arial, Helvetica, sans-serif; filter: url(#text-soft-shadow); }
        .title-text,.subtitle-text { fill: #242424; font: 500 28px/1 Arial, Helvetica, sans-serif; letter-spacing: .3px; filter: url(#legend-soft-shadow); }
        #gear-left { left: ${(gearLeft.x - gearLeft.w / 2) / 10.24}%; top: ${(gearLeft.y - gearLeft.h / 2) / 10.24}%; width: ${gearLeft.w / 10.24}%; height: ${gearLeft.h / 10.24}%; transform-origin: 50% 50%; }
        #gear-center { left: ${(gearCenter.x - gearCenter.w / 2) / 10.24}%; top: ${(gearCenter.y - gearCenter.h / 2) / 10.24}%; width: ${gearCenter.w / 10.24}%; height: ${gearCenter.h / 10.24}%; transform-origin: 50% 50%; }
        #gear-right { left: ${(gearRight.x - gearRight.w / 2) / 10.24}%; top: ${(gearRight.y - gearRight.h / 2) / 10.24}%; width: ${gearRight.w / 10.24}%; height: ${gearRight.h / 10.24}%; transform-origin: 50% 50%; }
        #needle { left: ${(geometry.pivotX - needleAsset.pivotX) / 10.24}%; top: ${(geometry.pivotY - needleAsset.pivotY) / 10.24}%; width: ${needleAsset.w / 10.24}%; height: ${needleAsset.h / 10.24}%; transform-origin: ${(needleAsset.pivotX / needleAsset.w) * 100}% ${(needleAsset.pivotY / needleAsset.h) * 100}%; }
        #pivot { left: ${(geometry.pivotX - pivotAsset.w / 2) / 10.24}%; top: ${(geometry.pivotY - pivotAsset.h / 2) / 10.24}%; width: ${pivotAsset.w / 10.24}%; height: ${pivotAsset.h / 10.24}%; }
      </style>
      <ha-card>
        <div id="gauge-shell" class="gauge-shell" role="button" tabindex="0" aria-label="${this._escape(cfg.title || cfg.entity)}">
          <img class="layer base" src="${this._asset("base.webp")}" alt="">
          <svg class="scale-svg" viewBox="0 0 1024 1024" aria-hidden="true">
            <defs>
              <clipPath id="dial-clip"><circle cx="${Number(cfg.dial_center_x)}" cy="${Number(cfg.dial_center_y)}" r="${Number(cfg.dial_radius)}" /></clipPath>
              <filter id="tick-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="0.9" flood-color="#000" flood-opacity=".10"/></filter>
              <filter id="text-soft-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.1" stdDeviation="1.1" flood-color="#000" flood-opacity=".09"/></filter>
              <filter id="legend-soft-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy=".8" stdDeviation=".8" flood-color="#000" flood-opacity=".07"/></filter>
              <filter id="dial-grain" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="1" stitchTiles="stitch" result="noise"/><feColorMatrix in="noise" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .024 0" /></filter>
              <radialGradient id="dial-vignette" cx="50%" cy="42%" r="68%"><stop offset="68%" stop-color="#ffffff" stop-opacity="0" /><stop offset="100%" stop-color="#000000" stop-opacity=".08" /></radialGradient>
              <linearGradient id="arc-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity=".24" /><stop offset="100%" stop-color="#fff" stop-opacity="0" /></linearGradient>
            </defs>
            <g clip-path="url(#dial-clip)">
              <rect x="108" y="96" width="808" height="808" filter="url(#dial-grain)" opacity=".7" />
              <circle cx="${Number(cfg.dial_center_x)}" cy="${Number(cfg.dial_center_y)}" r="${Number(cfg.dial_radius)-1}" fill="url(#dial-vignette)" />
              ${this._zonesSvg()}
              <path d="${this._arcPath(this._effectiveGeometry().scaleCx, this._effectiveGeometry().scaleCy, this._effectiveGeometry().radius - Number(cfg.zone_width) * .18, this._effectiveGeometry().start, this._effectiveGeometry().end)}" fill="none" stroke="url(#arc-gloss)" stroke-width="${Math.max(5, Number(cfg.zone_width) * .32)}" />
              ${this._ticksSvg()}
            </g>
            <text id="value-text" class="value-text" x="${Number(cfg.value_left_x)}" y="${Number(cfg.value_y)}" text-anchor="middle">—</text>
            <text id="unit-text" class="unit-text" x="${Number(cfg.value_left_x)}" y="${Number(cfg.unit_y)}" text-anchor="middle">${this._escape(cfg.unit || "")}</text>
            <text class="title-text" x="${Number(cfg.title_x)}" y="${Number(cfg.text_y)}">${this._escape(cfg.title || "")}</text>
            <text class="subtitle-text" x="${Number(cfg.subtitle_x)}" y="${Number(cfg.text_y)}" text-anchor="end">${this._escape(cfg.subtitle || "")}</text>
          </svg>
          <img id="gear-left" class="moving gear" src="${this._asset("gear-left.webp")}" alt="">
          <img id="gear-center" class="moving gear" src="${this._asset("gear-center.webp")}" alt="">
          <img id="gear-right" class="moving gear" src="${this._asset("gear-right.webp")}" alt="">
          <img id="needle" class="moving needle" src="${this._asset("needle.webp")}" alt="">
          <img id="pivot" class="moving pivot" src="${this._asset("pivot.webp")}" alt="">
          ${this._renderGlassHighlights()}
          <img class="layer glass" src="${this._asset("glass.webp")}" alt="">
        </div>
      </ha-card>
    `;

    this._shell = this.shadowRoot.querySelector("#gauge-shell");
    this._needle = this.shadowRoot.querySelector("#needle");
    this._gearLeft = this.shadowRoot.querySelector("#gear-left");
    this._gearCenter = this.shadowRoot.querySelector("#gear-center");
    this._gearRight = this.shadowRoot.querySelector("#gear-right");
    this._valueText = this.shadowRoot.querySelector("#value-text");
    this._unitText = this.shadowRoot.querySelector("#unit-text");
    this._shell?.addEventListener("click", () => this._handleTap());
    this._shell?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this._handleTap();
      }
    });
    this._rendered = true;
    this._updateDynamic();
  }

  _handleTap() {
    if (this._config.tap_action === "none") return;
    const event = new Event("hass-more-info", { bubbles: true, composed: true });
    event.detail = { entityId: this._config.entity };
    this.dispatchEvent(event);
  }

  _updateDynamic() {
    if (!this._rendered || !this._config) return;
    const cfg = this._config;
    const valid = Number.isFinite(this._value);
    const rawValue = valid ? this._value : cfg.min;
    const clamped = this._clamp(rawValue, cfg.min, cfg.max);
    const fraction = this._fraction(clamped);
    const needleGeometry = this._needleGeometryForFraction(fraction);
    const baseLength = this._needleBaseTipDistance || needleGeometry.length;
    const needleLengthScale = needleGeometry.length / baseLength;
    const zLeft = 12, zCenter = 16, zRight = 14;
    const centreDrive = fraction * 360 * Math.max(0, Number(cfg.gear_turns) || 2);
    const leftAngle = -centreDrive * (zCenter / zLeft);
    const centerAngle = 11.25 + centreDrive;
    const rightAngle = -centreDrive * (zCenter / zRight);
    if (this._needle) this._needle.style.transform = `rotate(${needleGeometry.angle}deg) scaleY(${needleLengthScale})`;
    if (this._gearLeft) this._gearLeft.style.transform = `rotate(${leftAngle}deg)`;
    if (this._gearCenter) this._gearCenter.style.transform = `rotate(${centerAngle}deg)`;
    if (this._gearRight) this._gearRight.style.transform = `rotate(${rightAngle}deg)`;

    const unit = cfg.unit || this._stateObj?.attributes?.unit_of_measurement || "";
    let valueX = Number(cfg.value_left_x);
    const valuePosition = String(cfg.value_position || "auto").toLowerCase();
    const valueOnRight = needleGeometry.angle < 0;
    if (valuePosition === "right") valueX = Number(cfg.value_right_x);
    else if (valuePosition === "auto") valueX = valueOnRight ? Number(cfg.value_right_x) : Number(cfg.value_left_x);

    if (this._valueText) {
      this._valueText.setAttribute("x", String(valueX));
      if (!valid || cfg.show_value === false) this._valueText.textContent = cfg.show_value === false ? "" : "—";
      else this._valueText.textContent = clamped.toFixed(Math.max(0, Number(cfg.decimals) || 0));
    }

    if (this._unitText) {
      const unitPosition = String(cfg.unit_position || "relative").toLowerCase();
      const configuredUnitX = Number(cfg.unit_x);
      let unitX = valueX;
      let unitY = Number(cfg.unit_y);
      if (unitPosition === "absolute") {
        unitX = Number.isFinite(configuredUnitX) ? configuredUnitX : valueX;
      } else {
        const sideFactor = valueOnRight ? -1 : 1;
        unitX = valueX + sideFactor * Number(cfg.unit_offset_x);
        unitY = Number(cfg.value_y) + Number(cfg.unit_offset_y);
      }
      this._unitText.setAttribute("x", String(unitX));
      this._unitText.setAttribute("y", String(unitY));
      this._unitText.textContent = unit;
    }
  }
}

if (!customElements.get("analog-gauge-card")) {
  customElements.define("analog-gauge-card", AnalogGaugeCard);
}

// Backward-compatible alias for dashboards created with the pre-HACS V4.1.2 build.
// New installations should use: type: custom:analog-gauge-card
if (!customElements.get("analog-gauge-card-v412")) {
  customElements.define(
    "analog-gauge-card-v412",
    class AnalogGaugeCardV412Compatibility extends AnalogGaugeCard {}
  );
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "analog-gauge-card")) {
  window.customCards.push({
    type: "analog-gauge-card",
    name: "Analog Gauge Card",
    description: "Photorealistic configurable analog gauge with animated needle and mechanically matched gears",
    preview: true
  });
}

console.info(
  "%c ANALOG-GAUGE-CARD %c 4.1.2 ",
  "color:white;background:#111;padding:4px 8px;border-radius:4px 0 0 4px",
  "color:#111;background:#ddd;padding:4px 8px;border-radius:0 4px 4px 0"
);
