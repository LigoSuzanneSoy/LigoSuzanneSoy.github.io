#!/usr/bin/env python

import sys, re, json, collections

def htmlspecialchars(s):
    return s \
        .replace("&", "&amp;") \
        .replace('"', "&quot;") \
        .replace("<", "&lt;") \
        .replace(">", "&gt;")

with open('coqueligot-auction-simple/contract.v', mode='r') as f:
  s = f.read()

injected={}
snippets=collections.OrderedDict()
snippetOrder=[]
snippet=''
for line in s.split('\n'):
    prefix = '(* SNIPPET = '
    suffix = ' *)'
    if line.startswith(prefix) and line.endswith(suffix):
        snippet = line[len(prefix):-len(suffix)]
        snippets[snippet] = []
        injected[snippet] = False
        snippetOrder.append(snippet)
    else:
        if snippet == '':
          raise Exception('Coq file must start with a (* SNIPPET = ... *) directive')
        snippets[snippet].append(line)
        #with open('snippets/' + snippet, mode='w') as f:
        #    f.write(line)

with open('snippets.js', mode='w') as f:
  f.write(json.dumps({'snippets':snippets, 'order':snippetOrder}, indent=2))

with open('index_src.html', mode='r') as html:
  html = html.read()

with open('index.html', mode='w') as out:
  skipping=False
  newline=''
  for htmline in html.split('\n'):
    s = re.search('^( *)<pre (.*)id="snippet-(.*)">$', htmline)
    if s:
      indentation = s.group(1)
      attributes = s.group(2)
      snippet = s.group(3)
      out.write(newline + indentation + '<pre ' + attributes + 'id="snippet-' + snippet + '">')
      for l in snippets[snippet]:
          out.write(newline + l)
      skipping = True
      injected[snippet] = True
    if re.search('.*</pre>.*', htmline):
      skipping = False
    if not skipping:
      out.write(newline + htmline)
    newline='\n'

for k, v in injected.items():
  if not v:
    print('Warning: snippet ' + k + ' was not injected into HTML')