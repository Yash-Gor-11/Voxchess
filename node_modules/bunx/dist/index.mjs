// src/index.ts
import { spawn } from "bun-utilities/spawn";
var quote = (cmd, ...args) => {
  return cmd.reduce((acc, cur, i) => {
    return acc + cur + (args[i] || "");
  }, "");
};
var execSync = (c) => {
  const cmd = c.split(/\s+/);
  return spawn(cmd[0], cmd.slice(1));
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
export {
  $,
  $e,
  $o,
  $s,
  $t
};
