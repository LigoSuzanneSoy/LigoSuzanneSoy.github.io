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

function my_init() {
  var that = coq.layout;
  var f = that.splash;
  that.splash = function(version_info, msg, mode) {
    console.log('mysplash', mode);
    if (mode == 'ready') {
      document.getElementById('jscoq-plug').classList.remove('waiting');
    }
    return f.call(that, version_info, msg, mode);
  }

  // TODO: use the #fragment instead
  if (location.search !== '?jscoq=off') {
    document.getElementById('jscoq-plug').classList.add('waiting')
    that.onToggle({target: that, shown: true});
  }
}

waitJsCoqLoaded(my_init);