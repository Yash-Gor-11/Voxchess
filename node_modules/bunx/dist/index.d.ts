/** Run a command and return stdout decoded */
declare const $o: (cmd: TemplateStringsArray | string, ...args: Array<string | number>) => string;
/** Run a command and return stdout decoded (alias to $o) */
declare const $: (cmd: TemplateStringsArray | string, ...args: Array<string | number>) => string;
/** Run a command and return stderr decoded */
declare const $e: (cmd: TemplateStringsArray | string, ...args: Array<string | number>) => string | undefined;
/** Run a command and return executed status */
declare const $s: (cmd: TemplateStringsArray | string, ...args: Array<string | number>) => boolean;
/** Run a command and throw an error if it exists with a non-zero code. */
declare const $t: (cmd: TemplateStringsArray | string, ...args: Array<string | number>) => void;

export { $, $e, $o, $s, $t };
