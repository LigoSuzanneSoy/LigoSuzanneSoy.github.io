// my.js

// TODO:
// WIP: merge rich bullet subtrees (split on newlines etc.)
// "Run" button under each code block
// Better hidden boilerplate
//
// getNextAction = function() {}
// doAction() {}
// readAction() {} # voice synthesis / my own voice

// Scroll:
// * compute on the flight height of element using planned duration of audio/animation.
// * reading time live update + progress bar
// * scroll animations with https://scrollmagic.io/ jQuery plug-in (find a way to shorten animations when user is scrolling far)
// * natural typing speed (add characters one by one / few by few) as an animation, for "video" mode

// Fun:
// window.CLIPPY_CDN = 'https://raw.githubusercontent.com/pi0/clippyjs/master/assets/agents/';
// https://unpkg.com/clippyjs@0.0.3/dist/clippy.js + <link rel="stylesheet" type="text/css" href="https://raw.githubusercontent.com/pi0/clippyjs/master/assets/clippy.css">
// clippy.load('Merlin', (agent) => { agent.show(); });

// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv

// TODO: In jscoq.js, this indirectly calls coq.work. This is where we can detect if we have finished working
//
// vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv
// *****************************************************************************************************************************
// Best solution would be to rewrite coq.work, to avoid the stack overflow and the O(n²), and have startWork + finishWork events
// *****************************************************************************************************************************
// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//
// this.worker.addEventListener('message', 
//     this._handler = evt => this.coq_handler(evt));

// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

// coq.work or the functions it calls, e.g. coq.add,
// should use a Deferred-style promise to allow making
// a loop that calls work() until there is no more work left,
// without making an infinite call stack.
//
// ESPECIALLY when coq.coq.coq_handler calls (indirectly) the work() again.
//
// Something like this works.
// Behaviour can be made seamless (aside from loosing the stack)
// with an async function, by immediately returning a Deferred-like promise,
// adding a job to the queue opened by the topmost coq.work on the stack if there is one
//        (otherwise start a queue processor like below),
// and the queue processor resolves the promise from the outside when it performs the task.
//
// I could write a generic tailCall(f)(a) function that does the wrapping job at least for
// functions which call themselves.
// 
//
/*var worker = function(f, a) {
  var queue = [{code: f, arg: a}];
  var cont = true;
  var queueWork = function(ff, aa) {
      queue.push({code: ff, arg: aa})
  };
  while (cont) {
      var task = queue.shift();
      if (task) {
          task.code(queueWork, task.arg);
      } else {
          cont = false;
      }
  }
};

var g = async(queueWork, i)=>{
  if (i == 0) {
      debugger; return 'finished'
  } else {
      queueWork(function(qw, j) { console.log(g(qw, j - 1)); }, i);
  }
}

worker(g, 0);*/

// coq.doc.sentences.last().sp.editor.getLineTokens(9)

var prouf = (function(waitJsCoqLoaded) {
  // We'll write all functions and variables global to this package in here.
  var _ = { };
  var prouf = _;
  var $ = null; // jQuery instance, set by _.init();
  var coq = null; // coq instance, set by _.init();

  _.extendJQuery = function($) {
    $.extend($.fn, {
      q: function(op) {
        var args = Array.prototype.slice.call(arguments, 1);
        console.log(args);
        this.queue(function(next) {
          ((typeof op == 'string' || op instanceof String) ? $.fn[op] : op).apply($(this), args);
          next();
        });
        return this;
      },

      andFind: function(selector) { return this.filter(selector).add(this.find(selector)) },

      // TODO: more performant version that stops the filter at the first result
      first: function(selector) { return (selector ? this.filter(selector) : this).eq(0); },
      
      // TODO: write unit tests for this one, it's more complex than I'd like and has many corner cases.
      _isBeforeOrAfter: function(them, factor) {
        return this.filter((_i,me) => {
          var $me = $(me);
          // .add(parents) puts the list of ancestors back in order from html to the bottom-most element
          var myAncestorsIndexes = $.map($me.add($me.parents()), p => $(p).index());
          var $them = $(them);
          return $them.toArray().every(one => {
            var $one = $(one);
            // .add(parents) puts the list of ancestors back in order from html to the bottom-most element
            var $onesAncestors = $one.add($one.parents());
            for (var m = 0; m < Math.min(myAncestorsIndexes.length, $onesAncestors.length); m++) {
              var myAncestorsIndex = myAncestorsIndexes[m];
              var onesAncestorsIndex = $onesAncestors.eq(m).index();
              if (myAncestorsIndex * factor < onesAncestorsIndex * factor) {
                return true;
              } else if (myAncestorsIndex * factor > onesAncestorsIndex * factor) {
                return false;
              } else {
                // equal, continue with next child on my and one's side.
              }
            }
            return true;
          });
        });
      },
      isBefore: function(them) { return this._isBeforeOrAfter(them, 1); },
      isAfter: function(them) { return this._isBeforeOrAfter(them, -1); },
    });

    return $;
  };

  _.advice = function(obj, fld, fun) { 
    obj['prouf_old_' + fld] = obj[fld];
    obj[fld] = function() {
      fun(this, arguments);
      return obj['prouf_old_' + fld].call(this, arguments);
    };
  };

  _.globalLastGoalInfo = null;

  _.stringToUint8Array = function(str) {
    var s = String(str);
    var a = [];
    for (var i = 0; i < s.length; i++) {
      a.push(s.charCodeAt(i));
    }
    return new Uint8Array(a);
  };

  _.uint8ArrayToString = function(a) {
    var s = [];
    for (var i = 0; i < a.length; i++) {
      s.push(String.fromCharCode(a[i]));
    }
    return s.join('');
  };

  _.get_file = function(path, callback) {
    coq.coq.worker.onmessage = function(x) { callback(x.data[1], x.data[2]); }
    coq.coq.sendDirective(['Get', path])
  };

  _.get_file_string = function(path, callback) {
    _.get_file(path, function(path, contents) { callback(path, _.uint8ArrayToString(contents)); });
  };

  _.Deferred = function() {
    this.isResolved = false;
    this.promise = new Promise((resolve, reject) => {
      this.resolve = x => { this.isResolved = true; resolve(x); };
      this.reject = reject;
    });
    this.then = function (f) { return this.promise.then(f); };
  };

  _.waitJsCoqReady = new _.Deferred();

  _.displayProgress = function(isInProgress) {
    document.body.classList[isInProgress?'add':'remove']('jscoq-waiting')
  };

  _.my_init = function() {
    // TODO: refactor to use events + promises
    (function() {
      $('<div id="overlays"></div>').appendTo('body');
      var that = coq.layout;
      var f = that.splash;
      that.splash = function(version_info, msg, mode) {
        console.log('mysplash', mode);
        if (mode == 'ready') {
          document.body.classList.remove('waiting');
          _.displayProgress(false);
          _.waitJsCoqReady.resolve();
        }
        return f.call(that, version_info, msg, mode);
      }
    })();

    // TODO: use the #fragment instead
    if (location.search !== '?jscoq=off') {
      _.displayProgress(true);
      coq.layout.onToggle({target: coq.layout, shown: true});
    }
  };

  _.nbSpansInProgress = 0;
  _.spansInProgress = {};
  _.coqActivityUIFeedback = function(msg) {
    if (msg.data && msg.data[0] == 'Feedback' && msg.data[1].contents && msg.data[1].contents == 'Complete') {
      if (typeof msg.data[1].span_id != 'undefined' && _.spansInProgress.hasOwnProperty(msg.data[1].span_id)) {
        delete _.spansInProgress[msg.data[1].span_id];
        _.nbSpansInProgress--;
        //console.log('onmessage_x', 'compltete', msg.data[1].span_id, 'nb='+_.nbSpansInProgress, document.querySelectorAll('[data-coq-sid="'+msg.data[1].span_id+'"]').length);
        _.displayProgress(_.nbSpansInProgress);
      } else {
        //console.log('onmessage_x', 'complete UNKNOWN', msg.data[1].span_id, 'nb='+_.nbSpansInProgress, document.querySelectorAll('[data-coq-sid="'+msg.data[1].span_id+'"]').length);
        // reset because we lost track of something.
        if (document.querySelectorAll('[data-coq-sid="'+msg.data[1].span_id+'"]').length != 0) {
          _.nbSpansInProgress = 0
          _.spansInProgress = {};
        }
        _.displayProgress(false);
      }
    } else if (msg.data[0] == 'Added'
            || msg.data[0] == 'Pending'
            || msg.data[0] == 'SearchResults'
            || msg.data[0] == 'GoalInfo'
            || msg.data[0] == 'ModeInfo'
            || msg.data[0] == 'LibProgress'
            || msg.data[0] == 'LoadedPkg'
            || msg.data[0] == 'Feedback'
            || msg.data[0] == 'BackTo'
            || msg.data[0] == 'CoqExn') {
      if (msg.data[0] == 'Feedback' && msg.data[1] && typeof msg.data[1].span_id != 'undefined') {
        if (_.spansInProgress.hasOwnProperty(msg.data[1].span_id)) {
          // already tracking
          //console.log('onmessage_x', 'progress', msg.data[1].span_id, 'nb='+_.nbSpansInProgress);
        } else {
          _.spansInProgress[msg.data[1].span_id] = true;
          _.nbSpansInProgress++;
          //console.log('onmessage_x', 'start', msg.data[1].span_id, 'nb='+_.nbSpansInProgress);
        }
      }
      _.displayProgress(_.nbSpansInProgress);
    } else {
      console.warn('unknown onmessage in my.js', msg.data);
    }

    if (msg.data && msg.data[0] == 'GoalInfo') {
      globalLastGoalInfo = msg;
    }
    if (msg.data && msg.data[0] == 'GoalInfo' && msg.data[2] && msg.data[2].goals && msg.data[2].goals.length > 0) {
      coq.layout.show();
      
      // ==================================================================!!!!!!!!!!!!!!!!!
      // ==================================================================!!!!!!!!!!!!!!!!!
      // ==================================================================!!!!!!!!!!!!!!!!!
      // ==================================================================!!!!!!!!!!!!!!!!!
      // ==================================================================!!!!!!!!!!!!!!!!!
      // ==================================================================!!!!!!!!!!!!!!!!!
      /*if (typeof window.proufTimeoutStarted == 'undefined') {
        window.proufTimeoutStarted = true;
        window.setTimeout(function() { window.setInterval(prouf.test, 2000); }, 500);
      }*/
      // ==================================================================!!!!!!!!!!!!!!!!!
      // ==================================================================!!!!!!!!!!!!!!!!!
      // ==================================================================!!!!!!!!!!!!!!!!!
      // ==================================================================!!!!!!!!!!!!!!!!!
      // ==================================================================!!!!!!!!!!!!!!!!!
      // ==================================================================!!!!!!!!!!!!!!!!!

    }
  };

  _.my_init2 = function() {
    coq.coq.worker.onmessage = function(msg) {
      _.coqActivityUIFeedback(msg);
      _.insertTacticHandler(msg);
    };
    /*var that = coq;
    var updateGoals = that.updateGoals;
    coq.updateGoals = function(html) {
      coq.layout.show();
      window.setTimeout(1000, function() { updateGoals.call(that, html); });
    };*/
  };

  _.getTxtIndentation = function(txt) {
    var mm = txt.match(/^\[(.*)\]:\{$/);
    if (mm) {
      var bullet = mm[1];
      return { indent: '', bullet: bullet, bulletAsSpace: '  ', bulletSpaceAfter: '', spaces: '  ', unshelved: true };
    } else {
      var m = txt.match(/^( *)([-+*]*)( *)/);
      var indent = m[1];
      var bullet = m[2];
      var bulletSpaceAfter = m[3]
      var bulletAsSpaces = '';
      for (var i = 0; i < bullet.length; i++) {
        bulletAsSpaces += ' ';
      }
      var spaces = indent + bulletAsSpaces + bulletSpaceAfter;
      return { indent: indent, bullet: bullet, bulletAsSpace: bulletAsSpaces, bulletSpaceAfter: bulletSpaceAfter, spaces: spaces, unshelved: false };
    }
  };

  _.getIndentation = function(cmdoc, line, ignoreLineContents) {
    if (line > 0) {
      return _.getTxtIndentation(cmdoc.getLine(line-1));
    } else {
      // TODO: this looks like a type error?!
      return '';
    }
  };

  _.getBulletPath = function(cmdoc, line) {
    var tree = [];
    for (var i = line-1; i > 0; i--) {
      var indentation = _.getTxtIndentation(cmdoc.getLine(i));
      if (indentation.bullet != '' && (tree.length == 0 || indentation.indent < tree[tree.length-1].indent)) {
        tree[tree.length] = indentation;
      }
      if (   i > 1
          && tree.length > 0
          && indentation.bullet == tree[tree.length-1].bullet
          && indentation.indent == tree[tree.length-1].indent) {
        // TODO: skip comments & empty lines to find the real semantic prevLine
        var prevLine = _.getTxtIndentation(cmdoc.getLine(i-1));
        if (indentation.indent == prevLine.indent && prevLine.bullet == '') {
          tree[tree.length-1].originator = { cmdoc: cmdoc, line: i-1 };
        }
      }
    }
    return tree;
  };

  prouf.bulletTypes = ['', '-', '+', '*', '--', '++', '**', '---', '+++', '***'];
  prouf.compareBullet = (a, b) =>
    prouf.compareInt(prouf.bulletTypes.indexOf(a), prouf.bulletTypes.indexOf(b));
  prouf.compareIndentation = (a, b) => {
    if (a.root) { return b.root ? 0 : 1; }
    if (b.root) { return -1; }
    return a.indent.length == b.indent.length ? prouf.compareBullet(a.bullet, b.bullet) : prouf.compareInt(a.indent.length, b.indent.length)
  }

  prouf.getBulletTree_old = function(getLine, from, toExcluded) {
    // Array of { indent: …, line: number, children: trees }
    var path = [{indent: '', bullet: '', root: true, bulletAsSpace: '', bulletSpaceAfter: '', spaces: '', unshelved: false, line: 0, children: []}];
    for (var i = from; i < toExcluded; i++) {
      var indentation = prouf.getTxtIndentation(getLine(i))
      indentation.line = i;
      indentation.children = [];

      while (path.length > 1 && prouf.compareIndentation(indentation, path[path.length-1]) <= 0) {
        path[path.length-2].children.push(path.pop());
      }
      path[path.length] = indentation;
    }
    // collapse the last open branch of the tree
    while(path.length > 1) {
      path[path.length-2].children.push(path.pop());
    }
    return path[0];
  };
  prouf.debugBulletTree = function(cmdoc, t, depth) {
    depth = depth || 0;
    console.log(depth, cmdoc.getLine(t.line), t)
    for (var i = 0; i < t.children.length; i++) {
      prouf.debugBulletTree(cmdoc, t.children[i], depth+1);
    }
  }
  //prouf.debugBulletTree(cmdoc, prouf.getBulletTree_old(cmdoc, 5, 19))

  /*
  var cmdoc = coq.provider.currentFocus.editor.getDoc();
  var getLine = l => cmdoc.getLine(l)
  prouf.getBulletTree(getLine, 5, 19)
  */
  prouf.getBulletTree = function(getLine, from, toExcluded) {
    // Array of { indent: …, line: number, children: trees }
    var root = {children:[]};
    var path = [root];
    var pathi = [{indent: '', bullet: '', root: true, bulletAsSpace: '', bulletSpaceAfter: '', spaces: '', unshelved: false, line: 0, children: []}];
    for (var i = from; i < toExcluded; i++) {
      var text = getLine(i);
      var indentation = prouf.getTxtIndentation(text);

      while (path.length > 1 && prouf.compareIndentation(indentation, pathi[pathi.length-1]) <= 0) {
        path[path.length-2].children.push(path.pop());
        pathi.pop();
      }

      if (indentation.bullet != '') {
        var rangeBullet = {
          start: { line: i, ch: indentation.indent },
          end: { line: i, ch: (indentation.bulletAsSpace).length }
        };
        path.push(prouf.tac.bullet(rangeBullet, indentation.bullet)); // line = i
        pathi.push(indentation);
        var indentation2 = {
          indent: indentation.spaces,
          bullet: '',
          root: false,
          bulletAsSpace: '',
          bulletSpaceAfter: '',
          spaces: indentation.spaces,
          unshelved: indentation.unshelved, // TODO
          line: indentation.line,
          children: []
        }
        var range = {
          start: { line: i, ch: indentation.spaces.length },
          end: { line: i, ch: text.length }
        };
        path.push(prouf.tac.line(range, indentation2.indent, text.substring(indentation2.spaces.length))); // line = i
        pathi.push(indentation2);
      } else {
        var range = {
          start: { line: i, ch: indentation.spaces.length },
          end: { line: i, ch: text.length }
        }
        path.push(prouf.tac.line(range, indentation.indent, text.substring(indentation.spaces.length))); // todo: trim/rm bullet from getLine(i)
        pathi.push(indentation);
      }
    }
    // collapse the last open branch of the tree
    while(path.length > 1) {
      path[path.length-2].children.push(path.pop());
    }
    return path[0];
  };
  /*var cmdoc = coq.provider.currentFocus.editor.getDoc();
  var getLine = l => cmdoc.getLine(l)
  prouf.getBulletTree(getLine, 5, 19)*/

  // returns "replacement" but with indentation && line locations to match those of "old"
  prouf.mergeBulletSubtrees = function(old, replacement) {
    // handle the root node

    // -> check same # of children
    if (old.children.length != replacement.children.length) {
      if (replacement.bullet && replacement.children.length == 0) {
        // don't cancel using this quick heuristic to detect placeholders.
        //  `-> TODO: insertTactic should really take a tree instead + have a "placeholder" marker
        true;
      } else {
        return { unmerged: { msg: 'different # of children', old: old, replacement: replacement } };
      }
    }

    // -> check same bullet (could also remap bullets but that would mean a deep rewrite)
    if (old.bullet != replacement.bullet) { return { unmerged: { msg: 'different bullet', old: old, replacement: replacement } }; }

    // -> update indentation in "replacement"
    replacement.origLine = replacement.line;
    replacement.line = old.line;
    replacement.indent = old.indent;

    // for loop / map to handle any children of <replacement>
    for (var i = 0; i < replacement.children.length; i++) {
      var updated = prouf.mergeBulletSubtrees(old.children[i], replacement.children[i]);
      if (updated.unmerged) {
        return updated.unmerged;
      } else {
        replacement.children[i] = updated;
      }
    }
    
    return replacement;
  }

  _.insertTacticCallback = null;
  _.insertTacticHandler = function(msg) {
    if (_.insertTacticCallback) {
      if (_.insertTacticCallback(msg) || msg.data[0] == 'Feedback' && msg.data[1].contents && msg.data[1].contents == 'Complete') {
        _.insertTacticCallback = null;
      }
    }
  };

  _.nextBulletType = function(b) {
    var i = prouf.bulletTypes.indexOf(b);
    if (i >= prouf.bulletTypes.length - 1) { return '(* bullets too deep *)'; }
    if (i == -1) { return '(* unknown bullet type: ' + b + ' *)'; }
    return prouf.bulletTypes[i+1];
  };

  // ##########################################################################################################################
  _.TODOTODOreplaceWithWidget = function() {
    var m = null;
    var w = $('<span style="border: thin solid red">repl</span>');
    w.on('click', function(ev) { console.log('muahaha'); m.clear() });
    m = cmdoc.markText({line:17, ch:2}, {line:17, ch:14}, {replacedWith:e[0]})
    m.on('clear', function(ev) { console.log('cleared', ev); });


    var m = null;
    e = $('<span style="margin-left: 2ex; border: thin solid red">×</span>');
    e.click(function(ev) { console.log('muahaha'); m.clear() });
    m = cmdoc.setBookmark({line:17, ch:14}, {widget:e[0]});
  };
  // ##########################################################################################################################

  // Module Diff: semantic diff AST for tactics & vernacular
  _.diff = {
    IndentRelativeTo: {
      'vernac': 'vernac',
      'ltac': 'ltac',
    },
    concat: (...children) => ({
      type: 'concat',
      children: children.flat(Infinity).map(c => c.type != 'concat' ? c : c.children ).flat().filter(c => c.type != 'empty')
    }),

    // possible AST cases:
    empty: () => ({type: 'empty' }),
    bullet: (relativeType, ...children) => ({ type: 'bullet', relativeType: relativeType, children: _.diff.concat(children).children }),
    placeholder: () => ({ type: 'placeholder' }),
    line: (relativeIndent, indentRelativeTo, heading, ...children) => ({
      type: 'line',
      relativeIndent: relativeIndent,
      indentRelativeTo: indentRelativeTo,
      heading: typeof heading == 'string' || heading instanceof String
              ? [prouf.diff.lineElement.text(heading)]
              : heading.filter(elt => elt.type != 'empty'),
      children: _.diff.concat(children).children }),
    // heading sub-case:
    lineElement: {
      text: (text) => ({ type: 'text', text: text }),
      cursor: () => ({ type: 'cursor' }), // instruction to place cursor at this point
      // button: $(...),
      // empty: () => ({type: 'empty' }),
    }
  }

  // Module tac: AST for tactics & vernacular
  _.tac = {
    // possible AST cases:
    bullet: (range, bulletType) => ({ range: range, type: 'bullet', bulletType: bulletType, children: [] }),
    line: (range, indent, heading) => ({ range: range, type: 'line', indent: indent, heading: typeof heading == 'string' || heading instanceof String ? [prouf.tac.lineElement.text(heading)] : heading, children: [] }),
    lineElement: {
      text: (text) => ({ type: 'text', text: text }),
      cursor: () => { type: 'cursor' }, // instruction to place cursor at this point, not allowed in the input?
    }
  }

  _.align_headings = function(e_heading, t_heading) {
    // e_heading must not contain empty text like { type: 'text', text: '' }
    // t_heading must not contain empty text like { type: 'text', text: '' }
    e_heading = e_heading.filter(x => x.type != 'text' || x.text != '');
    t_heading = t_heading.filter(x => x.type != 'text' || x.text != '');


    // exis[i].heading == [ "str", CURSOR, "str", "abc", ... ]
    // tacs[j].heading == [ "strst", CURSOR, "rabc", ...]
    //
    // Algorithm to align so that the heading elements have mathcing lengths:
    //
    //  expected result: e_aligned = ["str", CURSOR, "st", "r", "abc", ...]
    //                   t_aligned = ["str", "st", CURSOR, "r", "abc", ...]
    //
    // estart = 0
    // tstart = 0
    // ii = 0
    // jj = 0
    // while ...:
    //   if exis[i].heading[ii].type != 'text':
    //     ii++
    //   else if tacs[j].heading[jj].type != 'text':
    //     jj++
    //   else:
    //     var e = exis[i].heading[ii].substr(estart)
    //     var t = tacs[j].heading[jj].substr(tstart)
    //     if e.text.length == t.text.length:
    //       push(e); push(t)
    //       estart = 0; tstart = 0;
    //     else if (e.text.length < t.text.length)
    //       len = ...
    //       push(e); push({text: t.substr(0, len)})
    //       estart = 0; tstart += len
    //     else // e.text.length > t.text.length
    //       push({text: e.substr(...)}); push(t)
    //       estart += len; tstart = 0;
    var estart = 0;
    var tstart = 0;
    var ii = 0;
    var jj = 0;
    var e_aligned = [];
    var t_aligned = [];
    while (ii < e_heading.length && jj < t_heading.length) {
      if (e_heading[ii].type != 'text') {
        e_aligned.push(e_heading[ii++]);
      } else if (t_heading[jj].type != 'text') {
        t_aligned.push(t_heading[jj++]);
      } else {
        var e = e_heading[ii].text.substring(estart);
        var t = t_heading[jj].text.substring(tstart);
        if (e.length == t.length) {
          e_aligned.push({ type: 'text', text: e }); ii++; estart = 0;
          t_aligned.push({ type: 'text', text: t }); jj++; tstart = 0;
        } else if (e.length < t.length) {
          e_aligned.push({ type: 'text', text: e }); ii++; estart = 0;
          t_aligned.push({ type: 'text', text: t.substring(0, e.length) }); tstart += e.length;
          // invariant: tstart < t_heading[jj].text.length
        } else { // e.length > t.length
          e_aligned.push({ type: 'text', text: e.substring(0, t.length) }); estart += t.length;
          t_aligned.push({ type: 'text', text: t }); jj++; tstart = 0;
          // invariant: estart < e_heading[ii].text.length
        }
      }
    }
    if (ii < e_heading.length && e_heading[ii].type == 'text') {
      e_aligned.push({ type: 'text', text: e_heading[ii].text.substring(estart) });
      ii++;
    }
    if (jj < t_heading.length && t_heading[jj].type == 'text') {
      t_aligned.push({ type: 'text', text: t_heading[jj].text.substring(tstart) });
      jj++;
    }
    while (ii < e_heading.length) { e_aligned.push(e_heading[ii++]); }
    while (jj < t_heading.length) { t_aligned.push(t_heading[jj++]); }

    return { e_aligned: e_aligned, t_aligned: t_aligned };
  };

  _.test_align_headings = function() {
    var e_heading = [ {type: 'text', text: "str" }, { type: 'cursor' }, {type: 'text', text: "STR" }, {type: 'text', text: "abc" }, {type: 'text', text: "def" } ];
    var t_heading = [ {type: 'text', text: "strST" }, { type: 'cursor' }, {type: 'text', text: "Rabc" }, {type: 'text', text: "d" } ];
    console.log(_.align_headings(e_heading, t_heading));
  };

  _.spaces = function(n) {
    var str = '';
    for (var i = 0; i < n; i++) { str += ' '; }
    return str;
  };

  _.insertTacTree = function(tacs, recursion) {
    var tacs = _.diff.concat(tacs).children;
    var cmdoc = coq.provider.currentFocus.editor.getDoc();
    var pos_orig = coq.doc.sentences.last().end;
    var addedNewLine = false;
    if (cmdoc.getLine(pos_orig.line).trim() == '') {
      // we're on an empty line, let's write here.
    } else {
      // we'll write on the next line
      pos_orig.line++; pos_orig.ch=0;
      if (cmdoc.getLine(pos_orig.line).trim() != '') {
        // push the existing content down one line
        addedNewLine = true;
      }
    }

    // TODO: get the entire tree for the code block; as we may need to insert tactics that de-indent.
    var existingBulletSubtree = prouf.getBulletTree(l => cmdoc.getLine(l), pos_orig.line, cmdoc.lineCount() - pos_orig.line);
    console.log('INSERTTACTREE', tacs, existingBulletSubtree);

    var todos = [];
    var pos = existingBulletSubtree.children[0].range.start;
    var printpos = (pos) =>
      JSON.stringify(pos) + '"'+cmdoc.getLine(pos.line).substring(0, pos.ch)+'|'+cmdoc.getLine(pos.line).substring(pos.ch);
    
    var todoBookmark =
      (h, pos) =>
        () => h.data('prouf-bookmark',
          cmdoc.setBookmark(pos, {insertLeft: pos.ch == cmdoc.getLine(pos.line).length, widget:h[0]}));
    
    var todoSetCursor =
      (pos) =>
        () => cmdoc.setCursor(pos);

    var recur = function(exis, tacs, state) {
      for (var i = 0, j = 0; j < tacs.length; i++, j++) {
        if (tacs[j].type == 'placeholder') {
          if (j != tacs.length - 1) { throw 'placeholder can only appear as the last child (for now)'; }
          // done with the children of this node, everything else falls inside the placeholder
          // TODO: COUNT THE NUMBER OF SKIPPED LINES? Or maybe the exis AST should have line numbers.
          return;
        } else if (tacs[j].type == 'empty') {
          console.warn('"empty" in semantic diff AST, should not happen. Skipping.');
        } else if (tacs[j].type == 'bullet') {
          // TODO: todos.push(...)
          if (exis[i].type != 'bullet') {
            throw { patchFailed: 'no bullet vs. bullet', a: exis[i], b: tacs[j] };
          } else {
            pos = exis[i].range.end;
            var newState = {
              bullet: state.bullet + tacs[j].relativeType,
              indentLtac: state.indentLtac + prouf.bulletTypes[state.bullet].length, // TODO
              indentVernac: state.indentVernac
            }
            recur(exis[i].children, tacs[j].children, newState);
          }
        } else if (tacs[j].type == 'line') {
          todos.push([
            'doc.findMarks(from, to ' + JSON.stringify(exis[i].range) + '"'+cmdoc.getRange(exis[i].range.start, exis[i].range.end)+'"' + ') → array<TextMarker> → clear all our marks',
            ((exis, i) =>
              () => console.log(exis, i) || cmdoc.findMarks(exis[i].range.start, { line: exis[i].range.end.line+1, ch:0 }).forEach((mark) => {
                console.log(mark);
                if (mark.className && mark.className.startsWith('prouf-')) { mark.clear(); }
                if (mark.replacedWith && $(mark.replacedWith).data('prouf-bookmark')) { $(mark.replacedWith).remove() && mark.clear(); }
              })
            )(exis, i)
          ])
          if (exis[i].type != 'line') {
            throw { patchFailed: 'no line vs. line', a: exis[i], b: tacs[j] };
          } else {
            pos = exis[i].range.start;
            var { e_aligned, t_aligned } = _.align_headings(exis[i].heading, tacs[j].heading);
            var ii = 0;
            var jj = 0;
            while (jj < t_aligned.length) {
              if (t_aligned[jj].type == 'text') {
                while (ii < e_aligned.length && e_aligned[ii].type != 'text') {
                  ii++; // skip over non-text content
                }
                if (ii >= e_aligned.length) { throw { patchFailed: 'text vs end of line', a: e_aligned[ii], b: t_aligned[jj] }; }
                // at this point, ii.type == 'text' (or exception would've been thrown)
                if (e_aligned[ii].text != t_aligned[jj].text) {
                  throw { patchFailed: 'different texts', a: e_aligned[ii].text, b: t_aligned[jj].text };
                }
                pos = { line: pos.line, ch: pos.ch + e_aligned[ii].text.length };
                ii++;
              } else if (t_aligned[jj].type == 'cursor') {
                todos.push([
                  'set cursor position to ' + printpos(pos) +'"',
                  todoSetCursor(pos)
                ]);
              } else if (t_aligned[jj] instanceof $) {
                todos.push([
                  'insert the button ' + t_aligned[jj] + ' at ' + printpos(pos)+'"',
                  todoBookmark(t_aligned[jj], pos)
                ]);
              } else {
                debugger;
                throw "unknown diff AST case";
              }
              jj++;
            }

            var newState = {
              bullet: state.bullet,
              indentLtac: state.indentLtac,
              indentVernac: state.indentVernac,
            }
            pos = exis[i].range.end;
            recur(exis[i].children, tacs[j].children, newState);
          }
        } else {
          debugger;
          throw "unknown diff AST case";
        }
      }
    };

    var tryMergeTree = function() {
      try {
        recur(existingBulletSubtree.children, tacs, {
          bullet: 0,
          indentLtac: 0,
          indentVernac: 0,
        });
        return true;
      } catch (e) {
        if (e.patchFailed) {
          console.log(e);
          return false;
        } else {
          throw e;
        }
      }
    };

    var posNew = { line: pos_orig.line, ch: pos_orig.ch };
    var recurNew = function(tacs, state) {
      for (var i = 0, j = 0; j < tacs.length; i++, j++) {
        if (tacs[j].type == 'placeholder') {
          // nothing to do.
        } else if (tacs[j].type == 'empty') {
          console.warn('"empty" in semantic diff AST, should not happen. Skipping.');
        } else if (tacs[j].type == 'bullet') {
          var newBullet = state.bullet + tacs[j].relativeType;
          var txt = state.indentLtac + prouf.bulletTypes[newBullet] + ' ';
          cmdoc.replaceRange(txt, posNew);
          posNew.ch += txt.length;
          var newState = {
            bullet: newBullet,
            indentLtac: state.indentLtac + prouf.bulletTypes[newBullet].length, // TODO
            indentVernac: state.indentVernac
          }
          recurNew(tacs[j].children, newState);
        } else if (tacs[j].type == 'line') {
          for (var jj = 0; jj < tacs[j].heading.length; jj++) {
            var h = tacs[j].heading[jj];
            if (h.type == 'text') {
              cmdoc.replaceRange(h.text, posNew);
              posNew.ch += h.text.length;
            } else if (h.type == 'cursor') {
              todoSetCursor(posNew)();
            } else if (h instanceof $) {
              todoBookmark(h, posNew)();
            } else {
              debugger;
              throw "unknown diff AST case";
            }
          }
          cmdoc.replaceRange('\n', posNew);
          posNew.line++;
          posNew.ch = 0;
          var newState = {
            bullet: state.bullet,
            indentLtac: state.indentLtac,
            indentVernac: state.indentVernac,
          }
          recurNew(tacs[j].children, newState);
        }
      }
    };

    var newTree = function() {
      recurNew(tacs, {
        bullet: 0, // TODO
        indentLtac: 0,
        indentVernac: 0,
      });
    };
    
    if (tryMergeTree()) {
      cmdoc.getEditor().operation(() => todos.reverse().forEach(x => x[1]()));
    } else {
      cmdoc.getEditor().operation(() => newTree());
    }
    coq.goCursor();
  };

  _.insertTactic = function(tacs, recursion) {
    var cmdoc = coq.provider.currentFocus.editor.getDoc();
    //var orig_c = cmdoc.getCursor();
    var orig_c = coq.doc.sentences.last().end;
    var c = { line: orig_c.line, ch: orig_c.ch, sticky: orig_c.sticky };
    var addedNewLine = false;
    if (cmdoc.getLine(c.line).trim() == '') {
      // we're on an empty line, let's write here.
    } else {
      // we'll write on the next line
      orig_c.line++; orig_c.ch=0;
      c.line++; c.ch=0;
      if (cmdoc.getLine(c.line).trim() != '') {
        // push the existing content down one line
        addedNewLine = true;
      }
    }
    
    var indentation = _.getIndentation(cmdoc, c.line, true);
    if (tacs instanceof Function) {
      tacs = tacs(indentation);
    }
    if (typeof tacs == 'string' || tacs instanceof String) {
      tacs = [indentation.spaces + tacs.replaceAll('\n', '\n' + indentation.spaces)];
    }

    var text = tacs.filter(t => typeof t == 'string' || t instanceof String).join('');

    var replacementLines = text.split('\n');
    var existingBulletSubtree = prouf.getBulletTree_old(l => cmdoc.getLine(l), c.line, cmdoc.lineCount()).children[0];
    var newBulletForest = prouf.getBulletTree_old(l => replacementLines[l], 0, replacementLines.length); // TODO: add a root node? or just iterate the forest?
    console.log(existingBulletSubtree, newBulletForest);
    // prouf.debugBulletTree(cmdoc, existingBulletSubtree)
    if (existingBulletSubtree) {
      var mergedBulletSubtree = prouf.mergeBulletSubtrees(existingBulletSubtree, newBulletForest.children[0]);  // TODO: iterate the forest

      var pos_text = 0;
      var taci = 0;
      var c_middle = null;//
      var pos = { line: c.line, ch: c.ch };//
      var recur = function(t) {
        // insert this node
        console.log('_______', pos_text, t.origLine, replacementLines[t.origLine], tacs)
        var new_pos_text = pos_text + replacementLines[t.origLine].length;
        pos = { line: t.line, ch: 0 }; // TODO: this is very brittle
        while (taci < tacs.length && pos_text <= new_pos_text) { // todo: extra loops when at the end
          if (typeof tacs[taci] == 'string' || tacs[taci] instanceof String) {
            pos_text += tacs[taci].length; // TODO: this is brittle
            var lines = tacs[taci].split('\n');
            pos = {
              line: pos.line + lines.length - 1,
              ch:   (lines.length > 1 ? 0 : pos.ch) + lines[lines.length-1].length
            }
            console.log('_______->', pos_text, taci, tacs[taci], pos);
          } else {
            if (tacs[taci] instanceof $) {
              //todo[todo.length] = ((i, pos) => () => )(i, pos);
              tacs[taci].data('prouf-bookmark', cmdoc.setBookmark(pos, {widget:tacs[taci][0]}));
            } else if (tacs[taci].type == 'cursor') {
              c_middle = pos;
            }

            console.log('_______!', pos_text, taci, tacs[taci]);
          }
          taci++;
        }

        // insert its children
        for (var i = 0; i < t.children.length; i++) { recur(t.children[i]); }
      }
      recur(mergedBulletSubtree);
      if (c_middle === null) { c_middle = pos; }//
      c_end = pos;//

      console.log(mergedBulletSubtree);
      prouf.debugBulletTree(cmdoc, mergedBulletSubtree);
      console.log('used existing (TODO: merge subtrees):', text);
    } else {
      cmdoc.replaceRange(text + (addedNewLine?'\n':''), c);
      console.log('inserted:', text);
    }
    // TODO!!!!!!!!!!!! DO THIS ON THE TREE, not on lines (the numbers will _not_ match)
    //for (var i = 0; i < todo.length; i++) { todo[i](); }

    //var lines = tac.split('\n');
    //var c_middle = { line: c.line + lines.length - 1, ch: c.ch + lines[lines.length-1].length };
    //var allLines = (tac + after).split('\n');
    //var c_end = {line: c.line + allLines.length - 1, ch: c.ch + allLines[allLines.length-1].length};
    cmdoc.setCursor(c_middle);
    coq.goCursor();
    // TODO: check that there aren't any shelved goals etc.
    if (!recursion) {
      _.insertTacticCallback = _.theInsertTacticCallback({
        doc: cmdoc,
        c_start: orig_c,
        text: text,
        c_middle: c_middle,
        c_end: c_end,
        addedNewLine: addedNewLine
      });
    }
  };

  _.undoInsertTactic = function(inserted, errtext, errelt) {
    var c_end = { line: inserted.c_end.line, ch: inserted.c_end.ch + inserted.text.length + 3 /* for the '(* ' inserted */ };
    inserted.doc.replaceRange('(* ', inserted.c_start);
    inserted.doc.replaceRange(' *)', c_end);
    var msg = $('<div class="insertTacticFailed"></div>');
    msg.append(errelt.clone());
    var msgwidget = inserted.doc.getEditor().addLineWidget(inserted.c_end.line, msg[0], {coverGutter: false, noHScroll: false});
    var bookmark = null;
    var rm = $('<button class="in-code-button in-code-button-remove">× remove</button>');
    rm.on('click', function(ev) {
      msgwidget.clear();
      // TODO: use $(ev.target).data('prouf-bookmark'), but make sure the target can't be a descendent
      bookmark.clear();
      var c_rm_end = {line:c_end.line, ch:c_end.ch+3};
      // check that we're removing what we think we're removing!
      console.log('<'+'(* ' + inserted.text + ' *)'+'>');
      console.log('<'+inserted.doc.getRange(inserted.c_start, c_end)+'>');
      if ('(* ' + inserted.text + ' *)' == inserted.doc.getRange(inserted.c_start, c_end)) {
        if (inserted.addedNewLine) {
          c_rm_end.line++;
          c_rm_end.ch = 0;
        }
        inserted.doc.replaceRange('', inserted.c_start, c_rm_end);
        inserted.doc.setCursor(inserted.c_start);
        coq.goCursor();
        // Quick & dirty hack around the problems with jsCoq cancelling the last sentence when the cursor is exactly on it
        // + not updating the sentence's end position even if the comments after it have changed.
        // Should patch coq.goCursor instead of this hack.
        //coq.goPrev();
        //coq.goCursor();
      }
    });
    //inserted.doc.getEditor().addWidget({line:c_end.line, ch:c_end.ch+3}, rm[0], true);
    bookmark = inserted.doc.setBookmark({line:c_end.line, ch:c_end.ch+3}, {widget:rm[0]})
    rm.data('prouf-bookmark', bookmark);

    inserted.doc.setCursor(c_end);
    coq.goCursor();
  }

  _.closeUnshelved = function() {
    var last = coq.doc.sentences.last();
    var cmdoc = last.sp.editor;
    var bulletTree = _.getBulletPath(cmdoc, last.end.line+1);
    if (bulletTree[0].unshelved && cmdoc.getLine(last.end.line+1) == '}') {
      cmdoc.setCursor({line: last.end.line+1, ch:1});
      coq.goCursor();
      return true;
    } else {
      // TODO: add the closing '}' if missing.
      return false;
    }
  };

  _.theInsertTacticCallback = function(inserted) {
    var trackingError = null;

    return function(msg) {
      console.log('===========================================', msg)
      if (trackingError) {
        var e = $('#query-panel .Error[data-coq-sid="' + trackingError + '"]');
        if (e.length == 1) {
          var errmsg = $('#query-panel .Error[data-coq-sid="' + trackingError + '"]');
          console.log(errmsg);
          _.undoInsertTactic(inserted, errmsg.text(), errmsg);
          return true;
        } else if (msg.data[0] == 'Feedback' && msg.data[1].contents && msg.data[1].contents == 'Processed') {
          _.undoInsertTactic(inserted);
          return true;
        }
      }
      if ($("#goal-text").find(".no-goals").length == 1) {
        if ($("#goal-text").find(".no-goals").text() == 'No more goals.') {
          _.closeUnshelved();
          _.insertTacTree(_.diff.line(0, _.diff.IndentRelativeTo.vernac, 'Qed.'), true);
        } else if ($("#goal-text").find(".no-goals").text() == 'All the remaining goals are on the shelf.') {
          var goalInfo = globalLastGoalInfo;
          console.log('SHELF:', 'All the remaining goals are on the shelf.', goalInfo);
          if (goalInfo && goalInfo.data && goalInfo.data[2]) {
            if (_.closeUnshelved()) {
              return false;
            } else {
              var shelfNamed = goalInfo.data[2].shelf.map(s => s.info.name[0] == 'Id' ? s.info.name[1] : null).filter(s => s !== null);
              if (shelfNamed.length > 0) {
                _.insertTacTree(shelfNamed.map((name, idx) =>
                  _.diff.concat(
                    _.diff.line(0, [
                      _.diff.lineElement.text('vernac', '[' + name + ']:{'),
                      (idx == 0) ? _.diff.lineElement.cursor() : _.diff.empty()
                    ]),
                    _.diff.line(0, 'vernac', '}')
                  )
                ).flat());
              }
            }
          }
        } else if ($("#goal-text").find(".no-goals + .aside").length == 1) {
          var bullet = $("#goal-text").find(".no-goals + .aside").text().match(/Focus next goal with bullet (.*)\./)[1]
          console.log('next bullet:', bullet);
          
          // TODO: skip the next empty lines if any.
          var last = coq.doc.sentences.last();
          var cmdoc = last.sp.editor;
          var nextline = cmdoc.doc.getLine(last.end.line+1);
          if (nextline.trim()[0] == bullet) {
            // proceed with the already-present line
            cmdoc.setCursor({line: last.end.line+1, ch: nextline.length });
            coq.goCursor();
          } else {
            var indentation = '';
            var originator = '';
            var bt = _.getBulletPath(cmdoc, last.end.line+1);
            for (var i = 0; i < bt.length; i++) {
              if (bt[i].bullet == bullet) {
                indentation = bt[i].indent;
                if (bt[i].originator) {
                  originator = '(* ' +  bt[i].originator.cmdoc.getLine(bt[i].originator.line) + ' *)';
                }
                break;
              }
            }
            _.insertTacTree(_.diff.bullet(bullet, _.diff.line(0, _.diff.IndentRelativeTo.ltac, originator)), true);
          }
        }
        return true; // stop tracking this execution.
      } else if (msg.data[0] == 'CoqExn') {
        trackingError = msg.data[2][1];
        return false; // need to wait for the next "processed" for the message to be formatted
      }
    }
  };

  _.quick_and_dirty_parse_answer = function(msg) {
    var res = [];
    var f = function(m) {
      if (m[0] == 'Pp_glue') {
        for (i in m[1]) { f(m[1][i]); }
      } else if (m[0] == 'Pp_force_newline' || m[0] == 'Pp_print_break') {
        return;
      } else if (m[0] == 'Pp_tag') {
        f(m[2]);
      } else if (m[0] == 'Pp_box') {
        f(m[2]);
      } else if (m[0] == 'Pp_string') {
        res[res.length] = m[1].trim();
      } else {
        console.log('my.js: unknown token in vernac response', m);
      }
    };
    f(msg);
    return res;
  };

  _.queryVernac = async function(q) {
    var answers = await coq.coq.queryPromise(0, ['Vernac', q]);
    return answers.map(a => _.quick_and_dirty_parse_answer(a.msg));
  };

  _.queryVernac1 = async function(q) { var res = await _.queryVernac(q); return res[0]; };

  _.button = function(name, text, f) { return { name:name, text:text, f:f }; }

  _.floating_toolbar = function(target) {
    var bar = $('<div/>');
    bar.addClass('floating-toolbar');

    // Note: this could attempt to remove the toolbar
    var rmOnClickBackground = function(ev) { $(this).off(ev); bar.remove(); return true; };
    $('#goal-text').on('click', rmOnClickBackground);

    var close = $('<span/>');
    close
      .addClass('floating-toolbar-button prouf-button-close')
      .text('×')
      .on('click', function(ev) {
        ev.stopPropagation();
        bar.remove();
        $('#goal-text').off('click', rmOnClickBackground);
        return false;
      });
    bar.append(close);

    bar.appendTo(target.parent());
    bar.show();

    bar.addButton = function(name, text, f) {
      var button = $('<button/>');
      button
        .addClass('floating-toolbar-button prouf-button-'+name)
        .text(text)
        .on('click', function(ev) {
          ev.stopPropagation();
          bar.remove();
          $('#goal-text').off('click', rmOnClickBackground);
          f();
          return false;
        })
        .insertBefore(close)
      this.position({ my: "center bottom", at: "center top+0.5ex", of: target, collision: "flipfit", within: $('#goal-text') });
    };

    for (var i = 1; i < arguments.length; i++) {
      bar.addButton(arguments[i].name, arguments[i].text, arguments[i].f);
    }

    _.recomputeCurrentAction();

    return bar;
  }

  _.my_init_hover_actions = function() {
    // $(".coq-env hr + * .constr\\.reference, .coq-env hr + * .constr\\.type, .coq-env hr + * .constr\\.variable, .coq-env hr + * .constr\\.notation").hide()
    $("#goal-text").on('click', ".coq-env hr + .constr\\.variable, .coq-env hr + * .constr\\.variable", function (ev) {
      var target = $(ev.target);
      var target_text = target.text();

      var bar = _.floating_toolbar(target,
        _.button('unfold', 'unfold', function() {
          _.insertTacTree(_.diff.line(0, _.diff.IndentRelativeTo.ltac, 'unfold ' + target_text + '.'));
        }),
        _.button('case_eq', 'case_eq', async function() {
          var constructors = [];
          var res = await _.queryVernac1('Check ' + target_text + ' .');
          if (res[1] == ':' && res.length == 3) {
            var type = res[2];
            //var res2 = await _.queryVernac('Check ltac:(let x := fresh "inspect" in intro x; case_eq x; intros; exact I) : forall x : ' + type + ', True.');
            var constructors = await _.queryVernac(
              'try(' +
              '  cut ((' + type + ') -> True); cycle 1;'+
              '  [' +
              '    let x := fresh "inspect" in intro x; case_eq x;' +
              '    repeat(' +
              '      match goal with' +
              '      |- _ -> _ -> _ => intro' +
              '      end' +
              '    );' +
              '    match goal with' +
              '    |- ?inspect = ?T -> True => idtac T' +
              '    end;' +
              '    intro; exact I' +
              '  |' +
              '    fail' +
              '  ]' +
              ').');
            constructors = constructors.map(c => c.join(' '));
            constructors = constructors.map(c => (c[0] == '(' && c[c.length-1] == ')') ? c.substring(1, c.length-1).trim() : c);
            _.insertTacTree(
              _.diff.line(0, _.diff.IndentRelativeTo.ltac, 'case_eq ' + target_text + '.',
                constructors.map((c, i) =>
                  _.diff.bullet(+1,
                    _.diff.line(0, _.diff.IndentRelativeTo.ltac, [
                      _.diff.lineElement.text('when ' + c.trim() + ' as H' + target_text.trim() + '.'),
                      $('<button class="in-code-button do-later"/>')
                        .text('do later')
                        .one('click', ev => {
                          // TODO: use $(ev.target).data('prouf-bookmark'), but make sure the target can't be a descendent
                          $(ev.target).data('prouf-bookmark').clear();
                          _.insertTacTree(_.diff.line(0, _.diff.IndentRelativeTo.ltac, 'subproof ' + c.trim().split(' ')[0].toLocaleLowerCase() + '.'));
                        }),
                      i == 0 ? _.diff.lineElement.cursor() : _.diff.empty()
                    ]),
                    _.diff.placeholder()))));
          }
        }));
    });
    $("#goal-text").on('click', ".coq-env hr + .constr\\.notation, .coq-env hr + * .constr\\.notation", function (ev) {
      var target = $(ev.target)
      var target_text = target.text();
      console.log('target:', target_text);
      if (target_text == '=') {
        var bar = _.floating_toolbar(target,
          _.button('reflexivity', 'reflexivity', function() { _.insertTactic('reflexivity.'); }));
      } else if (target_text == '→') {
        var bar = _.floating_toolbar(target,
          _.button('intro', 'intro', function() {
            _.queryVernac1('try (intro; match goal with X: _ |- _ => idtac X end; fail).').then(function(id) {
              _.insertTactic('intro ' + id + '.');
            })
          }));
      } else if (target_text == '∀') {
        var bar = _.floating_toolbar(target,
          _.button('intro', 'intro', function() {
            _.queryVernac1('try (intro; match goal with X: _ |- _ => idtac X end; fail).').then(function(id) {
              _.insertTactic('intro ' + id + '.');
            })
          }));
      }
    });
  };

  // 'uninitialized', 'waitingjsCoqLoaded', 'waitingJsCoqReady'
  // multiple status could in principle co-exist, this is mostly for display purposes.
  _.currentTask = 'uninitialized';
  _.startTask = function(currentTask) {
    
  }

  _.darkmode_on = function() {
    $('.jscoq-theme-light').removeClass('jscoq-theme-light').addClass('jscoq-theme-dark');
    $('.cm-s-default').removeClass('cm-s-default').addClass('cm-s-blackboard');
    CodeMirror.defaults.theme = 'blackboard';
    $('html').removeClass('light').addClass('dark');
  }

  _.darkmode_off = function() {
    $('.jscoq-theme-dark').removeClass('jscoq-theme-dark').addClass('jscoq-theme-light');
    $('.cm-s-blackboard').removeClass('cm-s-blackboard').addClass('cm-s-default');
    CodeMirror.defaults.theme = 'default';
    $('html').removeClass('dark').addClass('light');
  }

  _.init_darkmode = function() {
    if (window.matchMedia) {
      var m = window.matchMedia('(prefers-color-scheme: dark)');
      if (m.matches) { _.darkmode_on(); }
      m.addEventListener('change', ev => ev.matches ? _.darkmode_on() : _.darkmode_off());
    }
  }

  _.initialized = new _.Deferred();
  _.init = async function() {
    if (_.initialized.isResolved) { return; }

    // Wait for jsCoq to be loaded and save the instance
    var {coq:jsCoqInstance, $:jQuery} = await waitJsCoqLoaded;
    coq = jsCoqInstance;
    $ = _.extendJQuery(jQuery);
    
    _.init_darkmode();
    _.my_init();

    await _.waitJsCoqReady;
    _.my_init2()
    _.my_init_hover_actions();

    var line = parseInt(window.location.hash.substring(1)) || 94;
    var cm = coq.provider.snippets.find(cm => {
      var first = cm.editor.options.firstLineNumber;
      return first <= line && first + cm.editor.lastLine() >= line;
    });
    var l = line - cm.editor.options.firstLineNumber;
    cm.editor.setCursor({ line: l, ch: cm.editor.getLine(l).length });
    coq.provider.currentFocus = cm;

    var old_scroll = {y:$('main')[0].scrollTop, x:$('main')[0].scrollLeft}; // cm.editor.focus accidentally scrolls
    cm.editor.focus();
    $('main')[0].scrollTo(old_scroll.x, old_scroll.y);

    cm.editor.scrollIntoView(l);
    window.setTimeout(function() {
      coq.goCursor(); // for some reason this interrupts scrolling, delaying (TODO: not by 1000ms but wait for end of smooth scroll)
    }, 1000);

    $(document.body).on('click', '.CodeMirror-linenumber', function(ev) { window.location.href = '#' + $(ev.target).text(); });

    // TODO: jsCoq handles multiple workers, this isn't reliable
    coq.coq.worker.addEventListener('message', _msg => {
      if (coq.doc.sentences.filter(s => s.phase != Phases.PROCESSED && s.phase != Phases.ERROR).length == 0) {
        //console.log('============================', 'DONE FOR NOW');
        _.recomputeCurrentAction();
      }
    });

    _.advice(coq.layout, 'show', () => window.setTimeout(_.recomputeCurrentAction, 500));

    _.initialized.resolve();
  };

  _.currentCircs = null;
  _.showCirc = function(target, scrollParent) {
    _.currentCircs = (_.currentCircs || $());

    var minRadius = Math.min(30, Math.max(7, Math.sqrt(Math.pow(target.width(), 2) + Math.pow(target.height(), 2))/2));
    var ratio = 10;
    
    target = $(target).first();
    if (target.length > 0) {
      var existing = _.currentCircs.first((i, c) => target.is($(c).data('circTarget')));
      if (existing.length == 1) {
        existing.position({ my: 'center', at: 'center', of: existing.data('circTarget') });
        return existing;
      } else {
        target.filter('.in-code-button, .floating-toolbar-button').addClass('click-me');

        var circ = $('<div/>')
          .addClass('circle-around')
          .width(minRadius * ratio)
          .height(minRadius * ratio)
          .appendTo(scrollParent)
          .data('circTarget', target)
          .position({ my: 'center', at: 'center', of: target });

        target.on('click', function(_ev) { _.removeCircs(); });
        target.on('remove', function(_ev) { _.removeCircs(); });
        if (target.attr('tabindex') == '-1' || ! target.attr('tabindex')) { target.attr('tabindex', 0); } // make focussable
        target.focus();

        _.removeCircs();
        _.currentCircs = _.currentCircs.add(circ);
        console.log('circ_', 'add', _.currentCircs);

        return circ;
      }
    }
  };

  _.removeCircs = function() {
    _.currentCircs = _.currentCircs || $();
    console.log('circ_', 'remove', _.currentCircs);
    _.currentCircs.addClass('circle-around-hidden').delay(1000).q('remove');
    _.currentCircs = $();
  }
  // _.showCirc().delay(1500).q(function() { console.log(this, arguments); }, 'foo', 'bar')
  // _.showCirc().delay(1500).q(_.removeCirc)

  _.getNextSentence = function() {
    var current = coq.doc.sentences.last();
    var next = coq.provider.getNext(current, /*until*/);
    // skip over comments /*and collapsed blocks of code*/
    // TODO: if the document ends with a collapsed block, this will return false :thinking_face:
    while (next && (next.flags.is_comment /*|| next.flags.is_hidden*/)) {
      next = coq.provider.getNext(next, /*until*/);
    }

    if (next) {
      return { type: 'coq', sentence: next };
    } else {
      return { type: 'end', sentence: null };
    }
  }

  prouf.compareInt = (a, b) => (a == b) ? 0 : (a < b ? -1 : 1)
  prouf.comparePos = (a, b) => (a.line == b.line) ? (prouf.compareInt(a.ch, b.ch)) : (prouf.compareInt(a.line, b.line))

  prouf.ltacToActions = [
    { re: /^intros?\s+(\?|[_a-zA-Z][a-zA-Z0-9]*)\s*\.$/,
      actions: _intro => [
        { type: 'clickGoal',
          target: g =>
            g.andFind('.constr\\.notation')
             .first((_i, e) => ['∀', '→'].includes($(e).text().trim())),
          scrollParent: '#overlays' },
        { type: 'button',
          button: 'intro',
          scrollParent: '#overlays' } ] },
    { re: /^case_eq?\s+([_a-zA-Z][a-zA-Z0-9]*)\s*\.$/,
      actions: case_eq => [
        { type: 'clickGoal',
          target: g =>
            g.andFind('.constr\\.variable')
             .first((_i, e) => $(e).text().trim() == case_eq[1]),
          scrollParent: '#overlays' },
        { type: 'button',
          button: 'case_eq',
          scrollParent: '#overlays' } ] },
    { re: /^reflexivity\s*\.$/,
      actions: _reflexivity => [
        { type: 'clickGoal',
          target: g =>
            g.andFind('.constr\\.notation')
             .first((_i, e) => $(e).text().trim() == '='),
          scrollParent: '#overlays' },
        { type: 'button',
          button: 'reflexivity',
          scrollParent: '#overlays' } ] },
    { re: /^subproof?\s+(\?|[_a-zA-Z][a-zA-Z0-9]*)\s*\.$/,
      actions: _subproof => [
        { type: 'clickGoal',
          target: _g =>
            $('.do-later').first((_i, btn) =>
              // button is after the last executed sentence
                 prouf.comparePos($(btn).data('prouf-bookmark').find(), coq.doc.sentences.last().end) >= 0
              // and button is before the next sentence
              && prouf.comparePos($(btn).data('prouf-bookmark').find(), coq.provider.getNext(coq.doc.sentences.last()).start) <= 0),
          scrollParent: 'main > article:first-child' } ] },
    ];

  prouf.doAction = function(action) {
    return new Promise((resolve, reject) => {
      if (action.type == 'clickGoal') {
        var goal = $("#goal-text .coq-env hr + *");
        target = action.target(goal);
      } else if (action.type == 'button') {
        var target = $('.prouf-button-' + action.button).first();
      } else {
        console.error('UNKNOWN ACTION', action);
        resolve(false);
      }

      if (target.length > 0) {
        var c = prouf.showCirc(target, action.scrollParent);
        resolve(true);
      }

      resolve(false);
    });
  };
  
  prouf.sentenceToActions = async function(s) {
    // TODO: this shouldn't actually run the actions, it should only list them.
    if (s.type == 'coq') {
      var txt = s.sentence.text.trim();

      for (var ltac of prouf.ltacToActions) {
        var m = txt.match(ltac.re);
        if (m) {
          var actions = ltac.actions(m);
          for (var i = actions.length -1; i >= 0; i--) {
            var action = actions[i];
            console.log('trying:', m, action)
            if (await prouf.doAction(action)) {
              break;
            }
          }
        }
      }
    }
  };

  _.recomputeCurrentAction = function() {
    prouf.sentenceToActions(prouf.getNextSentence());
  };

  _.test = function() {
    prouf.recomputeCurrentAction();
    //console.log('circ_', 'prouf.test');
    //prouf.sentenceToActions(prouf.getNextSentence());
    //_.removeCirc(c)
  };
  
  return _;
})(waitJsCoqLoaded);

/* await */ prouf.init();