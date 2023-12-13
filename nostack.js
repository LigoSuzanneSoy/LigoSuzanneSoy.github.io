var noStack = function(asyncf) {
  var lastTime = Date.now();
  var breathe = async () => {
    // don't lock the UI thread if we've been busy for a while
    var time = Date.now();
    if (time - lastTime > 10) {
      console.log('breathing');
      lastTime = time;
      var breatheOut = null;
      var breatheIn = new Promise((resolve, reject) => breatheOut = resolve);
      window.setTimeout(breatheOut, 0);
      await breatheIn;
    } else {
      console.log('could have breathed here');
    }
  };

  var doTask = async function (task) {
    var ret = null;
    var exn = false;

    await breathe();
    try {
      ret = await asyncf.apply(task.that, task.args);
    } catch (e) {
      exn = true;
      ret = e;
    }
    await breathe();

    if (exn) {
      // TODO: that's probably not exactly how real promises catch exceptions
      task.reject(ret);
    } else {
      task.resolve(ret);
    }
  }

  var ret = async function() {
    var task = { that: this, args: arguments, resolve: null, reject: null };
    var promise = new Promise((resolve, reject) => { task.resolve = resolve; task.reject = reject; });
    if (!ret.queue) {
      ret.queueSignal = new Promise((resolve, _reject) => ret.sendQueueSignal = resolve);
      ret.queue = [task];
      while (true) {
        while (ret.queue.length > 0) {
          doTask(ret.queue.shift());
        }
        await Promise.any([ret.queueSignal, promise]); // wait for the outermost call to finish, or for a task to be added to the queue.
        if (ret.queue.length == 0) {
          // queue is empty, so the outermost call must've finished.
          ret.queue = null;
          ret.queueSignal = null;
          ret.sendQueueSignal = null;
          break;
        }
        ret.queueSignal = new Promise((resolve, _reject) => ret.sendQueueSignal = resolve);
      }
    } else {
      ret.queue.push(task);
      ret.sendQueueSignal();
    }
    return promise;
  }
  return ret;
};

var f = noStack(async(i)=>{
  if (i == 0) {
    console.log('0, returning "finished"')
    //debugger;
    return 'finished';
  } else {
    console.log('pre', i);
    var res = await f(i - 1);
    console.log('post', i, res);
    return res + ".";
  }
});

var x = await f(10);