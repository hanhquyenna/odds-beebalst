#!/usr/bin/env python3
# usage: extract.py <tool-result.json> <out.json>  — unwraps a browser-pane tool result file into the JSON array the page returned
import json,sys
raw=json.load(open(sys.argv[1]))
text=raw[0]['text'] if isinstance(raw,list) else raw
val,_=json.JSONDecoder().raw_decode(text.lstrip())
if isinstance(val,str): val,_=json.JSONDecoder().raw_decode(val)
json.dump(val,open(sys.argv[2],'w'))
print(len(val),'items')
