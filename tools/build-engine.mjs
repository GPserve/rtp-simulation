// Regenerates assets/js/rtp-sim/engine.js from verified engine source
// modules. They contain tested game logic and paytable data; this script
// only rewrites module syntax (ESM → lazy global registry) and never edits
// values. Rerun after updating the source modules:
//
//   node tools/build-engine.mjs <source-dir> [out-path]
//
// The source directory must contain scrub-rules.json.
//
// hash.js is replaced with a shim over the vendored js-sha256 / js-sha512
// globals (the source module imports the npm packages instead), and
// simulate.js / worker.js / index.js are excluded — this site has its own
// Monte Carlo loop and worker glue in core.js.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = process.argv[2];
if (!SRC) {
  console.error("usage: node tools/build-engine.mjs <source-dir> [out-path]");
  process.exit(1);
}
const OUT = process.argv[3] || join(dirname(fileURLToPath(import.meta.url)), "../assets/js/rtp-sim/engine.js");

let rules;
try {
  const data = JSON.parse(readFileSync(join(SRC, "scrub-rules.json"), "utf8"));
  if (!Array.isArray(data.replace) || !data.replace.length || !Array.isArray(data.forbid) || !data.forbid.length) {
    throw new Error("invalid rules");
  }
  rules = {
    replace: data.replace.map((entry) => {
      if (!Array.isArray(entry) || entry.length !== 3 || entry.some((part) => typeof part !== "string")) {
        throw new Error("invalid replacement");
      }
      return [new RegExp(entry[0], entry[1]), entry[2]];
    }),
    forbid: data.forbid.map((entry) => {
      if (typeof entry !== "string" || !entry) throw new Error("invalid prohibition");
      return new RegExp(entry, "i");
    }),
  };
} catch {
  console.error("scrub rules not found in source dir");
  process.exit(1);
}

const MODULES = [
  "decimal-utils.js",
  "card.js",
  "blackjack-rtp-scale-table.js",
  "seed.js",
  "paytables/dice.js",
  "paytables/flip.js",
  "paytables/limbo.js",
  "paytables/mines.js",
  "paytables/keno.js",
  "paytables/chicken.js",
  "paytables/plinko.js",
  "paytables/wheel.js",
  "paytables/baccarat.js",
  "paytables/dragon-tiger.js",
  "paytables/blackjack-engine.js",
  "paytables/blackjack.js",
  "paytables/slot.js",
  "paytables/aurora-bear.js",
  "paytables/frog-cross.js",
  "games/random-choice.js",
  "games/dice.js",
  "games/flip.js",
  "games/limbo.js",
  "games/mines.js",
  "games/keno.js",
  "games/chicken.js",
  "games/plinko.js",
  "games/wheel.js",
  "games/baccarat.js",
  "games/dragon-tiger.js",
  "games/blackjack.js",
  "games/slot.js",
  "games/aurora-bear.js",
  "games/frog-cross.js",
  "registry.js",
  "rtp-bounds.js",
];

const resolvePath = (fromModule, spec) => {
  const resolved = normalize(join(dirname("/" + fromModule), spec)).slice(1);
  return resolved;
};

// Apply source-provided replacements only to full comment lines. Code and
// string literals retain their original values.
const scrubComments = (source) =>
  source
    .split("\n")
    .map((line) => {
      if (!/^\s*(\/\/|\/\*|\*)/.test(line)) return line;
      return rules.replace.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), line);
    })
    .join("\n");

const transform = (modPath, source) => {
  const exportedNames = [];
  let hasDefault = false;
  let body = source;

  // import { a, b as c } from "x"; / import * as ns from "x"; / import d from "x";
  body = body.replace(
    /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/g,
    (_, clause, spec) => {
      const target = resolvePath(modPath, spec);
      clause = clause.trim();
      if (clause.startsWith("{")) {
        const names = clause
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => {
            const m = s.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
            return m ? `${m[1]}: ${m[2]}` : s;
          });
        return `const { ${names.join(", ")} } = __require("${target}");`;
      }
      const star = clause.match(/^\*\s+as\s+([A-Za-z0-9_$]+)$/);
      if (star) return `const ${star[1]} = __require("${target}");`;
      return `const ${clause} = __require("${target}").default;`;
    }
  );

  // export default <expr>
  body = body.replace(/export\s+default\s+/g, () => {
    hasDefault = true;
    return "const __default__ = ";
  });

  // export const/let/var/function/class NAME
  body = body.replace(
    /export\s+(const|let|var|function|class)\s+([A-Za-z0-9_$]+)/g,
    (_, kind, name) => {
      exportedNames.push(name);
      return `${kind} ${name}`;
    }
  );

  // export { a, b as c };
  body = body.replace(/export\s*\{([^}]*)\}\s*;?/g, (_, names) => {
    names
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => {
        const m = s.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
        exportedNames.push(m ? `${m[2]}: ${m[1]}` : s);
      });
    return "";
  });

  const exportsList = exportedNames
    .map((n) => (n.includes(":") ? n : `${n}: ${n}`))
    .concat(hasDefault ? ['"default": __default__'] : [])
    .join(", ");

  return `__define("${modPath}", function () {\n${body}\nreturn { ${exportsList} };\n});\n`;
};

let out = `// GENERATED FILE — do not edit by hand. Rebuilt by tools/build-engine.mjs
// from verified engine source modules (game logic + paytable data
// copied verbatim; only module syntax is rewritten).
(function (root) {
  "use strict";

  var __factories = {};
  var __cache = {};
  var __define = function (name, factory) { __factories[name] = factory; };
  var __require = function (name) {
    if (!(name in __cache)) {
      if (!(name in __factories)) throw new Error("unknown engine module: " + name);
      __cache[name] = __factories[name]();
    }
    return __cache[name];
  };

  // hash.js shim: the source module imports the js-sha256/js-sha512 npm
  // packages; this site vendors them as plain scripts (browser globals) and
  // requires them in Node (parity harnesses).
  __define("hash.js", function () {
    var lib256 = root.sha256 || (typeof require === "function" ? require("../vendor/sha256.js").sha256 : null);
    var lib512raw = root.sha512 || (typeof require === "function" ? require("../vendor/sha512.js") : null);
    var lib512 = lib512raw && lib512raw.sha512 ? lib512raw.sha512 : lib512raw;
    if (!lib256 || !lib512) throw new Error("vendored sha256/sha512 must be loaded before engine.js");
    return {
      sha256Hex: function (message) { return lib256(message); },
      hmacSha256Hex: function (key, message) { return lib256.hmac(key, message); },
      hmacSha512Hex: function (key, message) { return lib512.hmac(key, message); },
    };
  });

`;

for (const modPath of MODULES) {
  const source = scrubComments(readFileSync(join(SRC, modPath), "utf8"));
  out += transform(modPath, source) + "\n";
}

out += `  var registry = __require("registry.js");
  var bounds = __require("rtp-bounds.js");
  root.RtpEngine = {
    require: __require,
    GAME_REGISTRY: registry.GAME_REGISTRY,
    GAME_CODES: registry.GAME_CODES,
    validateRtp: bounds.validateRtp,
  };
  if (typeof module === "object" && module.exports) {
    module.exports = root.RtpEngine;
  }
})(typeof self !== "undefined" ? self : globalThis);
`;

for (const [index, line] of out.split("\n").entries()) {
  if (rules.forbid.some((pattern) => pattern.test(line))) {
    console.error("scrub rule violation at line", index + 1);
    process.exit(1);
  }
}

writeFileSync(OUT, out);
console.log("wrote", OUT, out.length, "bytes,", MODULES.length, "modules");
