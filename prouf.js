// my.js

// TODO:
// "Run" button under each code block
// Better hidden boilerplate
// sub-proofs in separate blocks (mostly done)

// Scroll:
// * compute on the flight height of element using planned duration of audio/animation.
// * reading time live update + progress bar
// * scroll animations with https://scrollmagic.io/ jQuery plug-in (find a way to shorten animations when user is scrolling far)

// getNextAction = function() {}
// doAction() {}
// readAction() {} # voice synthesis / my own voice

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
  }
  
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

  _.onJsCoqReady = [];
  _.isJsCoqReady = false;
  _.waitJsCoqReady = function(f) {
    if (_.isJsCoqReady) {
      f();
    } else {
      _.onJsCoqReady[_.onJsCoqReady.length] = f;
    }
  };
  _.jsCoqReady = function() {
    //console.log('_.isJsCoqReady = true');
    _.isJsCoqReady = true;
    for (var i = 0; i < _.onJsCoqReady.length; i++) {
      _.onJsCoqReady[i]();
    }
    _.onJsCoqReady=null;
  };

  _.displayProgress = function(isInProgress) {
    document.body.classList[isInProgress?'add':'remove']('jscoq-waiting')
  };

  _.my_init = function() {
    (function() {
      $('<div id="overlays"></div>').appendTo('body');
      var that = coq.layout;
      var f = that.splash;
      that.splash = function(version_info, msg, mode) {
        console.log('mysplash', mode);
        if (mode == 'ready') {
          document.body.classList.remove('waiting');
          _.displayProgress(false);
          _.jsCoqReady();
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

  _.getBulletTree = function(cmdoc, line) {
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

  _.insertTacticCallback = null;
  _.insertTacticHandler = function(msg) {
    if (_.insertTacticCallback) {
      if (_.insertTacticCallback(msg) || msg.data[0] == 'Feedback' && msg.data[1].contents && msg.data[1].contents == 'Complete') {
        _.insertTacticCallback = null;
      }
    }
  };

  _.nextBulletType = function(b) {
    switch (b) {
      case '': return '-';
      case '-': return '+';
      case '+': return '*';
      case '*': return '--';
      case '--': return '++';
      case '++': return '**';
      case '**': return '---';
      case '---': return '+++';
      case '+++': return '***';
      case '***': return '(* bullets too deep *)';
      default: return '(* unknown bullet type: ' + b + ' *)';
    }
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

  _.CURSOR = {}; // cursor marker

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

    var c_middle = null;
    var pos = { line: c.line, ch: c.ch };
    var todo = [];
    for (var i = 0; i < tacs.length; i++) {
      if (typeof tacs[i] == 'string' || tacs[i] instanceof String) {
        var lines = tacs[i].split('\n');
        pos = {
          line: pos.line + lines.length - 1,
          ch:   (lines.length > 1 ? 0 : pos.ch) + lines[lines.length-1].length
        }
      } else {
        if (tacs[i] instanceof $) {
          todo[todo.length] = ((i, pos) => () => tacs[i].data('prouf-bookmark', cmdoc.setBookmark(pos, {widget:tacs[i][0]})))(i, pos);
        } else if (tacs[i] === _.CURSOR) {
          c_middle = pos;
        }
      }
    }
    if (c_middle === null) { c_middle = pos; }
    c_end = pos;

    console.log('GETRANGE', c, c_end, cmdoc.getRange(c, c_end));
    if (text != cmdoc.getRange(c, c_end)) {
      cmdoc.replaceRange(text + (addedNewLine?'\n':''), c);
      console.log('inserted:', text);
    } else {
      console.log('used existing:', text);
    }
    for (var i = 0; i < todo.length; i++) { todo[i](); }

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
    var bulletTree = _.getBulletTree(cmdoc, last.end.line+1);
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
          _.insertTactic((_ => ['Qed.']), true);
        } else if ($("#goal-text").find(".no-goals").text() == 'All the remaining goals are on the shelf.') {
          var goalInfo = globalLastGoalInfo;
          console.log('SHELF:', 'All the remaining goals are on the shelf.', goalInfo);
          if (goalInfo && goalInfo.data && goalInfo.data[2]) {
            if (_.closeUnshelved()) {
              return false;
            } else {
              var shelfNamed = goalInfo.data[2].shelf.map(s => s.info.name[0] == 'Id' ? s.info.name[1] : null).filter(s => s !== null);
              if (shelfNamed.length > 0) {
                _.insertTactic(_indentation => 
                  shelfNamed.map((name, idx) => [
                    (idx == 0) ? '' : '\n',
                    '[' + name + ']:{\n',
                    (idx == 0) ? _.CURSOR : '',
                    '}'
                  ]).flat()
                );
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
            var bt = _.getBulletTree(cmdoc, last.end.line+1);
            for (var i = 0; i < bt.length; i++) {
              if (bt[i].bullet == bullet) {
                indentation = bt[i].indent;
                if (bt[i].originator) {
                  originator = '(* ' +  bt[i].originator.cmdoc.getLine(bt[i].originator.line) + ' *)';
                }
                break;
              }
            }
            _.insertTactic((_ => [indentation + bullet + ' ' + originator]), true);
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

    return bar;
  }

  _.my_init_hover_actions = function() {
    // $(".coq-env hr + * .constr\\.reference, .coq-env hr + * .constr\\.type, .coq-env hr + * .constr\\.variable, .coq-env hr + * .constr\\.notation").hide()
    $("#goal-text").on('click', ".coq-env hr + .constr\\.variable, .coq-env hr + * .constr\\.variable", function (ev) {
      var target = $(ev.target);
      var target_text = target.text();

      var bar = _.floating_toolbar(target);
      bar.addButton('unfold', 'unfold', function() {
        _.insertTactic('unfold ' + target_text + '.');
      });
      bar.addButton('case_eq', 'case_eq', async function() {
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
          _.insertTactic(indent => {
            var bulletType = _.nextBulletType(indent.bullet);
            var bullets = constructors.map(c => [
              '\n' + indent.spaces + bulletType + ' when ' + c.trim() + ' as H' + target_text.trim() + '.',
              $('<button class="in-code-button do-later"/>')
                .text('do later')
                .one('click', ev => {
                  console.log('BUTTON CLICKED', ev);
                  // TODO: use $(ev.target).data('prouf-bookmark'), but make sure the target can't be a descendent
                  $(ev.target).data('prouf-bookmark').clear();
                  _.insertTactic('subproof ' + c.trim().split(' ')[0].toLocaleLowerCase() + '.');
                })
            ]);
            return [].concat(
              indent.spaces + 'case_eq ' + target_text + '.',
              bullets[0],
              _.CURSOR,
              bullets.slice(1).flat()
            );
          });
        }
      });
    });
    $("#goal-text").on('click', ".coq-env hr + .constr\\.notation, .coq-env hr + * .constr\\.notation", function (ev) {
      var target = $(ev.target)
      var target_text = target.text();
      console.log('target:', target_text);
      if (target_text == '=') {
        var bar = _.floating_toolbar(target);
        bar.addButton('reflexivity', 'reflexivity', function() { _.insertTactic('reflexivity.'); });
      } else if (target_text == '→') {
        var bar = _.floating_toolbar(target);
        bar.addButton('intro', 'intro', function() {
          _.queryVernac1('try (intro; match goal with X: _ |- _ => idtac X end; fail).').then(function(id) {
            _.insertTactic('intro ' + id + '.');
          })
        });
      } else if (target_text == '∀') {
        var bar = _.floating_toolbar(target);
        bar.addButton('intro', 'intro', function() {
          _.queryVernac1('try (intro; match goal with X: _ |- _ => idtac X end; fail).').then(function(id) {
            _.insertTactic('intro ' + id + '.');
          })
        });
      }
    });
  };

  _.init = async function() {
    // Wait for jsCoq to be loaded and save the instance
    var {coq:jsCoqInstance, $:jQuery} = await waitJsCoqLoaded;
    coq = jsCoqInstance;
    $ = _.extendJQuery(jQuery);
    _.my_init()

    _.waitJsCoqReady(_.my_init2);
    _.waitJsCoqReady(_.my_init_hover_actions);
    _.waitJsCoqReady(function() {
      var line = parseInt(window.location.hash.substring(1)) || 93;
      var cm = coq.provider.snippets.find(cm => {
        var first = cm.editor.options.firstLineNumber;
        return first <= line && first + cm.editor.lastLine() >= line;
      });
      cm.editor.scrollIntoView(line - cm.editor.options.firstLineNumber)
      var l = line - cm.editor.options.firstLineNumber;
      cm.editor.setCursor({ line: l, ch: cm.editor.getLine(l).length });
      coq.provider.currentFocus = cm;
      cm.editor.focus();
      coq.goCursor();

      $(document.body).on('click', '.CodeMirror-linenumber', function(ev) { window.location.href = '#' + $(ev.target).text(); });
    });
  };

  _.currentCircs = null;
  _.showCirc = function(target, scrollParent) {
    var minRadius = Math.min(30, Math.max(7, Math.sqrt(Math.pow(target.width(), 2) + Math.pow(target.height(), 2))/2));
    var ratio = 10;
    
    target = $(target).first();
    if (target.length > 0) {
      target.filter('.in-code-button, .floating-toolbar-button').addClass('click-me');

      var circ = $('<div/>')
        .addClass('circle-around')
        .width(minRadius * ratio)
        .height(minRadius * ratio)
        .appendTo(scrollParent)
        .position({ my: 'center', at: 'center', of: target });

      target.on('click', function(_ev) { _.removeCircs(); });
      target.on('remove', function(_ev) { _.removeCircs(); });
      if (target.attr('tabindex') == '-1' || ! target.attr('tabindex')) { target.attr('tabindex', 0); } // make focussable
      target.focus();

      _.removeCircs();
      _.currentCircs = (_.currentCircs || $()).add(circ);
      console.log('circ_', 'add', _.currentCircs);

      return circ;
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
    if (next === null) {
      return { type: 'end', sentence: null };
    } else {
      return { type: 'coq', sentence: next };
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

  _.test = function() {
    console.log('circ_', 'prouf.test');
    prouf.sentenceToActions(prouf.getNextSentence());
    //_.removeCirc(c)
  };
  
  return _;
})(waitJsCoqLoaded);

/* await */ prouf.init();