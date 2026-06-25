var platform = require('os').platform(),
    child_process = require('child_process');

function tts (string, options, callback) {
  options = options || {};
  var command;

  switch (platform) {
    case 'darwin':
      command = darwin(string, options).join(' ');
      break;
  }

  // Speaker process
  child_process.exec(command, null, callback);
}

/*
 * Mac OS X (Darwin)
 * Using 'say' command: Speech Synthesis Manager
 * https://developer.apple.com/library/mac/#documentation/Darwin/Reference/Manpages/man1/say.1.html
 */
function darwin (string, options, callback) {
  var command = [];

  // The command to run
  command.push('say');

  // Message
  if (string) {
    command.push(string)
  }
  else if (options.file) {
    command.push('-f', options.file);
  }

  // Options
  if (options.voice) {
    command.push('-v', options.voice);
  }
  if (options.output) {
    command.push('-o', options.output);
  }

  return command;
}

module.exports = tts;
