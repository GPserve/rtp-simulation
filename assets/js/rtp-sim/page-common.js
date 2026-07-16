// Shared page glue for all simulation pages: field helpers, formatters,
// worker lifecycle with progress UI, and the convergence chart renderer.
// Pages own their field validation and result rendering; the shared layer
// assumes the standard element ids (run-button, progress-*, result-*).
(function () {
  "use strict";

  var SIMULATION_COUNT = 100000;
  var CONVERGENCE_COUNT_TIERS = [100, 500, 1000, 5000, 10000, 50000, 100000];

  var el = function (id) {
    return document.getElementById(id);
  };

  var parseField = function (input) {
    var raw = input.value.trim();
    if (raw === "") return NaN;
    return Number(raw);
  };

  var fmtMoney = function (x) {
    return Math.round(x).toLocaleString("en-US");
  };

  var fmtPct = function (x) {
    return x.toFixed(2) + "%";
  };

  // Production bounds (marshmallow validate.Range on merchant game RTP);
  // BLACKJACK / BACCARAT pages use the engine's dedicated bounds instead
  // (validateRtpField below picks that up automatically when core.js is
  // loaded on the page).
  var RTP_MESSAGES = {
    invalid_number: "Please enter a valid RTP value.",
    out_of_range: "RTP must be between 0.01% and 99.99%. Cannot run simulation.",
    below_minimum: "Below this game's valid lower bound. Cannot run simulation.",
    above_maximum: "Exceeds the maximum allowed value (99.99%). Cannot run simulation.",
    unreachable: "This RTP value cannot be exactly achieved under this game's payout structure. Cannot run simulation.",
  };

  var validateRtpValue = function (rtp) {
    if (!isFinite(rtp)) return { valid: false, reason: "invalid_number" };
    if (rtp < 0.01 || rtp > 99.99) return { valid: false, reason: "out_of_range" };
    return { valid: true, reason: null };
  };

  // Validate the RTP input against the game's bounds, toggle field state,
  // and return the parsed value (or null). Uses the engine's per-game
  // validation (dedicated lower bounds / reachability) when available.
  var validateRtpField = function (input, errorEl, gameCode) {
    var rtp = parseField(input);
    var check;
    if (window.RtpSim && RtpSim.validateRtp) {
      check = !isFinite(rtp)
        ? { valid: false, reasonKey: "invalid_number" }
        : RtpSim.validateRtp(gameCode, rtp);
    } else {
      check = validateRtpValue(rtp);
    }
    var reason = check.reasonKey || check.reason;
    input.classList.toggle("is-invalid", !check.valid);
    errorEl.hidden = check.valid;
    if (!check.valid) {
      errorEl.textContent = RTP_MESSAGES[reason] || RTP_MESSAGES.invalid_number;
    }
    return check.valid ? rtp : null;
  };

  // Numeric field check with range/integer options; toggles field state.
  var fieldNumber = function (input, errorEl, opts) {
    opts = opts || {};
    var v = parseField(input);
    var ok =
      isFinite(v) &&
      (opts.positive ? v > 0 : true) &&
      (opts.min === undefined || v >= opts.min) &&
      (opts.max === undefined || v <= opts.max) &&
      (opts.integer ? Number.isInteger(v) : true);
    input.classList.toggle("is-invalid", !ok);
    if (errorEl) errorEl.hidden = ok;
    return ok ? v : null;
  };

  // Standard result rendering shared by every classification-A page
  // (3 stat cards + convergence chart targeting the RTP setting itself).
  var renderStandardResult = function (config, result, opts) {
    opts = opts || {};
    var main = result.main;
    var settingLabel = opts.settingLabel || "RTP Setting";
    el("result-subtitle").textContent =
      "Result of this simulation (average bet " +
      config.betAmount.toLocaleString("en-US") +
      " × " + SIMULATION_COUNT.toLocaleString("en-US") +
      " bets, total turnover " + fmtMoney(main.totalFlow) + ")";
    el("result-setting-line").textContent =
      settingLabel + ": " + fmtPct(config.rtp) +
      " · 90% interval from 20 repeat samples of " +
      SIMULATION_COUNT.toLocaleString("en-US") + " bets each";

    el("stat-rtp-value").textContent = fmtPct(main.actualRtp.mean);
    el("stat-rtp-range").textContent =
      "90%: " + fmtPct(main.actualRtp.p5) + " ~ " + fmtPct(main.actualRtp.p95);
    el("stat-flow-value").textContent = fmtMoney(main.totalFlow);
    el("stat-profit-value").textContent = fmtMoney(main.houseProfit.mean);
    el("stat-profit-range").textContent =
      "90%: " + fmtMoney(main.houseProfit.p5) + " ~ " + fmtMoney(main.houseProfit.p95);

    el("chart-title").textContent =
      "Convergence Curve (for current RTP setting, " + fmtPct(config.rtp) + ")";
    el("chart-legend-simulated").textContent =
      "Simulated RTP (" + fmtPct(config.rtp) + " setting, one sample per volume)";
    el("chart-legend-theoretical").textContent =
      "Theoretical Target " + fmtPct(config.rtp);
    renderChart(el("chart-container"), result.convergence, config.rtp);
  };

  // --- Worker lifecycle + progress UI ------------------------------------
  var setRunning = function (running) {
    el("run-button").disabled = running;
    el("progress-wrap").hidden = !running;
    if (running) {
      el("progress-text").textContent = "Simulating… repeat sample 0 / 20";
      el("progress-percent").textContent = "0%";
      el("progress-bar").style.width = "0%";
    }
  };

  var runSimulation = function (config, onResult) {
    setRunning(true);
    el("result-section").hidden = true;
    el("result-empty").hidden = true;

    var worker = new Worker("assets/js/rtp-sim/worker.js");
    var finish = function () {
      worker.terminate();
      setRunning(false);
    };
    worker.onmessage = function (event) {
      var msg = event.data;
      if (msg.type === "progress") {
        el("progress-text").textContent =
          "Simulating… repeat sample " + msg.progress.repeatIndex + " / " + msg.progress.repeats;
        el("progress-percent").textContent = msg.progress.percent + "%";
        el("progress-bar").style.width = msg.progress.percent + "%";
      } else if (msg.type === "result") {
        finish();
        onResult(msg.result);
        el("result-empty").hidden = true;
        el("result-section").hidden = false;
      } else if (msg.type === "error") {
        finish();
        el("result-empty").hidden = false;
      }
    };
    worker.onerror = function () {
      finish();
      el("result-empty").hidden = false;
    };
    worker.postMessage(config);
  };

  // --- Convergence chart (dependency-free SVG) ----------------------------
  var SVG_NS = "http://www.w3.org/2000/svg";
  var svgNode = function (name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (k) {
      node.setAttribute(k, attrs[k]);
    });
    return node;
  };

  var renderChart = function (container, data, theoreticalTarget) {
    container.textContent = "";

    var width = 720;
    var height = 300;
    var pad = { left: 60, right: 20, top: 16, bottom: 48 };
    var plotW = width - pad.left - pad.right;
    var plotH = height - pad.top - pad.bottom;

    var values = data.concat([theoreticalTarget]);
    var yMin = Math.min.apply(null, values);
    var yMax = Math.max.apply(null, values);
    var yPad = Math.max(0.25, (yMax - yMin) * 0.2);
    yMin -= yPad;
    yMax += yPad;

    var xAt = function (i) {
      return pad.left + (plotW * i) / (data.length - 1);
    };
    var yAt = function (v) {
      return pad.top + plotH * (1 - (v - yMin) / (yMax - yMin));
    };

    var svg = svgNode("svg", {
      viewBox: "0 0 " + width + " " + height,
      class: "chart-svg",
      role: "img",
    });

    var Y_TICKS = 5;
    for (var g = 0; g <= Y_TICKS; g += 1) {
      var v = yMin + ((yMax - yMin) * g) / Y_TICKS;
      var y = yAt(v);
      svg.appendChild(svgNode("line", {
        x1: pad.left, y1: y, x2: width - pad.right, y2: y, class: "chart-grid",
      }));
      var yLabel = svgNode("text", { x: pad.left - 8, y: y + 4, class: "chart-tick chart-tick--y" });
      yLabel.textContent = v.toFixed(2);
      svg.appendChild(yLabel);
    }

    data.forEach(function (_, i) {
      var label = svgNode("text", {
        x: xAt(i), y: height - pad.bottom + 18, class: "chart-tick chart-tick--x",
      });
      label.textContent = CONVERGENCE_COUNT_TIERS[i].toLocaleString("en-US");
      svg.appendChild(label);
    });

    var xTitle = svgNode("text", { x: pad.left + plotW / 2, y: height - 8, class: "chart-axis-title" });
    xTitle.textContent = "Bet Volume";
    svg.appendChild(xTitle);
    var yTitle = svgNode("text", {
      x: 14, y: pad.top + plotH / 2, class: "chart-axis-title",
      transform: "rotate(-90 14 " + (pad.top + plotH / 2) + ")",
    });
    yTitle.textContent = "Actual RTP (%)";
    svg.appendChild(yTitle);

    svg.appendChild(svgNode("line", {
      x1: pad.left, y1: yAt(theoreticalTarget),
      x2: width - pad.right, y2: yAt(theoreticalTarget),
      class: "chart-line--theoretical",
    }));

    var points = data.map(function (v, i) { return xAt(i) + "," + yAt(v); }).join(" ");
    svg.appendChild(svgNode("polyline", { points: points, class: "chart-line--simulated" }));
    data.forEach(function (v, i) {
      svg.appendChild(svgNode("circle", { cx: xAt(i), cy: yAt(v), r: 3.5, class: "chart-dot" }));
    });

    container.appendChild(svg);
  };

  window.RtpSimPage = {
    SIMULATION_COUNT: SIMULATION_COUNT,
    CONVERGENCE_COUNT_TIERS: CONVERGENCE_COUNT_TIERS,
    el: el,
    parseField: parseField,
    fmtMoney: fmtMoney,
    fmtPct: fmtPct,
    RTP_MESSAGES: RTP_MESSAGES,
    validateRtpValue: validateRtpValue,
    validateRtpField: validateRtpField,
    fieldNumber: fieldNumber,
    renderStandardResult: renderStandardResult,
    runSimulation: runSimulation,
    renderChart: renderChart,
  };
})();
