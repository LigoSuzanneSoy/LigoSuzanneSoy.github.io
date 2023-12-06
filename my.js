// my.js

// TODO:
// multiple options when point-and-clicking
// "Run" button under each code block
// Better hidden boilerplate
// sub-proofs in separate blocks

function ___stringToUint8Array(str) {
  var s = String(str);
  var a = [];
  for (var i = 0; i < s.length; i++) {
    a.push(s.charCodeAt(i));
  }
  return new Uint8Array(a);
}

function ___uint8ArrayToString(a) {
  var s = [];
  for (var i = 0; i < a.length; i++) {
    s.push(String.fromCharCode(a[i]));
  }
  return s.join('');
}  
  
function get_file(path, callback) {
  coq.coq.worker.onmessage = function(x) { callback(x.data[1], x.data[2]); }
  coq.coq.sendDirective(['Get', path])
}

function get_file_string(path, callback) {
    get_file(path, function(path, contents) { callback(path, ___uint8ArrayToString(contents)); });
}

var onJsCoqReady = [];
var isJsCoqReady = false;
function waitJsCoqReady(f) {
  if (isJsCoqReady) {
    f();
  } else {
    onJsCoqReady[onJsCoqReady.length] = f;
  }
}
function jsCoqReady() {
  //console.log('isJsCoqReady = true');
  isJsCoqReady = true;
  for (var i = 0; i < onJsCoqReady.length; i++) {
    onJsCoqReady[i]();
  }
  onJsCoqReady=null;
}

function displayProgress(isInProgress) {
  document.body.classList[isInProgress?'add':'remove']('jscoq-waiting')
}

function my_init() {
  (function() {
    var that = coq.layout;
    var f = that.splash;
    that.splash = function(version_info, msg, mode) {
      console.log('mysplash', mode);
      if (mode == 'ready') {
        document.body.classList.remove('waiting');
        displayProgress(false);
        jsCoqReady();
      }
      return f.call(that, version_info, msg, mode);
    }
  })();

  // TODO: use the #fragment instead
  if (location.search !== '?jscoq=off') {
    displayProgress(true);
    coq.layout.onToggle({target: coq.layout, shown: true});
  }
}

var nbSpansInProgress = 0;
var spansInProgress = {};
function coqActivityUIFeedback(msg) {
  if (msg.data && msg.data[0] == 'Feedback' && msg.data[1].contents && msg.data[1].contents == 'Complete') {
    if (typeof msg.data[1].span_id != 'undefined' && spansInProgress.hasOwnProperty(msg.data[1].span_id)) {
      delete spansInProgress[msg.data[1].span_id];
      nbSpansInProgress--;
      //console.log('onmessage_x', 'compltete', msg.data[1].span_id, 'nb='+nbSpansInProgress, document.querySelectorAll('[data-coq-sid="'+msg.data[1].span_id+'"]').length);
      displayProgress(nbSpansInProgress);
    } else {
      //console.log('onmessage_x', 'complete UNKNOWN', msg.data[1].span_id, 'nb='+nbSpansInProgress, document.querySelectorAll('[data-coq-sid="'+msg.data[1].span_id+'"]').length);
      // reset because we lost track of something.
      if (document.querySelectorAll('[data-coq-sid="'+msg.data[1].span_id+'"]').length != 0) {
        nbSpansInProgress = 0
        spansInProgress = {};
      }
      displayProgress(false);
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
      if (spansInProgress.hasOwnProperty(msg.data[1].span_id)) {
        // already tracking
        //console.log('onmessage_x', 'progress', msg.data[1].span_id, 'nb='+nbSpansInProgress);
      } else {
        spansInProgress[msg.data[1].span_id] = true;
        nbSpansInProgress++;
        //console.log('onmessage_x', 'start', msg.data[1].span_id, 'nb='+nbSpansInProgress);
      }
    }
    displayProgress(nbSpansInProgress);
  } else {
    console.warn('unknown onmessage in my.js', msg.data);
  }

  if (msg.data && msg.data[0] == 'GoalInfo' && msg.data[2] && msg.data[2].goals && msg.data[2].goals.length > 0) {
    coq.layout.show();
  }
}

function my_init2() {
  coq.coq.worker.onmessage = function(msg) {
    coqActivityUIFeedback(msg);
    insertTacticHandler(msg);
  };
  /*var that = coq;
  var updateGoals = that.updateGoals;
  coq.updateGoals = function(html) {
    coq.layout.show();
    window.setTimeout(1000, function() { updateGoals.call(that, html); });
  };*/
}

var insertTacticCallback = null;
function insertTacticHandler(msg) {
  if (insertTacticCallback) {
    if (insertTacticCallback(msg) || msg.data[0] == 'Feedback' && msg.data[1].contents && msg.data[1].contents == 'Complete') {
      insertTacticCallback = null;
    }
  }
}

function insertTactic(tac, after, recursion) {
  console.log('inserting:', tac);
  var cmdoc = coq.provider.currentFocus.editor.getDoc();
  //var orig_c = cmdoc.getCursor();
  var orig_c = coq.doc.sentences.last().end;
  var c = { line: orig_c.line, ch: orig_c.ch, sticky: orig_c.sticky };
  if (cmdoc.getLine(c.line).trim() == '') {
    // we're on an empty line, let's write here.
  } else {
    // we'll write on the next line
    orig_c.line++; orig_c.ch=0;
    c.line++; c.ch=0;
    if (cmdoc.getLine(c.line).trim() != '') {
      // push the existing content down one line
      cmdoc.replaceRange('\n', c);
    }
  }
  
  cmdoc.replaceRange(tac + (typeof after == 'undefined' ? '' : after), c);
  var lines = tac.split('\n');
  c.line += lines.length - 1;
  c.ch = lines[lines.length-1].length;
  cmdoc.setCursor(c);
  coq.goCursor();
  // TODO: check that there aren't any shelved goals etc.
  if (!recursion) {
    insertTacticCallback = theInsertTacticCallback({ doc: cmdoc, orig_c: orig_c, tac: tac, c: c, startWithNewLine: '' /* TODO: fix this mess */ });
  }
}

function undoInsertTactic(inserted, errtext, errelt) {
  var c_start = {
    line: inserted.orig_c.line,
    ch: inserted.orig_c.ch,
    sticky: false,
  };
  if (inserted.startWithNewLine) {
    c_start.line++;
    c_start.ch = 0;
  }
  var c_end = { line: c_start.line, ch: c_start.ch + inserted.tac.length + 3 /* for the '(* ' inserted */ };
  console.log(inserted, c_start, c_end);
  inserted.doc.replaceRange('(* ', c_start);
  inserted.doc.replaceRange(' *)', c_end);
  var msg = $('<div class="insertTacticFailed"></div>');
  msg.append(errelt.clone());
  var msgwidget = inserted.doc.getEditor().addLineWidget(c_start.line, msg[0], {coverGutter: false, noHScroll: false});
  var rm = $('<span style="border: thin solid red; border-radius: 1ex; padding: 0 0.35ex; background: pink; z-index:1000; transform: translate(1ex, -100%)">×</span>');
  rm.on('click', function() {
    inserted.doc.replaceRange('', c_start, {line:c_end.line, ch:c_end.ch+3});
    msgwidget.clear();
    rm.remove();
    inserted.doc.setCursor(c_start);
    coq.goCursor();
  });
  inserted.doc.getEditor().addWidget({line:c_end.line, ch:c_end.ch+3}, rm[0], true);
  inserted.doc.setCursor({ line: c_end.line+1, ch: 0, sticky: false });
  coq.goCursor();
}

function theInsertTacticCallback(inserted) {
  var trackingError = null;

  return function(msg) {
    if (trackingError) {
      var e = $('#query-panel .Error[data-coq-sid="' + trackingError + '"]');
      if (e.length == 1) {
        var errmsg = $('#query-panel .Error[data-coq-sid="' + trackingError + '"]');
        console.log(errmsg);
        undoInsertTactic(inserted, errmsg.text(), errmsg);
        return true;
      } else if (msg.data[0] == 'Feedback' && msg.data[1].contents && msg.data[1].contents == 'Processed') {
         undoInsertTactic(inserted);
         return true;
      }
    }
    if ($("#goal-text").find(".no-goals").length == 1) {
      if ($("#goal-text").find(".no-goals").text() == 'No more goals.') {
        insertTactic('Qed.', '', true);
      } else if ($("#goal-text").find(".no-goals + .aside").length == 1) {
        var bullet = $("#goal-text").find(".no-goals + .aside").text().match(/Focus next goal with bullet (.*)\./)[1]
        console.log('bullet:', bullet);
        
        // TODO: skip the next empty lines if any.
        var last = coq.doc.sentences.last();
        var cmdoc = last.sp.editor;
        var nextline = cmdoc.doc.getLine(last.end.line+1);
        if (nextline.trim()[0] == bullet) {
          // proceed with the already-present line
          cmdoc.setCursor({line: last.end.line+1, ch: nextline.length });
          coq.goCursor();
        } else {
          insertTactic(bullet + ' ', '', true);
        }
      }
      return true; // stop tracking this execution.
    } else if (msg.data[0] == 'CoqExn') {
      trackingError = msg.data[2][1];
      return false; // need to wait for the next "processed" for the message to be formatted
    }
  }
}

function quick_and_dirty_parse_answer(answer) {
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
  f(answer[0].msg);
  return res;
}

async function queryVernac(q) {
  var answer = await coq.coq.queryPromise(0, ['Vernac', q]);
  return quick_and_dirty_parse_answer(answer);
}

function floating_toolbar(target) {
  var bar = $('<div/>');
  bar.addClass('floating-toolbar');

  var close = $('<span/>');
  close
    .addClass('floating-toolbar-button')
    .text('×')
    .on('click', function() { bar.remove(); });
  bar.append(close);

  bar.appendTo(target.parent());
  bar.show();

  bar.addButton = function(text, f) {
    var button = $('<span/>');
    button
      .addClass('floating-toolbar-button')
      .text(text)
      .on('click', f)
      .insertBefore(close)
    this.position({ my: "center bottom", at: "center top+0.5ex", of: target, collision: "flipfit", within: $('#goal-text') });
  };

  return bar;
}

function my_init_hover_actions() {
  // $(".coq-env hr + * .constr\\.reference, .coq-env hr + * .constr\\.type, .coq-env hr + * .constr\\.variable, .coq-env hr + * .constr\\.notation").hide()
  $("#goal-text").on("click", ".coq-env hr + .constr\\.variable, .coq-env hr + * .constr\\.variable", function (ev) {
    var target = $(ev.target);
    var target_text = target.text();

    var bar = floating_toolbar(target);
    bar.addButton('unfold', function() {
      bar.remove(); insertTactic('unfold ' + target_text + '.');
    });
    bar.addButton('case_eq', async function() {
      bar.remove();
      var constructors = [];
      var res = await queryVernac('Check ' + target_text + ' .');
      if (res[1] == ':' && res.length == 3) {
        var type = res[2];
        var res2 = await queryVernac('Check ltac:(let x := fresh "inspect" in intro x; case_eq x; intros; exact I) : forall x : ' + type + ', True.');
        var toNextPipe = function(j) { while (j < res2.length && res2[j] != '|') { j++; } return j; };
        var toNextConstructor = function(j) {
          while (j < res2.length && ! /\p{Lu}/u.test(res2[j][0])) { j++; } // move till next Uppercase identifier
          return j;
        };
        var toNextBigRightArrow = function(j) { while (j < res2.length && res2[j] != '=>') { j++; } return j; };
        var i = toNextConstructor(toNextPipe(0));
        while (i < res2.length) {
          var j = toNextBigRightArrow(i);
          constructors[constructors.length] = res2.slice(i, j);
          i = toNextConstructor(toNextPipe(j));
        }
        /*
        var res2 = await queryVernac('Print ' + type + '.');
        console.log(res2);
        for (var i = 0; i < res2.length && res2[i] != ':='; i++);
        if (res2[i] != ':=') {
          // return false;
        } else {
          var toNextConstructor = function(j) {
            while (j < res2.length && ! /\p{Lu}/u.test(res2[j][0])) { j++; } // move till next Uppercase identifier
            return j;
          };
          var toNextPipe = function(j) {
            while (j < res2.length && res2[j] != '|') { j++; } // move till next pipe
            return j;
          }
          for (var j = toNextConstructor(i+1); j < res2.length; j = toNextConstructor(toNextPipe(j))) {
            constructors[constructors.length] = res2[j];
          }
        }
        */
      }
      var bullets = constructors.map(c => '\n- when ' + c.join(' ') + ' as H' + target_text.trim() + '.');
      insertTactic('case_eq ' + target_text + '.' + bullets[0], bullets.slice(1).join(''));
    });
  });
  $("#goal-text").on("click", ".coq-env hr + .constr\\.notation, .coq-env hr + * .constr\\.notation", function (ev) {
    var target = $(ev.target)
    var target_text = target.text();
    console.log('target:', target_text);
    if (target_text == '=') {
      var bar = floating_toolbar(target);
      bar.addButton('reflexivity', function() { insertTactic('reflexivity.'); });
    } else if (target_text == '→') {
      var bar = floating_toolbar(target);
      bar.addButton('intro', function() {
        queryVernac('try (intro; match goal with X: _ |- _ => idtac X end; fail).').then(function(id) {
          insertTactic('intro ' + id + '.');
        })
      });
    } else if (target_text == '∀') {
      var bar = floating_toolbar(target);
      bar.addButton('intro', function() {
        queryVernac('try (intro; match goal with X: _ |- _ => idtac X end; fail).').then(function(id) {
          insertTactic('intro ' + id + '.');
        })
      });
    }
  });
}

waitJsCoqLoaded(my_init);
waitJsCoqReady(my_init2);
waitJsCoqReady(my_init_hover_actions);