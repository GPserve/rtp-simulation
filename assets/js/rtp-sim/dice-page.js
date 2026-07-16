// Dice RTP simulation page glue: form validation, worker lifecycle,
// result rendering, convergence chart (hand-rolled SVG, dependency-free).
(function () {
  "use strict";

  var GAME_CODE = "DICE";
  var SIMULATION_COUNT = 100000;
  var CONVERGENCE_COUNT_TIERS = [100, 500, 1000, 5000, 10000, 50000, 100000];

  var el = function (id) { return document.getElementById(id); };

  var betInput = el("bet-amount");
  var rtpInput = el("rtp-setting");
  var hitRateInput = el("hit-rate");
  var betError = el("bet-amount-error");
  var rtpError = el("rtp-setting-error");
  var hitRateError = el("hit-rate-error");
  var runButton = el("run-button");
  var progressWrap = el("progress-wrap");
  var progressText = el("progress-text");
  var progressPercent = el("progress-percent");
  var progressBar = el("progress-bar");
  var resultEmpty = el("result-empty");
  var resultSection = el("result-section");

  var RTP_MESSAGES = {
    invalid_number: "Please enter a valid RTP value.",
    out_of_range: "RTP must be between 0.01% and 99.99%. Cannot run simulation.",
  };

  var parseField = function (input) {
    var raw = input.value.trim();
    if (raw === "") return NaN;
    return Number(raw);
  };

  // Field checks mirror the merchant-console version: RTP follows the
  // production bounds (0.01–99.99); bet amount must be a positive number;
  // hit rate maps to the dice point so it shares the 0.01–99.99 window.
  var validate = function () {
    var ok = true;

    var bet = parseField(betInput);
    var betOk = isFinite(bet) && bet > 0;
    betInput.classList.toggle("is-invalid", !betOk);
    betError.hidden = betOk;
    ok = ok && betOk;

    var rtp = parseField(rtpInput);
    var rtpCheck = !isFinite(rtp)
      ? { valid: false, reason: "invalid_number" }
      : rtp < 0.01 || rtp > 99.99
        ? { valid: false, reason: "out_of_range" }
        : { valid: true, reason: null };
    rtpInput.classList.toggle("is-invalid", !rtpCheck.valid);
    rtpError.hidden = rtpCheck.valid;
    if (!rtpCheck.valid) {
      rtpError.textContent = RTP_MESSAGES[rtpCheck.reason] || RTP_MESSAGES.invalid_number;
    }
    ok = ok && rtpCheck.valid;

    var hitRate = parseField(hitRateInput);
    var hitRateOk = isFinite(hitRate) && hitRate >= 0.01 && hitRate <= 99.99;
    hitRateInput.classList.toggle("is-invalid", !hitRateOk);
    hitRateError.hidden = hitRateOk;
    ok = ok && hitRateOk;

    return ok ? { betAmount: bet, rtp: rtp, hitRate: hitRate } : null;
  };

  var fmtMoney = function (x) {
    return Math.round(x).toLocaleString("en-US");
  };

  var fmtPct = function (x) {
    return x.toFixed(2) + "%";
  };

  var renderResult = function (config, result) {
    var main = result.main;
    el("result-subtitle").textContent =
      "Result of this simulation (average bet " +
      config.betAmount.toLocaleString("en-US") +
      " × " + SIMULATION_COUNT.toLocaleString("en-US") +
      " bets, total turnover " + fmtMoney(main.totalFlow) + ")";
    el("result-setting-line").textContent = "RTP Setting: " + fmtPct(config.rtp);

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
      "Simulated RTP (" + fmtPct(config.rtp) + " setting)";
    el("chart-legend-theoretical").textContent =
      "Theoretical Target " + fmtPct(config.rtp);
    renderChart(el("chart-container"), result.convergence, config.rtp);

    resultEmpty.hidden = true;
    resultSection.hidden = false;
  };

  // --- Convergence chart -------------------------------------------------
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

    // horizontal gridlines + y tick labels
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

    // x tick labels (categorical tiers, evenly spaced)
    data.forEach(function (_, i) {
      var label = svgNode("text", {
        x: xAt(i), y: height - pad.bottom + 18, class: "chart-tick chart-tick--x",
      });
      label.textContent = CONVERGENCE_COUNT_TIERS[i].toLocaleString("en-US");
      svg.appendChild(label);
    });

    // axis titles
    var xTitle = svgNode("text", { x: pad.left + plotW / 2, y: height - 8, class: "chart-axis-title" });
    xTitle.textContent = "Bet Volume";
    svg.appendChild(xTitle);
    var yTitle = svgNode("text", {
      x: 14, y: pad.top + plotH / 2, class: "chart-axis-title",
      transform: "rotate(-90 14 " + (pad.top + plotH / 2) + ")",
    });
    yTitle.textContent = "Actual RTP (%)";
    svg.appendChild(yTitle);

    // theoretical dashed line
    svg.appendChild(svgNode("line", {
      x1: pad.left, y1: yAt(theoreticalTarget),
      x2: width - pad.right, y2: yAt(theoreticalTarget),
      class: "chart-line--theoretical",
    }));

    // simulated polyline + dots
    var points = data.map(function (v, i) { return xAt(i) + "," + yAt(v); }).join(" ");
    svg.appendChild(svgNode("polyline", { points: points, class: "chart-line--simulated" }));
    data.forEach(function (v, i) {
      svg.appendChild(svgNode("circle", { cx: xAt(i), cy: yAt(v), r: 3.5, class: "chart-dot" }));
    });

    container.appendChild(svg);
  };

  // --- Worker lifecycle ---------------------------------------------------
  var worker = null;

  var setRunning = function (running) {
    runButton.disabled = running;
    progressWrap.hidden = !running;
    if (running) {
      progressText.textContent = "Simulating… repeat sample 0 / 20";
      progressPercent.textContent = "0%";
      progressBar.style.width = "0%";
    }
  };

  runButton.addEventListener("click", function () {
    var fields = validate();
    if (!fields) return;

    setRunning(true);
    resultSection.hidden = true;
    resultEmpty.hidden = true;

    var config = {
      gameCode: GAME_CODE,
      count: SIMULATION_COUNT,
      betAmount: fields.betAmount,
      rtp: fields.rtp,
      params: { hitRate: fields.hitRate },
    };

    worker = new Worker("../assets/js/rtp-sim/worker.js");
    worker.onmessage = function (event) {
      var msg = event.data;
      if (msg.type === "progress") {
        progressText.textContent =
          "Simulating… repeat sample " + msg.progress.repeatIndex + " / " + msg.progress.repeats;
        progressPercent.textContent = msg.progress.percent + "%";
        progressBar.style.width = msg.progress.percent + "%";
      } else if (msg.type === "result") {
        worker.terminate();
        worker = null;
        setRunning(false);
        renderResult(config, msg.result);
      } else if (msg.type === "error") {
        worker.terminate();
        worker = null;
        setRunning(false);
        resultEmpty.hidden = false;
      }
    };
    worker.onerror = function () {
      worker.terminate();
      worker = null;
      setRunning(false);
      resultEmpty.hidden = false;
    };
    worker.postMessage(config);
  });

  [betInput, rtpInput, hitRateInput].forEach(function (input) {
    input.addEventListener("input", validate);
  });
})();
