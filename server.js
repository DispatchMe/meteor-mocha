import { mochaInstance } from 'meteor/practicalmeteor:mocha-core';
import { startBrowser } from 'meteor/aldeed:browser-tests';

const reporter = process.env.SERVER_TEST_REPORTER || 'spec';

// If TEST_BROWSER_DRIVER is not set, assume the app has only server tests
const shouldRunClientTests = !!process.env.TEST_BROWSER_DRIVER;

const shouldRunInParallel = !!process.env.TEST_PARALLEL;

// pass the current env settings to the client.
Meteor.startup(() => {
  Meteor.settings.public = Meteor.settings.public || {};
  Meteor.settings.public.CLIENT_TEST_REPORTER = process.env.CLIENT_TEST_REPORTER;
});

// Since intermingling client and server log lines would be confusing,
// the idea here is to buffer all client logs until server tests have
// finished running and then dump the buffer to the screen and continue
// logging in real time after that if client tests are still running.
let serverTestsDone = false;
let clientLines = [];
function clientLogBuffer(line) {
  if (serverTestsDone) {
    // printing and removing the extra new-line character. The first was added by the client log, the second here.
    console.log(line.replace(/\n$/, ''));
  } else {
    clientLines.push(line);
  }
}

function printHeader(type) {
  const lines = [
    '\n--------------------------------',
    `----- RUNNING ${type} TESTS -----`,
    '--------------------------------\n',
  ];
  lines.forEach(line => {
    if (type === 'CLIENT') {
      clientLogBuffer(line);
    } else {
      console.log(line);
    }
  });
}

let callCount = 0;
let clientFailures = 0;
let serverFailures = 0;
function exitIfDone(type, failures) {
  callCount++;
  if (type === 'client') {
    clientFailures = failures;
  } else {
    serverFailures = failures;
    serverTestsDone = true;
    if (shouldRunClientTests) {//
      clientLines.forEach((line) => {
        // printing and removing the extra new-line character. The first was added by the client log, the second here.
        console.log(line.replace(/\n$/, ''));
      });
    }
  }

  if (callCount === 2) {
    if (shouldRunClientTests) {
      console.log('All client and server tests finished!\n');
      console.log('--------------------------------');
      console.log(`SERVER FAILURES: ${serverFailures}`);
      console.log(`CLIENT FAILURES: ${clientFailures}`);
      console.log('--------------------------------');
    }
    if (!process.env.TEST_WATCH) {
      if (clientFailures + serverFailures > 0) {
        process.exit(1); // exit with non-zero status if there were failures
      } else {
        process.exit(0);
      }
    }//
  }
}

function serverTests(cb){
  printHeader('SERVER');

  // We need to set the reporter when the tests actually run to ensure no conflicts with
  // other test driver packages that may be added to the app but are not actually being
  // used on this run.
  mochaInstance.reporter(reporter);

  mochaInstance.run((failureCount) => {
    exitIfDone('server', failureCount);
    if (cb) { cb(); }
  });

}

function clientTests(cb){
  printHeader('CLIENT');

  startBrowser({
    stdout(data) {
      clientLogBuffer(data.toString());
    },
    stderr(data) {
      clientLogBuffer(data.toString());
    },
    done(failureCount) {
      exitIfDone('client', failureCount);
      if (cb) { cb(); }
    },
  });
}

// Before Meteor calls the `start` function, app tests will be parsed and loaded by Mocha
function start() {
  if (!shouldRunClientTests) {
    console.log('SKIPPING CLIENT TESTS BECAUSE TEST_BROWSER_DRIVER ENVIRONMENT VARIABLE IS NOT SET');
  }

  // Run in PARALLEL or SERIES
  // run in series is a better default IMHO since it avoids db and state conflicts for newbs
  // if you want parallel you will know these risks
  if (shouldRunInParallel){
    console.log('Warning: Running in parallel can cause side-effects from state/db sharing');

    serverTests()
    // Simultaneously start headless browser to run the client tests
    if (shouldRunClientTests) {
      clientTests();
    } else {
      exitIfDone('client', 0);
    }
  } else { // run in series by default
    serverTests(function(){
      // Simultaneously start headless browser to run the client tests
      if (shouldRunClientTests) {
        clientTests();
      } else {
        exitIfDone('client', 0);
      }
    })
  }
}

export { start };
