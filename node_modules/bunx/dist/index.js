"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  $: () => $,
  $e: () => $e,
  $o: () => $o,
  $s: () => $s,
  $t: () => $t
});
module.exports = __toCommonJS(src_exports);
var import_spawn = require("bun-utilities/spawn");
var quote = (cmd, ...args) => {
  return cmd.reduce((acc, cur, i) => {
    return acc + cur + (args[i] || "");
  }, "");
};
var execSync = (c) => {
  const cmd = c.split(/\s+/);
  return (0, import_spawn.spawn)(cmd[0], cmd.slice(1));
};
var execSyncWrapper = (cmd, ...args) => {
  if (typeof cmd === "string") {
    return execSync(cmd);
  } else {
    return execSync(quote(cmd, ...args));
  }
};
var $o = (cmd, ...args) => {
  return execSyncWrapper(cmd, ...args).stdout;
};
var $ = $o;
var $e = (cmd, ...args) => {
  return execSyncWrapper(cmd, ...args).stderr;
};
var $s = (cmd, ...args) => {
  return execSyncWrapper(cmd, ...args).isExecuted;
};
var $t = (cmd, ...args) => {
  const result = execSyncWrapper(cmd, ...args);
  if (!result.isExecuted) {
    console.error(execSyncWrapper(cmd, ...args).stderr);
    throw `'${cmd} ${args}' exited with non-zero code.`;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  $,
  $e,
  $o,
  $s,
  $t
});
