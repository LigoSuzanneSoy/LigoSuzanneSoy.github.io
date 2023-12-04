// my.js

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
  document.getElementById('jscoq-plug').classList[isInProgress?'add':'remove']('waiting')
}

function my_init() {
  (function() {
    var that = coq.layout;
    var f = that.splash;
    that.splash = function(version_info, msg, mode) {
      console.log('mysplash', mode);
      if (mode == 'ready') {
        document.getElementById('jscoq-plug').classList.remove('waiting');
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

function my_init2() {
  var nbSpansInProgress = 0;
  var spansInProgress = {};
  coq.coq.worker.onmessage = function(msg) {
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
  };
}

function insertTactic(tac) {
  console.log('inserting:', tac);
  var cmdoc = coq.provider.currentFocus.editor.getDoc();
  var c = cmdoc.getCursor();
  var startWithNewLine = (cmdoc.getLine(c.line) == '') ? '' : '\n';
  cmdoc.replaceRange(startWithNewLine + tac + '\n', c);
  c.line += (startWithNewLine == '') ? 1 : 2;
  cmdoc.setCursor(c);
  coq.goCursor();
}

function my_init_hover_actions() {
  // $(".coq-env hr + * .constr\\.reference, .coq-env hr + * .constr\\.type, .coq-env hr + * .constr\\.variable, .coq-env hr + * .constr\\.notation").hide()
  $("#goal-text").on("click", ".coq-env hr + .constr\\.variable, .coq-env hr + * .constr\\.variable", function (ev) {
    var target_text = $(ev.target).text();
    insertTactic('unfold ' + target_text + '.');
  });
  $("#goal-text").on("click", ".coq-env hr + .constr\\.notation, .coq-env hr + * .constr\\.notation", function (ev) {
    var target_text = $(ev.target).text();
    console.log('target:', target_text);
    if (target_text == '=') {
      insertTactic('reflexivity.');
      console.log($("#goal-text").find("click", ".no-goals"));
    }
  });
  $("#goal-text").on("click", ".no-goals", function(ev) {
    insertTactic('Qed.');
  });
}

waitJsCoqLoaded(my_init);
waitJsCoqReady(my_init2);
waitJsCoqReady(my_init_hover_actions);